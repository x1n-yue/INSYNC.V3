-- Read-only baseline inventory. IDs/counts only; no emails, names, reasons,
-- feedback, paths, or file contents. Treat even IDs as restricted operator data.
-- Candidate thresholds come from DECISIONS.md; these do NOT repair records.
begin transaction read only;

-- INS-001/002: role/status cannot establish whether legacy privilege was approved.
-- Operator must review provenance; do not automatically demote or trust metadata.
select id as profile_id,role,status,created_at from public.profiles
where role in ('admin','instructor') order by role,status,id;
select role,status,count(*) as profile_count from public.profiles group by role,status;

-- INS-011: duplicates must block daily uniqueness until individually reviewed.
select intern_id, log_date, count(*) as row_count, array_agg(id order by id) as row_ids
from public.attendance_logs group by intern_id, log_date having count(*) > 1;

-- INS-016: one Pending correction per intern/date; no automatic winner.
select intern_id, log_date, count(*) as row_count, array_agg(id order by id) as row_ids
from public.attendance_exceptions where status = 'Pending'
group by intern_id, log_date having count(*) > 1;

-- INS-020: exact doc_type identity, including custom requirements.
select intern_id, doc_type, count(*) as row_count, array_agg(id order by id) as row_ids
from public.documents group by intern_id, doc_type having count(*) > 1;

-- Include zero-document interns and unrelated custom requirements.
with expected(doc_type) as (values ('moa'), ('endorsement'), ('consent'), ('medical'))
select i.id as intern_id,
       array_agg(e.doc_type order by e.doc_type) filter (where d.n = 0) as missing_types,
       array_agg(e.doc_type order by e.doc_type) filter (where d.n > 1) as duplicate_types,
       sum(least(d.n, 1)) as standard_type_count
from public.interns i cross join expected e
cross join lateral (
  select count(*) as n from public.documents doc
  where doc.intern_id = i.id and doc.doc_type = e.doc_type
) d
group by i.id having bool_or(d.n <> 1);

select id as document_id, intern_id from public.documents where btrim(doc_type) = '';

-- INS-018: numeric NaN/Infinity must be rejected before arithmetic comparisons.
select id as intern_id, required_hours::text as invalid_value
from public.interns
where case when required_hours is null or required_hours::text in ('NaN', 'Infinity', '-Infinity') then true
           else required_hours <= 0 or required_hours > 10000
             or required_hours <> round(required_hours, 2) end;

-- INS-019: preserve history; mismatches are review candidates, not deletions.
select i.id as intern_id, p.role as profile_role, i.instructor_id,
       staff.role as instructor_role, staff.status as instructor_status
from public.interns i left join public.profiles p on p.id = i.id
left join public.profiles staff on staff.id = i.instructor_id
where p.id is null or p.role <> 'intern'
   or (i.instructor_id is not null and
       (staff.id is null or staff.role <> 'instructor' or staff.status <> 'Active'));

select p.id as profile_id from public.profiles p
left join public.interns i on i.id = p.id where p.role = 'intern' and i.id is null;

with domain_rows as (
  select 'attendance_logs' as table_name, id, intern_id from public.attendance_logs
  union all select 'attendance_exceptions', id, intern_id from public.attendance_exceptions
  union all select 'documents', id, intern_id from public.documents
  union all select 'evaluations', id, intern_id from public.evaluations
  union all select 'alerts', id, intern_id from public.alerts
)
select d.table_name, d.id, d.intern_id, p.role as current_profile_role,
       i.id is null as missing_extension
from domain_rows d left join public.profiles p on p.id = d.intern_id
left join public.interns i on i.id = d.intern_id
where d.intern_id is not null and (p.id is null or p.role <> 'intern' or i.id is null);

-- INS-017: never cast unknown JSON types or malformed numeric strings.
with shape as (
  select e.id, e.intern_id, e.evaluator_id, e.overall_score, e.competencies,
    case when jsonb_typeof(e.competencies) = 'object' then
      (select count(*) = 4 and bool_and(
         key in ('punctuality', 'performance', 'conduct', 'communication')
         and jsonb_typeof(value) = 'number' and value::text ~ '^[1-5]$')
       from jsonb_each(e.competencies))
    else false end as valid_rubric
  from public.evaluations e
), scored as (
  select s.*, case when valid_rubric then round(
    (competencies->>'punctuality')::numeric * 5 +
    (competencies->>'performance')::numeric * 7 +
    (competencies->>'conduct')::numeric * 4 +
    (competencies->>'communication')::numeric * 4) end as expected_score
  from shape s
)
select s.id as evaluation_id, s.intern_id, not s.valid_rubric as invalid_rubric,
       s.overall_score is null as missing_score,
       s.overall_score is distinct from s.expected_score as inconsistent_score,
       p.id is null or p.role not in ('instructor', 'admin') as invalid_current_evaluator_role
from scored s left join public.profiles p on p.id = s.evaluator_id
where not s.valid_rubric or s.overall_score is distinct from s.expected_score
   or p.id is null or p.role not in ('instructor', 'admin');
-- Current evaluator role/assignment cannot prove historical role/assignment.

-- INS-012/016: time-only rows cannot establish overnight day reliably.
select id as attendance_id, intern_id, log_date,
       time_in is null as missing_start,
       time_out is not null and time_in is not null and time_out <= time_in as ambiguous_interval,
       verified and verified_by is null as missing_verifier
from public.attendance_logs
where log_date > (current_timestamp at time zone 'Asia/Manila')::date
   or time_in is null or (time_out is not null and time_out <= time_in)
   or (time_out is null and hours is not null)
   or (time_out is not null and hours is null)
   or case when hours::text in ('NaN', 'Infinity', '-Infinity') then true
           else hours < 0 or hours > 16 end
   or (verified and verified_by is null);

select id as exception_id, intern_id, log_date,
       btrim(reason) = '' as empty_reason,
       claimed_time_in is null or claimed_time_out is null as missing_times,
       claimed_time_out <= claimed_time_in as ambiguous_interval,
       status = 'Pending' and reviewed_by is not null as pending_with_reviewer,
       status <> 'Pending' and reviewed_by is null as missing_reviewer
from public.attendance_exceptions
where btrim(reason) = '' or claimed_time_in is null or claimed_time_out is null
   or claimed_time_out <= claimed_time_in
   or log_date > (current_timestamp at time zone 'Asia/Manila')::date
   or (status = 'Pending' and reviewed_by is not null)
   or (status <> 'Pending' and reviewed_by is null);

-- INS-008/022: don't approve a filename without retrievable evidence.
select d.id as document_id, d.intern_id,
       nullif(btrim(d.file_path), '') is null as missing_path,
       nullif(btrim(d.file_name), '') is null as missing_name,
       coalesce(split_part(d.file_path, '/', 1) <> d.intern_id::text, false) as foreign_folder,
       not exists (select 1 from storage.objects o
                   where o.bucket_id = 'documents' and o.name = d.file_path) as missing_object
from public.documents d
where (d.status = 'Approved' and (nullif(btrim(d.file_path), '') is null or nullif(btrim(d.file_name), '') is null))
   or (d.file_path is not null and (split_part(d.file_path, '/', 1) <> d.intern_id::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = d.file_path)));

-- Orphan candidates only: staging, versions, retention and other consumers may
-- legitimately retain these. Never delete from this query's result automatically.
select o.id as object_id, o.created_at,
       not exists (select 1 from public.profiles p where p.id::text = split_part(o.name, '/', 1)) as unknown_folder_owner
from storage.objects o
where o.bucket_id = 'documents'
  and not exists (select 1 from public.documents d where d.file_path = o.name);

-- INS-030: zero is also a setup issue; no automatic current-year selection.
select count(*) as current_year_count from public.academic_years where is_current
having count(*) <> 1;
rollback;

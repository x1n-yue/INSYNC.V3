-- READ ONLY, NOT EXECUTED AGAINST A REAL PROJECT.
-- Requires M01/M02 columns. Run 01_metadata/02_anomalies BEFORE M01; run this
-- after M02, BEFORE M03, and again BEFORE the separately gated M05 validation.
-- Keep identifiers/evidence privately with operator; do not paste real records.

-- Any result blocks the corresponding unique index. Never merge/delete a group.
select intern_id,log_date,count(*) as duplicate_count,array_agg(id order by id) as record_ids
from public.attendance_logs group by intern_id,log_date having count(*)>1;
select intern_id,count(*) as open_count,array_agg(id order by id) as record_ids
from public.attendance_logs where time_out is null group by intern_id having count(*)>1;
select intern_id,log_date,count(*) as pending_count,array_agg(id order by id) as record_ids
from public.attendance_exceptions where status='Pending' group by intern_id,log_date having count(*)>1;

-- Missing/contradictory timestamp evidence must not be inferred from time-only
-- values. Nulls/NaN/Infinity/invalid hours do not become verified zero.
select id,intern_id,log_date,'interval or verification evidence' as anomaly
from public.attendance_logs where (
  clocked_in_at is not null and time_in is not null
  and log_date=(clocked_in_at at time zone 'Asia/Manila')::date
  and time_in=(clocked_in_at at time zone 'Asia/Manila')::time
  and ((time_out is null and clocked_out_at is null and hours is null and not verified and verified_by is null)
    or (time_out is not null and clocked_out_at is not null and hours is not null
      and time_out=(clocked_out_at at time zone 'Asia/Manila')::time
      and clocked_out_at>clocked_in_at and clocked_out_at-clocked_in_at<=interval '16 hours'
      and hours=extract(epoch from clocked_out_at-clocked_in_at)/3600
      and ((verified and verified_by is not null) or (not verified and verified_by is null))))) is not true
  or length(accomplishment)>500
  or log_date>(clock_timestamp() at time zone 'Asia/Manila')::date
  or clocked_in_at>clock_timestamp() or clocked_out_at>clock_timestamp();
select id,intern_id,log_date,'claim interval/reason' as anomaly
from public.attendance_exceptions where (
  claimed_time_in is not null and claimed_time_out is not null and claimed_end_date is not null
  and claimed_end_date in (log_date,log_date+1)
  and (claimed_end_date+claimed_time_out)>(log_date+claimed_time_in)
  and (claimed_end_date+claimed_time_out)-(log_date+claimed_time_in)<=interval '16 hours'
  and nullif(btrim(reason),'') is not null and length(reason)<=500) is not true
  or log_date>(clock_timestamp() at time zone 'Asia/Manila')::date
  or ((claimed_end_date+claimed_time_out) at time zone 'Asia/Manila')>clock_timestamp();
select id,intern_id,log_date,'review evidence/note' as anomaly
from public.attendance_exceptions where (
  (status='Pending' and reviewed_by is null and reviewed_at is null and review_note is null)
  or (status in ('Approved','Rejected') and reviewed_by is not null and reviewed_at is not null
    and (review_note is null or length(review_note)<=500)
    and (status<>'Rejected' or nullif(btrim(review_note),'') is not null))) is not true;

-- Legacy Approved requests lacking a reconciled verified daily record.
select e.id,e.intern_id,e.log_date from public.attendance_exceptions e
where e.status='Approved' and not exists(select 1 from public.attendance_logs a
  where a.intern_id=e.intern_id and a.log_date=e.log_date and a.verified and a.verified_by is not null
    and a.clocked_in_at is not null and a.clocked_out_at>a.clocked_in_at);

-- Legacy audit provenance is UNKNOWN, never retroactively trusted/backfilled.
select coalesce(source,'legacy-unverified') as provenance,count(*) from public.audit_logs group by source;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='documents';

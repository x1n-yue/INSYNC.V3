-- M01: coordinated authority/status/row/field scope (INS-001..008).
-- PREREQUISITES: inspect 01_metadata.sql; baseline 12 tables/columns/FKs and
-- on_auth_user_created trigger; owner is trusted postgres with BYPASSRLS, not an
-- API role. Review unexpected public routines/views/policies BEFORE applying.
-- This file is a deliverable only; do not execute against a real project here.
-- No legacy rows changed, no bootstrap/reset, no constraint validation/backfill.
-- ROLLBACK: transaction failure rolls back all changes. After commit fail closed:
-- disable affected UI operations and use a reviewed forward migration. NEVER
-- restore broad legacy policies/grants. Added columns preserve history.
begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'M01 requires reviewed postgres ownership';
  end if;
  if not exists(select 1 from pg_roles where rolname='postgres' and (rolbypassrls or rolsuper)) then
    raise exception 'Trusted helper owner requires BYPASSRLS or superuser capability';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any(array['profiles','interns','companies','course_sections',
      'academic_years','attendance_logs','attendance_exceptions','evaluations','documents','announcements','alerts','audit_logs'])
      and pg_get_userbyid(c.relowner)<>'postgres')
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('current_role','handle_new_user')
      and pg_get_userbyid(p.proowner)<>'postgres') then
    raise exception 'Review unexpected table/helper ownership before M01';
  end if;
  if exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (
      (n.nspname='public' and c.relname=any(array['profiles','interns','companies','course_sections',
        'academic_years','attendance_logs','attendance_exceptions','evaluations','documents','announcements','alerts','audit_logs']))
      or (n.nspname='auth' and c.relname='users' and t.tgname<>'on_auth_user_created'))) then
    raise exception 'Review extra domain/Auth triggers before M01';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass
    and tgname='on_auth_user_created' and tgfoid='public.handle_new_user()'::regprocedure
    and tgenabled in ('O','A')) then
    raise exception 'Expected active signup trigger missing';
  end if;
  -- Unknown exposed SECURITY DEFINER functions/views can defeat new policies.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.prosecdef
               and p.proname not in ('current_role','handle_new_user')
               and (has_function_privilege('authenticated',p.oid,'EXECUTE')
                    or has_function_privilege('anon',p.oid,'EXECUTE'))) then
    raise exception 'Review unexpected exposed SECURITY DEFINER functions before M01';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relkind in ('v','m')
               and (has_table_privilege('authenticated',c.oid,'SELECT')
                    or has_table_privilege('anon',c.oid,'SELECT'))) then
    raise exception 'Review exposed views before M01';
  end if;
  if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and permissive='RESTRICTIVE') then
    raise exception 'Review restrictive Storage policies before M01';
  end if;
end $$;

alter table public.profiles add column requested_role text;
-- New nullable instants only; do not infer legacy timezones or overwrite history.
alter table public.attendance_logs add column clocked_in_at timestamptz;
alter table public.attendance_logs add column clocked_out_at timestamptz;
alter table public.attendance_exceptions add column claimed_end_date date;
alter table public.attendance_exceptions add column reviewed_at timestamptz;
alter table public.documents add column reviewed_by uuid references public.profiles(id);
alter table public.documents add column reviewed_at timestamptz;
alter table public.announcements add column recipient_ids uuid[];
-- NULL legacy audience is fail-closed: author/Admin only, no audience guessing.

create or replace function public.current_role() returns text
language sql stable security definer set search_path = pg_catalog, public
as $$ select role from public.profiles where id=auth.uid() and status='Active' $$;
create function public.is_active() returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $$ select coalesce(exists(select 1 from public.profiles where id=auth.uid() and status='Active'),false) $$;
create function public.is_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $$ select coalesce(public.current_role()='admin',false) $$;
create function public.owns_intern(p_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $$ select coalesce(public.current_role()='intern' and p_id=auth.uid()
     and exists(select 1 from public.interns where id=p_id),false) $$;
create function public.assigned_intern(p_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $$ select coalesce(public.current_role()='instructor' and exists(
     select 1 from public.interns i join public.profiles p on p.id=i.id
     where i.id=p_id and i.instructor_id=auth.uid() and p.role='intern'),false) $$;
create function public.can_review(p_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $$ select public.is_admin() or public.assigned_intern(p_id) $$;
create function public.can_read_intern(p_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $$ select public.can_review(p_id) or public.owns_intern(p_id) $$;

-- The status-only RPC is the only non-Active profile interface. Do not grant
-- directory access to make FK name joins work.
create function public.my_profile() returns jsonb
language sql stable security definer set search_path = pg_catalog, public
as $$ select case when p.status='Active' then to_jsonb(p)
     else jsonb_build_object('id',p.id,'status',p.status) end
     from public.profiles p where p.id=auth.uid() $$;
create function public.related_profile_names(p_ids uuid[]) returns table(id uuid,full_name text)
language sql stable security definer set search_path = pg_catalog, public
as $$ select p.id,p.full_name from public.profiles p
     where public.is_active() and p.id=any(p_ids) and (
       p.id=auth.uid() or public.is_admin() or public.assigned_intern(p.id)
       or (public.current_role()='intern' and (
         exists(select 1 from public.interns i where i.id=auth.uid() and i.instructor_id=p.id and p.role='instructor')
         or exists(select 1 from public.evaluations e where e.intern_id=auth.uid() and e.evaluator_id=p.id and p.role in ('admin','instructor'))))) $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles(id,full_name,email,role,status,organization,student_id,requested_role)
  values(new.id,coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),'New account'),
    coalesce(new.email,''),'intern','Pending',new.raw_user_meta_data->>'organization',
    new.raw_user_meta_data->>'student_id',
    case when new.raw_user_meta_data->>'requested_role' in ('intern','instructor','admin')
      then new.raw_user_meta_data->>'requested_role' else 'intern' end);
  insert into public.interns(id) values(new.id);
  return new;
end $$;

-- INVOKER trigger: non-admin writes only change full_name. Neither user metadata,
-- a caller-set GUC, nor a supplied role claim can bypass this guard.
create function public.guard_profile_update() returns trigger
language plpgsql set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id then raise exception 'Profile identity is immutable' using errcode='42501'; end if;
  -- Trusted SQL operator is the explicitly documented first-Admin bootstrap;
  -- authenticated/anon cannot SET ROLE postgres. Never use caller-set claims.
  if current_user <> 'postgres' and not public.is_admin() and
     (to_jsonb(new)-'full_name') is distinct from (to_jsonb(old)-'full_name') then
    raise exception 'Only Active Admin may change protected profile fields' using errcode='42501';
  end if;
  return new;
end $$;
create trigger m01_profile_fields before update on public.profiles
for each row execute function public.guard_profile_update();

-- Raw review/domain writes are revoked; controlled functions own transitions.
-- Ownership remains immutable even for Admin/direct controlled future updates.
create function public.guard_domain_identity() returns trigger
language plpgsql set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id or new.intern_id is distinct from old.intern_id then
    raise exception 'Record ownership is immutable' using errcode='42501';
  end if;
  if tg_table_name='evaluations' then
    if new.evaluator_id is distinct from old.evaluator_id then
      raise exception 'Evaluation author is immutable' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger m01_attendance_identity before update on public.attendance_logs
for each row execute function public.guard_domain_identity();
create trigger m01_exception_identity before update on public.attendance_exceptions
for each row execute function public.guard_domain_identity();
create trigger m01_document_identity before update on public.documents
for each row execute function public.guard_domain_identity();
create trigger m01_evaluation_identity before update on public.evaluations
for each row execute function public.guard_domain_identity();

-- Preserve unrelated Storage buckets; an existing broad Storage policy would OR
-- with new policies, so wrap EVERY existing policy with a documents exclusion.
-- Original expression remains unchanged for other buckets. Inventory first.
do $$
declare r record; t text;
begin
  for r in select * from pg_policies where schemaname='storage' and tablename='objects' loop
    t := format('alter policy %I on storage.objects',r.policyname);
    if r.cmd in ('ALL','SELECT','UPDATE','DELETE') then
      t := t || format(' using (bucket_id <> ''documents'' and (%s))',coalesce(r.qual,'true'));
    end if;
    if r.cmd in ('ALL','INSERT','UPDATE') then
      t := t || format(' with check (bucket_id <> ''documents'' and (%s))',coalesce(r.with_check,r.qual,'true'));
    end if;
    execute t;
  end loop;
end $$;

-- Drop ALL old policies on the 12 tables (permissive policies combine by OR).
-- Revoke table AND explicit column grants: REVOKE on table does not remove an
-- independently granted column privilege. No truncation/references/trigger grant.
do $$
declare t text; r record; cols text;
begin
  foreach t in array array['profiles','interns','companies','course_sections','academic_years',
    'attendance_logs','attendance_exceptions','evaluations','documents','announcements','alerts','audit_logs'] loop
    execute format('alter table public.%I enable row level security',t);
    for r in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',r.policyname,t);
    end loop;
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    select string_agg(quote_ident(attname),',') into cols from pg_attribute
      where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped;
    execute format('revoke select (%s),insert (%s),update (%s),references (%s) on public.%I from public,anon,authenticated',cols,cols,cols,cols,t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
revoke create on schema public from public,anon,authenticated;
grant usage on schema public to authenticated;
grant update on public.profiles to authenticated;
grant insert,update,delete on public.interns,public.companies,public.course_sections,public.academic_years to authenticated;
grant insert on public.documents,public.evaluations,public.announcements to authenticated;
grant update(dismissed) on public.alerts to authenticated;
grant insert,update,delete on public.alerts to authenticated;
-- Audit trust changes in M02; restrict existing client logging to Active Admin
-- with bound actor now. Non-admin arbitrary log writes are denied immediately.
grant insert on public.audit_logs to authenticated;

create policy m01_profiles_read on public.profiles for select to authenticated
using(public.is_active() and (id=auth.uid() or public.is_admin() or public.assigned_intern(id)));
create policy m01_profiles_update on public.profiles for update to authenticated
using(public.is_admin() or (public.is_active() and id=auth.uid()))
with check(public.is_admin() or (public.is_active() and id=auth.uid()));
create policy m01_interns_read on public.interns for select to authenticated using(public.can_read_intern(id));
create policy m01_interns_admin on public.interns for all to authenticated
using(public.is_admin()) with check(public.is_admin());

create policy m01_companies_read on public.companies for select to authenticated using(public.is_active());
create policy m01_companies_write on public.companies for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy m01_sections_read on public.course_sections for select to authenticated using(public.is_active());
create policy m01_sections_write on public.course_sections for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy m01_years_read on public.academic_years for select to authenticated using(public.is_active());
create policy m01_years_write on public.academic_years for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy m01_attendance_read on public.attendance_logs for select to authenticated using(public.can_read_intern(intern_id));
create policy m01_exceptions_read on public.attendance_exceptions for select to authenticated using(public.can_read_intern(intern_id));
create policy m01_evaluations_read on public.evaluations for select to authenticated using(public.can_read_intern(intern_id));
create policy m01_evaluations_insert on public.evaluations for insert to authenticated
with check(public.can_review(intern_id) and evaluator_id=auth.uid());
create policy m01_documents_read on public.documents for select to authenticated using(public.can_read_intern(intern_id));
create policy m01_documents_insert on public.documents for insert to authenticated
with check(public.is_admin() and status='Pending' and file_path is null and file_name is null
  and note is null and reviewed_by is null and reviewed_at is null);
create policy m01_announcements_read on public.announcements for select to authenticated
using(public.is_active() and (public.is_admin() or instructor_id=auth.uid()
  or (public.current_role()='intern' and auth.uid()=any(recipient_ids))));
create policy m01_announcements_insert on public.announcements for insert to authenticated
with check(public.current_role() in ('admin','instructor') and instructor_id=auth.uid());
create policy m01_alerts_read on public.alerts for select to authenticated using(public.can_review(intern_id));
create policy m01_alerts_admin on public.alerts for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy m01_alerts_dismiss on public.alerts for update to authenticated
using(public.assigned_intern(intern_id)) with check(public.assigned_intern(intern_id));
-- Guard prevents instructor-wide UPDATE grant (needed for Admin) from enabling
-- reassignment or editing other alert fields.
create function public.guard_alert_update() returns trigger
language plpgsql set search_path=pg_catalog,public
as $$ begin
  if not public.is_admin() and (to_jsonb(new)-'dismissed') is distinct from (to_jsonb(old)-'dismissed') then
    raise exception 'Only dismissal may be changed' using errcode='42501';
  end if;
  return new;
end $$;
create trigger m01_alert_fields before update on public.alerts for each row execute function public.guard_alert_update();
create policy m01_audit_read on public.audit_logs for select to authenticated using(public.is_admin());
create policy m01_audit_insert on public.audit_logs for insert to authenticated with check(public.is_admin() and actor_id=auth.uid());

-- BEFORE INSERT overwrites the supplied audience from trusted relationships.
-- Caller may NOT invent author, a NULL/contradictory target, or recipient array.
create function public.bind_announcement() returns trigger
language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
  if public.current_role() not in ('admin','instructor') or public.current_role() is null
     or new.instructor_id is distinct from auth.uid() then
    raise exception 'Active staff author required' using errcode='42501';
  end if;
  if new.recipient_ids is not null then raise exception 'Audience is server-derived'; end if;
  if new.target_intern_id is null then
    if new.target <> 'All Interns' then raise exception 'Recipient UUID required'; end if;
    select coalesce(array_agg(i.id),array[]::uuid[]) into new.recipient_ids
    from public.interns i join public.profiles p on p.id=i.id
    where i.instructor_id=auth.uid() and p.role='intern' and p.status='Active';
    if cardinality(new.recipient_ids)=0 then raise exception 'No active assigned recipients'; end if;
  else
    if new.target='All Interns' or not exists(select 1 from public.interns i join public.profiles p on p.id=i.id
      where i.id=new.target_intern_id and i.instructor_id=auth.uid() and p.role='intern' and p.status='Active') then
      raise exception 'Recipient must be an active assigned intern' using errcode='42501';
    end if;
    new.target := 'Personal'; -- Display names are not identity or privacy rules.
    new.recipient_ids := array[new.target_intern_id];
  end if;
  return new;
end $$;
create trigger m01_announcement_audience before insert on public.announcements
for each row execute function public.bind_announcement();

-- Storage: new evidence uses INSERT only; immutable objects cannot be overwritten
-- even by owners/staff. Later version cleanup will use a scoped operation.
grant select,insert on storage.objects to authenticated;
create function public.can_read_document_object(p_path text) returns boolean
language sql stable security definer set search_path=pg_catalog,public
as $$ select public.is_active() and (
  (public.current_role()='intern' and split_part(p_path,'/',1)=auth.uid()::text)
  or public.is_admin()
  or exists(select 1 from public.documents d where d.file_path=p_path
    and split_part(p_path,'/',1)=d.intern_id::text and public.assigned_intern(d.intern_id))) $$;
create policy m01_document_objects_read on storage.objects for select to authenticated
using(bucket_id='documents' and public.can_read_document_object(name));
create policy m01_document_objects_insert on storage.objects for insert to authenticated
with check(bucket_id='documents' and public.current_role()='intern'
  and public.owns_intern(auth.uid()) and split_part(name,'/',1)=auth.uid()::text
  and cardinality(string_to_array(name,'/'))=2 and split_part(name,'/',2) not in ('','.','..'));
-- No documents UPDATE/DELETE policy: neither overwrites nor global cleanup.

-- Constrained owner clock/correction operations: no supplied owner/reviewer,
-- business date or duration. Advisory lock guards races before M03 uniqueness;
-- existing duplicates cause a conflict instead of guessing a canonical row.
create function public.clock_in() returns public.attendance_logs
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare r public.attendance_logs; ts timestamptz:=clock_timestamp();
begin
  if not public.owns_intern(auth.uid()) then raise exception 'Active intern required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,101));
  if exists(select 1 from public.attendance_logs where intern_id=auth.uid()
     and (time_out is null or log_date=(ts at time zone 'Asia/Manila')::date)) then
    raise exception 'Attendance already exists or a session is open' using errcode='40001';
  end if;
  insert into public.attendance_logs(intern_id,log_date,time_in,clocked_in_at,created_at,verified,verified_by)
  values(auth.uid(),(ts at time zone 'Asia/Manila')::date,(ts at time zone 'Asia/Manila')::time,ts,ts,false,null) returning * into r;
  return r;
end $$;
create function public.clock_out(p_id uuid,p_accomplishment text) returns public.attendance_logs
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare r public.attendance_logs; ts timestamptz:=clock_timestamp(); seconds numeric;
begin
  if not public.owns_intern(auth.uid()) then raise exception 'Active intern required' using errcode='42501'; end if;
  if p_accomplishment is null or length(p_accomplishment)>500 then raise exception 'Accomplishment must be at most 500 characters'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,101));
  select * into r from public.attendance_logs where id=p_id and intern_id=auth.uid() for update;
  if not found or r.time_out is not null or r.verified or r.clocked_in_at is null then
    raise exception 'Open unverified clock session not found; refresh or request correction' using errcode='40001';
  end if;
  seconds:=extract(epoch from ts-r.clocked_in_at);
  if seconds<=0 or seconds>57600 then raise exception 'Shift duration must be positive and at most 16 hours; request correction'; end if;
  update public.attendance_logs set time_out=(ts at time zone 'Asia/Manila')::time,
    clocked_out_at=ts,hours=seconds/3600,accomplishment=p_accomplishment
    where id=r.id returning * into r;
  return r;
end $$;

-- Shared DB validator, not exposed as a browser RPC. Explicit date handles
-- overnight claims without interpreting reversed times as zero or next day.
create function public.correction_instants(p_date date,p_in time,p_out time,p_end date)
returns table(start_at timestamptz,end_at timestamptz)
language plpgsql set search_path=pg_catalog,public
as $$
begin
  if p_date is null or p_in is null or p_out is null or p_end is null
     or p_end not in (p_date,p_date+1) then raise exception 'Explicit valid start/end date and times required'; end if;
  start_at := (p_date+p_in) at time zone 'Asia/Manila';
  end_at := (p_end+p_out) at time zone 'Asia/Manila';
  if end_at<=start_at or end_at-start_at>interval '16 hours' or end_at>clock_timestamp() then
    raise exception 'Invalid, future or excessive claimed interval';
  end if;
  return next;
end $$;
create function public.submit_correction(p_date date,p_in time,p_out time,p_end date,p_reason text)
returns public.attendance_exceptions
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare r public.attendance_exceptions;
begin
  if not public.owns_intern(auth.uid()) then raise exception 'Active intern required' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>500 then raise exception 'Reason required, at most 500 characters'; end if;
  perform * from public.correction_instants(p_date,p_in,p_out,p_end);
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,101));
  if exists(select 1 from public.attendance_exceptions where intern_id=auth.uid() and log_date=p_date and status='Pending') then
    raise exception 'A Pending correction already exists for this date' using errcode='40001';
  end if;
  insert into public.attendance_exceptions(intern_id,log_date,claimed_time_in,claimed_time_out,claimed_end_date,reason,status,reviewed_by,created_at)
  values(auth.uid(),p_date,p_in,p_out,p_end,btrim(p_reason),'Pending',null,clock_timestamp()) returning * into r;
  return r;
end $$;

-- Atomic review is needed immediately when raw attendance/review writes close.
-- M02 adds mandatory trusted audit; M03 adds reviewed legacy uniqueness/CHECKs.
create function public.review_exception(p_id uuid,p_decision text,p_note text default null)
returns public.attendance_exceptions
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare r public.attendance_exceptions; a public.attendance_logs;
        start_ts timestamptz; end_ts timestamptz; n integer;
begin
  -- Authorize before taking locks on protected data; recheck after serialization.
  select * into r from public.attendance_exceptions where id=p_id;
  if not found or not public.can_review(r.intern_id) then raise exception 'Review not permitted' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.intern_id::text,101));
  select * into r from public.attendance_exceptions where id=p_id for update;
  if not public.can_review(r.intern_id) then raise exception 'Assignment changed' using errcode='42501'; end if;
  if r.status<>'Pending' then raise exception 'Correction already reviewed; refresh' using errcode='40001'; end if;
  if p_decision is null or p_decision not in ('Approved','Rejected') then raise exception 'Invalid decision'; end if;
  if p_decision='Approved' then
    select start_at,end_at into start_ts,end_ts from public.correction_instants(
      r.log_date,r.claimed_time_in,r.claimed_time_out,coalesce(r.claimed_end_date,r.log_date));
    select count(*) into n from public.attendance_logs where intern_id=r.intern_id and log_date=r.log_date;
    if n>1 then raise exception 'Duplicate legacy attendance requires review' using errcode='40001'; end if;
    select * into a from public.attendance_logs where intern_id=r.intern_id and log_date=r.log_date for update;
    if found then
      update public.attendance_logs set time_in=r.claimed_time_in,time_out=r.claimed_time_out,
        clocked_in_at=start_ts,clocked_out_at=end_ts,hours=extract(epoch from end_ts-start_ts)/3600,
        verified=true,verified_by=auth.uid() where id=a.id;
    else
      insert into public.attendance_logs(intern_id,log_date,time_in,time_out,clocked_in_at,clocked_out_at,hours,verified,verified_by)
      values(r.intern_id,r.log_date,r.claimed_time_in,r.claimed_time_out,start_ts,end_ts,
        extract(epoch from end_ts-start_ts)/3600,true,auth.uid());
    end if;
  end if;
  -- p_note persisted in Phase 2 audit; do not pretend it is stored here.
  if nullif(btrim(p_note),'') is not null then raise exception 'Review notes available after M02'; end if;
  update public.attendance_exceptions set status=p_decision,reviewed_by=auth.uid(),reviewed_at=clock_timestamp()
  where id=r.id returning * into r;
  return r;
end $$;

create function public.submit_document_upload(p_id uuid,p_path text,p_name text)
returns public.documents
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare r public.documents;
begin
  if not public.owns_intern(auth.uid()) then raise exception 'Active intern required' using errcode='42501'; end if;
  select * into r from public.documents where id=p_id and intern_id=auth.uid() for update;
  if not found then raise exception 'Requirement not found' using errcode='40001'; end if;
  if p_path is null or split_part(p_path,'/',1)<>auth.uid()::text
     or cardinality(string_to_array(p_path,'/'))<>2 or split_part(p_path,'/',2) in ('','.','..')
     or nullif(btrim(p_name),'') is null then raise exception 'Own folder and filename required'; end if;
  if not exists(select 1 from storage.objects where bucket_id='documents' and name=p_path) then
    raise exception 'Uploaded object not found';
  end if;
  update public.documents set file_path=p_path,file_name=p_name,status='Pending',note=null,
    reviewed_by=null,reviewed_at=null,updated_at=clock_timestamp() where id=r.id returning * into r;
  return r;
end $$;
create function public.review_document(p_id uuid,p_status text,p_note text,p_expected_path text)
returns public.documents
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare r public.documents;
begin
  select * into r from public.documents where id=p_id for update;
  if not found or not public.can_review(r.intern_id) then raise exception 'Review not permitted' using errcode='42501'; end if;
  if p_status is null or p_status not in ('Pending','Approved','Needs Revision') then raise exception 'Invalid review status'; end if;
  if r.file_path is distinct from p_expected_path then raise exception 'Evidence changed; refresh' using errcode='40001'; end if;
  if p_status='Approved' and (r.file_path is null or split_part(r.file_path,'/',1)<>r.intern_id::text
     or not exists(select 1 from storage.objects where bucket_id='documents' and name=r.file_path)) then
    raise exception 'Valid uploaded evidence required';
  end if;
  if p_status='Needs Revision' and nullif(btrim(p_note),'') is null then raise exception 'Revision note required'; end if;
  if length(p_note)>500 then raise exception 'Note exceeds 500 characters'; end if;
  update public.documents set status=p_status,note=case when p_status='Needs Revision' then btrim(p_note) else null end,
    reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=r.id returning * into r;
  return r;
end $$;

-- Every application function has explicit privileges; no default PUBLIC execute.
-- This also closes any legacy invoker helper inadvertently exposed by defaults.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.current_role(),public.is_active(),public.is_admin(),
  public.owns_intern(uuid),public.assigned_intern(uuid),public.can_review(uuid),
  public.can_read_intern(uuid),public.my_profile(),public.related_profile_names(uuid[]),
  public.can_read_document_object(text),public.clock_in(),public.clock_out(uuid,text),
  public.submit_correction(date,time,time,date,text),public.review_exception(uuid,text,text),
  public.submit_document_upload(uuid,text,text),public.review_document(uuid,text,text,text)
to authenticated;
-- Trigger functions execute through installed triggers; not callable RPCs.

-- CATALOG VERIFICATION (read-only, expected: only m01_* policies on 12 tables;
-- every helper/RPC has fixed search_path + trusted owner; anon has no execute;
-- no direct attendance/exceptions/documents UPDATE for authenticated).
select schemaname,tablename,policyname,cmd,qual,with_check from pg_policies
where schemaname='public' or (schemaname='storage' and tablename='objects')
order by schemaname,tablename,policyname;
select p.proname,pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proconfig,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
select table_name,column_name,privilege_type,grantee from information_schema.column_privileges
where table_schema='public' and grantee in ('anon','authenticated','PUBLIC');
commit;

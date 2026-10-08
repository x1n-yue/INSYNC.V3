-- M03: daily/open/Pending identities and independent interval checks (011/012/016).
-- PREREQUISITES: M01/M02; read-only 03_phase2_attendance.sql and separately
-- approved per-row legacy repair proposal. Duplicate identities STOP this file;
-- it never deletes, merges or backfills attendance/corrections.
-- Schedule a maintenance window: index/table locks can block writes.
-- ROLLBACK: transaction failure rolls back; after commit use reviewed forward
-- repair, keep controlled RPCs/RLS. Do not remove integrity to admit bad writes.
begin;
do $$ begin
  if current_user<>'postgres' or to_regprocedure('public.review_exceptions(uuid[],text,text)') is null then
    raise exception 'M03 requires trusted postgres and M02';
  end if;
end $$;
lock table public.attendance_logs,public.attendance_exceptions in share row exclusive mode;
do $$ begin
  if exists(select 1 from public.attendance_logs group by intern_id,log_date having count(*)>1)
    or exists(select 1 from public.attendance_logs where time_out is null group by intern_id having count(*)>1)
    or exists(select 1 from public.attendance_exceptions where status='Pending' group by intern_id,log_date having count(*)>1) then
    raise exception 'Duplicate daily/open/Pending identities: inspect and obtain reviewed repairs before M03';
  end if;
end $$;
alter table public.attendance_logs add constraint m03_daily_identity unique(intern_id,log_date);
create unique index m03_one_open_session on public.attendance_logs(intern_id) where time_out is null;
create unique index m03_one_pending_correction on public.attendance_exceptions(intern_id,log_date) where status='Pending';

-- NOT VALID preserves legacy rows unchanged but enforces all new/updated rows.
-- Explicit IS NOT NULL closes SQL CHECK's usual NULL/UNKNOWN escape.
alter table public.attendance_logs add constraint m03_attendance_interval check(
  clocked_in_at is not null and time_in is not null
  and log_date=(clocked_in_at at time zone 'Asia/Manila')::date
  and time_in=(clocked_in_at at time zone 'Asia/Manila')::time
  and ((time_out is null and clocked_out_at is null and hours is null and not verified and verified_by is null)
    or (time_out is not null and clocked_out_at is not null and hours is not null
      and time_out=(clocked_out_at at time zone 'Asia/Manila')::time
      and clocked_out_at>clocked_in_at and clocked_out_at-clocked_in_at<=interval '16 hours'
      and hours=extract(epoch from clocked_out_at-clocked_in_at)/3600
      and ((verified and verified_by is not null) or (not verified and verified_by is null))))) not valid;
alter table public.attendance_logs add constraint m03_accomplishment_length check(accomplishment is null or length(accomplishment)<=500) not valid;
alter table public.attendance_exceptions add constraint m03_correction_interval check(
  claimed_time_in is not null and claimed_time_out is not null and claimed_end_date is not null
  and claimed_end_date in (log_date,log_date+1)
  and (claimed_end_date+claimed_time_out)>(log_date+claimed_time_in)
  and (claimed_end_date+claimed_time_out)-(log_date+claimed_time_in)<=interval '16 hours'
  and nullif(btrim(reason),'') is not null and length(reason)<=500) not valid;
alter table public.attendance_exceptions add constraint m03_correction_review check(
  (status='Pending' and reviewed_by is null and reviewed_at is null and review_note is null)
  or (status in ('Approved','Rejected') and reviewed_by is not null and reviewed_at is not null
    and (review_note is null or length(review_note)<=500)
    and (status<>'Rejected' or nullif(btrim(review_note),'') is not null))) not valid;

-- A moving "now" bound belongs in a write trigger, not a timeless CHECK.
-- Applies even to trusted direct SQL; legacy bad rows require explicit review.
create function public.guard_attendance_future() returns trigger
language plpgsql set search_path=pg_catalog,public
as $$ begin
  if tg_table_name='attendance_logs' then
    if new.log_date>(clock_timestamp() at time zone 'Asia/Manila')::date
      or new.clocked_in_at>clock_timestamp() or new.clocked_out_at>clock_timestamp() then
      raise exception 'Future attendance is not permitted';
    end if;
  else
    if new.log_date>(clock_timestamp() at time zone 'Asia/Manila')::date
      or ((new.claimed_end_date+new.claimed_time_out) at time zone 'Asia/Manila')>clock_timestamp() then
      raise exception 'Future correction is not permitted';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_attendance_future() from public,anon,authenticated;
create trigger m03_future before insert or update on public.attendance_logs for each row execute function public.guard_attendance_future();
create trigger m03_future before insert or update on public.attendance_exceptions for each row execute function public.guard_attendance_future();

create or replace function public.clock_in() returns public.attendance_logs
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare r public.attendance_logs; ts timestamptz;
begin
  if not public.owns_intern(auth.uid()) then raise exception 'Active intern required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,101));
  perform 1 from public.profiles where id=auth.uid() for share;
  if not public.owns_intern(auth.uid()) then raise exception 'Account changed; refresh' using errcode='42501'; end if;
  ts:=clock_timestamp(); -- after serialization, including midnight lock waits
  if exists(select 1 from public.attendance_logs where intern_id=auth.uid()
    and (time_out is null or log_date=(ts at time zone 'Asia/Manila')::date)) then
    raise exception 'Attendance already exists or a session is open; refresh' using errcode='40001';
  end if;
  insert into public.attendance_logs(intern_id,log_date,time_in,clocked_in_at,created_at,verified,verified_by)
  values(auth.uid(),(ts at time zone 'Asia/Manila')::date,(ts at time zone 'Asia/Manila')::time,ts,ts,false,null) returning * into r;
  return r;
end $$;
create or replace function public.clock_out(p_id uuid,p_accomplishment text) returns public.attendance_logs
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare r public.attendance_logs; ts timestamptz; seconds numeric;
begin
  if not public.owns_intern(auth.uid()) then raise exception 'Active intern required' using errcode='42501'; end if;
  if p_accomplishment is null or length(p_accomplishment)>500 then raise exception 'Accomplishment must be at most 500 characters'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,101));
  perform 1 from public.profiles where id=auth.uid() for share;
  if not public.owns_intern(auth.uid()) then raise exception 'Account changed; refresh' using errcode='42501'; end if;
  select * into r from public.attendance_logs where id=p_id and intern_id=auth.uid() for update;
  if not found or r.time_out is not null or r.verified or r.clocked_in_at is null then
    raise exception 'Open unverified clock session not found; refresh or request correction' using errcode='40001';
  end if;
  ts:=clock_timestamp(); seconds:=extract(epoch from ts-r.clocked_in_at);
  if seconds<=0 or seconds>57600 then raise exception 'Shift duration must be positive and at most 16 hours; request correction'; end if;
  update public.attendance_logs set time_out=(ts at time zone 'Asia/Manila')::time,clocked_out_at=ts,
    hours=seconds/3600,accomplishment=p_accomplishment where id=r.id and time_out is null returning * into r;
  if not found then raise exception 'Session changed; refresh' using errcode='40001'; end if;
  return r;
end $$;
revoke all on function public.clock_in(),public.clock_out(uuid,text) from public,anon,authenticated;
grant execute on function public.clock_in(),public.clock_out(uuid,text) to authenticated;

-- CATALOG VERIFICATION: CHECK convalidated=false until separate M05; unique true.
select conname,convalidated,pg_get_constraintdef(oid) from pg_constraint
where conrelid in ('public.attendance_logs'::regclass,'public.attendance_exceptions'::regclass) order by conname;
select indexname,indexdef from pg_indexes where schemaname='public' and indexname like 'm03_%';
select tgrelid::regclass,tgname,tgenabled from pg_trigger where tgname='m03_future';
commit;

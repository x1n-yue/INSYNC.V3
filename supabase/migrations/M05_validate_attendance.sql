-- M05: optional/deferred historical validation gate; NOT an automatic repair.
-- PREREQUISITES: M01-M04; run 03_phase2_attendance.sql read-only, review EVERY
-- anomaly and explicitly approve any separate per-row repair migration. Rehearse
-- those reviewed repairs on synthetic copies. Zero anomaly rows required.
-- Do not guess legacy timestamp/timezone/end date/reviewer from local times.
-- M03 continues enforcing new/updated rows if this gate remains blocked.
-- ROLLBACK: failure rolls back validations, preserving NOT VALID enforcement.
-- After success keep constraints validated; prefer reviewed forward corrections.
begin;
do $$ begin
  if current_user<>'postgres' then raise exception 'Trusted postgres required'; end if;
  if exists(select 1 from public.attendance_logs where log_date>(clock_timestamp() at time zone 'Asia/Manila')::date
      or clocked_in_at>clock_timestamp() or clocked_out_at>clock_timestamp())
    or exists(select 1 from public.attendance_exceptions where log_date>(clock_timestamp() at time zone 'Asia/Manila')::date
      or ((claimed_end_date+claimed_time_out) at time zone 'Asia/Manila')>clock_timestamp()) then
    raise exception 'Future legacy evidence requires explicit review before validation';
  end if;
  if exists(select 1 from public.attendance_exceptions e where e.status='Approved' and not exists(
    select 1 from public.attendance_logs a where a.intern_id=e.intern_id and a.log_date=e.log_date
      and a.verified and a.verified_by is not null and a.clocked_in_at is not null and a.clocked_out_at>a.clocked_in_at)) then
    raise exception 'Approved legacy correction lacks verified attendance; review before validation';
  end if;
end $$;
alter table public.attendance_logs validate constraint m03_attendance_interval;
alter table public.attendance_logs validate constraint m03_accomplishment_length;
alter table public.attendance_exceptions validate constraint m03_correction_interval;
alter table public.attendance_exceptions validate constraint m03_correction_review;
-- CATALOG VERIFICATION: all four convalidated=true. No legacy rows modified.
select conrelid::regclass,conname,convalidated from pg_constraint where conname like 'm03_%' order by conname;
commit;

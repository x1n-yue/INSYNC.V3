-- M13: compare expected hours at the precision available to JSON clients.
-- Apply after M11 (normally after M12) as trusted postgres. No row/data rewrite.
-- Do not replay M11 on databases that already have it installed.
begin;
do $$ begin
 if current_user <> 'postgres'
   or to_regprocedure('public.verify_attendance(uuid,timestamptz,timestamptz,numeric)') is null
 then raise exception 'M13 requires trusted postgres and M11'; end if;
end $$;

create or replace function public.verify_attendance(p_id uuid,p_expected_in timestamptz,p_expected_out timestamptz,p_expected_hours numeric)
returns public.attendance_logs language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.attendance_logs;
begin
 select * into r from public.attendance_logs where id=p_id;
 if not found or not public.can_review(r.intern_id) then raise exception 'Attendance review not permitted' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.intern_id::text,101));
 perform 1 from public.profiles where id=auth.uid() for share;
 perform 1 from public.interns where id=r.intern_id for share;
 select * into r from public.attendance_logs where id=p_id for update;
 if not found or not public.can_review(r.intern_id) then raise exception 'Assignment changed; refresh' using errcode='42501'; end if;
 if r.clocked_in_at is null or r.clocked_out_at is null or r.time_out is null or r.hours is null
 then raise exception 'Closed trusted attendance required; request a correction for legacy records'; end if;
 -- PostgREST numeric JSON becomes an IEEE-754 double in the browser. A shift
 -- with seconds/microseconds can have more decimal places than that number can
 -- preserve. Compare the same representation, without rounding stored hours.
 -- The full timestamp strings still compare exactly (including microseconds),
 -- and M03 independently requires stored hours to equal the exact interval.
 if r.clocked_in_at is distinct from p_expected_in or r.clocked_out_at is distinct from p_expected_out
   or r.hours::double precision is distinct from p_expected_hours::double precision
 then raise exception 'Attendance changed; refresh before verifying' using errcode='40001'; end if;
 if r.verified then return r; end if;
 update public.attendance_logs set verified=true,verified_by=auth.uid(),verified_at=clock_timestamp()
   where id=p_id returning * into r;
 return r;
end $$;
revoke all on function public.verify_attendance(uuid,timestamptz,timestamptz,numeric) from public,anon,authenticated;
grant execute on function public.verify_attendance(uuid,timestamptz,timestamptz,numeric) to authenticated;
notify pgrst, 'reload schema';
commit;

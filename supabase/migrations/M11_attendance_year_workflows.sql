-- M11: ordinary attendance verification and explicit academic-year membership.
-- Apply after M01-M10 as trusted postgres. No historical year backfill or reset.
-- Existing NULL years remain unassigned history. Referenced years cannot be deleted.
begin;
do $$ begin
 if current_user <> 'postgres' or to_regprocedure('public.attach_standard_docs(uuid)') is null
   or to_regprocedure('public.admin_set_current_academic_year(uuid)') is null
   or not exists(select 1 from pg_constraint where conrelid='public.attendance_logs'::regclass and conname='m03_attendance_interval')
 then raise exception 'M11 requires trusted postgres and M01-M10'; end if;
end $$;

alter table public.interns add column academic_year_id uuid references public.academic_years(id) on delete restrict;
alter table public.attendance_logs add column academic_year_id uuid references public.academic_years(id) on delete restrict;
alter table public.attendance_logs add column verified_at timestamptz;
alter table public.attendance_exceptions add column academic_year_id uuid references public.academic_years(id) on delete restrict;
alter table public.evaluations add column academic_year_id uuid references public.academic_years(id) on delete restrict;
alter table public.documents add column academic_year_id uuid references public.academic_years(id) on delete restrict;

-- Keep assignment-year transitions in the same trusted audit as role/target changes.
create or replace function public.write_trusted_audit() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare before_row jsonb; after_row jsonb; row_data jsonb; changed jsonb;
        actor uuid:=auth.uid(); actor_label text;
begin
 before_row:=case when tg_op<>'INSERT' then to_jsonb(old) else '{}'::jsonb end;
 after_row:=case when tg_op<>'DELETE' then to_jsonb(new) else '{}'::jsonb end;
 if tg_op='UPDATE' and before_row=after_row then return new; end if;
 row_data:=case when tg_op='DELETE' then before_row else after_row end;
 select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into changed
 from (select jsonb_object_keys(before_row || after_row) as k) fields
 where before_row->k is distinct from after_row->k;
 select full_name into actor_label from public.profiles where id=actor;
 insert into public.audit_logs(actor_id,actor_name,action,detail,created_at,source,event_data)
 values(actor,coalesce(actor_label,'System / trusted SQL'),tg_table_name || ' ' || lower(tg_op),
   'Record ' || coalesce(row_data->>'id','unknown'),clock_timestamp(),'database-trigger-v2',
   jsonb_build_object('table',tg_table_name,'operation',tg_op,'record_id',row_data->>'id',
     'intern_id',row_data->>'intern_id','changed_fields',changed,
     'previous_status',before_row->>'status','status',after_row->>'status',
     'previous_role',before_row->>'role','role',after_row->>'role',
     'previous_instructor_id',before_row->>'instructor_id','instructor_id',after_row->>'instructor_id',
     'previous_company_id',before_row->>'company_id','company_id',after_row->>'company_id',
     'previous_section_id',before_row->>'section_id','section_id',after_row->>'section_id',
     'previous_academic_year_id',before_row->>'academic_year_id','academic_year_id',after_row->>'academic_year_id',
     'previous_required_hours',before_row->'required_hours','required_hours',after_row->'required_hours',
     'entity_label',case when tg_table_name in ('companies','course_sections','academic_years') then coalesce(row_data->>'name',row_data->>'label') else null end,
     'previous_entity_label',case when tg_table_name in ('companies','course_sections','academic_years') then coalesce(before_row->>'name',before_row->>'label') else null end,
     'reviewed_by',after_row->>'reviewed_by','verified_by',after_row->>'verified_by',
     'context',case when actor is null then 'system-or-sql' else 'authenticated' end));
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;

create function public.guard_academic_year_delete() returns trigger
language plpgsql set search_path=pg_catalog,public as $$ begin
 if exists(select 1 from public.interns where academic_year_id=old.id)
   or exists(select 1 from public.attendance_logs where academic_year_id=old.id)
   or exists(select 1 from public.attendance_exceptions where academic_year_id=old.id)
   or exists(select 1 from public.evaluations where academic_year_id=old.id)
   or exists(select 1 from public.documents where academic_year_id=old.id)
 then raise exception 'Academic year is in use by assignments or historical records; retain it for history' using errcode='23503'; end if;
 return old;
end $$;
revoke all on function public.guard_academic_year_delete() from public,anon,authenticated;
create trigger m11_retain_year before delete on public.academic_years for each row execute function public.guard_academic_year_delete();

-- A year is bound on INSERT and immutable thereafter. Privileged correction
-- routines may explicitly copy the original request year, including NULL history.
-- The trigger owns its roster lock: custom-requirement authors retain their
-- existing column INSERT grant without gaining raw UPDATE access to interns.
create function public.bind_record_academic_year() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare assigned_year uuid; existing_year uuid;
begin
 if tg_op='UPDATE' then
   if new.academic_year_id is distinct from old.academic_year_id then
     raise exception 'Historical academic year is immutable' using errcode='42501';
   end if;
   return new;
 end if;
 select academic_year_id into assigned_year from public.interns where id=new.intern_id for share;
 if tg_table_name='attendance_exceptions' then
   select academic_year_id into existing_year from public.attendance_logs
     where intern_id=new.intern_id and log_date=new.log_date;
   new.academic_year_id:=case when found then existing_year else assigned_year end;
 elsif tg_table_name='attendance_logs' then
   -- review_exception supplies the request's original academic year.
   if not (new.verified and current_user='postgres') then new.academic_year_id:=assigned_year; end if;
 else
   new.academic_year_id:=assigned_year;
 end if;
 return new;
end $$;
revoke all on function public.bind_record_academic_year() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['attendance_logs','attendance_exceptions','evaluations','documents'] loop
   execute format('create trigger m11_record_year before insert or update on public.%I for each row execute function public.bind_record_academic_year()',t);
 end loop;
end $$;

create function public.guard_intern_year_change() returns trigger
language plpgsql set search_path=pg_catalog,public as $$ begin
 if new.academic_year_id is distinct from old.academic_year_id
   and exists(select 1 from public.attendance_logs where intern_id=new.id and time_out is null)
 then raise exception 'Clock out before changing the academic year' using errcode='40001'; end if;
 return new;
end $$;
revoke all on function public.guard_intern_year_change() from public,anon,authenticated;
create trigger m11_intern_year before update on public.interns for each row execute function public.guard_intern_year_change();

-- Keep the existing five-argument API intact for older clients. New clients use
-- the unambiguous six-argument operation; both updates/audits commit together.
create function public.admin_set_assignment(p_id uuid,p_instructor_id uuid,p_company_id uuid,p_section_id uuid,p_required_hours numeric,p_academic_year_id uuid)
returns public.interns language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.interns;
begin
 perform pg_advisory_xact_lock(404,1);
 if not public.is_admin() then raise exception 'Active Admin required' using errcode='42501'; end if;
 if p_academic_year_id is not null then
   perform 1 from public.academic_years where id=p_academic_year_id for share;
   if not found then raise exception 'Academic year not found; refresh' using errcode='40001'; end if;
 end if;
 r:=public.admin_set_assignment(p_id,p_instructor_id,p_company_id,p_section_id,p_required_hours);
 update public.interns set academic_year_id=p_academic_year_id where id=p_id returning * into r;
 return r;
end $$;
revoke all on function public.admin_set_assignment(uuid,uuid,uuid,uuid,numeric,uuid) from public,anon,authenticated;
grant execute on function public.admin_set_assignment(uuid,uuid,uuid,uuid,numeric,uuid) to authenticated;

alter table public.documents drop constraint m08_requirement_identity;
alter table public.documents add constraint m11_requirement_identity unique nulls not distinct(intern_id,academic_year_id,doc_type);
create or replace function public.attach_standard_docs(p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; year_id uuid;
begin
 perform pg_advisory_xact_lock(404,1);
 if not public.is_admin() then raise exception 'Active Admin required' using errcode='42501'; end if;
 perform 1 from public.profiles where id=auth.uid() for share;
 if not exists(select 1 from public.profiles where id=p_id and role='intern') then raise exception 'Current intern required'; end if;
 select academic_year_id into year_id from public.interns where id=p_id for share;
 insert into public.documents(intern_id,academic_year_id,doc_type,name)
 select p_id,year_id,t,k from (values('moa','Memorandum of Agreement (MOA)'),('endorsement','Endorsement Letter'),
   ('consent','Parent / Guardian Consent Form'),('medical','Medical Certificate')) x(t,k)
 on conflict(intern_id,academic_year_id,doc_type) do nothing;
 select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at,d.doc_type),'[]'::jsonb) into result
   from public.documents d where intern_id=p_id;
 return jsonb_build_object('id',p_id,'documents',result);
end $$;

create function public.verify_attendance(p_id uuid,p_expected_in timestamptz,p_expected_out timestamptz,p_expected_hours numeric)
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
 if r.clocked_in_at is distinct from p_expected_in or r.clocked_out_at is distinct from p_expected_out
   or r.hours is distinct from p_expected_hours
 then raise exception 'Attendance changed; refresh before verifying' using errcode='40001'; end if;
 if r.verified then return r; end if; -- lost-response retry produces no second audit
 update public.attendance_logs set verified=true,verified_by=auth.uid(),verified_at=clock_timestamp()
   where id=p_id returning * into r; -- M03 checks independently reject invalid evidence
 return r;
end $$;
revoke all on function public.verify_attendance(uuid,timestamptz,timestamptz,numeric) from public,anon,authenticated;
grant execute on function public.verify_attendance(uuid,timestamptz,timestamptz,numeric) to authenticated;

-- Correction review copies the historical year instead of moving hours into
-- the currently selected year. Verification and audit remain atomic.
create or replace function public.review_exception(p_id uuid,p_decision text,p_note text default null)
returns public.attendance_exceptions language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.attendance_exceptions; a public.attendance_logs; start_ts timestamptz; end_ts timestamptz; n integer;
begin
 select * into r from public.attendance_exceptions where id=p_id;
 if not found or not public.can_review(r.intern_id) then raise exception 'Review not permitted' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('Approved','Rejected') then raise exception 'Invalid decision'; end if;
 if length(p_note)>500 or (p_decision='Rejected' and nullif(btrim(p_note),'') is null) then raise exception 'Rejection note required; notes must be at most 500 characters'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.intern_id::text,101));
 perform 1 from public.profiles where id=auth.uid() for share;
 perform 1 from public.interns where id=r.intern_id for share;
 select * into r from public.attendance_exceptions where id=p_id for update;
 if not found or not public.can_review(r.intern_id) then raise exception 'Assignment changed' using errcode='42501'; end if;
 if r.status<>'Pending' then raise exception 'Correction already reviewed; refresh' using errcode='40001'; end if;
 if p_decision='Approved' then
   select start_at,end_at into start_ts,end_ts from public.correction_instants(r.log_date,r.claimed_time_in,r.claimed_time_out,coalesce(r.claimed_end_date,r.log_date));
   select count(*) into n from public.attendance_logs where intern_id=r.intern_id and log_date=r.log_date;
   if n>1 then raise exception 'Duplicate legacy attendance requires review' using errcode='40001'; end if;
   select * into a from public.attendance_logs where intern_id=r.intern_id and log_date=r.log_date for update;
   if found then
     if a.academic_year_id is distinct from r.academic_year_id then raise exception 'Correction academic year differs from attendance; review history first'; end if;
     update public.attendance_logs set time_in=r.claimed_time_in,time_out=r.claimed_time_out,clocked_in_at=start_ts,clocked_out_at=end_ts,
       hours=extract(epoch from end_ts-start_ts)/3600,verified=true,verified_by=auth.uid(),verified_at=clock_timestamp() where id=a.id;
   else
     insert into public.attendance_logs(intern_id,academic_year_id,log_date,time_in,time_out,clocked_in_at,clocked_out_at,hours,verified,verified_by,verified_at)
     values(r.intern_id,r.academic_year_id,r.log_date,r.claimed_time_in,r.claimed_time_out,start_ts,end_ts,extract(epoch from end_ts-start_ts)/3600,true,auth.uid(),clock_timestamp());
   end if;
 end if;
 update public.attendance_exceptions set status=p_decision,review_note=nullif(btrim(p_note),''),reviewed_by=auth.uid(),reviewed_at=clock_timestamp()
   where id=r.id and status='Pending' returning * into r;
 if not found then raise exception 'Correction changed; refresh' using errcode='40001'; end if;
 return r;
end $$;
notify pgrst, 'reload schema';
commit;

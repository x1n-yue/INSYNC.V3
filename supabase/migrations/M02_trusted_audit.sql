-- M02: transactional audit and atomic single/bulk correction review (INS-009/010).
-- PREREQUISITES: M01 committed; inspected grants, owners, triggers and anomalies.
-- postgres must own helpers/tables and bypass RLS, as required by M01.
-- Deliverable only: never execute on a real project during this remediation.
-- ROLLBACK: failure rolls back transaction. After commit disable affected flows
-- and apply a reviewed forward repair; never restore client audit INSERT.
-- Legacy audit rows are retained, source NULL means untrusted legacy provenance.
begin;
do $$ begin
  if current_user <> 'postgres' or to_regprocedure('public.can_review(uuid)') is null then
    raise exception 'M02 requires trusted postgres and M01';
  end if;
end $$;

alter table public.audit_logs add column source text;
alter table public.audit_logs add column event_data jsonb;
alter table public.attendance_exceptions add column review_note text;
drop policy m01_audit_insert on public.audit_logs;
revoke insert,update,delete,truncate,references,trigger on public.audit_logs from public,anon,authenticated;
-- Explicitly remove any column INSERT grants too (table REVOKE does not do so).
do $$ declare c record; begin
  for c in select attname from pg_attribute where attrelid='public.audit_logs'::regclass
    and attnum>0 and not attisdropped loop
    execute format('revoke insert (%I),update (%I),references (%I) on public.audit_logs from public,anon,authenticated',c.attname,c.attname,c.attname);
  end loop;
end $$;

create function public.write_trusted_audit() returns trigger
language plpgsql security definer set search_path=pg_catalog,public
as $$
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
  -- Minimal metadata: no credentials, file bytes, or whole profile snapshots.
  -- No exception handler: an audit failure aborts the business mutation.
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
      'previous_required_hours',before_row->'required_hours','required_hours',after_row->'required_hours',
      'entity_label',case when tg_table_name in ('companies','course_sections','academic_years')
        then coalesce(row_data->>'name',row_data->>'label') else null end,
      'previous_entity_label',case when tg_table_name in ('companies','course_sections','academic_years')
        then coalesce(before_row->>'name',before_row->>'label') else null end,
      'reviewed_by',after_row->>'reviewed_by','verified_by',after_row->>'verified_by',
      'context',case when actor is null then 'system-or-sql' else 'authenticated' end));
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.write_trusted_audit() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['profiles','interns','companies','course_sections','academic_years',
    'attendance_logs','attendance_exceptions','documents','evaluations','announcements','alerts'] loop
    execute format('create trigger m02_trusted_audit after insert or update or delete on public.%I for each row execute function public.write_trusted_audit()',t);
  end loop;
end $$;

create or replace function public.review_exception(p_id uuid,p_decision text,p_note text default null)
returns public.attendance_exceptions
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare r public.attendance_exceptions; a public.attendance_logs;
        start_ts timestamptz; end_ts timestamptz; n integer;
begin
  select * into r from public.attendance_exceptions where id=p_id;
  if not found or not public.can_review(r.intern_id) then raise exception 'Review not permitted' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('Approved','Rejected') then raise exception 'Invalid decision'; end if;
  if length(p_note)>500 or (p_decision='Rejected' and nullif(btrim(p_note),'') is null) then
    raise exception 'Rejection note required; notes must be at most 500 characters';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(r.intern_id::text,101));
  -- Freeze caller status and assignment for this review; concurrent lifecycle
  -- writes wait or cause a transactional conflict, never grant stale authority.
  perform 1 from public.profiles where id=auth.uid() for share;
  perform 1 from public.interns where id=r.intern_id for share;
  select * into r from public.attendance_exceptions where id=p_id for update;
  if not found or not public.can_review(r.intern_id) then raise exception 'Assignment changed' using errcode='42501'; end if;
  if r.status<>'Pending' then raise exception 'Correction already reviewed; refresh' using errcode='40001'; end if;
  if p_decision='Approved' then
    -- Legacy NULL end date is same-day only; reversed times are never guessed.
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
  update public.attendance_exceptions set status=p_decision,review_note=nullif(btrim(p_note),''),
    reviewed_by=auth.uid(),reviewed_at=clock_timestamp() where id=r.id and status='Pending' returning * into r;
  if not found then raise exception 'Correction changed; refresh' using errcode='40001'; end if;
  return r;
end $$;

-- Per-item subtransactions: a failed attendance/audit write rolls back every
-- change for that item. The response is visible only after the outer commit.
-- Sorted UUIDs give concurrent batches a consistent lock order. Cap workload.
create function public.review_exceptions(p_ids uuid[],p_decision text,p_note text default null)
returns table(id uuid,ok boolean,error text,code text,data jsonb)
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare item uuid; r public.attendance_exceptions;
begin
  if public.current_role() is null or public.current_role() not in ('admin','instructor') then
    raise exception 'Active staff required' using errcode='42501';
  end if;
  if p_ids is null or cardinality(p_ids)<1 or cardinality(p_ids)>100 or array_position(p_ids,null) is not null then
    raise exception 'Select between 1 and 100 correction UUIDs';
  end if;
  -- Intern-first ordering also prevents inverse lock order for different
  -- requests belonging to the same two interns.
  for item in select x.item_id from (select distinct unnest(p_ids) as item_id) x
    left join public.attendance_exceptions e on e.id=x.item_id and public.can_review(e.intern_id)
    order by e.intern_id,x.item_id loop
    id:=item; data:=null; error:=null; code:=null;
    begin
      r:=public.review_exception(item,p_decision,p_note);
      ok:=true; data:=to_jsonb(r);
    exception when others then
      ok:=false; error:=sqlerrm; code:=sqlstate;
    end;
    return next;
  end loop;
end $$;
revoke all on function public.review_exception(uuid,text,text),public.review_exceptions(uuid[],text,text) from public,anon,authenticated;
grant execute on function public.review_exception(uuid,text,text),public.review_exceptions(uuid[],text,text) to authenticated;

-- CATALOG VERIFICATION: 11 enabled triggers; only SELECT on audit for API roles;
-- trigger helper inaccessible; reviewer RPCs fixed search_path/trusted owner.
select c.relname,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid
where t.tgname='m02_trusted_audit' order by c.relname;
select grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='audit_logs';
select p.proname,pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,p.proacl from pg_proc p
where p.oid in ('public.write_trusted_audit()'::regprocedure,'public.review_exception(uuid,text,text)'::regprocedure,'public.review_exceptions(uuid[],text,text)'::regprocedure);
commit;

-- M10: safe master-data lifecycle and atomic current academic year (INS-029/030).
-- PREREQUISITES: M02 trusted audit and M07 account/assignment lifecycle.
-- Deliverable only: do not execute against a real project during remediation.
-- Existing historical rows are not normalized or rewritten.
begin;
do $$ begin
  if current_user <> 'postgres'
    or to_regprocedure('public.is_admin()') is null
    or to_regprocedure('public.write_trusted_audit()') is null
  then raise exception 'M10 requires trusted postgres, M01 and M02'; end if;
end $$;

-- The application may edit labels/names directly, but the current-year flag and
-- destructive deletes must use the guarded server operations below.
revoke delete on public.companies,public.course_sections,public.academic_years from authenticated;
revoke update on public.academic_years from authenticated;
revoke update(name) on public.companies,public.course_sections from authenticated;
grant update(name) on public.companies,public.course_sections to authenticated;
grant update(label) on public.academic_years to authenticated;

-- Refuse deployment if existing data already violates the intended invariant.
do $$ begin
  if (select count(*) from public.academic_years where is_current) > 1 then
    raise exception 'M10 cannot install: multiple current academic years already exist';
  end if;
end $$;

create unique index if not exists m10_one_current_academic_year
  on public.academic_years (is_current) where is_current;

create or replace function public.admin_set_current_academic_year(p_id uuid)
returns public.academic_years
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare r public.academic_years;
begin
  if not public.is_admin() then raise exception 'Active Admin required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(404,2);
  perform 1 from public.profiles where id=auth.uid() for share;
  select * into r from public.academic_years where id=p_id for update;
  if not found then raise exception 'Academic year not found; refresh' using errcode='40001'; end if;
  update public.academic_years set is_current=false where is_current and id<>p_id;
  update public.academic_years set is_current=true where id=p_id returning * into r;
  if not found or not r.is_current then raise exception 'Academic year could not be made current; refresh' using errcode='40001'; end if;
  return r;
end $$;

create or replace function public.admin_delete_master(p_table text,p_id uuid)
returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare
  target_name text;
  affected integer := 0;
  deleted_id uuid;
begin
  if not public.is_admin() then raise exception 'Active Admin required' using errcode='42501'; end if;
  if p_table not in ('companies','course_sections','academic_years') then raise exception 'Unsupported master-data type'; end if;
  perform pg_advisory_xact_lock(404,3);
  perform 1 from public.profiles where id=auth.uid() for share;

  if p_table='companies' then
    select name into target_name from public.companies where id=p_id for update;
    if not found then raise exception 'Company not found; refresh' using errcode='40001'; end if;
    select count(*) into affected from public.interns where company_id=p_id;
  elsif p_table='course_sections' then
    select name into target_name from public.course_sections where id=p_id for update;
    if not found then raise exception 'Course section not found; refresh' using errcode='40001'; end if;
    select count(*) into affected from public.interns where section_id=p_id;
  else
    select label into target_name from public.academic_years where id=p_id for update;
    if not found then raise exception 'Academic year not found; refresh' using errcode='40001'; end if;
    if exists(select 1 from public.academic_years where id=p_id and is_current) then
      raise exception 'Current academic year cannot be deleted; set a replacement current year first' using errcode='23514';
    end if;
  end if;

  -- The confirmed destructive operation explicitly clears dependent intern references
  -- before deleting the master row. This is intentional reassignment-to-null, not
  -- an implicit client-side side effect, and is audited in the same transaction.
  if p_table='companies' then
    update public.interns set company_id=null where company_id=p_id;
  elsif p_table='course_sections' then
    update public.interns set section_id=null where section_id=p_id;
  end if;
  execute format('delete from public.%I where id=$1 returning id',p_table) into deleted_id using p_id;
  if deleted_id is null then raise exception 'Master record was changed; refresh and retry' using errcode='40001'; end if;
  return jsonb_build_object('id',deleted_id,'table',p_table,'label',target_name,'affected_interns',affected);
end $$;

revoke all on function public.admin_set_current_academic_year(uuid),public.admin_delete_master(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_set_current_academic_year(uuid),public.admin_delete_master(text,uuid) to authenticated;

select indexname,indexdef from pg_indexes where indexname='m10_one_current_academic_year';
select p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('admin_set_current_academic_year','admin_delete_master');
commit;

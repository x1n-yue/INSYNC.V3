-- Read-only readiness indicators for the M10-M14 workflow release.
-- Run in SQL Editor as the database owner. No data, grants, or settings change.
-- Presence checks do not prove migration history, exact definitions, or live RLS.
-- Compare the results with the reviewed files and RUNBOOK.md before deployment.

select current_user as inspection_role;

select requirement, to_regprocedure(signature) is not null as present
from (values
 ('M10 current-year operation','public.admin_set_current_academic_year(uuid)'),
 ('M10 guarded master deletion','public.admin_delete_master(text,uuid)'),
 ('M11 year assignment','public.admin_set_assignment(uuid,uuid,uuid,uuid,numeric,uuid)'),
 ('M11 attendance verification','public.verify_attendance(uuid,timestamptz,timestamptz,numeric)'),
 ('M12 announcement submission','public.send_announcement(text,text,uuid,uuid,uuid)'),
 ('M14 final-Admin guard','public.guard_last_active_admin()')
) required(requirement,signature);

select table_name,column_name,data_type
from information_schema.columns
where table_schema='public' and (
 (table_name in ('interns','attendance_logs','attendance_exceptions','evaluations','documents') and column_name='academic_year_id')
 or (table_name='attendance_logs' and column_name='verified_at')
 or (table_name='announcements' and column_name in ('submission_id','target_section_id','section_name'))
) order by table_name,column_name;

-- The expected-hours cast is an M13 indicator, not a complete definition check.
select p.proname,pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proconfig,
 position('r.hours::double precision' in pg_get_functiondef(p.oid))>0 as m13_comparison_present
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.oid=to_regprocedure('public.verify_attendance(uuid,timestamptz,timestamptz,numeric)');

select tgname,tgenabled,pg_get_triggerdef(oid) as definition
from pg_trigger where tgrelid=to_regclass('public.profiles') and tgname='m14_last_active_admin';

select count(*) as active_admins from public.profiles where role='admin' and status='Active';
select count(*) as current_academic_years from public.academic_years where is_current;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='documents';

select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','interns','attendance_logs',
 'attendance_exceptions','evaluations','documents','document_versions',
 'document_review_events','announcements','alerts','audit_logs') order by c.relname;

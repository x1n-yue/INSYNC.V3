-- Read-only readiness indicators for the M10-M16 workflow release.
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
 ('M14 final-Admin guard','public.guard_last_active_admin()'),
 ('M15 scoped metrics','public.dashboard_metrics(uuid,integer)'),
 ('M15 scoped chart','public.dashboard_chart(text)'),
 ('M16 durable Admin jobs','public.prepare_admin_operation(uuid,uuid,text,jsonb)'),
 ('M16 import reconciliation','public.summarize_admin_import(uuid)'),
 ('M16 backup claims','public.claim_backup_operation(uuid,text,text)')
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
 'document_review_events','announcements','alerts','audit_logs','companies',
 'course_sections','academic_years','admin_operations','onboarding_rows') order by c.relname;

-- Review executable routines, exact definitions and API grants together.
select p.oid::regprocedure as signature,pg_get_userbyid(p.proowner) as owner,
 p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 md5(pg_get_functiondef(p.oid)) as definition_md5,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('current_role','can_review','my_profile',
 'verify_attendance','send_announcement','guard_last_active_admin',
 'dashboard_metrics','dashboard_chart','attendance_evidence_state','prepare_admin_operation',
 'onboarding_identity','onboarding_existing','claim_onboarding_row','summarize_admin_import',
 'claim_backup_operation','audit_admin_operation') order by p.oid::regprocedure::text;

select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' or (schemaname='storage' and tablename='objects')
order by schemaname,tablename,policyname;

select table_schema,table_name,grantee,privilege_type from information_schema.table_privileges
where table_schema in ('public','storage') and grantee in ('PUBLIC','anon','authenticated')
order by table_schema,table_name,grantee,privilege_type;

select schemaname,tablename,indexname,indexdef from pg_indexes
where schemaname='public' and (indexname like 'm15_%' or indexname like 'm16_%') order by indexname;

-- M16 must keep writes, CSV payloads and row outcomes server-only. Summary
-- columns are readable only through the Active Admin RLS policy above.
select name,to_regclass('public.' || name) is not null as present,
 has_table_privilege('authenticated',to_regclass('public.' || name),'INSERT') as browser_insert,
 has_table_privilege('authenticated',to_regclass('public.' || name),'UPDATE') as browser_update,
 has_table_privilege('authenticated',to_regclass('public.' || name),'DELETE') as browser_delete
from (values ('admin_operations'),('onboarding_rows')) t(name);
select table_name,column_name,grantee,privilege_type from information_schema.column_privileges
where table_schema='public' and table_name in ('admin_operations','onboarding_rows')
order by table_name,column_name,grantee,privilege_type;

-- Inspect all domain/Auth audit and integrity triggers, not just M14 presence.
select n.nspname,c.relname,pg_get_userbyid(c.relowner) as table_owner,
 t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname='users'))
order by n.nspname,c.relname,t.tgname;

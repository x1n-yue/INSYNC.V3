-- Phase 0, read-only; NOT a migration. Trusted operator in a disposable rehearsal
-- first. Do not execute schema.sql. Do not publish result sets from real projects.
begin transaction read only;

select schemaname, tablename, policyname, roles, permissive, cmd, qual, with_check
from pg_policies
where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'storage') and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_schema, table_name, grantee, privilege_type;

select table_schema, table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema in ('public', 'storage') and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_schema, table_name, column_name, grantee;

-- ACL includes PUBLIC execution; null ACL is a default, not a denial.
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proconfig, p.proacl,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by p.proname, arguments;

select n.nspname, p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind in ('f', 'p') order by p.proname;

select n.nspname, c.relname, pg_get_userbyid(c.relowner) as owner,
       c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))
  and c.relkind in ('r', 'p', 'v', 'm', 'S') order by n.nspname, c.relname;

select schemaname, viewname, definition from pg_views where schemaname = 'public';

select n.nspname, c.relname, con.conname, con.contype, con.convalidated,
       pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' order by c.relname, con.conname;

select schemaname, tablename, indexname, indexdef
from pg_indexes where schemaname = 'public' order by tablename, indexname;

select n.nspname, c.relname, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid, true) as definition,
       pg_get_userbyid(p.proowner) as function_owner, p.prosecdef, p.proconfig
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and n.nspname in ('public', 'auth', 'storage')
order by n.nspname, c.relname, t.tgname;

select pg_get_userbyid(d.defaclrole) as owner, n.nspname, d.defaclobjtype, d.defaclacl
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace;

select nspname, nspacl,
       has_schema_privilege('anon', oid, 'USAGE') as anon_usage,
       has_schema_privilege('authenticated', oid, 'USAGE') as authenticated_usage,
       has_schema_privilege('authenticated', oid, 'CREATE') as authenticated_create
from pg_namespace where nspname in ('public', 'storage');

select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'documents';

-- Detect optional jobs/extensions without assuming pg_cron is installed.
select extname, extversion from pg_extension order by extname;
select to_regclass('cron.job') is not null as cron_job_catalog_present;
-- Inspect any jobs separately without exporting embedded credentials/commands.
rollback;

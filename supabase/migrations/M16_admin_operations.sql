-- M16: durable bulk invitation/backup jobs. Apply ONCE after M15 as postgres.
-- No live identities, emails, file bytes, or existing records are changed here.
-- API roles may read job summaries only; server-held service_role alone mutates.
-- Recovery: retain jobs and identities; fix forward. Never replay a sent invite.
begin;
do $$ begin
 if current_user <> 'postgres' or to_regprocedure('public.dashboard_metrics(uuid,integer)') is null
   or not exists(select 1 from pg_roles where rolname='service_role') then
  raise exception 'M16 requires postgres, M15 and the Supabase service_role';
 end if;
end $$;

create table public.admin_operations (
 id uuid primary key,
 actor_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('import','backup')),
 status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 payload jsonb not null default '{}'::jsonb,
 result jsonb not null default '{}'::jsonb,
 lease_until timestamptz,
 check(jsonb_typeof(payload)='object' and jsonb_typeof(result)='object')
);
create index m16_operations_recent on public.admin_operations(created_at desc,id desc);
alter table public.admin_operations enable row level security;
revoke all on public.admin_operations from public,anon,authenticated;
grant select(id,actor_id,kind,status,created_at,updated_at,result) on public.admin_operations to authenticated;
create policy m16_admin_read on public.admin_operations for select to authenticated using(public.is_admin());
grant select,insert,update on public.admin_operations to service_role;

create table public.onboarding_rows (
 job_id uuid not null references public.admin_operations(id),
 row_index integer not null check(row_index between 0 and 199),
 email text not null check(length(email) between 3 and 254),
 status text not null default 'ready' check(status in ('ready','running','invited','duplicate','failed','uncertain','cancelled')),
 account_id uuid,
 lease_until timestamptz,
 primary key(job_id,row_index)
);
alter table public.onboarding_rows enable row level security;
revoke all on public.onboarding_rows from public,anon,authenticated;
grant select,insert,update on public.onboarding_rows to service_role;
create unique index m16_onboarding_identity_pending on public.onboarding_rows(lower(email))
 where status in ('ready','running','uncertain');

-- Trusted system audit deliberately stores only operational IDs/states, no CSV.
create function public.audit_admin_operation() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 insert into public.audit_logs(actor_id,actor_name,action,detail,created_at,source,event_data)
 values(new.actor_id,coalesce((select full_name from public.profiles where id=new.actor_id),'Administrator'),
  'admin_operations ' || lower(tg_op),'Job ' || new.id,clock_timestamp(),'database-trigger-v2',
  jsonb_build_object('table','admin_operations','record_id',new.id,'kind',new.kind,
   'status',new.status,'previous_status',case when tg_op='UPDATE' then old.status end,'context','server-operation'));
 return new;
end $$;
create trigger m16_job_audit after insert or update on public.admin_operations
 for each row execute function public.audit_admin_operation();

create function public.prepare_admin_operation(p_id uuid,p_actor uuid,p_kind text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.admin_operations; n integer;
begin
 perform 1 from public.profiles where id=p_actor and role='admin' and status='Active' for share;
 if not found then raise exception 'Active Admin required' using errcode='42501'; end if;
 if p_id is null or p_kind is null or p_kind not in ('import','backup') or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid job'; end if;
 perform pg_advisory_xact_lock(160016);
 select * into r from public.admin_operations where id=p_id for update;
 if found then
  if r.actor_id<>p_actor or r.kind<>p_kind or r.payload<>p_payload then raise exception 'Retry identity conflicts' using errcode='40001'; end if;
  return to_jsonb(r);
 end if;
 if (select count(*) from public.admin_operations where created_at>clock_timestamp()-interval '1 hour')>=20 then raise exception 'Operation rate limit reached'; end if;
 if p_kind='backup' and exists(select 1 from public.admin_operations where kind='backup' and status in ('queued','running')) then raise exception 'An existing backup must be reconciled first'; end if;
 if p_kind='import' then
  if jsonb_typeof(p_payload->'rows') is distinct from 'array' then raise exception 'Import rows required'; end if;
  n:=jsonb_array_length(p_payload->'rows');
  if n<1 or n>200 or octet_length(p_payload::text)>300000 then raise exception 'Import size invalid'; end if;
 end if;
 insert into public.admin_operations(id,actor_id,kind,payload) values(p_id,p_actor,p_kind,p_payload) returning * into r;
 if p_kind='import' then insert into public.onboarding_rows(job_id,row_index,email)
  select p_id,(ordinality-1)::integer,value->>'email' from jsonb_array_elements(p_payload->'rows') with ordinality;
 end if;
 return to_jsonb(r);
end $$;

-- Lookup only for the server dry run/reconciliation, never exposed to browser roles.
create function public.onboarding_identity(p_email text)
returns table(id uuid,raw_user_meta_data jsonb)
language sql stable security definer set search_path=pg_catalog,public as $$
 select u.id,u.raw_user_meta_data from auth.users u where lower(u.email)=lower(p_email)
  or exists(select 1 from public.profiles p where p.id=u.id and lower(p.email)=lower(p_email)) limit 2
$$;

create function public.onboarding_existing(p_emails text[])
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(email order by email),'[]'::jsonb) from (
  select lower(u.email) email from auth.users u where lower(u.email)=any(p_emails) and cardinality(p_emails)<=200
  union select lower(p.email) from public.profiles p where lower(p.email)=any(p_emails) and cardinality(p_emails)<=200
 ) matches
$$;

create function public.claim_onboarding_row(p_job uuid,p_index integer,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.onboarding_rows;
begin
 perform 1 from public.profiles where id=p_actor and role='admin' and status='Active' for share;
 if not found then raise exception 'Active Admin required' using errcode='42501'; end if;
 perform 1 from public.admin_operations where id=p_job and actor_id=p_actor and kind='import' and status in ('queued','running') for update;
 if not found then raise exception 'Import not executable'; end if;
 select * into r from public.onboarding_rows where job_id=p_job and row_index=p_index for update;
 if not found then raise exception 'Row missing'; end if;
 if r.status<>'ready' then return null; end if;
 update public.admin_operations set status='running',updated_at=clock_timestamp() where id=p_job;
 update public.onboarding_rows set status='running',lease_until=clock_timestamp()+interval '2 minutes'
  where job_id=p_job and row_index=p_index returning * into r;
 return to_jsonb(r);
end $$;

create function public.summarize_admin_import(p_job uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.admin_operations; counts jsonb; outcomes jsonb;
begin
 select * into r from public.admin_operations where id=p_job and kind='import' for update;
 if not found then raise exception 'Import missing'; end if;
 -- Reconcile all bounded rows inside the same lock. An API row cap cannot hide
 -- an uncertain outcome, and the server never automatically resends an invite.
 update public.onboarding_rows x set status='invited',account_id=u.id,lease_until=null
 from auth.users u where x.job_id=p_job and x.status in ('running','uncertain')
  and lower(u.email)=r.payload->'rows'->x.row_index->>'email'
  and u.raw_user_meta_data->>'insync_import'=p_job::text || ':' || x.row_index::text;
 update public.onboarding_rows set status='uncertain'
 where job_id=p_job and status='running' and lease_until<clock_timestamp();
 select jsonb_object_agg(state,n) into counts from (
  select state,count(x.row_index) n from unnest(array['ready','running','invited','duplicate','failed','uncertain','cancelled']) state
  left join public.onboarding_rows x on x.job_id=p_job and x.status=state group by state) c;
 select jsonb_agg(jsonb_build_object('row_index',row_index,'status',status,'account_id',account_id) order by row_index)
 into outcomes from public.onboarding_rows where job_id=p_job;
 if jsonb_array_length(outcomes)<>jsonb_array_length(r.payload->'rows') then raise exception 'Incomplete outcomes'; end if;
 update public.admin_operations set
  status=case when (counts->>'ready')::integer+(counts->>'running')::integer>0 then
   case when status='queued' and (counts->>'running')::integer=0 then 'queued' else 'running' end
   when (counts->>'uncertain')::integer+(counts->>'failed')::integer>0 then 'failed' else 'completed' end,
  result=jsonb_build_object('counts',counts,'rows',outcomes),updated_at=clock_timestamp()
 where id=p_job returning * into r;
 return to_jsonb(r);
end $$;

create function public.claim_backup_operation(p_job uuid,p_run text,p_repository text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.admin_operations;
begin
 if p_run is null or p_run !~ '^[0-9]+$' or p_repository is null or p_repository !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then raise exception 'Invalid worker provenance'; end if;
 select * into r from public.admin_operations where id=p_job and kind='backup' for update;
 if not found or r.status<>'queued' then return null; end if;
 perform 1 from public.profiles where id=r.actor_id and role='admin' and status='Active' for share;
 if not found then raise exception 'Requesting Admin is no longer Active' using errcode='42501'; end if;
 update public.admin_operations set status='running',lease_until=clock_timestamp()+interval '30 minutes',updated_at=clock_timestamp(),
  result=jsonb_build_object('worker_run_id',p_run,'run_url','https://github.com/' || p_repository || '/actions/runs/' || p_run)
 where id=p_job returning * into r;
 return to_jsonb(r);
end $$;

revoke all on function public.audit_admin_operation(),public.prepare_admin_operation(uuid,uuid,text,jsonb),public.onboarding_identity(text),public.onboarding_existing(text[]),public.claim_onboarding_row(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.prepare_admin_operation(uuid,uuid,text,jsonb),public.onboarding_identity(text),public.onboarding_existing(text[]),public.claim_onboarding_row(uuid,integer,uuid) to service_role;
revoke all on function public.summarize_admin_import(uuid) from public,anon,authenticated;
grant execute on function public.summarize_admin_import(uuid) to service_role;
revoke all on function public.claim_backup_operation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_backup_operation(uuid,text,text) to service_role;

-- Inspection: API writes must be false; privileged helpers service-only.
select has_table_privilege('authenticated','public.admin_operations','INSERT') as browser_insert,
 has_function_privilege('authenticated','public.onboarding_identity(text)','EXECUTE') as browser_identity_lookup;
commit;

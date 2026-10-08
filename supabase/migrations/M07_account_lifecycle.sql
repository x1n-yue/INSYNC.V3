-- M07: atomic Active Admin lifecycle/assignment (INS-019; D09/D32).
-- PREREQUISITES: M06; 04 inspection + reviewed repair proposal. Blocks drift,
-- never fixes legacy rows. Trusted postgres owner; inspect helpers/grants first.
-- ROLLBACK: transaction rollback on error; after commit forward repair, retain
-- history and RPC-only protected fields; no return to raw role/assignment writes.
begin;
do $$ begin
 if current_user<>'postgres' or to_regprocedure('public.valid_required_hours(numeric)') is null
 then raise exception 'M07 requires trusted postgres and M06'; end if;
 if exists(select 1 from public.profiles p left join public.interns i on i.id=p.id
   left join public.profiles staff on staff.id=i.instructor_id
   where (p.role='intern' and i.id is null) or (i.instructor_id is not null
     and (p.role<>'intern' or staff.role is distinct from 'instructor' or staff.status is distinct from 'Active')))
 then raise exception 'Legacy role/assignment anomaly: review 04 inspection; no repair performed'; end if;
end $$;
-- Remove independent column grants as well as table privileges.
revoke update on public.profiles from public,anon,authenticated;
do $$ declare t text; c record; begin
 foreach t in array array['profiles','interns'] loop
  for c in select attname from pg_attribute where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped loop
   execute format('revoke insert(%I),update(%I),references(%I) on public.%I from public,anon,authenticated',c.attname,c.attname,c.attname,t);
  end loop;
 end loop;
end $$;
grant update(full_name) on public.profiles to authenticated;
revoke insert,update,delete on public.interns from public,anon,authenticated;

create function public.check_account_relationships() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare target uuid; p public.profiles;
begin
 target:=case when tg_op='DELETE' then old.id else new.id end;
 select * into p from public.profiles where id=target;
 if not found then return new; end if;
 if p.role='intern' and not exists(select 1 from public.interns where id=target) then raise exception 'Intern extension required'; end if;
 if (p.role<>'instructor' or p.status<>'Active') and exists(select 1 from public.interns where instructor_id=target)
 then raise exception 'Reassign or explicitly unassign interns before instructor demotion/deactivation'; end if;
 if exists(select 1 from public.interns i left join public.profiles staff on staff.id=i.instructor_id
   where i.id=target and i.instructor_id is not null
     and (p.role<>'intern' or staff.role is distinct from 'instructor' or staff.status is distinct from 'Active'))
 then raise exception 'Assignment requires an intern and an Active instructor'; end if;
 return new;
end $$;
create constraint trigger m07_profile_relationship after insert or update on public.profiles
deferrable initially deferred for each row execute function public.check_account_relationships();
create constraint trigger m07_intern_relationship after insert or update or delete on public.interns
deferrable initially deferred for each row execute function public.check_account_relationships();

create function public.admin_update_account(p_id uuid,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.profiles; i public.interns; k text; next_role text; next_status text;
begin
 perform pg_advisory_xact_lock(404,1);
 if not public.is_admin() then raise exception 'Active Admin required' using errcode='42501'; end if;
 perform 1 from public.profiles where id=auth.uid() for share;
 if jsonb_typeof(p_patch) is distinct from 'object' or p_patch='{}'::jsonb then raise exception 'Account patch required'; end if;
 for k in select jsonb_object_keys(p_patch) loop
  if k not in ('full_name','role','status','company_id') then raise exception 'Unsupported account field'; end if;
 end loop;
 select * into p from public.profiles where id=p_id for update;
 if not found then raise exception 'Account not found; refresh' using errcode='40001'; end if;
 next_role:=case when p_patch?'role' then p_patch->>'role' else p.role end;
 next_status:=case when p_patch?'status' then p_patch->>'status' else p.status end;
 if next_role is null or next_role not in ('intern','instructor','admin') or next_status is null or next_status not in ('Pending','Inactive','Active')
 then raise exception 'Valid role/status required'; end if;
 if p_patch?'full_name' and (jsonb_typeof(p_patch->'full_name') is distinct from 'string' or nullif(btrim(p_patch->>'full_name'),'') is null or length(p_patch->>'full_name')>200)
 then raise exception 'Name required, <=200 characters'; end if;
 if (next_role<>'instructor' or next_status<>'Active') and exists(select 1 from public.interns where instructor_id=p_id)
 then raise exception 'Reassign or explicitly unassign interns first'; end if;
 if next_role<>'intern' and exists(select 1 from public.interns where id=p_id and instructor_id is not null)
 then raise exception 'Explicitly unassign this intern before changing role'; end if;
 if next_role='intern' then
   insert into public.interns(id) values(p_id) on conflict(id) do nothing;
   if p_patch?'company_id' then
    update public.interns set company_id=(p_patch->>'company_id')::uuid where id=p_id;
   end if;
 elsif p_patch?'company_id' then raise exception 'Company applies only to intern accounts'; end if;
 update public.profiles set full_name=case when p_patch?'full_name' then btrim(p_patch->>'full_name') else full_name end,
   role=next_role,status=next_status where id=p_id returning * into p;
 select * into i from public.interns where id=p_id;
 -- Deferred triggers also enforce trusted SQL changes; errors still abort RPC.
 return jsonb_build_object('id',p.id,'profile',to_jsonb(p),'intern',case when i.id is null then null else to_jsonb(i) end);
end $$;
create function public.admin_set_assignment(p_id uuid,p_instructor_id uuid,p_company_id uuid,p_section_id uuid,p_required_hours numeric)
returns public.interns language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.interns;
begin
 perform pg_advisory_xact_lock(404,1);
 if not public.is_admin() then raise exception 'Active Admin required' using errcode='42501'; end if;
 perform 1 from public.profiles where id=auth.uid() for share;
 if not public.valid_required_hours(p_required_hours) then raise exception 'Required hours must be >0, <=10000, at most two decimal places'; end if;
 if not exists(select 1 from public.profiles where id=p_id and role='intern') then raise exception 'Current intern required'; end if;
 if p_instructor_id is not null and not exists(select 1 from public.profiles where id=p_instructor_id and role='instructor' and status='Active')
 then raise exception 'Active instructor required'; end if;
 update public.interns set instructor_id=p_instructor_id,company_id=p_company_id,section_id=p_section_id,required_hours=p_required_hours
 where id=p_id returning * into r;
 if not found then raise exception 'Intern extension not found; refresh' using errcode='40001'; end if;
 return r;
end $$;
revoke all on function public.check_account_relationships(),public.admin_update_account(uuid,jsonb),public.admin_set_assignment(uuid,uuid,uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.admin_update_account(uuid,jsonb),public.admin_set_assignment(uuid,uuid,uuid,uuid,numeric) to authenticated;
-- CATALOG VERIFICATION: no raw protected writes; both deferred guards installed.
select table_name,column_name,privilege_type from information_schema.column_privileges where table_schema='public' and grantee='authenticated' and table_name in ('profiles','interns');
select tgname,tgdeferrable,tginitdeferred from pg_trigger where tgname like 'm07_%';
select proname,prosecdef,proconfig,proacl from pg_proc where proname in ('check_account_relationships','admin_update_account','admin_set_assignment');
commit;

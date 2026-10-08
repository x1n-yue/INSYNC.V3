-- M14: prevent account changes from removing the final active administrator.
-- Apply after M07 (normally after M13) as trusted postgres. No row rewrite.
-- Zero-admin fresh installations still use the documented first-Admin bootstrap.
begin;
do $$ begin
 if current_user <> 'postgres'
   or to_regprocedure('public.admin_update_account(uuid,jsonb)') is null
 then raise exception 'M14 requires trusted postgres and M07'; end if;
end $$;

create function public.guard_last_active_admin() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if old.role <> 'admin' or old.status <> 'Active' then
   if tg_op='DELETE' then return old; end if;
   return new;
 end if;
 if tg_op='UPDATE' and new.role='admin' and new.status='Active' then return new; end if;
 -- Same lock as the account lifecycle RPC: concurrent administrators cannot
 -- each rely on the other's pre-change status and leave no active administrator.
 perform pg_advisory_xact_lock(404,1);
 if not exists(select 1 from public.profiles where id<>old.id and role='admin' and status='Active') then
   raise exception 'Keep at least one Active Admin. Activate another administrator before removing this account or changing its role/status.' using errcode='23514';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.guard_last_active_admin() from public,anon,authenticated;
create trigger m14_last_active_admin before update or delete on public.profiles
 for each row execute function public.guard_last_active_admin();
notify pgrst, 'reload schema';
commit;

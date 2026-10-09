-- M15: RLS-scoped, paginated current-assignment metrics. No history rewrite.
-- Apply once after M14 as trusted postgres, before the new client.
begin;
do $$ begin
 if current_user <> 'postgres' or to_regprocedure('public.guard_last_active_admin()') is null
   or to_regprocedure('public.verify_attendance(uuid,timestamptz,timestamptz,numeric)') is null
   or to_regprocedure('public.send_announcement(text,text,uuid,uuid,uuid)') is null then
  raise exception 'M15 requires trusted postgres and structural migrations through M14';
 end if;
end $$;

create function public.attendance_evidence_state(x public.attendance_logs,p_now timestamptz)
returns text language sql stable security invoker set search_path=pg_catalog,public as $$
 select case
     when x.clocked_in_at is null or not isfinite(x.clocked_in_at) then 'invalid'
     when x.clocked_in_at is null or x.clocked_in_at>p_now
      or x.log_date is distinct from (x.clocked_in_at at time zone 'Asia/Manila')::date
      or x.time_in is null
      or abs(extract(epoch from (x.time_in-(x.clocked_in_at at time zone 'Asia/Manila')::time)))>0.001 then 'invalid'
     when x.time_out is null and x.clocked_out_at is null and x.hours is null and x.verified=false and x.verified_by is null then 'open'
     when x.clocked_out_at is null or not isfinite(x.clocked_out_at) then 'invalid'
     when x.clocked_out_at<=p_now and x.time_out is not null
      and abs(extract(epoch from (x.time_out-(x.clocked_out_at at time zone 'Asia/Manila')::time)))<=0.001
      and x.clocked_out_at>x.clocked_in_at and x.clocked_out_at-x.clocked_in_at<=interval '16 hours'
      and x.hours>0 and x.hours::text not in ('NaN','Infinity','-Infinity')
      and abs(x.hours-extract(epoch from (x.clocked_out_at-x.clocked_in_at))/3600)<=0.000001
      and ((x.verified=true and x.verified_by is not null) or (x.verified=false and x.verified_by is null)) then 'closed'
     else 'invalid' end
$$;
revoke all on function public.attendance_evidence_state(public.attendance_logs,timestamptz) from public,anon,authenticated;
grant execute on function public.attendance_evidence_state(public.attendance_logs,timestamptz) to authenticated;

create function public.dashboard_metrics(p_after uuid default null, p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if public.current_role() is null then raise exception 'Active account required' using errcode='42501'; end if;
 if p_limit is null or p_limit<1 or p_limit>250 then raise exception 'Page size must be 1-250'; end if;
 with eligible as materialized (
  select i.* from public.interns i join public.profiles p on p.id=i.id where p.role='intern'
 ), page as (
  select * from eligible where p_after is null or id>p_after order by id limit p_limit
 ), facts as (
  select i.id,i.academic_year_id,
   case when i.required_hours>0 and i.required_hours<=10000 and i.required_hours=round(i.required_hours,2) then i.required_hours end target,
   a.*,d.*,
   (select case when count(*)=0 then false when count(*)=1 and bool_and(public.attendance_evidence_state(x,statement_timestamp())='open') then true else null end from public.attendance_logs x where x.intern_id=i.id and x.time_out is null) clocked_in
  from page i
  cross join lateral (
   select coalesce(bool_and(state<>'invalid'),true) attendance_known,
    coalesce(sum(hours) filter(where state='closed'),0) logged_hours,
    coalesce(sum(hours) filter(where state='closed' and verified),0) verified_hours,
    max(log_date) filter(where state='closed') last_date
   from (
    select x.*,public.attendance_evidence_state(x,statement_timestamp()) state
    from public.attendance_logs x where x.intern_id=i.id and x.academic_year_id is not distinct from i.academic_year_id
   ) evidence
  ) a
  cross join lateral (
   select count(*) doc_count,
    (select count(*) from (select distinct doc_type from public.documents where intern_id=i.id and academic_year_id is not distinct from i.academic_year_id) types)=count(*) checklist_known,
    count(distinct doc_type) filter(where doc_type in ('moa','endorsement','consent','medical')) standard_count,
    count(*) filter(where status='Approved' and upload_version>0 and file_path like i.id::text||'/%'
      and coalesce(file_name,'')<>'' and reviewed_by is not null and isfinite(reviewed_at)) approved_count,
    coalesce(bool_and(coalesce(status in ('Pending','Approved','Needs Revision') and
      (status<>'Approved' or (upload_version>0 and file_path like i.id::text||'/%' and coalesce(file_name,'')<>'' and reviewed_by is not null and isfinite(reviewed_at))),false)),true) docs_valid,
    coalesce(bool_or(status='Needs Revision'),false) revision_needed
   from public.documents where intern_id=i.id and academic_year_id is not distinct from i.academic_year_id
  ) d
 ), calculated as (
  select *,attendance_known and target is not null and docs_valid and checklist_known clearance_known,
   verified_hours>=target and standard_count=4 and checklist_known and approved_count=doc_count eligible_clearance
  from facts
 ), rows as (
  select id,jsonb_build_object('id',id,'academic_year_id',academic_year_id,'clockedIn',clocked_in,'documentCount',doc_count,
   'pendingCorrections',(select count(*) from public.attendance_exceptions x where x.intern_id=calculated.id and x.status='Pending'),
   'latestEvaluation',(select to_jsonb(e) from public.evaluations e where e.intern_id=calculated.id and e.academic_year_id is not distinct from calculated.academic_year_id order by e.created_at desc,e.id desc limit 1),
   'metric',jsonb_build_object('target',target,'logged',case when attendance_known then logged_hours end,
    'verified',case when attendance_known then verified_hours end,
    'progress',case when attendance_known and target is not null then least(100,floor(verified_hours/target*100)) end,
    'remaining',case when attendance_known and target is not null then greatest(0,target-verified_hours) end,
    'approved',approved_count,'checklist',jsonb_build_object('known',checklist_known,'complete',checklist_known and standard_count=4,'present',standard_count,'total',4),
    'cleared',case when clearance_known then eligible_clearance end,'lastDate',last_date,
    'risk',case when not clearance_known then 'Unknown' when eligible_clearance then 'Completed'
     when verified_hours<target and (revision_needed or ((statement_timestamp() at time zone 'Asia/Manila')::date-last_date)>=7) then 'At Risk'
     when last_date is not null then 'On Track' else 'Unknown' end)) value
  from calculated
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(value order by id) from rows),'[]'::jsonb),
   'total',(select count(*) from eligible),'asOf',statement_timestamp(),'actorId',auth.uid(),'actorRole',public.current_role()) into result;
 return result;
end $$;
revoke all on function public.dashboard_metrics(uuid,integer) from public,anon,authenticated;
grant execute on function public.dashboard_metrics(uuid,integer) to authenticated;
create index m15_attendance_owner_year on public.attendance_logs(intern_id,academic_year_id,log_date);
create index m15_documents_owner_year on public.documents(intern_id,academic_year_id);
create index m15_evaluations_owner_year on public.evaluations(intern_id,academic_year_id,created_at desc,id desc);

create function public.dashboard_chart(p_period text default 'week') returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb; today date := (statement_timestamp() at time zone 'Asia/Manila')::date;
begin
 if public.current_role() is distinct from 'intern' then raise exception 'Active Intern required' using errcode='42501'; end if;
 if p_period is null or p_period not in ('week','month','year','all') then raise exception 'Invalid period'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('day',bucket,'hours',hours,'verified',verified) order by bucket),'[]'::jsonb) into result
 from (
  select case when p_period in ('all','year') then to_char(a.log_date,'YYYY-MM') else to_char(a.log_date,'YYYY-MM-DD') end as bucket,
   case when bool_or(public.attendance_evidence_state(a,statement_timestamp())='invalid') then null else coalesce(sum(a.hours) filter(where public.attendance_evidence_state(a,statement_timestamp())='closed'),0) end hours,
   case when bool_or(public.attendance_evidence_state(a,statement_timestamp())='invalid') then null else coalesce(sum(a.hours) filter(where public.attendance_evidence_state(a,statement_timestamp())='closed' and a.verified),0) end verified
  from public.attendance_logs a join public.interns i on i.id=a.intern_id
  where a.intern_id=auth.uid() and a.academic_year_id is not distinct from i.academic_year_id and a.log_date<=today
   and (p_period='all' or (p_period='week' and a.log_date>=date_trunc('week',today)::date)
    or (p_period='month' and a.log_date>=date_trunc('month',today)::date) or (p_period='year' and a.log_date>=date_trunc('year',today)::date))
  group by 1
 ) grouped;
 return result;
end $$;
revoke all on function public.dashboard_chart(text) from public,anon,authenticated;
grant execute on function public.dashboard_chart(text) to authenticated;

notify pgrst, 'reload schema';
commit;

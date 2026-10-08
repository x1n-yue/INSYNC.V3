-- M06: authoritative evaluation and required-hours validation (INS-017/018).
-- PREREQUISITES: trusted postgres, M01-M04; inspect 04_phase4_domain.sql and
-- PHASE4_REPAIR_PROPOSAL.md. M05 attendance historical gate may remain deferred.
-- No legacy row rewrite/backfill. Deliverable only; no real-project execution.
-- ROLLBACK: transaction error rolls back; after commit disable affected clients
-- and forward repair. Retain evidence/idempotency; never restore raw evaluation writes.
begin;
do $$ begin
 if current_user<>'postgres' or to_regprocedure('public.write_trusted_audit()') is null
 then raise exception 'M06 requires trusted postgres and M01-M04'; end if;
end $$;

create function public.valid_required_hours(p_value numeric) returns boolean
language sql immutable set search_path=pg_catalog,public as $$
 select coalesce(p_value::text not in ('NaN','Infinity','-Infinity') and p_value>0
   and p_value<=10000 and p_value=round(p_value,2),false)
$$;
create function public.rubric_score(p_criteria jsonb) returns integer
language plpgsql immutable set search_path=pg_catalog,public as $$
declare k text; n numeric; total numeric:=0;
begin
 if jsonb_typeof(p_criteria) is distinct from 'object' then return null; end if;
 if (select count(*) from jsonb_object_keys(p_criteria))<>4 then return null; end if;
 foreach k in array array['punctuality','performance','conduct','communication'] loop
   if jsonb_typeof(p_criteria->k) is distinct from 'number' then return null; end if;
   n:=(p_criteria->>k)::numeric;
   if n<1 or n>5 or n<>trunc(n) then return null; end if;
   total:=total+n*case k when 'punctuality' then 25 when 'performance' then 35 else 20 end/5;
 end loop;
 return round(total)::integer;
end $$;
alter table public.interns add constraint m06_required_hours check(public.valid_required_hours(required_hours)) not valid;
alter table public.evaluations add column submission_id uuid;
create unique index m06_evaluation_retry on public.evaluations(evaluator_id,submission_id) where submission_id is not null;
alter table public.evaluations add constraint m06_evaluation_rubric check(
 overall_score is not null and evaluator_id is not null and public.rubric_score(competencies) is not null
 and overall_score=public.rubric_score(competencies)) not valid;
-- Old NULL submissions remain history, not automatically assigned new identities.
revoke insert,update,delete on public.evaluations from public,anon,authenticated;
drop policy m01_evaluations_insert on public.evaluations;
create function public.submit_evaluation(p_intern_id uuid,p_criteria jsonb,p_feedback text,p_submission_id uuid)
returns public.evaluations language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.evaluations; score integer;
begin
 perform pg_advisory_xact_lock(404,1);
 if not public.can_review(p_intern_id) or not exists(select 1 from public.profiles where id=p_intern_id and role='intern')
 then raise exception 'Evaluation not permitted' using errcode='42501'; end if;
 score:=public.rubric_score(p_criteria);
 if score is null or p_submission_id is null or length(p_feedback)>500 then
   raise exception 'Four integer criteria 1-5, submission UUID and feedback <=500 required'; end if;
 select * into r from public.evaluations where evaluator_id=auth.uid() and submission_id=p_submission_id;
 if found then
   if r.intern_id is distinct from p_intern_id or r.competencies is distinct from p_criteria
     or r.feedback is distinct from nullif(btrim(p_feedback),'') then raise exception 'Submission key reused with different content' using errcode='40001'; end if;
   return r;
 end if;
 insert into public.evaluations(intern_id,evaluator_id,competencies,feedback,overall_score,submission_id)
 values(p_intern_id,auth.uid(),p_criteria,nullif(btrim(p_feedback),''),score,p_submission_id) returning * into r;
 return r;
end $$;
revoke all on function public.valid_required_hours(numeric),public.rubric_score(jsonb),public.submit_evaluation(uuid,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.valid_required_hours(numeric),public.rubric_score(jsonb),public.submit_evaluation(uuid,jsonb,text,uuid) to authenticated;
-- CATALOG VERIFICATION + exact read-only anomaly report; M09 deferred validation.
select id,competencies,overall_score from public.evaluations where public.rubric_score(competencies) is null
 or overall_score is distinct from public.rubric_score(competencies) or evaluator_id is null;
select conname,convalidated from pg_constraint where conname like 'm06_%';
select indexname,indexdef from pg_indexes where indexname='m06_evaluation_retry';
select proname,prosecdef,proconfig,proacl from pg_proc where proname in ('valid_required_hours','rubric_score','submit_evaluation');
commit;

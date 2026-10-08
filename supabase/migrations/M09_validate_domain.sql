-- M09: DEFERRED historical validation; never an automatic repair (INS-017/018).
-- PREREQUISITES: M06-M08, repeated 04 inspection and exact M06 rubric query;
-- independently reviewed per-row dispositions. M05 is a separate attendance gate.
-- ROLLBACK: failure leaves M06 NOT VALID new-write checks and old rows unchanged.
-- After commit retain checks/NOT NULL, forward repair rather than weakening them.
begin;
do $$ begin
 if current_user<>'postgres' or to_regprocedure('public.review_document_version(uuid,text,text,bigint,bigint)') is null
 then raise exception 'M09 requires trusted postgres and M06-M08'; end if;
end $$;
alter table public.interns validate constraint m06_required_hours;
alter table public.evaluations validate constraint m06_evaluation_rubric;
alter table public.evaluations alter column overall_score set not null;
-- CATALOG VERIFICATION: both convalidated=true and attnotnull=true.
select conname,convalidated from pg_constraint where conname in ('m06_required_hours','m06_evaluation_rubric');
select attname,attnotnull from pg_attribute where attrelid='public.evaluations'::regclass and attname='overall_score';
commit;

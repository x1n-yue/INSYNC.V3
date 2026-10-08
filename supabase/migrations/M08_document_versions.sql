-- M08: unique requirements, reserved immutable evidence and versioned reviews.
-- PREREQUISITES: M06/M07, private documents bucket M04, reviewed 04 inspection
-- + PHASE4_REPAIR_PROPOSAL.md, actual storage.objects.metadata size/mimetype.
-- Duplicate requirements abort unchanged; no legacy version/approval backfill.
-- ROLLBACK: errors roll back; after commit keep versions/events/bucket private,
-- disable affected clients and forward repair; never restore arbitrary uploads.
-- Storage bytes are removed ONLY through Storage API, never DELETE SQL here.
begin;
do $$ begin
 if current_user<>'postgres' or to_regprocedure('public.admin_update_account(uuid,jsonb)') is null then raise exception 'M08 requires trusted postgres and M07'; end if;
 if not exists(select 1 from storage.buckets where id='documents' and not public and file_size_limit=10485760
   and allowed_mime_types @> array['application/pdf','image/jpeg','image/png']::text[])
 then raise exception 'Reviewed private documents bucket with MIME/size limits required'; end if;
 if not exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='metadata' and data_type='jsonb')
 then raise exception 'Inspect Storage metadata contract before M08'; end if;
 if exists(select 1 from public.documents group by intern_id,doc_type having count(*)>1)
 then raise exception 'Duplicate requirements: review proposal; no rows changed'; end if;
end $$;
alter table public.documents add constraint m08_requirement_identity unique(intern_id,doc_type);
alter table public.documents add column upload_version bigint not null default 0;
alter table public.documents add column review_revision bigint not null default 0;
create table public.document_versions(
 id uuid primary key default gen_random_uuid(),document_id uuid not null references public.documents(id),
 intern_id uuid not null references public.profiles(id),version_no bigint,
 expected_version bigint not null check(expected_version>=0),file_path text not null unique,file_name text not null,
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),
 byte_size bigint not null check(byte_size>0 and byte_size<=10485760),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 committed_at timestamptz,abandoned_at timestamptz,
 status text not null default 'Pending' check(status in ('Pending','Approved','Needs Revision')),
 note text,reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,
 unique(document_id,version_no),check(not(committed_at is not null and abandoned_at is not null)),
 check((committed_at is null and version_no is null) or (committed_at is not null and version_no>0)),
 check(split_part(file_path,'/',1)=intern_id::text));
create table public.document_review_events(
 id uuid primary key default gen_random_uuid(),document_id uuid not null references public.documents(id),
 version_id uuid not null references public.document_versions(id),intern_id uuid not null references public.profiles(id),
 review_revision bigint not null,status text not null check(status in ('Pending','Approved','Needs Revision')),
 note text,reviewed_by uuid not null references public.profiles(id),reviewed_at timestamptz not null,
 unique(version_id,review_revision));
alter table public.document_versions enable row level security;
alter table public.document_review_events enable row level security;
revoke all on public.document_versions,public.document_review_events from public,anon,authenticated;
grant select on public.document_versions,public.document_review_events to authenticated;
create policy m08_versions_read on public.document_versions for select to authenticated
using(public.owns_intern(intern_id) or (committed_at is not null and public.can_review(intern_id)));
create policy m08_reviews_read on public.document_review_events for select to authenticated using(public.can_read_intern(intern_id));
create trigger m08_version_audit after insert or update or delete on public.document_versions for each row execute function public.write_trusted_audit();
create trigger m08_review_audit after insert or update or delete on public.document_review_events for each row execute function public.write_trusted_audit();
revoke insert on public.documents from public,anon,authenticated;
grant insert(intern_id,doc_type,name) on public.documents to authenticated;

create function public.attach_standard_docs(p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform pg_advisory_xact_lock(404,1);
 if not public.is_admin() then raise exception 'Active Admin required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_id and role='intern') then raise exception 'Current intern required'; end if;
 insert into public.documents(intern_id,doc_type,name)
 select p_id,t,k from (values('moa','Memorandum of Agreement (MOA)'),('endorsement','Endorsement Letter'),
   ('consent','Parent / Guardian Consent Form'),('medical','Medical Certificate')) x(t,k)
 on conflict(intern_id,doc_type) do nothing;
 select coalesce(jsonb_agg(to_jsonb(d) order by d.doc_type),'[]'::jsonb) into result from public.documents d where intern_id=p_id;
 return jsonb_build_object('id',p_id,'documents',result);
end $$;
create function public.stage_document_upload(p_id uuid,p_name text,p_mime text,p_size bigint,p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.documents; v public.document_versions; receipt uuid:=gen_random_uuid(); ext text;
begin
 perform pg_advisory_xact_lock(404,1);
 select * into d from public.documents where id=p_id and intern_id=auth.uid() for update;
 if not found or not public.owns_intern(auth.uid()) then raise exception 'Owned requirement required' using errcode='42501'; end if;
 if p_expected_version is distinct from d.upload_version then raise exception 'Document changed; refresh' using errcode='40001'; end if;
 ext:=case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else null end;
 if ext is null or p_size is null or p_size<=0 or p_size>10485760 or nullif(btrim(p_name),'') is null or length(p_name)>255 or p_name~'[[:cntrl:]]'
 then raise exception 'PDF/JPEG/PNG, 1 byte-10 MiB and valid filename required'; end if;
 insert into public.document_versions(id,document_id,intern_id,expected_version,file_path,file_name,mime_type,byte_size,expires_at)
 values(receipt,d.id,auth.uid(),d.upload_version,auth.uid()::text||'/'||receipt::text||'.'||ext,p_name,p_mime,p_size,clock_timestamp()+interval '15 minutes') returning * into v;
 return jsonb_build_object('id',d.id,'upload',to_jsonb(v));
end $$;
create function public.can_insert_reserved_document(p_path text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(404,1);
 return public.owns_intern(auth.uid()) and exists(select 1 from public.document_versions v join public.documents d on d.id=v.document_id
 where v.file_path=p_path and v.intern_id=auth.uid() and v.committed_at is null and v.abandoned_at is null
   and v.expires_at>clock_timestamp() and v.expected_version=d.upload_version);
end $$;
alter policy m01_document_objects_insert on storage.objects with check(bucket_id='documents' and public.can_insert_reserved_document(name));

create function public.finalize_document_upload(p_upload_id uuid) returns public.documents
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.document_versions; d public.documents;
begin
 perform pg_advisory_xact_lock(404,1);
 select * into v from public.document_versions where id=p_upload_id and intern_id=auth.uid() for update;
 if not found or not public.owns_intern(auth.uid()) then raise exception 'Owned reservation required' using errcode='42501'; end if;
 select * into d from public.documents where id=v.document_id for update;
 if v.committed_at is not null then return d; end if; -- response-loss retry, no duplicate version
 if v.abandoned_at is not null or v.expires_at<=clock_timestamp() or v.expected_version<>d.upload_version
 then raise exception 'Upload expired or evidence changed; refresh' using errcode='40001'; end if;
 if not exists(select 1 from storage.objects where bucket_id='documents' and name=v.file_path
   and metadata->>'mimetype'=v.mime_type and (metadata->>'size')::numeric=v.byte_size)
 then raise exception 'Stored object MIME/size evidence missing or mismatched'; end if;
 update public.document_versions set version_no=d.upload_version+1,committed_at=clock_timestamp() where id=v.id;
 update public.documents set file_path=v.file_path,file_name=v.file_name,upload_version=upload_version+1,review_revision=0,
   status='Pending',note=null,reviewed_by=null,reviewed_at=null,updated_at=clock_timestamp() where id=d.id returning * into d;
 return d;
end $$;
create function public.cancel_document_upload(p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.document_versions; d public.documents;
begin
 perform pg_advisory_xact_lock(404,1);
 select * into v from public.document_versions where id=p_id and intern_id=auth.uid() for update;
 if not found or not public.owns_intern(auth.uid()) then raise exception 'Owned reservation required' using errcode='42501'; end if;
 if v.committed_at is not null then
   select * into d from public.documents where id=v.document_id;
   return jsonb_build_object('id',v.id,'committed',true,'document',to_jsonb(d));
 end if;
 update public.document_versions set abandoned_at=coalesce(abandoned_at,clock_timestamp()) where id=v.id;
 return jsonb_build_object('id',v.id,'committed',false,'path',v.file_path,
   'object_exists',exists(select 1 from storage.objects where bucket_id='documents' and name=v.file_path));
end $$;
create function public.unfinished_document_uploads() returns setof public.document_versions
language sql security definer set search_path=pg_catalog,public as $$
 select v.* from public.document_versions v where public.owns_intern(auth.uid()) and v.intern_id=auth.uid()
 and committed_at is null and (abandoned_at is not null or expires_at<=clock_timestamp()) order by created_at
$$;
create function public.can_delete_staged_document(p_path text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 -- Serializes delete authorization with commit/cancel; no check/delete race.
 perform pg_advisory_xact_lock(404,1);
 return public.owns_intern(auth.uid()) and exists(select 1 from public.document_versions v where v.file_path=p_path
   and v.intern_id=auth.uid() and v.committed_at is null and v.abandoned_at is not null)
 and not exists(select 1 from public.documents where file_path=p_path)
 and not exists(select 1 from public.document_versions where file_path=p_path and committed_at is not null);
end $$;
-- API table ACL is necessary, but document DELETE is narrowly receipt-scoped RLS.
-- Review existing unrelated-bucket DELETE policies/ACL before deploying this grant.
grant delete on storage.objects to authenticated;
create policy m08_staged_cleanup on storage.objects for delete to authenticated
using(bucket_id='documents' and public.can_delete_staged_document(name));
-- Restrictive guards cannot be OR-bypassed by another permissive policy. Other
-- buckets keep their existing predicates; no new other-bucket allow policy.
create policy m08_document_insert_guard on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'documents' or public.can_insert_reserved_document(name));
create policy m08_document_delete_guard on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'documents' or public.can_delete_staged_document(name));
create policy m08_document_update_guard on storage.objects as restrictive for update to authenticated
using(bucket_id<>'documents') with check(bucket_id<>'documents');
create policy m08_document_read_guard on storage.objects as restrictive for select to authenticated
using(bucket_id<>'documents' or public.can_read_document_object(name));
create policy m08_document_anon_guard on storage.objects as restrictive for all to anon
using(bucket_id<>'documents') with check(bucket_id<>'documents');

create or replace function public.can_read_document_object(p_path text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.is_active() and ((public.current_role()='intern' and split_part(p_path,'/',1)=auth.uid()::text) or public.is_admin()
 or exists(select 1 from public.documents d where d.file_path=p_path and split_part(p_path,'/',1)=d.intern_id::text and public.assigned_intern(d.intern_id))
 or exists(select 1 from public.document_versions v where v.file_path=p_path and v.committed_at is not null and public.assigned_intern(v.intern_id)))
$$;
create function public.document_access(p_id uuid,p_expected_version bigint,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.documents;
begin
 select * into d from public.documents where id=p_id;
 if not found or not public.can_read_intern(d.intern_id) then raise exception 'Document access not permitted' using errcode='42501'; end if;
 if d.upload_version is distinct from p_expected_version or d.review_revision is distinct from p_expected_revision
 then raise exception 'Evidence changed; refresh' using errcode='40001'; end if;
 if d.file_path is null or split_part(d.file_path,'/',1)<>d.intern_id::text
 or not exists(select 1 from storage.objects where bucket_id='documents' and name=d.file_path) then raise exception 'File missing; request resubmission'; end if;
 return jsonb_build_object('id',d.id,'file_path',d.file_path,'file_name',d.file_name,'upload_version',d.upload_version);
end $$;
create function public.review_document_version(p_id uuid,p_status text,p_note text,p_expected_version bigint,p_expected_revision bigint)
returns public.documents language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.documents; v public.document_versions; ts timestamptz;
begin
 perform pg_advisory_xact_lock(404,1);
 ts:=clock_timestamp();
 select * into d from public.documents where id=p_id for update;
 if not found or not public.can_review(d.intern_id) then raise exception 'Review not permitted' using errcode='42501'; end if;
 if d.upload_version is distinct from p_expected_version or d.review_revision is distinct from p_expected_revision
 then raise exception 'Evidence or review changed; refresh' using errcode='40001'; end if;
 if p_status is null or not ((d.status='Pending' and p_status in ('Approved','Needs Revision')) or (d.status='Approved' and p_status='Pending'))
 then raise exception 'Invalid review transition; refresh'; end if;
 if length(p_note)>500 or (p_status='Needs Revision' and nullif(btrim(p_note),'') is null) then raise exception 'Revision note required; maximum 500 characters'; end if;
 select * into v from public.document_versions where document_id=d.id and version_no=d.upload_version and committed_at is not null;
 if not found or v.file_path<>d.file_path or not exists(select 1 from storage.objects where bucket_id='documents' and name=v.file_path
   and metadata->>'mimetype'=v.mime_type and (metadata->>'size')::numeric=v.byte_size)
 then raise exception 'Current version evidence missing; resubmit before review'; end if;
 update public.documents set status=p_status,note=nullif(btrim(p_note),''),reviewed_by=auth.uid(),reviewed_at=ts,
   review_revision=review_revision+1,updated_at=ts where id=d.id returning * into d;
 update public.document_versions set status=p_status,note=d.note,reviewed_by=auth.uid(),reviewed_at=ts where id=v.id;
 insert into public.document_review_events(document_id,version_id,intern_id,review_revision,status,note,reviewed_by,reviewed_at)
 values(d.id,v.id,d.intern_id,d.review_revision,p_status,d.note,auth.uid(),ts);
 return d;
end $$;
-- Old path-only transitions must not remain an alternate bypass.
revoke all on function public.submit_document_upload(uuid,text,text),public.review_document(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.attach_standard_docs(uuid),public.stage_document_upload(uuid,text,text,bigint,bigint),
 public.can_insert_reserved_document(text),public.finalize_document_upload(uuid),public.cancel_document_upload(uuid),
 public.unfinished_document_uploads(),public.can_delete_staged_document(text),public.can_read_document_object(text),
 public.document_access(uuid,bigint,bigint),public.review_document_version(uuid,text,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.attach_standard_docs(uuid),public.stage_document_upload(uuid,text,text,bigint,bigint),
 public.can_insert_reserved_document(text),public.finalize_document_upload(uuid),public.cancel_document_upload(uuid),
 public.unfinished_document_uploads(),public.can_delete_staged_document(text),public.can_read_document_object(text),
 public.document_access(uuid,bigint,bigint),public.review_document_version(uuid,text,text,bigint,bigint) to authenticated;
-- CATALOG VERIFICATION: two new RLS tables, receipt-only cleanup, no raw writes.
select schemaname,tablename,policyname,cmd,qual,with_check from pg_policies where tablename in ('document_versions','document_review_events','objects');
select conname,pg_get_constraintdef(oid) from pg_constraint where conname='m08_requirement_identity';
select proname,prosecdef,proconfig,proacl from pg_proc where proname in ('stage_document_upload','finalize_document_upload','cancel_document_upload','document_access','review_document_version');
commit;

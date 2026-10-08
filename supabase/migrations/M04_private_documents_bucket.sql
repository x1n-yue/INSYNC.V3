-- M04: explicit existing-bucket hardening (INS-015). Separate from domain DDL.
-- PREREQUISITES: M01 policies; inspect Storage schema, bucket settings,
-- public URL exposure and existing objects. A missing bucket stops for review.
-- Deliverable only; never run against a real project in this session.
-- ROLLBACK: failure rolls back; after commit keep bucket private. Fix authorized
-- access through a forward policy/client repair, NEVER restore public delivery.
-- Existing oversized/unsupported objects are retained; limits govern new uploads.
-- Independent of M03's legacy-data gate: may be scheduled after M01 if M03 stops.
begin;
do $$ declare n integer; begin
  if current_user<>'postgres' or to_regprocedure('public.can_read_document_object(text)') is null then
    raise exception 'M04 requires trusted postgres and M01 policies';
  end if;
  update storage.buckets set public=false,file_size_limit=10485760,
    allowed_mime_types=array['application/pdf','image/jpeg','image/png'] where id='documents';
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Expected existing documents bucket; inspect configuration'; end if;
end $$;
-- CATALOG VERIFICATION: exactly one row, private, 10 MiB, precisely three MIME types.
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='documents';
select policyname,cmd,qual,with_check from pg_policies where schemaname='storage' and tablename='objects';
commit;

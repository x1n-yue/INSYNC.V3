# Nondestructive remediation runbook

Phases 0-4, 2026-10-07. **M01-M09 authored and rehearsed only in fresh synthetic
in-memory/native Postgres; no real-project migration applied.** Phases 5-6 pending.
This session will not execute SQL against a real project. Every future rollout
requires operator review of prerequisites, anomaly disposition and live checks.

1. Confirm repository revision, operator identity, explicitly disposable rehearsal
   project, Auth/API settings and provider snapshot/restore capability. Never run
   `schema.sql` or the legacy broad policy patch as an existing-data upgrade.
2. Read `inspection/README.md`. Compare `01_metadata.sql` results with the audit
   before assuming baseline columns, function owners, grants, policies or bucket
   settings. Operator runs inspection separately; no SQL has been run here.
3. Inventory using `02_anomalies.sql`; reconcile complete counts under query limits.
   Keep real identifiers/output private. Review differences and record per-group
   proposals using `inspection/REPAIR_PROPOSAL.md`. No automatic deduplication,
   normalization, rubric invention, timestamp guessing or Storage cleanup.
4. Review `../DECISIONS.md` assumptions. Stop constraint deployment on unresolved
   anomalies. CHECKs use NOT VALID then VALIDATE where appropriate; UNIQUE requires
   explicit duplicate resolution before index creation. Preserve original history.
5. Rehearse `migrations/M01_authority.sql` first, then the Phase 2 gates below.
   Apply only to the reviewed baseline, once, in the file's transaction. The exact
   order/file list will be extended as phases land;
   no glob execution or bootstrap replay. M01 authority precedes trusted audit,
   attendance/storage, data model operations, aggregate/index and year changes.
6. For each migration: capture private before snapshot/catalog/row counts; verify
   prerequisites; apply in its specified transaction; run catalog-verification
   query and assigned regression cases; compare domain invariants and row counts.
   Inject failures/concurrency as specified in `tests/FIXTURES.md`.
7. Rollback plan must preserve data and fail closed. Revert additive application
   changes only where compatible; use a reviewed corrective migration to repair
   schema. Never restore broad self-promotion/cross-roster policies as rollback.
   Exercise restore only on disposable data; preserve audit and original evidence.
8. Before any separately authorized live rollout, complete role/status/scope
   policy tests, Auth/Storage checks, post-catalog comparisons, browser/mobile/
   screen-reader checks and independent anomaly/SQL review. Record unverified
   cases and residual advisories. Build success is only compilation evidence.

Post-check checklist to expand per migration: protected field tampering denied;
retained JWT deactivation denied; assigned joins work; no extra permissive policies
or EXECUTE bypass; private known-path anonymous object delivery denied; atomic
attendance/review/audit outcomes; verified/logged totals reconcile above API cap;
legacy rows preserved; zero-row/conflict failures visible; correct current-year
count; no real secrets in artifacts. All these live checks remain pending.

## M01 deployment/rehearsal gate

Read `migrations/README.md` and `tests/M01.md`. M01 replaces policies/grants on all
12 tables as one transaction and adds only nullable columns; it does not update,
delete, merge or normalize legacy rows. Trusted postgres table/function ownership,
expected signup trigger and absence of unreviewed triggers/views/privileged RPCs
are checked before changes. Extra restrictive Storage policies also block preflight.
Review all functions affected by PUBLIC/anon/authenticated EXECUTE revocation.
Privately review approval provenance of every existing Admin/Instructor and all
known demo accounts using the read-only privileged-profile inventory. A stored
Active role cannot prove that prior self-escalation was authorized. Propose any
account remediation separately; M01 never silently demotes legacy accounts.
M01 leaves the existing document bucket flag/limits unchanged; M04 now supplies
the separate explicit private-bucket repair. Policies alone do not deny public delivery.

Coordinate the migration and client build: the new client requires `my_profile`,
clock/correction/review/upload RPCs and restricted staff-name RPC. Force older
clients to refresh; raw writes are now denied. New clocks get server instants;
legacy open sessions without instants require a correction rather than a guessed
timezone. Legacy messages without audience snapshot are author/Admin-only. Review
these behavior changes with fixture data before any separately authorized rollout.

Run M01's final catalog queries and the local suite. Then run `tests/M01.md`'s live
SDK/REST, Auth confirmation, retained-token, FK embedding and Storage cases on a
disposable Supabase project. Reconcile unchanged legacy row counts and object
inventory. M01 includes no unique/CHECK validation requiring historical repair;
the previously recorded anomaly review remains mandatory before Phase 2/4 indexes.

## Trusted first-Admin bootstrap procedure (operator only)

Do this only if there is no existing authorized Active Admin and ownership has
been verified out of band. Create/confirm a disposable or subsequently authorized
real Auth account through Auth; M01 always creates intern/Pending + extension.
Verify the exact auth.users UUID belongs to the intended operator. As the trusted
postgres SQL operator (never browser/service key), use a transaction to update that
**exact UUID**, guarded by `role='intern' and status='Pending'`, to admin/Active,
RETURNING id/role/status. Require exactly one row; rollback on zero/multiple or any
mismatch. Privately record operator approval; no bootstrap account/credential is
seeded by migrations. Preserve the extension/history; later lifecycle work handles
retirement. No user-controlled Auth metadata or request claim can bootstrap Admin.

Subsequent approvals use an existing Active Admin, enforced independently in DB.
M02 supplies trusted audit generation. Bootstrap before M02 still requires private
operator recording; after M02 a NULL actor is explicitly system/trusted SQL, not
a named human. Keep out-of-band operator approval. Do not promote arbitrary matching emails
or run a broadly filtered UPDATE. The trusted-role exception in profile guard is
`current_user='postgres'`; anon/authenticated must have no membership allowing that
role or any equivalent BYPASSRLS/owner privilege.

## Phase 2 ordered rehearsal / deployment gates

No agent-executed real-project steps. Operator review and separately authorized
rollout are required. Rehearse these exact files on disposable data, once:

1. M01 must already be committed and catalog verified. Inspect current owners,
   grants, trigger definitions and unexpected public functions/views again.
2. `migrations/M02_trusted_audit.sql`: revoke raw/column audit writes; install
   mandatory audit on 11 business tables; add review note and locked single/bulk
   review. No old audit rows changed. Confirm all 11 triggers enabled, helper
   EXECUTE denied to API roles and audit SELECT Admin-only. Coordinate client
   upgrade: it requires `review_exceptions`, and never writes audit events.
3. Read `inspection/03_phase2_attendance.sql`. Stop M03 for any duplicate daily,
   open or Pending identity. Privately approve a per-group proposal from
   `inspection/REPAIR_PROPOSAL.md`; author a separate versioned repair only after
   review. This repository contains no such repair and chooses no canonical row.
4. `migrations/M03_attendance_integrity.sql`: maintenance-window locks, duplicate
   preflight, unique daily/open/Pending indexes, NOT VALID checks and future-write
   triggers. Clock RPC time is captured after acquiring locks. Check installed
   unique indexes, CHECK `convalidated=false`, enabled future triggers and RPC
   grants/owners/search paths. All original rows remain unchanged. Invalid old
   rows may reject subsequent updates until an explicit reviewed correction.
5. `migrations/M04_private_documents_bucket.sql`: explicit UPDATE of the existing
   bucket to private, 10 MiB, PDF/JPEG/PNG. Missing bucket aborts. Unrelated buckets
   and existing objects untouched. **Independent of M03:** if M03 is blocked by
   legacy anomalies, M04 may be separately reviewed/rehearsed after M01 without
   waiting for data repair. Never restore public delivery as a compatibility fix.
6. **Deferred gate**, `migrations/M05_validate_attendance.sql`: only after M03,
   rerunning inspection and separately reviewing all historical anomalies and
   any expressly approved per-row repairs. No timestamp/reviewer guessing. It
   rejects future history/unreconciled approvals, then VALIDATEs four CHECKs.
   Failure preserves NOT VALID enforcement and the original rows. If blocked,
   record historical validation pending; do not bypass or claim certified history.
7. Run catalog queries in each file and `tests/PHASE2.md`'s disposable live checks.
   Reconcile before/after domain counts/object inventory and only expected new
   audit events. Confirm a failed audit causes failed business mutation; no fake
   Approved state, missing reconciliation, or false bulk success. Check UTC/Manila
   midnight, overnight, repeated transitions and actual two-client races.

Rollback: an error inside a file's transaction requires ROLLBACK; nothing in that
file should commit. After commit, disable affected flows if necessary and use a
reviewed forward migration. Preserve audit/evidence and private bucket settings.
Never disable required audit, weaken RLS, remove uniqueness to admit duplicates,
or reopen public Storage to restore a UI flow. Use provider restore only on
disposable rehearsal data with explicit counts/evidence verification.

Limits at Phase 2: no real bucket/JWT/API/SDK race tests ran here; native tests use
synthetic auth.uid()/Storage metadata, not Supabase services. Phase 4 below adds
signed-link UI and atomic Admin lifecycle operations. Audit pagination/read outages
and remaining zero-row handlers stay Phase 5. Legacy staff provenance cannot be proven
from stored role/status or a new audit source. Existing public URL consumers may
lose access after M04; test authorized access rather than preserving public URLs.

## Phase 3 client/tooling deployment checks

No new SQL migration or data change. Bootstrap and old policy patch receive warning
comments only; their executable bodies are not a repair path. New projects still
need a reviewed initial catalog without demo seeds and ordered additive migrations.

Use Node >=22.12.0, npm ci, tests/lint/build/audit; .nvmrc and Windows CI select
Node 22/24. Set only public Supabase build settings using .env.example, then
rebuild/redeploy. Missing/malformed settings render Setup required without SDK
construction. Dev/preview listen on loopback; static HTTPS deployment serves dist
with SPA fallback. Format checks do not validate connectivity/JWT signatures/RLS.

Follow tests/PHASE3.md for disposable browser/API checks on templates, all-row audit
and DTR CSV, injected failure, count changes and inactive sessions. Export limit:
50,000 records, count-checked keyset reads rather than a transactional snapshot.
No official certification or backup is claimed. Verify disabled controls, absent
production demo shortcuts and provider backup status separately. Operators must
rotate real accounts that reused the old demo password; no real inventory/login/
rotation happens here.

Rollback the client with a compatible reviewed build while retaining M01-M05
authorization and private Storage. Never restore legacy permissive policies to
support an older UI. Retain the tested lockfile/Node floor and review advisories
before any dependency rollback.

## Phase 4 domain and document deployment gates

1. Review D02/D04-D13/D32-D35 in DECISIONS.md. Capture private catalog, row counts
   and object inventory. Run `inspection/04_phase4_domain.sql` read-only after the
   earlier migrations, plus the existing metadata/anomaly queries. Review
   `inspection/PHASE4_REPAIR_PROPOSAL.md` per identity. No supplied migration
   deletes, deduplicates, rounds targets, invents rubric criteria or approves old
   evidence. All legacy changes require a separately reviewed versioned proposal.
2. Rehearse `M06_rubric_hours.sql` after M01-M04. M05 can remain deferred.
   Check `m06_required_hours` and `m06_evaluation_rubric` are initially NOT VALID,
   the partial retry index exists, raw evaluation writes are revoked, and RPC
   ownership/search_path/EXECUTE match the catalog queries. The CHECKs apply to
   new/updated rows even while historical validation is deferred. Run M06's exact
   read-only rubric anomaly query; broad preflight candidates are not proof of
   valid historical criteria or authorized evaluator provenance.
3. Before `M07_account_lifecycle.sql`, resolve reviewed missing intern extensions
   and incompatible references separately. The migration aborts unchanged on
   these anomalies. Verify deferred relationship triggers and profile full_name
   only/raw intern write revocations. Test explicit unassignment before promoting
   an intern or demoting/deactivating a referenced instructor. Company/section/
   target/history remain retained, with no implicit reassignment. Fail audit and
   FK writes to verify the entire operation rolls back.
4. Before `M08_document_versions.sql`, stop on duplicate `(intern_id,doc_type)`;
   review each group's evidence without choosing a canonical row automatically.
   Verify exact private bucket limits and actual `storage.objects.metadata` size/
   mimetype contract using disposable provider uploads. Inventory ALL Storage
   policies and privileges: M08 grants authenticated DELETE on the Storage table
   for receipt-scoped API cleanup; an existing unrelated-bucket permissive policy
   could become effective after that grant. Review those buckets explicitly.
   Do not weaken document restrictions to accommodate provider/API differences.
5. Apply M08 once. Check unique requirement identity, two new RLS tables, no raw
   version/event writes, fixed-path RPC grants and mandatory audit triggers.
   Check legacy document paths/statuses/counts unchanged and version=0; no versions
   or approval events are synthesized for them. New review/clearance requires
   explicit resubmission. Confirm old path-only upload/review RPC execution is
   revoked, and restrictive Storage guards prevent anonymous access, arbitrary
   insertion, all document overwrites and deletion of committed evidence.
6. **Independent deferred gate:** apply `M09_validate_domain.sql` only after M06-M08
   and separately reviewed clean historical targets/rubrics. It validates the two
   CHECKs and sets evaluation score NOT NULL. A failure rolls back this file,
   preserves data and M06 new-write enforcement; record the gate as pending.
   M05 attendance and M09 domain validation can be resolved independently. Never
   edit either file to coerce or remove offending historical rows.
7. Coordinate the client refresh after M06-M08. All dashboards require shared
   target/metrics rules; evaluations require a submission UUID; uploads require a
   server reservation, finalize, expected-version review and access RPCs. An older
   client receives denied raw/path-only writes. Follow `tests/PHASE4.md` on an
   explicitly disposable Supabase project: PostgREST shapes, retained tokens,
   MIME/size enforcement, physical file cleanup, private/signed delivery, expired
   links, concurrent replacement/review and account change races. Reconcile domain,
   evidence and trusted audit counts, including injected failures.

Rollback: any transaction error requires ROLLBACK; no partial file should commit.
After commit disable affected flows and use a reviewed forward migration. Preserve
original files, committed versions, review events, retry identities and audit.
Do not drop the new evidence tables, restore raw evaluation/profile/assignment
writes, re-enable old upload/review RPCs, remove receipt restrictions, or publish
the bucket. Failed finalization must be reconciled before cleanup; a lost response
may represent a committed upload. Use the Storage API for confirmed abandoned
receipts, never provider-metadata DELETE SQL. Legacy orphan disposition is separate.

Limits: native SQL tests model Storage metadata, not provider file bytes or HTTP.
MIME/size validation does not inspect file contents or provide malware scanning.
Signed links are bearer links usable until expiry (60 seconds), including after
subsequent access changes; issuing them is RLS-scoped, immediate revocation is not
claimed. Phase 4 operations use a conservative global advisory lock; measure
contention before rollout. Count-checked reads have a 50,000-row bound and cannot
detect every equal-count concurrent edit. Metrics are calculated on loaded data;
focus/midnight refresh, server aggregates and paginated detail remain Phase 5.
Browser/mobile/screen-reader checks remain unexecuted. No certification or
production readiness is asserted.


## M10 master-data lifecycle

Before deployment, verify the inspection result contains at most one `academic_years.is_current = true` row. Apply `M10_master_data_lifecycle.sql` only after M02 and M07 are committed. The migration aborts rather than choosing a current year when existing data has multiple current rows.

After deployment, verify with disposable Admin data that: `admin_set_current_academic_year(uuid)` leaves exactly one current year; raw `is_current` writes are denied; `admin_delete_master('companies'|'course_sections'|'academic_years', uuid)` requires Active Admin authority; company/section deletion reports affected intern references and clears them in the same transaction; and a current academic year cannot be deleted. Do not apply this migration to a real project as part of this remediation session.

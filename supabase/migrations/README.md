# Versioned upgrade path

New empty projects: review/apply `../initial_schema.sql` once, then the structural
M01-M15 migrations in numeric order before creating accounts. M16 is optional
legacy operational infrastructure; retain it where already installed. See `../../WEB_SETUP.md`. This does not
change the inspection, repair-review or deferred validation gates below for
existing projects. The new initial catalog is locally rehearsed, not live-verified.

Do not run `../schema.sql` or the legacy policy patch to repair an existing project.
Migrations here are reviewed SQL deliverables; none are executed against a real
project by this session. Use the ordered gates in `../RUNBOOK.md`. Do not apply
files by glob or assume a bootstrap reset is a rollback.

| Order | Migration | Prerequisites / impact |
|---|---|---|
| 1 | `M01_authority.sql` | Baseline 12-table catalog reviewed; trusted postgres owns tables/helpers; expected signup trigger active; no unreviewed exposed views/definer functions/domain/Auth triggers or restrictive Storage policies. Replaces old policies and grants in one transaction; adds nullable columns, does not rewrite legacy rows. |
| 2 | `M02_trusted_audit.sql` | M01; trusted mandatory row audit, no browser audit writes; persisted review note and locked per-item bulk RPC. Legacy audit provenance unchanged. |
| 3 | `M03_attendance_integrity.sql` | M02; read-only phase2 inspection and separately reviewed legacy disposition. Stops on duplicate daily/open/Pending identity. Unique indexes, NOT VALID CHECKs, future-write triggers, serialized server clock capture. Maintenance window required. |
| 4 | `M04_private_documents_bucket.sql` | M01 Storage policies and reviewed existing bucket. Explicit private/MIME/size UPDATE. Independent of M03 legacy gate; may be scheduled after M01 if M03 is blocked. Preserves objects and unrelated buckets. |
| 5, deferred | `M05_validate_attendance.sql` | M03/M04; repeat inspection and explicitly reviewed historical repairs, if any. No guessing/backfill. VALIDATE only clean history; failure leaves M03 new-write enforcement intact. |
| 6 | `M06_rubric_hours.sql` | M01-M04; read-only Phase 4 inspection/review. NOT VALID target/rubric CHECKs, authoritative evaluation RPC and retry identity. M05 may remain deferred. No old score/criteria/target rewrite. |
| 7 | `M07_account_lifecycle.sql` | M06; aborts incompatible role/assignment/missing-extension history unchanged. Atomic Admin lifecycle/assignment, deferred relationship guards; protected raw writes revoked. |
| 8 | `M08_document_versions.sql` | M07 + exact M04 bucket settings; inspect Storage metadata size/mimetype and existing other-bucket DELETE ACL/policies. Duplicate requirements abort unchanged. Adds unique identity, receipt/version/event tables, constrained Storage cleanup and versioned review/access. Legacy evidence stays version zero. |
| 9, deferred | `M09_validate_domain.sql` | M06-M08; independently reviewed clean historical targets/rubrics. VALIDATE + evaluation score NOT NULL only; failure retains M06 new-write checks and original data. Independent of the M05 attendance gate. |
| 10 | `M10_master_data_lifecycle.sql` | M02/M07; guarded master-data deletion and atomic current-year selection. |
| 11 | `M11_attendance_year_workflows.sql` | M01-M10 structural operations; new nullable year references and immutable domain snapshots, per-year checklists, expected-evidence attendance verification. No historical year backfill. Referenced years retained. M05/M09 remain independent historical validation gates on existing projects. |
| 12 | `M12_section_announcements.sql` | M11; section recipient snapshots and author-scoped submission UUIDs. Raw announcement INSERT is revoked; deploy the RPC-based client after this migration. |
| 13 | `M13_attendance_verification_precision.sql` | M11 (normally after M12); fixes expected-hours comparison after browser JSON conversion. Full timestamp comparison, permission checks, interval constraints, and stored hours remain intact. No data rewrite. |
| 14 | `M14_last_active_admin.sql` | M07 (normally after M13); prevents role/status changes or profile deletion from removing the final Active Admin. Allows a handover when another Active Admin exists and retains the zero-admin first-Admin bootstrap. No data rewrite. |
| 15 | `M15_dashboard_metrics.sql` | Trusted postgres and M14, with prior structural migrations. Adds RLS/security-invoker metrics and Intern charts, authenticated-only EXECUTE, fixed search paths and owner/year indexes. No history rewrite; deploy SQL before the new metric client. |

| 16 | `M16_admin_operations.sql` | Trusted postgres, M15 and provider service_role. Adds durable server-only import/backup jobs, private row outcomes/email reservations, summary-only Active Admin reads, service-only prepare/claim/reconcile RPCs and transactional redacted audit. No existing data rewrite. |

The focused browser client requires the structural migrations through M15.
M16 is retained for earlier server-only operational jobs and history; no UI calls
those operations. This scope cleanup introduces no migration or database change. M13 corrects
fractional-hour verification and M14 protects final-Admin availability. Apply only
missing reviewed files: a catalog and ledger verified through M14 needs M15 for core browser workflows;
through M15 needs no SQL for this cleanup. Leave already-installed M16 intact.
M05/M09 remain independently gated historical validations. See
`../../FUNCTIONALITY_FIX_REPORT.md` and the read-only
`../inspection/05_workflow_readiness.sql` for catalog/definition/grant review.
Installation indicators alone do not replace the operator ledger.
Use a maintenance window and rehearse on a
disposable project before deploying SQL and client together. Old clients using
raw announcement INSERT will fail after M12; the five-argument assignment RPC
remains compatible. Existing NULL academic years are preserved; assigning a year
does not reclassify old hours/documents. Read `../../WORKFLOW_CHANGE_REPORT.md`.

M01's preflight stops on unexpected ownership, privileged routines, exposed views,
extra domain/Auth triggers or restrictive Storage policy drift. Resolve drift in
a separately reviewed proposal before rehearsal; never simply remove the guard.
All old policies on the 12 tables are replaced, including unknown permissive ones.
Existing Storage policies are restricted to buckets other than documents; existing
other-bucket predicates/grants are preserved, with SELECT/INSERT granted as needed
for the new document operations. M01 adds no Storage UPDATE/DELETE grants.
The new documents policies require Active status, own insertion or assigned current
evidence reads. No documents UPDATE/DELETE policy is added. Actual bucket privacy
is addressed separately by M04; public delivery bypasses private-object RLS.
M08 subsequently replaces path-only upload/review RPC access, grants Storage
DELETE for the API and permits documents deletion only for the active owner's
abandoned, uncommitted receipt. Restrictive guards block document overwrites,
anonymous access and permissive-policy bypass. Review unrelated-bucket DELETE
policies before the table grant; no global allow policy is added. Use Storage API
to remove file bytes, never SQL deletion of provider metadata.

Schema deployment must precede the new client build: App requires `my_profile`,
Intern uses clock/correction/upload RPCs and Instructor uses review RPCs. Older
clients will receive denied raw-write errors after M01; coordinate their refresh.
Apply only once using a reviewed migration ledger. The M01 file's human version
label must be mapped to a timestamp filename by an operator before adopting
Supabase CLI migration tracking; do not assume `supabase db push` discovers M01.

Rehearsal: `npm test` uses a fresh in-memory Postgres engine, synthetic Auth/Storage
tables and `../tests/baseline.sql`; it never reads/runs bootstrap. Supabase HTTP,
real grants/owners, JWT session behavior, PostgREST FK embedding and private object
delivery require separate disposable project verification in `../tests/M01.md`
and `../tests/PHASE2.md` and `../tests/PHASE4.md`. Phase 2 also starts a fresh loopback-only native Postgres
17.10 cluster with synthetic Auth/Storage tables for real separate-connection
race/fault tests. It accepts no external database URL/credentials and removes
only its verified disposable directory after stopping the process.

M01-M16 are human version labels, not automatic Supabase CLI timestamp discovery.
Record exact reviewed file hashes in the operator migration ledger; convert each
to a timestamp filename only as part of a reviewed CLI adoption. Future migrations start after M16; do not reuse committed version numbers.

Rollback: before commit SQL errors roll back the transaction. After commit disable
affected operations and apply a reviewed forward repair while keeping authorization
closed. Preserve all added evidence/recipient/timestamp columns. Do not restore
legacy self-promotion, global instructor policies or public EXECUTE defaults.

Phase 3 changes bootstrap/legacy-patch comments and operator/client guidance only;
it adds no database migration and executes no SQL. Legacy bootstrap is fresh-
disposable-only, destructive and insufficient for a remediated deployment alone.
Never treat its hardcoded example seeds as current live organization/year data.
The earlier download checks in ../tests/PHASE3.md are historical; current reader
and scope coverage is described in ../../tests/README.md.

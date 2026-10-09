> Historical record: this document describes an earlier release or task.
> The current INSync.v3 scope is defined in [PROJECT_SCOPE.md](PROJECT_SCOPE.md).
> Reporting/export, bulk-import, backup UI and certificate issuance are outside the current user-facing scope.

# INSync deployment preparation and completed features

Date: 2026-10-09 (Asia/Manila). Hosting requested: Vercel. This follows the
[previous functionality report](FUNCTIONALITY_FIX_REPORT.md) and preserves that
dated baseline. The user requested completed bulk onboarding and manual backups,
with no placeholder features in the deployment GUI.

## Current result

Bulk onboarding, manual-backup jobs and the remaining informational report/archive
downloads now have local implementations. Permanent unavailable buttons/cards
were replaced. The former uptime placeholder is an actual Pending Accounts count.
**This is deployment preparation, not a live deployment or a verified restore.**
No repository push, Vercel publication, remote SQL, real invitation email, live
account creation or live file/backup mutation was performed. Existing local work
and the user's master prompt were preserved. GUI polishing can proceed against
these implemented workflows; public release still requires the configuration and
disposable-provider checks below.

| Workflow | Implemented behavior | Important boundary |
|---|---|---|
| Bulk onboarding | Strict CSV preview, Auth duplicate check, durable job/row identities, batches, pause/continue/stop, result recovery and invitations | CSV: 200 rows / 256 KB. All created accounts are Pending interns; requested Instructor role needs the existing Admin approval. No passwords or effective roles in CSV. |
| Retry/partial imports | Atomic row claims, account lookup after a lost response, unique pending-email reservation across job IDs, retained uncertain writes | Never automatically resend an uncertain invitation. Stop cancels only unstarted rows; it does not delete identities or audit. Invitation acceptance does not prove inbox delivery. |
| Manual backups | Admin request/cancel-queued/status controls, GitHub dispatch, atomic/fenced worker claim, encrypted SQL/private-document snapshot, confirmed artifact status and provider reconciliation | GitHub secrets, DB connectivity and artifact delivery must be configured/tested. A client CSV is never presented as a backup. |
| Intern downloads | CSV/Excel DTR, current assignment progress, current-year evaluation evidence and weekly hours with source IDs | Weekly groups separate academic years and mark invalid evidence Unknown. Stored precision is preserved. |
| Instructor downloads | CSV/Excel scoped roster progress, current-assignment-year evaluations and shared-rule At Risk/Unknown report | Existing section/year filters and RLS apply; no invented historical membership or passing-score policy. |
| Document archive | Owner-only, selected academic year, current uploaded versions, ZIP and version manifest | 50 files / 50 MiB, 10 MiB per file, shared deadline, byte delivery failure aborts; access/version/review revision and account identity rechecked. |
| Release configuration | Vite/Vercel routing, 60-second Admin API, server-only secrets, redacted server error logs, M16 inspection and instructions | No secrets are embedded in browser bundles. No uptime or successful restoration is fabricated. |

Official certificate issuance and historical-placement policy remain uncommissioned;
there are no fake issuance/history controls in the GUI. Clearance eligibility is
still calculated by the existing verified-hours/current-requirement rules.

## 1. Review and apply only missing database migrations

1. Keep an operator backup and the actual project's migration ledger.
2. Generate reviewed local hashes: `node scripts/migration-manifest.mjs`.
3. Run [05_workflow_readiness.sql](supabase/inspection/05_workflow_readiness.sql)
   read-only as postgres. Compare definitions/owners/search paths/grants/RLS,
   triggers, bucket privacy, indexes, Active Admins and the current year.
4. If the project is **verified through M15**, apply
   [M16_admin_operations.sql](supabase/migrations/M16_admin_operations.sql) once.
   If verified only through M14, apply **M15 then M16**. Other installations need
   their actual missing prerequisites. Never replay initial_schema on existing data.
5. Run the inspection again. M16 browser INSERT/UPDATE/DELETE must be false;
   payload/row tables and identity helpers stay server-only. Only summary columns
   are granted to authenticated accounts, with Active Admin RLS.

M16 adds admin_operations/onboarding_rows, recent-job and pending-email indexes,
service-only prepare/claim/lookup/reconcile routines and transactional redacted
audit. No existing attendance, assignment, document or Auth identity is rewritten.
Failure before COMMIT rolls back. After commit retain evidence and fix forward;
disable affected API operations if necessary. Never drop jobs or loosen grants to
clear an uncertain result.

## 2. Configure Vercel

Import the repository as a Vite project. Build: `npm run build`; output: `dist`;
Node: supported 22.12+ (24 recommended for this worker/tooling). The checked-in
[vercel.json](vercel.json) keeps `/api/` and assets outside the SPA rewrite and
sets `api/admin-operations.js` to 60 seconds. Browser waits and server HTTP calls
are bounded; a timeout never proves a write was cancelled.

Set these in the intended Vercel environment, then redeploy that environment:

| Variable | Where / purpose |
|---|---|
| VITE_SUPABASE_URL | Public browser project URL |
| VITE_SUPABASE_ANON_KEY | Public publishable/anon key |
| VITE_DEMO_MODE | `false` |
| APP_ORIGIN | Exact canonical HTTPS origin, e.g. `https://YOUR-DEPLOYMENT.vercel.app`, **without trailing slash** |
| SUPABASE_URL | Same project URL, server-only configuration |
| SUPABASE_SERVICE_ROLE_KEY | Server-only service-role key; no VITE_ prefix |
| BACKUP_GITHUB_TOKEN | Repository-scoped GitHub token/App token with Actions read/write; server-only |
| BACKUP_GITHUB_REPOSITORY | Repository containing the backup workflow, e.g. `x1n-yue/INSYNC.V3` |
| BACKUP_GITHUB_REF | Protected deployed branch/tag, e.g. `main` |

The API validates Origin/content type, verifies the bearer JWT with Auth, checks
the actual Active Admin profile and uses service-only job routines. Imports
recheck Admin status at every atomic row claim. The worker rechecks the requesting
Admin before claiming a backup. Rate limit: 20 new jobs globally/hour; only one
queued/running backup. Reusing the same ID returns the existing job; conflicting
content/actor is rejected.

Use one canonical production origin. Redirect alternate domains to it. Preview
deployments must use a separate disposable provider and environment secrets, not
production data. `npm run dev` serves the browser; administration endpoints need
Vercel's local development runtime or a configured disposable Vercel deployment.
A static-only Vite preview cannot run the server endpoints and shows a setup error.

## 3. Configure invitations and recovery

In Supabase Auth, set Site URL to the canonical app. Allow the exact root URL and
`/?flow=recovery` callback. Configure SMTP, invite/reset/confirmation templates,
quotas and session/password policy. The invitation opens the existing authenticated
password-setting flow before the Pending activation screen. Keep confirmation
and the normal Admin approval lifecycle enabled.

CSV headers must exactly match the downloaded Intern/Instructor CSV template.
Import accepts CSV; XLSX is a report output, not an import input. Preview is
read-only and sends no emails. Sending provisions Pending accounts and requested
roles only. Existing emails are skipped without account mutation. A profile-only
identity/role is never silently merged into a different Auth identity.

Inspect durable jobs after a reload or uncertain response. Continue processes
unstarted rows; the UI pauses automatic batches on uncertain results. Stop marks
only ready rows cancelled. Uncertain rows keep their email reservations; another
job ID cannot replay them. SQL reconciliation can confirm a late Auth commit.
If still unknown, an operator must inspect Auth/provider evidence before a reviewed
forward resolution; there is no unsafe reset-to-ready button.

## 4. Configure the real backup worker

The workflow is [.github/workflows/insync-backup.yml](.github/workflows/insync-backup.yml).
It must exist on the dispatch ref and GitHub's default branch. Enable Actions and
create the `insync-backup` GitHub environment, protected to the intended release
branch. Configure its environment secrets:

| GitHub secret | Purpose |
|---|---|
| SUPABASE_URL | Same project as Vercel |
| SUPABASE_SERVICE_ROLE_KEY | Private file access and durable job status |
| BACKUP_DATABASE_URL | Trusted Postgres/session-pooler connection permitting a complete logical dump, Storage-catalog reads and an exported snapshot; use verified TLS |
| BACKUP_ENCRYPTION_KEY | Independent random 32-byte key encoded as 64 hexadecimal characters; escrow separately in the operator's password manager |

No database URL or encryption key is needed in Vercel or the browser. Keep the key
available independently of the repository; a backup without its key cannot be
restored. Name an owner for key rotation, GitHub token renewal, backup failures,
artifact expiry and restoration. Review artifact/storage costs and provider access.

The worker uses a Postgres 17 Docker client (compatible with older server majors;
upgrade the pinned client before targeting a newer server major). Verify the actual
server version and connection first. It uses an exported repeatable-read snapshot
for the SQL dump and Storage catalog, then captures actual **documents** bucket
bytes. All stored objects in that bucket are included, including old versions and
staged evidence. Limits: 10,000 objects / 5 GiB, 10 MiB per file, 30-minute job;
missing files or limits fail visibly. Other buckets and external services are
explicitly excluded. Use an approved write-maintenance window to avoid concurrent
file replacement/deletion; a database snapshot cannot freeze external file bytes.

The archive contains database.dump, manifest.json and ID-named files. The manifest
maps original private names to byte sizes and SHA-256 hashes. AES-256-GCM encryption
uses a fresh IV and authenticated ciphertext. Only encrypted bytes are uploaded;
plaintext temporary files are removed. GitHub artifacts retain them for **7 days**;
copy verified encrypted artifacts to approved longer-term storage if policy requires.
This is the implemented default, not an approved organizational RPO/RTO/retention.

Job lifecycle is Queued → Running → Completed only after artifact upload.
Duplicate dispatches cannot claim the same job twice. Worker completion/failure
writes are fenced to the claiming GitHub run. Inspect Status reconciles a finished
run's actual artifact if the finalizer response was lost. A provider read failure
retains the uncertain state. Any Active Admin can cancel a queued backup; that
atomic update cannot cancel a dump already claimed. Running jobs expose their
workflow link. GitHub operators retrieve the encrypted artifact; the app never
exports provider secrets or a decryption key.

## 5. Rehearse restoration before public release

Use the disposable procedure in [OPERATIONS_RUNBOOK.md](supabase/OPERATIONS_RUNBOOK.md).
The SQL dump includes Auth identities, ACLs, schema/functions, RLS, document
metadata and audit; provider-managed roles/configuration/secrets require separate
recovery. A Supabase destination already contains managed schemas. Do not blindly
run a destructive pg_restore over it; review the provider's supported recovery
procedure and owner/role mappings for the chosen disposable destination.

1. Make a synthetic backup with known accounts, NULL/old/current-year evidence,
   document versions and known private file bytes. Record job/run/artifact IDs.
2. Download and extract the encrypted artifact outside the source checkout.
3. Supply the escrowed BACKUP_ENCRYPTION_KEY in the local process environment.
   Run `node scripts/decrypt-backup.mjs encrypted-file new-output.tar.gz`.
   The command refuses existing output and removes unauthenticated partial output.
4. Verify authentication, inspect the tar/manifest and validate every file's
   length/SHA-256 before recovery. Restore SQL using reviewed provider instructions.
5. Restore file bytes to the exact original private bucket/path through the
   provider's supported Storage recovery route. Preserve restored version/path/
   owner metadata; use the manifest MIME data. Do not SQL-delete Storage metadata
   or blindly overwrite immutable version paths to make a restore appear successful.
6. Re-run catalog/RLS/role checks and actual authorized downloads. Confirm counts,
   hashes, historical-year exclusion, audit, current document reviews, Auth login,
   Pending approval and last-Admin guards. Measure recovery-point age and elapsed
   restore time. Record limitations and approved operational targets.

Local crypto round trips and fresh/upgrade SQL tests are **not** this restoration
rehearsal. No pg_dump/provider artifact upload/real restoration has been executed
in this session; the workstation does not have pg_dump installed. No real browser
or screen-reader/provider end-to-end check was available.

## Monitoring and release checklist

Vercel receives redacted structured server error events containing only an event
name/time; request bodies, exception/provider text and credentials are excluded.
Existing removable browser `insync:health` hooks remain available. Configure the
actual alert destination/owner and hosting/GitHub monitoring: API failures, worker
failures/stuck jobs, token expiry and age of the latest successful backup. No
client uptime percentage is invented, and no external collector was connected here.

- [ ] Inspect the real migration ledger and apply only missing M15/M16/prerequisites.
- [ ] Configure Vercel/GitHub secrets and exact Auth URLs; deploy the reviewed revision.
- [ ] Verify 401/403 boundaries for signed-out, Intern, Instructor and Inactive Admin.
- [ ] Preview a synthetic CSV with invalid rows/duplicates; invite a disposable user,
      set its password and verify Pending approval/role assignment. Test pause, reload,
      stop, lost-response reconciliation and no repeated email for uncertain rows.
- [ ] Request a disposable backup, confirm encrypted artifact/status/expiry, inject
      a finalizer failure, and reconcile status. Rehearse restoration and hash checks.
- [ ] Exercise the existing attendance/document/announcement/recovery/audit journey,
      including typing during refresh, historical-year exclusion and Admin handover.
- [ ] Open CSV/XLSX/ZIP artifacts, verify role/year/section scope and literal formulas.
- [ ] Run keyboard/mobile/browser checks, connect alerts and record operational owners.
- [ ] Run `npm run verify:release`; retain a sanitized result and release ledger.

## Local verification

The starting checkout passed 22 files / 2,291 tests, lint, build and dependency audit.
Focused checks now cover strict CSV parsing, preview/no-email behavior, per-row
retry/stop/reconciliation, cross-account responses, API authentication, low API
caps, encrypted byte round trips/tampering, private archive failures, real native
M16 grants/RLS/audit rollback/upgrade preservation and concurrent backup claims.
Final complete-suite results are recorded below after validation.

Implementation files: api/admin-operations.js; server/adminOperations.js;
src/components/AdminOperations.jsx and all three dashboards; src/lib/onboarding.js,
adminOperations.js and exports.js; M16 and inspection; backup worker/crypto/decrypt
scripts; GitHub workflow, Vercel configuration and public-placeholder env guide.
fflate moved from a dev dependency to a lazy runtime archive dependency; no new
library version was introduced.

Provider references: [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration),
[GitHub workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event),
[GitHub artifact status](https://docs.github.com/en/rest/actions/artifacts#list-workflow-run-artifacts),
[artifact upload](https://github.com/actions/upload-artifact),
[Supabase invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail),
[Supabase recovery](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

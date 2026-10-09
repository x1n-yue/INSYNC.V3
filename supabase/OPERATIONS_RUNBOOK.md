> Operational reference, outside the application UI. The current product scope is
> [PROJECT_SCOPE.md](../PROJECT_SCOPE.md). Existing provider/worker recovery tooling
> and durable job records are retained; the browser no longer exposes import or
> backup controls. Instructions for those earlier UI journeys below are historical.
> Provider backups and restoration remain operator responsibilities.

# Release, backup and monitoring operations

Local implementation artifacts only. Provider configuration, actual backups,
physical Storage files, real email delivery and restoration remain unverified.
Use RUNBOOK.md and the migration guide for existing-data deployment gates.

The Vercel/GitHub manual backup implementation and exact configuration/recovery
steps are in [DEPLOYMENT_READINESS_REPORT.md](../DEPLOYMENT_READINESS_REPORT.md).
The procedure below still requires a real disposable-provider rehearsal.

## Responsibilities and approved targets

Before operational reliance, name a release owner, database/Storage restore owner,
incident responder and email/hosting owner. Record the actual provider plans,
backup retention, recovery-point objective (maximum acceptable lost changes) and
recovery-time objective (maximum acceptable outage). Do not infer these from the
presence of a Backup button. No recovery target is approved by this document.

## Readiness and migration record

1. Record the intended Supabase project and deployed Git revision privately. Review
   initial_schema and M01-M16 prerequisites, including deferred M05/M09 gates.
2. Generate local reviewed-file hashes with `node scripts/migration-manifest.mjs`.
   Compare them with the operator's successful migration ledger. File presence or
   RPC presence alone is not an installation record.
3. Run `inspection/05_workflow_readiness.sql` as the database owner. It is read-only;
   review exact definitions, owners/search paths, API EXECUTE, RLS/policies/grants,
   bucket limits/privacy, administrator/current-year counts and M15 indexes.
   Compare results with a rehearsed catalog. Keep actual identifiers private.
4. Prepare an explicit list of only missing reviewed migrations. If already through
   M14, this release adds M15 then M16; through M15 adds M16 only. Apply no file automatically from this document.
   Rehearse the selected upgrade with existing-history fixtures before rollout.
5. Apply reviewed SQL before the corresponding client release. Missing M15 makes
   new metric/summary screens visibly unavailable; do not bypass this with invented
   zero totals or an unrestricted fallback. Keep authorization closed on failure.
6. Preserve an operator snapshot, hashes and deployment outcome. SQL errors before
   COMMIT roll back. After commit use a reviewed forward repair; do not drop evidence
   or restore unsafe grants. Reverting the client does not roll back stored data.

## Database and Storage recovery rehearsal

1. Inventory actual database backup/PITR availability and expiration in the provider
   console. Confirm whether Auth, extensions, policies, routines and configuration
   are restored by that facility. Record known exclusions.
2. Inventory Storage object bytes and object metadata separately. Confirm the file
   backup facility, encryption/access controls, versions, retention and restore
   procedure. A database dump or restored storage.objects row does not prove the
   corresponding bytes can be downloaded.
3. Choose a separately approved disposable destination; verify project identity
   before every restore. Disable outgoing email/jobs and prevent real users from
   reaching it. Use synthetic accounts/files for rehearsal evidence.
4. Create representative synthetic assignments, historical/NULL-year attendance,
   verification/correction, current and prior document versions/reviews, evaluations,
   announcements with recipient snapshots, and audit records. Create a restore point.
5. Make recognizable post-snapshot changes. Restore by the selected provider's
   supported procedure, then restore file bytes using the documented file process.
6. Re-run metadata inspection and authorized API checks. Reconcile counts, version
   IDs/paths, trusted timestamps, retry identities, file-byte hashes, private access,
   Auth behavior and active-Admin availability. Distinguish expected point-in-time
   data loss from accidental omissions. Never validate by publicizing the bucket.
7. Measure elapsed restore time and the actual restore-point age against approved
   targets. Keep a sanitized result, responsible operator, date, exceptions and
   next rehearsal date. Local PostgreSQL tests do not satisfy this provider rehearsal.

## Monitoring integration

The client emits `insync:health` browser events with **only** `kind` and UTC `at`.
Kinds: render-error, unhandled-error, unhandled-rejection, offline and online.
The root Error Boundary offers explicit reload. Global listeners are removable;
no collector, external delivery or alert destination is configured automatically.

A hosting-specific observer may subscribe to these events and record an approved
release ID and coarse environment. Do not attach raw errors/stacks/URLs, Auth
tokens, emails, document paths/bytes, accomplishment text or draft content. Decide
retention and sampling before enabling external delivery. Client events alone do
not establish uptime: configure host/provider availability/error-rate monitoring
and assign a responder. Test collector outage without blocking user workflows.

Example local observer (does not transmit anything):

```js
const receive = event => console.info('INSync health', event.detail.kind, event.detail.at);
window.addEventListener('insync:health', receive);
// Cleanup when the observer is removed:
window.removeEventListener('insync:health', receive);
```

## Release smoke test

Run `npm run verify:release` locally. It runs tests, lint, build, the dependency
advisory check and Git whitespace checks; it does not deploy or connect to Supabase.
Review the results and current report, then separately authorize provider changes.

With disposable live accounts/files after deployment, verify:

- Signup/confirmation/resend, activation recheck, reset email, expired-link recovery,
  password change, sign-out errors and correct allowed callback URLs.
- Admin assignments and section/year labels; own/assigned/unrelated/inactive access;
  last-Admin handover and rejection.
- Same-user session refresh while typing; account-switch isolation; clock-in/out,
  ordinary verification, correction review, refreshed progress and historical-year
  exclusion. Check midnight/noon/overnight AM-PM input.
- Private document upload/reservation/review/replacement, signed-link delivery,
  failed cleanup and uncertain-commit recovery with actual file bytes.
- Announcement lost response/reload reconciliation without a duplicate send;
  current section audience; account-scoped drafts; sign-out cleanup.
- Lists above the configured row cap, attendance paging, audit filters/Previous/
  Next/Refresh, current-assignment progress CSV scope and literal spreadsheet text.
- Keyboard focus/dismissal/return, mobile layouts, real screen-reader behavior,
  offline recovery, monitoring delivery and the separate restoration rehearsal.

Do not label unexecuted checks passed. Record actual browser/device/provider
versions, timing, operator, release and limitations without secrets or private data.

Provider references: [Supabase backups](https://supabase.com/docs/guides/platform/backups),
[Storage overview](https://supabase.com/docs/guides/storage),
[Auth redirects](https://supabase.com/docs/guides/auth/redirect-urls).

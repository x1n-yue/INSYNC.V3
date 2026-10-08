# Phase 2 verification and remaining live checks

Executed locally only; no real Supabase credentials/project/bootstrap involved.
`npm test` runs the M01 policy matrix, regression/transport helpers, migration gates
and native `tests/phase2-postgres.test.js`. Fixtures are entirely synthetic.

Native harness: pinned embedded-postgres 17.10.0-beta.17 platform binaries + pg
8.23.1, custom hidden child processes, fresh ignored `.test-postgres/synthetic-*`,
random loopback-only port and ephemeral password. No external URL/env credentials
accepted; no OS user/service created. Never run as root; use an ordinary OS user.
Stop server, close clients and verify resolved paths before recursive cleanup.
Install platform optional dependencies/scripts on a supported machine; absence of
native binaries is a failed/pending test, not a skipped passing race test.

The fixture models SQL Auth UID and Storage metadata only. It does not implement
JWT verification, Auth signup HTTP, PostgREST, object delivery, or MIME/size upload
enforcement. Bucket assertions verify persisted configuration, not Storage API behavior.

| Regression | Automated evidence |
|---|---|
| INS-009 / RT-12/20 | API roles including Admin cannot insert audit/call trigger helper. Actor/time/source/changed fields server-bound; zero-row/no-op events absent. CRUD master/profile/assignment/evaluation/document/attendance events checked. Audit failure aborts business mutation. Legacy provenance never backfilled. |
| RT-11 | Missing-day insert and existing-day correction both reconcile; accomplishment/id preserved; trusted reviewer/time/hours. Repeated decision rejected. Required persisted rejection note and limits. |
| RT-12 | Fail attendance insert/update, exception update, final exception audit; no Approved request, lost original row, orphan new attendance or partial audit. Failed bulk item rolls back its reconciliation/audit; other successful item commits. |
| RT-13 | Separate native connections are observed simultaneously waiting in pg_stat_activity before releasing the intern lock. Repeated approve/reject, approve-vs-reject, clock-in/out, Pending-submission races each have one winning transition. Concurrent deactivation/reassignment while waiting denies stale review. |
| RT-08/09/10 | Trusted clock owner/date/instant/duration and ID-only closure; repeat/foreign/zero-target rejected; future/empty/oversized reason, ambiguous/equal/excessive intervals rejected. Explicit overnight (2h), max 16h and one second retain correct duration. |
| M03/M05 legacy gates | Duplicate daily/open/Pending groups block without row changes. Ambiguous clock history remains unchanged; NOT VALID checks protect new writes while VALIDATE fails. Future legacy/unreconciled Approved history stops separate validation. Missing bucket stops M04. |
| INS-015 | Existing public documents bucket explicitly becomes private with 10 MiB / three MIME types; other bucket unchanged. M01 SQL suite still verifies object RLS scopes. |
| Client regression | Bulk deduplication, mixed outcomes, missing/foreign/inconsistent responses and thrown errors never become success. Manila midnight/device-independent dates, trusted open session across midnight, legacy unknown elapsed and wrong device clock. |

Pending disposable Supabase verification (operator only, no real students):

1. Inspect catalog/ACL/helper ownership/search_path/extra policies, install exact
   reviewed migration versions in runbook order, separately gate historical
   validation. Confirm actual numeric/time/timestamptz types match the fixture.
2. RT-08..13 using SDK/REST with genuine JWTs and two independent clients: active
   assigned teacher/Admin success; foreign/unassigned/non-Active/anonymous denied;
   both old/new ownership, date, reviewer, status and audit tampering denied.
   Compare committed records/events after every failure, race and lost response.
3. Trigger-fault rehearsal on disposable project only: attendance update/insert,
   exception transition, audit insert failures and whole-transaction abort. Remove
   only the synthetic injection trigger afterward; never disable required audit.
4. Race clock/correction/review at Manila midnight; find previous-day open session;
   clock-out cannot overwrite closed/verified row. Verify PostgreSQL default
   statement/lock timeouts and PostgREST composite/bulk result shapes.
5. RT-04/15: known-path anonymous public URL fails after M04; actual bytes remain.
   Active owner/assigned staff private access allowed, foreign/non-Active denied.
   Upload PDF/JPEG/PNG within 10 MiB succeeds; oversized/unsupported MIME fails.
   Verify size boundary at limit/+1 byte and existing legacy objects are retained.
   Signed URL expiry/download UI verification waits for Phase 4 implementation.
6. Browser offline/conflict/busy controls, rejection-note draft retention, retry,
   bulk failed selection retention, Manila date/time on non-Manila device, legacy
   unknown session display, disabled fake backup/import and legacy audit label.
   Keyboard/mobile/screen-reader verification remains pending Phase 6.

Useful primary references: [PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html),
[unique-index checks](https://www.postgresql.org/docs/17/index-unique-checks.html),
[NOT VALID / VALIDATE](https://www.postgresql.org/docs/17/sql-altertable.html),
[embedded-postgres upstream](https://github.com/leinelissen/embedded-postgres).

No claim of deployed security, certified historical data or production readiness.

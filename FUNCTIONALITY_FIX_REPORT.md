> Historical record: this document describes an earlier release or task.
> The current INSync.v3 scope is defined in [PROJECT_SCOPE.md](PROJECT_SCOPE.md).
> Reporting/export, bulk-import, backup UI and certificate issuance are outside the current user-facing scope.

# INSync functionality fix report

Follow-up (2026-10-09): the user requested complete bulk onboarding and backups
with Vercel hosting. These workflows and informational report/archive downloads
are now implemented locally. See [DEPLOYMENT_READINESS_REPORT.md](DEPLOYMENT_READINESS_REPORT.md)
for the current status and configuration. The dated record below preserves the
prior scope; live delivery/restoration and official issuance/placement policy
remain unverified or undecided.


Date: 2026-10-08 (Asia/Manila). Local checkout baseline: 183cb69.
This follows the dated [functionality audit](SYSTEM_FUNCTIONALITY_AUDIT.md).
Its original findings and counts remain preserved; the links added there point here.

## Result and scope

Implemented local fixes for list completeness, server metrics, account recovery,
dashboard crash recovery, bounded operations, announcement reload recovery,
accessibility, correction time entry, audit history, informational progress reports,
and draft-safe refresh. Added one forward migration, **M15**. Existing successful
migrations were not rewritten.

**Nothing was deployed or live-verified.** No push, publication, production SQL,
real email, live account mutation or real Storage-file mutation was performed.
The user's preexisting MASTER_FUNCTIONALITY_FIX_PROMPT.md was preserved.

R09 is partially implemented; its official/import/archive/certificate/backup scope
awaits product decisions. R13 awaits historical-placement and editing policy.
R01/R08 and provider/browser portions of other items await authorized disposable
provider access and operational configuration. These dependencies do not disappear
because local tests pass.

## Item-by-item accounting

In this table, "local" means implemented and tested in this checkout. It never
means deployed. All items still require the relevant release/provider smoke checks.

| Item | Status and evidence | Changed files | Tests | Remaining dependency | Deployment action |
|---|---|---|---|---|---|
| R01 Deployment readiness | Local inspection/release artifacts ready; live verification awaiting access. Inspection now includes definitions, ownership/search paths/EXECUTE, RLS/policies/grants, domain/Auth triggers, private bucket settings, Admin/year counts and M15 indexes. | supabase/inspection/05_workflow_readiness.sql; scripts/migration-manifest.mjs; scripts/release-check.mjs; package.json; eslint.config.js; setup/runbooks | Native SQL executes the read-only inspection against the complete synthetic catalog; manifest prints 15 unique ordered file hashes. | Actual project ledger/catalog, provider settings and operator identity. No live missing-migration list is claimed. | Run the inspection and compare exact definitions and reviewed hashes; apply only missing files. If confirmed through M14, add M15 only. |
| R02 Incomplete lists | Local. Stable UUID traversal/count reconciliation handles small API caps; visible detail pages fill 50 records across short responses. Errors and bounds are visible. Secondary reads include master data, evaluations, corrections, alerts, years, announcements, related names and unfinished-upload RPCs. | src/lib/exports.js; workflows.js; dashboard.js; all three dashboards | Low-cap fixtures, multiple pages, exact-count SDK RPC headers, scoped rows, truncation/drift/identity rejection, failed reads and retry/refresh coverage. | Actual PostgREST cap/count behavior remains unverified. Reads are bounded, not transactional snapshots. | Deploy client after M15; test disposable data above the actual cap. Do not raise the cap as a repair. |
| R03 Scalable metrics | Local SQL/client implementation. RLS-scoped security-invoker RPCs aggregate current-assignment progress/checklists/clock state/latest evaluation and Intern chart buckets; detail attendance loads separately. Unknown evidence stays unknown. | supabase/migrations/M15_dashboard_metrics.sql; src/lib/dashboard.js; assignments.js; all dashboards | Native role isolation, anonymous/inactive rejection, UUID pagination, shared-rule equivalence, fractional precision, malformed evidence, approvals/revocation/revision/custom requirements and four chart periods. Transfer/request measurements below. | M15 installation and representative live query plans/load testing. Full roster metadata still uses bounded complete reads. | Apply reviewed M15 before client; inspect owners, fixed paths, EXECUTE, RLS and indexes; exercise each role. |
| R04 Account recovery | Local. Forgot-password, confirmation resend, recovery callback/page, authenticated password update, generic eligibility responses, 60-second email-request cooldown and bounded waits. Invalid/expired callbacks have a recovery path. | src/lib/accountRecovery.js; components/LoginPage.jsx; RecoverPassword.jsx; App.jsx; WEB_SETUP.md | Generic success/rate-limit/failure, stalled email, callback URLs, PASSWORD_RECOVERY transition, invalid callback, session-required update, wrong returned identity and success. | Allowed URLs, provider email templates/SMTP/quotas and real delivery; configured password/session policy. Client cooldown is not a provider rate limit. | Configure exact Site/redirect URLs and email settings; test disposable confirmation/reset flows. |
| R05 Crash recovery | Local. Root Error Boundary covers App/dashboard rendering and rejected lazy imports; offers explicit accessible reload and redacted health event. No automatic reload loop. | src/components/ErrorBoundary.jsx; src/main.jsx; src/lib/monitoring.js | Separate rendering-exception and rejected-lazy-chunk DOM cases. | Actual deployed chunk/cache/network failures and browser check. | Deploy client; test stale/missing chunks with disposable browser session. |
| R06 Bounded operations | Local. Auth/RPC waits, Storage upload/link/removal and complete traversals have finite budgets. Traversal pages share a deadline. Upload failure reconciles through the serialized server reservation before cleanup; ambiguous/failed cleanup stays recoverable. | src/lib/requests.js; documents.js; exports.js; workflows.js; dashboard.js | Stalled auth/read/link/cleanup/upload; late upload success with an already committed reservation; no evidence deletion; stopped page issuance after deadline; existing partial/count-failure export tests. | Actual SDK lock/HTTP cancellation and Storage bytes. Timeout does not prove a server write was cancelled. | Deploy client; fault-inject disposable provider writes and verify receipts/bytes before retry or cleanup. |
| R07 Reload-safe announcements | Local. Minimal per-account sessionStorage form/submission UUID is written before sending. Reload checks the authoritative author feed, clears confirmed sends, or retries original content/UUID. Snapshots remain server-derived. | src/lib/announcementDraft.js; components/InstructorDashboard.jsx; App.jsx; lib/authority.js | Lost response followed by full unmount/remount, committed-feed reconciliation without retransmit, original-UUID retry, duplicate clicks, storage failure, account isolation and expiry/cleanup helpers. Native M12 retry/audience tests retained. | Enabled tab storage and provider read/write verification. Tab closure can remove the cache; this is reload recovery, not cross-device durability. | Deploy client with M12+; exercise lost-response/reload and account switching on disposable accounts. |
| R08 Operational readiness | Local hook/runbook preparation; provider backup, collector/alerts and real restoration awaiting access/configuration. Health events contain kind/time only; observer cleanup is supported. | supabase/OPERATIONS_RUNBOOK.md; src/lib/monitoring.js; main.jsx; scripts/release-check.mjs | Redacted event payload and observer cleanup; local SQL fixtures are not backup restoration. | Actual host/plan, approved retention/RPO/RTO, named alert/restore owners, database and Storage backup facilities, disposable restoration rehearsal. | Follow operations runbook; configure provider monitoring/retention and run a separately authorized restoration. |
| R09 Unavailable workflows | Partially local. Intern/Instructor current-assignment progress CSV implemented with explicit year/section scope and informational provenance. Official reports, account provisioning/import, archives, certificates and backup control remain honestly unavailable. Concrete proposals/questions prepared. | src/lib/exports.js; InternDashboard.jsx; InstructorDashboard.jsx; FUNCTIONALITY_PRODUCT_DECISIONS.md | Fresh authorized progress CSV, assignment/identity checks, filters and spreadsheet formula escaping; existing unavailable-feature tests. | Approved templates/cohorts/provenance, import identity/duplicates/approval/recovery, archive privacy/versions/limits, certificate issuance/revocation and provider backup scope. | Deploy current CSV with M15. Resolve listed policies before implementing privileged server jobs or official issuance. |
| R10 Accessible screens | Local DOM fixes. Login and dashboard form labels associated; icon controls and correction/revision/upload controls named; rubric choices identify criteria and pressed state. Mobile navigation/profile use the shared focus-trapping Modal with Escape/focus return. | LoginPage.jsx; Shell.jsx; AdminDashboard.jsx; InstructorDashboard.jsx; InternDashboard.jsx | Label/control checks, mobile keyboard trap/Escape/return, validation pending/error states, session-refresh draft preservation and manual-refresh uninterrupted typing. | Real browser at narrow widths, touch targets/interactions, screen reader and device checks; no accessibility certification claimed. | Deploy client and execute keyboard/mobile/assistive-technology smoke tests. |
| R11 Consistent time entry | Local. Explicit hour/minute/AM-PM correction controls convert to existing canonical RPC times. Dates remain explicit for overnight shifts. Clock displays remain 12-hour; duration and stored precision unchanged. | src/components/TimeInput.jsx; InternDashboard.jsx; RefreshStatus.jsx | Midnight/noon/afternoon round trips, invalid/incomplete input/reset; retained native overnight/date/interval cases. | Actual mobile picker/layout and end-to-end correction checks. | Client deployment only; no new time schema or attendance policy. |
| R12 Useful audit history | Local. Manila date/time, authorized actor/table/inclusive-date filters, safe recorded previous/new details, preserved legacy provenance, applied-filter CSV scope and stable page/refresh navigation. | src/lib/audit.js; exports.js; components/AdminDashboard.jsx | Navigation/refresh with 55 rows, applied filters, literal injection-prone values, Manila boundaries/invalid filters and failed/truncated page handling. | Actual Admin API grants/counts, spreadsheet and large live fixture. Actor menu uses currently available profiles plus system; legacy events may lack structured fields. | Deploy client; verify Admin-only access and CSV matching applied filters. |
| R13 Historical placements | Awaiting policy; proposal prepared, no speculative schema/backfill. Current-assignment authorization and existing year/version snapshots preserved. Unknown old membership is not invented. | FUNCTIONALITY_PRODUCT_DECISIONS.md; report/runbook links | Existing native immutable-year, NULL-history, assignment authorization and version retention tests still pass. No new historical-placement behavior is claimed. | Former-Instructor access, membership transitions/overlap, old-year document editing/reopening, correction authority/evidence. | Approve policy first; implement future transitions using a new additive migration and explicit unknown history. |
| R14 Freshness/startup | Local partial performance/freshness improvements. Attendance, evaluation history, document reviewer details, announcements and audit load by screen where practical. Manual/focus/staleness refresh prompts preserve mounted forms/drafts and Admin dirty assignments. No Realtime subscription introduced. | RefreshStatus.jsx; all dashboards; lib/dashboard.js | Overview resource-path assertions, no raw Admin metric histories, section-scoped document loading, stalled-refresh typing/focus, preserved assignment edits and session/account isolation. Bundle/request measurements below. | Real browser startup/network measurements, target device checks, live changes from other accounts; large roster metadata and chart bundle remain. | Deploy client after M15; measure browser performance and verify manual prompts on actual host. |

## Rechecked baseline and final validation

The actual starting checkout matched the recorded baseline: **20 files / 2,240
tests passing**, lint/build passing and zero known npm vulnerabilities. F01-F09
were present and their existing regressions remained active, including M13
precision, M14 final-Admin races, session/account isolation and audit pagination.

Final local release validation is recorded below; commands use synthetic accounts
and transports. Native PostgreSQL accepts only its generated loopback cluster.

| Check | Result |
|---|---|
| Complete suite | **22 files / 2,291 tests passed** |
| Lint | Passed, no warnings |
| Production build | Passed |
| npm audit --ignore-scripts --json | Zero known vulnerabilities across 489 dependencies at check time |
| git diff --check | Passed after documentation whitespace correction |
| Migration manifest | 15 ordered unique migration labels and SHA-256 hashes; no SQL executed |
| Fresh schema rehearsal | Initial schema through M15 in PGlite; empty/closed startup and refusal of existing data retained |
| Upgrade rehearsal | Native PostgreSQL 17.10 through M14 with existing accounts/assignments/NULL-year history, then M15; history JSON unchanged |
| Privileges/negative access/concurrency/rollback | Native role/grant/path/anonymous/inactive checks and previous observed verification/assignment/final-Admin races and mandatory-audit rollback cases pass |
| Provider/browser journey | Not run; no configured disposable service/browser session available |
| Provider backup restoration / monitoring delivery | Not run; operational owners/settings/facilities remain unverified |

The tests exercise signup/Pending behavior and activation rechecks, assignments
and section roster, typing/session refresh, server-clocked shifts, ordinary and
fractional verification, refreshed progress/historical exclusion, document staging/
review/version preservation, evaluation authorization, announcement retry/reload,
recovery transitions, audit navigation/filter/export and final-Admin protection.
These are component/SDK transport/PGlite/native SQL checks across suites; they are
**not a single real-browser/provider end-to-end run**. Mocked email success does
not establish delivery, and synthetic Storage metadata does not establish bytes.

New coverage lives in functionality-reliability.test.js and functionality-ui.test.jsx,
with additions to assignment-dashboards, instructor-sections, session-restoration,
initial-schema and workflow-improvements-postgres suites. See [tests](tests/README.md)
for contracts. Existing passing migration/security tests were retained.

## List inventory and consistency limits

| Read category | Final approach |
|---|---|
| Admin accounts/assignments/master data; Instructor roster/master/year lookups | RLS-scoped, UUID-ordered complete reads with exact-count reconciliation and finite budgets |
| Attendance and Admin audit details | Deterministic 50-record pages, stable date/created_at plus ID ordering, short-page fill and exact counts |
| Evaluations/corrections/documents/alerts/announcements | Scoped bounded complete reads; evaluation/reviewer/announcement history is deferred to the relevant screen where applicable |
| Related profile names / unfinished uploads | Count-checked paginated set-returning RPCs; actual SDK count headers tested |
| Intern assignment/open session/today session | Singleton reads; cardinality errors remain visible; no hidden capped list used for clock state |
| Metric/chart RPCs | Server aggregates; metric roster traverses UUID pages, chart returns grouped JSON |
| Mutation return records | Single returned record with existing cardinality/identity checks; no list-pagination substitution |
| CSV exports | Fresh scoped traversal, no partial artifact after detected failure, identity recheck before artifact delivery |

Complete lists stop above **50,000 records**, exports allow at most 50,000, visible
pages fill 50, and metric pages request 100 (server accepts 1-250). Secondary/metric/
detail traversals have a 20-second budget; export traversal has 60 seconds and
individual SDK waits are normally at most 15 seconds. Upload preparation has a
60-second client bound, while configured HTTP transport can fail earlier. Auth,
finalize/reconcile and cleanup stages are separately bounded; an export's full
sequence also includes bounded authorization checks and formatting.

Count/ID validation detects many changes; equal-count edits or page shifts can
escape detection because HTTP reads are not a database snapshot. Old visible data
can remain during a failed refresh and is accompanied by an error. Server guards
and stale-evidence checks remain authoritative for writes. The complete roster
and master-data approach is bounded, not an unlimited scaling solution.

## Performance evidence and limits

Measured on Windows x64 10.0.26300, Node 24.18.0, AMD Ryzen 5 7535HS, 12 logical
CPUs and approximately 7 GiB OS-reported RAM. Test/build runs share this machine;
their durations are not browser performance measurements.

A native synthetic fixture uses one current-year intern with 300 verified eight-hour
attendance records, no documents, and a 2,400-hour total. One measured verbose run:

| Metric path | Before: raw attendance evidence | After: one metric payload |
|---|---|---|
| Serialized JSON bytes (no HTTP headers/compression) | 143,701 | 539 |
| Client logical requests at cap 250 | 6: two authorization checks, anchor, two data pages, final count | 1 aggregate RPC |
| Native aggregate harness round trip | Not a comparative latency benchmark | 121.37 ms, including local role/GUC/savepoint control |

The byte reduction in this fixture is approximately **99.6%**. Native SQL verifies
equivalent totals. The request-count regression executes the actual complete-read
and metric adapters against synthetic transport rather than assuming the provider
cap. This excludes document-history transfer, unrelated roster/metadata reads and
real HTTP/JWT overhead. Each additional metric roster page adds a request.

The Instructor overview fixture records six complete-list resource paths plus one
metric RPC and zero raw detail queries. The original source loaded twelve resource
paths, including raw attendance/open sessions/evaluations/corrections/documents/
announcements. These are **resource paths**, not seven total HTTP requests: complete
reads include authorization/count/pagination requests. Native HTTP startup,
first-interaction timing, paint, network bytes and low-end-device performance remain
unmeasured.

| Build chunk | Baseline raw / gzip kB | Final raw / gzip kB |
|---|---|---|
| Shared main chunk | 471.79 / 135.79 | 478.87 / 137.92 |
| Intern dashboard chunk | 397.97 / 115.31 | 401.30 / 116.39 |

Recovery/audit/reliability features add client code; this release does not claim a
bundle-size improvement. Recharts remains a significant Intern bundle cost.
Evaluation history, instructor review details and Admin audit are loaded on demand,
but further metadata paging and chart splitting remain improvement opportunities.
Reproduce the transfer comparison with the native workflow suite's "reduces
transferred" case and verbose reporter; the request-count fixture is in the
functionality reliability suite.

## Migration and provider deployment

1. Privately record the actual project, deployed revision and successful operator
   migration ledger. Generate reviewed local hashes with:

       node scripts/migration-manifest.mjs

2. Run [05_workflow_readiness.sql](supabase/inspection/05_workflow_readiness.sql)
   as an authorized database owner. Review exact definitions/owners/search paths,
   EXECUTE/table privileges, policies/RLS/triggers, private bucket configuration,
   M13 comparison, M14 guard, Admin/current-year counts and M15 indexes. Use the
   broader metadata/anomaly inspections when catalog drift or missing structure
   requires it. Never paste private inspection output into Git or this report.
3. Only if the project is confirmed through M14, the release order is **M15, then
   the new client**. Otherwise prepare the exact missing-prerequisite list from
   evidence, normally preserving numeric M01-M15 order. M13 and M14 existing files
   are not proof of installation. M05/M09 historical validation gates remain
   independent; do not fabricate repairs/backfills or replay bootstrap.
4. Review/rehearse [M15_dashboard_metrics.sql](supabase/migrations/M15_dashboard_metrics.sql)
   as trusted postgres. It adds three fixed-path security-invoker routines with
   authenticated-only EXECUTE and three owner/year indexes. There is no existing-row
   UPDATE/DELETE, public bucket change, authorization bypass or new table.
5. Confirm actual Auth Site URL and exact allowed confirmation/recovery URLs,
   including the app pathname and ?flow=recovery. Review email templates, supported
   SMTP/quotas/rate limits and session/password settings. Local examples and provider
   references are in [WEB_SETUP.md](WEB_SETUP.md).
6. Existing public environment placeholders remain VITE_SUPABASE_URL,
   VITE_SUPABASE_ANON_KEY and VITE_DEMO_MODE=false. **No new environment variables
   or dependencies.** Never add a service-role/secret key to VITE_ values. Monitoring
   uses a host-neutral redacted event hook; choose/configure a collector separately.
7. Coordinate client refresh after SQL. Missing M15 makes metric screens visibly
   unavailable; it is not repaired by fake zeroes or unrestricted raw data.
   No live SQL/client action is authorized or performed by this report.

M15 is transactional: an error before COMMIT rolls back that application. After
commit, preserve evidence and use a reviewed forward repair with access closed.
A client rollback is not a database rollback. Index creation takes normal locks:
review table size and a maintenance window on the actual project. Do not drop
authorization or evidence to restore availability.

## Release checklist and remaining decisions

- [ ] Approve deployment separately and inspect the actual project/ledger.
- [ ] Confirm only missing migrations, rehearse them on disposable history, record
      hashes and apply SQL before client. Verify role/RLS/private bucket/Admin/year.
- [ ] Run npm run verify:release in the release checkout and retain its output.
- [ ] Configure exact redirects and email settings; verify disposable signup,
      confirmation/resend, activation, reset/expired link and password change.
- [ ] Run the complete disposable provider/browser journey in
      [OPERATIONS_RUNBOOK.md](supabase/OPERATIONS_RUNBOOK.md), including real file
      bytes, account switching, above-cap lists, lost responses and stale reviews.
- [ ] Verify mobile/keyboard/screen-reader behavior and draft-safe refresh while typing.
- [ ] Record browser/host/device startup and request/volume measurements.
- [ ] Name monitoring/incident/restore owners, approve retention and recovery targets,
      configure actual provider facilities/collector and rehearse restoration.
- [ ] Resolve the concrete questions in
      [FUNCTIONALITY_PRODUCT_DECISIONS.md](FUNCTIONALITY_PRODUCT_DECISIONS.md)
      before official reporting/import/archive/certificate/placement work.

Unsent announcement drafts expire after 24 hours and clear on explicit sign-out.
A pending submission identity is retained for that account until reconciliation,
including across sign-out, to avoid duplicate sends; it is never loaded into a
different account's UI. sessionStorage normally ends with the tab. If tab storage
is unavailable, sending is blocked before the request. No recovery state is claimed
durable after cache loss.

Refresh prompts suggest that other-account changes may exist; they do not prove a
specific change occurred. There is no Realtime authorization/subscription claim.
Evaluation scores remain informational. Historical instructor/company/section
membership remains unknown unless supported by existing evidence; no placement
history or previous-year editing policy was invented.

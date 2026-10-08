# INSync remediation progress

Latest overall functionality audit: [SYSTEM_FUNCTIONALITY_AUDIT.md](SYSTEM_FUNCTIONALITY_AUDIT.md).
It records the auth/draft and audit-page fixes, setup repair, M14 final-Admin guard,
current verification, and remaining priorities.

Latest workflow delivery (2026-10-08): see
[WORKFLOW_CHANGE_REPORT.md](WORKFLOW_CHANGE_REPORT.md) for the ten cross-role
workflow improvements, M11/M12, the M13 attendance verification fix, current
verification and deployment requirements.
The historical phase records below are retained and do not describe the latest
local build/test results.

Updated 2026-10-08, Phases 0-4 historical plus focused Phase 5 remediation. Both audit and checklist read fully before edits.
Starting HEAD 75998c0; no applicable AGENTS.md in workspace/ancestors. Phase 0
left behavior unchanged, Phases 1-2 authored M01-M05 and affected UI, Phase 3
updates tooling, honest downloads, setup guard and bootstrap warning comments.
Phase 4 adds M06-M09, shared domain derivations and versioned document workflows.
No real project SQL/Auth/Storage execution, credential output or legacy row repair.

**Phases 0-4 remain historical; the current implementation also includes the focused Phase 5 remediation requested by `PROMPTFIXv2.txt`.**
The historical finding register below is retained as evidence, while the Phase 5 section records current status and supersedes older “not started” statements.
Known-defect characterization tests are not remediation evidence. Assumptions are in DECISIONS.md.

## Phase 5 focused remediation — current status

Implemented in the uploaded source:

- Auth/session restoration now has explicit loading, profile-error, retry/sign-out, stale-request, unsupported-role, confirmation-aware registration, and honest logout states.
- Role dashboards are lazy-loaded; active Certificate of Completion entry points were removed without removing internship completion/progress/clearance logic.
- Admin audit history is deterministically paginated beyond the first 50 records and reports exact available counts.
- Master-data edits confirm returned rows. Companies/course sections/academic years use a guarded deletion operation with reference-impact confirmation, deliberate dependent-reference clearing, stale assignment-buffer cleanup, and trusted audit events. Academic-year current selection is atomic and at most one year can be current.
- Admin, Instructor, and Intern dashboard reads preserve last-known data when individual resources fail and expose retry/stale states; dependent actions are blocked when required data is unavailable.
- Shared modal accessibility was strengthened with dialog semantics, accessible naming, Escape handling, focus containment/return, and viewport scrolling. Success/warning/danger tokens now meet the automated small-text contrast threshold.

### Verification

- `node node_modules/eslint/bin/eslint.js .`: **passed with zero errors and zero warnings**.
- Direct JS regression smoke: **passed** for business validation, checklist validation, Manila date handling, RPC cardinality, and failure outcomes.
- M10 PGlite migration/regression: **passed** for guarded company deletion impact/nulling, atomic current-year switching, single-current invariant, and current-year deletion blocking.
- `npm run build`: **not executable in this uploaded Linux environment** because the bundled dependency tree is missing Rollup's `@rollup/rollup-linux-x64-gnu` optional binary. The directory is present but empty; offline package repair could not obtain the binary.
- `npm test`: **not executable for the same Rollup/Vitest startup dependency failure**.
- No real Supabase project, Auth, Storage bucket, or production data was contacted or mutated.

### Awaiting live verification

Real Supabase RLS/PostgREST behavior, Auth email-confirmation behavior, concurrent browser session transitions, Storage delivery/cleanup, browser/mobile keyboard/screen-reader behavior, and production bundle-size measurements remain unverified. Server-side dashboard aggregates and broader detail-list pagination beyond the audit view remain future work.

## Phase 0 artifacts and checks

- `package.json`, `package-lock.json`, `vitest.config.js`, `eslint.config.js`:
  Vitest, lint and test/watch scripts, isolated Node tests. Application build/dev
  configuration left intact. Vitest 4.1.11, ESLint/@eslint/js 9.39.5, React lint
  plugin 7.37.5, hooks plugin 7.1.1, globals 17.13.0 pinned as dev dependencies.
- `.env.example`: two public browser placeholders only; startup guard is Phase 3.
- `tests/setup.js`, `tests/audit-baseline.test.js`, `tests/README.md`: seven audit
  probes in 11 characterization cases with no live transport or app-client import.
- `supabase/inspection/01_metadata.sql`, `02_anomalies.sql`, `README.md`,
  `REPAIR_PROPOSAL.md`: unexecuted read-only catalog/anomaly inventory and per-group
  review proposal, covering duplicates, partial checklists, hour targets, role/
  assignment, rubric, time/review, paths/orphans and current-year flags.
- `supabase/tests/FIXTURES.md`: disposable role/status/scope fixture specification,
  full 12-table/Storage contract and RT-01 to RT-22 acceptance plan; not an executed
  policy suite. `supabase/RUNBOOK.md`: preparation gates only; migrations pending.
- `DECISIONS.md`: conservative defaults and implementation/change points.

Validation environment: Windows PowerShell, Node **24.18.0**, npm **11.16.0**.

| Check | Actual result / limit |
|---|---|
| Pre-edit `npm run build` | Passed, Vite 5.4.21, 673 modules. JS 931.35 kB / gzip 260.18 kB; CSS 22.80 kB / gzip 5.35 kB. >500 kB warning. |
| Post-edit `npm test` | Passed on Vitest 4.1.11: 1 file, 11 cases; known defects reproduced, synthetic SDK transport only. |
| Post-edit `npm run lint` | Passed: zero errors, six existing unused imports (3 Admin, 3 Instructor). Generated Vite timestamp config files excluded after one concurrent build/lint run raced a deleted temporary file. |
| Post-edit `npm run build` | Passed, 673 modules; same JS/CSS bytes, hashes and sizes as pre-edit baseline. >500 kB warning persists. Compilation only. |
| `npm ls --depth=0` | Passed with final pinned tooling; no invalid top-level dependency. |
| `npm audit --ignore-scripts` | Exit 1: 3 remaining packages, Vite (high), source-map-js (high), esbuild (moderate); existing Phase 3 debt. Initial 3.x Vitest trial added advisories and was replaced; none of those remain. No forced audit fix. |
| Lockfile/application diff | Existing production dependency versions unchanged; application source/bootstrap/legacy patch/Vite config unchanged. `git diff --check` passed. |
| Inspection/policy SQL | Authored and statically reviewed only; no Postgres parser/server/live result. Requires operator rehearsal on disposable data. |
| Browser / accessibility / real Auth / Storage | Not executed. |

ESLint 9 is marked unsupported by npm; latest 9.x retained for React lint plugin
peer compatibility. Reassess in Phase 3. Runtime floor mismatch and exposed dev
host remain open. Vitest has an independent nested Vite; root application Vite is
unchanged. No fresh Node 22 install/CI/browser validation is claimed.

## Phase 1 implementation and verification

Starting revision `368012c`. User authorized Phase 1 by “continue.” Deliverables:

- `supabase/migrations/M01_authority.sql`: single transaction with preflight drift/
  ownership/trigger checks, literal intern/Pending signup, requested_role metadata,
  status/assignment helpers, profile field guard, restricted profile/name access,
  immutable domain ownership, author-bound snapshot announcements, Active-scoped
  document Storage policies and explicit table/column/function/schema privileges.
- Raw clock/correction/document review writes revoked for every API role. Controlled
  clock, correction submission, atomic correction review, owner upload/reset and
  staff document-review RPCs preserve legitimate flows. Server instants/duration,
  explicit overnight end date and path-pinned review were prerequisite work pulled
  forward; unique/CHECK validation, trusted audit and full version lifecycle remain
  later phases. No legacy rows backfilled, merged or normalized.
- `src/lib/authority.js`, App, LoginPage, Intern/Instructor dashboards: status-only
  own-profile RPC, public effective role removed, staff FK name embeds replaced
  with restricted name RPC, controlled mutations, per-item bulk outcomes, UUID
  recipients, pending clock/review controls and outcome-dependent draft closing.
- `supabase/tests/baseline.sql`, `tests/m01-authority.test.js`: fresh synthetic
  Auth/Storage/domain schema and actual migration applied only in in-memory PGlite
  0.5.8. 1,716 raw CRUD matrix cases plus protected-field/RPC/catalog tests; all
  role/status variants have real owned fixture rows. Bootstrap never read/executed.
- Client transport suite verifies single-record/target assertions, thrown/returned
  errors and mixed bulk outcomes. Manila/overnight probes now assert corrected
  behavior through shared date/actual SQL; other baseline defects stay recorded.
- `supabase/tests/M01.md`, migrations README, RUNBOOK and DECISIONS updated with
  operator bootstrap, migration prerequisites, fail-closed rollback, live matrix,
  unknown legacy audience handling and conservative operation scope.

| Check | Phase 1 result |
|---|---|
| `npm test` | Final run: 3 files, 1,948 cases passed, including SQL-owner/name-scope hardening and one-second/future/required-note boundaries. Actual Postgres SQL tests and synthetic transport checks, not live Supabase. |
| `npm run build` | Passed: 674 modules, JS 930.86 kB / gzip 260.45 kB; CSS 22.80 kB / gzip 5.35 kB. Large-chunk warning persists. |
| `npm run lint` | Passed: zero errors, six existing unused imports. |
| `npm audit --ignore-scripts` | Exit 1: same 3 vulnerable packages (2 high, 1 moderate); Phase 3, no forced fix. No new runner advisory. |
| Source/data safety | Bootstrap/legacy patch unchanged; no .env contents, real credentials or remote DB/Auth/Storage contacted. No production migration applied. |
| Live/browser checks | Not run: actual JWT/confirmation, PostgREST composites/FK embedding, bucket public delivery/signed URLs, two-client concurrency, keyboard/mobile/screen-reader. Detailed steps in supabase/tests/M01.md. |

Known residual risks: bucket configuration may still be public (INS-015); trusted
audit is absent and Admin client logging remains forgeable (INS-009); legacy
uniqueness/CHECKs not enforced yet; document immutable version/staging cleanup and
rubric authority remain Phase 4; auth/read error handling and some zero-row writes
remain Phase 5. Extra live catalog drift causes M01 preflight to stop for review.
Local SQL success does not establish deployed authorization or production readiness.

## Phase 2 artifacts and checks

- `M02_trusted_audit.sql`: mandatory row-trigger audit across 11 business tables,
  trusted UID/time/source, protected INSERT and non-public trigger helper. Captures
  changed fields, role/status/assignment values and master labels without whole
  profile/file snapshots. Legacy audit remains explicitly unverified. Failed audit
  aborts the mutation; no-op/zero-row writes generate no event.
- M02 single review locks caller status/assignment/request and Pending transition,
  reconciles existing/missing attendance, stores required rejection/optional
  approval note, returns actual row. Server bulk uses per-item subtransactions
  and consistent intern/request lock order; no success for failed attendance/audit.
- `M03_attendance_integrity.sql`: daily/open/Pending unique identities after a
  duplicate preflight; NOT VALID interval/verification/reason/review CHECKs; future
  write trigger; server clock time captured after serialization; guarded row-ID
  closure. `M05_validate_attendance.sql` is a separately deferred historical gate,
  never a repair or timestamp guess. Any legacy anomaly remains an operator task.
- `M04_private_documents_bucket.sql`: separate explicit existing-bucket UPDATE,
  private/10 MiB/PDF-JPEG-PNG; no object cleanup. Independent of M03 legacy gate.
- `authority.js`, `attendance.js`, dashboards: strict server bulk outcomes,
  rejection-note draft/busy handling and persisted note/overnight end-date display;
  Manila clock/date/elapsed helpers; independent
  open-session query; Instructor Active Now across dates with unknown/error state.
  Removed client audit INSERT and fake import/backup events; disabled those two
  simulated actions and labeled backup unavailable/legacy audit provenance.
- `inspection/03_phase2_attendance.sql`, repair proposal, RUNBOOK, migration/test
  guides and D24-D27 cover anomaly review, staged validation and live limitations.
- Dev-only pinned embedded-postgres 17.10.0-beta.17 + pg 8.23.1; native disposable
  cluster accepts no remote URL/env credentials, runs hidden on random loopback
  port, creates no OS user/service, verifies cleanup paths. No bootstrap read.

| Check | Phase 2 result |
|---|---|
| `npm test` | 6 files / 2,012 tests passed: M01 SQL matrix 1,929; native Phase 2 SQL 45; migration gates 7; client transport 16; date/elapsed helpers 5; remaining baseline characterizations 10. Includes persisted deleted-master labels and final bulk scope/order checks. |
| Native races/faults | Overlap observed through pg_stat_activity waits; approve/approve, reject/reject, approve/reject, clock-in/out, Pending-submission races have one transition. Reassignment/deactivation while waiting denies stale review. Insert/update/review/audit failure rollback and mixed bulk tested. |
| `npm run build` | Passed: 675 modules; JS 933.62 kB / gzip 261.38 kB; CSS 22.88 kB / gzip 5.38 kB. Large-chunk warning remains Phase 6. |
| `npm run lint` | Passed: zero errors, six existing unused-import warnings. |
| `npm ls --depth=0` | Passed; test dependencies and existing React/Vite/plugins resolve without invalid top-level peers on Node 24.18.0. Runtime floor/tooling alignment remains Phase 3. |
| `npm audit --ignore-scripts` | Exit 1: same 3 vulnerable packages (2 high, 1 moderate), deferred Phase 3. No forced audit fix; test dependencies introduce no advisory in this report. |
| Safety / live limits | No .env read/output, real credentials, remote DB/Auth/Storage call or bootstrap execution. Local synthetic Auth/Storage metadata is not a deployed service. No browser/mobile/screen-reader run. |

Pending: operator catalog/anomaly review, all real migration application and
historical validation, genuine JWT/retained-session/API result shapes, Storage
public delivery denial/actual size-MIME enforcement, authorized signed URLs,
Supabase API races and browser/a11y. Private View/Download/version cleanup remains
Phase 4. Read failures/pagination/lifecycle/other zero-row handlers remain later
phases. New audit cannot certify previously authorized staff or historical claims.
No production-readiness or deployed-security claim.

## Phase 3 implementation and verification

Starting revision 74644c9. User authorized Phase 3 by continue.

- package.json/lock: application Vite 7.3.7, React plugin 5.2.0, esbuild 0.28.2,
  source-map-js override 1.2.2. Preserves esbuild pipeline rather than switching
  compiler architecture. No forced audit fix. Node floor >=22.12.0, .nvmrc 22,
  Windows CI matrix 22/24. Dev/preview host 127.0.0.1; no default network exposure.
- src/lib/config.js, supabaseClient.js, App.jsx, .env.example: format-checked public
  publishable/legacy anon setup; missing/malformed/private values never construct
  SDK; safe setup screen, constructor failures redacted. Format validation does
  not establish key authenticity or solve Phase 5 offline/auth state recovery.
- src/lib/exports.js and all three dashboards: actual blank planning CSV/XLSX,
  fresh all-authorized audit CSV and own all-record DTR CSV; keyset/API-cap/count/
  identity guards, role/status recheck, 50,000 limit, spreadsheet literal escaping,
  logged/verified/open/unknown evidence, real Blob dispatch/URL cleanup and busy/error
  state. Downloads are requested, never claimed saved. XLSX dependency loads on demand.
- Bulk import/file selection/drag-drop, instructor reports, intern PDF/Excel
  summaries/archives and certificates disabled and visibly unavailable. Removed
  fake certificate eligibility/download claims and uptime literal. Backup remains
  unavailable/not connected; no fake client audit writes reintroduced.
- Login demo shortcuts require explicit true AND development. Production test
  with flag true verifies all known demo account/password literals absent; generic
  sign-in placeholder. Real-account reuse inventory/rotation is an operator task.
- README, RUNBOOK, migration guide, PHASE3 verification and D28-D31 document setup,
  deployment, review/rehearsal/rollback and business defaults. Bootstrap and historical
  patch executable bodies unchanged; only destructive/superseded warning comments
  changed. No Phase 3 DB migration or bootstrap execution.

| Check | Phase 3 actual result / limit |
|---|---|
| npm test, Node 24.18.0 | 9 files, 2,061 cases passed (2,012 existing + 49 new). Includes synthetic SQL/races, export byte/ZIP/transport checks, actual App setup SSR with unrelated dashboards mocked, separate actual production build with demo flag true. |
| npm run build, Node 24 | Passed: Vite 7.3.7, 753 modules; main JS 935.73 kB / gzip 264.57 kB; lazy XLSX JS 71.27 kB / gzip 19.77 kB; CSS 22.77 kB / gzip 5.32 kB. Before Phase 3: JS 933.62 kB / gzip 261.38 kB, CSS 22.88 / 5.38. Large dashboard chunk persists, INS-036 Phase 6. |
| npm run lint | Passed, zero errors; same six existing unused-import warnings. |
| Clean install on Node 22.12.0 | Fresh disposable copy excluding ignored .env/node_modules/dist, npm ci succeeded; full 2,060 tests and build passed; audit zero. Final future-evidence regression also passes in the 2,061-case full suite on Node 22 from the workspace. Initial cold startup test timeout resolved by isolating unrelated dashboards. Windows TEMP 8.3 alias caused Vite HTML path mismatch; build passed from canonical long path. Use canonical workspace paths. |
| npm audit --ignore-scripts | Zero vulnerabilities, after upgrade and fresh Node 22 install. Point-in-time dependency snapshot only. |
| npm ls --all | Passed; no invalid dependency problems (also resolves former old root esbuild/optional-peer mismatch). |
| Source / SQL review | git diff --check passes; only comments change in legacy SQL, M01-M05 unchanged; no real Supabase project operations or .env contents read/output. |
| Remote CI / browser / live Supabase / a11y | Not executed. CI authored; PHASE3.md provides reviewable manual checks. Actual downloads, spreadsheet apps, valid-project/offline/auth flows, deployed RLS/Storage and screen readers remain unverified. |

Residuals: equal-count concurrent edits can yield mixed-time exports; no transactional
snapshot claimed (INS-027). Full dashboard totals/pagination/auth recovery remain
Phases 4/5. No importer, official certificate or backup implementation claimed.
ESLint 9 remains an unsupported-major notice while React lint plugin declares no
ESLint 10 support; no npm advisory currently. Provider backup status and old demo
password reuse must be checked by authorized operators. No production-ready claim.

## Phase 4 implementation and verification

Starting revision 6bc9bf5. User authorized Phase 4 by continue. Scope: INS-017,
018, 019, 020, 021, 022, 024 and 025; Phase 5 has not started.

- M06: strict target and rubric validators, NOT VALID historical checks, server
  weighted score/author, idempotent submission UUID and no raw evaluation writes.
  M09 separately validates reviewed clean history and applies score NOT NULL.
- M07: atomic Active Admin lifecycle/assignment with retained intern extension,
  Active instructor validation, explicit unassignment, protected raw-write
  revocation and deferred relationship invariants. Incompatible legacy references
  stop the migration unchanged; no silently normalized rows.
- M08: unique requirements after duplicate preflight, attach only missing standard
  types, generated upload reservations, exact MIME/size finalization, immutable
  committed versions and append-only review history, trusted reviewer/time,
  expected upload/review versions, constrained cleanup and short-lived access.
  Old path-only RPCs revoked; two new RLS tables and mandatory audit triggers.
  Restrictive document Storage guards cannot be OR-bypassed. No global document
  DELETE or overwrite; cleanup reconciles ambiguous outcomes before Storage API
  removal, preserves committed evidence and exposes unfinished-upload retries.
- business.js, hours.js, metrics.js, workflows.js: pure target/rubric/evidence/
  calendar/chart/clearance/risk rules shared by all dashboards and DTR export.
  Logged and verified hours separated, persisted target used, true Manila periods,
  year-aware sums, standard plus custom requirements and unknown legacy evidence.
  No fixed velocity. Count-checked prerequisite/feed reads bounded at 50,000.
- DocumentActions, EvaluationCriteria, AnnouncementsFeed and dashboards: private
  View/Download, expiration/retry and stale-link response guards; criteria/null
  handling; UUID recipient labels; loading/empty/error Retry/Refresh feed; busy
  new mutations, draft preservation and outcome-based state updates.
- inspection/04_phase4_domain.sql and PHASE4_REPAIR_PROPOSAL.md: read-only anomalies
  and review proposal before constraints. RUNBOOK, migration guide, PHASE4.md,
  README, tests/README and D32-D35 cover ordering, rollback, decisions and live
  acceptance. No legacy data repair, real project operation or dependency change.

| Check | Phase 4 actual result / limit |
|---|---|
| npm test, Node 24.18.0 | 13 files, 2,168 tests pass: 2,054 retained + 114 Phase 4 (34 business, 13 client, 4 migration-gate, 63 native SQL cases). Seven obsolete defect expectations replaced with desired behavior; three baseline probes remain. |
| Native overlap/faults | Seven separate-connection races observe lock waits and assert final outcomes; audit failure rolls back upload finalization, review, evaluation, account and assignment. Final-stage raw-write denial covers new evidence tables across API roles/statuses; catalog grants/owner/search_path and permissive-policy bypass tests pass. |
| npm run build | Passed, Vite 7.3.7, 761 modules; main JS 948.53 kB / gzip 269.21 kB, lazy XLSX 71.27 / 19.77, CSS 23.08 / 5.33. Before Phase 4 main JS 935.73 / 264.57. Large-chunk warning remains INS-036 Phase 6; compilation is not authorization proof. |
| npm run lint | Passed, zero errors, five pre-existing unused-import warnings (3 Admin, 2 Instructor). |
| npm audit --ignore-scripts | Zero vulnerabilities at this check; package.json/lock unchanged in Phase 4. No forced audit fix. |
| Migration safety | Actual M06-M09 run only on fresh synthetic local databases. Anomaly gates retain invalid legacy fixtures, failed validation rolls back and preserves NOT VALID new-write enforcement. Bootstrap/M01-M05 executable SQL unchanged. |
| Live Supabase / browser / screen reader | Not executed. PHASE4.md lists RT-05/07/14-17 plus role/status/Storage checks and actual provider byte cleanup, RPC shapes, signed delivery/expiry, real-client races, layout/keyboard checks. |

Residuals: operator must review legacy anomalies before unique constraints/M07
and historical M05/M09 validation; version-zero legacy evidence needs explicit
resubmission before new approval/clearance. Actual JWT/HTTP/Storage metadata and
file bytes remain unverified. MIME/size checks do not inspect content or scan for
malware. Signed links are bearer links until 60-second expiry. Review unrelated
bucket DELETE policies before M08's Storage table grant. Global advisory locking
is conservative and contention is unmeasured. Loaded metrics/read pages are not
transaction snapshots, cannot detect every equal-count edit and age until refresh;
server aggregates, general error states, pagination/focus/midnight refresh and auth
recovery remain Phase 5. Accessibility, current-year/admin completeness and lazy
chunks remain Phase 6. No certification, live security or readiness claim.

## Finding register

M01 refers to `supabase/migrations/M01_authority.sql`; SQL suite refers to
`tests/m01-authority.test.js`, client suite to `tests/authority-client.test.js`.
“Pending RT” means live verification, never a passing live test. Baseline probes
remain in `tests/audit-baseline.test.js`; local SQL checks are separate evidence.

| ID | Status | Files / evidence | Tests / next phase and remaining risk |
|---|---|---|---|
| INS-001 | Fixed-pending-live-verification | M01; SQL suite; D08/D23 | Local protected-field/status/role tests pass; self-name only, trusted operator bootstrap documented. Pending live RT-01/02/03 and owner/membership inspection. |
| INS-002 | Fixed-pending-live-verification | M01; LoginPage.jsx; SQL suite | Signup always intern/Pending + extension; requested_role non-authoritative. Local metadata cases pass; pending real Auth confirmation-on/off/metadata RT-01. |
| INS-003 | Fixed-pending-live-verification | M01; App.jsx; SQL suite | Local role/status matrix + retained-identity deactivation pass. Status-only non-Active profile RPC. Live JWT/Storage checks pending; public bucket delivery still INS-015. |
| INS-004 | Fixed-pending-live-verification | M01; SQL suite; D09/D20 | Assigned scope, ownership immutability/RPC-only review and foreign-folder checks pass locally. Pending live RT-03/04, actual extra policy/RPC inventory. |
| INS-005 | Fixed-pending-live-verification | M01; InternDashboard.jsx; SQL suite | Own/assigned profile reads; related staff id/name RPC; equivalent roster SQL join passes. Pending actual PostgREST embeds/RPC shapes RT-03. |
| INS-006 | Fixed-pending-live-verification | M01; InstructorDashboard.jsx; AnnouncementsFeed.jsx; SQL suites; D07/D22 | Bound author, UUID Active assigned recipient, frozen broadcast audience, author/recipient/Admin reads; personal/roster delivery after rename/reassignment passes locally. Live RT-16 pending. |
| INS-007 | Fixed-pending-live-verification | M01/M02/M03; authority.js; dashboards; SQL suites | Raw writes denied; trusted server clock/correction/review, audit and independent native races pass. Legacy validation/data review and live RT-03/08/10 pending. |
| INS-008 | Fixed-pending-live-verification | M01/M08; documents.js; dashboards; SQL suites | Admin-only empty requirements, receipt/expected-version owner upload, versioned review, scoped cleanup; old path-only RPC revoked. Local tampering/races pass; live RT-04/07/15 pending. |
| INS-009 | Fixed-pending-live-verification | M02; AdminDashboard; phase2-postgres.test.js; D15/D25 | API audit writes denied including Admin; actor/time/changed fields and 11-table mandatory audit; zero-row/no-op absent; audit failure rolls back. Legacy provenance unverified. Live RT-12/20 and catalog pending. |
| INS-010 | Fixed-pending-live-verification | M02; authority.js; InstructorDashboard; native/transport suites; D26 | Existing/missing-day reconciliation, note, failed insert/update/exception/audit rollback, mixed bulk and observed concurrent approve/reject races pass. Live SDK shapes/JWT/API races RT-11/12/13 pending. |
| INS-011 | Fixed-pending-live-verification | M03/M05; migration gates/native SQL; D01/D24 | Daily/open/Pending unique identities, guarded ID-only clock closure and busy states; real concurrent transitions commit once. Legacy duplicates stop migration unchanged; real preflight/deployment/live RT-08/12/13 pending. |
| INS-012 | Fixed-pending-live-verification | M01/M03; attendance.js; dashboards; helper/native SQL; D02/D03/D27 | Trusted instants/server Manila date, independent open query, overnight/seconds elapsed, Instructor Active Now across dates, explicit unknown legacy state. Device timezone display tested locally; legacy evidence/browser/live RT-09/17 pending. |
| INS-013 | Fixed | schema.sql warning comments; historical patch warning; README; migrations/README; RUNBOOK | RT-22 document/diff review: destructive bootstrap never an existing-data repair path; executable SQL unchanged, no SQL executed. |
| INS-014 | Fixed | package.json/lock; vite.config.js; phase3-production.test.js | Patched compatible tooling, loopback dev/preview; full build/tests on Node 24 and clean Node 22.12; npm audit zero, npm ls all valid. Browser baseline verification pending; ESLint unsupported-major notice documented. |
| INS-015 | Fixed-pending-live-verification | M04; native SQL/migration gates; D11 | Existing public bucket explicitly private with MIME/10 MiB settings; unrelated bucket retained; missing bucket aborts. Actual object delivery/upload enforcement/live RT-04/15 unverified. |
| INS-016 | Fixed-pending-live-verification | M03/M05; inspection/03; native SQL/migration gates; D03/D17/D24 | Independent new-row interval/hours/review/reason CHECKs, future-write guards, Pending uniqueness. Equal/negative/ambiguous/excessive/future invalid; explicit overnight/max16h/one-second valid. Historical validation and live RT-09/10/12 pending. |
| INS-017 | Fixed-pending-live-verification | M06/M09; business.js; workflows.js; EvaluationCriteria; dashboards; Phase 4 suites; D12 | Four integer 1-5 criteria, server 25/35/20/20 score/author and retry key; raw writes denied; null/malformed legacy UI Unavailable. Native idempotency/race/audit failure pass. M09 physical NOT NULL and historical validation deferred; live RT-14 pending. |
| INS-018 | Fixed-pending-live-verification | M06/M09; business.js; Admin/Instructor/Intern; inspection/04; Phase 4 suites; D06 | Finite >0 <=10000, two-decimal validator and NOT VALID CHECK; no 486 UI fallback, persisted target used. Coercion/DB range/precision tests pass. Historical gate and live RT-05/17 pending. |
| INS-019 | Fixed-pending-live-verification | M07; workflows.js; AdminDashboard; Phase 4 native/client/gate suites; D09/D32 | Atomic lifecycle/assignment/audit, Active instructor validation, explicit unassignment and history retention; raw protected writes revoked. FK/audit faults, zero rows, incompatible-history abort and assignment/deactivation race pass. Live RT-05 pending; global lock contention unmeasured. |
| INS-020 | Fixed-pending-live-verification | M08; business.js; AdminDashboard; native/gate/business suites; D10 | Unique requirement identity after duplicate gate; idempotent missing-type attachment preserves evidence/custom rows; partial/complete UI. Concurrent attachment passes. Legacy duplicate disposition and live RT-07 pending. |
| INS-021 | Fixed-pending-live-verification | M08; documents.js; DocumentActions; dashboards; native/client suites; D11/D34 | Owner/assigned/Admin access RPC + 60-second signed links, version/revision guard, missing/forbidden errors and expiration/regeneration UI. No public fallback. Synthetic contract tests pass; actual bytes/download/expiry/browser RT-04/15 pending; bearer links remain usable until expiry. |
| INS-022 | Fixed-pending-live-verification | M08; documents.js; DocumentActions; dashboards; native/client suites; D33/D34 | MIME/size checks, server names, busy uploads, immutable versions/events/reviewer/time, expected review version, required note, reconciled cleanup and retry UI. Faults/races and restrictive guards pass; no global document DELETE. Actual Storage metadata/API/byte cleanup and RT-15 pending; unrelated-bucket DELETE ACL needs operator review. |
| INS-023 | Fixed-pending-live-verification | exports.js; all dashboards; phase3-exports.test.js; PHASE3.md; D28-D30 | Real CSV/XLSX templates, audit/DTR CSV with fresh paginated data and error/count guards; disabled labeled simulations. 30 artifact/transport cases pass. RT-20 actual browser/spreadsheet and >1,000 live synthetic API rows pending; equal-count edits not snapshot-safe. |
| INS-024 | Fixed-pending-live-verification | AnnouncementsFeed; workflows.js; Instructor/Intern; Phase 4 native/client suites; D07/D22 | Intern loading/empty/error Retry/Refresh feed; UUID options disambiguate company/ID. Synthetic personal/roster/duplicate-name/rename/reassignment scope passes. Real feed/browser/retained-token RT-16 pending. |
| INS-025 | Fixed-pending-live-verification | hours.js; business.js; metrics.js; all dashboards/exports; Phase 4 business suites; D02/D04/D05/D13/D35 | Shared Manila calendar/week/month/year, year-aware sums, logged/verified and exact-target/current-evidence clearance; computed risk, no fixed pace. Unknown prerequisites block eligibility. Regression cases pass; point-in-time loaded metrics/count-checked reads are not snapshots; live RT-17/18 and Phase 5 refresh/aggregates pending. |
| INS-026 | Not-fixed | FIXTURES.md | Pending RT-18/19; Phase 5; failed reads still resemble empty data. |
| INS-027 | Not-fixed | workflows.js; count-checked Phase 4 prerequisite reads; FIXTURES.md | Bounded keyset reads prevent detected silent truncation for new metrics/feed. Server aggregates, detail/audit pagination, targeted/focus/midnight refresh and indexes remain Phase 5; equal-count edits can evade checks. Pending RT-18. |
| INS-028 | Not-fixed | FIXTURES.md | Pending RT-19; Phase 5; auth race/missing-profile handling unchanged. |
| INS-029 | Not-fixed | REPAIR_PROPOSAL.md; D16 | Pending RT-06/21; Phase 6; deletion impact/stale dependent forms unchanged. |
| INS-030 | Not-fixed | M07; Admin assignment section value preserved; inspection/02; D14 | Partial prerequisite: assignment RPC accepts section. Section selection/current academic-year atomic workflow and unique current flag remain Phase 6; live RT-06 pending. |
| INS-031 | Fixed-pending-live-verification | config.js; supabaseClient.js; App.jsx; .env.example; phase3-config.test.js | 18 synthetic config/SSR cases pass; missing/malformed/private setup no SDK/import crash, safe screen. Real browser/setup/deployment RT-19/22 pending; format guard does not validate key/project or fix Phase 5 auth/offline state. |
| INS-032 | Not-fixed | Structured RPC outcomes; Phase 4 assignment/account/evaluation/upload/review busy/draft paths; D17 | New paths retain drafts on failure and enforce feedback/revision limits. Phase 5 remaining forms, general transport/state handling and RT-08/15/19 pending. |
| INS-033 | Not-fixed | FIXTURES.md | Pending RT-21 browser/screen-reader; Phase 6; dialog/input/toast issues unchanged. |
| INS-034 | Not-fixed | baseline contrast probe | Low contrast reproduced; pending RT-21; Phase 6; token changes not made. |
| INS-035 | Not-fixed | FIXTURES.md | Pending RT-06/21; Phase 6; action terms/colors unchanged. |
| INS-036 | Not-fixed | before-build sizes above | Pending RT-18/22; Phase 6; eager dashboard/chart chunk remains. |
| INS-037 | Fixed | package.json/lock; .nvmrc; .github/workflows/verify.yml; README | Node >=22.12 floor; Node 22.12 clean npm ci/full tests/build/audit and Node 24 checks pass. CI 22/24 authored, not remotely executed. Windows short-path alias caveat documented. |
| INS-038 | Fixed-pending-live-verification | LoginPage.jsx; phase3-production.test.js; .env.example; README; D31 | Explicit development-only demo flag. Actual production build with true flag excludes known demo password/emails. RT-01/20 browser pending; no real-account inventory/rotation, operator must rotate any reuse. |
| INS-039 | Not-fixed | recordRpc; M07 assignment/account RPC; actual Admin zero-row handler transport test | RPC cardinality/identity and no-success/no-audit/draft preservation pass for assignment. Alert/master UPDATE/DELETE still lack affected-row assertions. Pending RT-19; Phase 5. |

Paths inspection/*, REPAIR_PROPOSAL.md and FIXTURES.md refer to their respective
subdirectories under supabase/. Dxx refers to DECISIONS.md. No finding is marked
Fixed-pending-live-verification until its implementation and local checks exist.

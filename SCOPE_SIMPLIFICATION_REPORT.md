# INSync.v3 scope simplification delivery

Date: 2026-10-09 (Asia/Manila). The current source and existing uncommitted work
were inspected before editing. This is an application cleanup, with no database
reset, data deletion, new business policy or deployment.

Subsequent presentation refinements and current validation are recorded in
[GUI_POLISHING_REPORT.md](GUI_POLISHING_REPORT.md). Verification totals below
describe this scope-cleanup release and its chart follow-ups.

## Dashboard essentials follow-up

The Intern dashboard now shows assignment information, today's clock/status,
hours/progress, latest score and document actions. Announcements are collapsed
by default. A compact weekly bar chart distinguishes logged and verified hours,
using existing server totals scoped to the assigned year and Manila days. Verified
hours are part of logged hours. Future days and unavailable evidence are not
displayed as zero; daily values are also available in an accessible table.
Attendance now shares the dashboard bar chart component, including the logged/
verified legend, tooltips, accessible values and explicit unavailable states.
Weekly views match; Monthly keeps daily totals and Yearly/All Time keep the
existing monthly aggregation. Detailed chart period controls remain in Attendance, evaluation history in
Evaluations, and supporting clearance details in Documents.

The Instructor dashboard now shows assigned/active totals, risk/correction counts
and compact pending-action links. Detailed rosters, progress and per-intern actions
are in My Interns; full alerts remain in Announcements. Removed duplicate roster
table/recent-evaluation views from dashboards. Existing detailed workflows and
authorization remain intact. No SQL was needed for this follow-up.

## Implemented

- Established [PROJECT_SCOPE.md](PROJECT_SCOPE.md) as the current scope:
  Attendance Tracking, Intern Supervision and Performance Evaluation, with
  Document Passing as support. Updated README, setup and current progress.
- Intern dashboard surfaces today's attendance, the existing clock/accomplishment
  workflow, document actions and performance access. The document-year filter
  remains available for document history; it was shared with the removed archive UI.
- Instructor navigation now identifies Dashboard, My Interns and Attendance.
  Existing progress/roster tools provide supervision without a duplicate system.
  Dashboard counts summarize corrections, requirements awaiting approval and
  interns without an evaluation for their assigned year. Counts follow the selected
  assigned roster, section and year. Detailed per-intern actions are in My Interns.
  No evaluation deadline was invented.
- Admin overview prioritizes attendance, intern hours/progress, assignment gaps,
  document approvals, evaluation availability and configuration actions. Existing
  account approval, assignments, master data and audit history remain accessible.
- Preserved the shared count-checked RLS reader from exports.js in
  [rows.js](src/lib/rows.js); completeRows still rechecks account identity/status.
  Pagination, exact counts, identity checks, deadlines and the 50,000-row bound
  remain. Errors describe data loading rather than nonexistent downloads.
- Added role navigation/mobile overflow, dashboard clocking, supervision scope,
  evaluation retry/history and evaluation draft-isolation regressions. Retained
  the former export suite's shared-reader and attendance-evidence checks.
- Marked older feature plans/releases as historical, including earlier deployment
  instructions. Current setup no longer requires legacy Admin API/worker setup.

## Removed

- Intern and Instructor Reports navigation, pages, cards and download actions.
- CSV/Excel DTR, attendance, progress, weekly hours, evaluation and at-risk exports.
- Admin audit CSV control and spreadsheet/planning-template generators. Audit
  filters, detail inspection and pagination remain useful infrastructure.
- Document ZIP archive controls, report-specific year selection and archive builder.
- Admin Bulk Import and Backup navigation/screens and their client request helper.
- Export-only tests and tests for the deleted administration UI.
- fflate and write-excel-file dependencies; no new dependency was added.

No Certificate of Completion control was present in the inspected current source.
It remains absent, with no availability/issuance/download messaging introduced.
Individual signed document View/Download actions are intentionally retained.

## Preserved and classification

| Classification | Retained scope or action |
|---|---|
| KEEP | Attendance clock/history/verification/corrections/hours, assigned-intern supervision, rubric evaluation and historical evaluations. |
| SUPPORTING | Document submission/review/version/revoke/recovery, private signed links, announcements, profile/session/status handling, assignments, academic years, companies/sections, account approval, audit and clearance. |
| REMOVE | User-facing reports/exports, bulk import, backup controls and report-only builders/dependencies. Certificates remain outside scope. |
| DO NOT CHANGE | Existing Manila/overnight/restriction/hour policies, evaluation weights/idempotency, clearance conditions, trusted RPCs/RLS/grants, historical data and design identity. |

All 25 SQL files matched their pre-cleanup SHA-256 hashes. App/session logic, login,
responsive Shell, authority, attendance, business/scoring, metrics/clearance, hours,
document helpers/actions, evaluation criteria and assignment helpers matched the
pre-cleanup snapshot. No live Supabase project was queried or changed.

Existing server-only import/job and operator backup/recovery code remains outside
the browser workflows for operational continuity. M16 job tables, outcomes, email
reservations, audit and service-only authorization remain intact. Related backend
and worker tests remain. Retaining this infrastructure does not present import or
backup as an INSync product feature; provider recovery remains operator-owned.

## Orphan/reference review

Reviewed Reports/Report, CSV/XLSX/Excel, Export/export, Certificate/certificate,
Bulk Import/Import and Backup/backup matches across source, tests, scripts, schema
and documentation. Runtime JavaScript import/export syntax is required. reportHealth
remains the error/offline monitoring hook. Backend CSV parsing and worker references
serve retained server/operator operations. SQL references retain history/security.
Superseded report/export documentation is explicitly historical. No browser code
imports the deleted exports module or the removed administration client/component.

## Verification

Validation is local on Windows with Node 24.18.0.

| Command/check | Actual result |
|---|---|
| npm install | Passed; removed two packages; audit reported 0 vulnerabilities. |
| npm run lint | Passed, zero errors/warnings. |
| npm run build | Passed; production Vite build. |
| npm test | Passed after matching the Attendance and dashboard charts: 24 files, 2,346 tests; full run 44.54 seconds. Focused assignment/dashboard regression run passed 15 tests. |
| git diff --check | Passed; only Git's existing LF/CRLF notices. |
| SQL preservation | 25 SQL files unchanged against the starting snapshot. |

Local coverage includes:

- Attendance: Manila dates, overnight/server clock sessions, restrictions, audit,
  verification, corrections, precision and hours; synthetic UI dashboard clocking.
- Supervision: assigned/unrelated roster isolation in SQL and rendered filters,
  current-year progress, historical exclusion and scoped action counts.
- Evaluation: rubric validation/scoring, submission, UUID retries, historical
  evidence and switching evaluation context without reusing another intern's draft.
- Documents: staged submission/finalize, approval/revision/revoke, versions, private
  access, stale-review guards, cleanup and lost-response recovery in local SQL and
  synthetic transports. These do not verify real Storage file delivery.
- Authentication: Intern/Instructor/Admin and Pending/Inactive authorization,
  session restoration, account switching and recovery with synthetic transports
  and local RLS fixtures. No real user login or email was performed.
- Scope: all reachable desktop tabs and mobile navigation/overflow controls are
  checked for removed features. No fake data was added to the application.
- Weekly chart: logged/verified distinction, assigned-year/account isolation,
  Manila weeks across year boundaries, future/unknown daily values, retry after
  chart failure and separate Attendance period selection. Rendered UI tests use
  mocked Recharts; actual browser chart appearance remains unverified.
- Matching charts: identical weekly values across both tabs, logged/verified totals
  across Attendance periods, readable monthly buckets and retry after a failed
  Attendance chart read. Existing attendance/history workflows remain available.

## Remaining verification

Live Supabase/Auth/PostgREST/Storage, real file bytes, email, provider backups,
browser/device/screen-reader journeys and production behavior were not verified.
Tests use synthetic transports, PGlite and fresh disposable loopback Postgres.
Historical equal-count read concurrency and provider/configuration limitations
remain; a successful build is compilation evidence, not a live security audit.

## Migration / deployment

No migration was created or applied. No reset/backfill/schema/RLS change is needed.
An installation already verified through M15 needs no SQL for this cleanup. Keep
installed M16 and historical records intact. Older projects must inspect their
actual ledger/catalog and add only missing reviewed prerequisites, following
[WEB_SETUP.md](WEB_SETUP.md) and the migration runbook.

Deploy the reviewed static build with the existing public Supabase settings,
refresh older clients and perform the disposable core-workflow/role/browser checks.
Do not replay initial_schema.sql on an existing database. No publication, push
or production deployment was performed by this task.

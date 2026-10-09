> Historical record: this document describes an earlier release or task.
> The current INSync.v3 scope is defined in [PROJECT_SCOPE.md](PROJECT_SCOPE.md).
> Reporting/export, bulk-import, backup UI and certificate issuance are outside the current user-facing scope.

# Master prompt: INSync functionality fixes

Copy the prompt below into a coding agent with access to the INSync repository.
This prompt requests implementation; creating this file does not execute it.

---

Act as the engineer responsible for completing the remaining INSync functionality
audit work. Inspect the repository, implement fixes, validate them, and produce a
change report. Do not stop at recommendations or a proposed plan.

## Context and starting point

- Project: INSync, a React/Vite application backed by Supabase Auth, PostgreSQL,
  RLS, RPCs, and private Storage, with Admin, Instructor, and Intern dashboards.
- Repository: https://github.com/x1n-yue/INSYNC.V3
- Work in the current checkout. Preserve existing user changes.
- Read applicable AGENTS.md instructions, SYSTEM_FUNCTIONALITY_AUDIT.md,
  WORKFLOW_CHANGE_REPORT.md, README.md, WEB_SETUP.md, supabase/RUNBOOK.md,
  supabase/migrations/README.md, and tests/README.md before making changes.
- The audit records F01-F09 as locally fixed and R01-R14 as open. Verify their
  current state rather than assuming the checkout still matches the report.
- The recorded baseline is 20 test files / 2,240 passing tests, passing lint and
  build, and zero known npm vulnerabilities. Establish the actual current baseline.
- M13 addresses attendance verification precision. M14 prevents removing the last
  Active Admin. Neither file's presence proves it was applied to a live project.

## Working rules

1. Implement in manageable phases. Reproduce defects where practical, fix their
   causes, add meaningful regression coverage, and continue through independent
   work without repeatedly asking for confirmation.
2. Preserve server-side authorization, RLS, private file access, audit evidence,
   role boundaries, and existing data. Do not solve failures by disabling guards,
   broadening access, bypassing validation, or substituting mock success.
3. Do not rewrite successful migrations or replay the initial schema on an existing
   project. Add forward migrations after the latest actual migration, with explicit
   prerequisites, grants, inspection queries, and deployment/recovery instructions.
4. Keep credentials out of source, logs, reports, and client bundles. Use documented
   public placeholders and disposable test accounts/data.
5. This task authorizes local implementation, tests, documentation, and preparation
   of deployment artifacts. Do not push, publish, alter production, send real emails,
   or mutate live accounts/files without separate explicit authorization.
6. If live access or a product decision is missing, document the precise dependency,
   prepare everything possible locally, and continue unrelated fixes. Label that
   item blocked or awaiting a decision; do not claim it is complete.

## Preserve these behaviors

- Admin manages assignments; Instructors see authorized assigned interns and their
  sections. Account switching must never expose another account's data or drafts.
- Same-account session refresh preserves active forms. Pending/Inactive account
  recovery and visible sign-out errors remain functional.
- Server-derived Manila attendance has one shift per start date and a 16-hour
  maximum. Do not introduce breaks, multiple shifts, or overtime policy implicitly.
- Only valid verified attendance in the assigned academic year counts toward
  current progress. Preserve NULL-year history and fractional storage precision.
- Approved current-version requirements participate in clearance. Evaluation
  scores remain informational unless a passing-score policy is explicitly approved.
- Display clock times as 12-hour AM/PM and hours to two decimals. Elapsed time is
  a duration; backend values retain their canonical formats and precision.
- Preserve document versioning, stale-review checks, submission retry identities,
  section recipient snapshots, master-data guards, and final-Admin protection.

## Required work and acceptance checks

### Phase 1: Release readiness and data completeness

**R01 — Deployment readiness.** Review and extend the read-only inspection at
supabase/inspection/05_workflow_readiness.sql as needed. Check function definitions,
owners/search paths/grants, RLS, trigger presence, private Storage configuration,
active administrators, and current academic year. Distinguish local rehearsal from
live verification. Produce an ordered list of only missing migrations when actual
deployment evidence is available; otherwise provide executable inspection steps.

**R02 — Incomplete lists.** Inventory remaining single-select list reads, including
master data, evaluations, corrections, alerts, open sessions, years, and
announcements. Implement deterministic scoped pagination or complete bounded reads
appropriate to each screen. Make truncation and read failure visible. Test an API
cap below fixture size, multiple pages, stable ordering, retry, and role filters.
Do not rely on increasing the provider's row cap.

**R03 — Scalable metrics.** Add authorized server-side aggregates and separately
paginated details so dashboard totals do not require downloading all records.
Match current shared metric rules for years, verification, invalid evidence,
document versions, partially approved checklists, and remaining hours. Test
cross-role isolation and numerical equivalence against representative fixtures.
Measure request counts and data volume before and after.

**R08 — Operational readiness.** Prepare a backup/restore and monitoring runbook,
including database versus Storage recovery, retention, redaction, alert ownership,
and a disposable restoration rehearsal. Implement monitoring hooks compatible with
the project's actual hosting choices. Do not represent a client download as a
provider backup. Mark provider settings and real restoration unverified until run.

### Phase 2: Recovery and reliable submissions

**R04 — Account recovery.** Implement forgot-password, the authorized password-change
callback/page, and confirmation resend. Use configured allowed redirects, generic
responses that avoid account disclosure, bounded requests, and useful pending/error
states. Test expired/invalid links, recovery session transitions, rate limiting,
success, and failure. Document required provider URL/email settings.

**R05 — Crash recovery.** Add a root Error Boundary covering dashboard rendering
and lazy-import rejection. Offer an accessible recovery action and avoid reload
loops. Test a rendering exception and a rejected dashboard chunk separately.

**R06 — Bounded operations.** Bound complete operations involving SDK/auth waits,
Storage upload/link/cleanup, and multi-page exports. A UI timeout does not prove
that a server write was cancelled. Preserve uncertain upload reservations and
reconcile possible commits before retrying or deleting evidence. Fault-inject
stalled promises, late success, partial export failure, and cleanup failure.

**R07 — Reload-safe announcements.** Persist a minimal account-scoped pending draft
and submission identity. Recover and reconcile it after reload before resending.
Clear confirmed submissions and define expiry/sign-out cleanup. Test a committed
send with a lost response followed by reload, duplicate retries, and account
switching. Keep server-derived recipient snapshots authoritative.

### Phase 3: Usability, accessibility, and freshness

**R10 — Accessible screens.** Associate labels and fields, name icon buttons, and
give mobile navigation/profile sheets correct focus trapping, Escape dismissal,
and focus return. Verify keyboard navigation, narrow layouts, touch interactions,
validation feedback, and typing during session refresh. Run real-browser checks
when available; distinguish DOM tests from screen-reader/device testing.

**R11 — Consistent time entry.** Implement explicit hour/minute/AM-PM correction
controls so entry follows the requested 12-hour presentation across devices.
Convert to existing canonical RPC values. Test midnight, noon, invalid input,
overnight dates, and edit round trips.

**R12 — Useful audit history.** Show date and time, add authorized actor/table/date
filters, and provide safely rendered previous/new-value details from event_data.
Retain legacy provenance. Keep filtering, page labels, navigation, refresh, and
CSV scope consistent; test injection-prone values and failed page reads.

**R14 — Freshness and startup.** Load data by screen where practical, preserve
drafts during refresh, and add scoped notifications or refresh prompts for changes
made by other accounts. If using Realtime, verify authorization and subscription
cleanup. Measure startup/request/bundle changes with stated fixtures and hardware;
do not claim browser performance from bundle size alone.

### Phase 4: Product-dependent features and history

**R09 — Unavailable workflows.** Inventory reports, bulk account import, document
archive export, certificates, and backup controls. Implement features whose scope
is already defined by repository requirements or user instructions. For undefined
scope, prepare concrete acceptance criteria, UI/API/schema proposals, and precise
decision questions. Cover report year/cohort/provenance; import identity,
duplicates, approval, dry run and rollback; archive access/privacy; and certificate
issuance/revocation. Keep unavailable features honestly labeled until operational.

**R13 — Historical placements.** Define whether instructor/company/section history
and previous-year document editing are required. Implement only confirmed policy
using forward-compatible placement history and authorization rules. Never infer
past membership from current assignments or invent backfilled historical facts.
Preserve existing year-scoped evidence and explicitly represent unknown history.

## Verification and delivery

- Run appropriate focused regression tests during each phase, then the complete
  suite, lint, production build, dependency audit, and git diff --check.
- Rehearse new SQL on a fresh disposable schema and an upgrade fixture containing
  existing history. Test privileges, rollback, concurrency, and negative access.
- Exercise the end-to-end journey: signup/activation; assignments; section roster;
  clock-in/out with uninterrupted typing; verification and refreshed progress;
  historical-year exclusion; document review; evaluation; announcements; recovery;
  audit navigation/export; and last-Admin handover/rejection.
- Use disposable browser/provider tests when access is available. Report actual
  results and limitations. Do not equate mocks with verified email or file delivery.
- Update setup, migration/runbook, and test documentation to match the final code.
- Create FUNCTIONALITY_FIX_REPORT.md with one row per R01-R14: status, evidence,
  changed files, tests, remaining dependency, and deployment action. Distinguish
  implemented locally, deployed/verified, awaiting access, and awaiting policy.
- Include migration order, provider settings, new environment placeholders,
  performance measurements, known limitations, and a practical release checklist.
- Preserve the original audit as a dated baseline and link the new report.

Start by inspecting the checkout and running baseline checks, then implement the
highest-priority independent fixes. Finish with working code and an accurate
report, explicitly accounting for every audit item.

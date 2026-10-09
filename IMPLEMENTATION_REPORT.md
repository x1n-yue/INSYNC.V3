> Historical record: this document describes an earlier release or task.
> The current INSync.v3 scope is defined in [PROJECT_SCOPE.md](PROJECT_SCOPE.md).
> Reporting/export, bulk-import, backup UI and certificate issuance are outside the current user-facing scope.

# INSync Focused Remediation Report

Date: 2026-10-08

This report records the implementation performed from `PROMPTFIXv2.txt`. The work is a focused reliability/functionality pass; it does not replace the application or mutate a real Supabase project.

## Implemented

- Authentication/session recovery:
  - explicit session restoration and profile-loading states
  - profile request sequencing to reject stale responses
  - missing/failed profile recovery with Retry and Sign out
  - unsupported-role fallback
  - honest logout failure handling
  - sign-in and registration `try/catch/finally` submission states
  - registration no longer treats `error = null` alone as proof of account creation
  - registration success messaging notes that email confirmation may still be required
- Certificate of Completion:
  - removed active certificate cards/buttons/entry points from the dashboards
  - preserved completion/progress, verified hours, targets, document review, and clearance logic
  - documentation now states that the application does not issue certificates
- Dashboard reliability:
  - per-resource error tracking in Admin/Instructor/Intern loading paths
  - stale-data warning/retry UI
  - failed reads preserve last-known resource data instead of converting failures to empty/zero state
  - prerequisite-dependent actions are blocked when required data is unavailable
  - request sequence guards prevent older dashboard reads from overwriting newer state
- Admin audit history:
  - deterministic ordering by `created_at` and `id`
  - 50-row pages with exact counts
  - navigation beyond the previous initial 50-record cap
- Admin master data:
  - returned-row confirmation for edits/inserts
  - guarded deletion workflow with deliberate confirmation and reference-impact display
  - company/course-section dependencies are cleared explicitly in the trusted server transaction and reported as an affected count
  - deleted IDs are removed from loaded assignment buffers
  - atomic current-academic-year operation
  - partial unique index enforcing at most one current academic year
  - current academic year cannot be deleted until a replacement is selected
- Accessibility/performance:
  - modal dialog semantics, accessible naming, Escape support, focus containment/return, and viewport scrolling
  - darkened success/warning/danger status tokens for small-text contrast
  - role dashboards are lazy-loaded with Suspense fallback
- Tests/documentation:
  - M10 migration and regression scenarios added
  - contrast regression expectation updated
  - progress, decisions, README, and deployment/runbook documentation updated

## Database migration

New migration: `supabase/migrations/M10_master_data_lifecycle.sql`

Apply only after the existing M02/M07 prerequisites and after confirming that existing data has at most one current academic year. The migration intentionally aborts if multiple current years already exist. It does not repair or rewrite historical records.

Operations introduced:

- `public.admin_set_current_academic_year(uuid)`
- `public.admin_delete_master(text, uuid)`

Both are security-definer operations with Active Admin checks, fixed search paths, trusted audit behavior, and authenticated-only execution.

## Verification

### Passed

- `npm run lint` — passed with zero errors and zero warnings.
- Direct JavaScript regression smoke — passed for required-hour validation, checklist validation, Manila date handling, and RPC cardinality/failure outcomes.
- PGlite M10 regression — passed for:
  - company deletion reference-impact reporting
  - deliberate dependent-reference clearing
  - atomic current-year switching
  - single-current-year invariant
  - current-year deletion blocking
- Certificate UI search — no active Certificate of Completion references remain under `src/`.
- Contrast smoke — success/warning/danger token pairs meet the 4.5:1 small-text threshold.

### Blocked by local environment

- `npm run build` — blocked before compilation because the uploaded `node_modules` tree is missing the Linux Rollup optional binary `@rollup/rollup-linux-x64-gnu`.
- `npm test` — blocked at the same Rollup/Vite startup dependency.

An offline dependency repair was attempted. The package directory remained without the required binary because the environment cannot reach the npm registry. No application code was changed to hide this dependency problem.

### Not performed

- Live Supabase SQL/Auth/Storage execution
- Browser desktop/mobile verification
- Screen-reader/accessibility-tree verification
- Production bundle-size measurement after lazy loading
- Concurrent real-browser Auth/session tests

## Deployment sequence

1. Rehearse M10 on a disposable database using the existing inspection/preflight procedures.
2. Confirm there is zero or one current academic year before applying M10.
3. Apply migrations in the documented order; do not rerun the destructive legacy schema against an existing database.
4. Verify the M10 current-year, guarded-delete, and audit behaviors with disposable Admin data.
5. Install dependencies from the lockfile in a normal networked environment, then run `npm run lint`, `npm test`, and `npm run build`.
6. Perform the live Supabase/Auth/Storage and browser/mobile verification listed above before treating the changes as deployment-ready.

No production readiness or live security claim is made by this local remediation.

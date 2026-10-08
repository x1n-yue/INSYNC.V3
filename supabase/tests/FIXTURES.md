# Disposable authorization and workflow fixture specification

Phase 0 specification only. No accounts/rows/objects created, no policy tests run.
Never target a real project. Use a fresh explicitly identified disposable project,
record its API row cap/Auth confirmation settings, and populate via trusted setup
outside browser code. Never embed service-role credentials in client/test artifacts.
No test may use public demo passwords or real student information.

## Accounts

For each row create separate Active, Pending and Inactive accounts (18 total).
Fixture IDs below are symbolic aliases resolved to actual Auth-generated UUIDs in
a private disposable manifest. Do not forge auth.users rows to match test UUIDs.
Use generated per-run passwords outside tracked files; emails use example.invalid.

| Alias | Effective role | Name | Relationships |
|---|---|---|---|
| admin | admin | Synthetic Admin | No intern assignment; Active variant is sole bootstrap operator-approved Admin. |
| instructor-a | instructor | Synthetic Instructor A | Own roster: intern-a, including its correction fixtures. |
| instructor-b | instructor | Synthetic Instructor B | Own roster: intern-b. |
| intern-a | intern | Synthetic Duplicate Name | Assigned instructor-a, company-a, section-a, target 486. |
| intern-b | intern | Synthetic Duplicate Name | Assigned instructor-b, company-b, section-b, target 486. |
| intern-c | intern | Synthetic Unassigned | No instructor/company/section, target 486. |

Suffix aliases/emails by status (e.g. intern-a-pending@example.invalid). Assign
Pending/Inactive intern variants to the matching **Active** instructor for status
tests. Pending/Inactive instructor callers target the Active instructor-a roster
as foreign access; also test a legacy own assignment using a dedicated anomaly
fixture. Include another duplicate-name instructor to test relationship labels if
the UI permits name-based choices. Create an authenticated missing-profile token
case via controlled disposable setup only; missing role/profile must deny access.

## Domain rows and generated objects

- Master data: two companies/sections; historical and current academic years;
  separate conflict fixture with two current flags only before the new invariant.
- Each active intern: closed unverified and staff-verified attendance, open session,
  reviewed correction, Pending correction, complete valid evaluation and a partial
  checklist. C remains unassigned. Alerts include intern-bound and legacy null
  intern_id cases; unscoped alerts are Admin-only by conservative default.
- Deterministic date fixtures: Manila 2026-10-07 00:00/00:30/07:59/08:00/23:59;
  22:00-06:00 next-day overnight; equal/reversed/>16-hour/future claims. Inject a
  frozen server/test clock for replay; never tie expectations to wall-clock today.
- Metrics: Oct 2025 8h; Oct 2026 4h/8h; sparse records crossing Monday/month/year;
  exact target and just-below threshold, invalid/missing target and unknown read.
- Documents: zero/partial/custom/complete types, Pending/Approved/Needs Revision,
  current and stale versions, missing object/path, wrong folder, orphan candidate.
  Generate tiny PDF/PNG/JPEG fixtures locally; invalid MIME and 10 MiB boundaries.
  Object path always derived from actual fixture Auth UUID, never display name.
- Evaluations: all 1s=20, all 5s=100, 4/5/3/2=75; empty/missing/extra keys,
  strings/fractions/null/out-of-range, forged author, null/inconsistent total;
  same idempotency key retry and distinct new evaluation instance.
- Announcements: A-only, B-only, roster snapshot broadcast, duplicate-name target,
  forged author, foreign UUID, unassigned recipient and reassignment after send.
- Audit: trusted mutation events, blocked direct insert, audit failure rollback.
  No file contents/passwords/tokens in audit event fixtures.
- Anomaly-only dataset BEFORE constraint validation: duplicate daily attendance,
  Pending corrections, checklist types, invalid numeric targets, role mismatches,
  malformed JSON and ambiguous time-only legacy rows. Never silently repair these.
  Separate this from valid fixtures AFTER migration to avoid impossible inserts.

## Phase 1 policy suite contract (RT-01 to RT-04)

Exercise all 12 tables: profiles, interns, companies, course_sections,
academic_years, attendance_logs, attendance_exceptions, evaluations, documents,
announcements, alerts, audit_logs; plus storage.objects/documents bucket.
Enumerate roles x statuses x own/assigned/foreign x SELECT/INSERT/UPDATE/DELETE,
including anonymous and authenticated missing-profile. Reference tables lack
ownership, so annotate that axis N/A and exercise read/admin-write rules explicitly.
Pending/Inactive: minimal own-profile status only; no business or Storage access.
Admin: explicit permitted operations; controlled RPC-only tables still reject raw
writes. Intern: own reads/constrained RPCs, never review or checklist provisioning.
Instructor: assigned scope only; no ownership/assignment/target-field changes.

For every allowed operation re-read exact row/object and reviewer/actor/time. For
every denial compare before/after snapshots and counts; zero rows can be denial,
not success. Probe both old and new ownership, protected columns, permissive policy
overlap, retained JWT after deactivation and relationship/profile joins. Direct
REST/SDK and SQL impersonation complement each other; neither UI hiding nor build
output satisfies the matrix. Use PostgreSQL SET LOCAL ROLE authenticated and
transaction-local JWT claims only inside rollback transactions on disposable SQL
fixtures. Never impersonate roles in real projects. Auth/Storage HTTP fixtures
cannot be transaction-rolled-back and require explicit disposable cleanup.

## Later phase gates

RT-05/06/07: lifecycle/assignment, master/year and checklist idempotency.
RT-08-13: clock/review contention (separate connections, barriers), repeat/stale
transitions, lookup/attendance/status/audit fault injection, mixed bulk outcomes.
RT-14-17: rubric, upload cleanup/version conflicts, announcements, canonical totals.
RT-18/19: API-cap-plus-100 volume, aggregate reconciliation, detail/audit pagination,
focus refresh, transport failures, out-of-order auth, missing profile and zero rows.
RT-20-22: real artifacts/operational honesty, browser/mobile/screen-reader and clean
supported-runtime build/migration rehearsal. Browser verification remains required.

Record test ID, fixture alias/scope, expected rule, response, before/after counts,
actor/reviewer, actual outcome and pass/fail. Capture no real credentials. Teardown
only the named disposable project/fixture namespace after preserving redacted
results; never blanket Storage DELETE or run bootstrap to reset an existing project.

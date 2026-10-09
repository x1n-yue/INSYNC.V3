> Historical record: this document describes an earlier release or task.
> The current INSync.v3 scope is defined in [PROJECT_SCOPE.md](PROJECT_SCOPE.md).
> Reporting/export, bulk-import, backup UI and certificate issuance are outside the current user-facing scope.

# INSync workflow change report

Historical baseline retained. The 2026-10-08 follow-up implementation and current
R01-R14 status are in [FUNCTIONALITY_FIX_REPORT.md](FUNCTIONALITY_FIX_REPORT.md).
Original findings and validation counts below describe their recorded release.

Date: 2026-10-08

The follow-up [overall functionality audit](SYSTEM_FUNCTIONALITY_AUDIT.md) records
additional auth/audit/setup fixes, M14 final-Admin protection, and remaining
priorities. It supersedes this report's earlier overall verification totals.

## Delivery status

All ten requested workflow improvements are implemented in the local source.
Database changes are supplied as M11, M12, and the M13 follow-up fix and rehearsed
against disposable PostgreSQL. No live Supabase database, Auth account, or Storage object was changed.
**Apply the migrations before deploying this client.**

## Earlier reported issues included in this release

- **Restoring session:** startup session restoration and profile loading have
  bounded waits, visible failures, and working Retry controls. Retry starts a fresh
  restoration attempt instead of leaving the original loading screen in place.
- **Clock-out accomplishments typing:** the shared modal initializes focus once
  when opened and retains the latest close callback separately. Typing rerenders
  no longer move focus away from the accomplishments field. Escape, focus trapping,
  and focus restoration remain covered by regression tests.
- **Shared hour progress:** both roles calculate completed hours from verified,
  valid attendance. Instructor verification updates its own progress immediately;
  the Intern loads the saved result with Refresh data. Both now use the assigned
  academic year consistently.
- **Section assignment and roster visibility:** Admin assigns sections; Instructors
  see and filter their assigned interns by section in the roster and progress views.
  The ten changes below extend those workflows across the other screens.

## Changes by concern

| # | Concern | Delivered behavior |
|---|---|---|
| 1 | Ordinary attendance could remain unverified | Instructor **DTR Review → Attendance Verification** lists recorded shifts, accomplishments, section, original academic year, and status. Closed, valid, unverified shifts have a **Verify attendance** action. Saved verification immediately updates Instructor progress; Interns load it with Refresh data. |
| 2 | Intern section/assignment visibility | A **My Internship Assignment** panel shows instructor, company, section, academic year, and required hours on the Intern dashboard. Missing assignments are explicit. |
| 3 | Intern company name was not loaded | The assignment query now fetches related company, section, and academic-year names under existing RLS. Instructor names still come from the scoped related-profile RPC. |
| 4 | Cross-account changes stayed stale | All three role dashboards expose **Refresh data**, a timestamp of the last complete successful refresh, and guidance to refresh for other users' changes. Instructor retains Refresh roster. Partial failures retain the previous timestamp and show stale/unavailable warnings. |
| 5 | Activation and onboarding were confused | Admin Intern Assignments shows a six-item checklist: instructor, company, section, academic year, valid required hours, and the assigned year's four standard requirements. Interns see missing setup and are directed to Admin. Account activation explains that sign-in access and onboarding readiness are separate. |
| 6 | Missing-document guidance named the wrong role | Both Intern and Instructor empty requirement states direct users to an administrator to attach the standard checklist. |
| 7 | Section support was limited to two screens | Instructor section and academic-year assignment filters are available across roster, progress, evaluations, DTR review, documents, and announcements. Intern selectors and review lists honor the visible assigned roster. Announcements support a server-validated **Section** audience. |
| 8 | Other requests could load indefinitely | Shared timeout handling bounds profile reads, dashboard resources, RPCs, sign-in/registration/sign-out, and underlying HTTP. Profile and dashboard errors expose recovery controls. SDK pagination has a separate whole-operation bound. |
| 9 | Repeated announcement submissions | Sending disables editing and the Send button, uses an immediate in-flight guard, and retains a submission UUID for retries after an ambiguous response. The server returns the existing announcement for the same author/key/content and rejects a changed payload under that key. Failed submissions preserve the draft. |
| 10 | No academic-year membership/history | Admin explicitly assigns an academic year. New attendance, corrections, evaluations, and requirements retain an immutable year snapshot. Progress and clearance use the assigned year's records. Historical attendance, evaluations, documents, and DTR CSV retain their original year; checklists can exist independently for each year. |

## Database and authorization

### M11: attendance and academic-year workflows

File: [M11_attendance_year_workflows.sql](supabase/migrations/M11_attendance_year_workflows.sql)

- Adds nullable academic-year references to interns and four domain record tables.
- Adds verification timestamps for new attendance reviews. Historical reviewer
  timestamps are not invented.
- Adds `verify_attendance`, restricted to Active Admin or the currently assigned
  Active Instructor. Interns, anonymous callers, inactive staff, and instructors
  outside the assigned roster cannot verify.
- Verification locks the intern/session and compares the expected clock-in,
  clock-out, and hours before changing the row. Open or legacy/invalid evidence
  requires correction. Existing attendance constraints remain in force.
- An identical retry after verification returns the saved record without a second
  update/audit. A concurrent assignment transfer is checked before authorization.
- Adds the six-argument Admin assignment API including academic year. The original
  five-argument operation stays available for compatibility and preserves the year.
- Blocks academic-year reassignment while a session remains open.
- Uses per-intern, per-year requirement uniqueness, including one unassigned-year
  checklist. Attaching standard requirements remains idempotent.
- Preserves Admin custom-requirement creation with the existing limited column
  grant. The year-binding trigger acquires its own roster lock without granting
  browser clients raw intern UPDATE access.
- Corrections preserve the year of existing attendance, or the request's original
  year if attendance is created on approval. They do not move hours into a new year.
- Referenced academic years cannot be deleted. Assignment-year changes are recorded
  in the existing mandatory audit, with previous/new year IDs.

### M12: section announcements and retry protection

File: [M12_section_announcements.sql](supabase/migrations/M12_section_announcements.sql)

- Adds `send_announcement` with a required submission UUID.
- Audiences are **My active roster**, **Section**, or **Personal**. Recipients are
  derived from the author's active assigned interns, never a browser-supplied list.
- Section audiences retain their section ID/name and recipient snapshot even if
  section membership changes later. A deleted section does not rewrite sent history.
- Raw announcement INSERT is revoked. Submission and mandatory audit commit together.
- Subject/message limits are enforced in both client and database.

No RLS policy was broadened, and no service-role key or new production dependency
was introduced.

### M13 follow-up: fractional-hour attendance verification

File: [M13_attendance_verification_precision.sql](supabase/migrations/M13_attendance_verification_precision.sql)

- Reproduced a failure where a valid shift with seconds/microseconds returned
  **Attendance changed; refresh before verifying**. PostgreSQL's exact numeric
  hours survived in storage, but JSON parsing rounded them to a JavaScript number.
  M11 incorrectly compared that number to the stored decimal with exact equality.
- Compares expected hours using the browser's double-precision representation.
  Stored hours are not rounded or rewritten. Timestamp comparisons remain exact,
  including microseconds; the database interval constraint remains authoritative.
- Retains current-assignment authorization, locks, mandatory audit, and retry
  behavior. Regression tests cover JSON conversion, actual server clock-in/out,
  modified hours, and a one-microsecond timestamp mismatch.
- If M11/M12 are already installed, apply only M13 as postgres, then refresh the
  Instructor page. This correction requires no new environment setting or client
  build. Existing deployed migration files are unchanged.
- This reproduces a code defect locally; the user's particular live failure is
  not confirmed without their error message and deployed migration state.

## Academic-year behavior and operational choices

- **Existing records are not backfilled.** Their NULL year is shown as
  **Unassigned academic year**. Setting a current year is not historical evidence.
- Assigning an intern a year changes the scope of their progress and checklist.
  Earlier and unassigned records remain accessible in history and CSV, but do not
  count toward the newly assigned year's progress. The interface explains this.
- Admin must select the internship year explicitly; it is not automatically copied
  from the current-year setting.
- Instructor year filtering selects interns by their current assignment. DTR review
  still shows those interns' original-year attendance history. Historical cohort
  membership is not inferred from today's instructor/section assignments.
- Interns can choose current-year or historical documents. Instructors can enable
  document history for a selected intern. Historical evaluations display their year.
- Section announcements explicitly include active assigned recipients across their
  assigned years. Full-roster announcements explicitly include all sections/years.
  Individual recipient options follow the current screen filters.
- Cross-account updates use manual refresh. No realtime channel or background refresh
  was added, avoiding unexpected replacement of form drafts while typing.
- Active status continues to enable sign-in. The onboarding checklist is visible
  guidance; it does not silently deactivate existing accounts or block their access.
- Requests generally time out after 15 seconds; a complete paginated resource read
  has a 20-second bound. Sequential dashboard phases can take more than one timeout
  interval. Mutations are not automatically retried after timeout: refresh to check
  the committed state first. Announcement retries retain their key while the screen
  remains mounted; after a page reload, check Sent Announcements before resubmitting.

## Follow-up: 12-hour attendance display

- Intern DTR times, the clock-in confirmation, submitted correction times, and
  Instructor verification/correction tables now show 12-hour times with AM/PM
  (for example, `16:30:00` displays as `04:30 PM`). The active session's clock-in
  display already used the same format.
- A shared formatter handles local database time fields without shifting them
  into the browser's timezone. Noon and midnight show `12:00 PM` and `12:00 AM`.
- This is a client display change. Stored timestamps, hours, RPC arguments,
  elapsed durations, and raw CSV evidence keep their existing formats. No new
  Supabase migration or setting is required; deploy the rebuilt website.
- Verification: the 14 existing attendance and dashboard tests passed, lint
  passed, production build passed, and eight direct formatting checks passed.

## Validation

Completed-hours display follow-up: the Intern DTR, chart tooltips, chart axis,
and clock-out confirmation use the shared two-decimal hours formatter. For
example, `0.14133132277777777` displays as `0.14`. Stored hours, calculations,
verification arguments, and CSV evidence retain full precision. No new Supabase
migration is needed. All 13 focused dashboard/metrics tests, lint, and the
production build passed for this update.

Final local verification completed on 2026-10-08:

| Check | Result |
|---|---|
| `npm test` | **20 test files passed; 2,223 tests passed**, including the M13 regressions |
| `npm run lint` | **Passed** |
| `npm run build` | **Passed** for the workflow release; M13 changes SQL/tests/docs only, so no new client build is required |

Coverage includes:

- Dashboard DOM tests: fetched assignment names, saved section/year persistence,
  onboarding readiness, scoped totals, retained history, refresh, profile/read
  timeout recovery, section filters, ordinary verification and announcement retry.
- Pure client tests: year scoping, missing setup, timeout cleanup and HTTP cancellation.
- Native disposable PostgreSQL: authorization, expected evidence, year immutability,
  year deletion protection, per-year requirements, correction-year retention,
  Admin custom-requirement privileges, audience privacy, submission-key conflicts,
  and mandatory-audit rollback.
- Observed native lock waits: two reviewers retrying one record produce one update;
  an assignment transfer prevents the former instructor's pending verification.
- Fresh-schema rehearsal through M13 using synthetic provider fixtures.

The complete run exposed an older M10 test that attempted a forbidden raw intern
UPDATE and expected only one company audit event. Its fixture now uses the protected
assignment RPC and asserts both audited INSERT and DELETE. Production privileges
were not weakened to satisfy the test.

## Deployment steps

1. Follow [RUNBOOK.md](supabase/RUNBOOK.md) to establish the deployed migration state.
   Do not replay the initial schema or legacy reset against an existing project.
2. Rehearse M11, M12, and M13 on disposable data. Confirm the structural migrations through
   M10 are present. Existing M05/M09 historical-validation gates retain their own
   review requirements; this work does not normalize legacy records.
3. In a maintenance window, apply **M11**, then **M12**, then **M13**, as the trusted database owner.
   Each file is transactional and requests a PostgREST schema-cache reload.
   Apply only missing migrations. For projects already through M12, apply M13 only.
4. Deploy the rebuilt client. Older clients using raw announcement INSERT will fail
   after M12, so coordinate the database/client rollout.
5. In Admin → Interns, explicitly assign each current internship's year and save it,
   then attach that year's missing standard requirements. Review the handling of
   unassigned historical hours before moving existing interns to a year.
6. With disposable live accounts, check clock-out → Instructor refresh → verification
   → Intern refresh, company/section/year display, section announcement delivery,
   rejection of unrelated users, and recovery from a disconnected network.

Fresh-project setup instructions now include M10–M13. Keep the migrations and this
report with the release record. After applying these migrations, use forward fixes
that retain historical evidence and recipient/submission identities.

## Remaining limits

These tests do not establish the state of a deployed Supabase project or actual
email/Storage delivery. Real browser/mobile behavior and live PostgREST/Auth/RLS
must still be checked after rollout. Existing unavailable report-generation,
bulk-import, backup, and certificate features remain outside these ten changes;
the new year model does not claim those features are implemented.

> Historical record: this document describes an earlier release or task.
> The current INSync.v3 scope is defined in [PROJECT_SCOPE.md](PROJECT_SCOPE.md).
> Reporting/export, bulk-import, backup UI and certificate issuance are outside the current user-facing scope.

# INSync overall functionality audit

Historical baseline retained. The 2026-10-08 follow-up implementation and current
R01-R14 status are in [FUNCTIONALITY_FIX_REPORT.md](FUNCTIONALITY_FIX_REPORT.md).
Original findings and validation counts below describe their recorded release.

Date: 2026-10-08, Asia/Manila. Scope: the current local React/Vite application,
Supabase schema and migrations, automated tests, setup instructions, and CI.

## Assessment

The main internship workflows have substantial local test coverage: protected
account/assignment management, clock-in/out, attendance verification and
corrections, year-scoped progress, document versions/review, evaluations,
announcements, master data, and CSV downloads. This audit found additional
failures beyond the existing passing tests and repaired the items below.

This is a **local source and test assessment**, not a certification of the deployed
website. No live Supabase database, Auth account, Storage file, GitHub remote, or
hosting deployment was changed. Deployment state, real email delivery, browser
behavior, provider file delivery, and backups remain unverified.

## Findings repaired during this audit

| ID | Priority | Finding and impact | Fix and evidence |
|---|---|---|---|
| F01 | High | The final Active Admin could deactivate themselves or change to Intern/Instructor, leaving the application without an administrator. Reproduced against native PostgreSQL. | [M14_last_active_admin.sql](supabase/migrations/M14_last_active_admin.sql) guards profile role/status changes and deletion. It preserves first-Admin bootstrap, permits handover to another Active Admin, and serializes concurrent changes with the existing lifecycle lock. Tests cover Inactive/Pending, both demotions, handover, Auth cascade, helper grants, and an observed concurrent lock wait. **Requires deployment.** |
| F02 | High | A same-account token refresh replaced the dashboard with Loading profile, unmounting forms and losing an unsaved accomplishment/announcement/evaluation draft. Reproduced in a rendered App test. | [App.jsx](src/App.jsx) keeps the same user's dashboard mounted during a profile recheck. A different signed-in account still receives a loading screen instead of the previous account's dashboard. Draft preservation and account isolation pass. |
| F03 | Medium | Unexpected profile responses were not checked against the signed-in user. | App rejects a mismatched profile with a recoverable error. A regression test confirms that it neither opens the wrong dashboard nor remains indefinitely on Loading profile. This is defensive transport validation; the normal `my_profile` RPC remains authoritative. |
| F04 | Medium | Admin Next → Previous changed the label to Page 1 while leaving Page 2 records. Refresh data on Page 2 loaded Page 1 records under the Page 2 label. | [AdminDashboard.jsx](src/components/AdminDashboard.jsx) commits page/rows/count together after successful reads, reloads the selected page, sequences requests, clears recovered audit errors, and disables navigation during paging. A 55-record DOM fixture checks both navigation and refresh. |
| F05 | Medium | Sign-out failures on Pending/Inactive and other centered account screens were stored but not displayed, making the action appear unresponsive. | Centered account/profile/error states now show the failure. Pending and Inactive regression cases pass. |
| F06 | Medium | A Pending user had no in-place way to check whether Admin had activated their account. | Added **Check activation** / **Check account status**, with a pending state while checking. A Pending → Active test opens the authorized dashboard without signing out. |
| F07 | Medium | Verifying an older/unassigned-year attendance record claimed that assigned-year progress now included it, although year-scoped metrics correctly excluded it. | [InstructorDashboard.jsx](src/components/InstructorDashboard.jsx) explains the different-year result and current-year scope. A regression verifies the historical record while confirming current-year remaining hours stay unchanged. |
| F08 | Medium | README/WEB_SETUP required `.env.example`, but the file was missing. A fresh GitHub clone could not follow the documented setup. Only `.env` itself was ignored. | Added a public-placeholder [.env.example](.env.example), preserved existing `.env` when following setup, and ignored environment variants while retaining the template. No existing credentials were read, copied, or changed. |
| F09 | Low | Setup used an obsolete local folder path; the original audit/checklist could be mistaken for current implementation status. | Corrected the setup path and marked old findings as historical, with links to this audit and current progress. |

F02, F04, F05, F06 and F01 transition failures were observed before their fixes.
The final-Admin tests use disposable data; the Auth-cascade fixture explicitly
matches `initial_schema.sql` because the older shared synthetic baseline uses a
restrictive profile/Auth foreign key. Production foreign keys were not changed.

## Functional coverage and current capability

| Area | Current behavior | Evidence and limit |
|---|---|---|
| Registration and session | Public signup creates Intern/Pending; restored sessions load an authorized profile; timeout/retry and activation recheck are available. | Actual App DOM tests and local signup/schema tests. Real confirmation email/redirect settings not tested. |
| Accounts and assignments | Active Admin manages effective role/status, instructor/company/section/year and valid required hours through protected operations. | Native authorization, atomic rollback, relationship and assignment tests; dashboard persistence tests. M14 prevents last-Admin removal after installation. |
| Attendance | Server-derived Manila clock events, one daily/open identity, accomplishment capture, ordinary staff verification, and single/bulk correction review. | Native interval/permission/audit/race tests plus DOM verification. M13 fixes JSON fractional-hour comparison. Legacy invalid evidence still needs explicit review. |
| Hours and clearance | Shared rules across roles; verified valid hours and current-year approved requirement evidence determine eligibility. | Shared metric tests and dashboard tests. Existing NULL-year history is retained and does not move when a year is assigned. |
| Documents | Admin checklist attachment, owner upload reservations, version preservation, stale-review checks, approval/revision/revoke, signed links, and cleanup recovery. | Local SQL and synthetic Storage transport tests. Actual Supabase Storage bytes, MIME contract, and signed URL delivery remain a live-test requirement. |
| Evaluations | Server-scored weighted rubric with submission UUID retries and year labels/history. | Native validation/permission/retry tests. No passing evaluation threshold is part of clearance policy. |
| Announcements | Personal, roster, and section audiences use server-derived recipient snapshots; retries retain a key while mounted. | Native privacy/retry tests and DOM repeated-click tests. Key persistence across a full page reload remains open. |
| Master data | Guarded company/section deletion, atomic current-year selection, and protection of referenced academic years. | Local database tests. Company/section deletion intentionally clears current assignments after confirmation. |
| Downloads | Intern DTR CSV, Admin audit CSV, and blank CSV/XLSX planning templates. | Escaping, pagination/count checks, permission and artifact tests. Downloads are informational and not transactionally consistent snapshots. |
| Time/hour display | Recorded times show 12-hour AM/PM; displayed hours use two decimals; elapsed time remains a duration. | Existing attendance/dashboard checks and production build. Native correction input presentation follows device/browser locale. |
| Reports/import/backup | Instructor reports, other Intern summaries/archives, bulk import, certificates, and manual backup remain unavailable. | Controls explicitly say unavailable. Template downloads do not import or provision accounts. Provider backups are separate. |

## Remaining issues and recommended fixes

These are **open items**, not changes silently included in this release.
Priority 1 means address before relying on a deployment at the affected scope;
Priority 2 is the next reliability/functionality pass; Priority 3 is usability.

| ID | Priority | Area / evidence | Recommended next change and acceptance check |
|---|---|---|---|
| R01 | 1 | **Deployed schema and permissions are unknown.** Local tests do not prove the real project has M01-M14 or matching RLS/grants/Storage settings. | Run the read-only [workflow readiness inspection](supabase/inspection/05_workflow_readiness.sql), compare definitions/permissions with the runbook and deployment ledger, then apply only missing reviewed migrations. Verify with disposable Admin/Instructor/Intern/Inactive/unassigned accounts through real APIs. |
| R02 | 1 for large datasets | **Some secondary lists still use a single `.select()`.** Admin master lists, Intern evaluations/corrections/year lists, and Instructor correction/alert/open-session/announcement lists are examples. These can be capped without an explicit completeness error. Main roster/attendance/document metrics already use complete reads. | Add scoped, count-checked pagination to the remaining lists. Test with an API cap below the fixture size, including more than one page of open sessions and corrections. Do not solve this solely by raising the provider cap. See the pagination note below. |
| R03 | 2 | **Dashboard metrics require downloading whole authorized datasets.** [workflows.js](src/lib/workflows.js), [exports.js](src/lib/exports.js): 50,000-row bound and 20-second complete-resource deadline. | Add RLS-scoped server aggregates and paginate details separately. Compare results against current shared rules for invalid evidence, years and partial checklists, then measure realistic workloads. This is a scalability limit, not a failed small-fixture test. |
| R04 | 2 | **Forgot-password and confirmation-resend flows are absent.** [LoginPage.jsx](src/components/LoginPage.jsx) supports sign-in and registration only. | Add reset email, password-change callback and confirmation resend with generic responses and bounded requests. Test redirects, expired links, provider rate limits and actual delivery in a disposable project. See the Auth note below. |
| R05 | 2 | **A failed lazy dashboard import or rendering exception has no root Error Boundary.** [App.jsx](src/App.jsx), [main.jsx](src/main.jsx). Suspense handles waiting, not rejected imports. | Add an application Error Boundary with an explicit reload/recovery action, then test a rejected dashboard chunk and a rendering exception. See the React note below. |
| R06 | 2 | **Not every SDK wait has a caller-level deadline.** [documents.js](src/lib/documents.js) awaits Storage operations directly; [exports.js](src/lib/exports.js) awaits profile/page requests directly. Global HTTP fetch is bounded, but that alone does not bound a wait before fetch or an entire export. | Apply operation-appropriate deadlines and cancellation/reconciliation handling. Fault-inject a stalled SDK/auth lock, signed-link preparation, cleanup and a multi-page export. Preserve possibly committed upload evidence during recovery. This is a source-identified risk; no live indefinite wait was observed in this audit. |
| R07 | 2 | **Full reload loses the announcement submission key and draft.** [InstructorDashboard.jsx](src/components/InstructorDashboard.jsx) keeps these in refs/state. | Persist pending submissions per account, recover them on return, and reconcile before resending. Test a committed send with a lost response followed by page reload; ensure account switching cannot reuse another user's draft/key. |
| R08 | 1 before operational reliance | **Provider backup/restore, monitoring and real delivery are unverified.** The backup UI accurately remains disconnected. | Establish the provider's actual backup/retention and file-recovery process; rehearse restoration on disposable data. Add error/availability monitoring and a release smoke test without recording credentials or private document contents. |
| R09 | 2 / product scope | **Several advertised workflow categories are intentionally unavailable:** report generation, bulk account import, document archive export, certificates and manual backup. | Prioritize the needed features explicitly. For reports, define year/cohort scope and data provenance. For import, define duplicate identity/approval/rollback rules. For certificates, define authorized issuance and revocation rather than treating clearance as issuance. |
| R10 | 2 | **Browser/mobile/accessibility coverage is incomplete.** Login labels lack explicit input associations; mobile More/Profile sheets in [Shell.jsx](src/components/Shell.jsx) do not use the shared focus-trapped Modal. | Associate labels, name icon buttons, add keyboard/focus behavior to sheets, and run real narrow-screen, keyboard and screen-reader checks. Test both touch navigation and form entry during session refresh. |
| R11 | 3 | **The native correction picker can still appear as 24-hour time on some devices**, even though recorded times display AM/PM. | Use explicit hour/minute/AM-PM controls if enforced 12-hour entry is required, while sending canonical 24-hour values to the existing correction RPC. Check midnight, noon and overnight entry. |
| R12 | 3 | **Audit entries show clock time without their date or an in-app structured change view.** Full event metadata exists in the audit CSV. | Show date plus time, add actor/table/date filters and a previous/new-value detail view using trusted `event_data`. Retain legacy provenance labels. |
| R13 | 2 if historical cohort reporting is required | **Year snapshots are not full placement snapshots.** Historical records retain year but do not freeze instructor/company/section membership. Instructor access/filtering follows current assignment. | Define placement/section membership history before implementing historical cohort reports. Do not infer old membership from current assignments or backfill guesses. Decide separately whether previous-year document replacements should remain editable. |
| R14 | 2 / usability | **Cross-account changes require manual refresh**, and many screens fetch all role resources at startup. Current application JS includes a roughly 472 kB shared chunk and 398 kB Intern chunk before gzip. | Measure mobile startup and large-roster latency; load data per screen and use lightweight change notifications or refresh prompts that preserve drafts. Keep freshness timestamps and recovery states. These sizes are build measurements, not a browser performance score. |

Supabase documents a default maximum of 1,000 returned rows and supports
pagination; the project's actual configured cap has not been inspected. The R02
impact is inferred from the remaining unpaginated source queries and that provider
contract. [Supabase select reference](https://supabase.com/docs/reference/javascript/select).

Supabase's password recovery flow requires a reset request and a change-password
page with configured redirects; adding only a Forgot password button is incomplete.
[Supabase password Auth guide](https://supabase.com/docs/guides/auth/passwords).

React sends a rejected `lazy` import to the nearest Error Boundary. The current
root has Suspense but no such boundary, which is the basis of R05.
[React lazy reference](https://react.dev/reference/react/lazy).

## Business rules to confirm before expanding features

- One shift per Manila start date, with no second shift after closure; maximum
  shift duration is 16 hours. Multi-shift, breaks and overtime require a deliberate
  domain change rather than removing constraints.
- Current-year verified hours and current-version approved requirements drive
  clearance. Existing unassigned history is preserved and does not automatically
  count toward a newly assigned year.
- Onboarding readiness and Active sign-in status are separate. Evaluation scores
  are informational until a passing-score requirement is commissioned.
- Section announcements reach the author's active assigned interns in the chosen
  section across assigned years; they do not implement a global school broadcast.

These are existing rules, not newly enforced institutional policies in this audit.

## Verification

Baseline: 20 files / 2,223 tests passed, lint passed, production build passed,
and `npm audit --ignore-scripts --json` reported zero known vulnerabilities.

Final results:

- `npm test`: **20 files / 2,240 tests passed**.
- `npm run lint`: passed.
- `npm run build`: passed; shared JS 471.79 kB (135.79 kB gzip), Intern
  dashboard JS 397.97 kB (115.31 kB gzip).
- `npm audit --ignore-scripts --json`: **zero known vulnerabilities**.
- `git diff --check`: passed; Git's LF/CRLF conversion notices are informational.

New coverage exercises the actual rendered auth/dashboard state, audit navigation,
historical verification messaging, and native PostgreSQL authorization/concurrency.
Fresh-project rehearsal now applies the actual initial schema and M01-M14 against
synthetic provider fixtures. The readiness inspection is executed against the
complete local schema. Tests use no external database URL or live credentials.

No real-browser/mobile or live Supabase end-to-end test ran. Passing local tests,
a clean npm advisory report and a successful build do not establish deployed
permissions, email/Storage delivery, restored backups, or production throughput.

## Deployment and next actions

1. Review this report and [RUNBOOK.md](supabase/RUNBOOK.md). Run the read-only
   readiness inspection against the intended project and compare migration records.
   Presence indicators do not prove exact definitions or replace the migration ledger.
2. Rehearse and apply **only missing migrations**. If already through M12, apply
   **M13**, then **M14**. If M13 already succeeded, apply M14 only. M14 requires the
   account lifecycle installed by M07; fresh installations use initial_schema then
   M01-M14 in order. Existing M05/M09 historical-validation gates remain separate.
3. M14 does not create an administrator or repair a project that already has zero
   Active Admins. Such a project needs a trusted operator to review account recovery;
   new empty projects still use the documented first-Admin procedure.
4. Commit/push the local code, migrations, environment template, inspection and
   reports. Redeploy the client to receive the auth/pager/message fixes. No new
   environment variable, Storage bucket, or package dependency was introduced.
5. Use disposable live accounts to check signup/activation, same-user token refresh
   while editing, account switching, clock-out → verification → refreshed progress,
   historical-year verification, document upload/review/link recovery, section
   announcements, audit Next/Previous/Refresh, and last-Admin handover/rejection.
6. Address R02 and R03 before substantial data growth, and schedule R04/R05/R10 as
   the next user-facing reliability pass. Track actual provider verification under
   R01/R08 separately from local source fixes.

Do not replay the initial schema, legacy reset, successful migrations, or remove
authorization/integrity checks to get past a deployment error. M14 changes a
trigger/function only and does not rewrite existing records or historical evidence.

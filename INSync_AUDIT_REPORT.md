# INSync repository audit

Audit date: 2026-10-07 (Asia/Manila). Repository: `D:\Development\Projects\INSYNC.v2`. Reviewed HEAD: `f89766f0b1a2516b00e9cade263e10a64b9f2968`, including the existing untracked `AI_CONTEXT_PROMPT.md` as orientation. Source line references describe the files at audit time.

## 1. Overall assessment

The supplied SQL does not enforce the application's three-role trust model. A user can change their own role/status, public signup accepts an authoritative privileged role, and Pending/Inactive status is absent from database and Storage policies. Even without those escalation paths, instructors have broad access outside their assignments, and interns can falsify their own verification and document approval fields. These are release-blocking authorization findings in the repository; whether identical policies are deployed is unverified.

Attendance also has independent integrity defects: duplicate daily rows are possible, DTR approvals are not atomic, and mixing UTC dates with local clock times can inflate a Manila shift by 24 hours. Several controls report imports, downloads, or backups that never happen. A successful production build does not establish runtime correctness or security.

| Severity | Findings |
|---|---:|
| Critical | 2 |
| High | 13 |
| Medium | 21 |
| Low | 3 |
| **Total** | **39** |

Counts are deduplicated finding records, not advisory counts or numbers of affected screens. Intentional limitations are listed separately in section 6; their misleading presentation is covered by findings where applicable. Conditional findings explicitly identify their preconditions. No live exploitation or real-data mutation was performed.

## 2. Checks performed and verification limits

### Repository and environment

- Searched for `AGENTS.md` in the repository, including hidden paths outside dependency/git directories, and at `D:\`, `D:\Development`, and `D:\Development\Projects`. None was found. There were no applicable repository instructions to read.
- Read README, package scripts/lockfile, Vite configuration, all application source files, both SQL files, and the supplied context file. The SQL inventory is 12 application tables, two functions, one signup trigger, and three document-bucket policies. There is one patch; no migration directory/history, Supabase project configuration, test files, test runner, lint script, or CI/deployment configuration was found.
- Existing changes at start: only untracked `AI_CONTEXT_PROMPT.md`. Application source and SQL were not changed. Only the two audit Markdown deliverables were created. The requested build regenerated ignored `dist/` artifacts.
- Node `v24.15.0`, npm `12.2.0`; dependencies were already installed. No install, upgrade, audit fix, schema execution, migration, database reset, or user-record change occurred.
- No `.env`, `.env.example`, test-account credentials, or isolated Supabase project were available; no relevant Supabase/database connection environment variables were set. No database/Auth/Storage endpoint was contacted. Live policies, table/column grants, existing records, triggers, bucket settings, Auth email-confirmation settings, session revocation, and hosting configuration remain **blocked/unverified**.
- No installed Playwright/Puppeteer or equivalent browser test harness was found. Desktop/mobile layout and keyboard behavior were reviewed statically; browser/device/screen-reader verification remains pending.
- Searched application/docs/configuration for TODO/FIXME, simulations, timer callbacks, console output, promises, mutation handlers, Storage operations, exports, role/status handling, and common private-key/JWT/service-key/connection-string patterns. No committed service-role credential or private key was found in the reviewed current text files. This is not a full Git-history or binary-secret audit. Demo credentials are public in code (INS-038). Console statements found log error/configuration messages, not passwords or tokens.

### Executed checks

| Check | Result and meaning |
|---|---|
| `npm run build` | **Passed**, 673 modules, Vite reported 8.56 s. JS 931.25 kB / gzip 260.05 kB; CSS 20.32 kB / gzip 4.96 kB. Warning: chunk exceeds 500 kB. Compilation only; no Supabase/runtime/authorization validation. |
| `npm ls --depth=0` | **Passed**. Supabase JS 2.117.2, React/React DOM 19.3.0, Recharts 3.10.1, Tailwind 4.3.3, React Vite plugin 4.7.0, Vite 5.4.21. No top-level invalid dependency reported. |
| `npm audit --json --ignore-scripts` | **Failed**, exit 1: three vulnerable packages, two high and one moderate. Details in INS-014. Network request was to the dependency advisory service, not Supabase. |
| `npm ls source-map-js esbuild --all` | Confirmed source-map-js 1.2.1 under Tailwind/PostCSS; esbuild 0.21.5 under Vite. |
| Existing tests/lint | **Unavailable**: package scripts are only `dev`, `build`, `preview` (`package.json:9–13`); no existing tests/checks to execute. |
| Missing-configuration probe | Actual installed SDK `createClient(undefined, undefined)` throws `supabaseUrl is required.` No network request. |
| Source-extracted DTR handler probes | Executed the actual `computeHours`/approval/rejection function bodies from InstructorDashboard with an in-memory Supabase double. Existing/missing-row success branches write attendance; rejected request writes only exception/reviewer. Injected attendance failures still produce Approved + success; lookup errors lead to insert; concurrent missing-row approvals create two rows in the double. These demonstrate client control flow, **not live RLS/Postgres behavior**. |
| Actual SDK transport probe | Used installed Supabase SDK with a fake `fetch` returning two rows. A PATCH filtered by intern/date followed by `.maybeSingle()` returns client-generated PGRST116/406. No remote request. |
| Zero-row assignment-handler probe | Executed actual source-extracted `saveInternAssignment` with a zero-row/no-error transport double. Persisted fixture remained 486 hours; local state became 100, success toast appeared, and audit was requested. No remote write. |
| Date, chart, numeric and contrast probes | Source calculations reproduced UTC/local day mismatch with +24 hours, overnight correction yielding 0 hours, invalid required-hour coercion, cross-year month merging/averaging, and contrast ratios in INS-012/016/018/034. No database/browser state changed. |

Local probes were ephemeral Node stdin scripts; no application/test code was added. Evidence labeled **runtime reproduced (local probe)** is limited to the indicated SDK/calculation/mock-handler behavior. Findings labeled **confirmed by code** do not assert deployment reproduction. All DB/API reproduction steps below are for a future isolated environment with disposable accounts/data, never real student records.

### Interpretation rules

The access matrices describe what the repository's policies permit **assuming the caller also has the necessary table/column grants and the SQL is deployed unchanged**. The SQL has no explicit GRANT/REVOKE statements. Actual grants must be inspected before declaring any deployed operation allowed. RLS policies are permissive by default and combine with OR; omitted UPDATE `WITH CHECK` reuses `USING`, rather than leaving an unrestricted check. An UPDATE matching zero permitted rows can succeed without changing data. These semantics were checked against [PostgreSQL CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html). Grants and RLS are separate requirements; see [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 3. Role/workflow coverage matrix

For each implemented write the review followed action, handler, validation, SDK mutation, constraints/policy, local state, and success/error display. For reads it followed query scope, relationship names, derived state, and displayed result. References below identify controlling entry points; detailed findings give reproduction and verification.

| Role / workflow | Trace and reviewed result | Findings / limits |
|---|---|---|
| Shared authentication | Login handlers -> Auth SDK -> signup trigger -> profile load -> status/role gate. Auth listener unsubscribes. No recovery/change-password flow. | 001–003, 028, 031, 038; email confirmation, duplicate signup responses, token expiry pending live verification. |
| Admin overview/accounts | `loadAll`, `saveUser`, `deactivate` -> profiles/interns -> optimistic local merge + client audit insert. Status toggle updates a row; it does not delete an Auth account. | 009, 018–019, 023, 026–028, 035. |
| Admin assignments/checklist | `saveInternAssignment`, `attachStandardDocs` -> interns/documents -> local rows/counts. UI filters current intern role; instructors include non-Active accounts. | 004–005, 018–020, 030. |
| Admin companies/sections/years | `saveMaster`/`removeMaster` -> master-table CRUD -> local master lists. No section-assignment/current-year controls. | 009, 029–030, 032, 035. |
| Admin import/audit/backup | File name selection; audit query limited to 50; backup timer. No file parsing, template export, audit CSV, or snapshot API. | 009, 023, 027, 033. |
| Instructor roster/progress | Query `interns.instructor_id = profile.id`, then seven reads; sum all returned hours; stored status and hardcoded velocity. | 004–005, 012, 019, 025–027. Explicit `profiles!interns_id_fkey` resolves the two profile FKs in source; live join execution pending. |
| Instructor evaluations | UI scores 1–5 -> weighted 25/35/20/20 formula -> insert JSON/rounded score/author -> local records/roster. | 004, 017, 026; formula is correct for valid inputs. |
| Instructor DTR review | Selection -> exception UPDATE -> lookup attendance -> UPDATE or INSERT -> success -> full reload. Rejection does not intentionally change attendance. | 004, 007, 010–012, 016; success/failure/race branches probed locally. |
| Instructor document review | Status/note update -> one returned row -> local merge. No object download/view. Revision input cleared before result. | 004, 008, 021–022, 025, 032. |
| Instructor announcements/alerts/reports | Message insert and local list; alert dismissal persists; reports only timer/toast. No alert generation. | 004, 006, 023–027. Alerts' View all opens the announcements tab, which really contains the full alerts list (`src/components/InstructorDashboard.jsx:450,904–921`); this is indirect navigation, not a dead control. |
| Intern dashboard/attendance | Own-data queries -> client sums/charts; clock-in insert; clock-out update with intern/date filters and accomplishment; exception insert. | 007, 010–012, 016, 025–028, 032, 034. Intern joins explicitly disambiguate instructor/evaluator FKs; no source/schema join mismatch found. |
| Intern documents/evaluations | Upload -> Storage -> document metadata update -> Pending local state; evaluation read is own-scoped. | 008, 017, 020–022, 025–027. |
| Intern announcements/reports | No announcement query/render exists; report/certificate/DTR exports toast only. | 006, 023–025. |
| Shared desktop/mobile/UI | Collapsible sidebar; 4 + More when >5 nav items; all 5 Intern items; scrollable main/table wrappers; modal Escape/backdrop; transient toasts. | 033–036. Main and bottom navigation are flex siblings, so source does not establish a fixed-nav overlap defect. Actual small-screen clipping/zoom/device safe areas remain pending. |

## 4. Database and Storage access matrix

### Intended permissions used for comparison

Admin manages accounts, assignments, requirements, and master data. Active instructors work on their assigned interns, author their own evaluations/announcements, and review attendance/documents without rewriting ownership. Active interns read their own records, clock using constrained operations, request corrections initially Pending, and upload against admin-provided requirements without approving themselves. Targeted announcements are private to recipients and authorized staff. Pending/Inactive users should only receive the minimal own-account status needed for the activation screen. Anonymous visitors have no application-data access. Exact self-profile-edit fields, broadcast audience, and final clearance criteria need a documented product rule; none of those ambiguities justifies the current escalation or cross-roster access.

### Policies actually present: active users

Cell order is **SELECT / INSERT / UPDATE / DELETE**. `A` = any row, `O` = own row/folder, `X` = row whose instructor_id equals auth.uid(), `—` = no applicable allow policy. `O*` permits every column on an owned row, not merely the UI's fields. Foreign keys/checks still apply. These are policy permissions before exploiting INS-001/002.

| Table | Anonymous | Admin | Instructor | Intern | Source |
|---|---|---|---|---|---|
| profiles | —/—/—/— | A/A/A/A | A/—/O*/— | A/—/O*/— | supabase/schema.sql:252–267 |
| interns | —/—/—/— | A/A/A/A | A/—/X*/— | A/—/X*/— | supabase/schema.sql:284–288 |
| companies | —/—/—/— | A/A/A/A | A/—/—/— | A/—/—/— | supabase/schema.sql:270–272 |
| course_sections | —/—/—/— | A/A/A/A | A/—/—/— | A/—/—/— | supabase/schema.sql:274–276 |
| academic_years | —/—/—/— | A/A/A/A | A/—/—/— | A/—/—/— | supabase/schema.sql:278–280 |
| attendance_logs | —/—/—/— | A/A/A/— | A/A/A/— | O/O*/O*/— | supabase/schema.sql:294–303 |
| attendance_exceptions | —/—/—/— | A/A/A/— | A/—/A/— | O/O*/—/— | supabase/schema.sql:306–312 |
| evaluations | —/—/—/— | A/A/A/— | A/A/A/— | O/—/—/— | supabase/schema.sql:315–320 |
| documents | —/—/—/— | A/A/A/— | A/A/A/— | O/O*/O*/— | supabase/schema.sql:323–329 |
| announcements | —/—/—/— | A/A/—/— | A/A/—/— | A/—/—/— | supabase/schema.sql:335–337 |
| alerts | —/—/—/— | A/A/A/A | A/A/A/A | —/—/—/— | supabase/schema.sql:340–344 |
| audit_logs | —/—/—/— | A/A/—/— | —/A/—/— | —/A/—/— | supabase/schema.sql:348–351 |

`interns` UPDATE checks assignment only, **not caller role**: an intern assigned as an instructor by malformed admin/API data could update those rows. That policy also does not prohibit changing the row's primary id to another existing profile, company, section, required hours, or status while preserving instructor_id. It cannot normally transfer assignment away from the caller because the new instructor_id must still equal auth.uid(). Staff policies on attendance/documents/evaluations/exceptions allow changing intern_id to another valid profile; reviewer/evaluator/author fields are not bound to auth.uid(). Intern-owned attendance/documents cannot normally transfer intern_id to another user under their own policy, but all other protected fields remain writable. No application-domain DELETE policy exists for attendance/exceptions/evaluations/documents/announcements, even for Admin; UI text claiming full access is broader than these policies.

### Pending and Inactive users

There is **no status distinction in any listed policy**. The following applies to both Pending and Inactive, with a valid authenticated JWT and the same row scopes as the preceding table.

| Table(s) | Pending/Inactive intern | Pending/Inactive instructor | Pending/Inactive admin |
|---|---|---|---|
| profiles | A/—/O*/— | A/—/O*/— | A/A/A/A |
| interns | A/—/X*/— | A/—/X*/— | A/A/A/A |
| companies, course_sections, academic_years | A/—/—/— | A/—/—/— | A/A/A/A |
| attendance_logs | O/O*/O*/— | A/A/A/— | A/A/A/— |
| attendance_exceptions | O/O*/—/— | A/—/A/— | A/A/A/— |
| evaluations | O/—/—/— | A/A/A/— | A/A/A/— |
| documents | O/O*/O*/— | A/A/A/— | A/A/A/— |
| announcements | A/—/—/— | A/A/—/— | A/A/—/— |
| alerts | —/—/—/— | A/A/A/A | A/A/A/A |
| audit_logs | —/A/—/— | —/A/—/— | A/A/—/— |

The dashboard gate (`src/App.jsx:66–88`) does not change these permissions. After self-escalation, an authenticated caller can acquire the Admin cells subject to deployed grants. An expired/invalid JWT is not equivalent to Pending status; it should cease to authenticate, but deployed token/session handling was not exercised.

### Storage

Policies cover bucket `documents` only; other project buckets/policies are unknown. SQL inserts it as private only if the bucket id does not already exist.

| Caller | SELECT objects / private reads | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Anonymous | Denied by these policies; a pre-existing public bucket permits public object delivery (INS-015) | — | — | — |
| Active Intern | First folder = own auth uid | Own folder | Own folder, all permitted metadata/content operations | — |
| Active Instructor | Any object in documents bucket | Own folder only | Any object in documents bucket | — |
| Active Admin | Any object in documents bucket | Own folder only | Any object in documents bucket | — |
| Pending/Inactive | Identical to the matching role above | Same role | Same role | — |

Evidence: `supabase/schema.sql:360–390`. UPDATE omits explicit WITH CHECK; PostgreSQL reuses USING on the new row. It is not an unrestricted rename bypass for an ordinary intern. Staff nevertheless have broad update access. Folder prefixes, not storage owner metadata or a checklist relationship, define owner access. No MIME/size restrictions or DELETE policy are specified. No application download, public URL, or signed URL code exists. Signed URL issuance/expiration and actual bucket privacy remain unverified; recommendations use authorized short-lived private access, not public buckets.

### Functions, constraints, grants and migration inventory

| Object | Confirmed properties and limits |
|---|---|
| `handle_new_user()` (`supabase/schema.sql:194–221`) | SECURITY DEFINER, `search_path = public`; explicitly qualified insert targets; single signup-trigger execution creates Pending profile and optional intern row transactionally. Trusts role metadata; empty names/student IDs accepted; invalid role hits profile CHECK and can abort signup. No profile-repair/backfill path. |
| `current_role()` (`supabase/schema.sql:241–248`) | STABLE SECURITY DEFINER, fixed public search_path, selects only current auth uid's role. Avoids querying profiles through its own RLS recursively if owned by a bypass-capable trusted owner. Does not verify status. No arbitrary uid parameter or dynamic SQL; no SQL-injection finding inferred. Function ownership/bypass/grants are deployment-dependent. |
| Function/table grants | No GRANT/REVOKE, explicit function execution restriction, column grants, or FORCE RLS declared. PostgreSQL defaults/project settings must be inspected, not invented. Trigger function is trigger-returning, not a general user-creation RPC. Narrow trusted helpers/RPCs should explicitly set execution privileges and qualified search paths. |
| Keys and deletion | All 12 tables have PKs. Master names/academic label unique; profiles role/status, exception/document status, alert severity, evaluation score range checked. Auth/profile and many intern-domain relationships cascade on deletion; instructor/company/section assignments SET NULL. Reviewer/evaluator/announcement/audit actor FKs generally use default NO ACTION and can block profile deletion. A document file_path has no FK to Storage. |
| Missing invariants | No intern/date uniqueness, pending-exception uniqueness, document-type uniqueness, positive required-hours check, hour/time consistency, evaluator identity/rubric consistency, role-specific FK enforcement, or single-current-year constraint. `documents.updated_at` is a default, not a trigger; no automatic status/progress/alert update. No secondary indexes declared beyond those generated by PK/UNIQUE. |
| Patch (`supabase/patch_attendance_exception_insert.sql:17–21`) | Replaces old/new named attendance INSERT policy with global staff INSERT; compatible with current schema's policy name and columns, but reinforces global instructor access. Does not fix atomic approval/validation. No other migrations found. |
| Setup script (`supabase/schema.sql:21–36`) | Destructive bootstrap, not a safe live migration. Drops helper before dependent policies/tables; repeat runs can fail on dependencies before later statements. Never executed during audit. |

## 5. Detailed findings (ordered by severity)

### INS-001 — Users can promote and activate themselves

**Severity:** Critical. **Classification:** security issue. **Evidence status:** confirmed by code; deployed API reproduction pending.

**Evidence / trace:** `supabase/schema.sql:263–267`, policy `users update their own profile`, checks only id on both old and new row. `supabase/schema.sql:241–248` trusts that row's role; Admin policies at `257–261,271–286` consume it. There are no column grants/triggers in this repository restricting role/status/email/student_id updates. React has no self-role control, which does not constrain REST.

**Preconditions / reproduction:** In a disposable deployment with UPDATE grants, sign in as an ordinary intern; call `supabase.from('profiles').update({role:'admin',status:'Active'}).eq('id', user.id).select()`. Then query another user's protected data or manage master data. Repeat from a Pending account once Auth supplies a valid JWT.

**Expected vs actual / impact:** Only authorized Admin should promote/activate users. The own-row policy permits those protected changes; subsequent requests use Admin authority, enabling broad disclosure, modification, and some deletion.

**Root cause / focused fix:** Row ownership is incorrectly treated as field-level authorization. Remove broad self UPDATE or restrict updates through tightly scoped operations/column privileges plus server-side checks that ordinary users cannot change protected fields. Keep role/status administration behind active-Admin authorization; protect all write entry points, including direct REST.

**Verify after fix:** Every non-Admin role/status combination must fail role/status/id/email/assignment-field tampering while allowed basic-info edits and active-Admin administration work. Test old and new values and cross-user ids.

### INS-002 — Public registration assigns authoritative Admin/Instructor roles

**Severity:** Critical. **Classification:** security issue. **Evidence status:** confirmed by code; live signup pending.

**Evidence / trace:** `src/components/LoginPage.jsx:21–25,110–120` offers/send admin/instructor metadata. `supabase/schema.sql:200–212` copies raw user metadata role directly to profiles and sets Pending. `current_role` at `241–248` reads this authoritative role, without a status condition.

**Preconditions / reproduction:** With public Auth signup enabled, register a disposable account with `options.data.role='admin'`, confirm email if required, obtain its JWT, and query/manage admin-accessible tables before activation. No own-profile UPDATE is needed for this path.

**Expected vs actual / impact:** A requested role must not grant privilege until independently approved. Pending signup already has a stored Admin role consumed by RLS. The UI activation screen hides this authority but does not remove it.

**Root cause / focused fix:** Untrusted metadata is an authorization source. Assign a nonprivileged server-controlled initial role; if privileged role requests are needed, store them separately from the effective role and let an active Admin approve them. Bootstrap the first Admin through a trusted operator procedure. Enforce status independently (INS-003).

**Verify after fix:** Test missing, intern, instructor, admin, mixed-case, invalid, and subsequently edited Auth metadata. No public signup may obtain effective staff authority. Confirm a valid intern signup still creates both profile and intern extension.

### INS-003 — Pending/Inactive status is only a dashboard gate

**Severity:** High. **Classification:** security issue. **Evidence status:** confirmed by code.

**Evidence / trace:** `src/App.jsx:66–88` blocks dashboards; `supabase/schema.sql:241–248,252–351,368–390` has no active-status predicate. `src/components/AdminDashboard.jsx:261–270` only updates profiles.status, without revoking an Auth session; App reloads profile on session changes, not profile updates (`src/App.jsx:30–43`).

**Preconditions / reproduction:** Obtain a disposable active user's token, deactivate the profile through Admin, and repeat the same reads/writes using the retained JWT. Also test newly Pending interns/staff. Repeat Storage reads/uploads.

**Expected vs actual / impact:** Deactivation/awaiting approval should prevent protected operations. Policies retain each role's full matrix, and an already open dashboard can remain visible with a stale Active profile.

**Root cause / focused fix:** Account status is missing from the actual authorization boundary. Require Active membership for business tables and Storage; allow only minimal own-status reads for the pending screen. Invalidate/refresh UI state on relevant account changes. Session revocation can complement, but cannot replace, database checks.

**Verify after fix:** Use existing JWTs without refresh after deactivation and check all four operations in both matrices. Re-activation should restore only appropriate role-scoped access. Confirm Pending users can still see status and sign out.

### INS-004 — Instructor access is global despite assigned-roster UI filtering

**Severity:** High. **Classification:** security issue. **Evidence status:** confirmed by code.

**Evidence / trace:** Instructor UI starts with `.eq('instructor_id', profile.id)` (`src/components/InstructorDashboard.jsx:99–122`). SQL staff branches grant global attendance/exception/evaluation/document/alert access (`supabase/schema.sql:294–344`) and global document-object read/update (`368–390`). `interns` UPDATE (`287–288`) restricts assignment but not editable fields or caller role.

**Preconditions / reproduction:** Create two disposable instructors with separate interns. From Instructor A, request B's attendance, exceptions, evaluations, documents/objects, and alerts directly; attempt allowed inserts/updates and alert DELETE. Change intern_id on staff-writable rows to another valid profile. Attempt to change company/section/required hours on an A-assigned intern.

**Expected vs actual / impact:** Assignment must constrain both old-row access and new-row ownership. The policies permit cross-roster data disclosure/tampering and staff rewrites of protected ownership/configuration fields; the UI's own roster remains apparently scoped.

**Root cause / focused fix:** Policies check role instead of relationship. Use active-role plus EXISTS assignment checks for every permitted operation, including Storage paths; keep an explicit Admin branch. Restrict mutable ownership/assignment fields independently and do not let review operations reassign records. Retain explicit new-row checks. Decide whether instructors should ever update required hours/company/section; current Admin-only UI suggests they should not.

**Verify after fix:** Run the access matrix as both instructors before/after reassignment, including direct foreign-id writes and object metadata updates. Confirm ordinary assigned review succeeds and unassigned access fails.

### INS-005 — Every authenticated user can enumerate profiles and intern assignments

**Severity:** High. **Classification:** security issue. **Evidence status:** confirmed by code.

**Evidence / trace:** `supabase/schema.sql:252–255,284` uses SELECT `true` for all authenticated users. Profiles include email, organization, student_id, role/status (`62–70`); interns reveal instructor/company/section/hours (`74–80`). Dashboard-specific `.eq` filters do not reduce API capability.

**Preconditions / reproduction:** As a disposable ordinary or Pending intern, call `.from('profiles').select('*')` and `.from('interns').select('*')` without filters. Compare returned unrelated people with own dashboard scope.

**Expected vs actual / impact:** Students should not receive the entire student/staff directory and internship assignments merely to render their own dashboard. Policies expose these fields across users and instructors. Names needed for a particular relationship do not require all profile columns for all users.

**Root cause / focused fix:** Broad join convenience became an unrestricted directory policy. Scope rows by self/assigned relationships and expose only the necessary profile fields through appropriately secured queries/views or privileges; preserve Admin management. Retest the explicit FK joins when narrowing access.

**Verify after fix:** Unfiltered reads by Intern A cannot return Intern B or unrelated staff; assigned instructor/name and evaluator-name joins remain usable. Include Pending/Inactive and missing-profile tokens.

### INS-006 — Targeted announcements have no audience or author enforcement

**Severity:** High. **Classification:** security issue. **Evidence status:** confirmed by code.

**Evidence / trace:** `supabase/schema.sql:151–158,331–337` has SELECT `true` and role-only INSERT. The comment claims app filtering handles privacy, but `target_intern_id` already exists and no such Intern query exists. Instructor UI sends current profile.id and roster target (`src/components/InstructorDashboard.jsx:337–358`), without backend binding.

**Preconditions / reproduction:** Send a disposable personal announcement to Intern A; query announcements as B or a Pending user. As an instructor, directly insert an announcement naming another instructor_id and an unassigned target_intern_id, or inconsistent target/null values.

**Expected vs actual / impact:** Personal announcements should reach only their recipients and authorized staff, with a reliable author. The policy allows all authenticated readers and forged staff authors/arbitrary audiences.

**Root cause / focused fix:** Audience/identity are enforced only by form options. Bind author to auth.uid(), validate assigned recipients, define whether All Interns means the author's roster or an explicitly approved broader broadcast, and enforce SELECT by recipient/author/authorized Admin. Use UUIDs, not names, for targeting. Recipient UI is separately missing (INS-024).

**Verify after fix:** Test personal/broadcast messages across two rosters and duplicated names; attempts to impersonate authors, use foreign recipients, or set contradictory audience fields must fail.

### INS-007 — Interns can forge hours, verification and approved correction requests

**Severity:** High. **Classification:** security issue. **Evidence status:** confirmed by code.

**Evidence / trace:** `supabase/schema.sql:87–111,299–309` checks attendance/exception intern_id ownership but not protected fields. Attendance owner INSERT/UPDATE permits arbitrary hours, dates, time values, verified and verified_by. Exception INSERT permits status Approved/Rejected and reviewed_by instead of requiring Pending/null. Totals consume stored hours (`src/components/InternDashboard.jsx:234–247`; `src/components/InstructorDashboard.jsx:125–148`).

**Preconditions / reproduction:** As a disposable intern, directly insert/update own attendance with `hours:500,verified:true,verified_by:<staff id>`; insert an own exception with Approved status/reviewer. Keep intern_id unchanged. Attempt the same after genuine instructor verification.

**Expected vs actual / impact:** Clocking must not grant authority to certify arbitrary hours or impersonate a reviewer. Current policies allow fabricated progress and review state, bypassing instructor approval. An Approved exception inserted this way does not automatically reconcile attendance either.

**Root cause / focused fix:** Ownership checks authorize entire rows. Move clocking/correction submission into constrained atomic database operations; compute trusted hours from valid timestamps, require initial Pending/null reviewer, and reserve verification/review transitions for authorized active staff. Prevent owner edits to already verified attendance unless a new correction is reviewed.

**Verify after fix:** Direct REST field forgery must fail while legitimate own clock-in/out and Pending correction submission work. Verify staff attribution is derived server-side, and totals count the approved business definition of eligible hours.

### INS-008 — Interns can approve their own documents and invent checklist rows

**Severity:** High. **Classification:** security issue. **Evidence status:** confirmed by code.

**Evidence / trace:** `supabase/schema.sql:134–145,325–329` permits owner INSERT and every-column UPDATE. UI upload sets Pending (`src/components/InternDashboard.jsx:219–231`), but status/note/doc_type/name/file_path remain owner-writable via API. Eligibility counts Approved rows (`246–247,591–594`).

**Preconditions / reproduction:** On an isolated own checklist, directly update status to Approved and clear note, even with no file. Insert an extra own document row already Approved or change doc_type/name/file_path. Compare document progress/eligibility after reload.

**Expected vs actual / impact:** Admin defines requirements and an authorized instructor reviews evidence. Owner policy allows self-certification and arbitrary requirement/file metadata changes, corrupting clearance decisions.

**Root cause / focused fix:** Upload and review share unrestricted table writes. Separate permitted upload fields from checklist definition and review fields using narrowly scoped operations/privileges. Validate file path belongs to the owner and the specific requirement/version. Require real evidence for approval and bind reviewer/timestamp server-side.

**Verify after fix:** Owner checklist creation/status/reviewer tampering fails; authorized Admin checklist creation and assigned instructor review succeed. Replacement must reset only the current evidence version to Pending without preserving false approval.

### INS-009 — Audit history can be forged, bypassed and silently omitted

**Severity:** High. **Classification:** integrity risk. **Evidence status:** confirmed by code.

**Evidence / trace:** `supabase/schema.sql:179–185,348–351` allows any authenticated INSERT with arbitrary actor_id/name/action/detail/created_at. `src/components/AdminDashboard.jsx:184–190` ignores insert errors and callers generally do not await it (`166,180,257,269`). Master CRUD (`287–311`) and Instructor/Intern mutations have no audit insertion. Fake backup/import events are also written (INS-023).

**Preconditions / reproduction:** As a disposable intern, insert an audit event naming an Admin and backdated created_at. As Admin, perform master edits/deletes; compare log contents. In a test double or isolated failing-audit setup, let a real mutation succeed and reject the separate audit insert.

**Expected vs actual / impact:** The activity log should attribute meaningful changes accurately and disclose failures. Users can frame another actor, pollute history, omit direct-API actions, and receive success even when no audit evidence exists. Absence of UPDATE/DELETE policies does not make attacker-controlled inserts trustworthy.

**Root cause / focused fix:** The client is the author and sole source of audit truth. Generate protected audit records through database triggers/transactional RPCs, derive actor/time from trusted context, and prevent arbitrary client actor/event insertion. Cover account/assignment/master/review changes, preserving necessary history and a defined retention/read interface.

**Verify after fix:** Attempt actor/time forgery and direct-API mutation bypass. Each committed critical mutation must have a correct event; rollback behavior and audit failures must be explicit. Ensure simulated events never masquerade as real backups/imports.

### INS-010 — DTR approval commits status before attendance and races with other reviewers

**Severity:** High. **Classification:** integrity risk. **Evidence status:** runtime reproduced (local source-extracted handler probes); live database pending.

**Evidence / trace:** `src/components/InstructorDashboard.jsx:250–307`: UPDATE exception first, then SELECT attendance `.maybeSingle()` ignoring its error, then UPDATE/INSERT. Attendance errors only toast; helper returns no failure. Caller still marks local Approved, announces attendance updated, and reloads. Bulk marks all Approved first and counts requested ids, not successful attendance results. `rejectEx`/bulk reject (`290–315`) and approvals have no DB `status='Pending'` guard/version or busy lock. SQL has no transaction/RPC, review timestamp, or daily uniqueness (`supabase/schema.sql:87–112`).

**Preconditions / reproduction:** Isolated assigned intern: (1) approve existing and missing-row requests; (2) force only attendance write to fail; (3) make the attendance lookup return multiple-row/error; (4) approve from two stale tabs; (5) race approve/reject; (6) mix successful/failed bulk items.

**Expected vs actual / impact:** Approval must atomically reconcile attendance and record one reviewer, or leave Pending with an actionable failure. Local probes confirmed existing/missing-row success writes with verifier, but injected failure left Approved + unchanged/absent attendance and both error and success toasts. Lookup error fell into INSERT; concurrent missing-row approvals inserted two records in the double. Repeat approval rewrites attendance instead of establishing a no-op/version conflict. Rejection normally writes status/reviewer only, but a concurrent rejection can leave attendance approved under a Rejected request.

**Root cause / focused fix:** Multi-table review is a client-orchestrated sequence without concurrency control. Add one narrow database RPC with active/assignment checks, row lock/conditional Pending transition, validated times, unique attendance key/upsert, trusted reviewer, and audit event in one transaction. Return committed per-item outcomes for bulk actions and propagate failures.

**Verify after fix:** Exercise all six cases and repeated requests. Exactly one authoritative attendance row/review result must commit; failed reviews cannot become Approved. Bulk counts must equal committed outcomes, with item-specific failures/retry.

### INS-011 — Clocking permits duplicate days and repeated clock-out writes

**Severity:** High. **Classification:** integrity risk. **Evidence status:** confirmed by code; actual SDK cardinality behavior reproduced locally.

**Evidence / trace:** `src/components/InternDashboard.jsx:135–195,409–416` finds one today row, always INSERTs on Clock In, has no in-flight state, and presents Clock In again after clock-out. Clock-out UPDATE matches intern/date but not row id or `time_out IS NULL`. `supabase/schema.sql:87–98` lacks uniqueness. Installed SDK `node_modules/@supabase/postgrest-js/src/PostgrestTransformBuilder.ts:737–743` and `node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts:421–444` enforce `.maybeSingle()` cardinality client-side; a local fake response of two rows yielded PGRST116/406 after PATCH.

**Preconditions / reproduction:** In a disposable account, double-click Clock In, use two tabs concurrently, or Clock In again after finishing that day. Then Clock Out. Submit clock-out from two stale tabs at different times.

**Expected vs actual / impact:** The UI's one-DTR-row-per-day model needs one valid transition at a time. Duplicate rows can enter; totals double-count. A day-wide UPDATE can affect multiple rows and still report a cardinality error; `.maybeSingle()` is not a uniqueness constraint. Stale repeated clock-out can overwrite the prior time/note/hours. Without a row/time-in, direct updates are also possible under INS-007.

**Root cause / focused fix:** Client state substitutes for transactional uniqueness and transitions. Audit existing duplicates read-only first, then choose/enforce the daily-record rule with a unique key and guarded clock operations. If multiple shifts are intended, explicitly model shift ids and intervals instead. Disable submission while pending and handle conflicts truthfully.

**Verify after fix:** Concurrent inserts/closures, repeated day actions, missing-clock-in, duplicate legacy rows and stale tabs must not corrupt records or overwrite a completed shift. Check database state and displayed sums after each case.

### INS-012 — UTC date plus local time corrupts Manila attendance and midnight sessions

**Severity:** High. **Classification:** defect. **Evidence status:** runtime reproduced (local date calculation); end-to-end browser/DB pending.

**Evidence / trace:** Intern `todayStr` uses UTC (`src/components/InternDashboard.jsx:74`), while clock actions use local `toTimeString` (`156–174`) and reconstruct `log_date + time_in` as local (`135–137`). Instructor today uses UTC too (`src/components/InstructorDashboard.jsx:29,105–117`). Open-session lookup is tied to today's date.

**Preconditions / reproduction:** Run the calculation/browser in Asia/Manila at 2026-10-07 00:30. UTC key becomes `2026-10-06`, clock time `00:30:00`, reconstruction is Oct 6 local; immediate clock-out computes **24 hours**. Also clock in before local midnight and close after UTC day rollover at 08:00 Manila; the prior date row is no longer today's session. Test 22:00–06:00 corrections (INS-016).

**Expected vs actual / impact:** A shift should use the intended Manila business date and real elapsed duration. The app backdates early-morning work, inflates hours, and loses the ability to close sessions on date rollover; instructor Active Now and DTR date labels inherit the mismatch.

**Root cause / focused fix:** Date and time are derived in inconsistent timezones and stored without an instant. Use trusted timestamptz clock events and explicit Asia/Manila business-date rules; identify the open attendance record independently of current date. Support overnight closure explicitly and derive duration consistently on the database side.

**Verify after fix:** Check 00:00/07:59/08:00/23:59 Manila boundaries, an overnight shift, device timezone changes, and immediate clock-out. All totals/date labels/instructor active metrics must agree, with no 24-hour discontinuity.

### INS-013 — Setup is destructive and misleadingly described as safely rerunnable

**Severity:** High. **Classification:** maintenance concern. **Evidence status:** confirmed by code; repeat-run failure mode not executed.

**Evidence / trace:** README `43–57` instructs pasting the entire script and says safe to re-run any time; `supabase/schema.sql:15–36` drops tables CASCADE. Worse, `drop function public.current_role()` (`23`) precedes dependent policy/table drops and lacks CASCADE, so an existing installation can fail on dependencies before recreation. README `124–126` elsewhere correctly warns that the full script drops data.

**Preconditions / reproduction:** **Do not run this against a populated database.** Inspect the DROP statements and helper/policy dependencies; if execution verification is required later, use a throwaway project with disposable rows only, taking before/after snapshots.

**Expected vs actual / impact:** Live upgrade instructions should preserve records and apply versioned narrow changes. This bootstrap can erase app records if the destructive statements execute, orphan Storage files, or fail partway depending on transaction/error handling. IF EXISTS does not protect data. PostgreSQL defaults DROP FUNCTION to rejecting remaining dependencies ([DROP FUNCTION documentation](https://www.postgresql.org/docs/current/sql-dropfunction.html)).

**Root cause / focused fix:** Destructive bootstrap and upgrade workflow are conflated. Clearly label bootstrap as fresh-project-only, remove unsafe rerun wording, and provide versioned additive migrations/rollback notes. Resolve ordering only in a separately named disposable reset script; never use it as the repair path.

**Verify after fix:** Documentation must offer a nondestructive path for an existing installation. Validate migrations on a disposable copy with row-count/invariant comparisons and repeatability checks; no audit recommendation authorizes running a reset on real data.

### INS-014 — Installed development/build dependencies have known advisories

**Severity:** High. **Classification:** security issue. **Evidence status:** confirmed by code and dependency advisory check; exploitability not reproduced.

**Evidence / trace:** `package-lock.json:2795–2796` Vite 5.4.21, `1993–1994` esbuild 0.21.5, `2690–2691` source-map-js 1.2.1. `package.json:10` and `vite.config.js:15–16` expose dev host on 0.0.0.0. npm audit exit 1 reports Vite high, source-map-js high, esbuild moderate.

**Preconditions / reproduction:** Rerun the read-only advisory check. For reachability analysis, inspect whether a dev server is exposed on Windows with sensitive files in its allowed filesystem roots. Vite's [Windows path-deny advisory](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff) includes 5.4.21. npm also reported Vite optimized-dependency map traversal and launch-editor UNC issues. Source-map-js requires processing a hostile indexed source map; [maintainer release 1.2.2](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) documents the fix. The [esbuild advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) concerns its own serve API; use by Vite's transform pipeline alone does not demonstrate that serve vulnerability is reachable.

**Expected vs actual / impact:** Development tooling should not expose known vulnerable file-handling paths. Vulnerable versions are installed, and network-binding configuration increases the Vite exposure precondition. No production static-bundle exploit, leaked file, or malicious map processing was demonstrated.

**Root cause / focused fix:** Plan a tested dependency update/lockfile refresh in subsequent repair work, considering Node/plugin compatibility; do not blindly apply npm's major-version fix suggestion. Restrict development-server exposure where it is unnecessary. No upgrades were applied during audit.

**Verify after fix:** Rerun audit/build and relevant tooling checks in a clean supported environment; confirm advisory ranges and dev host behavior. Record residual advisories and reachability rather than equating package presence with application compromise.

### INS-015 — Existing public document bucket remains public

**Severity:** High. **Classification:** security issue. **Evidence status:** confirmed by code, conditional; deployed bucket state blocked.

**Evidence / trace:** `supabase/schema.sql:360–362` inserts private bucket with `ON CONFLICT (id) DO NOTHING`. Existing bucket.public, MIME, and size settings are not corrected or verified. Object policies at `368–390` do not convert public delivery into private delivery.

**Preconditions / reproduction:** Only in an isolated project, start with a public bucket named documents, then inspect the effect of the bucket initialization statement alone. It leaves the bucket public. Check anonymous object retrieval using a known disposable object path. Do not run the complete destructive schema to test this.

**Expected vs actual / impact:** Clearance/medical documents should remain private regardless of pre-existing bucket configuration. Setup does not guarantee its documented privacy; a pre-existing public bucket can expose known object URLs. No claim is made that the actual production bucket is public.

**Root cause / focused fix:** Provisioning silently accepts incompatible existing configuration. Add a narrowly scoped bucket-hardening migration or verified operator setup that explicitly sets private mode and intended upload limits, with a controlled access check. Keep owner/assigned-staff RLS and authorized private downloads.

**Verify after fix:** Fresh and pre-existing-bucket cases must both deny anonymous object delivery, permit owner/assigned staff as intended, and reject cross-roster access. Inspect live bucket configuration read-only before choosing the migration.

### INS-016 — Correction/time values lack independent validity rules

**Severity:** Medium. **Classification:** integrity risk. **Evidence status:** confirmed by code; overnight calculation reproduced locally.

**Evidence / trace:** `src/components/InternDashboard.jsx:197–216,518–540` checks only field presence/trimmed reason. No date range, duration or time ordering check exists. `src/components/InstructorDashboard.jsx:242–247` clamps a negative time difference to zero and ignores seconds. `supabase/schema.sql:87–112` permits null/contradictory times, arbitrary numeric hours, empty reasons and multiple Pending requests for one date. No trigger computes duration.

**Preconditions / reproduction:** Submit future-dated, repeated Pending, equal-time, reversed-time and 22:00–06:00 requests on disposable data. Directly insert a row with negative/excessive hours or hours inconsistent with its times. Local `computeHours('22:00','06:00')` returned 0; normal 08:00–17:00 returned 9; missing time returned null.

**Expected vs actual / impact:** Invalid requests should be rejected with clear reasons; valid overnight work needs an explicit day model. Current UI admits contradictory/future claims, and approval can silently credit zero or an unreasonably long shift. Pending duplicates encourage conflicting corrections. Exact maximum hours and whether future requests are permitted require a product rule; the absence of consistency enforcement is confirmed.

**Root cause / focused fix:** Define business-date/overnight and duration rules with INS-012, validate on submission and in the database review operation, and add appropriate checks plus one-Pending-per-intern/date uniqueness if that is the chosen workflow. Avoid clamping invalid data into apparently successful attendance.

**Verify after fix:** Boundary, equal/reversed/overnight, future date, duplicated pending request, null values, seconds, negative/excessive duration, and direct API tests must have defined outcomes. Rejected claims must not change attendance.

### INS-017 — Evaluations have no authoritative rubric consistency or duplicate protection

**Severity:** Medium. **Classification:** integrity risk. **Evidence status:** confirmed by code.

**Evidence / trace:** `src/components/InstructorDashboard.jsx:21–25,169–173,212–235,527–566` correctly offers 1–5 and computes `sum(score/5 * 100 * weight)` rounded to an integer. INSERT trusts client JSON/score/evaluator_id and has no pending state. `supabase/schema.sql:118–127,317–320` checks only score 0–100 (nullable), not JSON keys/ranges/integers or score agreement; staff author is not bound. Intern displays omit criterion details and coerce null overall_score to 0 (`src/components/InternDashboard.jsx:680–699`).

**Preconditions / reproduction:** As disposable authorized staff, insert competencies `{}` or out-of-range/string values with overall_score 100 and another profile's evaluator_id; insert null score. Double-submit the same evaluation under latency. For valid scores 4/5/3/2, expected weighted score is 75.

**Expected vs actual / impact:** Stored rubric, total and author should agree. Invalid/incomplete JSON with a plausible total can persist, authors can be spoofed, null can display as 0, and repeated clicks create indistinguishable duplicate evaluations. Multiple legitimate evaluations are supported; there is no defined evaluation-period/type identifier to distinguish them.

**Root cause / focused fix:** Validate the exact four integer scores server-side, derive total/author, require a complete score, and introduce a submission idempotency key or defined evaluation instance rather than an indiscriminate unique-intern rule. Disable while saving. Display criteria to the intern if evaluation transparency is required; do not call that omission a calculation defect.

**Verify after fix:** Check all 1s=20, all 5s=100, 4/5/3/2=75; missing/extra/invalid keys, null/out-of-range scores, spoofed author, and retry/double-click. Distinct intended evaluation instances must remain possible.

### INS-018 — Required-hours inputs are silently coerced or accept invalid targets

**Severity:** Medium. **Classification:** defect. **Evidence status:** runtime reproduced (numeric conversion); persistence pending.

**Evidence / trace:** `src/components/AdminDashboard.jsx:144–161,502–505` uses `Number(form.required_hours) || 486` in mutation and local state. A min=0 input is outside a native validation/submission form. `supabase/schema.sql:79` has numeric NOT NULL/default only. Progress and eligibility compare against this value (`src/components/InternDashboard.jsx:238–247`; `src/components/InstructorDashboard.jsx:144–148`).

**Preconditions / reproduction:** Enter 0, blank, -1 or invalid numeric text through an appropriate test/API. Local conversion results: 0/blank/NaN -> 486; -1 -> -1; 1.5 -> 1.5. Save and compare entered vs persisted target.

**Expected vs actual / impact:** Invalid targets should produce explicit validation, not replacement or false eligibility. Negative targets are accepted by schema/UI path and can mark an intern cleared immediately; 0 is silently replaced, contrary to the form's advertised minimum.

**Root cause / focused fix:** Truthiness is used as validation. Define the allowed finite positive range/precision, explicitly reject invalid input, and enforce it with a database CHECK. Return and display the stored value; recalculate dependent metrics consistently.

**Verify after fix:** Blank, 0, negative, very large, fractional, nonfinite and normal targets; reload after save and compare progress/remaining/clearance across both roles. Specify rather than assume whether fractional targets are allowed.

### INS-019 — Role changes and assignments can leave incompatible profile/intern state

**Severity:** Medium. **Classification:** integrity risk. **Evidence status:** confirmed by code.

**Evidence / trace:** `src/components/AdminDashboard.jsx:204–259` updates profiles/local users first, then creates/updates interns. Secondary failures toast an error, followed by generic success and modal closure. Leaving Intern does not retire its extension or instructor relationships. Admin's intern list filters current role (`129–138`); Instructor query does not (`src/components/InstructorDashboard.jsx:99–102`). `supabase/schema.sql:74–80,89,104,120,136,153,157` references profiles, without role constraints. Instructor options ignore status (`src/components/AdminDashboard.jsx:132`).

**Preconditions / reproduction:** Convert a disposable staff user to Intern while failing only the intern insert. Promote an assigned Intern to staff, or demote an instructor who has assigned interns. Assign an inactive instructor, or use API to assign an intern profile as instructor. Reload both dashboards.

**Expected vs actual / impact:** A role transition should commit a coherent account model and preserve/retire historical records deliberately. Profile and extension can disagree; promoted staff remain in the instructor roster; demoted instructors retain assignment ids, and invalid-role assignments satisfy foreign keys. Missing extension silently falls back to 486 hours in Intern UI.

**Root cause / focused fix:** Cross-table lifecycle is not atomic and FK existence is confused with role validity. Add a controlled Admin transaction for role/assignment transitions with explicit historical-data handling and active-instructor validation. Reconcile existing inconsistencies read-only before planning backfills; prevent misleading generic success after partial failure.

**Verify after fix:** Test each role transition with/without extension/history/assigned interns; inject secondary failure; ensure rollback or an explicit recoverable state. Admin and Instructor rosters and Intern required-hours information must agree after reload.

### INS-020 — Checklist attachment can duplicate requirements and cannot fill partial checklists

**Severity:** Medium. **Classification:** integrity risk. **Evidence status:** confirmed by code.

**Evidence / trace:** `src/components/AdminDashboard.jsx:170–181,509–512` relies on local docCount; any existing document disables the entire four-item attachment and displays Checklist attached. `supabase/schema.sql:134–145` has no unique intern_id/doc_type. Signup intentionally creates no checklist (`200–213`).

**Preconditions / reproduction:** Give a disposable intern only one custom/standard requirement; observe attachment disabled. In two Admin sessions with initial count 0, attach simultaneously and reload. Test a truncated/failed documents read (INS-026/027).

**Expected vs actual / impact:** Standard attachment should be idempotent and fill missing standard types. One unrelated/partial row blocks provisioning while claiming success; concurrent sessions can duplicate all four requirements, distorting approval counts.

**Root cause / focused fix:** Existence of any row substitutes for requirement-set membership. Enforce the chosen requirement identity (usually intern + doc_type, or a versioned requirement id) and add an idempotent transactional attachment that inserts only missing standard types. Show partial vs complete checklist state and allow authorized repair.

**Verify after fix:** Zero, partial, custom, complete and concurrent attachment cases; each required type appears exactly once under the chosen model. Failed reads must not imply a complete checklist. Preserve admin-attached provisioning if it remains intentional.

### INS-021 — Uploaded document contents cannot be opened for review

**Severity:** Medium. **Classification:** incomplete feature. **Evidence status:** confirmed by code.

**Evidence / trace:** Intern upload stores file_path (`src/components/InternDashboard.jsx:219–231`), but Intern document cards only show filename/upload controls (`635–655`). Instructor review cards (`src/components/InstructorDashboard.jsx:758–788`) show filename and Approve/Revision/Revoke; there is no download/view handler. All source Storage calls are the single upload; no signed URL/download/query exists.

**Preconditions / reproduction:** On disposable data, upload a readable file, sign in as its assigned instructor, open Intern Documents, and attempt to view its contents; also try from the Intern card. Static control inventory confirms no such action.

**Expected vs actual / impact:** Review requires examining evidence. Staff can approve only by metadata/file_name, and interns cannot verify what was uploaded. A populated file_name alone enables Approve even without a valid file_path/object.

**Root cause / focused fix:** Metadata/status workflow is implemented without private object retrieval. Add an accessible View/Download using authorized Storage download or short-lived signed URLs after assignment checks; handle missing object/expired link/error explicitly. Keep bucket private and verify evidence/version before approval.

**Verify after fix:** Owner and assigned instructor can view a real PDF/image; unrelated users cannot. Cover missing path/object, forbidden access, expired URL, replacement, mobile viewing, and opening a file with a misleading extension.

### INS-022 — Upload/review lifecycle lacks validation, cleanup and version safety

**Severity:** Medium. **Classification:** integrity risk. **Evidence status:** confirmed by code; Storage failures/races pending live verification.

**Evidence / trace:** `src/components/InternDashboard.jsx:219–231,647–655` uses original file.name/doc_type in a timestamped path, `upsert:true`, and only input accept hints. There is no size/MIME check, sanitization, upload busy state, or old-object cleanup. Storage upload precedes DB UPDATE; failure leaves a new object. No DELETE policy exists (`supabase/schema.sql:368–390`). `src/components/InstructorDashboard.jsx:322–334` reviews by id, preserving an old note by default, without file version; documents lack reviewed_by/reviewed_at (`supabase/schema.sql:134–145`).

**Preconditions / reproduction:** Isolated bucket: choose oversized/mismatched files, unusual slash/Unicode/long filenames; replace a file repeatedly; fail metadata write after successful upload; race two uploads; upload a replacement while an instructor approves a stale card. Approve a previously revised document and inspect its note.

**Expected vs actual / impact:** Only valid evidence should persist, superseded/orphaned objects need a policy, and approval should identify the reviewed version. Current flow can retain unreachable files, let older requests overwrite latest metadata, approve unseen replacement content, and leave stale revision notes on Approved cards. Filename acceptance failures are possible, but no particular exploit is asserted.

**Root cause / focused fix:** Storage and metadata are separate unversioned writes. Validate client and bucket limits, use a generated safe object id with original name only as display metadata, stage/finalize uploads with compensating cleanup/retry, and record immutable evidence versions. Review with expected version/status and trusted reviewer/time; clear or preserve notes according to explicit history rules. Scope cleanup privileges narrowly; do not grant global DELETE.

**Verify after fix:** Size/type/boundary filename tests; failure after upload; replacement cleanup; same-document concurrent upload; stale review conflicts; correct version/reviewer/note after reload. No successful toast before both persistence stages finish.

### INS-023 — Simulated controls claim successful imports, exports and backups

**Severity:** Medium. **Classification:** usability issue. **Evidence status:** confirmed by code.

**Evidence / trace:** Admin stores only selected filename (`src/components/AdminDashboard.jsx:594–595`); Process Import just audit/toast (`572–576`), templates and audit Export toast (`604,619`). Backup is a 2.5-second timer plus Database backup completed audit event (`315–322`), while panel says manual snapshot (`641–649`). Instructor exports only timers (`194–201`). Intern DTR, certificate, PDF/Excel exports only toast (`src/components/InternDashboard.jsx:450–451,724–726,759–762`). Admin uptime 99.8% is a literal (`src/components/AdminDashboard.jsx:329`). Bulk upload advertises drag/drop but no onDrop exists (`557–595`).

**Preconditions / reproduction:** Read handlers, or later click each control in an isolated browser and monitor network/downloads/data. Empty/invalid import content has the same alleged success because no content is read. Backup claims completion without snapshot API. Observe uptime while offline.

**Expected vs actual / impact:** An operation should claim completion only after doing the work. Users may believe accounts are imported, official records exported, or recoverable snapshots created. README disclosure does not correct the operating UI; audit entries themselves falsely state real work.

**Root cause / focused fix:** Demo affordances are presented as live capabilities. Label/disable unavailable features and remove fabricated operational events/uptime, or implement genuine authorized operations with verified outcomes. For backups, link to/describe verified Supabase-managed procedures instead of manufacturing a browser snapshot. Classify generated certificates as official only under a defined issuance process.

**Verify after fix:** Every enabled import/export must yield correct persisted rows/artifacts; no network/file result means no success. Backup status must correspond to actual verified backup metadata. Confirm drag/drop only advertised when implemented and simulations are visibly marked before interaction.

### INS-024 — Announcements are never delivered in Intern UI and name-based selection is ambiguous

**Severity:** Medium. **Classification:** incomplete feature. **Evidence status:** confirmed by code.

**Evidence / trace:** `src/components/InstructorDashboard.jsx:337–358,863–866` selects recipient by full name and `roster.find`. `src/components/InternDashboard.jsx:29–35,104–128,269–813` contains neither announcement query/state nor rendering. The README claims broadcasts to interns (`README.md:27–28`).

**Preconditions / reproduction:** Send personal and All Interns announcements for disposable assigned interns. Inspect every Intern tab after reload: no inbox/feed exists. Give two assigned interns identical names and select the second option; find resolves the first matching name. A name equal to All Interns is also ambiguous.

**Expected vs actual / impact:** Intended interns should see a persisted message addressed to the correct identity. Instructor sees Sent and success, but recipients have no UI delivery path; duplicate names can target the wrong person.

**Root cause / focused fix:** Sender-only feature and display-name identity. Use recipient UUIDs/options with differentiating labels; implement an own-audience Intern feed/read query after INS-006 policies are corrected. State delivery semantics honestly; an insert alone is not proof a recipient read it.

**Verify after fix:** Two rosters, duplicated/renamed recipients, personal/broadcast messages, loading/empty/error states and reassignment. Only intended recipients see messages, with correct author/date and no sender-only false-delivery claim.

### INS-025 — Risk, completion and time-period metrics contradict their labels

**Severity:** Medium. **Classification:** defect. **Evidence status:** confirmed by code; chart aggregation reproduced locally.

**Evidence / trace:** Instructor uses static interns.status for At Risk/Completed (`src/components/InstructorDashboard.jsx:146,175–184,407`); schema defaults On Track with no updater (`supabase/schema.sql:80`). Cleared and progress eligibility use hours only (`148,493`); document eligibility uses docs only (`364,730`); Intern document eligibility uses hours plus nonempty all-approved docs (`src/components/InternDashboard.jsx:591–594`), report certificate uses hours only (`715–725`). Both dashboards total all returned hours without verification filtering. Velocity is hardcoded 8 (`src/components/InstructorDashboard.jsx:473–492`). Intern This Week/Month takes first 5/20 records (`243`); Weekly chart takes last 8, Monthly/All Time merge month names across years and average days (`249–260`).

**Preconditions / reproduction:** Use sparse historical DTR dates spanning weeks/years, unverified hours and a full-hours intern with missing/rejected docs. Compare filters/chart/card/certificate/roster labels. Local chart probe for Oct 2025 (8h), Oct 2026 (4h,8h) produced a single October average 6.7 in both Monthly and All Time. Reach required hours and inspect unchanged On Track/Completed count.

**Expected vs actual / impact:** Period labels should filter actual calendar periods; risk/completion/clearance should follow a common defined rule. Old records can appear as this week, year totals merge, averages masquerade as hours logs, completion statuses become stale, and eligibility differs by screen. Counting unverified work may be intentional, but it is not distinguished from certified hours.

**Root cause / focused fix:** Multiple independent ad hoc derivations plus stale stored status. Define calendar periods/timezone, summed vs averaged metrics, verified vs logged hours, risk criteria, and clearance requirements; calculate once consistently using complete data. Label fixed forecast assumptions explicitly. Add scheduled risk/alert generation only if commissioned; no automation currently exists.

**Verify after fix:** Reconcile DTR period sums, charts, roster progress, completed counts and clearance for shared fixtures covering two years, gaps, unverified entries, threshold boundaries and document revisions. Change required hours and confirm every dependent result updates.

### INS-026 — Read failures appear as empty successful dashboards with no retry

**Severity:** Medium. **Classification:** defect. **Evidence status:** confirmed by code.

**Evidence / trace:** All `loadAll` functions destructure data but discard errors (`src/components/AdminDashboard.jsx:78–115`; `src/components/InstructorDashboard.jsx:97–159`; `src/components/InternDashboard.jsx:104–128`). Null results become empty arrays/defaults and loading ends. No retry/Refresh control exists in source. A rejected promise has no enclosing catch/finally. Most mutations at least check returned error; reads do not.

**Preconditions / reproduction:** Later use an isolated environment/network double to return permission/network/table/join errors on one read and then all reads. Load a dashboard and observe zero users/hours or No requirements/evaluations instead of a failure; retry without reloading the whole page is unavailable.

**Expected vs actual / impact:** Failed data should be distinguishable from confirmed emptiness and unknown totals. The UI can falsely indicate zero progress, no pending work, or no checklist; partial reads can combine incompatible snapshots. A thrown promise can leave loading stuck.

**Root cause / focused fix:** Error state is discarded. Track per-resource errors/partial availability, retain last known data with stale indication where appropriate, handle rejection/finally, and provide safe retry. Do not permit dependent decisions/edits when their prerequisite data is unknown.

**Verify after fix:** Each individual query failure, all-network outage, expired/forbidden response and later recovery must display accurate status and retry. Real empty results should retain helpful empty states. No failure should fabricate a zero metric or a successful mutation.

### INS-027 — Unpaginated client aggregation can silently truncate totals and become stale

**Severity:** Medium. **Classification:** maintenance concern. **Evidence status:** confirmed by code; data-volume impact and latency suspected/unmeasured.

**Evidence / trace:** Dashboard reads at `src/components/AdminDashboard.jsx:89–95`, `src/components/InstructorDashboard.jsx:116–122`, `src/components/InternDashboard.jsx:113–120` have no range/pagination/count checks. Audit logs alone explicitly limit to 50 with no older-page UI. All hours/counts are computed from returned arrays. Effects run on mount/profile id, without realtime/refetch/focus refresh (`src/components/AdminDashboard.jsx:117–119`; `src/components/InstructorDashboard.jsx:162–165`; `src/components/InternDashboard.jsx:130–133`). Instructor approval invokes all eight load queries again. No secondary FK/date indexes are declared in schema.

**Preconditions / reproduction:** In a disposable project, exceed its configured API row cap with attendance/accounts/documents; compare database aggregate/count to UI. Keep Intern UI open while instructor approves/corrects or Admin changes required hours. Navigate tabs without reloading.

**Expected vs actual / impact:** Totals must represent all eligible rows and views should expose freshness. A capped response can look complete and undercount hours/accounts/requirements. External changes remain stale until remount/reload; large rosters cause broad fetches and array scans. No measured production latency or actual truncation is claimed.

**Root cause / focused fix:** UI treats a single unrestricted list response as a complete dataset. Use authorized server-side aggregates plus deterministic paginated detail queries and explicit total counts. Add targeted invalidation/Refresh/realtime as appropriate, and indexes such as instructor_id and intern_id/date after measuring query plans. Avoid full refetches for unrelated resources.

**Verify after fix:** Data beyond the configured cap must reconcile with database totals, including audit pagination and search across pages. Test cross-session updates and missing-index query plans under representative disposable volume; record measured timings rather than inferred slowness.

### INS-028 — Authentication has unresolved loading, missing-profile and stale-request paths

**Severity:** Medium. **Classification:** defect. **Evidence status:** confirmed by code; race timing pending runtime reproduction.

**Evidence / trace:** `src/App.jsx:13–43` does not handle getSession error/rejection or cancel/sequence profile requests. No-session/null-profile branch precedes loading (`51–55`), so loading sessions show LoginPage. Missing profile/query error logs console then falls back to LoginPage while a session still exists. Session-null branch doesn't cancel an old profile response; overlapping user/refresh requests can overwrite state. Exact-role render has no unsupported-role fallback (`90–95`). Logout ignores SDK error (`45–48`). Login handlers lack catch/finally (`src/components/LoginPage.jsx:94–128`); signup ignores returned session/user/email-confirmation needs.

**Preconditions / reproduction:** Throttle profile requests; restore a session, sign out/sign in as another disposable user before a prior profile request settles; simulate missing profile, failed trigger/backfill, getSession failure and expired token. Test email confirmation on/off and duplicate registration. Make remote logout revocation fail.

**Expected vs actual / impact:** Explicit session/profile/loading/error states should match the current user. UI can flash sign-in, strand a signed-in user behind a form with no session-repair/sign-out explanation, or receive stale profile data. A stale profile could route the wrong dashboard/ids; this timing impact is not claimed as a live reproduced bypass. Role CHECK prevents normal invalid roles, but a drifted profile would render a blank screen. Signup success does not tell users to confirm email when configured; automatic session creation can replace its success screen with Pending gate. Global logout failure is not disclosed; this SDK often still clears local state, so retained local login is not assumed.

**Root cause / focused fix:** Implicit null-state routing and unguarded async lifecycle. Use an explicit auth state machine, current-user request guards/cancellation, loading before login, profile error/recovery with sign-out/retry, valid-role fallback, and finally-based submission state. Handle confirmation requirements and duplicate signup without asserting creation from error=null alone. Provide a narrowly authorized profile-repair process for genuinely missing rows.

**Verify after fix:** Delayed out-of-order auth/profile responses never route a different user's profile; session restoration shows loading; missing profile is actionable; confirmation/duplicate/expired-session/logout failures are honest. Listener cleanup must continue working in StrictMode. Password recovery/change-password are currently absent, not tested flows.

### INS-029 — Master-data deletion silently clears assignments and leaves stale edit buffers

**Severity:** Medium. **Classification:** usability issue. **Evidence status:** confirmed by code.

**Evidence / trace:** `src/components/AdminDashboard.jsx:307–311,537–542` deletes immediately through Remove and changes only master-list state. FKs `supabase/schema.sql:77–78` use ON DELETE SET NULL. Intern rows/forms loaded at `src/components/AdminDashboard.jsx:102–109` are not refreshed after deletion. No reference-count/impact message or delete audit exists (also INS-009).

**Preconditions / reproduction:** Assign a disposable intern to a company/section; Remove that master row. Inspect the intern record, then its already-loaded Admin form and try Save. Delete the current academic-year row and inspect the header.

**Expected vs actual / impact:** Deletion should explain which assignments will be cleared and display the persisted result. The click immediately nulls references; local forms can retain deleted UUIDs and later fail FK checks, or obscure the clearing. This is actual deletion; Activate/Deactivate is unrelated status update.

**Root cause / focused fix:** Delete workflow ignores FK consequences/local dependents. Add an impact-aware Delete company/section/year action with deliberate confirmation or reassignment/archive policy, update/invalidate dependent state after success, and record the audit. Use RESTRICT or archival rules if the business needs history rather than silently detaching it.

**Verify after fix:** In-use and unused deletion, cancellation, FK conflict, concurrent deletion and current-year removal. Count affected assignments accurately, reload forms correctly, and ensure no obsolete id is resaved inadvertently.

### INS-030 — Course sections and academic-year management are only partial

**Severity:** Medium. **Classification:** incomplete feature. **Evidence status:** confirmed by code.

**Evidence / trace:** `supabase/schema.sql:52–56,74–80` defines is_current and section_id, but no intern/section relationship to academic years. Admin intern form/update has only instructor/company/hours (`src/components/AdminDashboard.jsx:107,150–154,487–506`). Master save edits only name/label (`287–303`); new years default false and UI never sets current. Header picks the first current row (`341`); no single-current-year constraint. Seed year is 2024–2025 (`supabase/schema.sql:405–406`).

**Preconditions / reproduction:** Add a disposable year and section through Admin. Attempt to set the new year Current or assign the section to an intern; no controls exist. Through API, set two years current and inspect header selection; delete the sole current year.

**Expected vs actual / impact:** Master entries advertised for internship administration should support the required association/current-year workflow. Sections cannot be used through the UI, years cannot be selected current, and period-specific reporting has no data relationship despite semester-style labels. This is incomplete modeling/control coverage, not proof that any particular institution's year rule is wrong.

**Root cause / focused fix:** Reference CRUD exists without lifecycle integration. Implement section assignment with valid references; define cohort/year linkage before adding it, and an atomic set-current-year operation plus the chosen uniqueness rule. Avoid hardcoded seed assumptions in live setup.

**Verify after fix:** Create/edit/assign/reassign/remove sections, switch year atomically, reject invalid/multiple current states where required, and verify affected labels/filters/history match the chosen year model.

### INS-031 — Missing configuration builds successfully but crashes at application import

**Severity:** Medium. **Classification:** defect. **Evidence status:** runtime reproduced (installed SDK missing-config probe); browser startup pending.

**Evidence / trace:** `src/lib/supabaseClient.js:3–12` warns then unconditionally calls createClient with absent variables. README `36` and client warning reference `.env.example`, which is absent from tracked and current files. No relevant environment variables/config files were available. `npm run build` nevertheless passed; actual SDK probe throws `supabaseUrl is required.` No React error boundary surrounds import/startup (`src/main.jsx:7–13`).

**Preconditions / reproduction:** Fresh checkout/build/start without VITE_SUPABASE_URL/ANON_KEY, or with malformed URL. SDK initialization fails before LoginPage can explain setup. The missing-values SDK exception was reproduced without network access.

**Expected vs actual / impact:** Setup should be reproducible and failure should be actionable. Current documented copy step cannot be followed, and a seemingly successful deploy can show an unusable application. No hosting/environment smoke check is supplied.

**Root cause / focused fix:** Documentation/template and runtime configuration contract disagree. Provide a safe public-key-only example, validate required build/runtime settings with a clear setup error, and document static-host build variables/output. Do not put private credentials in VITE variables. Verify host-specific security headers/cache/environment separately; their actual configuration is unknown here.

**Verify after fix:** Missing/empty/malformed values should fail with a clear setup result; a fresh configured build should initialize Auth and display a recoverable offline error when Supabase is unavailable. Confirm no secret key appears in emitted assets.

### INS-032 — Failed form saves discard the user's accomplishment/revision text

**Severity:** Medium. **Classification:** usability issue. **Evidence status:** confirmed by code.

**Evidence / trace:** `src/components/InternDashboard.jsx:800–802` invokes async handleClockOut, immediately clears accomplishment and closes modal, before its returned error/success. Instructor Revision Send similarly calls updateDocStatus and immediately clears/closes (`src/components/InstructorDashboard.jsx:799–803`). Neither saves an error-preserving draft nor disables pending submission. Accomplishment shows a 500-character limit but textarea has no maxLength or handler/schema length enforcement (`src/components/InternDashboard.jsx:783–794`; `supabase/schema.sql:94`); revision Send allows empty notes.

**Preconditions / reproduction:** In an isolated network/error double, type a long accomplishment or revision instruction and fail only its save. Reopen the form; text is gone. Enter >500 characters or send blank revision and inspect outcome.

**Expected vs actual / impact:** Failure should preserve the draft and allow retry. Current forms lose user work despite failed persistence; the visible character limit is misleading and blank revision feedback can leave the intern without guidance.

**Root cause / focused fix:** Callers do not await a structured save result. Return/propagate mutation outcome, close/reset only on success, retain drafts on errors, disable while pending, and enforce any displayed length/nonempty-note rules in both UI and controlled database writes. Provide explicit Cancel/Clear Fields behavior.

**Verify after fix:** Failed/slow/successful saves, retry/double-click, Escape/backdrop during pending, empty/over-limit text. Drafts persist through failure and close/reset exactly once after actual success.

### INS-033 — Shared dialogs and controls lack essential accessible behavior

**Severity:** Medium. **Classification:** usability issue. **Evidence status:** confirmed by code; browser/assistive-technology interaction pending.

**Evidence / trace:** `src/components/Modal.jsx:10–30` lacks dialog role/aria-modal/title association, focus trap/return, and viewport max-height/scrolling; it does implement Escape/backdrop and removes its key listener (`4–8`). Shell sheets (`src/components/Shell.jsx:197–253`) lack equivalent dialog/focus/Escape support. Labels have no htmlFor/id relationship (`src/components/LoginPage.jsx:27–57`; `src/components/AdminDashboard.jsx:32–37`; intern correction form `518–540`). Collapsed Sign Out has no text/accessible label (`src/components/Shell.jsx:123–131`), mobile avatar only initials (`149–155`), password-eye/close controls lack names. Toast container has no status/alert live region and disappears after 3 s (`src/components/Toast.jsx:11–14,20–40`); bottom-5 position intersects the mobile 60px nav region (`src/components/Shell.jsx:164–166`).

**Preconditions / reproduction:** Pending browser verification: keyboard-only/screen-reader navigation through each modal/sheet; Tab past last field, close and observe focus, use Escape in More/profile; test short mobile viewport/200% zoom and toasts over navigation. Inspect accessibility tree for form labels/icon controls/status updates.

**Expected vs actual / impact:** Users should know what inputs/actions mean, remain within an open modal, reach all content and hear save/error feedback. Source lacks these mechanisms; modal overflow and actual overlap depend on viewport/rendering and are not claimed as visually reproduced.

**Root cause / focused fix:** Shared primitives implement appearance/close clicks without accessible interaction contracts. Add dialog semantics/focus management and scroll bounds, explicit labels/accessibly named icons and state, visible keyboard focus, suitable live-region notifications/dismissal, and mobile-safe notification placement. Apply consistent behavior to sheets as well as Modal.

**Verify after fix:** Keyboard/screen-reader tests on every role, modal focus return, Escape/backdrop, small-height mobile/zoom, associated labels, announcements of async outcomes, and navigation usable during notifications.

### INS-034 — Small status/action text fails minimum contrast with current tokens

**Severity:** Medium. **Classification:** usability issue. **Evidence status:** runtime reproduced (WCAG luminance calculation using source colors); rendered browser audit pending.

**Evidence / trace:** `src/index.css:55–58` defines success #16a34a on #dcfce7 and warning #d97706 on #fef3c7. Text-xs pills use these pairs (`src/components/InternDashboard.jsx:61–69`; `src/components/InstructorDashboard.jsx:46–61`; `src/components/AdminDashboard.jsx:434–436`). Local computed ratios: green/pale-green **3.00:1**, green/white **3.30:1**, orange/pale-yellow **2.86:1**. White text on success green also has the same 3.30 ratio (`src/components/InternDashboard.jsx:724`).

**Preconditions / reproduction:** Inspect the light-theme status tokens and these text-xs/text-sm controls; calculate WCAG relative luminance for the actual foreground/background. The ordinary small text threshold is 4.5:1 ([W3C contrast criterion](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)).

**Expected vs actual / impact:** Status and action text should be readable to low-vision users; these source color pairs fall below the threshold for their small text sizes. Textual status exists, so the finding is contrast, not color-only semantics. Full visual/dark-theme compliance was not established.

**Root cause / focused fix:** Status foreground values are suitable for some graphics but not small text on the chosen backgrounds. Use darker text tokens/adequate button pairs while retaining semantic labels/icons; verify all normal, disabled, hover and focus states.

**Verify after fix:** Automated and rendered contrast checks for every status/action across supported themes, plus keyboard focus visibility and mobile text scaling. Do not rely on changing color alone to convey meaning.

### INS-038 — Public demo shortcuts embed predictable privileged credentials

**Severity:** Medium. **Classification:** security issue. **Evidence status:** confirmed by code; existence/activation of these accounts blocked.

**Evidence / trace:** `src/components/LoginPage.jsx:15–19,89–92,219–239` exposes role-specific emails and sets `password123` for every shortcut. UI asks users to create and activate these accounts. No actual seeded Auth account or private service key was found in SQL/source.

**Preconditions / reproduction:** If an operator created an activated Admin/Instructor using the displayed credentials in a real project, anyone with the public app can click the shortcut and attempt login. Do not attempt this against real accounts during audit. Inspect isolated demo configuration instead.

**Expected vs actual / impact:** Privileged real accounts should not use a password shipped in the public bundle. This is a conditional credential-exposure risk, not a claim those accounts currently exist. Registration with public privileged roles is separately INS-002.

**Root cause / focused fix:** Demonstration login affordances are shipped without environment isolation. Remove production shortcuts/password autofill or gate them to a disposable demo build/project. During authorized remediation, inventory and rotate any real reused credentials through trusted account procedures.

**Verify after fix:** Production bundle/login page has no reusable privileged demo credentials; demo project is isolated and disposable. Confirm affected real accounts, if any, no longer accept the known password without disclosing credential material in logs/reports.

### INS-039 — Zero-row mutations can show success without changing a record

**Severity:** Medium. **Classification:** defect. **Evidence status:** runtime reproduced (local source-extracted handler with zero-row double); live conflict scenario pending.

**Evidence / trace:** Admin assignment/profile/status/master UPDATE and master DELETE only inspect error, not returned rows (`src/components/AdminDashboard.jsx:148–167,207–217,261–270,295–311`). Instructor alert dismissal and exception status writes do likewise (`src/components/InstructorDashboard.jsx:204–208,279–315`). They update local state, toast success, and sometimes write audit entries even if no row matched. PostgreSQL filters unauthorized existing rows rather than necessarily throwing (section 2 policy semantics).

**Preconditions / reproduction:** In disposable data, open the same company in two Admin tabs; delete it in one, then save its old modal in the other. Alternatively demote Admin A through Admin B while A's old dashboard remains open, then have A update a different user's profile: the current self-only policy cannot match that foreign row. Observe the SDK zero-row/no-error result and resulting local success. Bulk review must also be checked against actual matched rows, not selected ids.

**Expected vs actual / impact:** Success must establish the intended record was changed. A source-extracted assignment-handler probe returned zero affected rows with no error: persisted fixture stayed 486 hours, local state changed to 100, a success toast appeared, and an audit entry was requested. Current handlers can report success for a nonexistent or no-longer-authorized target. This is distinct from intentionally simulated operations (023) and partial multi-table commits (010/019).

**Root cause / focused fix:** Error=null is treated as proof of affected-row cardinality. Use appropriate returned-row/count assertions and expected-state/version predicates; on zero/conflicting rows, preserve drafts, show conflict/authorization feedback and refresh safely. Have transactional RPCs return committed outcomes and trusted audit events. Never weaken RLS to turn a zero-row result into a match.

**Verify after fix:** Deleted target, changed role/assignment, concurrent save and zero/mixed-row bulk cases must not display success or invent an audit event. Confirm the normal one-row update/delete still works and affected counts agree with persisted data.

### INS-035 — CRUD terminology and colors do not meet the requested action convention

**Severity:** Low. **Classification:** usability issue. **Evidence status:** confirmed by code.

**Evidence / trace:** Master actions use generic + Add, Edit, Remove and Add Entry/Value (`src/components/AdminDashboard.jsx:534–542,722–736`); Save is generic (`517,736`), despite Edit User already using Save Changes (`710`). Add/Edit/Save usually use primary blue instead of requested green/orange. Deactivate/Reactivate (`261–270,443–445`) updates status, not DELETE; Pending is called Reactivate although never active. Evaluation Clear (`src/components/InstructorDashboard.jsx:559–562`) clears fields, not cancellation or deletion. DTR Approve All/Reject All act on selected Pending ids (`src/components/InstructorDashboard.jsx:297–315,621–623`); selected count helps, but Approve Selected/Reject Selected is more precise. Refresh is absent (INS-026/027).

**Preconditions / reproduction:** Review Admin master/assignment/account actions and evaluation form. Compare label, actual mutation and supplied CRUD color/wording requirements; no personal style preference is used as evidence.

**Expected vs actual / impact:** Actions should consistently identify the record and distinguish delete/status changes/reset. Generic entries/removal/saves and inconsistent color mapping make the consequences less clear, especially with multiple master types. Current text generally prevents color-only ambiguity.

**Root cause / focused fix:** No common action contract. Use Add company/section/academic year, Edit and Save Changes, Delete + record name for actual deletion, Activate for Pending, Deactivate/Reactivate for status changes; reserve Restore for real restoration and Clear Fields for reset. Apply requested readable colors: green Add, blue View/Search, orange Edit/Save, red Delete, purple Restore, gray secondary. Keep labels/icons and fix contrast with INS-034.

**Verify after fix:** Map every action label to its mutation, confirm Cancel/Clear/Refresh are distinct, and test readable state colors. Do not relabel activation as deletion or invent a restore operation where none exists.

### INS-036 — All roles and Recharts ship in one large initial JavaScript chunk

**Severity:** Low. **Classification:** maintenance concern. **Evidence status:** runtime reproduced (build output); user-perceived performance unmeasured.

**Evidence / trace:** `src/App.jsx:3–6` eagerly imports every dashboard, Intern eagerly imports Recharts (`src/components/InternDashboard.jsx:2–10`), and `vite.config.js:6–19` has no splitting strategy. Build emits a single JS asset **931.25 kB (260.05 kB gzip)** and a >500 kB warning.

**Preconditions / reproduction:** Run `npm run build` on the current installed lockfile. Load login under measured constrained-network/device conditions in a later browser performance check.

**Expected vs actual / impact:** Login and a role dashboard should not require unnecessary other-role/chart code up front. Large bundle size is measured; slow startup, specific latency and device-memory problems are not measured findings.

**Root cause / focused fix:** All role modules are in the initial import graph. After correctness repairs, lazy-load dashboards/chart-heavy views with meaningful loading/error fallbacks and measure resulting chunks/transfer/startup. Avoid suppressing the warning without improving or explaining payload.

**Verify after fix:** Compare production chunk graphs and compressed transfer, then measure startup/navigation on representative mobile hardware. Preserve reliable auth/loading/error behavior when chunks fail to load.

### INS-037 — Documented Node minimum disagrees with the committed dependency tree

**Severity:** Low. **Classification:** maintenance concern. **Evidence status:** confirmed by code; older-Node execution not performed.

**Evidence / trace:** `package.json:6–7` claims Node >=18. Lockfile Supabase JS/Auth engines require >=22 (`package-lock.json:1203–1212,1271–1284`); Tailwind oxide requires >=20 (`1311–1318`). The actual audit environment Node 24 satisfies these, and `npm ls`/build passed there.

**Preconditions / reproduction:** Compare declared engine with lockfile engines; in a later isolated supported matrix, attempt documented setup on Node 18/20 without altering the audit workspace.

**Expected vs actual / impact:** Setup's advertised runtime floor should satisfy its resolved dependencies. An operator following the current minimum can receive engine warnings/failures or unsupported tooling. No specific Node 18 crash is asserted.

**Root cause / focused fix:** Broad dependency ranges resolved newer engine requirements without updating project/deployment documentation. Set and document a compatible Node floor/pinned CI runtime or deliberately select compatible dependency versions during a separate tested repair. Keep the lockfile reproducible.

**Verify after fix:** Clean install/build in the documented Node version, inspect engine warnings, and check deployment runtime. Confirm React/Recharts/Vite/Tailwind peers remain compatible.

## 6. Confirmed intentional limitations

These describe implemented scope, not a claim that their UI presentation or security is acceptable. They are not additional counted findings.

| Supplied limitation | Verification against current files | Consequence |
|---|---|---|
| Simulated bulk import | Confirmed: selected file.name only, audit/toast instead of parsing/writes (`src/components/AdminDashboard.jsx:74–76,572–595`). | Intentionally incomplete; false successful import/template-download claims are INS-023. |
| Simulated instructor reports | Confirmed: timed reportStates/toasts only (`src/components/InstructorDashboard.jsx:194–201`). | Intentionally incomplete; should be visible before clicking, INS-023. Intern reports, certificate, Admin templates and audit export are also nonfunctional exports, beyond the supplied list. |
| Simulated manual backup | Confirmed: timeout and audit insert, no backup operation (`src/components/AdminDashboard.jsx:315–322`), documented as simulation (`README.md:127–130`). | False snapshot/completion claim is INS-023; false audit data is INS-009. Actual provider backup schedules/retention/restore capability were not verified. |
| No automatic alert generation | Confirmed in repository: alert read/dismiss only, schema table/policies, no generator, trigger/job/Edge Function (`src/components/InstructorDashboard.jsx:121,204–208`; `supabase/schema.sql:165–173,340–344`; `README.md:97–101`). | No expectation that empty alerts proves absence of risk. An external deployed generator could exist; none was available to inspect. No alert-generator defect is invented. |
| Admin-attached checklists | Confirmed: signup only creates profile/intern; Admin explicitly attaches standard four (`supabase/schema.sql:200–213`; `src/components/AdminDashboard.jsx:21–26,170–181`; `README.md:102–106`). | Manual provisioning is intentional. Completeness/idempotency and unauthorized owner checklist changes are separate defects (008/020). Intern empty state refers to instructor, but actual provisioning UI is Admin; clarify responsibility in later UX work. |
| Admin activation after registration | Confirmed: trigger sets Pending and App gates non-Active (`supabase/schema.sql:208`; `src/App.jsx:66–88`; `src/components/LoginPage.jsx:378–399`). | Intended approval workflow exists in UI, but effective DB enforcement fails (001–003). Pending users can authenticate under normal Auth settings; dashboard denial is not sign-in denial. |

Other reviewed scope limits: there is no implemented password recovery/change-password/account self-edit flow; no account deletion/restore UI; no ordinary daily-DTR verification queue beyond exception review; no custom-checklist editor; no section assignment/current-year selector (INS-030); no real report generation. Lack of a recovery implementation is recorded as scope, not an asserted broken recovery flow. SQL permits some administrative/domain operations not exposed by controls, as shown in section 4.

### Positive checks and non-findings

- Architecture matches the supplied context: React/JSX/Vite/Tailwind/Recharts, single browser Supabase client, no custom Express backend. No service-role key found in the reviewed current text files.
- All application tables explicitly enable RLS; anonymous callers have no application-table allow policies in the supplied SQL. Actual grants/additional live policies remain unknown.
- Role/status/exception/document/alert enumerations, primary keys and relevant existence foreign keys are present. Evaluation totals have a 0–100 check, though nullable and not tied to rubric values.
- Signup profile/intern creation happens in a single trigger transaction. No client-side second insert was found that inherently splits these two signup rows. Metadata validity and effective privilege are still defective.
- Valid rubric weights total 100% and the normal UI score formula is correct. No 25/35/20/20 arithmetic error was found.
- Instructor UI initially scopes roster by instructor_id and scopes domain fetches by those ids; Intern queries scope their domain records by own id. This does not fix the broader database permissions.
- Current DTR approval code really attempts attendance UPDATE for an existing row and INSERT for a missing row; verifier is set from the UI profile. Rejection normally leaves attendance unchanged. Atomicity/error/identity guarantees are insufficient.
- Clock-out has both intern_id and log_date filters, checks returned errors and zero-row data, and records the accomplishment. These improve error handling but do not enforce uniqueness or safe transitions.
- Modal Escape/backdrop close and auth/interval/key-listener cleanup exist. Table horizontal-scroll wrappers and mobile More navigation are implemented; no dead role-tab control was found.
- No React `dangerouslySetInnerHTML`, raw SQL client construction, or unsafe unescaped HTML rendering was found. This is not a claim of comprehensive XSS immunity, dependency safety or secure hosting.

## 7. Prioritized repair plan and dependencies

This plan proposes work only. No migration, dependency update, implementation, production change or record repair has been executed. Preserve React + Supabase; authorization must remain in RLS/controlled database operations. Never place a service-role key in browser code or broaden policies to force UI calls through.

| Priority / sequence | Proposed narrowly scoped work | Findings / dependencies |
|---|---|---|
| P0.1 — Close authority escalation | Migration M01: protect role/status/protected profiles fields; remove broad self-write authority; separate requested/effective roles; enforce active status and assignment scope across tables/Storage. Explicitly inspect/set intended table/column/function grants. | 001–008. Fix together so one open path cannot bypass another. Retest own-name/evaluator/instructor joins after narrowing reads. |
| P0.2 — Restore trusted evidence | Migration M02: controlled audit generation, bound authors/reviewers, protected timestamps; private bucket hardening. | 006–009,015,017,022. Depends on M01's authorization helpers. Read-only inventory before any change; real credential rotation only under subsequently authorized account remediation (038). |
| P0.3 — Protect attendance | Read-only duplicate/anomaly inventory first. Migration M03: chosen attendance key/time model, validated server-side clocking/correction and atomic locked review RPC; Pending uniqueness; trusted review/audit fields. UI switches to committed outcomes. | 007,010–012,016. M01/M02 first; do not apply uniqueness until legacy conflicts have an explicitly reviewed resolution plan. |
| P0.4 — Prevent operational misdirection | Correct fresh-only setup documentation and remove/label fabricated backup/import/export/uptime claims; restrict unnecessary exposed dev tooling and schedule tested dependency remediation. | 013–014,023,038. Can proceed independently of data model after audit approval; no reset script as migration. |
| P1.1 — Coherent account/configuration operations | Migration M04: atomic Admin role/assignment operation, role/active-reference validation, positive required-hour constraints, idempotent versioned checklist identity; UI validates and displays returned committed values. | 018–020. Depends on M01 and chosen historical-data handling; inspect existing bad values/duplicates before constraints. |
| P1.2 — Real evidence review | Migration M05: document evidence versions/reviewer/time and guarded transitions; scoped upload finalization/cleanup and authorized private viewing; bucket MIME/size rules. | 008,015,021–022,032. Depends on M01/M02; do not grant global Storage DELETE as cleanup shortcut. |
| P1.3 — Data correctness and delivery | Migration M06 where needed: rubric validation/computed total/idempotency; UUID announcement audience and scoped recipient feed; canonical metrics/calendar aggregates; paginated detail/count APIs and targeted indexes. | 006,017,024–027. Agree verification/clearance/risk rules before persisting derived status. |
| P1.4 — Error-aware application shell | Explicit auth/profile states, cancellation/sequence guards, missing-profile/retry path, per-resource failures, draft preservation, affected-row assertions, real busy controls and safe refresh. | 026–028,031–032,039. Must work with narrower policies rather than conceal authorization errors. |
| P2 — Administrative completeness/accessibility | Section/year integration/current-year operation (M07 if commissioned), impact-aware deletion, accessible dialogs/sheets/inputs/status text, requested CRUD labels/colors. | 029–030,033–035. Confirm year/history requirements first; fix low-contrast colors before applying action palette. |
| P2 — Delivery/tooling | Measured code splitting; aligned Node floor, environment example/build checks, clean supported-runtime validation and regression/CI coverage. | 014,031,036–037. Dependency update choices must satisfy plugin/runtime peers; do not use `npm audit fix --force` as the plan. |

Migration guidance: each Mxx should be an incremental, versioned transaction where possible, with explicit prerequisites and post-change catalog verification. Use NOT VALID/backfill/validation strategies where supported and appropriate; UNIQUE needs a separately assessed conflict-resolution/index strategy. Plan rather than automatically delete/merge historical rows. Database transactions cannot atomically commit a Storage object and a database row, so document staging and compensating cleanup explicitly. Security-definer helpers/RPCs, if required, must use trusted ownership, qualified relations/a carefully restricted search_path, explicit execute grants, auth.uid()/active-role/assignment checks, and no caller-supplied authorization identity.

### Metadata-only checks needed before deploying repairs

A trusted operator should compare deployed metadata with this repository before any migration. The following queries are read-only examples; they were **not run** here. Do not include secrets or real record contents in audit output.

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
   or (schemaname = 'storage' and tablename = 'objects');

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('anon', 'authenticated');

select table_schema, table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and grantee in ('anon', 'authenticated');

select n.nspname, p.proname, pg_get_userbyid(p.proowner) as owner,
       p.prosecdef, p.proconfig, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';

select schemaname, tablename, indexname, indexdef
from pg_indexes where schemaname = 'public';

select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'documents';
```

Also inspect deployed FK/CHECK/UNIQUE definitions, function definitions/trigger ownership, API row cap/exposed schemas, extra functions/views/jobs, Auth signup/email-confirmation/redirect/rate-limit settings, bucket policies and project backup configuration. These may differ from files; do not treat absent repository grants as evidence of either a secure or an unusable deployed project.

## 8. Regression tests for the main workflows

### Test environment and execution rules

All DB/Auth/Storage and browser cases below are **pending**. Use a separately identified disposable Supabase project with application grants/policies applied through a nondestructive setup suitable for that project. Create isolated Admin, Instructor A/B and Intern A/B/C accounts; assign A and B to separate instructors, leave C unassigned, and include separate Pending/Inactive variants and duplicate display names. Use unique synthetic student ids and small generated files. Never use the displayed production-like demo credentials for real data. Establish fixture state through trusted test setup, not browser service-role access. A rollback transaction can test SQL policies with an authenticated context, but it cannot contain Auth/Storage HTTP writes; those need disposable resources and scoped cleanup.

Test the browser **and direct SDK/REST** separately; a hidden button is not an authorization test. On denied writes, assert unchanged rows/objects, not just HTTP/toast text. On allowed writes, re-read persisted data and reconcile the displayed result. Use fresh and retained JWTs, then stale tabs/concurrent clients. Capture per-case expected outcome, response, row/object counts, actor identity, UI feedback and pass/fail. Do not mark these tests passed from this report's local probes.

| Test | Steps and assertions | Findings covered |
|---|---|---|
| RT-01 Signup authority | Sign up with missing/intern/staff/invalid/mixed-case metadata and blank names; confirm email according to project settings. Inspect effective role/status/profile+intern row. Try Pending API reads/writes and later metadata edits. Privilege must require independent approval; invalid signup must not leave half-created app rows. | 001–003,019,028,038 |
| RT-02 Role/status tampering | As each non-Admin variant, update own role/status/id/email/student_id/protected fields and another profile; try allowed basic info. Assert protected denial and unchanged effective authority. Test trusted Admin transition separately. | 001,003,005 |
| RT-03 Complete authorization matrix | For every table and all roles/statuses in section 4, test SELECT/INSERT/UPDATE/DELETE on own, assigned and foreign rows. Test changing intern_id/instructor_id/evaluator_id/reviewed_by/author and primary ids. Reassignment must transfer only intended access; retained JWT after deactivation must be denied. | 003–009,017,019 |
| RT-04 Private Storage | Anonymous/owner/assigned/unassigned staff read, list, insert, update/rename, delete; forged folder paths; Pending/Inactive tokens. Test fresh and pre-existing bucket settings, private download/signed-link expiry, and known-path public retrieval denial. | 003–004,015,021–022 |
| RT-05 Account lifecycle | Convert each role in both directions with/without intern history, simulate secondary insert failure, and check profile/extension/assignments/rosters after reload. Assign inactive/invalid-role staff; missing extension must be explicit. Deactivate is status change, not record deletion. | 018–019,028,035 |
| RT-06 Master/configuration | Add/edit duplicate/blank/case-varied companies/sections/years; assign valid section/company/instructor; set current year; test conflicting-current states. Delete in-use references and cancel deletion. Assert reference effects, UI buffers, audit and history policy. | 009,018–019,029–030,035 |
| RT-07 Checklist provisioning | Zero/one custom/partial/complete checklist, repeated and concurrent attachment, direct owner insertion/status attempts. Check exactly required identities, recoverable partial setup and clear provisioning ownership. | 008,020,026–027 |
| RT-08 Clock transitions | One valid shift, double/concurrent clock-in, repeated after closure, no clock-in clock-out, repeated/concurrent closure and stale tabs. Assert chosen daily/shift uniqueness, one transition, stable accomplishments/hours and no false success. | 007,011,032 |
| RT-09 Timezone/duration | Manila 00:00/07:59/08:00/23:59, overnight 22:00–06:00, immediate closure, clock/device timezone change, equal/reversed/excessive intervals. Assert correct business date and duration across Intern DTR/charts and Instructor Active Now. | 010–012,016,025 |
| RT-10 Correction submission | Required/date/range/reason checks, duplicate Pending requests, status/reviewer forgery on INSERT, unassigned instructor and foreign intern ids. Accepted requests start Pending with no forged reviewer. | 004,007,016 |
| RT-11 DTR success/reject | Approve with one existing attendance row, then with none. Assert exact matching date/owner/times/hours/verifier and Approved exception; preserve relevant existing accomplishment. Reject a separate request and assert attendance unchanged. | 010–012,016 |
| RT-12 DTR failures/concurrency | Inject lookup/update/insert/status/audit failures, duplicate legacy rows, repeated approval, concurrent approve/approve and approve/reject. Assert atomic state/idempotency/conflict behavior and one attendance identity. No Approved state may remain from an unsuccessful reconciliation. | 009–011,016 |
| RT-13 Bulk DTR | Select subset/all Pending, mix successful/conflicting/forbidden items, change another tab's status during review. Verify actual changed count, reviewer, item-specific errors/retry and reconciled attendance; repeat approval/rejection safely. | 004,010–011 |
| RT-14 Rubric | All 1=20, all 5=100, 4/5/3/2=75; null/string/missing/extra/out-of-range criteria, inconsistent total/author, double-click/retry and distinct evaluation instances. Check persisted criteria/rounded total and both roles' display. | 004,017,026 |
| RT-15 Upload and review | Valid/invalid MIME/size/names, replacement, failed metadata after upload, orphan cleanup, two simultaneous uploads, stale reviewer approval, missing/expired object. Approve/revise/revoke with required notes/version/reviewer; owner cannot self-approve. Failed forms retain drafts. | 008,015,021–022,032 |
| RT-16 Announcements/alerts | Send personal and roster-broadcast messages with duplicate names/renames/unassigned ids and author forgery; verify intended Intern feed only. Seed a disposable alert via trusted fixture; dismiss and reload, check cross-roster denial. Do not expect automatic generation unless separately implemented. | 004,006,024–026 |
| RT-17 Totals/periods/eligibility | Sparse attendance across two years, threshold hours, unverified rows, corrections and required-hour changes; docs complete/incomplete/revised. Reconcile canonical period sums, chart totals, risk/completion/clearance/certificate labels and stated forecast assumptions. | 007,012,018,025,027 |
| RT-18 Data volume/freshness | Exceed configured API cap using disposable records. Search/page through all rows, compare authoritative aggregates, navigate/refocus after another user's edits and inspect stale indicators. Measure DB plans/latency and initial bundle only with a defined workload/device. | 026–027,036 |
| RT-19 Outage/auth races | Missing/malformed config, network down, partial read failure, unavailable joins, missing profile, delayed out-of-order responses, expired/refreshing sessions and failed logout revocation. Verify truthful loading/error/retry and no wrong-user profile/dashboard. Confirmation-on/off and duplicate signup must show accurate next steps. Delete a target or change authority while an old edit is open; a zero-row mutation must not toast success or create a fictitious audit. | 026,028,031–032,039 |
| RT-20 Audit and operational honesty | Attempt forged actor/time/events and direct-API changes; require protected real audit on critical commits. Exercise import/template/audit/Instructor/Intern exports and backup. Enabled functions must create actual rows/files/verified snapshot evidence; unavailable functions clearly say so. | 009,023,038 |
| RT-21 Accessibility/mobile CRUD | Keyboard/screen-reader, modal/sheet Escape/backdrop/focus trap/return, labels/icon names/live announcements, contrast, mobile 320px/short-height/zoom/table overflow, More/profile navigation and notifications. Verify action wording/colors against actual save/delete/status/reset behavior. | 029,032–035 |
| RT-22 Build/deployment/migration | Supported Node clean install/build in a future isolated validation workspace; advisory check; production public env configuration; lazy-load failure; non-destructive migration rehearsal and post-migration catalog/row invariant comparison. Verify backup/restore through provider-managed procedures using disposable data. | 013–015,023,031,036–037 |

### Reproducible local probes already performed

Run from the repository using existing Node dependencies; these examples do not contact a database or modify files. They illustrate the narrowest confirmed calculations. Full handler-probe scenarios/results are recorded in section 2 and INS-010; a future test suite should preserve them as controlled tests with explicit transport doubles.

```javascript
// Execute with node; process timezone change affects only this test process.
process.env.TZ = 'Asia/Manila';
const now = new Date('2026-10-07T00:30:00+08:00');
const key = now.toISOString().slice(0, 10);  // actual todayStr algorithm
const time = now.toTimeString().slice(0, 8);
const reconstructed = new Date(`${key}T${time}`);
console.log(key, time, (now - reconstructed) / 3600000);
// Observed: 2026-10-06 00:30:00 24

const fs = require('fs');
const source = fs.readFileSync('src/components/InstructorDashboard.jsx', 'utf8');
const start = source.indexOf('  const computeHours =');
const end = source.indexOf('  const applyExceptionToAttendance =', start);
const compute = new Function(source.slice(start, end) + '; return computeHours;')();
console.log(compute('08:00', '17:00'), compute('22:00', '06:00'));
// Observed: 9 0

for (const input of ['0', '-1', '', 'abc']) {
  console.log(JSON.stringify({ input, saved: Number(input) || 486 }));
}
// Observed saved values: 486, -1, 486, 486.
```

The SDK cardinality check used `createClient('https://audit.invalid', 'audit-public-placeholder', {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch: async () => new Response(JSON.stringify([{id:'one'},{id:'two'}]), {status:200,headers:{'Content-Type':'application/json'}})}})`, then the actual attendance UPDATE/filter/select/maybeSingle chain. Its fake transport returns PGRST116 and null data after a PATCH. This is not evidence that a live server rolled back or committed a particular real update; it establishes that client cardinality checks do not enforce database uniqueness.

## Completion and outstanding verification

Audit artifacts only were created; application source, dependencies and SQL remain unchanged. Build/top-level dependency validation passed; advisory check failed. Source/local probes establish the highest-impact authorization design defects, DTR partial-success path, duplicate-day risk, and Manila date arithmetic defect. Live authorization/Auth/Storage behavior, actual database drift/data anomalies, browser/accessibility behavior, provider backup state and workload performance remain pending. The system must not be described as secure, production-ready or bug-free from this review or the successful build.

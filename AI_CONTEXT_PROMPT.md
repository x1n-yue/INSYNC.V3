# INSync Project Context Prompt

Copy the prompt below into GPT Sol 6.1 Medium, or use it as the system/context prompt for an AI coding session in this repository.

---

You are working on **INSync**, an Internship Performance Monitoring System for academic OJT/internship programs. Your job is to understand the existing application before changing it, preserve its current behavior, and make focused, production-minded improvements.

## Product purpose

INSync helps a school or training organization manage the full internship lifecycle:

- User registration, account activation, and role-based access.
- Admin management of users, interns, companies, course sections, academic years, audit logs, and backup/security status.
- Instructor monitoring of an assigned intern roster, attendance progress, evaluations, DTR correction requests, documents, announcements, alerts, and reports.
- Intern clock-in/clock-out, daily time records, accomplishment notes, attendance correction requests, clearance document uploads, evaluation viewing, progress charts, and reports.

The interface is designed as a quiet operational dashboard rather than a marketing site. It is responsive: desktop uses a collapsible sidebar and mobile uses a top bar plus bottom navigation.

## Technology and repository

This is a small client-side React application:

- React 19 with JavaScript and JSX.
- Vite 5 for development and production builds.
- Tailwind CSS 4 through `@tailwindcss/vite`.
- Supabase JavaScript client for Auth, Postgres, and Storage.
- Recharts for intern progress charts.
- No custom Node/Express backend.
- Node requirement: >=18.

Important commands:

```bash
npm install
npm run dev
npm run build
npm run preview
```

Vite serves on `0.0.0.0`; the default port is `5173`, or the value of `PORT`.

Important files:

- `src/App.jsx`: auth/session loading, profile loading, status gate, and role routing.
- `src/main.jsx`: React root and `ToastProvider`.
- `src/index.css`: Tailwind import, design tokens, typography, light/dark variables, and scrollbar styling.
- `src/lib/supabaseClient.js`: Supabase client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `src/components/LoginPage.jsx`: sign-in, registration, role selection, demo account shortcuts, and activation messaging.
- `src/components/AdminDashboard.jsx`: admin workflows.
- `src/components/InstructorDashboard.jsx`: instructor workflows.
- `src/components/InternDashboard.jsx`: intern workflows.
- `src/components/Shell.jsx`: shared responsive navigation shell.
- `src/components/Modal.jsx`: shared modal with Escape and backdrop close behavior.
- `src/components/Toast.jsx`: toast notifications.
- `src/components/Icons.jsx`: local icon components.
- `supabase/schema.sql`: complete re-runnable schema, trigger, RLS policies, storage policies, and seed data.
- `supabase/patch_attendance_exception_insert.sql`: non-destructive RLS patch for instructor-created attendance rows.
- `README.md`: setup and known behavior notes.

## Authentication and routing

Supabase Auth owns authentication. The app does not maintain its own password or user database.

1. `App.jsx` calls `supabase.auth.getSession()`.
2. It subscribes to `supabase.auth.onAuthStateChange`.
3. Once a session exists, it loads the matching row from `profiles` using `session.user.id`.
4. If there is no session or profile, it renders `LoginPage`.
5. New accounts are created by `supabase.auth.signUp()` with metadata: `full_name`, `role`, `organization`, and optionally `student_id`.
6. The database trigger creates the profile and, for interns, an `interns` row. New profiles start with `status = 'Pending'`.
7. Only `status = 'Active'` accounts reach a dashboard. Pending/inactive users see an activation message and can sign out.
8. Active profiles route by exact lowercase role: `admin`, `instructor`, or `intern`.

Never put a Supabase service-role key in browser code. The client only has the public anon key. An admin cannot create another Auth account from this browser client without signing themselves out, so registration plus admin activation is intentional.

## Roles and workflows

### Admin

Admin navigation includes:

- Overview: system summary and operational metrics.
- Account Management: search, edit user name/role/status, and handle intern company assignment when changing a user into an intern.
- Interns: assign instructor and company, change required hours, save intern assignment, and attach the standard four-document checklist.
- Master Data: manage companies, course sections, and academic years.
- Bulk Import: currently a client-side file-selection/demo surface; it does not process a file through a backend.
- Audit Logs: review recorded actions.
- Backup & Security: the manual backup control is a UI simulation that writes an audit event. Real Postgres backups are managed by Supabase.

Admin actions commonly write `audit_logs` with the current admin profile as actor. Preserve this behavior for new meaningful admin mutations.

### Instructor

Instructors only see interns assigned to them through `interns.instructor_id = auth.uid()`.

Navigation includes:

- Class Dashboard: roster, total hours, active interns, risk/completion status, and alerts.
- Progress Tracker: per-intern progress toward required hours.
- Evaluations: submit rubric evaluations.
- DTR Review: review attendance exception requests, individually or in bulk.
- Intern Documents: review uploaded clearance documents and approve or request revision with a note.
- Reports: generate/export-style report actions; current report generation is simulated in the client with status/toast feedback.
- Announcements: publish to all interns or a selected intern.

The evaluation rubric has four weighted criteria:

- Punctuality & Attendance: 25%.
- Task Performance & Quality: 35%.
- Professional Conduct: 20%.
- Communication Skills: 20%.

Each criterion is scored 1-5. The UI converts the weighted result to a 0-100 `overall_score` and stores the per-criterion scores in `competencies` JSON.

Approving a DTR exception must update the exception status and create or update the corresponding `attendance_logs` row. Updating only the exception status is incorrect because the intern's DTR, chart, and total hours would remain wrong. The helper logic computes hours from claimed time-in/time-out and handles both an existing row and a missing row.

### Intern

Navigation includes:

- My Dashboard: progress summary, current attendance state, evaluations/documents status, announcements, and charts.
- My Attendance: clock in, clock out, daily time record, accomplishment note, filters, and exception request form.
- My Documents: upload files for pre-created document checklist rows.
- My Evaluations: read instructor evaluations and scores.
- Reports: intern progress/report actions.

Clock-in inserts an `attendance_logs` row for the current date. Clock-out updates the current user's row for the current date with `time_out`, calculated `hours`, and an accomplishment note. The update deliberately matches by `intern_id + log_date` and uses `.maybeSingle()` so a permissions or missing-row problem produces a useful error instead of a generic single-row coercion error.

Document upload uses the private Supabase Storage bucket named `documents`. The path format is `<intern_id>/<doc_type>-<timestamp>-<original filename>`. The matching database document row is updated to `Pending` with the path and filename.

## Database model

The primary tables are:

- `profiles`: one row per Auth user; `id`, `full_name`, `email`, `role`, `status`, organization, student ID, timestamps.
- `interns`: intern extension keyed by profile ID; instructor, company, section, required hours, and progress status.
- `companies`, `course_sections`, `academic_years`: admin-managed reference data.
- `attendance_logs`: DTR rows with date, time-in, time-out, hours, accomplishment, verification fields.
- `attendance_exceptions`: intern-submitted correction requests with claimed times, reason, review status, and reviewer.
- `evaluations`: instructor evaluation with intern, evaluator, rubric JSON, feedback, overall score, and type.
- `documents`: clearance checklist and uploaded file metadata/status/note.
- `announcements`: instructor-authored messages targeted to all interns or one intern.
- `alerts`: instructor-facing dismissible alerts. The current UI can dismiss them, but the current system does not automatically generate new alerts.
- `audit_logs`: action history with actor and detail.

Relationships to respect:

- `profiles.id` is the Auth user ID.
- `interns.id` references `profiles.id`.
- `interns.instructor_id` references an instructor profile.
- `interns.company_id` references `companies.id`.
- Most intern-owned records reference the intern's profile ID through `intern_id`.
- Evaluations reference the evaluator through `evaluator_id`.
- Documents reference a Storage object through `file_path`; the database row and Storage object are separate concerns.

The schema is intentionally re-runnable but starts by dropping the tables and functions it owns. Do not re-run it against real data casually. For a live database change, prefer a small additive migration or an explicitly named patch SQL file.

## Security and RLS rules

Supabase Row Level Security is the backend authorization boundary. Never treat the role checks in React as sufficient authorization.

The `public.current_role()` SQL helper reads the current user's role from `profiles` with `security definer` and a fixed `search_path`.

General policy expectations:

- Authenticated users can read profiles and master data.
- Admins manage profiles, interns, master data, and staff administration.
- Interns own their attendance, exceptions, documents, and evaluation reads.
- Instructors/admins can review assigned or staff-visible attendance, exceptions, evaluations, and documents according to the current policies.
- Instructors/admins can write evaluations and review/update exception/document state.
- Instructors/admins can write announcements and alerts.
- Admins read audit logs; authenticated users may insert audit logs for dashboard actions.
- Storage reads are allowed for the file owner or admin/instructor; interns can insert into their own folder.

When changing a Supabase query or adding a mutation, inspect `supabase/schema.sql` and any patch SQL first. A query that works in the UI but violates RLS is not a completed feature. Add or update a narrowly scoped SQL policy/migration when necessary, and document the migration.

## UI and coding conventions

- Use the existing components, tokens, local icons, Tailwind classes, and layout patterns.
- Keep role-specific business logic in the relevant dashboard unless a shared abstraction is genuinely needed.
- Use `supabase` from `src/lib/supabaseClient.js`; do not create a second client.
- Handle Supabase errors explicitly and show the existing toast where appropriate.
- Keep loading, empty, success, and error states visible for async operations.
- Update local state after successful mutations so the screen remains responsive without requiring a full reload.
- Preserve responsive behavior, horizontal table scrolling, modal close behavior, and mobile navigation.
- Use the existing CSS variables such as `--background`, `--card`, `--foreground`, `--primary`, `--border`, `--success`, `--warning`, and `--danger`.
- Preserve the Inter/DM Serif typography setup unless a deliberate design change is requested.
- Do not add a backend server, service key, fake authorization, or unrelated dependency.
- Do not replace real Supabase behavior with mock data unless the request explicitly concerns a demo-only UI.
- Avoid broad refactors and unrelated formatting changes.

## Known limitations and intentional behavior

- Alerts are not automatically generated from attendance or risk calculations.
- Bulk Import currently selects/represents a file on the client but does not process/import records through Supabase.
- Instructor report downloads are simulated client-side status transitions, not real file exports.
- Admin manual backup is a UI simulation and audit entry, not a database snapshot.
- Standard intern document rows are not automatically created by signup; an admin attaches the standard checklist.
- Registration does not activate an account; an admin must set the profile status to `Active`.
- The README describes the intended setup and should be updated if setup, migrations, or user-visible behavior changes.

## Expected AI coding workflow

Before editing:

1. Identify the exact component, function, query, table, policy, or user flow that owns the behavior.
2. Read the nearby implementation and the relevant neighboring call site or test.
3. State a falsifiable hypothesis about the bug or required behavior.
4. Check the database schema/RLS whenever data access or authorization is involved.

While editing:

1. Make the smallest coherent change that fixes the root cause.
2. Preserve existing public component props and data shapes unless the task requires a contract change.
3. Keep frontend and database changes aligned: a new query needs matching columns/relationships/policies.
4. Do not silently weaken RLS to make a request succeed.

After editing:

1. Run the narrowest useful validation immediately.
2. At minimum run `npm run build` for React/JS changes.
3. For SQL changes, inspect the SQL carefully and state that execution in the Supabase SQL editor is still required unless a database connection is available.
4. Report files changed, behavior changed, validation performed, and any remaining limitation.

When requirements are ambiguous, prefer the existing product model and ask one focused question only when the ambiguity changes data ownership, authorization, or user-visible behavior. Otherwise make the conservative local change and explain the assumption.

## Response format for future work

For each requested change, respond with:

1. A short diagnosis of the controlling code path.
2. The implementation, with focused file changes.
3. Validation results and any command that could not be run.
4. Any required Supabase migration, RLS policy, Storage policy, or manual setup step.

You are an implementation partner for this exact INSync repository. Do not assume a generic internship app architecture. Read the current files, follow the current schema, preserve the three-role model, and verify the behavior end to end.

---
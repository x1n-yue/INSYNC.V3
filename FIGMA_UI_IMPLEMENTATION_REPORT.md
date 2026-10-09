# INSync.v3 reference UI implementation

2026-10-09 (Asia/Manila). Adapted presentation from the supplied TSX and CSS files
in `design-reference` into the existing application. The reference files remain
unchanged and are not imported into the application entry point.

## Changes

- Shared typography uses the reference's DM Sans font and tabular numerals.
  Applied its softer page background, slate borders, foreground and sidebar
  selection palette. Kept the primary blue and existing readable status colors.
  Muted text is slightly darker than the reference: `#607087` measures 4.70:1 on
  the new page background and 5.04:1 on white.
- Desktop navigation uses a 240px sidebar, rounded selection surfaces, the
  reference's branding subtitle, and the user's existing name/email/role.
  The existing collapse, profile and mobile bottom-navigation behavior remains.
- Cards across Intern, Instructor and Admin screens share the reference's subtle
  elevation. Tables, forms, headers and existing action buttons have consistent
  presentation. No card shadows were added to individual form controls.
- Intern Dashboard puts the existing weekly chart and next actions side by side
  at wide desktop sizes and stacks them on smaller screens. It retains the
  essential attendance, progress, evaluation summary and assignment information.
- Instructor pending actions and Admin setup actions use wrapping button groups
  with clearer hit areas. Destinations and conditional visibility are unchanged.
- Login, registration, password recovery and existing dialogs use the shared
  typography, border and surface treatment. Dialog focus handling is unchanged.

## Functionality retained

Attendance calculations, Manila/overnight rules, hours, verification, corrections,
year scope, evaluation scoring/submission/retries, documents/versioning/privacy,
announcements, filters, pagination, drafts, authentication and authorization remain.
Dashboard and Attendance still share HoursChart and its grouped logged/verified
bars, accessible values, period options and honest loading/error states.

The supplied mock records, simulated login, extra Supervisor role, chart averaging
and out-of-scope demo audit events were not adopted. Dashboards remain compact;
the reference's detailed evaluation lists and roster were not added to them.

## Verification

| Command | Actual result |
| --- | --- |
| `npm run lint` | Passed, no errors or warnings. |
| `npm run build` | Passed; final production build completed in 5.10s. |
| `npm test -- --maxWorkers=2` | Passed: 24 files, all 2,349 tests, 81.15s. |
| Whitespace check on changed tracked files | Passed. |

Two earlier `npm test` runs at default concurrency did not pass: disposable
database startup and build/startup checks exceeded existing time limits. The
first also overlapped a standalone build. Limiting workers to two passed the
entire suite without changing tests, assertions or timeout settings. Default
concurrency remains an environment verification limitation; no test configuration
change was made for this UI task. Dependencies were already present, so no
`npm install` was needed.

Local headless Edge checks covered 45 role/page/viewport combinations at 320, 768
and 1366px, with no page/workspace horizontal overflow or undersized buttons under
the checked 44px mobile / 36px wider-screen height thresholds. Sign In/Register
were also checked at 320 and 1366px. Inspected desktop/mobile screenshots.

Targeted checks confirmed Monthly chart selection and logged/verified values,
keyboard table scrolling, visible document controls, rubric selection/computed
score, profile Escape/focus restoration and account-search empty results.
Dashboard browser checks used in-memory synthetic transports outside the
repository; provider requests were blocked. No fixture was added to the app.

Compared the changed JSX files against a task-start snapshot: hooks, event
handlers, form value/checked/disabled bindings and disclosure defaults are
identical. Shared business modules, SQL, dependency manifests and the supplied
references are unchanged. Existing UI and workflow regressions are used; no
tests merely checking CSS classes were added.

## Limits and deployment

No live Supabase authentication, database, Storage, email, real-device or
screen-reader verification was performed. This is an adaptation of the provided
presentation into the existing workflows, not replacement with the demo app.
The existing Google Fonts loading approach remains; offline clients use sans-serif
fallbacks. No dependency installation, migration, database operation or deployment
was involved. Existing unrelated working changes were preserved.

Run `npm run dev` and use the URL printed by Vite to view the changes locally.
Refresh an existing development tab; hosted versions require a separate deployment.

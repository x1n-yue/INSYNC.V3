# INSync.v3 project scope

Effective 2026-10-09. This scope supersedes earlier feature plans and release claims.

## Primary

1. **Attendance Tracking:** clock in/out, history, accomplishments, verification,
   corrections and internship hours under the existing Manila and overnight rules.
2. **Intern Supervision:** assigned roster, profile and assignment context,
   attendance/progress and actions requiring instructor attention. My Interns and
   the instructor dashboard provide supervision without a duplicate subsystem.
3. **Performance Evaluation:** existing rubric, scoring, submission, idempotent
   retries and year-associated history. Scores are informational; there is no
   commissioned passing-score rule for clearance.

## Supporting

**Document Passing:** required checklist ? intern submission ? authorized review ?
approval or revision. Preserve versions, review/revoke states, private signed links
and recovery. Individual document access/download supports this workflow.

Clearance remains an existing supporting outcome of verified hours and approved
requirements. Completion and clearance do not issue a certificate.

## Infrastructure

Authentication/status/session restoration, roles, assignment isolation, companies,
sections, academic years, account approval, audit, announcements and existing
notifications remain. Server authorization and RLS remain authoritative.

Existing server-only administration jobs and operator recovery tooling are retained
for operational continuity, with no browser controls or product feature claims.
Provider backups and restoration are operational responsibilities. Historical M16
records, grants and service-only routines remain unchanged.

## Removed from the user-facing application

Reports/pages/cards, report generation, all CSV/Excel exports and planning templates,
DTR/progress/evaluation/weekly/at-risk downloads, audit exports, document ZIP archives,
bulk import, backup UI and Certificate of Completion. No replacement reporting,
import, archive, analytics or issuance feature is planned by this cleanup.

## Preserved boundaries

No new attendance, scoring, risk or clearance policy. No reset, historical rewrite,
backfill, RLS removal or database migration. Year-scoped progress retains historical
attendance/evaluations/documents. Missing current-year evaluation is an informational
supervision action, not an invented deadline or clearance requirement. Requirements
awaiting approval include documents awaiting submission, and are labelled accordingly.

Dashboards show basic information and essential counts. The Intern dashboard
keeps assignment context, today's attendance, hours/progress, latest score and
document actions; announcements are collapsed by default. A compact weekly chart
distinguishes logged and verified hours using Manila days and the assigned year.
Attendance uses the same logged/verified bar chart with detailed period filters;
evaluation history stays in Evaluations. Instructor dashboards show
assigned/active intern totals, risk/correction counts and compact pending-action
links. Detailed roster/progress and per-intern supervision actions belong in
My Interns; full alerts remain in Announcements.

Assignment details are expandable and collapsed by default on the Intern
Dashboard, with any onboarding-incomplete warning visible in the summary; other
tabs keep those details expanded. Shared GUI refinements and verification are
documented in [GUI_POLISHING_REPORT.md](GUI_POLISHING_REPORT.md).
The supplied Figma reference styling is adapted into the existing UI; compact
dashboards, shared hour charts, mobile navigation and all workflow rules remain.
See [FIGMA_UI_IMPLEMENTATION_REPORT.md](FIGMA_UI_IMPLEMENTATION_REPORT.md).

INSync retains its branding, components, responsive shell and accessible dialogs.
The current setup guide is [WEB_SETUP.md](WEB_SETUP.md); local verification and
remaining live checks are in [SCOPE_SIMPLIFICATION_REPORT.md](SCOPE_SIMPLIFICATION_REPORT.md).

# INSync internship monitoring

React 19 / Vite / Tailwind, Supabase Auth, Postgres and Storage. The browser
uses public keys; effective authorization belongs to RLS and controlled RPCs.
INSync.v3 focuses on **Attendance Tracking, Intern Supervision and Performance
Evaluation**, with **Document Passing** as a supporting feature. Authentication,
assignments, academic years, master data, audit and announcements support these
workflows. See [the official scope](PROJECT_SCOPE.md) and
[the scope cleanup report](SCOPE_SIMPLIFICATION_REPORT.md) for changes and verification.
Earlier audit and functionality reports are retained as historical records.
Live provider/browser verification remains a separate release step.
The [GUI polishing report](GUI_POLISHING_REPORT.md) records the latest visual,
responsive and accessibility refinements, local browser checks and their limits.
The [reference UI implementation report](FIGMA_UI_IMPLEMENTATION_REPORT.md)
describes the styling adapted from the supplied Figma code in `design-reference`.

## Local setup

For browser setup, the exact fresh Supabase SQL order, and first-Admin creation,
see [WEB_SETUP.md](WEB_SETUP.md). New empty projects start with the seed-free
[initial_schema.sql](supabase/initial_schema.sql), then the structural M01-M15 migrations (M16 is optional legacy operator
infrastructure); existing projects
must use the inspection/upgrade runbook instead.

Use Node **22.12.0 or later** (supported test lines: 22 and 24), npm and the
committed lockfile. .nvmrc selects Node 22; Windows CI checks 22 and 24.

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Set VITE_SUPABASE_URL to your HTTPS project URL and VITE_SUPABASE_ANON_KEY to
its publishable key (sb_publishable_...) or legacy anon JWT. HTTP is accepted
only for local loopback Supabase. Never use secret/service-role keys in VITE_
settings. All VITE_ values are public build inputs. Missing/malformed settings
render a setup screen without constructing a Supabase client; the guard validates
format, not key authenticity, project connectivity or RLS. Invalid real public
keys, unavailable services and expired sessions still require backend error
handling; see the scope cleanup report for local evidence and remaining live checks.
See [Supabase key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

Development and preview bind to 127.0.0.1 by default. Do not expose a dev server
to an untrusted network; use a reviewed deployment for shared access.

## Database setup and upgrades

**Do not run or re-run supabase/schema.sql against existing data.** It is a
legacy destructive bootstrap for fresh disposable projects only: it drops tables,
contains legacy authorization and hardcoded example seed data, and is not a repair
path. IF EXISTS does not make a reset safe. The old attendance policy patch is
historical, superseded by M01 and must not be used as an upgrade shortcut.
No reset helper is needed or supplied by this remediation.

Read [the runbook](supabase/RUNBOOK.md) and [migration guide](supabase/migrations/README.md).
Inspect the actual catalog and anomalies first; review each repair proposal before
any legacy-data change. Rehearse additive migrations on disposable synthetic data.
An operator must approve and apply reviewed migrations in the specified order,
record hashes, verify the catalog and coordinate client deployment. This session
never applies SQL to a real project. A genuinely new deployment needs an operator-
reviewed initial schema without demo seeds plus the reviewed migrations; the
legacy bootstrap alone is insufficient. `supabase/initial_schema.sql` supplies
that seed-free starting catalog for new empty projects; it still requires the structural M01-M15 migrations
and disposable live checks. No live bootstrap/seed is automated.

Public registration always requests intern and creates intern/Pending. Pending
users can authenticate but have only own status access. Trusted first-Admin
bootstrap uses an Auth-verified UUID and controlled operator SQL described in the
runbook. Effective staff roles require Active Admin approval. Phase 4 adds atomic
account/assignment operations, validated hour targets, server-scored evaluations
and versioned document operations; deploy M06-M08 before this client. M09 is a
separate historical-validation gate, never a legacy-data repair. M10 adds guarded
master-data deletion and atomic current-academic-year selection; deploy it after
M02/M07 and rehearse on disposable data before production.

All three dashboards use the same logged/verified hours, target, risk and clearance
rules. Clearance eligibility requires verified hours meeting the persisted target,
all four standard requirement types and approval of every current requirement.
Invalid or unavailable evidence yields unknown eligibility. Calendar periods use
Asia/Manila; charts show sums and retain the year. No certificate is issued.

Uploads reserve server-generated paths for PDF/JPEG/PNG up to 10 MiB. Replacement
retains committed evidence and review history, resets current review, and checks
the expected upload/review versions. Failed or ambiguous responses are reconciled
before cleanup through the Storage API. Owners can retry unfinished-upload cleanup.
Legacy files remain readable but require resubmission before new approval/clearance.
View/Download prepares a signed link lasting 60 seconds; actual provider delivery
and deletion of file bytes still require disposable live verification. Interns
receive UUID-addressed personal and roster announcements with explicit feed states.

## Focused workflows

- Interns: essential dashboard with assignment, today's attendance, hours/progress,
  latest score, a compact weekly logged/verified hours chart and document status;
  matching bar charts with period filters in attendance/history and
  corrections, required documents, and performance evaluations.
- Instructors: essential dashboard with roster totals and pending-action counts,
  detailed supervision in My Interns with year/section
  filters, attendance verification and corrections, evaluations, documents and announcements.
- Admins: intern/attendance/evaluation/document overview, assignments and checklists,
  account approval, master data and paginated audit history.

There are no Reports, CSV/Excel downloads, document ZIP archives, bulk-import,
backup or Certificate of Completion controls. Individual authorized document
View/Download links remain part of document passing. Clearance is a supporting
outcome under the existing rules; evaluation scores remain informational.

Existing server-only administration jobs and operator recovery scripts remain
for operational continuity and historical evidence. They have no application UI
and are not required by the focused browser workflows. Provider backups, file
recovery and restoration remain the operator's responsibility. No database
structures or historical records were removed.

VITE_DEMO_MODE defaults to false. Demo shortcuts exist only when explicitly true
in development and are removed from production even if set true at build time.
Use only a separate disposable demo project. Operators must rotate any real account
that reused the previously published demo password; this session performs no real
account inventory, login attempts or credential rotation.

## Checks and deployment

```powershell
npm test
npm run lint
npm run build
npm audit --ignore-scripts
```

Tests use synthetic transports, PGlite and fresh loopback-only native Postgres;
no external database URL or real Auth/Storage endpoint is accepted. See tests/README.md
and supabase/tests/PHASE3.md and PHASE4.md for verification and limits. CI is authored here; its
remote execution is not claimed. Build success is compilation, not policy proof.

Set public environment values in the deployment build environment, run npm ci
and npm run build, and serve dist via HTTPS static hosting with an index.html
fallback. Environment changes require a rebuild/redeploy. Deploy the required
reviewed migrations before the corresponding client, refresh older clients, then
perform disposable Auth/PostgREST/Storage/browser checks in the runbook. Do not
serve source, .env files, test databases or credentials. No publication occurs here.

Vite 7.3.7 retains the existing esbuild pipeline, with React plugin 5.2.0,
esbuild 0.28.2 and source-map-js 1.2.2. Vite 7 requires a recent Node minor; see
[Vite 7 migration guidance](https://v7.vite.dev/guide/migration).
Its default browser baseline is Chrome/Edge 107, Firefox 104 and Safari 16;
verify the actual target devices separately. ESLint 9 is retained for the React
plugin's declared compatibility; its unsupported-major notice is a tooling risk,
separate from npm security advisories. Large dashboard chunks remain Phase 6.

## Functionality release checks

Run `npm run verify:release` for tests, lint, build, dependency audit and Git whitespace
checks. Run `node scripts/migration-manifest.mjs` to print reviewed local migration
hashes; this executes no SQL. This cleanup adds no migration. Core browser workflows require the existing
structural migrations through M15. M16 is retained for preexisting server-only
operational jobs; it is not a new requirement of the focused UI. Other projects must inspect their ledger/catalog and apply only
missing prerequisites. No live installation was inferred or modified.

Forgot-password and confirmation resend require the Auth Site URL, exact allowed
callback URLs and email delivery settings described in WEB_SETUP.md. The focused browser app needs only the public settings above. Existing operator
recovery tooling is documented in the historical deployment report; its private
settings must never be browser build inputs. The root error boundary, bounded operations
and account-scoped announcement retry cache are local implementations; live delivery
and real browser/device checks remain separate. See
[operations](supabase/OPERATIONS_RUNBOOK.md) and
[policy decisions](FUNCTIONALITY_PRODUCT_DECISIONS.md).

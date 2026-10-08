# INSync internship monitoring

React 19 / Vite / Tailwind, Supabase Auth, Postgres and Storage. The browser
uses public keys; effective authorization belongs to RLS and controlled RPCs.
The latest workflow changes require M11/M12, the M13 verification fix, and the
M14 final-Admin guard. See the current [system functionality audit](SYSTEM_FUNCTIONALITY_AUDIT.md)
for confirmed fixes and remaining priorities, and
[WORKFLOW_CHANGE_REPORT.md](WORKFLOW_CHANGE_REPORT.md) for changes and rollout.
Remediation is in progress: see FIX_PROGRESS.md for all 39 findings and limits.
The system is not described as secure or production-ready.

## Local setup

For browser setup, the exact fresh Supabase SQL order, and first-Admin creation,
see [WEB_SETUP.md](WEB_SETUP.md). New empty projects start with the seed-free
[initial_schema.sql](supabase/initial_schema.sql), then M01-M14; existing projects
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
handling; remaining authentication/reliability work is tracked in Phase 5.
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
that seed-free starting catalog for new empty projects; it still requires M01-M14
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

## Downloads and unavailable features

Admin can download blank student/instructor planning templates as CSV or XLSX,
and an audit CSV. Intern can export all their own DTR records as informational CSV,
independent of screen period filters. Exports fetch fresh RLS-scoped pages, check
counts and identities and stop on detected changes/errors. Limit: 50,000 records;
these reads are not a transactional snapshot. Legacy audit events are labeled
unverified. DTR separates raw stored, valid logged and verified hours; legacy or
invalid evidence remains unknown, with no invented totals or certification.
CSV cells are escaped against spreadsheet formulas. Download dispatch does not
prove a file was saved. XLSX writer loads only when requested. The application
does not issue or expose a Certificate of Completion feature.

Bulk import (including file selection/drag-drop) remains disabled: templates only
help plan records and do not provision accounts. Instructor reports and intern PDF/Excel summaries/archives remain unavailable.
There is no Certificate of Completion feature; completion/clearance status remains
available without implying certificate issuance. Manual backups remain unavailable. Uptime monitoring is not connected. Verify real backup availability,
retention and restoration in the provider console; this UI cannot claim a backup.

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

# Local remediation tests

Run `npm test` (one run), `npm run test:watch` (local watcher) and `npm run lint`.
Node >=22.12.0 is required; .nvmrc/CI check 22 and 24 (Phase 3 alignment).
Vitest uses its own config and Node environment. Tests replace global fetch with
a throwing stub; the SDK probe supplies its own in-memory response, never a remote
endpoint. Tests do not read .env files. Phase 3 imports the guarded app client
with empty synthetic environment to assert setup-screen rendering without SDK
construction or network (unrelated dashboards mocked). Production demo checks
build in a separate process with env-file loading disabled. See
supabase/tests/PHASE3.md.

`session-restoration.test.jsx` renders App in React Strict Mode with jsdom and
synthetic Auth/RPC responses. It checks early auth events, signed-out startup,
stale session responses, a working Retry action and a 15-second restoration
timeout. It does not contact Supabase or validate a real browser session.

Workflow improvements add `assignment-dashboards.test.jsx` and
`instructor-sections.test.jsx` for actual dashboard rendering with synthetic
transport, saved section/year persistence, company names, onboarding, section
filters, normal verification, announcement busy/retry behavior and stalled-read
recovery. `workflow-improvements.test.js` checks year-scoped metrics and request
timeouts/cancellation. `workflow-improvements-postgres.test.js` applies M01-M12
to its own native disposable Postgres and checks authorization, expected evidence,
idempotent verification, immutable year history, per-year checklists, correction
year retention, announcement audiences and submission keys. No live project is used.

`audit-baseline.test.js` records remaining audit probes as **characterization
tests of known defects**, not proof of correctness. After Phase 4 it has 3 cases:
correct Manila date behavior, SDK maybeSingle cardinality and remaining low
contrast characterization. Required-hours, zero-row handler and chart probes now
assert desired shared-module/transport behavior in Phase 4 suites; overnight/seconds
calculation moved to actual Postgres RPC tests. Source extraction binds probes to
actual handlers/calculations while Phase 0 forbids application behavior changes.
When a finding is fixed, replace that probe with shared-module or transport tests
asserting the desired result; do not preserve buggy behavior just to keep it green.

| Probe | Finding | Replacement acceptance |
|---|---|---|
| UTC/local reconstruction | INS-012 | Manila date boundaries, actual elapsed instants, overnight lookup |
| computeHours overnight/seconds | INS-016 | Positive valid overnight duration; invalid claims rejected |
| required-hours coercion | INS-018 | Explicit finite range/precision validation, persisted value |
| Zero-row assignment handler | INS-039 | Conflict/error, draft retained, no local success/audit |
| SDK maybeSingle cardinality | INS-011 | Keep SDK limitation check; add DB uniqueness/concurrency suite |
| Month/year chart aggregation | INS-025 | Calendar periods and year-aware sums from shared derivation |
| Token contrast | INS-034 | All supported status/action foreground-background pairs >=4.5 |

`m01-authority.test.js` applies the actual M01 migration to in-memory PGlite using
`../supabase/tests/baseline.sql`, never bootstrap. It tests real PostgreSQL RLS,
grants, triggers and controlled operations against synthetic Auth/Storage tables.
The matrix alone has 1,716 cases; protected-field, RPC and catalog cases supplement
it. `authority-client.test.js` checks returned-record cardinality, target identity,
transport failures and committed bulk outcomes. Remote application HTTP is denied.

Fixture and live test contracts: `../supabase/tests/FIXTURES.md` and `M01.md`.
Local Postgres policy tests are implemented/executed. Supabase services/HTTP, signed
URL delivery, JWT validation, Supabase two-client races, browser and accessibility remain
unverified. Build is compilation evidence only; local policy tests do not establish
that deployed grants, functions or bucket privacy match this repository.

Phase 2 adds `attendance.test.js` (Manila dates/clock formatting/elapsed helpers),
`phase2-migration-gates.test.js` (fresh PGlite legacy-preservation/validation gates)
and `phase2-postgres.test.js` (actual native Postgres 17.10, synthetic fixture,
M01-M05, audit/interval/clock/bulk/fault/race cases). Native races deliberately
observe both separate connections waiting before releasing an advisory lock.
Concurrent status/assignment changes are rechecked after lock acquisition.

`disposable-postgres.js` accepts no external connection URL or environment
credentials. It starts its own loopback-only process at a random port, under an
ordinary OS user, never creates an OS account/service, uses an ephemeral synthetic
password and removes only the checked `.test-postgres/synthetic-*` directory after
closing clients/stopping the server. Platform optional binaries/scripts must be
installed; do not disable a failing native suite or count it as passed. No existing
database/bootstrap is used. Local loopback TCP is the only DB network transport.
See `../supabase/tests/PHASE2.md` for exact coverage and pending live checks.

Phase 4 adds `phase4-business.test.js`, `phase4-client.test.js`,
`phase4-migration-gates.test.js` and `phase4-postgres.test.js`: shared target/rubric/
calendar/verified-clearance logic, actual failed assignment handler, upload/link/
feed transports, legacy-preserving M06-M09 gates and native final-stage grants,
RLS, atomic lifecycle, immutable versions, audit faults and seven observed races.
Read `../supabase/tests/PHASE4.md` for scope, pending real API/browser cases and
Storage metadata/physical-byte limitations. No test executes a real project.

# Phase 3 verification: tooling and operational honesty

No SQL, credentials, real Auth or Storage operations are used by these checks.
Phases 1/2 policy, fault and concurrency suites still run on synthetic databases.

## Automated checks

Run `npm ci`, `npm run lint`, `npm test`, `npm run build`, `npm ls --all` and
`npm audit --ignore-scripts` on supported Node 22.12+ / 24. The Windows CI matrix
is authored in `.github/workflows/verify.yml`; remote CI execution is not claimed.
Current actual outcomes are in `FIX_PROGRESS.md`.

- `phase3-config.test.js`: missing/empty/malformed settings, remote HTTP,
  placeholder URLs, secret/service-role/authenticated-role keys rejected without
  constructing SDK; public publishable/anon formats and loopback accepted;
  constructor exception redacted. Actual App imports and server-renders its
  setup screen with no client or network (unrelated dashboards mocked).
  Format validation is not authentication.
- `phase3-exports.test.js`: actual CSV bytes and XLSX ZIP/XML contents, blank typed
  headers, no account/password rows, literal formula escaping, newline/quote handling;
  fresh owner-scoped keyset traversal through short API pages, exact/final counts,
  identity/order checks, count limits, missing/error/changing data aborts; role/status
  recheck; audit provenance; Manila overnight DTR logged/verified/open/unknown;
  real Blob download dispatch and URL cleanup, including DOM failure.
- `phase3-production.test.js`: a separate production process builds with demo flag
  true and scans emitted chunks for known demo password/account literals. Test
  environment NODE_ENV=test cannot substitute for a production build. Build writes
  no files and disables env-file loading. Also checks default loopback hosts/script.
- RT-22 document review: bootstrap SQL body remains unchanged; only destructive
  warning comments change. README/migrations guide prohibit existing-data reset
  and legacy policy patch. No reset script is needed. Runbook still requires
  independent catalog inspection, review, rehearsal, migration ledger and rollback.

## Disposable browser / Supabase verification (not executed here)

1. Build with missing public settings, open the app: readable setup screen, no
   import crash or Supabase request. Supply invalid/private synthetic values and
   confirm no supplied value appears in UI/logs. Rebuild after valid public setup.
   Test offline/backend errors separately; complete auth recovery is Phase 5.
2. Development without demo flag shows no shortcuts. With explicit true in a
   separate disposable project, shortcuts fill fields only. Production with
   flag true still shows no shortcuts or embedded known demo values. Operators
   must inventory/rotate any real password reuse outside this synthetic exercise.
3. Admin: import has a disabled button and unavailable text; drag/drop or click
   does not select/upload a file or create an audit event. Both planning templates
   download as real CSV/XLSX; open in Excel/LibreOffice and inspect headers/encoding,
   zero account rows and no formula. Templates do not claim to provision accounts.
4. Admin audit: seed >1,000 synthetic events including legacy, trigger events and
   formula-like actor/detail strings. Export includes every authorized row through
   its initial upper UUID, independent of the latest-50 screen. Check provenance
   and literal cells; inject HTTP failure halfway: no file or success toast. Change
   counts/status during export: detected conflict aborts. With >50,000 rows, clear
   bounded-export error, no partial file.
5. Intern DTR: >1,000 own synthetic rows plus foreign rows, overnight, fractional
   seconds, open and legacy-invalid evidence. Export includes all own rows across
   screen filters; foreign rows excluded by RLS. Sort by start date/ID; verify raw
   stored hours distinct from trusted logged and verified hours; unknown/open are
   blank, not false zero/certification. CSV is informational, not an official DTR.
6. Instructor reports and intern PDF/Excel summaries/archives/certificate controls
   remain disabled and visibly unavailable. No timers/success toasts pretend to
   produce files. Certificate eligibility is not inferred from hours. Monitoring
   and backup show not-connected/unavailable; no invented uptime/backup history.
7. Enabled buttons disable while reading and recover on failure. Browser download
   dispatch is reported as requested, never proof of saving. Download policy,
   cancellation, file association and mobile behavior need actual browsers.
   Keyboard, contrast and screen-reader verification stay Phase 6.

## Limits and residual risks

Exact counts + immutable UUID traversal detect truncation and many concurrent
changes, but do not provide a database snapshot: equal-count edits/deletions with
replacement can still yield mixed-time evidence. Later server aggregates and detail
pagination remain INS-027. No official certification, bulk provisioning or backup
implementation is claimed. Large dashboard chunks remain INS-036. ESLint 9's
unsupported-major warning remains while the React plugin lacks declared ESLint 10
compatibility. An advisory-free dependency snapshot is time-specific, not a proof
of application security. Live SQL/Auth/API/Storage/browser/a11y remain unverified.

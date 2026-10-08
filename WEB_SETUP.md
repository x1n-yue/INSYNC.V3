# Run INSync in a browser

The app uses React/Vite for the website and Supabase for Auth, Postgres and Storage.

## 1. Set up the database

### New, empty Supabase project

Use a separate empty project. Do not create accounts or allow app signups until
the database setup is complete. Review the SQL before running it.

In the Supabase dashboard, open **SQL Editor**, create a query, paste the entire
contents of each file below, and run it as **postgres**. Run one file at a time,
in this exact order; proceed only after it succeeds:

1. [initial_schema.sql](supabase/initial_schema.sql)
2. [M01_authority.sql](supabase/migrations/M01_authority.sql)
3. [M02_trusted_audit.sql](supabase/migrations/M02_trusted_audit.sql)
4. [M03_attendance_integrity.sql](supabase/migrations/M03_attendance_integrity.sql)
5. [M04_private_documents_bucket.sql](supabase/migrations/M04_private_documents_bucket.sql)
6. [M05_validate_attendance.sql](supabase/migrations/M05_validate_attendance.sql)
7. [M06_rubric_hours.sql](supabase/migrations/M06_rubric_hours.sql)
8. [M07_account_lifecycle.sql](supabase/migrations/M07_account_lifecycle.sql)
9. [M08_document_versions.sql](supabase/migrations/M08_document_versions.sql)
10. [M09_validate_domain.sql](supabase/migrations/M09_validate_domain.sql)
11. [M10_master_data_lifecycle.sql](supabase/migrations/M10_master_data_lifecycle.sql)
12. [M11_attendance_year_workflows.sql](supabase/migrations/M11_attendance_year_workflows.sql)
13. [M12_section_announcements.sql](supabase/migrations/M12_section_announcements.sql)

The initial file creates the 12 baseline tables and a private documents bucket.
It contains no demo records, accounts or reset statements. It refuses existing
INSync tables, Auth accounts or a documents bucket. The migrations install the
permissions, functions and additional tables required by the current app.
M05 and M09 can validate empty tables here; their historical-data gates still
apply to existing projects. Keep an operator record of the files applied.

M11 adds academic-year assignments and record snapshots plus normal attendance
verification. M12 installs section announcements and retry protection. Apply both
before deploying this client. Existing projects must keep old record years NULL;
assign current internship years explicitly rather than inferring historical years.
See [the workflow change report](WORKFLOW_CHANGE_REPORT.md) for rollout and checks.

If a file fails, stop and inspect the error. Run `ROLLBACK;` if the editor session
is still in an aborted transaction. Do not rerun successful migrations, delete
tables, or remove preflight checks to get past an error.

**Do not use `supabase/schema.sql` or `patch_attendance_exception_insert.sql`.**
The former is a destructive legacy reset and the latter is superseded.
Do not paste `supabase/tests/baseline.sql`: it contains synthetic Auth/Storage
test doubles and is not a Supabase deployment file.

### Project already containing tables or accounts

Do not run the initial schema or reset. Follow [RUNBOOK.md](supabase/RUNBOOK.md)
and [the migration guide](supabase/migrations/README.md) to inspect the existing
catalog/data and determine which migrations are missing. This is a separate
upgrade procedure; the fresh-project list must not be replayed on existing data.

## 2. Connect the website to Supabase

Get the **Project URL** and **publishable key** from the project's Connect panel
or API settings. A legacy **anon** key also works. Never put a secret or
service-role key in the website.

Edit the existing `.env` in the project root. If it is missing, copy `.env.example`
to `.env` first. Set these exact variable names:

```dotenv
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_YOUR_PUBLIC_KEY
VITE_DEMO_MODE=false
```

The app deliberately uses `VITE_SUPABASE_ANON_KEY` for either supported public
key format. Do not rename it to a variable from a generic tutorial.

## 3. Start the website locally

Install Node.js **22.12.0 or later** (Node 22/24 are the documented test lines).
Open PowerShell and run:

```powershell
cd "C:\Users\Cris bryan\Downloads\INSync_Supabase_Converted (4)"
npm ci
npm run dev
```

Keep the terminal open and visit **http://127.0.0.1:5173**. If Vite selects another
port because 5173 is occupied, use the address printed in the terminal. Restart
the dev server after changing `.env`. Stop it with Ctrl+C.

In Supabase **Authentication > URL Configuration**, set the local Site URL to
`http://127.0.0.1:5173` and allow that URL for redirects. Use the actual port if
different. Keep email confirmation enabled and confirm your signup email before
logging in. Configure the hosted URL instead when deploying online.

## 4. Create the first administrator

After all SQL files succeed, register your own account through the app and
confirm its email. New accounts are intentionally **intern / Pending**.

In Supabase **Authentication > Users**, find your account and verify/copy its
exact UUID. As the project owner, with no existing authorized Active Admin,
run the following in SQL Editor as postgres. Replace `YOUR-VERIFIED-AUTH-UUID`
with that UUID. Record your operator approval privately.

```sql
begin;
do $$
declare
  operator_id uuid := 'YOUR-VERIFIED-AUTH-UUID';
  changed integer;
begin
  if current_user <> 'postgres' then
    raise exception 'Trusted postgres operator required';
  end if;
  if exists(select 1 from public.profiles where role='admin' and status='Active') then
    raise exception 'An Active Admin already exists; use the normal approval flow';
  end if;
  if not exists(select 1 from auth.users where id=operator_id and email_confirmed_at is not null) then
    raise exception 'Verify the intended Auth account and confirm its email first';
  end if;
  update public.profiles set role='admin', status='Active'
    where id=operator_id and role='intern' and status='Pending';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'Expected exactly one Pending intern; no promotion committed';
  end if;
end $$;
commit;
```

Log out and sign in again. Use the Admin dashboard to approve subsequent
accounts, set roles and assignments, and add your actual companies, sections
and academic year. No demo login credentials or organization data are installed.

## 5. Put the website online

On a static hosting service, select the Vite framework and configure:

| Setting | Value |
|---|---|
| Build command | `npm ci && npm run build` |
| Output directory | `dist` |
| Node version | Supported Node 22/24, at least 22.12.0 |
| Environment variables | The same three `VITE_` values above |

Serve over HTTPS and configure an `index.html` fallback for app routes. Update
Supabase Auth Site URL and allowed redirect URLs to the hosted website address.
Environment changes require a new build/deployment. Supabase hosts the backend;
the `dist` website needs its own static host. `npm run preview` only previews a
build locally and is not a production hosting service.

## Verification and limits

The new initial schema was tested with all nine actual migration files using
local PGlite and synthetic provider tables. Tests cover empty initial data,
closed initial API access, blocked early signup, Pending intern signup after
migrations, and refusal/preservation of existing tables, accounts and buckets.
This does not verify a live Supabase project, Auth email delivery, PostgREST or
Storage file delivery. Follow the disposable-project checks in the runbook
before relying on the deployment. No SQL was applied to a remote project.

Provider references: [Supabase React setup](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs),
[Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
[Vite static deployment](https://vite.dev/guide/static-deploy.html).

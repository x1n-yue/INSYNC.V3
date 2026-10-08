-- =========================================================================
-- INSync — Internship Performance Monitoring System
-- Supabase (Postgres) schema, RLS policies, storage, and starter seed data
-- DESTRUCTIVE LEGACY BOOTSTRAP: FRESH DISPOSABLE PROJECTS ONLY.
-- Drops domain tables and their data. NEVER run/re-run against existing data.
-- This is NOT an upgrade/repair path and is NOT an automatically tracked CLI
-- migration. Existing projects: inspection/ -> RUNBOOK.md -> migrations/.
-- Legacy defaults/policies/seeds require reviewed versioned migrations before
-- client use. This remediation does not execute this file anywhere.
-- Requires the pgcrypto extension for gen_random_uuid().
--
-- Roles in this version: admin, instructor, intern (no supervisor role —
-- instructors handle class tracking, rubric evaluations, DTR/document
-- review, and announcements).
-- =========================================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- DESTRUCTIVE RESET of domain tables, including existing rows and dependencies.
-- IF EXISTS only suppresses missing-object errors; it does not preserve data.
-- Never use this block to recover a partial upgrade or repair a project.
-- -------------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.current_role();

drop table if exists public.announcements cascade;
drop table if exists public.documents cascade;
drop table if exists public.attendance_exceptions cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.alerts cascade;
drop table if exists public.evaluations cascade;
drop table if exists public.attendance_logs cascade;
drop table if exists public.interns cascade;
drop table if exists public.profiles cascade;
drop table if exists public.academic_years cascade;
drop table if exists public.course_sections cascade;
drop table if exists public.companies cascade;

-- -------------------------------------------------------------------------
-- Reference / master data
-- -------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.course_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  is_current boolean not null default false
);

-- -------------------------------------------------------------------------
-- Profiles — one row per auth.users row, holds role + shared fields
-- -------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null check (role in ('admin', 'instructor', 'intern')),
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Pending')),
  organization text,
  student_id text,
  created_at timestamptz not null default now()
);

-- Intern-specific extension of profiles
create table public.interns (
  id uuid primary key references public.profiles (id) on delete cascade,
  instructor_id uuid references public.profiles (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  section_id uuid references public.course_sections (id) on delete set null,
  required_hours numeric not null default 486,
  status text not null default 'On Track'
);

-- -------------------------------------------------------------------------
-- Attendance (Daily Time Record)
-- -------------------------------------------------------------------------

create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  intern_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null default current_date,
  time_in time,
  time_out time,
  hours numeric,
  accomplishment text,
  verified boolean not null default false,
  verified_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- DTR correction requests ("Time Log Exception Request" in the intern UI,
-- "DTR Exception Queue" in the instructor UI)
create table public.attendance_exceptions (
  id uuid primary key default gen_random_uuid(),
  intern_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  claimed_time_in time,
  claimed_time_out time,
  reason text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  reviewed_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- Evaluations — rubric-scored 0-100, given by an instructor
-- -------------------------------------------------------------------------

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  intern_id uuid not null references public.profiles (id) on delete cascade,
  evaluator_id uuid references public.profiles (id),
  type text not null default 'Evaluation',
  competencies jsonb not null default '{}'::jsonb, -- e.g. {"punctuality":4,"performance":5,"conduct":4,"communication":4}
  feedback text,
  overall_score numeric check (overall_score >= 0 and overall_score <= 100),
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- Documents — pre-internship clearance forms (MOA, endorsement, consent,
-- medical cert, etc.) with instructor review workflow
-- -------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  intern_id uuid not null references public.profiles (id) on delete cascade,
  doc_type text not null, -- 'moa' | 'endorsement' | 'consent' | 'medical' | custom
  name text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Needs Revision')),
  file_path text, -- path inside the "documents" storage bucket
  file_name text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- Announcements (instructor → interns)
-- -------------------------------------------------------------------------

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid references public.profiles (id),
  title text not null,
  body text not null,
  target text not null default 'All Interns', -- 'All Interns' or an intern's full_name
  target_intern_id uuid references public.profiles (id), -- set when targeting a single intern
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- Alerts (instructor-facing)
-- -------------------------------------------------------------------------

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  intern_id uuid references public.profiles (id) on delete cascade,
  type text not null,
  detail text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  dismissed boolean not null default false,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- Audit logs (admin-facing)
-- -------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  actor_name text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Auto-create a profile (and intern row) whenever a new auth user signs up.
-- Expects role / full_name / organization / student_id in the signup
-- call's `options.data` (user_metadata).
-- =========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, organization, student_id, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'role', 'intern'),
    new.raw_user_meta_data ->> 'organization',
    new.raw_user_meta_data ->> 'student_id',
    'Pending'
  );

  if coalesce(new.raw_user_meta_data ->> 'role', 'intern') = 'intern' then
    insert into public.interns (id) values (new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================================
-- Row Level Security
-- =========================================================================

alter table public.profiles enable row level security;
alter table public.interns enable row level security;
alter table public.companies enable row level security;
alter table public.course_sections enable row level security;
alter table public.academic_years enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.attendance_exceptions enable row level security;
alter table public.evaluations enable row level security;
alter table public.documents enable row level security;
alter table public.announcements enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_logs enable row level security;

-- Helper: current user's role
create or replace function public.current_role()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Profiles: everyone signed in can read profiles (needed for names/rosters).
-- Admins can write any profile; users can update their own basic info.
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "admins manage all profiles"
  on public.profiles for all
  to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Master data: readable by all signed-in users, writable by admins only.
create policy "master data readable" on public.companies for select to authenticated using (true);
create policy "master data writable by admin" on public.companies for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy "sections readable" on public.course_sections for select to authenticated using (true);
create policy "sections writable by admin" on public.course_sections for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy "years readable" on public.academic_years for select to authenticated using (true);
create policy "years writable by admin" on public.academic_years for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- Interns: readable by all authenticated (dashboards join across roles);
-- writable by admins, and by the assigned instructor.
create policy "interns readable" on public.interns for select to authenticated using (true);
create policy "interns writable by admin" on public.interns for all to authenticated
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "interns updatable by assigned instructor" on public.interns for update to authenticated
  using (instructor_id = auth.uid()) with check (instructor_id = auth.uid());

-- Attendance: intern can insert/read/update their own logs; instructor/admin
-- read and verify logs for interns. Explicit WITH CHECK on every policy —
-- Postgres reuses USING for WITH CHECK by default on UPDATE, but being
-- explicit here avoids any ambiguity that caused 406s in earlier testing.
create policy "attendance readable by involved users" on public.attendance_logs for select to authenticated
  using (
    intern_id = auth.uid()
    or public.current_role() in ('admin', 'instructor')
  );
create policy "attendance insert by intern or staff" on public.attendance_logs for insert to authenticated
  with check (intern_id = auth.uid() or public.current_role() in ('admin', 'instructor'));
create policy "attendance update by intern or staff" on public.attendance_logs for update to authenticated
  using (intern_id = auth.uid() or public.current_role() in ('admin', 'instructor'))
  with check (intern_id = auth.uid() or public.current_role() in ('admin', 'instructor'));

-- Attendance exceptions: intern submits/reads own; instructor/admin review.
create policy "exceptions readable" on public.attendance_exceptions for select to authenticated
  using (intern_id = auth.uid() or public.current_role() in ('admin', 'instructor'));
create policy "exceptions insert by intern" on public.attendance_exceptions for insert to authenticated
  with check (intern_id = auth.uid() or public.current_role() = 'admin');
create policy "exceptions update by staff" on public.attendance_exceptions for update to authenticated
  using (public.current_role() in ('admin', 'instructor'))
  with check (public.current_role() in ('admin', 'instructor'));

-- Evaluations: intern reads own; instructor/admin read & write.
create policy "evaluations readable" on public.evaluations for select to authenticated
  using (intern_id = auth.uid() or public.current_role() in ('admin', 'instructor'));
create policy "evaluations writable by staff" on public.evaluations for insert to authenticated
  with check (public.current_role() in ('admin', 'instructor'));
create policy "evaluations updatable by staff" on public.evaluations for update to authenticated
  using (public.current_role() in ('admin', 'instructor'));

-- Documents: intern reads/uploads own; instructor/admin review (update status/note).
create policy "documents readable" on public.documents for select to authenticated
  using (intern_id = auth.uid() or public.current_role() in ('admin', 'instructor'));
create policy "documents insert by intern or staff" on public.documents for insert to authenticated
  with check (intern_id = auth.uid() or public.current_role() in ('admin', 'instructor'));
create policy "documents update by owner or staff" on public.documents for update to authenticated
  using (intern_id = auth.uid() or public.current_role() in ('admin', 'instructor'))
  with check (intern_id = auth.uid() or public.current_role() in ('admin', 'instructor'));

-- Announcements: instructors/admins write; readable by everyone signed in
-- (an intern only sees ones aimed at "All Interns" or at them personally —
-- enforced in the app query, since RLS can't easily compare against the
-- viewer's own name).
create policy "announcements readable" on public.announcements for select to authenticated using (true);
create policy "announcements writable by staff" on public.announcements for insert to authenticated
  with check (public.current_role() in ('admin', 'instructor'));

-- Alerts: instructors/admins manage; readable by staff.
create policy "alerts readable by staff" on public.alerts for select to authenticated
  using (public.current_role() in ('admin', 'instructor'));
create policy "alerts writable by staff" on public.alerts for all to authenticated
  using (public.current_role() in ('admin', 'instructor'))
  with check (public.current_role() in ('admin', 'instructor'));

-- Audit logs: admin-only read; any authenticated user can write (so any
-- dashboard action can log itself).
create policy "audit logs readable by admin" on public.audit_logs for select to authenticated
  using (public.current_role() = 'admin');
create policy "audit logs insertable by authenticated" on public.audit_logs for insert to authenticated
  with check (true);

-- =========================================================================
-- Storage — a "documents" bucket for clearance-form uploads (MOA,
-- endorsement letter, consent form, medical certificate, etc.)
-- Files are stored under a path of "<intern_id>/<doc_type>-<filename>" so
-- policies can check the folder name against the signed-in user.
-- =========================================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents bucket read" on storage.objects;
drop policy if exists "documents bucket insert" on storage.objects;
drop policy if exists "documents bucket update" on storage.objects;

create policy "documents bucket read" on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_role() in ('admin', 'instructor')
    )
  );

create policy "documents bucket insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents bucket update" on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_role() in ('admin', 'instructor')
    )
  );

-- =========================================================================
-- Seed data (optional) — mirrors the original demo/mock data so the app
-- has something to show immediately.
-- =========================================================================

insert into public.companies (name) values
  ('TechCorp Manila'), ('DataSoft Solutions'), ('Innovatek PH'),
  ('CloudBase Inc.'), ('NextGen Systems'), ('BrainBytes Tech');

insert into public.course_sections (name) values
  ('BSIT 4A — OJT 2025'), ('BSIT 4B — OJT 2025'),
  ('BSCS 4A — OJT 2025'), ('BSCS 4B — OJT 2025');

insert into public.academic_years (label, is_current) values
  ('A.Y. 2024–2025', true), ('A.Y. 2023–2024', false), ('A.Y. 2022–2023', false);

-- NOTE: auth.users rows can only be created through Supabase Auth
-- (supabase.auth.signUp, the dashboard, or the Admin API) — not plain SQL
-- inserts. After creating your demo accounts (see README), update their
-- role/status directly, e.g.:
--
--   update public.profiles set role = 'admin', status = 'Active'
--     where email = 'admin@insync.ph';
--
-- To assign an intern to an instructor after both accounts exist, and give
-- them their four standard clearance documents:
--
--   update public.interns set
--     instructor_id = (select id from public.profiles where email = 'instructor@bsu.edu.ph'),
--     company_id = (select id from public.companies where name = 'TechCorp Manila'),
--     required_hours = 486
--   where id = (select id from public.profiles where email = 'andrea@intern.ph');
--
--   insert into public.documents (intern_id, doc_type, name) values
--     ((select id from public.profiles where email = 'andrea@intern.ph'), 'moa', 'Memorandum of Agreement (MOA)'),
--     ((select id from public.profiles where email = 'andrea@intern.ph'), 'endorsement', 'Endorsement Letter'),
--     ((select id from public.profiles where email = 'andrea@intern.ph'), 'consent', 'Parent / Guardian Consent Form'),
--     ((select id from public.profiles where email = 'andrea@intern.ph'), 'medical', 'Medical Certificate');

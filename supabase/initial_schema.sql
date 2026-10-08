-- INSync initial catalog: NEW, EMPTY SUPABASE PROJECTS ONLY.
-- Review this file, then paste into Supabase SQL Editor as postgres, once.
-- Next apply migrations/M01 through M09 individually in numeric order.
-- No reset, demo seeds, Auth users or credentials. Existing INSync tables,
-- Auth accounts, signup trigger or documents bucket cause an abort.
-- This is only the baseline for the migrations, not a standalone deployment.
-- API table access is denied and signup blocked until M01 installs authority.
-- Do not allow signups/use the application until ALL migrations are complete.
-- Uses built-in gen_random_uuid() on supported Supabase Postgres versions.
begin;
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Initial setup requires the trusted postgres SQL operator';
  end if;
  if exists(select 1 from auth.users) then
    raise exception 'Auth accounts already exist; inspect the project instead of initial setup';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any(array['companies','course_sections',
      'academic_years','profiles','interns','attendance_logs','attendance_exceptions',
      'evaluations','documents','announcements','alerts','audit_logs'])) then
    raise exception 'INSync tables already exist; initial setup must never be replayed';
  end if;
  if exists(select 1 from storage.buckets where id='documents') then
    raise exception 'Documents bucket already exists; inspect before initial setup';
  end if;
end $$;

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
  status text not null default 'Pending' check (status in ('Active', 'Inactive', 'Pending')),
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

-- M01 replaces these deliberately closed placeholder helpers.
create function public.current_role() returns text
language sql stable security definer set search_path=pg_catalog,public
as $$ select null::text $$;
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  raise exception 'INSync setup incomplete: apply M01-M09 before creating accounts';
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
revoke all on function public.current_role(),public.handle_new_user()
from public,anon,authenticated;

-- Deny API table access throughout the baseline installation.
do $$ declare t text; begin
  foreach t in array array['companies','course_sections','academic_years','profiles',
    'interns','attendance_logs','attendance_exceptions','evaluations','documents',
    'announcements','alerts','audit_logs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
  end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('documents','documents',false,10485760,
  array['application/pdf','image/jpeg','image/png']);
commit;

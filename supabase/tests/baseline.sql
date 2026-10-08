-- Synthetic local PGlite/native Postgres fixture ONLY. Not a deployment/reset.
-- No bootstrap is read or executed. Auth/Storage schemas below are test doubles.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth,storage to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
create table storage.buckets(id text primary key,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
insert into storage.buckets(id,public) values('documents',false),('other',false);

create table public.companies(id uuid primary key default gen_random_uuid(),name text not null unique);
create table public.course_sections(id uuid primary key default gen_random_uuid(),name text not null unique);
create table public.academic_years(id uuid primary key default gen_random_uuid(),label text not null unique,is_current boolean not null default false);
create table public.profiles(
 id uuid primary key references auth.users(id),full_name text not null,email text not null,
 role text not null check(role in ('admin','instructor','intern')),
 status text not null check(status in ('Active','Pending','Inactive')),
 organization text,student_id text,created_at timestamptz not null default now());
create table public.interns(
 id uuid primary key references public.profiles(id),instructor_id uuid references public.profiles(id),
 company_id uuid references public.companies(id),section_id uuid references public.course_sections(id),
 required_hours numeric not null default 486,status text not null default 'On Track');
create table public.attendance_logs(
 id uuid primary key default gen_random_uuid(),intern_id uuid not null references public.profiles(id),
 log_date date not null default current_date,time_in time,time_out time,hours numeric,accomplishment text,
 verified boolean not null default false,verified_by uuid references public.profiles(id),created_at timestamptz not null default now());
create table public.attendance_exceptions(
 id uuid primary key default gen_random_uuid(),intern_id uuid not null references public.profiles(id),
 log_date date not null,claimed_time_in time,claimed_time_out time,reason text not null,
 status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')),
 reviewed_by uuid references public.profiles(id),created_at timestamptz not null default now());
create table public.evaluations(
 id uuid primary key default gen_random_uuid(),intern_id uuid not null references public.profiles(id),
 evaluator_id uuid references public.profiles(id),type text not null default 'Evaluation',competencies jsonb not null default '{}',
 feedback text,overall_score numeric check(overall_score between 0 and 100),created_at timestamptz not null default now());
create table public.documents(
 id uuid primary key default gen_random_uuid(),intern_id uuid not null references public.profiles(id),
 doc_type text not null,name text not null,status text not null default 'Pending' check(status in ('Pending','Approved','Needs Revision')),
 file_path text,file_name text,note text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.announcements(
 id uuid primary key default gen_random_uuid(),instructor_id uuid references public.profiles(id),title text not null,
 body text not null,target text not null default 'All Interns',target_intern_id uuid references public.profiles(id),created_at timestamptz not null default now());
create table public.alerts(
 id uuid primary key default gen_random_uuid(),intern_id uuid references public.profiles(id),type text not null,detail text not null,
 severity text not null default 'medium',dismissed boolean not null default false,created_at timestamptz not null default now());
create table public.audit_logs(
 id uuid primary key default gen_random_uuid(),actor_id uuid references public.profiles(id),actor_name text,
 action text not null,detail text,created_at timestamptz not null default now());
create function public.current_role() returns text language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public
as $$ begin return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Deliberately permissive baseline proves migration removes OR bypasses and
-- explicit column grants; other-bucket behavior must be preserved.
grant all on all tables in schema public to anon,authenticated;
grant update(role) on public.profiles to anon,authenticated;
grant all on storage.objects to anon,authenticated;
create policy legacy_everything on public.profiles for all to authenticated using(true) with check(true);
create policy legacy_storage on storage.objects for all to anon,authenticated using(true) with check(true);

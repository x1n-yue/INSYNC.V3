-- M12: server-derived section audiences and idempotent announcement submission.
-- Apply after M11 as trusted postgres. Existing announcements/audiences unchanged.
begin;
do $$ begin
 if current_user <> 'postgres' or to_regprocedure('public.verify_attendance(uuid,timestamptz,timestamptz,numeric)') is null
 then raise exception 'M12 requires trusted postgres and M11'; end if;
end $$;
alter table public.announcements add column target_section_id uuid;
alter table public.announcements add column section_name text;
alter table public.announcements add column submission_id uuid;
create unique index m12_announcement_submission on public.announcements(instructor_id,submission_id) where submission_id is not null;
-- target_section_id is an immutable historical snapshot, like recipient_ids.
-- It intentionally survives deletion of a course section.
revoke insert on public.announcements from public,anon,authenticated;

create or replace function public.bind_announcement() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if public.current_role() is null or public.current_role() not in ('admin','instructor')
   or new.instructor_id is distinct from auth.uid() then raise exception 'Active staff author required' using errcode='42501'; end if;
 if new.recipient_ids is not null then raise exception 'Audience is server-derived'; end if;
 if nullif(btrim(new.title),'') is null or length(new.title)>200 or nullif(btrim(new.body),'') is null or length(new.body)>5000
 then raise exception 'Subject required (<=200 characters); message required (<=5000 characters)'; end if;
 if new.target_section_id is not null then
   if new.target<>'Section' or new.target_intern_id is not null then raise exception 'Section audience must have only a section target'; end if;
   select name into new.section_name from public.course_sections where id=new.target_section_id for share;
   if not found then raise exception 'Section not found; refresh'; end if;
 elsif new.target_intern_id is not null then
   if new.target<>'Personal' then raise exception 'Personal recipient required'; end if;
   new.section_name:=null;
 elsif new.target<>'All Interns' then raise exception 'Choose a valid audience';
 else new.section_name:=null;
 end if;
 select coalesce(array_agg(i.id order by i.id),array[]::uuid[]) into new.recipient_ids
 from public.interns i join public.profiles p on p.id=i.id
 where i.instructor_id=auth.uid() and p.role='intern' and p.status='Active'
   and (new.target_section_id is null or i.section_id=new.target_section_id)
   and (new.target_intern_id is null or i.id=new.target_intern_id);
 if cardinality(new.recipient_ids)=0 then raise exception 'No active assigned recipients' using errcode='42501'; end if;
 return new;
end $$;

create function public.send_announcement(p_title text,p_body text,p_target_intern_id uuid,p_section_id uuid,p_submission_id uuid)
returns public.announcements language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.announcements;
begin
 perform pg_advisory_xact_lock(404,1); -- serialize with assignment/lifecycle changes
 if public.current_role() is null or public.current_role() not in ('admin','instructor') then raise exception 'Active staff required' using errcode='42501'; end if;
 perform 1 from public.profiles where id=auth.uid() for share;
 if p_submission_id is null then raise exception 'Submission UUID required'; end if;
 if p_target_intern_id is not null and p_section_id is not null then raise exception 'Choose one audience'; end if;
 select * into r from public.announcements where instructor_id=auth.uid() and submission_id=p_submission_id;
 if found then
   if r.title is distinct from btrim(p_title) or r.body is distinct from btrim(p_body)
     or r.target_intern_id is distinct from p_target_intern_id or r.target_section_id is distinct from p_section_id
   then raise exception 'Submission key reused with different content' using errcode='40001'; end if;
   return r;
 end if;
 insert into public.announcements(instructor_id,title,body,target,target_intern_id,target_section_id,submission_id)
 values(auth.uid(),btrim(p_title),btrim(p_body),case when p_section_id is not null then 'Section' when p_target_intern_id is not null then 'Personal' else 'All Interns' end,
   p_target_intern_id,p_section_id,p_submission_id) returning * into r;
 return r;
end $$;
revoke all on function public.send_announcement(text,text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.send_announcement(text,text,uuid,uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

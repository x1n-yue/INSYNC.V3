-- READ ONLY. Run after M01-M04 before reviewing M06-M09. Never repairs rows.
select id,required_hours from public.interns where required_hours is null
  or required_hours::text in ('NaN','Infinity','-Infinity')
  or required_hours<=0 or required_hours>10000 or required_hours<>round(required_hours,2);
select intern_id,doc_type,count(*),array_agg(id order by id) ids
from public.documents group by intern_id,doc_type having count(*)>1;
select p.id,p.role,p.status,i.instructor_id from public.profiles p
left join public.interns i on i.id=p.id left join public.profiles staff on staff.id=i.instructor_id
where (p.role='intern' and i.id is null) or (i.instructor_id is not null
  and (p.role<>'intern' or staff.role is distinct from 'instructor' or staff.status is distinct from 'Active'));
-- Broad rubric candidate inventory; M06's exact rubric_score validator is used
-- by M09 after installation. Do not cast unreviewed JSON scalar values here.
select id,intern_id,evaluator_id,competencies,overall_score from public.evaluations
where jsonb_typeof(competencies) is distinct from 'object' or overall_score is null
  or overall_score::text in ('NaN','Infinity','-Infinity')
  or overall_score<>round(overall_score) or overall_score<20 or overall_score>100
  or not (competencies ?& array['punctuality','performance','conduct','communication']);
select d.id,d.intern_id,d.status,d.file_path,d.reviewed_by,d.reviewed_at
from public.documents d left join storage.objects o on o.bucket_id='documents' and o.name=d.file_path
where d.file_path is not null and (split_part(d.file_path,'/',1)<>d.intern_id::text or o.id is null)
  or d.status='Approved' and (d.file_path is null or d.reviewed_by is null or d.reviewed_at is null);
select column_name,data_type from information_schema.columns where table_schema='storage'
and table_name='objects' and column_name in ('id','name','bucket_id','metadata');

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { disposablePostgres } from "./disposable-postgres";

const sql = (file) => readFileSync(new URL(`../supabase/${file}`, import.meta.url), "utf8");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN=id(1), IA=id(2), IB=id(3), SA=id(4), SB=id(5), SC=id(6);
const inactive = ["admin", "instructor", "intern"].flatMap((role, i) => ["Pending", "Inactive"].map((status, j) => ({ id: id(20+i*2+j), role, status })));
const criteria = { punctuality: 4, performance: 5, conduct: 3, communication: 2 };
let cluster, db;
const rows = async (query, params=[]) => (await db.query(query, params)).rows;
// Preserve successful changes inside each test transaction; rollback whole test.
async function act(actor, query, params=[]) {
  await db.query("savepoint operation");
  try {
    await db.query(actor === null ? "set local role anon" : "set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor || ""]);
    const result=await db.query(query,params);
    await db.query("set constraints all immediate");
    await db.query("reset role"); await db.query("select set_config('request.jwt.claim.sub','',true)");
    await db.query("set constraints all deferred"); await db.query("release savepoint operation");
    return result.rows;
  } catch(error) { await db.query("rollback to savepoint operation"); await db.query("reset role"); await db.query("release savepoint operation"); throw error; }
}
async function requirement(owner=SA, type="moa") {
  return (await act(ADMIN, "insert into public.documents(intern_id,doc_type,name) values($1,$2,'Synthetic requirement') returning *",[owner,type]))[0];
}
async function stage(doc, actor=SA) {
  return (await act(actor,"select public.stage_document_upload($1,'Original synthetic.pdf','application/pdf',20,$2) result",[doc.id,doc.upload_version]))[0].result.upload;
}
async function put(v, actor=SA, metadata={mimetype:"application/pdf",size:20}) {
  return act(actor,"insert into storage.objects(bucket_id,name,metadata) values('documents',$1,$2) returning id",[v.file_path,metadata]);
}
async function finalize(v, actor=SA) { return (await act(actor,"select * from public.finalize_document_upload($1)",[v.id]))[0]; }
async function uploaded() { const d=await requirement(); const v=await stage(d); await put(v); return { d:await finalize(v), v }; }
async function review(d,status="Approved",note=null,actor=IA) {
  return (await act(actor,"select * from public.review_document_version($1,$2,$3,$4,$5)",[d.id,status,note,d.upload_version,d.review_revision]))[0];
}
beforeAll(async()=>{
  cluster=await disposablePostgres(); db=await cluster.connect();
  await db.query(sql("tests/baseline.sql"));
  for(const file of ["M01_authority.sql","M02_trusted_audit.sql","M03_attendance_integrity.sql","M04_private_documents_bucket.sql","M05_validate_attendance.sql",
    "M06_rubric_hours.sql","M07_account_lifecycle.sql","M08_document_versions.sql","M09_validate_domain.sql","M10_master_data_lifecycle.sql"]) await db.query(sql(`migrations/${file}`));
  for(const uid of [ADMIN,IA,IB,SA,SB,SC]) await db.query("insert into auth.users(id,email) values($1,$2)",[uid,`${uid}@example.invalid`]);
  await db.query("update public.profiles set status='Active',role=case when id=$1 then 'admin' when id in ($2,$3) then 'instructor' else 'intern' end",[ADMIN,IA,IB]);
  await db.query("update public.interns set instructor_id=case when id=$1 then $2::uuid when id=$3 then $4::uuid else null end",[SA,IA,SB,IB]);
  for(const actor of inactive) {
    await db.query("insert into auth.users(id,email) values($1,$2)",[actor.id,`${actor.id}@example.invalid`]);
    await db.query("update public.profiles set role=$2,status=$3 where id=$1",[actor.id,actor.role,actor.status]);
  }
},60000);
afterAll(async()=>{ if(cluster)await cluster.stop(); },30000);
beforeEach(async()=>{ await db.query("begin"); });
afterEach(async()=>{ await db.query("rollback"); });

describe("M06 authoritative rubric and targets",()=>{
  it.each([[1,20],[5,100]])("all %s criteria persist %s",async(value,score)=>{
    const c=Object.fromEntries(Object.keys(criteria).map(k=>[k,value]));
    const [r]=await act(IA,"select * from public.submit_evaluation($1,$2,'Synthetic feedback',$3)",[SA,c,id(100)]);
    expect(Number(r.overall_score)).toBe(score); expect(r.evaluator_id).toBe(IA);
  });
  it("computes 75, retries once, rejects changed content and allows a distinct instance",async()=>{
    const args=[SA,criteria,id(100)];
    const query="select * from public.submit_evaluation($1,$2,'Synthetic feedback',$3)";
    const [first]=await act(IA,query,args); const [retry]=await act(IA,query,args);
    expect(first.id).toBe(retry.id); expect(Number(first.overall_score)).toBe(75);
    await expect(act(IA,query,[SA,{...criteria,punctuality:1},id(100)])).rejects.toThrow(/reused/);
    await act(IA,query,[SA,criteria,id(101)]);
    expect(await rows("select * from public.evaluations")).toHaveLength(2);
    expect(await rows("select * from public.audit_logs where event_data->>'table'='evaluations'")).toHaveLength(2);
  });
  it.each([null,{},[],{...criteria,extra:1},{...criteria,conduct:null},{...criteria,conduct:"3"},{...criteria,conduct:1.5},{...criteria,conduct:6}])("rejects malformed criteria %j",async(c)=>{
    await expect(act(IA,"select * from public.submit_evaluation($1,$2,null,$3)",[SA,c,id(100)])).rejects.toThrow(/Four integer/);
  });
  it.each([0,-1,10001,1.001,"NaN","Infinity",null])("independently rejects target %s",async(value)=>{
    await expect(act(ADMIN,"select * from public.admin_set_assignment($1,$2,null,null,$3)",[SA,IA,value])).rejects.toThrow(/Required hours/);
    await expect(db.query("update public.interns set required_hours=$1 where id=$2",[value,SA])).rejects.toThrow();
    await db.query("rollback"); await db.query("begin");
  });
});

describe("M07 atomic lifecycle and idempotent requirements",()=>{
  it("blocks incompatible demotion/deactivation and raw field bypasses",async()=>{
    await expect(act(ADMIN,"select public.admin_update_account($1,$2)",[IA,{status:"Inactive"}])).rejects.toThrow(/unassign/);
    await expect(act(ADMIN,"select public.admin_update_account($1,$2)",[SA,{role:"instructor"}])).rejects.toThrow(/unassign/);
    await expect(act(ADMIN,"update public.profiles set role='admin' where id=$1",[SA])).rejects.toThrow(/permission denied/);
    await expect(act(ADMIN,"update public.interns set instructor_id=null where id=$1",[SA])).rejects.toThrow(/permission denied/);
    expect((await rows("select status from public.profiles where id=$1",[IA]))[0].status).toBe("Active");
  });
  it("unassigns deliberately, retains history and activates compatible staff atomically",async()=>{
    await act(ADMIN,"select * from public.admin_set_assignment($1,null,null,null,123.45)",[SA]);
    const [{result}]=await act(ADMIN,"select public.admin_update_account($1,$2) result",[SA,{role:"instructor",status:"Active",full_name:"Duplicate synthetic name"}]);
    expect(result.profile.role).toBe("instructor"); expect(Number(result.intern.required_hours)).toBe(123.45);
    expect(await act(SA,"select * from public.interns where id=$1",[SA])).toHaveLength(0);
    await act(ADMIN,"select public.admin_update_account($1,$2)",[SA,{role:"intern"}]);
    expect((await rows("select required_hours from public.interns where id=$1",[SA]))[0].required_hours).toBe("123.45");
  });
  it("rejects invalid instructor, forbidden patch, missing target and partial profile/company failures",async()=>{
    await expect(act(ADMIN,"select * from public.admin_set_assignment($1,$2,null,null,500)",[SA,SB])).rejects.toThrow(/Active instructor/);
    await expect(act(ADMIN,"select public.admin_update_account($1,$2)",[SA,{email:"forged"}])).rejects.toThrow(/Unsupported/);
    await expect(act(ADMIN,"select public.admin_update_account($1,$2)",[id(999),{status:"Active"}])).rejects.toThrow(/not found/);
    await expect(act(ADMIN,"select public.admin_update_account($1,$2)",[SA,{full_name:"Must roll back",company_id:id(999)}])).rejects.toThrow(/foreign key/);
    expect((await rows("select full_name from public.profiles where id=$1",[SA]))[0].full_name).toBe("New account");
  });
  it("fills partial standard types once without overwriting custom requirements/evidence",async()=>{
    const existing=await requirement(); await requirement(SA,"custom");
    const [{result}]=await act(ADMIN,"select public.attach_standard_docs($1) result",[SA]);
    expect(result.documents).toHaveLength(5);
    expect(result.documents.find(d=>d.id===existing.id).file_path).toBeNull();
    await act(ADMIN,"select public.attach_standard_docs($1)",[SA]);
    expect(await rows("select * from public.documents")).toHaveLength(5);
    await expect(act(ADMIN,"insert into public.documents(intern_id,doc_type,name) values($1,'moa','Duplicate')",[SA])).rejects.toThrow(/unique/);
  });
});

describe("M10 master-data lifecycle",()=>{
  it("sets exactly one current academic year atomically and blocks raw flag writes",async()=>{
    const [{id:a}]=await act(ADMIN,"insert into public.academic_years(label) values('2026-2027') returning id");
    const [{id:b}]=await act(ADMIN,"insert into public.academic_years(label) values('2027-2028') returning id");
    const [current]=await act(ADMIN,"select * from public.admin_set_current_academic_year($1)",[a]);
    expect(current.id).toBe(a); expect(current.is_current).toBe(true);
    const [next]=await act(ADMIN,"select * from public.admin_set_current_academic_year($1)",[b]);
    expect(next.id).toBe(b); expect(next.is_current).toBe(true);
    expect((await rows("select count(*)::int count from public.academic_years where is_current"))[0].count).toBe(1);
    await expect(act(ADMIN,"update public.academic_years set is_current=true where id=$1",[a])).rejects.toThrow(/permission denied/);
  });

  it("reports impact and deletes only after the guarded operation",async()=>{
    const [{id:company}]=await act(ADMIN,"insert into public.companies(name) values('Synthetic Company') returning id");
    await act(ADMIN,"select * from public.admin_set_assignment($1,$2,$3,null,486)",[SA,IA,company]);
    const [{result}]=await act(ADMIN,"select public.admin_delete_master('companies',$1) result",[company]);
    expect(result.id).toBe(company); expect(result.affected_interns).toBe(1);
    expect((await rows("select company_id from public.interns where id=$1",[SA]))[0].company_id).toBeNull();
    const audit=await rows("select * from public.audit_logs where event_data->>'table'='companies' and event_data->>'record_id'=$1",[company]);
    expect(audit.map(event=>event.event_data.operation).sort()).toEqual(["DELETE","INSERT"]);
  });

  it("requires a replacement before deleting the current academic year",async()=>{
    const [{id:a}]=await act(ADMIN,"insert into public.academic_years(label,is_current) values('Current Synthetic',true) returning id");
    await expect(act(ADMIN,"select public.admin_delete_master('academic_years',$1)",[a])).rejects.toThrow(/Current academic year/);
    expect(await rows("select * from public.academic_years where id=$1",[a])).toHaveLength(1);
  });
});

describe("M08 private document lifecycle",()=>{
  it("rejects blank/overlong revision notes and records reviewer/time on revoke",async()=>{
    const {d}=await uploaded();
    await expect(review(d,"Needs Revision"," ")).rejects.toThrow(/note required/);
    await expect(review(d,"Needs Revision","x".repeat(501))).rejects.toThrow(/500/);
    const approved=await review(d);
    const revoked=await review(approved,"Pending","New review needed");
    expect(revoked.reviewed_by).toBe(IA); expect(revoked.reviewed_at).toBeTruthy();
    expect((await rows("select * from public.document_review_events order by review_revision"))[1].note).toBe("New review needed");
  });
  it("restrictive Storage guards block an additional permissive policy from reopening document writes",async()=>{
    await db.query("create policy synthetic_bypass on storage.objects for all to anon,authenticated using(true) with check(true)");
    await expect(act(SA,"insert into storage.objects(bucket_id,name) values('documents',$1)",[`${SA}/unreserved.pdf`])).rejects.toThrow(/row-level/);
    const {d,v}=await uploaded(); await review(d);
    expect(await act(SA,"delete from storage.objects where name=$1 returning id",[v.file_path])).toHaveLength(0);
    expect(await act(ADMIN,"update storage.objects set name='forged' where name=$1 returning id",[v.file_path])).toHaveLength(0);
    expect(await act(null,"select * from storage.objects where name=$1",[v.file_path])).toHaveLength(0);
  });
  it("binds generated names, validates exact stored metadata and protects immutable committed evidence",async()=>{
    const d=await requirement(); const v=await stage(d);
    expect(v.file_path).toBe(`${SA}/${v.id}.pdf`); expect(v.file_path).not.toContain("Original");
    await put(v,SA,{mimetype:"image/png",size:20});
    await expect(finalize(v)).rejects.toThrow(/MIME\/size/);
    await db.query("update storage.objects set metadata=$1 where name=$2",[{mimetype:"application/pdf",size:20},v.file_path]);
    const done=await finalize(v); expect(done.upload_version).toBe("1"); expect(done.status).toBe("Pending");
    const retry=await finalize(v); expect(retry.upload_version).toBe("1");
    expect(await act(SA,"delete from storage.objects where name=$1 returning id",[v.file_path])).toHaveLength(0);
    expect(await act(SA,"update storage.objects set metadata='{}' where name=$1 returning id",[v.file_path])).toHaveLength(0);
    await expect(act(SA,"select * from public.submit_document_upload($1,$2,'Fake')",[d.id,v.file_path])).rejects.toThrow(/permission denied/);
  });
  it("preserves replacement/review history, rejects stale version/revision and clears current note on replacement",async()=>{
    const {d,v}=await uploaded(); const revised=await review(d,"Needs Revision","  Improve scan  ");
    expect(revised.note).toBe("Improve scan"); expect(revised.reviewed_by).toBe(IA);
    const v2=await stage(revised); await put(v2); const next=await finalize(v2);
    expect(next.note).toBeNull(); expect(next.reviewed_by).toBeNull(); expect(next.upload_version).toBe("2");
    await expect(review(d)).rejects.toThrow(/changed/);
    const approved=await review(next,"Approved","Legible");
    await expect(review(next,"Needs Revision","Race loser")).rejects.toThrow(/changed/);
    const revoked=await review(approved,"Pending","Review again"); expect(revoked.review_revision).toBe("2");
    expect((await rows("select * from public.document_versions where id=$1",[v.id]))[0].note).toBe("Improve scan");
    expect(await rows("select * from public.document_review_events")).toHaveLength(3);
    await expect(act(IA,"update public.document_review_events set note='forged'")).rejects.toThrow(/permission denied/);
  });
  it("allows cleanup only after owner cancellation and reconciles a committed upload instead of deleting it",async()=>{
    const d=await requirement(); const v=await stage(d); await put(v);
    expect(await act(SA,"delete from storage.objects where name=$1 returning id",[v.file_path])).toHaveLength(0);
    await act(SA,"select public.cancel_document_upload($1)",[v.id]);
    expect(await act(IB,"delete from storage.objects where name=$1 returning id",[v.file_path])).toHaveLength(0);
    expect(await act(SA,"delete from storage.objects where name=$1 returning id",[v.file_path])).toHaveLength(1);
    await expect(finalize(v)).rejects.toThrow(/expired|changed/);
    const other=await stage(d); await put(other); await finalize(other);
    const [{result}]=await act(SA,"select public.cancel_document_upload($1) result",[other.id]);
    expect(result.committed).toBe(true);
    expect(await act(SA,"delete from storage.objects where name=$1 returning id",[other.file_path])).toHaveLength(0);
  });
  it("cannot finalize two uploads from the same expected version",async()=>{
    const d=await requirement(); const a=await stage(d); const b=await stage(d); await put(a); await put(b);
    await finalize(a); await expect(finalize(b)).rejects.toThrow(/changed/);
    expect(await rows("select * from public.document_versions where committed_at is not null")).toHaveLength(1);
  });
  it("denies unknown object insertion, invalid MIME/size and legacy approval; allows scoped legacy viewing",async()=>{
    const d=await requirement();
    await expect(act(SA,"insert into storage.objects(bucket_id,name) values('documents',$1)",[`${SA}/unreserved.pdf`])).rejects.toThrow(/row-level/);
    await expect(act(SA,"select public.stage_document_upload($1,'Bad','text/html',20,0)",[d.id])).rejects.toThrow(/PDF/);
    await expect(act(SA,"select public.stage_document_upload($1,'Bad','application/pdf',10485761,0)",[d.id])).rejects.toThrow(/PDF/);
    await db.query("update public.documents set file_path=$1,file_name='Legacy.pdf' where id=$2",[`${SA}/legacy.pdf`,d.id]);
    await db.query("insert into storage.objects(bucket_id,name) values('documents',$1)",[`${SA}/legacy.pdf`]);
    expect(await act(IA,"select public.document_access($1,0,0)",[d.id])).toHaveLength(1);
    await expect(review(d)).rejects.toThrow(/resubmit/);
    await expect(act(IB,"select public.document_access($1,0,0)",[d.id])).rejects.toThrow(/not permitted/);
  });
  it("aborts finalize and review fully on mandatory audit failure",async()=>{
    const d=await requirement(); const v=await stage(d); await put(v);
    await db.query(`create function public.synthetic_phase4_fault() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit failure'; end $$;
      create trigger synthetic_phase4_fault before insert on public.audit_logs for each row execute function public.synthetic_phase4_fault()`);
    await expect(finalize(v)).rejects.toThrow(/Synthetic audit failure/);
    expect((await rows("select committed_at from public.document_versions where id=$1",[v.id]))[0].committed_at).toBeNull();
    expect((await rows("select upload_version from public.documents where id=$1",[d.id]))[0].upload_version).toBe("0");
    await db.query("drop trigger synthetic_phase4_fault on public.audit_logs");
    const committed=await finalize(v);
    await db.query("create trigger synthetic_phase4_fault before insert on public.audit_logs for each row execute function public.synthetic_phase4_fault()");
    await expect(review(committed)).rejects.toThrow(/Synthetic audit failure/);
    expect((await rows("select status,review_revision from public.documents where id=$1",[d.id]))[0]).toEqual({status:"Pending",review_revision:"0"});
    expect(await rows("select * from public.document_review_events")).toHaveLength(0);
  });
  it("rolls back evaluation and account/assignment changes when mandatory audit fails",async()=>{
    await db.query(`create function public.synthetic_phase4_fault() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit failure'; end $$;
      create trigger synthetic_phase4_fault before insert on public.audit_logs for each row execute function public.synthetic_phase4_fault()`);
    await expect(act(IA,"select * from public.submit_evaluation($1,$2,null,$3)",[SA,criteria,id(100)])).rejects.toThrow(/Synthetic audit failure/);
    await expect(act(ADMIN,"select public.admin_update_account($1,$2)",[SA,{full_name:"Must roll back"}])).rejects.toThrow(/Synthetic audit failure/);
    await expect(act(ADMIN,"select * from public.admin_set_assignment($1,$2,null,null,500)",[SA,IB])).rejects.toThrow(/Synthetic audit failure/);
    expect(await rows("select * from public.evaluations")).toHaveLength(0);
    expect((await rows("select full_name from public.profiles where id=$1",[SA]))[0].full_name).toBe("New account");
    expect((await rows("select instructor_id,required_hours from public.interns where id=$1",[SA]))[0]).toEqual({instructor_id:IA,required_hours:"486"});
  });
});

describe("Final-stage authority: roles, status and assigned/foreign scopes",()=>{
  it("new evidence tables deny all raw writes across API roles/statuses, including Admin",async()=>{
    for(const actor of [null,ADMIN,IA,IB,SA,SB,SC,...inactive.map(a=>a.id)]) {
      for(const table of ["document_versions","document_review_events"]) {
        for(const query of [`insert into public.${table} default values`,`update public.${table} set intern_id=$1`,`delete from public.${table} where intern_id=$1`]) {
          await expect(act(actor,query,query.includes("$1")?[SA]:[])).rejects.toThrow(/permission denied/);
        }
      }
    }
  });
  it("new RPCs have fixed search paths, trusted ownership, no anonymous/default execution",async()=>{
    const functions=await rows(`select p.oid::regprocedure::text signature,p.prosecdef,p.proconfig,r.rolname,
      has_function_privilege('anon',p.oid,'execute') anon_exec,
      exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_exec
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
      where n.nspname='public' and p.proname=any($1)`,[["submit_evaluation","admin_update_account","admin_set_assignment","attach_standard_docs","stage_document_upload","finalize_document_upload","cancel_document_upload","unfinished_document_uploads","document_access","review_document_version"]]);
    expect(functions).toHaveLength(10);
    for(const f of functions) {
      expect(f).toMatchObject({prosecdef:true,rolname:"postgres",anon_exec:false,public_exec:false});
      expect(f.proconfig).toContain("search_path=pg_catalog, public");
    }
  });
  it.each([null,IB,SA,SB,SC,...inactive.map(a=>a.id)])("denies protected lifecycle/evaluation authority to %s",async(actor)=>{
    await expect(act(actor,"select public.admin_update_account($1,$2)",[SA,{status:"Active"}])).rejects.toThrow(/Admin|permission denied/);
    await expect(act(actor,"select * from public.submit_evaluation($1,$2,null,$3)",[SA,criteria,id(100)])).rejects.toThrow(/not permitted|permission denied/);
  });
  it.each([null,IB,SB,SC,...inactive.map(a=>a.id)])("denies foreign/inactive document operations to %s",async(actor)=>{
    const {d,v}=await uploaded();
    await expect(stage(d,actor)).rejects.toThrow(/requirement|permission denied/);
    await expect(review(d,"Approved",null,actor)).rejects.toThrow(/not permitted|permission denied/);
    await expect(finalize(v,actor)).rejects.toThrow(/reservation|permission denied/);
    if (actor === null) await expect(act(actor,"select * from public.document_versions where id=$1",[v.id])).rejects.toThrow(/permission denied/);
    else expect(await act(actor,"select * from public.document_versions where id=$1",[v.id])).toHaveLength(0);
  });
  it("assigned staff/Admin read committed versions and events; owner cannot review",async()=>{
    const {d}=await uploaded(); await review(d);
    for(const actor of [ADMIN,IA,SA]) {
      expect(await act(actor,"select * from public.document_versions")).toHaveLength(1);
      expect(await act(actor,"select * from public.document_review_events")).toHaveLength(1);
    }
    await expect(review(d,"Approved",null,SA)).rejects.toThrow(/not permitted/);
  });
  it("delivers personal/roster announcements by UUID despite duplicate names, renames and reassignment",async()=>{
    await act(ADMIN,"select public.admin_update_account($1,$2)",[SA,{full_name:"Same synthetic name"}]);
    await act(ADMIN,"select public.admin_update_account($1,$2)",[SB,{full_name:"Same synthetic name"}]);
    await act(IA,"insert into public.announcements(instructor_id,title,body,target,target_intern_id) values($1,'Personal','Synthetic body','Personal',$2)",[IA,SA]);
    await act(IA,"insert into public.announcements(instructor_id,title,body) values($1,'Roster','Synthetic body')",[IA]);
    await expect(act(IA,"insert into public.announcements(instructor_id,title,body,target,target_intern_id) values($1,'Foreign','Synthetic body','Personal',$2)",[IA,SB])).rejects.toThrow(/assigned/);
    expect(await act(SA,"select * from public.announcements")).toHaveLength(2);
    expect(await act(SB,"select * from public.announcements")).toHaveLength(0);
    expect(await act(SC,"select * from public.announcements")).toHaveLength(0);
    await act(ADMIN,"select * from public.admin_set_assignment($1,$2,null,null,486)",[SA,IB]);
    await act(ADMIN,"select public.admin_update_account($1,$2)",[SA,{full_name:"Renamed synthetic intern"}]);
    expect(await act(SA,"select * from public.announcements")).toHaveLength(2);
    expect(await act(IB,"select * from public.announcements")).toHaveLength(0);
  });
});

describe("Phase 4 native overlapping transactions",()=>{
  async function operation(client, actor, query, params=[]) {
    await client.query("begin");
    try {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
      const result=await client.query(query,params); await client.query("commit"); return result.rows;
    } catch(error) { await client.query("rollback"); throw error; }
  }
  async function race(operations) {
    // Publish only this test's synthetic fixtures before independent connections.
    await db.query("commit");
    const clients=await Promise.all(operations.map(()=>cluster.connect()));
    await db.query("begin; select pg_advisory_xact_lock(404,1)");
    const pending=Promise.allSettled(operations.map((op,i)=>op(clients[i])));
    try {
      let blocked=0;
      for(let n=0;n<100;n++) {
        await db.query("select pg_stat_clear_snapshot()");
        blocked=(await rows("select count(*)::int n from pg_stat_activity where pid=any($1) and wait_event='advisory'",[clients.map(c=>c.processID)]))[0].n;
        if(blocked===clients.length)break;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(blocked).toBe(clients.length); await db.query("commit"); return await pending;
    } finally { await db.query("rollback"); await pending; await Promise.all(clients.map(c=>c.end())); }
  }
  async function cleanup() {
    // Synthetic database only; there are no provider file bytes in this harness.
    await db.query("delete from public.document_review_events; delete from public.document_versions; delete from public.documents; delete from storage.objects; delete from public.evaluations; delete from public.audit_logs");
    await db.query("update public.profiles set status='Active' where id=$1",[IA]);
    await db.query("update public.interns set instructor_id=$1 where id=$2",[IA,SA]);
    await db.query("begin");
  }
  it("same evaluation retry commits once under real concurrency",async()=>{
    try {
      const query="select * from public.submit_evaluation($1,$2,null,$3)";
      const result=await race([c=>operation(c,IA,query,[SA,criteria,id(100)]),c=>operation(c,IA,query,[SA,criteria,id(100)])]);
      expect(result.every(r=>r.status==="fulfilled")).toBe(true);
      expect(result[0].value[0].id).toBe(result[1].value[0].id);
      expect(await rows("select * from public.evaluations")).toHaveLength(1);
    } finally {await cleanup();}
  });
  it("two partial-checklist attachments create only missing identities once",async()=>{
    try {
      await requirement();
      const result=await race([c=>operation(c,ADMIN,"select public.attach_standard_docs($1)",[SA]),c=>operation(c,ADMIN,"select public.attach_standard_docs($1)",[SA])]);
      expect(result.every(r=>r.status==="fulfilled")).toBe(true); expect(await rows("select * from public.documents")).toHaveLength(4);
    } finally {await cleanup();}
  });
  it("two uploads at one expected version commit one version",async()=>{
    try {
      const d=await requirement();const a=await stage(d),b=await stage(d);await put(a);await put(b);
      const result=await race([c=>operation(c,SA,"select * from public.finalize_document_upload($1)",[a.id]),c=>operation(c,SA,"select * from public.finalize_document_upload($1)",[b.id])]);
      expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
      expect(await rows("select * from public.document_versions where committed_at is not null")).toHaveLength(1);
    } finally {await cleanup();}
  });
  it("approve/revise race commits a single current-version decision",async()=>{
    try {
      const {d}=await uploaded(); const query="select * from public.review_document_version($1,$2,'Synthetic note',$3,$4)";
      const result=await race([c=>operation(c,IA,query,[d.id,"Approved",d.upload_version,d.review_revision]),c=>operation(c,ADMIN,query,[d.id,"Needs Revision",d.upload_version,d.review_revision])]);
      expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
      expect(await rows("select * from public.document_review_events")).toHaveLength(1);
    } finally {await cleanup();}
  });
  it("replacement racing old review never approves the replacement with stale evidence",async()=>{
    try {
      const {d}=await uploaded();const replacement=await stage(d);await put(replacement);
      await race([c=>operation(c,SA,"select * from public.finalize_document_upload($1)",[replacement.id]),c=>operation(c,IA,"select * from public.review_document_version($1,'Approved',null,$2,$3)",[d.id,d.upload_version,d.review_revision])]);
      const [final]=await rows("select * from public.documents where id=$1",[d.id]);
      expect(final.upload_version).toBe("2");expect(final.status).toBe("Pending");expect(final.reviewed_by).toBeNull();
    } finally {await cleanup();}
  });
  it("cancellation racing finalize never makes committed evidence deletable",async()=>{
    try {
      const d=await requirement();const v=await stage(d);await put(v);
      await race([c=>operation(c,SA,"select * from public.finalize_document_upload($1)",[v.id]),c=>operation(c,SA,"select public.cancel_document_upload($1)",[v.id])]);
      const [receipt]=await rows("select * from public.document_versions where id=$1",[v.id]);
      await db.query("begin");
      const removed=await act(SA,"delete from storage.objects where name=$1 returning id",[v.file_path]);
      expect(removed).toHaveLength(receipt.committed_at?0:1);
      expect(receipt.committed_at && receipt.abandoned_at).toBeFalsy();await db.query("rollback");
    } finally {await cleanup();}
  });
  it("assignment/deactivation race preserves Active instructor references",async()=>{
    try {
      await race([c=>operation(c,ADMIN,"select * from public.admin_set_assignment($1,$2,null,null,486)",[SA,IB]),c=>operation(c,ADMIN,"select public.admin_update_account($1,$2)",[IA,{status:"Inactive"}])]);
      expect(await rows("select i.id from public.interns i join public.profiles p on p.id=i.instructor_id where p.role<>'instructor' or p.status<>'Active'")).toHaveLength(0);
    } finally {await cleanup();}
  });
});

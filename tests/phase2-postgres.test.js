import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { disposablePostgres } from "./disposable-postgres";

const sql = (file) => readFileSync(new URL(`../supabase/${file}`, import.meta.url), "utf8");
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN=uuid(1), IA=uuid(2), IB=uuid(3), SA=uuid(4), SB=uuid(5), SC=uuid(6);
const inactiveActors=["admin","instructor","intern"].flatMap((role,index)=>["Pending","Inactive"].map((status,n)=>({ id:uuid(10+index*2+n),role,status })));
let cluster, db;
const rows = async (query, params=[]) => (await db.query(query,params)).rows;
async function as(actor, query, params=[], client=db, role="authenticated") {
  await client.query("begin");
  try {
    await client.query(role === "anon" ? "set local role anon" : "set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,true)",[actor ?? ""]);
    const result=await client.query(query,params);
    await client.query("commit");
    return result.rows;
  } catch (error) { await client.query("rollback"); throw error; }
}
async function request(date="2020-01-02", intern=SA, start="08:00", end="16:00", endDate=date) {
  return (await as(intern,"select * from public.submit_correction($1,$2,$3,$4,'Synthetic evidence')",[date,start,end,endDate]))[0];
}
const review = (id,decision="Approved",note=null,actor=IA,client=db) =>
  as(actor,"select * from public.review_exception($1,$2,$3)",[id,decision,note],client);
async function failureOn(table, condition="true") {
  // Trusted fault injection exists ONLY in this disposable synthetic database.
  await db.query(`create function public.synthetic_failure() returns trigger language plpgsql as $$ begin
    if ${condition} then raise exception 'Synthetic injected failure'; end if; return new; end $$;
    create trigger synthetic_failure before insert or update on public.${table} for each row execute function public.synthetic_failure()`);
  return async () => { await db.query(`drop trigger synthetic_failure on public.${table}; drop function public.synthetic_failure()`); };
}
beforeAll(async () => {
  cluster=await disposablePostgres(); db=await cluster.connect();
  await db.query(sql("tests/baseline.sql"));
  for(const file of ["M01_authority.sql","M02_trusted_audit.sql","M03_attendance_integrity.sql","M04_private_documents_bucket.sql","M05_validate_attendance.sql"]) {
    await db.query(sql(`migrations/${file}`));
  }
  for(const id of [ADMIN,IA,IB,SA,SB,SC]) await db.query("insert into auth.users(id,email) values($1,$2)",[id,`${id}@example.invalid`]);
  await db.query("update public.profiles set status='Active',role=case when id=$1 then 'admin' when id in ($2,$3) then 'instructor' else 'intern' end",[ADMIN,IA,IB]);
  await db.query("update public.interns set instructor_id=case when id=$1 then $2::uuid when id=$3 then $4::uuid else null end",[SA,IA,SB,IB]);
  for(const actor of inactiveActors) {
    await db.query("insert into auth.users(id,email) values($1,$2)",[actor.id,`${actor.id}@example.invalid`]);
    await db.query("update public.profiles set role=$2,status=$3 where id=$1",[actor.id,actor.role,actor.status]);
  }
},60000);
afterAll(async () => { if(cluster) await cluster.stop(); },30000);
beforeEach(async () => {
  // Synthetic rows only; reset test data, never production/bootstrap data.
  await db.query("delete from public.attendance_exceptions; delete from public.attendance_logs; delete from public.documents; delete from public.evaluations; delete from public.audit_logs");
});

describe("M02 INS-009: trusted mandatory audit", () => {
  it.each([ADMIN,IA,SA])("denies arbitrary audit inserts even to %s",async(actor)=>{
    await expect(as(actor,"insert into public.audit_logs(actor_id,action) values($1,'Forged')",[ADMIN])).rejects.toThrow(/permission denied/);
    await expect(as(actor,"select public.write_trusted_audit()")).rejects.toThrow(/permission denied/);
    expect(await rows("select * from public.audit_logs")).toHaveLength(0);
  });
  it("binds actor, server time and changed fields; no-op/zero-row updates produce no events",async()=>{
    const start=new Date();
    await as(ADMIN,"update public.interns set required_hours=500 where id=$1 returning id",[SA]);
    const [log]=await rows("select * from public.audit_logs");
    expect(log.actor_id).toBe(ADMIN); expect(log.source).toBe("database-trigger-v2");
    expect(log.event_data.changed_fields).toEqual(["required_hours"]);
    expect(new Date(log.created_at).getTime()).toBeGreaterThanOrEqual(start.getTime()-1000);
    expect(log.event_data).not.toHaveProperty("email");
    await as(ADMIN,"update public.interns set required_hours=required_hours where id=$1",[SA]);
    await as(ADMIN,"update public.interns set required_hours=500 where id=$1",[uuid(999)]);
    expect(await rows("select * from public.audit_logs")).toHaveLength(1);
  });
  it.each(["companies","course_sections","academic_years"])("audits %s create/update/delete transactionally",async(table)=>{
    const column=table==="academic_years" ? "label" : "name";
    const [r]=await as(ADMIN,`insert into public.${table}(${column}) values('Synthetic master') returning id`);
    await as(ADMIN,`update public.${table} set ${column}='Changed synthetic' where id=$1`,[r.id]);
    await as(ADMIN,`delete from public.${table} where id=$1`,[r.id]);
    expect((await rows("select event_data->>'operation' op from public.audit_logs order by created_at")).map(r=>r.op)).toEqual(["INSERT","UPDATE","DELETE"]);
    const [deleted]=await rows("select event_data from public.audit_logs where event_data->>'operation'='DELETE'");
    expect(deleted.event_data.entity_label).toBe("Changed synthetic");
  });
  it("audits profile, assignment, evaluation, requirement/upload/review and attendance operations",async()=>{
    await as(SA,"update public.profiles set full_name='Duplicate Synthetic Name' where id=$1",[SA]);
    await as(ADMIN,"update public.interns set company_id=null,required_hours=501 where id=$1",[SA]);
    await as(IA,"insert into public.evaluations(intern_id,evaluator_id,overall_score) values($1,$2,80)",[SA,IA]);
    const [doc]=await as(ADMIN,"insert into public.documents(intern_id,doc_type,name) values($1,'moa','Synthetic MOA') returning id",[SA]);
    const path=`${SA}/synthetic.pdf`;
    await db.query("insert into storage.objects(bucket_id,name) values('documents',$1) on conflict do nothing",[path]);
    await as(SA,"select * from public.submit_document_upload($1,$2,'Original.pdf')",[doc.id,path]);
    await as(IA,"select * from public.review_document($1,'Approved',null,$2)",[doc.id,path]);
    const ex=await request(); await review(ex.id);
    const tables=(await rows("select distinct event_data->>'table' t from public.audit_logs")).map(r=>r.t);
    for(const table of ["profiles","interns","evaluations","documents","attendance_logs","attendance_exceptions"]) expect(tables).toContain(table);
    const [audit]=await rows("select * from public.audit_logs where event_data->>'table'='documents' and event_data->>'status'='Approved'");
    expect(audit.actor_id).toBe(IA); expect(audit.event_data.reviewed_by).toBe(IA);
  });
  it("aborts an ordinary Admin mutation when its audit insert fails",async()=>{
    const [before]=await rows("select required_hours from public.interns where id=$1",[SA]);
    const cleanup=await failureOn("audit_logs");
    try {
      await expect(as(ADMIN,"update public.interns set required_hours=100 where id=$1",[SA])).rejects.toThrow("Synthetic injected failure");
      expect((await rows("select required_hours from public.interns where id=$1",[SA]))[0]).toEqual(before);
    } finally { await cleanup(); }
  });
});

describe("M02 RT-08..13: reconciliation, rollback and truthful bulk outcomes",()=>{
  it.each(inactiveActors)("denies $status $role controlled operations with retained identity",async(actor)=>{
    const ex=await request();
    await expect(review(ex.id,"Approved",null,actor.id)).rejects.toThrow(/not permitted/);
    await expect(as(actor.id,"select * from public.review_exceptions($1,'Approved',null)",[[ex.id]])).rejects.toThrow(/Active staff/);
    await expect(as(actor.id,"select * from public.clock_in()")).rejects.toThrow(/Active intern/);
    await expect(as(actor.id,"select * from public.clock_out($1,'Synthetic')",[uuid(999)])).rejects.toThrow(/Active intern/);
    await expect(as(actor.id,"select public.submit_correction('2020-01-03','08:00','16:00','2020-01-03','Evidence')")).rejects.toThrow(/Active intern/);
    expect(await rows("select * from public.attendance_logs")).toHaveLength(0);
  });
  it("approves a missing day with trusted instants, duration, reviewer and both audit events",async()=>{
    const ex=await request(); const [result]=await review(ex.id);
    expect(result.status).toBe("Approved"); expect(result.reviewed_by).toBe(IA);
    const [a]=await rows("select * from public.attendance_logs");
    expect(Number(a.hours)).toBe(8); expect(a.verified).toBe(true); expect(a.verified_by).toBe(IA);
    expect((await rows("select * from public.audit_logs where event_data->>'table'='attendance_logs'")).length).toBe(1);
    await expect(review(ex.id)).rejects.toThrow(/already reviewed/);
    expect(await rows("select * from public.attendance_logs")).toHaveLength(1);
  });
  it("updates the existing daily row and preserves accomplishment/id",async()=>{
    const [a]=await db.query(`insert into public.attendance_logs(intern_id,log_date,time_in,time_out,clocked_in_at,clocked_out_at,hours,accomplishment)
      values($1,'2020-01-02','09:00','16:00','2020-01-02 09:00+08','2020-01-02 16:00+08',7,'Keep original work') returning *`,[SA]).then(r=>r.rows);
    const ex=await request(); await review(ex.id);
    const [after]=await rows("select * from public.attendance_logs");
    expect(after.id).toBe(a.id); expect(after.accomplishment).toBe("Keep original work"); expect(Number(after.hours)).toBe(8);
  });
  it("rejects with required persisted note without creating attendance",async()=>{
    const ex=await request();
    await expect(review(ex.id,"Rejected"," ")).rejects.toThrow(/Rejection note/);
    await expect(review(ex.id,"Rejected","x".repeat(501))).rejects.toThrow(/500/);
    const [r]=await review(ex.id,"Rejected","  Evidence is incomplete  ");
    expect(r.review_note).toBe("Evidence is incomplete"); expect(r.reviewed_at).toBeTruthy();
    expect(await rows("select * from public.attendance_logs")).toHaveLength(0);
  });
  it.each(["attendance_logs","attendance_exceptions","audit_logs"])("rolls back attendance + status on %s failure",async(table)=>{
    const ex=await request(); const before=(await rows("select * from public.audit_logs")).length;
    const cleanup=await failureOn(table,table==="audit_logs" ? "new.event_data->>'table'='attendance_exceptions'" : "true");
    try {
      await expect(review(ex.id)).rejects.toThrow("Synthetic injected failure");
      expect((await rows("select status from public.attendance_exceptions where id=$1",[ex.id]))[0].status).toBe("Pending");
      expect(await rows("select * from public.attendance_logs")).toHaveLength(0);
      expect(await rows("select * from public.audit_logs")).toHaveLength(before);
    } finally { await cleanup(); }
  });
  it("rolls back a failed existing-row reconciliation without losing its original evidence",async()=>{
    await db.query(`insert into public.attendance_logs(intern_id,log_date,time_in,time_out,clocked_in_at,clocked_out_at,hours,accomplishment)
      values($1,'2020-01-02','09:00','16:00','2020-01-02 09:00+08','2020-01-02 16:00+08',7,'Original evidence')`,[SA]);
    const before=await rows("select * from public.attendance_logs");
    const ex=await request(); const cleanup=await failureOn("attendance_logs");
    try {
      await expect(review(ex.id)).rejects.toThrow(/Synthetic injected failure/);
      expect(await rows("select * from public.attendance_logs")).toEqual(before);
      expect((await rows("select status from public.attendance_exceptions where id=$1",[ex.id]))[0].status).toBe("Pending");
    } finally { await cleanup(); }
  });
  it("denies anonymous bulk execution and rejects excessive or malformed batches",async()=>{
    const ex=await request();
    await expect(as(null,"select * from public.review_exceptions($1,'Approved',null)",[[ex.id]],db,"anon")).rejects.toThrow(/permission denied/);
    for(const ids of [[],Array(101).fill(ex.id),[null]]) {
      await expect(as(IA,"select * from public.review_exceptions($1,'Approved',null)",[ids])).rejects.toThrow(/1 and 100/);
    }
  });
  it("returns mixed bulk results including an audit-failed item, with no partial approval",async()=>{
    const first=await request("2020-01-02"), second=await request("2020-01-03"), foreign=await request("2020-01-04",SB);
    const cleanup=await failureOn("audit_logs",`new.event_data->>'record_id'='${second.id}' and new.event_data->>'status'='Approved'`);
    try {
      const result=await as(IA,"select * from public.review_exceptions($1,'Approved',null)",[[first.id,second.id,foreign.id,first.id]]);
      expect(result).toHaveLength(3); expect(result.filter(r=>r.ok).map(r=>r.id)).toEqual([first.id]);
      expect(result.find(r=>r.id===second.id).error).toContain("Synthetic injected failure");
      expect(result.find(r=>r.id===foreign.id).code).toBe("42501");
      expect((await rows("select status from public.attendance_exceptions where id=$1",[second.id]))[0].status).toBe("Pending");
      expect(await rows("select * from public.attendance_logs")).toHaveLength(1);
    } finally { await cleanup(); }
  });
  it.each([SA,IB,SC])("denies non-reviewer %s without changing attendance",async(actor)=>{
    const ex=await request(); await expect(review(ex.id,"Approved",null,actor)).rejects.toThrow(/not permitted/);
    expect(await rows("select * from public.attendance_logs")).toHaveLength(0);
  });
});

describe("M03 RT-11..13: intervals, identity and clock transitions",()=>{
  it.each([
    ["08:00","08:00","2020-01-02"], ["17:00","08:00","2020-01-02"],
    ["08:00","01:00","2020-01-03"], ["08:00","09:00","2020-01-04"],
  ])("rejects invalid/excessive/ambiguous interval %s to %s ending %s",async(start,end,endDate)=>{
    await expect(request("2020-01-02",SA,start,end,endDate)).rejects.toThrow(/Invalid|Explicit/);
    expect(await rows("select * from public.attendance_exceptions")).toHaveLength(0);
  });
  it.each([["08:00","00:00","2020-01-03",16],["23:30","01:30","2020-01-03",2],["08:00:00","08:00:01","2020-01-02",1/3600]])("derives exact valid duration including explicit overnight",async(start,end,endDate,hours)=>{
    const ex=await request("2020-01-02",SA,start,end,endDate); await review(ex.id);
    expect(Number((await rows("select hours from public.attendance_logs"))[0].hours)).toBeCloseTo(hours,10);
  });
  it("rejects future/empty/oversized reasons and duplicate Pending corrections",async()=>{
    await expect(request("2099-01-02")).rejects.toThrow(/future/);
    for(const reason of ["", " ", "x".repeat(501)]) await expect(as(SA,"select public.submit_correction('2020-01-02','08:00','16:00','2020-01-02',$1)",[reason])).rejects.toThrow(/Reason/);
    await request(); await expect(request()).rejects.toThrow(/Pending/);
    const ex=(await rows("select id from public.attendance_exceptions"))[0];
    await review(ex.id,"Rejected","Provide complete evidence");
    expect((await request()).status).toBe("Pending");
  });
  it("independently rejects raw trusted SQL forgery/null checks and duplicate daily identity",async()=>{
    for(const values of ["null,null,null,null,null", "'08:00','16:00','2020-01-02 08:00+08','2020-01-02 16:00+08',999",
      "'08:00','07:00','2020-01-02 08:00+08','2020-01-02 07:00+08',-1"]) {
      await expect(db.query(`insert into public.attendance_logs(intern_id,log_date,time_in,time_out,clocked_in_at,clocked_out_at,hours) values($1,'2020-01-02',${values})`,[SA])).rejects.toThrow(/m03_attendance_interval/);
    }
    const ex=await request(); await review(ex.id);
    await expect(db.query("insert into public.attendance_logs select gen_random_uuid(),intern_id,log_date,time_in,time_out,hours,accomplishment,verified,verified_by,created_at,clocked_in_at,clocked_out_at from public.attendance_logs")).rejects.toThrow(/m03_daily_identity/);
  });
  it("guards clock-out by ID/open state, derives duration and preserves failed drafts",async()=>{
    const [a]=await as(SA,"select * from public.clock_in()");
    expect(a.verified).toBe(false); expect(a.verified_by).toBeNull();
    const [date]=await rows("select (clocked_in_at at time zone 'Asia/Manila')::date=log_date matches from public.attendance_logs");
    expect(date.matches).toBe(true);
    await expect(as(SA,"select public.clock_in()")).rejects.toThrow(/already exists/);
    await expect(as(SA,"select public.clock_out($1,'Work')",[uuid(999)])).rejects.toThrow(/not found/);
    await expect(as(SB,"select public.clock_out($1,'Work')",[a.id])).rejects.toThrow(/not found/);
    await expect(as(SA,"select public.clock_out($1,$2)",[a.id,"x".repeat(501)])).rejects.toThrow(/500/);
    const [closed]=await as(SA,"select * from public.clock_out($1,'Synthetic work')",[a.id]);
    expect(Number(closed.hours)).toBeGreaterThan(0); expect(Number(closed.hours)).toBeLessThan(16);
    await expect(as(SA,"select public.clock_out($1,'Overwrite')",[a.id])).rejects.toThrow(/not found/);
    expect((await rows("select accomplishment from public.attendance_logs"))[0].accomplishment).toBe("Synthetic work");
  });
});

describe("native Postgres: genuinely concurrent transactions",()=>{
  it.each(["deactivate","reassign"])("rechecks authority after a concurrent %s commits while review waits",async(change)=>{
    const ex=await request(); const client=await cluster.connect();
    await db.query("begin; select pg_advisory_xact_lock(hashtextextended('"+SA+"',101))");
    const pending=review(ex.id,"Approved",null,IA,client);
    // Attach rejection observer immediately; review intentionally fails later.
    const result=Promise.allSettled([pending]);
    let blocked=false;
    try {
      for(let count=0;count<100;count++) {
        await db.query("select pg_stat_clear_snapshot()");
        blocked=(await rows("select exists(select 1 from pg_stat_activity where pid=$1 and wait_event='advisory') blocked",[client.processID]))[0].blocked;
        if(blocked) break;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(blocked).toBe(true);
      if(change==="deactivate") await db.query("update public.profiles set status='Inactive' where id=$1",[IA]);
      else await db.query("update public.interns set instructor_id=$1 where id=$2",[IB,SA]);
      await db.query("commit");
      const [outcome]=await result;
      expect(outcome.status).toBe("rejected"); expect(outcome.reason.message).toContain("Assignment changed");
      expect((await rows("select status from public.attendance_exceptions where id=$1",[ex.id]))[0].status).toBe("Pending");
      expect(await rows("select * from public.attendance_logs")).toHaveLength(0);
    } finally {
      await db.query("rollback"); await result; await client.end();
      await db.query("update public.profiles set status='Active' where id=$1",[IA]);
      await db.query("update public.interns set instructor_id=$1 where id=$2",[IA,SA]);
    }
  });
  async function race(operations) {
    const clients=await Promise.all(operations.map(()=>cluster.connect()));
    // Hold the same intern lock until BOTH connections are observed waiting.
    // This proves overlapping transactions instead of relying on scheduling luck.
    await db.query("begin; select pg_advisory_xact_lock(hashtextextended('"+SA+"',101))");
    const pending=Promise.allSettled(operations.map((op,i)=>op(clients[i])));
    let blocked=0;
    try {
      for(let count=0;count<100;count++) {
        // pg_stat_activity uses transaction snapshots; clear between polls.
        await db.query("select pg_stat_clear_snapshot()");
        blocked=(await rows("select count(*)::int n from pg_stat_activity where pid=any($1) and wait_event='advisory'",[clients.map(c=>c.processID)]))[0].n;
        if(blocked===clients.length) break;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(blocked).toBe(clients.length);
      await db.query("commit");
      return await pending;
    } finally {
      await db.query("rollback");
      await pending;
      await Promise.all(clients.map(c=>c.end()));
    }
  }
  it.each(["Approved","Rejected"])("two %s reviews commit exactly once",async(decision)=>{
    const ex=await request();
    const results=await race([c=>review(ex.id,decision,"Synthetic note",IA,c),c=>review(ex.id,decision,"Synthetic note",ADMIN,c)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(await rows("select * from public.attendance_logs")).toHaveLength(decision==="Approved" ? 1 : 0);
    expect((await rows("select * from public.audit_logs where event_data->>'table'='attendance_exceptions' and event_data->>'operation'='UPDATE'")).length).toBe(1);
  });
  it("approve/reject race has one winner and attendance agrees with committed state",async()=>{
    const ex=await request();
    const results=await race([c=>review(ex.id,"Approved",null,IA,c),c=>review(ex.id,"Rejected","Needs evidence",ADMIN,c)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const [final]=await rows("select status from public.attendance_exceptions where id=$1",[ex.id]);
    expect(await rows("select * from public.attendance_logs")).toHaveLength(final.status==="Approved" ? 1 : 0);
  });
  it("concurrent clock-ins, clock-outs and Pending submissions commit one transition each",async()=>{
    let results=await race([c=>as(SA,"select * from public.clock_in()",[],c),c=>as(SA,"select * from public.clock_in()",[],c)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const [a]=await rows("select id from public.attendance_logs");
    results=await race([c=>as(SA,"select * from public.clock_out($1,'First')",[a.id],c),c=>as(SA,"select * from public.clock_out($1,'Second')",[a.id],c)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    results=await race([c=>as(SA,"select public.submit_correction('2020-01-02','08:00','16:00','2020-01-02','Evidence')",[],c),c=>as(SA,"select public.submit_correction('2020-01-02','08:00','16:00','2020-01-02','Evidence')",[],c)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(await rows("select * from public.attendance_exceptions")).toHaveLength(1);
  });
});

describe("M04/M05: bucket configuration and validated synthetic constraints",()=>{
  it("explicitly converts a pre-existing public bucket without changing another bucket",async()=>{
    await db.query("update storage.buckets set public=true,file_size_limit=null,allowed_mime_types=null where id='documents'");
    await db.query(sql("migrations/M04_private_documents_bucket.sql"));
    const [bucket]=await rows("select * from storage.buckets where id='documents'");
    expect(bucket.public).toBe(false); expect(Number(bucket.file_size_limit)).toBe(10485760);
    expect(bucket.allowed_mime_types).toEqual(["application/pdf","image/jpeg","image/png"]);
    expect((await rows("select public from storage.buckets where id='other'"))[0].public).toBe(false);
  });
  it("has all four historical checks validated only on clean synthetic data",async()=>{
    const checks=await rows("select convalidated from pg_constraint where conname in ('m03_attendance_interval','m03_accomplishment_length','m03_correction_interval','m03_correction_review')");
    expect(checks).toHaveLength(4); expect(checks.every(r=>r.convalidated)).toBe(true);
    expect((await rows("select count(*)::int n from pg_trigger where tgname='m02_trusted_audit' and tgenabled='O'"))[0].n).toBe(11);
  });
});

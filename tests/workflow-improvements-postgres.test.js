import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { disposablePostgres } from "./disposable-postgres";

const sql = (name) => readFileSync(new URL(`../supabase/${name}`, import.meta.url), "utf8");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN=id(1), IA=id(2), IB=id(3), SA=id(4), SB=id(5), SC=id(6), SD=id(7), YEAR=id(10), NEXT=id(11), A=id(20), B=id(21);
let cluster, db;
async function act(actor, query, params=[]) {
  await db.query("savepoint operation");
  try {
    await db.query(actor ? "set local role authenticated" : "set local role anon");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor ?? ""]);
    const result = await db.query(query, params);
    await db.query("set constraints all immediate");
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',true)");
    await db.query("set constraints all deferred");
    await db.query("release savepoint operation");
    return result.rows;
  } catch (error) {
    await db.query("rollback to savepoint operation");
    await db.query("reset role");
    await db.query("release savepoint operation");
    throw error;
  }
}
async function assign(year, owner=SA) {
  return (await act(ADMIN,"select * from public.admin_set_assignment($1,$2,null,$3,486,$4)",[owner,IA,A,year]))[0];
}
async function attendance(open=false) {
  return (await db.query(`insert into public.attendance_logs(intern_id,log_date,time_in,time_out,clocked_in_at,clocked_out_at,hours,accomplishment)
    values($1,'2026-10-01','08:00:00',${open ? "null" : "'16:00:00'"},'2026-10-01T00:00:00Z',${open ? "null,null" : "'2026-10-01T08:00:00Z',8"},'Completed daily report') returning *`,[SA])).rows[0];
}
const verify = (row, actor=IA) => act(actor,"select * from public.verify_attendance($1,$2,$3,$4)",[row.id,row.clocked_in_at,row.clocked_out_at,row.hours]);
const announce = (actor=IA, key=id(100), section=A, title="Reminder") => act(actor,"select * from public.send_announcement($1,'Submit your DTR',null,$2,$3)",[title,section,key]);

beforeAll(async () => {
  cluster=await disposablePostgres(); db=await cluster.connect();
  await db.query(sql("tests/baseline.sql"));
  for (const name of ["M01_authority.sql","M02_trusted_audit.sql","M03_attendance_integrity.sql","M04_private_documents_bucket.sql","M05_validate_attendance.sql","M06_rubric_hours.sql","M07_account_lifecycle.sql","M08_document_versions.sql","M09_validate_domain.sql","M10_master_data_lifecycle.sql","M11_attendance_year_workflows.sql","M12_section_announcements.sql"])
    await db.query(sql(`migrations/${name}`));
  for (const uid of [ADMIN,IA,IB,SA,SB,SC,SD]) await db.query("insert into auth.users(id,email) values($1,$2)",[uid,`${uid}@synthetic.invalid`]);
  await db.query("update public.profiles set status='Active',role=case when id=$1 then 'admin' when id in ($2,$3) then 'instructor' else 'intern' end",[ADMIN,IA,IB]);
  await db.query("insert into public.academic_years(id,label) values($1,'2026-2027'),($2,'2027-2028')",[YEAR,NEXT]);
  await db.query("insert into public.course_sections(id,name) values($1,'BSIT 4A'),($2,'BSIT 4B')",[A,B]);
  await db.query("update public.interns set instructor_id=case when id in ($1,$2) then $3::uuid else $4::uuid end,section_id=case when id=$2 then $5::uuid else $6::uuid end where id in ($1,$2,$7,$8)",[SA,SC,IA,IB,B,A,SB,SD]);
},60000);
afterAll(async () => { if(cluster) await cluster.stop(); },30000);
beforeEach(async () => { await db.query("begin"); });
afterEach(async () => { await db.query("rollback"); });

describe("M11 trusted attendance and academic years", () => {
  it("verifies ordinary closed attendance atomically and retries without a second audit",async () => {
    const row=await attendance();
    const [saved]=await verify(row);
    expect(saved.verified).toBe(true); expect(saved.verified_by).toBe(IA); expect(saved.verified_at).toBeTruthy();
    const count=(await db.query("select count(*) n from public.audit_logs")).rows[0].n;
    expect((await verify(row))[0].id).toBe(row.id);
    expect((await db.query("select count(*) n from public.audit_logs")).rows[0].n).toBe(count);
  });
  it.each([null,IB,SA])("denies verification by unassigned or non-staff actor %s",async (actor) => {
    await expect(verify(await attendance(),actor)).rejects.toThrow(/permission denied|not permitted/);
  });
  it("denies retained inactive staff and stale attendance evidence",async () => {
    const row=await attendance();
    await expect(verify({...row,hours:9})).rejects.toThrow(/changed/);
    // Unassign first, as required by the existing account lifecycle guard.
    await db.query("update public.interns set instructor_id=null where instructor_id=$1",[IA]);
    await db.query("update public.profiles set status='Inactive' where id=$1",[IA]);
    await expect(verify(row)).rejects.toThrow(/not permitted/);
    expect((await db.query("select verified from public.attendance_logs where id=$1",[row.id])).rows[0].verified).toBe(false);
  });
  it("rejects open attendance",async () => {
    await expect(verify(await attendance(true))).rejects.toThrow(/Closed trusted attendance/);
  });
  it("binds new records to the assigned year and preserves historical years on reassignment",async () => {
    await assign(YEAR);
    const row=await attendance(); expect(row.academic_year_id).toBe(YEAR);
    await assign(NEXT);
    expect((await verify(row))[0].academic_year_id).toBe(YEAR);
    await expect(act(ADMIN,"update public.attendance_logs set academic_year_id=$1 where id=$2",[NEXT,row.id])).rejects.toThrow(/permission denied/);
    await db.query("savepoint immutable");
    await expect(db.query("update public.attendance_logs set academic_year_id=$1 where id=$2",[NEXT,row.id])).rejects.toThrow(/immutable/);
    await db.query("rollback to savepoint immutable");
  });
  it("does not backfill legacy years and blocks year changes during an open session",async () => {
    const legacy=await attendance(); await assign(YEAR);
    expect((await db.query("select academic_year_id from public.attendance_logs where id=$1",[legacy.id])).rows[0].academic_year_id).toBeNull();
    await db.query("delete from public.attendance_logs where id=$1",[legacy.id]);
    await attendance(true);
    await expect(assign(NEXT)).rejects.toThrow(/Clock out/);
    expect((await db.query("select academic_year_id from public.interns where id=$1",[SA])).rows[0].academic_year_id).toBe(YEAR);
  });
  it("keeps one standard checklist per year without removing old evidence",async () => {
    await assign(YEAR);
    await act(ADMIN,"select public.attach_standard_docs($1)",[SA]);
    await act(ADMIN,"select public.attach_standard_docs($1)",[SA]);
    await assign(NEXT);
    await act(ADMIN,"select public.attach_standard_docs($1)",[SA]);
    const counts=(await db.query("select academic_year_id,count(*)::int n from public.documents group by academic_year_id order by academic_year_id")).rows;
    expect(counts).toEqual([{academic_year_id:YEAR,n:4},{academic_year_id:NEXT,n:4}]);
  });
  it("preserves Admin custom-requirement creation without granting raw intern updates",async()=>{
    await assign(YEAR);
    const [requirement]=await act(ADMIN,"insert into public.documents(intern_id,doc_type,name) values($1,'custom','Custom requirement') returning *",[SA]);
    expect(requirement.academic_year_id).toBe(YEAR);
    await expect(act(SA,"insert into public.documents(intern_id,doc_type,name) values($1,'forged','Forged requirement') returning *",[SA])).rejects.toThrow(/row-level/);
    await expect(act(ADMIN,"update public.interns set academic_year_id=$1 where id=$2",[NEXT,SA])).rejects.toThrow(/permission denied/);
  });
  it("preserves an existing attendance year through a correction after reassignment",async () => {
    await assign(YEAR); const row=await attendance(); await assign(NEXT);
    const [request]=await act(SA,"select * from public.submit_correction('2026-10-01','08:00:00','15:00:00','2026-10-01','Correct end time')");
    expect(request.academic_year_id).toBe(YEAR);
    await act(IA,"select * from public.review_exception($1,'Approved',null)",[request.id]);
    const saved=(await db.query("select * from public.attendance_logs where id=$1",[row.id])).rows[0];
    expect(saved.academic_year_id).toBe(YEAR); expect(Number(saved.hours)).toBe(7); expect(saved.verified).toBe(true);
  });
  it("prevents deletion of a referenced year",async () => {
    await assign(YEAR);
    await expect(act(ADMIN,"select public.admin_delete_master('academic_years',$1)",[YEAR])).rejects.toThrow(/in use/);
  });
  it("rolls back verification and announcement submission when mandatory audit fails",async()=>{
    const row=await attendance();
    await db.query(`create function public.synthetic_workflow_audit_fault() returns trigger language plpgsql as $$ begin raise exception 'Synthetic workflow audit failure'; end $$;
      create trigger synthetic_workflow_audit_fault before insert on public.audit_logs for each row execute function public.synthetic_workflow_audit_fault()`);
    await expect(verify(row)).rejects.toThrow(/Synthetic workflow audit failure/);
    await expect(announce()).rejects.toThrow(/Synthetic workflow audit failure/);
    expect((await db.query("select verified,verified_at from public.attendance_logs where id=$1",[row.id])).rows[0]).toEqual({verified:false,verified_at:null});
    expect((await db.query("select count(*)::int n from public.announcements")).rows[0].n).toBe(0);
    await db.query("drop trigger synthetic_workflow_audit_fault on public.audit_logs");
    expect((await announce())[0].recipient_ids).toEqual([SA]);
  });
});

describe("M12 section audience and retry identity", () => {
  it("snapshots only active assigned interns in the selected section and keeps other interns out",async () => {
    const [sent]=await announce();
    expect(sent.target).toBe("Section"); expect(sent.section_name).toBe("BSIT 4A"); expect(sent.recipient_ids).toEqual([SA]);
    expect(await act(SA,"select id from public.announcements")).toEqual([{id:sent.id}]);
    for (const actor of [SB,SC,SD]) expect(await act(actor,"select id from public.announcements")).toEqual([]);
    await db.query("update public.interns set section_id=$1 where id=$2",[B,SA]);
    expect((await act(SA,"select recipient_ids from public.announcements"))[0].recipient_ids).toEqual([SA]);
  });
  it("commits one announcement for a retry key and rejects changed content",async () => {
    const [first]=await announce(); const [second]=await announce(); expect(second.id).toBe(first.id);
    await expect(announce(IA,id(100),A,"Changed subject")).rejects.toThrow(/different content/);
    expect((await db.query("select count(*)::int n from public.announcements")).rows[0].n).toBe(1);
  });
  it("supports full-roster and personal snapshots without allowing caller-supplied recipients",async () => {
    expect((await announce(IA,id(101),null))[0].recipient_ids).toEqual([SA,SC]);
    expect((await act(IA,"select * from public.send_announcement('Personal','Message',$1,null,$2)",[SA,id(102)]))[0].recipient_ids).toEqual([SA]);
    await expect(act(IA,"insert into public.announcements(instructor_id,title,body) values($1,'Forged','Message')",[IA])).rejects.toThrow(/permission denied/);
    await expect(act(IA,"select * from public.send_announcement('Personal','Message',$1,null,$2)",[SB,id(103)])).rejects.toThrow(/No active assigned recipients/);
  });
  it.each([null,SA])("denies non-staff announcement submission %s",async (actor) => {
    await expect(announce(actor)).rejects.toThrow(/permission denied|Active staff/);
  });
});

async function actorTransaction(client,actor) {
  await client.query("begin");await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
}
async function waitForBlock(client,waiting,blocking) {
  for(let attempt=0;attempt<100;attempt++){
    const {rows}=await client.query("select $1::int=any(pg_blocking_pids($2)) blocked",[blocking.processID,waiting.processID]);
    if(rows[0].blocked)return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw new Error("Expected native database lock wait was not observed");
}

describe("M11 native verification races",()=>{
  it.each(["same record","assignment transfer"])("serializes %s before deciding verification authority",async(mode)=>{
    const control=await cluster.connect(),first=await cluster.connect(),second=await cluster.connect();
    let row,pending;
    try{
      row=(await control.query(`insert into public.attendance_logs(intern_id,log_date,time_in,time_out,clocked_in_at,clocked_out_at,hours)
        values($1,'2026-10-02','08:00:00','16:00:00','2026-10-02T00:00:00Z','2026-10-02T08:00:00Z',8) returning *`,[SA])).rows[0];
      const query="select * from public.verify_attendance($1,$2,$3,$4)",args=[row.id,row.clocked_in_at,row.clocked_out_at,row.hours];
      await actorTransaction(first,mode==="same record"?IA:ADMIN);
      if(mode==="same record")await first.query(query,args);
      else await first.query("select * from public.admin_set_assignment($1,$2,null,$3,486)",[SA,IB,A]);
      await actorTransaction(second,IA);
      pending=second.query(query,args).then(result=>({result}),error=>({error}));
      await waitForBlock(control,second,first);
      await first.query("commit");
      const outcome=await pending;
      if(mode==="same record"){
        expect(outcome.error).toBeUndefined();expect(outcome.result.rows[0].verified).toBe(true);
        await second.query("commit");
        const count=(await control.query("select count(*)::int n from public.audit_logs where event_data->>'record_id'=$1 and event_data->>'operation'='UPDATE'",[row.id])).rows[0].n;
        expect(count).toBe(1);
      }else{
        expect(outcome.error?.message).toContain("Assignment changed");await second.query("rollback");
        expect((await control.query("select verified from public.attendance_logs where id=$1",[row.id])).rows[0].verified).toBe(false);
      }
    }finally{
      await first.query("rollback");await second.query("rollback");if(pending)await pending;
      if(row)await control.query("delete from public.attendance_logs where id=$1",[row.id]);
      await control.query("update public.interns set instructor_id=$1 where id=$2",[IA,SA]);
      await first.end();await second.end();await control.end();
    }
  },15000);
});

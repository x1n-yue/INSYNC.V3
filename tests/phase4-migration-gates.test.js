import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
const sql=f=>readFileSync(new URL(`../supabase/${f}`,import.meta.url),"utf8");
const uid="00000000-0000-4000-8000-000000000004";
async function fixture() {
 const db=new PGlite(); await db.exec(sql("tests/baseline.sql"));
 for(const f of ["M01_authority.sql","M02_trusted_audit.sql","M03_attendance_integrity.sql","M04_private_documents_bucket.sql"])await db.exec(sql(`migrations/${f}`));
 await db.query("insert into auth.users(id,email) values($1,'synthetic@example.invalid')",[uid]);return db;
}
describe("M06-M10 explicit legacy review gates",()=>{
 it.each(["hours","rubric"])("retains invalid %s history, enforces new writes and blocks M09 validation",async(kind)=>{
  const db=await fixture();try {
   if(kind==="hours")await db.query("update public.interns set required_hours=-1 where id=$1",[uid]);
   else await db.query("insert into public.evaluations(intern_id,competencies,overall_score) values($1,'{}',null)",[uid]);
   const table=kind==="hours"?"interns":"evaluations";
   const before=(await db.query(`select * from public.${table}`)).rows;
   await db.exec(sql("inspection/04_phase4_domain.sql"));
   for(const f of ["M06_rubric_hours.sql","M07_account_lifecycle.sql","M08_document_versions.sql"])await db.exec(sql(`migrations/${f}`));
   const after=(await db.query(`select * from public.${table}`)).rows;
   for(const row of before)expect(after.find(r=>r.id===row.id)).toMatchObject(row);
   await expect(db.exec(sql("migrations/M09_validate_domain.sql"))).rejects.toThrow(/m06_/);await db.exec("rollback");
   expect((await db.query("select convalidated from pg_constraint where conname in ('m06_required_hours','m06_evaluation_rubric')")).rows.every(r=>!r.convalidated)).toBe(true);
   expect((await db.query("select attnotnull from pg_attribute where attrelid='public.evaluations'::regclass and attname='overall_score'")).rows[0].attnotnull).toBe(false);
  }finally{await db.close();}
 },30000);
 it("duplicate requirements stop M08 without canonical-row selection or object changes",async()=>{
  const db=await fixture();try{
   await db.query("insert into public.documents(intern_id,doc_type,name) values($1,'moa','First'),($1,'moa','Second')",[uid]);
   await db.exec(sql("migrations/M06_rubric_hours.sql"));await db.exec(sql("migrations/M07_account_lifecycle.sql"));
   const before=(await db.query("select * from public.documents order by id")).rows;
   await expect(db.exec(sql("migrations/M08_document_versions.sql"))).rejects.toThrow(/Duplicate requirements/);await db.exec("rollback");
   expect((await db.query("select * from public.documents order by id")).rows).toEqual(before);
   expect((await db.query("select to_regclass('public.document_versions') name")).rows[0].name).toBeNull();
  }finally{await db.close();}
 },30000);
 it("incompatible role assignment stops M07, leaving rows and prior grants unchanged",async()=>{
  const db=await fixture();try{
   await db.query("update public.interns set instructor_id=$1 where id=$1",[uid]);
   await db.exec(sql("migrations/M06_rubric_hours.sql"));
   await expect(db.exec(sql("migrations/M07_account_lifecycle.sql"))).rejects.toThrow(/Legacy role\/assignment/);await db.exec("rollback");
   expect((await db.query("select instructor_id from public.interns where id=$1",[uid])).rows[0].instructor_id).toBe(uid);
   expect((await db.query("select has_table_privilege('authenticated','public.interns','UPDATE') allowed")).rows[0].allowed).toBe(true);
  }finally{await db.close();}
 },30000);
});

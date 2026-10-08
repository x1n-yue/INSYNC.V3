import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const sql=(file)=>readFileSync(new URL(`../supabase/${file}`,import.meta.url),"utf8");
const ID="00000000-0000-4000-8000-000000000004";
async function legacyFixture() {
  const db=new PGlite();
  await db.exec(sql("tests/baseline.sql"));
  await db.exec(sql("migrations/M01_authority.sql"));
  await db.exec(sql("migrations/M02_trusted_audit.sql"));
  await db.query("insert into auth.users(id,email) values($1,'synthetic@example.invalid')",[ID]);
  return db;
}
describe("M03/M05: legacy data is never automatically repaired",()=>{
  it.each(["daily","open","pending"])("blocks %s uniqueness without deleting, merging or backfilling rows",async(kind)=>{
    const db=await legacyFixture();
    try {
      if(kind==="pending") await db.query("insert into public.attendance_exceptions(intern_id,log_date,reason) values($1,'2020-01-02','Legacy'),($1,'2020-01-02','Legacy')",[ID]);
      else await db.query(`insert into public.attendance_logs(intern_id,log_date,time_in,time_out,hours) values
        ($1,'2020-01-02','08:00',${kind==="open" ? "null,null" : "'16:00',8"}),
        ($1,'${kind==="open" ? "2020-01-03" : "2020-01-02"}','08:00',${kind==="open" ? "null,null" : "'16:00',8"})`,[ID]);
      const table=kind==="pending" ? "attendance_exceptions" : "attendance_logs";
      const before=(await db.query(`select * from public.${table} order by id`)).rows;
      await expect(db.exec(sql("migrations/M03_attendance_integrity.sql"))).rejects.toThrow(/Duplicate daily\/open\/Pending/);
      await db.exec("rollback");
      expect((await db.query(`select * from public.${table} order by id`)).rows).toEqual(before);
      expect((await db.query("select * from pg_constraint where conname='m03_daily_identity'")).rows).toHaveLength(0);
    } finally { await db.close(); }
  },30000);
  it("installs NOT VALID checks while retaining an ambiguous legacy interval; historical validation stops",async()=>{
    const db=await legacyFixture();
    try {
      await db.query("insert into public.attendance_logs(intern_id,log_date,time_in,time_out,hours) values($1,'2020-01-02','23:00','01:00',0)",[ID]);
      const before=(await db.query("select * from public.attendance_logs")).rows;
      await db.exec(sql("migrations/M03_attendance_integrity.sql"));
      expect((await db.query("select convalidated from pg_constraint where conname='m03_attendance_interval'")).rows[0].convalidated).toBe(false);
      expect((await db.query("select * from public.attendance_logs")).rows).toEqual(before);
      await expect(db.exec(sql("migrations/M05_validate_attendance.sql"))).rejects.toThrow(/m03_attendance_interval/);
      await db.exec("rollback");
      expect((await db.query("select * from public.attendance_logs")).rows).toEqual(before);
      expect((await db.query("select convalidated from pg_constraint where conname='m03_attendance_interval'")).rows[0].convalidated).toBe(false);
      // All added inspection queries are read-only and executable after M02.
      await db.exec(sql("inspection/03_phase2_attendance.sql"));
    } finally { await db.close(); }
  },30000);
  it("missing documents bucket aborts configuration instead of fabricating a replacement",async()=>{
    const db=await legacyFixture();
    try {
      await db.exec("delete from storage.buckets where id='documents'");
      await expect(db.exec(sql("migrations/M04_private_documents_bucket.sql"))).rejects.toThrow(/Expected existing/);
      await db.exec("rollback");
      expect((await db.query("select * from storage.buckets where id='documents'")).rows).toHaveLength(0);
    } finally { await db.close(); }
  },30000);
  it.each(["future","unreconciled"])("historical validation independently stops on %s legacy evidence",async(kind)=>{
    const db=await legacyFixture();
    try {
      if(kind==="future") await db.query(`insert into public.attendance_logs(intern_id,log_date,time_in,time_out,clocked_in_at,clocked_out_at,hours)
        values($1,'2099-01-02','08:00','09:00','2099-01-02 08:00+08','2099-01-02 09:00+08',1)`,[ID]);
      else await db.query(`insert into public.attendance_exceptions(intern_id,log_date,claimed_time_in,claimed_time_out,claimed_end_date,reason,status,reviewed_by,reviewed_at)
        values($1,'2020-01-02','08:00','16:00','2020-01-02','Legacy','Approved',$1,'2020-01-03')`,[ID]);
      await db.exec(sql("migrations/M03_attendance_integrity.sql"));
      await expect(db.exec(sql("migrations/M05_validate_attendance.sql"))).rejects.toThrow(kind==="future" ? /Future legacy/ : /lacks verified attendance/);
      await db.exec("rollback");
      const table=kind==="future" ? "attendance_logs" : "attendance_exceptions";
      expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(1);
    } finally { await db.close(); }
  },30000);
});

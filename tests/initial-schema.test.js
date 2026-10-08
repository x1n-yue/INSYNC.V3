import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const sql = (name) => readFileSync(new URL(`../supabase/${name}`, import.meta.url), "utf8");
async function providerFixture() {
  const db = new PGlite();
  // Only provider test doubles; the actual application catalog comes from the new SQL.
  const provider = sql("tests/baseline.sql").split("create table public.companies")[0]
    .replace("insert into storage.buckets(id,public) values('documents',false),('other',false);", "")
    .replace("create table storage.buckets(id text primary key,", "create table storage.buckets(id text primary key,name text,");
  await db.exec(provider);
  return db;
}

describe("fresh Supabase initial schema", () => {
  it("starts closed and seed-free, accepts M01-M12, and creates Pending interns", async () => {
    const db = await providerFixture();
    try {
      await db.exec(sql("initial_schema.sql"));
      const tables = (await db.query("select tablename from pg_tables where schemaname='public'")).rows;
      expect(tables).toHaveLength(12);
      for (const { tablename } of tables) {
        expect((await db.query(`select count(*)::int as n from public.${tablename}`)).rows[0].n).toBe(0);
        expect((await db.query("select has_table_privilege('authenticated',$1,'SELECT') allowed", [`public.${tablename}`])).rows[0].allowed).toBe(false);
      }
      await expect(db.exec("insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','test@example.invalid')"))
        .rejects.toThrow(/setup incomplete/);
      for (const migration of ["M01_authority.sql", "M02_trusted_audit.sql", "M03_attendance_integrity.sql", "M04_private_documents_bucket.sql", "M05_validate_attendance.sql", "M06_rubric_hours.sql", "M07_account_lifecycle.sql", "M08_document_versions.sql", "M09_validate_domain.sql", "M10_master_data_lifecycle.sql", "M11_attendance_year_workflows.sql", "M12_section_announcements.sql"]) {
        await db.exec(sql(`migrations/${migration}`));
      }
      await db.exec("insert into auth.users(id,email,raw_user_meta_data) values('00000000-0000-4000-8000-000000000001','test@example.invalid','{\"role\":\"admin\"}')");
      expect((await db.query("select role,status from public.profiles")).rows).toEqual([{ role: "intern", status: "Pending" }]);
      expect((await db.query("select count(*)::int n from public.interns")).rows[0].n).toBe(1);
      // Exercise the exact operator instructions too, including their repeat guard.
      await db.exec("alter table auth.users add column email_confirmed_at timestamptz; update auth.users set email_confirmed_at=now()");
      const guide = readFileSync(new URL("../WEB_SETUP.md", import.meta.url), "utf8");
      const bootstrap = guide.match(/```sql\n([\s\S]*?)```/)[1]
        .replace("YOUR-VERIFIED-AUTH-UUID", "00000000-0000-4000-8000-000000000001");
      await db.exec(bootstrap);
      expect((await db.query("select role,status from public.profiles")).rows).toEqual([{ role: "admin", status: "Active" }]);
      await expect(db.exec(bootstrap)).rejects.toThrow(/Active Admin already exists/);
      await db.exec("rollback");
    } finally { await db.close(); }
  }, 30000);

  it.each(["table", "account", "bucket"])("refuses existing %s without altering it", async (kind) => {
    const db = await providerFixture();
    try {
      if (kind === "table") await db.exec("create table public.companies(id int); insert into public.companies values(7)");
      if (kind === "account") await db.exec("insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000002','existing@example.invalid')");
      if (kind === "bucket") await db.exec("insert into storage.buckets(id,public) values('documents',true)");
      await expect(db.exec(sql("initial_schema.sql"))).rejects.toThrow(/already exist/);
      await db.exec("rollback");
      expect((await db.query("select to_regclass('public.profiles') name")).rows[0].name).toBeNull();
      if (kind === "table") expect((await db.query("select id from public.companies")).rows).toEqual([{ id: 7 }]);
      if (kind === "account") expect((await db.query("select count(*)::int n from auth.users")).rows[0].n).toBe(1);
      if (kind === "bucket") expect((await db.query("select public from storage.buckets where id='documents'")).rows[0].public).toBe(true);
    } finally { await db.close(); }
  }, 30000);
});

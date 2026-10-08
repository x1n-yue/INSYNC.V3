import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Actual Postgres engine; all persistence is in memory. Synthetic auth.uid and
// storage metadata are doubles, not a live Supabase Auth/Storage/API service.
const sql = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = uuid(1), IA = uuid(2), IB = uuid(3), SA = uuid(4), SB = uuid(5), SC = uuid(6);
const roles = ["admin", "instructor", "intern"];
const statuses = ["Active", "Pending", "Inactive"];
const scopes = ["own", "assigned", "foreign"];
const tables = ["profiles", "interns", "companies", "course_sections", "academic_years", "attendance_logs",
  "attendance_exceptions", "evaluations", "documents", "announcements", "alerts", "audit_logs", "storage.objects"];
const actors = [];
for (const [ri, role] of roles.entries()) for (const [si, status] of statuses.entries()) {
  actors.push({ role, status, id: si === 0 ? [A, IA, SA][ri] : uuid(20 + ri * 3 + si) });
}
actors.push({ role: "anonymous", status: "N/A", id: null }, { role: "missing-profile", status: "N/A", id: uuid(99) });
let db;

async function actorRun(actor, work, setup) {
  await db.exec("begin");
  if (setup) await setup();
  await db.exec(`set local role ${actor.role === "anonymous" ? "anon" : "authenticated"};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor.id ?? ""]);
  try { return await work(); } finally { await db.exec("rollback"); }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql("supabase/tests/baseline.sql"));
  await db.exec(sql("supabase/migrations/M01_authority.sql"));
  for (const actor of [...actors.filter((a) => roles.includes(a.role)),
    { id: IB, role: "instructor", status: "Active" }, { id: SB, role: "intern", status: "Active" },
    { id: SC, role: "intern", status: "Active" }]) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [actor.id, `${actor.id}@example.invalid`]);
    await db.query("update public.profiles set role=$2,status=$3,full_name='Synthetic Duplicate Name' where id=$1", [actor.id, actor.role, actor.status]);
  }
  await db.query("update public.interns set instructor_id=$1 where id=$2", [IA, SA]);
  await db.query("update public.interns set instructor_id=$1 where id=$2", [IB, SB]);
  const people = [...new Set([...actors.filter((a) => roles.includes(a.role)).map((a) => a.id), IB, SB, SC])];
  for (const person of people) {
    for (const table of ["companies", "course_sections"]) await db.query(`insert into public.${table}(id,name) values($1,$2)`, [person, person]);
    await db.query("insert into public.academic_years(id,label) values($1,$2)", [person, person]);
    await db.query("insert into public.attendance_logs(id,intern_id,log_date,time_in) values($1,$1,'2020-01-01','08:00')", [person]);
    await db.query("insert into public.attendance_exceptions(id,intern_id,log_date,claimed_time_in,claimed_time_out,claimed_end_date,reason) values($1,$1,'2020-01-01','08:00','17:00','2020-01-01','synthetic')", [person]);
    await db.query("insert into public.documents(id,intern_id,doc_type,name,file_path,file_name) values($1,$1,'moa','Synthetic MOA',$2,'synthetic.pdf')", [person, `${person}/synthetic.pdf`]);
    await db.query("insert into public.evaluations(id,intern_id,evaluator_id,overall_score) values($1,$1,$2,75)", [person, person === SB ? IB : IA]);
    await db.query("insert into public.alerts(id,intern_id,type,detail) values($1,$1,'synthetic','synthetic')", [person]);
    await db.query("insert into public.audit_logs(id,actor_id,action) values($1,$1,'synthetic')", [person]);
    await db.query("insert into storage.objects(id,bucket_id,name) values($1,'documents',$2)", [person, `${person}/synthetic.pdf`]);
  }
  // Announcement trigger enforces real author context even in fixtures.
  await actorRun({ role: "instructor", id: IA }, async () => {
    // Rolled back; actual persistent messages seeded with same trusted auth context below.
    expect((await db.query("select public.current_role() as role")).rows[0].role).toBe("instructor");
  });
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [IA]);
  await db.query("insert into public.announcements(id,instructor_id,title,body,target,target_intern_id) values($1,$2,'A','synthetic','Personal',$3)", [SA, IA, SA]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [IB]);
  await db.query("insert into public.announcements(id,instructor_id,title,body,target,target_intern_id) values($1,$2,'B','synthetic','Personal',$3)", [SB, IB, SB]);
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  // Additional legacy messages for every status/role, including duplicate names.
  // Only trusted synthetic setup disables binding; no migration disables RLS.
  await db.exec("alter table public.announcements disable trigger m01_announcement_audience");
  for (const person of people.filter((p) => ![SA, SB].includes(p))) {
    const account = actors.find((a) => a.id === person);
    const author = account?.role === "intern" ? IA : person;
    await db.query("insert into public.announcements(id,instructor_id,title,body,target,target_intern_id,recipient_ids) values($1,$2,'Legacy','Synthetic','Personal',$1,array[$1]::uuid[])", [person, author]);
  }
  await db.exec("alter table public.announcements enable trigger m01_announcement_audience");
}, 30000);
afterAll(async () => { if (db) await db.close(); });

// Every role/status/scope/operation gets a real SQL case. Reference data uses N/A
// ownership semantics; profile/announcement scope is translated explicitly.
function targetFor(actor, scope) {
  if (scope === "foreign") return SB;
  if (scope === "assigned") return SA;
  return actor.id ?? SC;
}
function expected(actor, table, op, scope) {
  const active = actor.status === "Active";
  if (!active) return false;
  const admin = actor.role === "admin";
  const assigned = actor.role === "instructor" && scope === "assigned";
  const own = actor.role === "intern" && ["own", "assigned"].includes(scope);
  if (op === "select") {
    if (["companies", "course_sections", "academic_years"].includes(table)) return true;
    if (table === "profiles") return admin || scope === "own" || assigned || own;
    if (table === "interns") return admin || assigned || own;
    if (table === "alerts") return admin || assigned;
    if (table === "audit_logs") return admin;
    if (table === "announcements") return admin || assigned || own || (actor.role === "instructor" && scope === "own");
    if (table === "storage.objects") return admin || assigned || own;
    return admin || assigned || own;
  }
  if (["companies", "course_sections", "academic_years", "interns"].includes(table)) return admin;
  if (table === "profiles") return op === "update" && (admin || scope === "own" || own);
  if (table === "documents") return op === "insert" && admin;
  if (table === "evaluations") return op === "insert" && (admin || assigned);
  if (table === "announcements") return op === "insert" && actor.role === "instructor" && ["own", "assigned"].includes(scope);
  if (table === "alerts") return admin || (op === "update" && assigned);
  if (table === "audit_logs") return op === "insert" && admin;
  if (table === "storage.objects") return op === "insert" && own;
  return false; // raw clock/review writes denied, including Admin.
}
function statement(actor, table, op, scope) {
  const target = targetFor(actor, scope);
  const name = table.includes(".") ? table : `public.${table}`;
  // Reference row and owner domain row IDs are aligned in synthetic fixtures.
  let id = target;
  if (table === "announcements") id = scope === "foreign" ? SB : scope === "own" ? actor.id ?? SC : SA;
  if (op === "select") return [`select * from ${name} where id=$1`, [id]];
  if (op === "delete") return [`delete from ${name} where id=$1 returning id`, [id]];
  if (op === "update") {
    const fields = { profiles: "full_name='Changed'", interns: "required_hours=100", companies: "name='Changed'",
      course_sections: "name='Changed'", academic_years: "label='Changed'", attendance_logs: "hours=999",
      attendance_exceptions: "status='Approved'", evaluations: "overall_score=100", documents: "status='Approved'",
      announcements: "body='Changed'", alerts: "dismissed=true", audit_logs: "action='Changed'", "storage.objects": "name='changed'" };
    return [`update ${name} set ${fields[table]} where id=$1 returning id`, [id]];
  }
  const newId = uuid(500);
  const insert = {
    profiles: ["(id,full_name,email,role,status) values($1,'Synthetic','x@example.invalid','intern','Pending')", [newId]],
    interns: ["(id) values($1)", [uuid(99)]], // missing profile FK, use delete/reinsert below for Admin.
    companies: ["(id,name) values($1,'New Synthetic')", [newId]],
    course_sections: ["(id,name) values($1,'New Synthetic')", [newId]],
    academic_years: ["(id,label) values($1,'New Synthetic')", [newId]],
    attendance_logs: ["(intern_id) values($1)", [target]],
    attendance_exceptions: ["(intern_id,log_date,reason) values($1,'2020-01-02','Synthetic')", [target]],
    evaluations: ["(intern_id,evaluator_id) values($1,$2)", [target, actor.id ?? SC]],
    documents: ["(intern_id,doc_type,name) values($1,'extra','Synthetic')", [target]],
    announcements: ["(instructor_id,title,body,target,target_intern_id) values($1,'New','Synthetic','Personal',$2)", [actor.id ?? SC, scope === "own" ? SA : target]],
    alerts: ["(intern_id,type,detail) values($1,'Synthetic','Synthetic')", [target]],
    audit_logs: ["(actor_id,action) values($1,'Synthetic')", [actor.id ?? SC]],
    "storage.objects": ["(bucket_id,name) values('documents',$1)", [`${target}/new-synthetic.pdf`]],
  }[table];
  return [`insert into ${name} ${insert[0]} returning id`, insert[1]];
}

describe("M01 RT-03/04: all tables x callers x scopes x raw CRUD", () => {
  for (const actor of actors) for (const table of tables) for (const scope of scopes) for (const op of ["select", "insert", "update", "delete"]) {
    it(`${actor.role}/${actor.status} ${scope} ${table} ${op}`, async () => {
      let changed = false;
      let failure;
      try {
        changed = await actorRun(actor, async () => {
          if (table === "interns" && op === "insert" && actor.status === "Active" && actor.role === "admin") {
            await db.query("delete from public.interns where id=$1", [SC]);
            return (await db.query("insert into public.interns(id) values($1) returning id", [SC])).rows.length > 0;
          }
          const [query, params] = statement(actor, table, op, scope);
          return (await db.query(query, params)).rows.length > 0;
        });
      } catch (error) { failure = error; }
      const allow = expected(actor, table, op, scope);
      if (allow && failure) throw failure;
      expect(changed).toBe(allow);
      // A denial is either privilege/RLS error or a filtered zero-row write/read.
      if (failure) expect(["42501", "P0001"]).toContain(failure.code);
    });
  }
});

describe("M01 RT-01/02: authority and limited profiles", () => {
  it.each([{}, { role: "admin" }, { role: "instructor", requested_role: "admin" }, { role: "ADMIN" }, { requested_role: "invalid" }])(
    "signup metadata cannot select effective authority: %j", async (metadata) => {
      await db.exec("begin");
      try {
        await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'signup@example.invalid',$2)", [uuid(600), metadata]);
        expect((await db.query("select role,status from public.profiles where id=$1", [uuid(600)])).rows).toEqual([{ role: "intern", status: "Pending" }]);
        expect((await db.query("select id from public.interns where id=$1", [uuid(600)])).rows).toHaveLength(1);
        await db.query("update auth.users set raw_user_meta_data=$2 where id=$1", [uuid(600), { role: "admin" }]);
        expect((await db.query("select role from public.profiles where id=$1", [uuid(600)])).rows[0].role).toBe("intern");
      } finally { await db.exec("rollback"); }
    },
  );
  for (const actor of actors.filter((a) => roles.includes(a.role) && !(a.role === "admin" && a.status === "Active"))) {
    for (const field of ["role='admin'", "status='Inactive'", `id='${uuid(99)}'`, "email='forged@example.invalid'", "student_id='forged'", "organization='forged'", "requested_role='admin'", "created_at='2000-01-01'"]) {
      it(`${actor.role}/${actor.status} cannot tamper ${field}`, async () => {
        await actorRun(actor, async () => {
          try {
            const result = await db.query(`update public.profiles set ${field} where id=$1 returning id`, [actor.id]);
            expect(result.rows).toHaveLength(0);
          } catch (error) { expect(error.code).toBe("42501"); }
        });
        const stored = (await db.query("select role,status,email,student_id,organization,requested_role from public.profiles where id=$1", [actor.id])).rows[0];
        expect(stored.role).toBe(actor.role);
        expect(stored.status).toBe(actor.status);
        expect(stored.email).toBe(`${actor.id}@example.invalid`);
        expect(stored.student_id).toBeNull();
      });
    }
  }
  it("Pending/Inactive callers receive only own id/status through my_profile", async () => {
    for (const actor of actors.filter((a) => ["Pending", "Inactive"].includes(a.status))) {
      await actorRun(actor, async () => {
        expect((await db.query("select public.my_profile() as profile")).rows[0].profile).toEqual({ id: actor.id, status: actor.status });
        expect((await db.query("select * from public.profiles")).rows).toEqual([]);
        expect((await db.query("select public.current_role() as role")).rows[0].role).toBeNull();
      });
    }
  });
  it("intern joins use restricted names without exposing staff profile fields", async () => {
    await actorRun({ role: "intern", id: SA }, async () => {
      expect((await db.query("select * from public.profiles")).rows.map((p) => p.id)).toEqual([SA]);
      const names = (await db.query("select * from public.related_profile_names($1)", [[IA, IB, SA, SB]])).rows;
      expect(names.map((n) => n.id).sort()).toEqual([IA, SA].sort());
      expect(Object.keys(names[0]).sort()).toEqual(["full_name", "id"]);
    });
    await actorRun({ role: "instructor", id: IA }, async () => {
      const joined = (await db.query("select i.id,p.full_name from public.interns i left join public.profiles p on p.id=i.id")).rows;
      expect(joined).toEqual([{ id: SA, full_name: "Synthetic Duplicate Name" }]);
    });
  });
  it("retained identity loses business and Storage access immediately after deactivation", async () => {
    await db.exec("begin");
    try {
      await db.query("update public.profiles set status='Inactive' where id=$1", [IA]);
      await db.exec("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [IA]);
      expect((await db.query("select * from public.attendance_logs")).rows).toEqual([]);
      expect((await db.query("select * from storage.objects where bucket_id='documents'")).rows).toEqual([]);
    } finally { await db.exec("rollback"); }
  });
});

describe("M01 RT-02/03/04: field tampering and controlled operations", () => {
  const owner = { role: "intern", status: "Active", id: SA };
  const teacher = { role: "instructor", status: "Active", id: IA };
  const admin = { role: "admin", status: "Active", id: A };
  const ownerCalls = [
    ["select public.clock_in()", []],
    ["select public.clock_out($1,'synthetic')", [SA]],
    ["select public.submit_correction('2020-01-02','08:00','17:00','2020-01-02','synthetic')", []],
    ["select public.submit_document_upload($1,$2,'synthetic.pdf')", [SA, `${SA}/synthetic.pdf`]],
  ];
  for (const actor of actors.filter((a) => a.role !== "intern" || a.status !== "Active")) {
    for (const [query, params] of ownerCalls) it(`${actor.role}/${actor.status} owner RPC ${query}`, async () => {
      await expect(actorRun(actor, () => db.query(query, params))).rejects.toMatchObject({ code: "42501" });
    });
  }
  for (const actor of actors.filter((a) => a.status !== "Active" || a.role === "intern")) {
    for (const [query, params] of [
      ["select public.review_exception($1,'Approved')", [SA]],
      ["select public.review_document($1,'Approved',null,$2)", [SA, `${SA}/synthetic.pdf`]],
    ]) it(`${actor.role}/${actor.status} review RPC denial ${query}`, async () => {
      await expect(actorRun(actor, () => db.query(query, params))).rejects.toMatchObject({ code: "42501" });
    });
  }
  for (const [table, fields] of [
    ["attendance_logs", ["intern_id", "hours", "verified", "verified_by", "time_in", "time_out", "log_date"]],
    ["attendance_exceptions", ["intern_id", "status", "reviewed_by", "claimed_time_in", "log_date"]],
    ["documents", ["intern_id", "status", "note", "reviewed_by", "doc_type", "file_path"]],
    ["evaluations", ["intern_id", "evaluator_id"]],
  ]) for (const field of fields) for (const actor of [owner, teacher, admin]) {
    it(`${actor.role} cannot raw-write ${table}.${field}`, async () => {
      await expect(actorRun(actor, () => db.query(`update public.${table} set ${field}=${field} where id=$1 returning id`, [SA])))
        .rejects.toMatchObject({ code: "42501" });
    });
  }
  it("instructor cannot change roster configuration or alert ownership", async () => {
    for (const assignment of ["required_hours=1", "company_id=null", "section_id=null", `instructor_id='${IB}'`, `id='${SC}'`]) {
      await actorRun(teacher, async () => {
        expect((await db.query(`update public.interns set ${assignment} where id=$1 returning id`, [SA])).rows).toEqual([]);
      });
    }
    await expect(actorRun(teacher, () => db.query("update public.alerts set intern_id=$2 where id=$1 returning id", [SA, SB])))
      .rejects.toMatchObject({ code: "42501" });
  });
  it("evaluation insert binds author and assigned intern independently of UI", async () => {
    await expect(actorRun(teacher, () => db.query("insert into public.evaluations(intern_id,evaluator_id) values($1,$2)", [SA, IB])))
      .rejects.toMatchObject({ code: "42501" });
    await expect(actorRun(teacher, () => db.query("insert into public.evaluations(intern_id,evaluator_id) values($1,$2)", [SB, IA])))
      .rejects.toMatchObject({ code: "42501" });
  });
  it("clock RPC derives owner/date/start and blocks duplicate/repeated transitions", async () => {
    await actorRun(owner, async () => {
      const r = (await db.query("select to_jsonb(public.clock_in()) as row")).rows[0].row;
      expect(r.intern_id).toBe(SA);
      expect(r.verified).toBe(false);
      expect(r.verified_by).toBeNull();
      expect(r.hours).toBeNull();
      const day = (await db.query("select (clock_timestamp() at time zone 'Asia/Manila')::date::text as day")).rows[0].day;
      expect(r.log_date).toBe(day);
      expect((await db.query("select clocked_in_at is not null as instant from public.attendance_logs where id=$1", [r.id])).rows[0].instant).toBe(true);
      await expect(db.query("select public.clock_in()")).rejects.toMatchObject({ code: "40001" });
    }, () => db.query("delete from public.attendance_logs where intern_id=$1", [SA]));
  });
  it("clock-out derives actual elapsed hours independent of business date, and never rewrites closure", async () => {
    await actorRun(owner, async () => {
      const r = (await db.query("select to_jsonb(public.clock_out($1,'saved draft')) as row", [SA])).rows[0].row;
      expect(r.hours).toBeCloseTo(8, 2);
      expect(r.accomplishment).toBe("saved draft");
      expect(r.verified).toBe(false);
      expect(r.clocked_out_at).toBeTruthy();
      await expect(db.query("select public.clock_out($1,'overwrite')", [SA])).rejects.toMatchObject({ code: "40001" });
    }, () => db.query("update public.attendance_logs set clocked_in_at=clock_timestamp()-interval '8 hours' where id=$1", [SA]));
  });
  it("owner cannot close foreign, verified or legacy time-only attendance", async () => {
    for (const id of [SA, SB]) await expect(actorRun(owner, () => db.query("select public.clock_out($1,'synthetic')", [id])))
      .rejects.toMatchObject({ code: "40001" });
    await expect(actorRun(owner, () => db.query("select public.clock_out($1,'synthetic')", [SA]),
      () => db.query("update public.attendance_logs set verified=true,clocked_in_at=clock_timestamp()-interval '1 hour' where id=$1", [SA])))
      .rejects.toMatchObject({ code: "40001" });
  });
  it("correction starts Pending with trusted owner and no reviewer; duplicate conflicts", async () => {
    await actorRun(owner, async () => {
      const r = (await db.query("select to_jsonb(public.submit_correction('2020-01-02','22:00','06:00','2020-01-03','synthetic')) as row")).rows[0].row;
      expect(r).toMatchObject({ intern_id: SA, status: "Pending", reviewed_by: null, claimed_end_date: "2020-01-03" });
      await expect(db.query("select public.submit_correction('2020-01-02','08:00','09:00','2020-01-02','again')"))
        .rejects.toMatchObject({ code: "40001" });
    });
  });
  it("atomic review derives hours/verifier; rejects foreign staff", async () => {
    await actorRun(teacher, async () => {
      const r = (await db.query("select to_jsonb(public.review_exception($1,'Approved')) as row", [SA])).rows[0].row;
      expect(r).toMatchObject({ status: "Approved", reviewed_by: IA });
      const a = (await db.query("select hours::float,verified,verified_by from public.attendance_logs where id=$1", [SA])).rows[0];
      expect(a).toEqual({ hours: 9, verified: true, verified_by: IA });
      await expect(db.query("select public.review_exception($1,'Rejected')", [SA])).rejects.toMatchObject({ code: "40001" });
    });
    await expect(actorRun(teacher, () => db.query("select public.review_exception($1,'Approved')", [SB])))
      .rejects.toMatchObject({ code: "42501" });
  });
  it("overnight review credits 8 hours; second precision is preserved", async () => {
    await actorRun(teacher, async () => {
      await db.query("select public.review_exception($1,'Approved')", [SA]);
      expect((await db.query("select hours::float from public.attendance_logs where id=$1", [SA])).rows[0].hours).toBe(8);
    }, () => db.query("update public.attendance_exceptions set claimed_time_in='22:00:01',claimed_time_out='06:00:01',claimed_end_date='2020-01-02' where id=$1", [SA]));
  });
  it("a one-second correction is derived without minute truncation", async () => {
    await actorRun(teacher, async () => {
      await db.query("select public.review_exception($1,'Approved')", [SA]);
      expect((await db.query("select hours::float from public.attendance_logs where id=$1", [SA])).rows[0].hours).toBeCloseTo(1 / 3600, 10);
    }, () => db.query("update public.attendance_exceptions set claimed_time_in='08:00:59',claimed_time_out='08:01:00' where id=$1", [SA]));
  });
  it("future same-day corrections and empty/overlong reasons are independently rejected", async () => {
    for (const [day, reason] of [["2999-01-01", "synthetic"], ["2020-01-02", " "], ["2020-01-02", "x".repeat(501)]]) {
      await expect(actorRun(owner, () => db.query("select public.submit_correction($1,'08:00','09:00',$1,$2)", [day, reason])))
        .rejects.toMatchObject({ code: "P0001" });
    }
  });
  it("document revision notes must be nonempty and <=500 characters", async () => {
    for (const note of [" ", "x".repeat(501)]) await expect(actorRun(teacher,
      () => db.query("select public.review_document($1,'Needs Revision',$2,$3)", [SA, note, `${SA}/synthetic.pdf`])))
      .rejects.toMatchObject({ code: "P0001" });
  });
  it.each([
    ["08:00", "08:00", "2020-01-01"], ["17:00", "08:00", "2020-01-01"],
    ["08:00", "01:00", "2020-01-02"], ["08:00", "09:00", "2999-01-01"],
  ])("invalid correction interval %s-%s/%s leaves Pending attendance unchanged", async (start, end, endDate) => {
    await expect(actorRun(teacher, () => db.query("select public.review_exception($1,'Approved')", [SA]),
      () => db.query("update public.attendance_exceptions set claimed_time_in=$2,claimed_time_out=$3,claimed_end_date=$4 where id=$1", [SA, start, end, endDate])))
      .rejects.toMatchObject({ code: "P0001" });
    expect((await db.query("select status from public.attendance_exceptions where id=$1", [SA])).rows[0].status).toBe("Pending");
    expect((await db.query("select verified from public.attendance_logs where id=$1", [SA])).rows[0].verified).toBe(false);
  });
  it("upload reset is owner-only and cannot approve, invent requirements or use foreign paths", async () => {
    await actorRun(owner, async () => {
      const r = (await db.query("select to_jsonb(public.submit_document_upload($1,$2,'replacement.pdf')) as row", [SA, `${SA}/synthetic.pdf`])).rows[0].row;
      expect(r).toMatchObject({ intern_id: SA, doc_type: "moa", status: "Pending", reviewed_by: null, reviewed_at: null, note: null });
    });
    for (const [id, path] of [[SB, `${SA}/synthetic.pdf`], [SA, `${SB}/synthetic.pdf`], [SA, `${SA}/missing.pdf`]]) {
      await expect(actorRun(owner, () => db.query("select public.submit_document_upload($1,$2,'synthetic.pdf')", [id, path]))).rejects.toBeTruthy();
    }
    await actorRun(teacher, async () => {
      const r = (await db.query("select to_jsonb(public.review_document($1,'Approved',null,$2)) as row", [SA, `${SA}/synthetic.pdf`])).rows[0].row;
      expect(r).toMatchObject({ intern_id: SA, status: "Approved", reviewed_by: IA, note: null });
    });
    await expect(actorRun(teacher, () => db.query("select public.review_document($1,'Approved',null,$2)", [SB, `${SB}/synthetic.pdf`]))).rejects.toMatchObject({ code: "42501" });
    await expect(actorRun(teacher, () => db.query("select public.review_document($1,'Approved',null,'stale')", [SA]))).rejects.toMatchObject({ code: "40001" });
  });
  it("announcement author, UUID target and snapshot are enforced; supplied recipients rejected", async () => {
    await actorRun(teacher, async () => {
      const r = (await db.query("insert into public.announcements(instructor_id,title,body) values($1,'Broadcast','Synthetic') returning recipient_ids", [IA])).rows[0];
      expect(r.recipient_ids).toEqual([SA]);
    });
    for (const [author, target, recipient] of [[IB, SA, null], [IA, SB, null], [IA, SC, null], [IA, SA, [SB]]]) {
      await expect(actorRun(teacher, () => db.query("insert into public.announcements(instructor_id,title,body,target,target_intern_id,recipient_ids) values($1,'Forgery','Synthetic','Personal',$2,$3)", [author, target, recipient])))
        .rejects.toBeTruthy();
    }
  });
  it("reassignment transfers staff scope while a recipient keeps the message snapshot", async () => {
    await actorRun({ role: "instructor", id: IB }, async () => {
      expect((await db.query("select * from public.attendance_logs where intern_id=$1", [SA])).rows).toHaveLength(1);
      expect((await db.query("select * from storage.objects where id=$1", [SA])).rows).toHaveLength(1);
      expect((await db.query("select * from public.announcements where id=$1", [SA])).rows).toHaveLength(0);
    }, () => db.query("update public.interns set instructor_id=$1 where id=$2", [IB, SA]));
    await actorRun(owner, async () => {
      expect((await db.query("select * from public.announcements where id=$1", [SA])).rows).toHaveLength(1);
    }, () => db.query("update public.interns set instructor_id=$1 where id=$2", [IB, SA]));
  });
  it("other-bucket legacy policy still works but cannot rename into documents", async () => {
    await actorRun(owner, async () => {
      const r = (await db.query("insert into storage.objects(bucket_id,name) values('other','synthetic') returning id")).rows[0];
      await expect(db.query("update storage.objects set bucket_id='documents',name=$2 where id=$1", [r.id, `${SA}/forged.pdf`]))
        .rejects.toMatchObject({ code: "42501" });
    });
  });
  it("explicit grants deny anon routines and dangerous table operations", async () => {
    const routines = (await db.query("select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).rows;
    for (const routine of routines) {
      expect((await db.query("select has_function_privilege('anon',$1::oid,'EXECUTE') as allowed", [routine.oid])).rows[0].allowed).toBe(false);
    }
    for (const table of tables.filter((t) => !t.includes("."))) {
      expect((await db.query("select has_table_privilege('authenticated',$1,'TRUNCATE') as allowed", [`public.${table}`])).rows[0].allowed).toBe(false);
    }
  });
  it("catalog verifies RLS, trusted owners/search paths, WITH CHECK and column grant removal", async () => {
    const enabled = (await db.query("select relname,relrowsecurity from pg_class where oid=any($1::regclass[])",
      [tables.filter((t) => !t.includes('.')).map((t) => `public.${t}`)])).rows;
    expect(enabled).toHaveLength(12);
    expect(enabled.every((r) => r.relrowsecurity)).toBe(true);
    const functions = (await db.query("select p.proname,pg_get_userbyid(p.proowner) as owner,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef")).rows;
    expect(functions.length).toBeGreaterThan(10);
    for (const fn of functions) {
      expect(fn.owner).toBe("postgres");
      expect(fn.proconfig.some((c) => c.replaceAll(' ', '') === 'search_path=pg_catalog,public')).toBe(true);
    }
    const writes = (await db.query("select * from pg_policies where schemaname='public' and cmd in ('ALL','INSERT','UPDATE')")).rows;
    expect(writes.every((p) => p.with_check !== null && p.policyname.startsWith('m01_'))).toBe(true);
    expect((await db.query("select has_column_privilege('anon','public.profiles','role','UPDATE') as allowed")).rows[0].allowed).toBe(false);
  });
  it("legacy foreign-folder metadata cannot grant an instructor another owner's file", async () => {
    await actorRun(teacher, async () => {
      expect((await db.query("select * from storage.objects where id=$1", [SB])).rows).toEqual([]);
    }, () => db.query("update public.documents set file_path=$2 where id=$1", [SA, `${SB}/synthetic.pdf`]));
  });
  it("invalid legacy instructor/evaluator references do not reveal unrelated intern names", async () => {
    await actorRun(owner, async () => {
      expect((await db.query("select * from public.related_profile_names($1)", [[SB]])).rows).toEqual([]);
    }, async () => {
      await db.query("update public.interns set instructor_id=$2 where id=$1", [SA, SB]);
      await db.query("insert into public.evaluations(intern_id,evaluator_id) values($1,$2)", [SA, SB]);
    });
  });
});

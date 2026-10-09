import { describe, expect, it, vi } from "vitest";
import { parseOnboardingCSV } from "../src/lib/onboarding";
import { adminOperation } from "../server/adminOperations";
import { makeHandler } from "../api/admin-operations";

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const csv = "full_name,email,organization,student_id\r\nOne,one@synthetic.invalid,Test,1\r\nTwo,two@synthetic.invalid,Test,2\r\nThree,three@synthetic.invalid,Test,3\r\n";
const settings = { origin: "https://app.invalid", githubToken: "synthetic-secret", backupRepository: "owner/repository", backupRef: "main" };

function harness({ cap = 2, lost = false, authError = false, role = "admin", status = "Active" } = {}) {
  const data = { admin_operations: [], onboarding_rows: [], profiles: [{ id: id(1), role, status }] }, identities = [];
  const db = {
    from(table) {
      let change, single = false, head = false, range, limit = Infinity; const filters = [], orders = [];
      const query = {
        select(_fields, options = {}) { head = options.head; return query; },
        update(value) { change = value; return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        order(key, options) { orders.push([key, options?.ascending !== false]); return query; },
        range(start, end) { range = [start, end]; return query; },
        limit(value) { limit = value; return query; },
        single() { single = true; return query; },
        then(resolve, reject) {
          let rows = data[table].filter(row => filters.every(filter => filter(row)));
          const count = rows.length;
          if (change) { rows.forEach(row => Object.assign(row, change)); }
          else {
            rows.sort((a, b) => { for (const [key, ascending] of orders) { const order = String(a[key]).localeCompare(String(b[key])); if (order) return ascending ? order : -order; } return 0; });
            if (range) rows = rows.slice(range[0], range[1] + 1);
            rows = rows.slice(0, Math.min(cap, limit));
          }
          return Promise.resolve({ data: head ? null : single ? rows[0] : structuredClone(rows), count }).then(resolve, reject);
        },
      }; return query;
    },
    rpc: vi.fn(async (name, args) => {
      if (name === "onboarding_existing") return { data: identities.filter(user => args.p_emails.includes(user.email)).map(user => user.email) };
      if (name === "onboarding_identity") return { data: identities.filter(user => user.email === args.p_email) };
      if (name === "prepare_admin_operation") {
        let job = data.admin_operations.find(job => job.id === args.p_id);
        if (!job) {
          job = { id: args.p_id, actor_id: args.p_actor, kind: args.p_kind, payload: args.p_payload, status: "queued", result: {}, created_at: "2026-10-09T00:00:00Z" };
          data.admin_operations.push(job);
          args.p_payload.rows?.forEach((_row, index) => data.onboarding_rows.push({ job_id: job.id, row_index: index, status: "ready" }));
        }
        return { data: structuredClone(job) };
      }
      if (name === "claim_onboarding_row") {
        const row = data.onboarding_rows.find(row => row.job_id === args.p_job && row.row_index === args.p_index);
        if (row.status !== "ready") return { data: null };
        row.status = "running"; data.admin_operations.find(job => job.id === args.p_job).status = "running";
        return { data: structuredClone(row) };
      }
      if (name === "summarize_admin_import") {
        const job = data.admin_operations.find(job => job.id === args.p_job), rows = data.onboarding_rows.filter(row => row.job_id === job.id);
        rows.forEach(row => {
          const user = identities.find(user => user.raw_user_meta_data?.insync_import === `${job.id}:${row.row_index}`);
          if (["running", "uncertain"].includes(row.status) && user) Object.assign(row, { status: "invited", account_id: user.id });
        });
        const counts = Object.fromEntries(["ready", "running", "invited", "duplicate", "uncertain", "cancelled", "failed"].map(status => [status, rows.filter(row => row.status === status).length]));
        job.status = counts.ready || counts.running ? "running" : counts.uncertain ? "failed" : "completed";
        job.result = { counts, rows }; return { data: structuredClone(job) };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }),
    auth: {
      getUser: vi.fn(async () => authError ? { error: new Error("secret-auth-provider-body") } : { data: { user: { id: id(1) } } }),
      admin: { inviteUserByEmail: vi.fn(async (email, options) => {
        const user = { id: id(100 + identities.length), email, raw_user_meta_data: options.data }; identities.push(user);
        if (lost) throw new Error("lost response");
        return { data: { user } };
      }) },
    },
  };
  return { db, data, identities };
}

describe("strict bulk CSV", () => {
  it("parses BOM, CRLF, quoted commas/escaped quotes and normalized addresses", () => {
    const rows = parseOnboardingCSV('\ufefffull_name,email,organization,student_id\r\n"Doe, ""Jane""",JANE@Synthetic.invalid,Test,001\r\n', "student");
    expect(rows[0].full_name).toBe('Doe, "Jane"');
    expect(rows[0].email).toBe("jane@synthetic.invalid"); expect(rows[0].requested_role).toBe("intern");
  });
  it.each([
    ["wrong headers", "email,password\na@b.invalid,secret", "student"],
    ["duplicate email", csv + "Other,ONE@synthetic.invalid,Test,4\n", "student"],
    ["extra columns", csv + "Other,other@synthetic.invalid,Test,4,admin\n", "student"],
    ["invalid email", csv.replace("one@synthetic.invalid", "not-an-email"), "student"],
    ["quote error", csv + '"Unclosed', "student"],
    ["control characters", csv.replace("One,", "One\t,"), "student"],
    ["empty file", "full_name,email,organization,student_id\n", "student"],
    ["oversize", "x".repeat(256001), "student"],
  ])("rejects %s before any provisioning", (_label, text, kind) => expect(() => parseOnboardingCSV(text, kind)).toThrow());
});

describe("bulk orchestration and dispatch", () => {
  it("previews without writes/emails, skips existing identities and completes bounded batches", async () => {
    const h = harness(); h.identities.push({ id: id(99), email: "two@synthetic.invalid" });
    const call = body => adminOperation({ db: h.db, actor: id(1), body, settings });
    const preview = await call({ action: "preview", kind: "student", csv });
    expect(preview.rows.map(row => row.status)).toEqual(["ready", "duplicate", "ready"]);
    expect(h.data.admin_operations).toHaveLength(0); expect(h.db.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    const first = await call({ action: "import", kind: "student", csv, id: id(5) });
    expect(first.result.counts.invited).toBe(1); expect(first.result.counts.duplicate).toBe(1); expect(first.result.counts.ready).toBe(1);
    expect((await call({ action: "continue", id: id(5) })).status).toBe("completed");
    await call({ action: "import", kind: "student", csv, id: id(5) });
    expect(h.db.auth.admin.inviteUserByEmail).toHaveBeenCalledTimes(2);
    expect(h.db.auth.admin.inviteUserByEmail.mock.calls[0][1].redirectTo).toBe("https://app.invalid/?flow=recovery");
    expect(h.db.auth.admin.inviteUserByEmail.mock.calls[0][1].data).not.toHaveProperty("role");
  });
  it("reconciles a committed invite with a lost response without sending it again", async () => {
    const h = harness({ lost: true });
    const result = await adminOperation({ db: h.db, actor: id(1), body: { action: "import", csv, kind: "student", id: id(5) }, settings });
    expect(result.result.counts.invited).toBe(2);
    await adminOperation({ db: h.db, actor: id(1), body: { action: "status", id: id(5) }, settings });
    expect(h.db.auth.admin.inviteUserByEmail).toHaveBeenCalledTimes(2);
  });
  it("does not replay an unknown write; stopping preserves created identities", async () => {
    const h = harness(); h.db.auth.admin.inviteUserByEmail.mockRejectedValue(new Error("stalled / unknown"));
    const call = body => adminOperation({ db: h.db, actor: id(1), body, settings });
    const first = await call({ action: "import", csv, kind: "student", id: id(5) });
    expect(first.result.counts.uncertain).toBe(2);
    const stopped = await call({ action: "stop", id: id(5) });
    expect(stopped.result.counts.cancelled).toBe(1); expect(stopped.status).toBe("failed");
    await call({ action: "status", id: id(5) }); expect(h.db.auth.admin.inviteUserByEmail).toHaveBeenCalledTimes(2);
  });
  it("fills recent jobs across an API cap below the page size", async () => {
    const h = harness({ cap: 1 });
    h.data.admin_operations.push(...Array.from({ length: 23 }, (_row, index) => ({ id: id(index + 1), created_at: "2026-10-09T00:00:00Z" })));
    const result = await adminOperation({ db: h.db, actor: id(1), body: { action: "list" }, settings });
    expect(result.jobs).toHaveLength(20); expect(result.count).toBe(23); expect(result.jobs[0].id).toBe(id(23));
  });
  it("dispatches a durable backup ID and preserves unconfirmed responses", async () => {
    const h = harness(), fetcher = vi.fn().mockRejectedValue(new Error("lost dispatch"));
    const result = await adminOperation({ db: h.db, actor: id(1), body: { action: "backup", id: id(5) }, settings, fetcher });
    expect(result.status).toBe("queued"); expect(result.dispatch).toBe("unconfirmed");
    expect(JSON.parse(fetcher.mock.calls[0][1].body).inputs.job_id).toBe(id(5));
    expect(JSON.stringify(result)).not.toContain(settings.githubToken);
    await expect(adminOperation({ db: h.db, actor: id(1), body: { action: "backup", id: id(6) }, settings: {} })).rejects.toThrow("Configure");
    expect(h.data.admin_operations).toHaveLength(1);
  });
  it("reconciles an uploaded artifact after finalizer failure and only cancels queued work", async () => {
    const h = harness();
    h.data.admin_operations.push({ id: id(5), actor_id: id(1), kind: "backup", status: "running", payload: {}, result: { worker_run_id: "123", bytes: 100 }, created_at: "2026-10-09T00:00:00Z" });
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed" }))).mockResolvedValueOnce(new Response(JSON.stringify({ total_count: 1, artifacts: [{ name: `insync-${id(5)}`, id: 45, expired: false, size_in_bytes: 999, expires_at: "2026-10-16T00:00:00Z" }] })));
    const result = await adminOperation({ db: h.db, actor: id(1), body: { action: "status", id: id(5) }, settings, fetcher });
    expect(result.status).toBe("completed"); expect(result.result.artifact_id).toBe("45"); expect(result.result.bytes).toBe(100);
    expect((await adminOperation({ db: h.db, actor: id(1), body: { action: "stop", id: id(5) }, settings })).status).toBe("completed");
    h.data.admin_operations[0].status = "queued";
    expect((await adminOperation({ db: h.db, actor: id(1), body: { action: "stop", id: id(5) }, settings })).status).toBe("cancelled");
  });
  it("does not claim backup completion from a failed/incomplete provider status read", async () => {
    const h = harness();
    h.data.admin_operations.push({ id: id(5), actor_id: id(1), kind: "backup", status: "running", payload: {}, result: { worker_run_id: "123" }, created_at: "2026-10-09T00:00:00Z" });
    const result = await adminOperation({ db: h.db, actor: id(1), body: { action: "status", id: id(5) }, settings, fetcher: vi.fn().mockRejectedValue(new Error("provider secret response")) });
    expect(result.status).toBe("running"); expect(result.message).toContain("retained"); expect(JSON.stringify(result)).not.toContain("provider secret");
  });
});

describe("Vercel authentication boundary", () => {
  async function request(overrides = {}, options = {}) {
    const h = harness(options), factory = vi.fn(() => h.db);
    const handler = makeHandler({ env: { APP_ORIGIN: settings.origin, SUPABASE_URL: "https://synthetic.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-server-secret" }, clientFactory: factory });
    const req = { method: "POST", headers: { origin: settings.origin, "content-type": "application/json", authorization: "Bearer synthetic-user-token" }, body: { action: "list" }, ...overrides };
    const res = { setHeader: vi.fn(), status: vi.fn(function(code) { this.code = code; return this; }), json: vi.fn(function(body) { this.body = body; return this; }) };
    await handler(req, res); return { ...h, res, factory };
  }
  it.each(["instructor", "intern"])("rejects %s before privileged operations", async role => {
    const { res, db } = await request({}, { role }); expect(res.code).toBe(403); expect(db.rpc).not.toHaveBeenCalled();
  });
  it("rejects revoked, forged/missing sessions and foreign origins", async () => {
    expect((await request({}, { status: "Inactive" })).res.code).toBe(403);
    expect((await request({}, { authError: true })).res.code).toBe(401);
    const denied = await request({ headers: { origin: "https://foreign.invalid", "content-type": "application/json", authorization: "Bearer fake" } });
    expect(denied.res.code).toBe(403); expect(denied.factory).not.toHaveBeenCalled();
    expect((await request({ headers: { origin: settings.origin, "content-type": "application/json" } })).res.code).toBe(401);
    expect((await request({ method: "GET" })).res.code).toBe(405);
  });
  it("checks the JWT with Auth and never returns the service credential", async () => {
    const { res, db } = await request(); expect(res.code).toBe(200);
    expect(db.auth.getUser).toHaveBeenCalledWith("synthetic-user-token");
    expect(JSON.stringify(res.body)).not.toContain("synthetic-server-secret");
  });
});

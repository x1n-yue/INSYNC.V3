import { describe, expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { attendanceEvidence, auditArtifact, csvText, downloadArtifact, dtrArtifact, readExportRows, templateArtifact } from "../src/lib/exports";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(900);
const closed = { id: id(1), intern_id: owner, log_date: "2026-10-06", time_in: "23:00:00", time_out: "02:30:00",
  clocked_in_at: "2026-10-06T15:00:00Z", clocked_out_at: "2026-10-06T18:30:00Z", hours: 3.5, verified: true, verified_by: id(901), accomplishment: "=SUM(A1)" };

// A query-executing synthetic transport with a deliberately tiny API row cap.
function transport(rows, options = {}) {
  const calls = [];
  let profileReads = 0;
  const client = {
    calls,
    rpc: vi.fn(async () => {
      profileReads++;
      return { data: options.revoked && profileReads > 1 ? { status: "Inactive" } : { id: owner, role: options.role || "intern", status: "Active" }, error: null };
    }),
    from(table) {
      const filters = [];
      let columns, selectOptions, ascending = true, limit = Infinity;
      const q = {
        select(c, o) { columns = c; selectOptions = o; return q; },
        eq(k, v) { filters.push((r) => r[k] === v); return q; },
        lte(k, v) { filters.push((r) => r[k] <= v); return q; },
        gt(k, v) { filters.push((r) => r[k] > v); return q; },
        order(_k, o) { ascending = o.ascending; return q; },
        limit(n) { limit = n; return q; },
        then(resolve, reject) {
          calls.push({ table, columns, selectOptions });
          let matching = rows.filter((r) => filters.every((f) => f(r))).sort((a, b) => a.id.localeCompare(b.id) * (ascending ? 1 : -1));
          const count = matching.length;
          matching = matching.slice(0, Math.min(limit, options.cap || 2));
          let result = { data: selectOptions?.head ? null : matching, count: selectOptions?.count ? count : null, error: null };
          result = options.alter?.(result, calls.length, { columns, selectOptions }) || result;
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return client;
}

describe("Phase 3 real download artifacts", () => {
  it("quotes commas, quotes, newlines and formula-like cells without fabricated null zeros", () => {
    expect(csvText(["name", "note"], [['A,"B"', "line\nnext"], [" =1+1", null], ["\t@cmd", "-2"]]))
      .toBe('\ufeff"name","note"\r\n"A,""B""","line\nnext"\r\n"\' =1+1",""\r\n"\'\t@cmd","\'-2"\r\n');
  });
  it.each(["student", "instructor"])("creates actual blank CSV and XLSX %s templates", async (kind) => {
    const csv = await templateArtifact(kind, "csv");
    expect(await csv.blob.text()).toContain('"full_name","email","organization"');
    expect((await csv.blob.text()).split("\r\n")).toHaveLength(2);
    const xlsx = await templateArtifact(kind, "xlsx");
    const zip = unzipSync(new Uint8Array(await xlsx.blob.arrayBuffer()));
    expect(zip["[Content_Types].xml"]).toBeDefined();
    const sheet = strFromU8(zip["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain('r="A1"');
    const xml = Object.values(zip).map(strFromU8).join("\n");
    expect(xml).toContain("full_name");
    expect(xml).not.toContain("password");
    expect(sheet).not.toContain("<f>");
    expect(sheet).not.toContain('r="A2"');
  });
  it("rejects unsupported artifact formats", async () => {
    await expect(templateArtifact("admin", "csv")).rejects.toThrow("Unknown");
    await expect(templateArtifact("student", "pdf")).rejects.toThrow("Unknown");
  });
  it("traverses every short API page with ordered unique identities and exact count", async () => {
    const rows = Array.from({ length: 7 }, (_, n) => ({ ...closed, id: id(n + 1) }));
    const client = transport(rows);
    expect(await readExportRows(client, "attendance_logs", "*", owner)).toEqual(rows);
    expect(client.calls).toHaveLength(6); // anchor, four pages, final count
  });
  it.each([
    ["unavailable count", (r, n) => n === 1 ? { ...r, count: null } : r],
    ["oversize", (r, n) => n === 1 ? { ...r, count: 50001 } : r],
    ["transport failure", (r, n) => n === 2 ? { ...r, error: { message: "synthetic offline" } } : r],
    ["truncated page", (r, n) => n === 2 ? { ...r, data: [] } : r],
    ["duplicate IDs", (r, n) => n === 2 ? { ...r, data: [closed, closed] } : r],
    ["foreign row", (r, n) => n === 2 ? { ...r, data: [{ ...closed, intern_id: id(999) }] } : r],
    ["changed final count", (r, _n, q) => q.selectOptions?.head ? { ...r, count: 9 } : r],
  ])("fails without an artifact on %s", async (_label, alter) => {
    await expect(dtrArtifact(transport([closed], { alter }), owner)).rejects.toThrow();
  });
  it("checks even empty exports and rechecks current role/status after reading", async () => {
    const empty = await dtrArtifact(transport([]), owner);
    expect(empty.count).toBe(0);
    expect(await empty.blob.text()).toContain("record_id");
    await expect(dtrArtifact(transport([], { alter: (r, _n, q) => q.selectOptions?.head ? { ...r, count: 1 } : r }), owner)).rejects.toThrow("changed");
    await expect(dtrArtifact(transport([closed], { revoked: true }), owner)).rejects.toThrow("not permitted");
    await expect(auditArtifact(transport([]))).rejects.toThrow("not permitted");
  });
  it("exports all own DTR with overnight evidence, formula escaping and Manila filename", async () => {
    const result = await dtrArtifact(transport([closed, { ...closed, id: id(2), intern_id: id(999) }]), owner, new Date("2026-10-06T19:00:00Z"));
    expect(result.filename).toBe("insync-dtr-all-2026-10-07.csv");
    expect(result.count).toBe(1);
    expect(await result.blob.text()).toContain('"3.5","3.5","3.5","closed","verified"');
    expect(await result.blob.text()).toContain("'=SUM(A1)");
  });
  it("labels old audit provenance and preserves actual database event metadata", async () => {
    const result = await auditArtifact(transport([{ id: id(1), source: null }, { id: id(2), source: "database-trigger-v2", event_data: { changed: ["status"] } }], { role: "admin" }));
    const csv = await result.blob.text();
    expect(result.count).toBe(2);
    expect(csv).toContain("legacy-unverified");
    expect(csv).toContain("database-trigger-v2");
    expect(csv).toContain('""changed""');
  });
  it("recognizes open and unverified evidence without inventing logged duration", () => {
    const now = new Date("2026-10-07T00:00:00Z");
    expect(attendanceEvidence(closed, now)).toMatchObject({ logged: 3.5, verified: 3.5 });
    expect(attendanceEvidence({ ...closed, verified: false, verified_by: null }, now)).toMatchObject({ logged: 3.5, verified: 0 });
    expect(attendanceEvidence({ ...closed, clocked_out_at: null, time_out: null, hours: null, verified: false, verified_by: null }, now))
      .toMatchObject({ state: "open", logged: "", verified: "" });
  });
  it("keeps future start/end evidence unknown at the export cutoff", () => {
    expect(attendanceEvidence(closed, new Date("2026-10-06T16:00:00Z")).state).toBe("legacy-or-invalid");
    expect(attendanceEvidence(closed, new Date("2026-10-06T14:00:00Z")).state).toBe("legacy-or-invalid");
  });
  it.each([
    { clocked_in_at: null }, { clocked_out_at: "invalid" }, { log_date: "2026-10-07" },
    { hours: null }, { hours: -2 }, { hours: "" }, { hours: Infinity }, { hours: 4 },
    { time_in: "24:00:00" }, { time_out: "01:00:00" }, { verified_by: null },
    { clocked_out_at: "2026-10-07T08:00:01Z", time_out: "16:00:01", hours: 17.000277777 },
  ])("keeps inconsistent/legacy evidence unknown: %j", (change) => {
    expect(attendanceEvidence({ ...closed, ...change })).toEqual({ state: "legacy-or-invalid", logged: "", verified: "", verification: "unknown" });
  });
  it("dispatches a real Blob download and revokes URLs, including DOM failure", async () => {
    const link = { click: vi.fn(), remove: vi.fn() };
    const browser = { URL: { createObjectURL: vi.fn(() => "blob:synthetic"), revokeObjectURL: vi.fn() },
      document: { createElement: vi.fn(() => link), body: { appendChild: vi.fn() } }, setTimeout: vi.fn((f) => f()) };
    const artifact = await templateArtifact("student", "csv");
    downloadArtifact(artifact, browser);
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.download).toBe(artifact.filename);
    expect(browser.URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic");
    browser.document.createElement.mockImplementation(() => { throw new Error("synthetic DOM failure"); });
    expect(() => downloadArtifact(artifact, browser)).toThrow("DOM failure");
    expect(browser.URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(() => downloadArtifact({ ...artifact, filename: "../bad.csv" }, browser)).toThrow("Invalid");
  });
});

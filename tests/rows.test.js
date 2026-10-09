import { describe, expect, it, vi } from "vitest";
import { readRows } from "../src/lib/rows";
import { attendanceEvidence } from "../src/lib/hours";

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

describe("Core record loading and attendance evidence", () => {
  it("traverses every short API page with ordered unique identities and exact count", async () => {
    const rows = Array.from({ length: 7 }, (_, n) => ({ ...closed, id: id(n + 1) }));
    const client = transport(rows);
    expect(await readRows(client, "attendance_logs", "*", owner)).toEqual(rows);
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
  ])("rejects incomplete or unauthorized row results on %s", async (_label, alter) => {
    await expect(readRows(transport([closed], { alter }), "attendance_logs", "*", owner)).rejects.toThrow();
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
});


it("rechecks empty core reads instead of accepting changed or missing counts", async () => {
  expect(await readRows(transport([]), 'attendance_logs', '*', owner)).toEqual([]);
  await expect(readRows(transport([], { alter: (result, _n, query) => query.selectOptions?.head ? { ...result, count: 1 } : result }), 'attendance_logs', '*', owner)).rejects.toThrow('changed');
  await expect(readRows(transport([], { alter: result => ({ ...result, count: null }) }), 'attendance_logs', '*', owner)).rejects.toThrow('count unavailable');
});

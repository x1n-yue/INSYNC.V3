import { remainingTime, withTimeout } from "./requests";
import { manilaDate } from "./authority";

// Calendar labels only: hour totals and unknown evidence come from the existing RPC.
export function weeklyChartDays(rows, now = new Date()) {
  if (!Array.isArray(rows)) throw new Error("Weekly hours are unavailable. Refresh and retry.");
  const today = manilaDate(now), date = new Date(`${today}T00:00:00Z`);
  const monday = date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000;
  const byDay = new Map();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row?.day ?? "") || byDay.has(row.day)
      || ![row.hours, row.verified].every(value => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0))) {
      throw new Error("Weekly hours are unavailable. Refresh and retry.");
    }
    byDay.set(row.day, row);
  }
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => {
    const day = new Date(monday + index * 86400000).toISOString().slice(0, 10);
    const row = byDay.get(day), future = day > today;
    return { day, label, future, hours: future ? null : row ? row.hours : 0, verified: future ? null : row ? row.verified : 0 };
  });
}

export function attendancePeriod(query, period, now = new Date()) {
  const today = manilaDate(now), date = new Date(`${today}T00:00:00Z`);
  const start = period === "year" ? `${today.slice(0,4)}-01-01` : period === "month" ? `${today.slice(0,7)}-01`
    : period === "week" ? new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0,10) : null;
  query = query.lte("log_date", today);
  return start ? query.gte("log_date", start) : query;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function dashboardMetrics(client, expectedActor) {
  const deadline = Date.now() + 20000;
  return withTimeout((async () => {
    const rows = [];
    let after = null, total, actor, role;
    do {
      const budget = remainingTime(deadline);
      const { data, error } = await withTimeout(client.rpc("dashboard_metrics", { p_after: after, p_limit: 100 }), undefined, budget);
      if (error) throw error;
      if (!UUID.test(data?.actorId) || !["admin", "instructor", "intern"].includes(data.actorRole)
        || (expectedActor && data.actorId !== expectedActor) || (actor && (actor !== data.actorId || role !== data.actorRole))) throw new Error("Signed-in account changed during aggregation; refresh.");
      actor = data.actorId; role = data.actorRole;
      if (!Array.isArray(data?.rows) || !Number.isSafeInteger(data.total) || data.total < 0 || data.total > 50000
        || (total !== undefined && data.total !== total)) throw new Error("Dashboard counts changed or are unavailable; refresh.");
      total = data.total;
      for (const row of data.rows) {
        if (!UUID.test(row.id) || (after && row.id <= after) || !row.metric?.checklist) throw new Error("Unexpected dashboard metric; refresh.");
        rows.push(row); after = row.id;
      }
      if (rows.length > total || (!data.rows.length && rows.length < total)) throw new Error("Dashboard metrics were truncated; refresh.");
    } while (rows.length < total);
    return rows;
  })(), "Dashboard aggregation timed out; refresh.", 20000);
}

// Fill one visible page even when the project's HTTP row cap is smaller.
// Stable order and counts detect truncation/drift; this is not a SQL snapshot.
export async function detailPage(client, table, { page = 0, size = 50, filter = query => query, order = "created_at" } = {}) {
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(size) || size < 1 || size > 100) throw new Error("Invalid page");
  const deadline = Date.now() + 20000;
  return withTimeout((async () => {
    let count, rows = [];
    const ids = new Set();
    do {
      const offset = page * size + rows.length;
      const query = filter(client.from(table).select("*", { count: "exact" })).order(order, { ascending: false }).order("id", { ascending: false }).range(offset, (page + 1) * size - 1);
      const result = await withTimeout(query, undefined, remainingTime(deadline));
      if (result.error) throw result.error;
      if (!Number.isSafeInteger(result.count) || result.count < 0 || (count !== undefined && count !== result.count) || !Array.isArray(result.data)) throw new Error("Page count changed or is unavailable; refresh.");
      count = result.count;
      const expected = Math.max(0, Math.min(size, count - page * size));
      for (const row of result.data) {
        if (!UUID.test(row.id) || ids.has(row.id)) throw new Error("Repeated or invalid page record; refresh.");
        ids.add(row.id); rows.push(row);
      }
      if (rows.length > expected || (!result.data.length && rows.length < expected)) throw new Error("Page was truncated; refresh.");
      if (rows.length === expected) return { data: rows, count };
    } while (rows.length < size);
    throw new Error("Unexpected page length; refresh.");
  })(), "Page loading timed out; refresh.", 20000);
}

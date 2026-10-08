import { attendanceEvidence } from "./hours";
export { attendanceEvidence } from "./hours";
import { manilaDate } from "./authority";

export const EXPORT_LIMIT = 50000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const TEMPLATE_HEADERS = {
  student: ["full_name", "email", "organization", "student_id"],
  instructor: ["full_name", "email", "organization"],
};

export function csvText(headers, rows) {
  const cell = (value) => {
    let text = value == null ? "" : String(value);
    // Quoting alone does not prevent spreadsheet formulas. Preserve dangerous
    // text as a literal, including formulas hidden behind whitespace/controls.
    // Intentional control range detects hidden spreadsheet formula prefixes.
    // eslint-disable-next-line no-control-regex
    if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return "\ufeff" + [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function templateArtifact(kind, format) {
  const headers = TEMPLATE_HEADERS[kind];
  if (!headers || !["csv", "xlsx"].includes(format)) throw new Error("Unknown template format");
  if (format === "csv") return { blob: new Blob([csvText(headers, [])], { type: "text/csv;charset=utf-8" }), filename: `insync-${kind}-planning-template.csv` };
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const blob = await writeExcelFile([headers.map((value) => ({ type: String, value }))]).toBlob();
  return { blob, filename: `insync-${kind}-planning-template.xlsx` };
}

export function downloadArtifact({ blob, filename }, browser = { document, URL, setTimeout }) {
  if (!(blob instanceof Blob) || blob.size === 0 || !/^[a-z0-9_.-]+$/i.test(filename)) throw new Error("Invalid download artifact");
  const url = browser.URL.createObjectURL(blob);
  let link;
  try {
    link = browser.document.createElement("a");
    link.href = url; link.download = filename; link.hidden = true;
    browser.document.body.appendChild(link);
    link.click(); // Browser dispatch, not proof the user saved the file.
  } finally {
    link?.remove();
    browser.setTimeout(() => browser.URL.revokeObjectURL(url), 30000);
  }
}

async function requireProfile(client, role, ownerId) {
  const { data, error } = await client.rpc("my_profile");
  if (error) throw new Error(error.message);
  if (data?.status !== "Active" || data.role !== role || (ownerId && data.id !== ownerId)) throw new Error("Export not permitted; refresh your session");
}

// Uses fresh RLS queries, never capped/stale dashboard arrays. Keyset traversal
// continues across short pages (project API cap may be smaller than page size).
// This is a bounded, count-checked read, not a transactionally consistent snapshot.
export async function readExportRows(client, table, columns, ownerId) {
  const scope = (query) => ownerId ? query.eq("intern_id", ownerId) : query;
  const anchor = await scope(client.from(table).select("id", { count: "exact" })).order("id", { ascending: false }).limit(1);
  if (anchor.error) throw new Error(anchor.error.message);
  if (!Number.isSafeInteger(anchor.count) || anchor.count < 0 || !Array.isArray(anchor.data)
    || anchor.data.length !== (anchor.count ? 1 : 0)) throw new Error("Export count unavailable; refresh and retry");
  if (anchor.count > EXPORT_LIMIT) throw new Error(`Export exceeds ${EXPORT_LIMIT} records; ask an operator for a scoped export`);
  if (!anchor.count) {
    const final = await scope(client.from(table).select("id", { count: "exact", head: true }));
    if (final.error) throw new Error(final.error.message);
    if (final.count !== 0) throw new Error("Export changed during download; retry");
    return [];
  }
  const upper = anchor.data[0]?.id;
  if (!UUID.test(upper)) throw new Error("Invalid export record identity");
  const records = [];
  let cursor;
  while (records.length < anchor.count) {
    let query = scope(client.from(table).select(columns)).lte("id", upper).order("id", { ascending: true }).limit(250);
    if (cursor) query = query.gt("id", cursor);
    const page = await query;
    if (page.error) throw new Error(page.error.message);
    if (!Array.isArray(page.data) || !page.data.length) throw new Error("Export data changed or was truncated; retry");
    for (const row of page.data) {
      if (!UUID.test(row.id) || (cursor && row.id <= cursor) || row.id > upper
        || (ownerId && row.intern_id !== ownerId)) throw new Error("Unexpected export row; refresh and retry");
      records.push(row); cursor = row.id;
    }
    if (records.length > anchor.count) throw new Error("Export changed during download; retry");
  }
  const final = await scope(client.from(table).select("id", { count: "exact", head: true })).lte("id", upper);
  if (final.error) throw new Error(final.error.message);
  if (final.count !== anchor.count) throw new Error("Export changed during download; retry");
  return records;
}

export async function auditArtifact(client, now = new Date()) {
  await requireProfile(client, "admin");
  const records = await readExportRows(client, "audit_logs", "id,actor_id,actor_name,action,detail,created_at,source,event_data");
  await requireProfile(client, "admin");
  const headers = ["id", "created_at", "actor_id", "actor_name", "action", "detail", "provenance", "event_data"];
  const rows = records.map((r) => [r.id, r.created_at, r.actor_id, r.actor_name, r.action, r.detail,
    r.source === "database-trigger-v2" ? r.source : "legacy-unverified", r.event_data == null ? "" : JSON.stringify(r.event_data)]);
  return { blob: new Blob([csvText(headers, rows)], { type: "text/csv;charset=utf-8" }), filename: `insync-audit-${manilaDate(now)}.csv`, count: rows.length };
}

export async function dtrArtifact(client, ownerId, now = new Date()) {
  if (!UUID.test(ownerId)) throw new Error("Intern identity required");
  await requireProfile(client, "intern", ownerId);
  const records = await readExportRows(client, "attendance_logs", "id,intern_id,log_date,time_in,time_out,clocked_in_at,clocked_out_at,hours,verified,verified_by,accomplishment,academic_year_id", ownerId);
  await requireProfile(client, "intern", ownerId);
  records.sort((a, b) => a.log_date.localeCompare(b.log_date) || a.id.localeCompare(b.id));
  const headers = ["record_id", "intern_id", "Manila_start_date", "time_in_Manila", "time_out_Manila", "clocked_in_at", "clocked_out_at",
    "stored_hours", "logged_hours", "verified_hours", "record_state", "verification", "verified_by", "accomplishment", "academic_year_id"];
  const rows = records.map((r) => {
    const evidence = attendanceEvidence(r, now);
    return [r.id, r.intern_id, r.log_date, r.time_in, r.time_out, r.clocked_in_at, r.clocked_out_at,
      r.hours, evidence.logged, evidence.verified, evidence.state, evidence.verification, r.verified_by, r.accomplishment, r.academic_year_id];
  });
  return { blob: new Blob([csvText(headers, rows)], { type: "text/csv;charset=utf-8" }), filename: `insync-dtr-all-${manilaDate(now)}.csv`, count: rows.length };
}

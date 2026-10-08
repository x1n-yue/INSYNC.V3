import { manilaDate } from "./authority";
import { attendanceEvidence } from "./hours";
import { checklistState, requiredHours } from "./business";
import { academicRows } from "./assignments";

const DAY = 86400000;
function dateNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return NaN;
  const number = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(number) && new Date(number).toISOString().startsWith(`${value}T`) ? number : NaN;
}
export function periodContains(date, period = "all", now = new Date()) {
  const n = dateNumber(date), today = manilaDate(now), current = dateNumber(today);
  if (!Number.isFinite(n) || n > current) return false;
  if (period === "all") return true;
  if (period === "year") return date.slice(0, 4) === today.slice(0, 4);
  if (period === "month") return date.slice(0, 7) === today.slice(0, 7);
  if (period === "week") {
    const monday = current - ((new Date(current).getUTCDay() + 6) % 7) * DAY;
    return n >= monday && n < monday + 7 * DAY;
  }
  return false;
}
export function filterAttendance(rows, period, now = new Date()) {
  return rows.filter((row) => periodContains(row.log_date, period, now));
}
export function chartHours(rows, period, now = new Date()) {
  const grouped = new Map();
  for (const row of filterAttendance(rows, period, now)) {
    const key = period === "all" || period === "year" ? row.log_date.slice(0, 7) : row.log_date;
    const evidence = attendanceEvidence(row, now);
    const previous = grouped.get(key) || { day: key, hours: 0, verified: 0, unknown: false };
    if (evidence.state === "legacy-or-invalid") previous.unknown = true;
    if (evidence.state === "closed") { previous.hours += Number(evidence.logged); previous.verified += Number(evidence.verified); }
    grouped.set(key, previous);
  }
  return [...grouped.values()].sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => ({ day: r.day, hours: r.unknown ? null : r.hours, verified: r.unknown ? null : r.verified }));
}
export function internMetrics({ internId, required, attendance, documents, academicYearId, now = new Date() }) {
  if (academicYearId !== undefined) {
    attendance = academicRows(attendance, academicYearId);
    documents = academicRows(documents, academicYearId);
  }
  const target = requiredHours(required);
  const rowsKnown = Array.isArray(attendance), docsKnown = Array.isArray(documents);
  const evidence = rowsKnown ? attendance.map((row) => ({ row, value: attendanceEvidence(row, now) })) : [];
  const unknown = !rowsKnown || evidence.some(({ row, value }) => row.intern_id !== internId || value.state === "legacy-or-invalid");
  const closed = evidence.filter(({ value }) => value.state === "closed");
  const logged = unknown ? null : closed.reduce((sum, { value }) => sum + Number(value.logged), 0);
  const verified = unknown ? null : closed.reduce((sum, { value }) => sum + Number(value.verified), 0);
  const checklist = checklistState(documents);
  const approved = docsKnown ? documents.filter((d) => d.intern_id === internId && d.status === "Approved" && d.upload_version > 0
    && d.file_path?.startsWith(`${internId}/`) && d.file_name && d.reviewed_by && Number.isFinite(Date.parse(d.reviewed_at))).length : null;
  const docsValid = docsKnown && checklist.known && documents.every((d) => d.intern_id === internId
    && ["Pending", "Approved", "Needs Revision"].includes(d.status)
    && (d.status !== "Approved" || (d.upload_version > 0 && d.file_path?.startsWith(`${internId}/`) && d.file_name
      && /^[0-9a-f-]{36}$/.test(d.reviewed_by || "") && Number.isFinite(Date.parse(d.reviewed_at)))));
  const clearanceKnown = !unknown && target !== null && docsValid;
  const cleared = clearanceKnown ? verified >= target && checklist.complete && approved === documents.length : null;
  const dates = closed.map(({ row }) => row.log_date).sort();
  const lastDate = dates.at(-1) ?? null;
  const stale = lastDate ? (dateNumber(manilaDate(now)) - dateNumber(lastDate)) / DAY >= 7 : null;
  let risk = "Unknown";
  if (clearanceKnown) {
    if (cleared) risk = "Completed";
    else if (verified < target && (documents.some((d) => d.status === "Needs Revision") || stale)) risk = "At Risk";
    else if (lastDate) risk = "On Track";
  }
  return { target, logged, verified, progress: target !== null && verified !== null ? Math.min(100, Math.floor(verified / target * 100)) : null,
    remaining: target !== null && verified !== null ? Math.max(0, target - verified) : null,
    approved, checklist, cleared, risk, lastDate };
}
export const displayHours = (value) => value == null ? "Unavailable" : Number(value).toFixed(2);

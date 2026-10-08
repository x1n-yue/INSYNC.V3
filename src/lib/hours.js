import { manilaDate } from "./authority";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const manilaClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function timeMatches(time, instant) {
  if (typeof time !== "string" || !/^\d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(time)) return false;
  const parts = time.split(":").map(Number);
  if (parts[0] > 23 || parts[1] > 59 || parts[2] >= 60) return false;
  const local = Object.fromEntries(manilaClock.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  const seconds = Number(local.hour) * 3600 + Number(local.minute) * 60 + Number(local.second) + new Date(instant).getUTCMilliseconds() / 1000;
  return Math.abs(parts[0] * 3600 + parts[1] * 60 + parts[2] - seconds) <= 0.001;
}

export function attendanceEvidence(row, now = new Date()) {
  const start = row.clocked_in_at ? Date.parse(row.clocked_in_at) : NaN;
  const end = row.clocked_out_at ? Date.parse(row.clocked_out_at) : NaN;
  const unknown = { state: "legacy-or-invalid", logged: "", verified: "", verification: "unknown" };
  const cutoff = now.getTime();
  if (!Number.isFinite(cutoff) || !Number.isFinite(start) || start > cutoff
    || row.log_date !== manilaDate(new Date(start)) || !timeMatches(row.time_in, start)) return unknown;
  if (row.time_out == null && row.clocked_out_at == null && row.hours == null && row.verified === false && row.verified_by == null) {
    return { state: "open", logged: "", verified: "", verification: "not-reviewed" };
  }
  const duration = (end - start) / 3600000;
  const hours = row.hours == null || String(row.hours).trim() === "" ? NaN : Number(row.hours);
  if (!Number.isFinite(end) || end > cutoff || !timeMatches(row.time_out, end) || duration <= 0 || duration > 16
    || !Number.isFinite(hours) || hours <= 0 || Math.abs(hours - duration) > 0.000001
    || !((row.verified === true && UUID.test(row.verified_by)) || (row.verified === false && row.verified_by == null))) return unknown;
  return { state: "closed", logged: row.hours, verified: row.verified ? row.hours : 0,
    verification: row.verified ? "verified" : "unverified" };
}

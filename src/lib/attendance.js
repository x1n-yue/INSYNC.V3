// Display helpers only; clock instants, business dates and duration are trusted
// only when returned by the controlled DB operations. Shared across dashboards.
export function formatBusinessDate(value, options = { month: "short", day: "numeric" }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return "Unavailable";
  const day = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(day.getTime()) || new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(day) !== value) return "Unavailable";
  return day.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

export function isOpenSession(row) {
  return Boolean(row?.time_in && !row.time_out && !row.clocked_out_at
    && row.clocked_in_at && Number.isFinite(new Date(row.clocked_in_at).getTime()));
}

export function formatClockTime(value) {
  const instant = new Date(value);
  if (value == null || !Number.isFinite(instant.getTime())) return "Unavailable";
  return instant.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: true });
}

// Database time fields are already Manila wall times, not UTC timestamps.
export function formatAttendanceTime(value) {
  if (value == null || value === "") return "—";
  const parts = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d{1,6})?)?$/.exec(value);
  if (!parts) return "Unavailable";
  const hour = Number(parts[1]);
  return `${String(hour % 12 || 12).padStart(2, "0")}:${parts[2]} ${hour < 12 ? "AM" : "PM"}`;
}

export function elapsedSession(row, now = new Date()) {
  if (!isOpenSession(row)) return "Unavailable";
  const seconds = Math.floor((now.getTime() - new Date(row.clocked_in_at).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "Check device clock";
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((part) => String(part).padStart(2, "0")).join(":");
}

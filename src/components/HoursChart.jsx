import { BarChart, Bar, Legend, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatBusinessDate } from "../lib/attendance";
import { displayHours } from "../lib/metrics";

function periodLabel(day) {
  return day.length === 7
    ? formatBusinessDate(`${day}-01`, { month: "short", year: "numeric" })
    : formatBusinessDate(day, { weekday: "short", month: "short", day: "numeric" });
}

export default function HoursChart({ rows, loading, error, onRetry, weekly = false }) {
  const period = weekly ? "weekly" : "attendance";
  if (loading) return <p role="status" className="text-xs">Loading {period} hours...</p>;
  if (error) return <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
    {weekly ? "Weekly" : "Attendance"} hours are unavailable. <button className="underline" onClick={onRetry}>Retry {period} hours</button>
  </p>;
  return <div className="hours-chart">
    {!rows.some(row => row.hours > 0 || (!row.future && row.hours === null)) && <p className="text-xs">No completed hours recorded {weekly ? "this week" : "for this period"}.</p>}
    {rows.some(row => !row.future && (row.hours === null || row.verified === null)) && <p className="text-xs" style={{ color: "var(--warning)" }}>Some hours are unavailable. Review your attendance records.</p>}
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={rows} accessibilityLayer margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey={weekly ? "label" : "day"} tickFormatter={weekly ? undefined : day => day.length === 7 ? periodLabel(day) : formatBusinessDate(day)} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={displayHours} axisLine={false} tickLine={false} domain={[0, "auto"]} />
        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
          labelFormatter={(_, entries) => entries?.[0]?.payload?.day ? periodLabel(entries[0].payload.day) : ""}
          formatter={(value, name) => [`${displayHours(value)} hrs`, name]} />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        <Bar dataKey="hours" name="Logged" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        <Bar dataKey="verified" name="Verified" fill="var(--success)" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
    <details>
      <summary className="text-xs cursor-pointer underline">View {weekly ? "daily" : "period"} hours</summary>
      <table className="w-full text-xs mt-2">
        <caption className="sr-only">Logged and verified hours {weekly ? "for this week" : "for the selected period"}</caption>
        <thead><tr>{[weekly ? "Day" : "Period", "Logged hours", "Verified hours"].map(label => <th key={label} scope="col" className="text-left py-1">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.day}>
          <th scope="row" className="text-left font-normal py-1">{periodLabel(row.day)}</th>
          {[row.hours, row.verified].map((value, index) => <td key={index}>{row.future ? "Upcoming" : value === null ? "Unavailable" : displayHours(value)}</td>)}
        </tr>)}</tbody>
      </table>
    </details>
  </div>;
}

import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import Shell from "./Shell";
import Modal from "./Modal";
import { useToast } from "./Toast";
import {
  IconGrid, IconClock, IconFileText, IconFolder,
  IconCheck, IconAward, IconAlertTriangle,
  IconUpload, IconUser, IconRefresh,
} from "./Icons";

// ── Nav ──────────────────────────────────────────────────────────────────────
const navItems = [
  { id: "dashboard", label: "My Dashboard", icon: <IconGrid size={15} /> },
  { id: "attendance", label: "My Attendance", icon: <IconClock size={15} /> },
  { id: "documents", label: "My Documents", icon: <IconFolder size={15} /> },
  { id: "evaluations", label: "My Evaluations", icon: <IconFileText size={15} /> },
];

// ── Static chart / eval data ─────────────────────────────────────────────────
const weeklyHours = [
  { day: "Apr 21", hours: 8.0 }, { day: "Apr 28", hours: 7.5 },
  { day: "May 5", hours: 8.2 }, { day: "May 12", hours: 8.0 },
  { day: "May 19", hours: 7.8 }, { day: "May 26", hours: 8.1 },
  { day: "Jun 2", hours: 7.9 },
];
const weekViews = ["Weekly", "Monthly", "Yearly", "All Time"] as const;
type WeekView = (typeof weekViews)[number];
const weeklyDataSets: Record<WeekView, typeof weeklyHours> = {
  Weekly: weeklyHours,
  Monthly: [{ day: "Feb", hours: 7.7 }, { day: "Mar", hours: 8.0 }, { day: "Apr", hours: 7.9 }, { day: "May", hours: 8.1 }],
  Yearly: [{ day: "Q1", hours: 7.6 }, { day: "Q2", hours: 8.0 }, { day: "Q3", hours: 7.8 }, { day: "Q4", hours: 8.1 }],
  "All Time": [{ day: "Jan", hours: 7.5 }, { day: "Feb", hours: 7.7 }, { day: "Mar", hours: 8.0 }, { day: "Apr", hours: 7.9 }, { day: "May", hours: 8.1 }],
};

const evaluationList = [
  { title: "Midterm Evaluation", subtitle: "OJT Coordinator: Dr. Cruz", date: "2025-05-12", score: 93, max: 100, feedback: "Excellent punctuality and task quality. Keep it up!" },
  { title: "Week 6 Check-in", subtitle: "OJT Coordinator: Dr. Cruz", date: "2025-05-05", score: 92, max: 100, feedback: "Good progress. Improve documentation practices." },
  { title: "Week 5 Check-in", subtitle: "OJT Coordinator: Dr. Cruz", date: "2025-04-28", score: 90, max: 100, feedback: "Satisfactory performance overall." },
];

// ── Interfaces ───────────────────────────────────────────────────────────────
interface DtrEntry {
  date: string; inTime: string; outTime: string; hours: string;
  verified: boolean; today: boolean; accomplishment?: string;
}
interface DocItem {
  id: string; name: string; status: "Pending" | "Approved" | "Needs Revision";
  fileName?: string; note?: string;
}
interface ExceptionRequest {
  id: number; date: string; claimedIn: string; claimedOut: string;
  reason: string; status: "Pending" | "Approved" | "Rejected"; submittedAt: string;
}

// ── Utilities ────────────────────────────────────────────────────────────────
function formatTime(d: Date) {
  const h = d.getHours(), m = d.getMinutes(), ampm = h >= 12 ? "PM" : "AM";
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}
function formatDateLabel(d: Date) {
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${days[d.getDay()]}`;
}
function elapsedHours(from: Date, to: Date) {
  return ((to.getTime() - from.getTime()) / 3600000).toFixed(1);
}

// ── Sub-components ───────────────────────────────────────────────────────────
interface StatCardProps {
  icon: React.ReactNode; iconBg: string; iconColor: string;
  label: string; value: string; sub: string;
}
function StatCard({ icon, iconBg, iconColor, label, value, sub }: StatCardProps) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: iconBg, color: iconColor }}>{icon}</div>
      <div className="text-2xl font-bold mb-0.5" style={{ color: "var(--foreground)" }}>{value}</div>
      <div className="text-xs font-medium mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{sub}</div>
    </div>
  );
}

function DocStatusBadge({ status }: { status: DocItem["status"] }) {
  const map = {
    Approved: { bg: "var(--success-bg)", color: "var(--success)" },
    Pending: { bg: "var(--warning-bg)", color: "var(--warning)" },
    "Needs Revision": { bg: "var(--danger-bg)", color: "var(--danger)" },
  };
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={map[status]}>
      {status}
    </span>
  );
}

// ── Initial data ─────────────────────────────────────────────────────────────
const initialDtr: DtrEntry[] = [
  { date: "May 19, Mon", inTime: "08:55 AM", outTime: "05:02 PM", hours: "8.1", verified: true, today: false, accomplishment: "Completed API module review and team standup." },
  { date: "May 16, Fri", inTime: "09:03 AM", outTime: "05:00 PM", hours: "7.9", verified: true, today: false, accomplishment: "Debugged login flow, wrote unit tests." },
  { date: "May 15, Thu", inTime: "08:48 AM", outTime: "05:01 PM", hours: "8.0", verified: true, today: false },
  { date: "May 14, Wed", inTime: "08:52 AM", outTime: "05:00 PM", hours: "8.0", verified: true, today: false },
  { date: "May 13, Tue", inTime: "09:10 AM", outTime: "05:00 PM", hours: "7.8", verified: false, today: false },
  { date: "May 12, Mon", inTime: "08:44 AM", outTime: "05:05 PM", hours: "8.2", verified: true, today: false },
];

const initialDocs: DocItem[] = [
  { id: "moa", name: "Memorandum of Agreement (MOA)", status: "Approved", fileName: "MOA_Santos.pdf" },
  { id: "endorsement", name: "Endorsement Letter", status: "Approved", fileName: "EndorsementLetter.pdf" },
  { id: "consent", name: "Parent / Guardian Consent Form", status: "Needs Revision", fileName: "ParentConsent_v1.pdf", note: "Please resubmit with guardian's signature and notarization date." },
  { id: "medical", name: "Medical Certificate", status: "Pending" },
];

const initialExceptions: ExceptionRequest[] = [
  { id: 1, date: "May 15, Thu", claimedIn: "08:30 AM", claimedOut: "05:00 PM", reason: "Forgot to clock in — was in a pre-shift briefing", status: "Pending", submittedAt: "May 16, 2025" },
];

// ── Dashboard ────────────────────────────────────────────────────────────────
export default function InternDashboard({ onLogout }: { onLogout: () => void }) {
  const { toast } = useToast();
  const [tab, setTab] = useState("dashboard");
  const [weekView, setWeekView] = useState<WeekView>("Weekly");
  const [attendanceChartPeriod, setAttendanceChartPeriod] = useState<WeekView>("Weekly");
  const [showWeekPicker, setShowWeekPicker] = useState(false);

  // Clock
  const [clockInTime, setClockInTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("00:00:00");
  const [dtrEntries, setDtrEntries] = useState<DtrEntry[]>(initialDtr);
  const [hoursRendered, setHoursRendered] = useState(312);

  // Accomplishment modal
  const [showAccomplModal, setShowAccomplModal] = useState(false);
  const [accomplishment, setAccomplishment] = useState("");

  // DTR filter & exceptions
  const [dtrFilter, setDtrFilter] = useState<"all" | "week" | "month" | "year">("all");
  const [dtrPage, setDtrPage] = useState(1);
  const [documentYear, setDocumentYear] = useState("current");
  const [exceptions, setExceptions] = useState<ExceptionRequest[]>(initialExceptions);
  const [exForm, setExForm] = useState({ date: "", claimedIn: "", claimedOut: "", reason: "" });
  const exNextId = useRef(2);

  // Documents
  const [docs, setDocs] = useState<DocItem[]>(initialDocs);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const hoursRequired = 500;
  const progress = Math.round((hoursRendered / hoursRequired) * 100);
  const isClockedIn = clockInTime !== null;

  // Forecaster

  // DTR filtered view
  const filteredDtr = dtrFilter === "week" ? dtrEntries.slice(0, 5)
    : dtrFilter === "month" ? dtrEntries.slice(0, 20)
    : dtrFilter === "year" ? dtrEntries
    : dtrEntries;
  const dtrPageSize = 4;
  const dtrPageCount = Math.max(1, Math.ceil(filteredDtr.length / dtrPageSize));
  const pagedDtr = filteredDtr.slice((dtrPage - 1) * dtrPageSize, dtrPage * dtrPageSize);

  // Live timer
  useEffect(() => {
    if (!clockInTime) return;
    const id = setInterval(() => {
      const diff = Date.now() - clockInTime.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    }, 1000);
    return () => clearInterval(id);
  }, [clockInTime]);

  const handleClockIn = () => {
    const now = new Date();
    setClockInTime(now);
    setElapsed("00:00:00");
    const newEntry: DtrEntry = {
      date: formatDateLabel(now), inTime: formatTime(now),
      outTime: "—", hours: "—", verified: false, today: true,
    };
    setDtrEntries((prev) => [newEntry, ...prev.map((e) => ({ ...e, today: false }))]);
    toast("Clocked in at " + formatTime(now), "success");
  };

  const handleClockOut = (accomp: string) => {
    if (!clockInTime) return;
    const now = new Date();
    const hrs = elapsedHours(clockInTime, now);
    setDtrEntries((prev) =>
      prev.map((e) => e.today ? { ...e, outTime: formatTime(now), hours: hrs, today: false, accomplishment: accomp } : e)
    );
    setHoursRendered((h) => parseFloat((h + parseFloat(hrs)).toFixed(1)));
    setClockInTime(null);
    setElapsed("00:00:00");
    toast(`Clocked out — ${hrs} hrs logged`, "success");
  };

  const submitException = () => {
    if (!exForm.date || !exForm.claimedIn || !exForm.claimedOut || !exForm.reason.trim()) {
      toast("Please complete all fields", "error"); return;
    }
    setExceptions((prev) => [
      ...prev,
      { id: exNextId.current++, ...exForm, status: "Pending", submittedAt: new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) },
    ]);
    setExForm({ date: "", claimedIn: "", claimedOut: "", reason: "" });
    toast("Exception request submitted — awaiting coordinator review", "info");
  };

  const handleDocUpload = (docId: string, file: File) => {
    setDocs((prev) => prev.map((d) => d.id === docId ? { ...d, fileName: file.name, status: "Pending", note: undefined } : d));
    toast(`${file.name} uploaded — pending coordinator review`, "info");
  };

  const visibleDocs = ["current", "all", "2024-2025"].includes(documentYear) ? docs : [];
  const visibleDocApprovedCount = visibleDocs.filter((d) => d.status === "Approved").length;

  // ── Input style helper ─────────────────────────────────────────────────────
  const inputCls = "w-full text-sm py-2 px-3 rounded-lg border outline-none";
  const inputStyle = { borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" };

  return (
    <Shell userName="Andrea Santos" userEmail="andrea@intern.ph" userRole="Student/Intern"
      navItems={navItems} activeTab={tab} onTabChange={setTab} onLogout={onLogout}>
      <div className="dashboard-content p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-5">

        {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
        {tab === "dashboard" && (
          <>
            <div>
              <h1 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>Hi, Andrea Santos!</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>Batangas State University · TechCorp PH · A.Y. 2024–2025</p>
            </div>

            <details className="rounded-xl px-4 py-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <summary className="text-sm font-semibold cursor-pointer">Internship assignment details</summary>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                {[
                  ["Instructor", "Dr. Ramon Cruz"],
                  ["Company", "TechCorp PH"],
                  ["Section", "BSIT 4A"],
                  ["Academic year", "2024–2025"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                    <div className="text-sm font-medium mt-0.5">{value}</div>
                  </div>
                ))}
              </div>
            </details>

            <div className="rounded-xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              style={{ background: isClockedIn ? "var(--info-bg)" : "var(--card)", border: `1px solid ${isClockedIn ? "var(--info)" : "var(--border)"}` }}>
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: isClockedIn ? "var(--info)" : "var(--primary-light)", color: isClockedIn ? "#fff" : "var(--primary)" }}>
                  <IconClock size={18} />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: isClockedIn ? "var(--info)" : "var(--muted-foreground)" }}>
                    Today's attendance
                  </div>
                  <div className="text-sm font-semibold mt-0.5">
                    {isClockedIn ? `Active session · ${elapsed}` : "Not clocked in"}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                    {isClockedIn && clockInTime ? `Started at ${formatTime(clockInTime)}` : "Start your shift when you arrive at your assigned workplace."}
                  </div>
                </div>
              </div>
              <button
                onClick={() => isClockedIn ? setShowAccomplModal(true) : handleClockIn()}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold shrink-0"
                style={{ background: isClockedIn ? "var(--danger)" : "var(--primary)", color: "#fff" }}>
                <IconClock size={14} />
                {isClockedIn ? "Clock Out" : "Clock In"}
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard icon={<IconClock size={18} />} iconBg="#eff6ff" iconColor="#2563eb" label="Logged Hours" value={`${hoursRendered}`} sub="Includes verified and pending entries" />
              <StatCard icon={<IconCheck size={18} />} iconBg="#f0fdf4" iconColor="#16a34a" label="Current A.Y. Progress" value={`${progress}%`} sub={`of ${hoursRequired} assigned hours`} />
              <StatCard icon={<IconAward size={18} />} iconBg="#fefce8" iconColor="#d97706" label="Latest Evaluation" value="93/100" sub="Informational performance score" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3 space-y-4">

                {/* Chart */}
                <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold">{weekView} Hours Log</h2>
                    <div className="relative">
                      <button className="text-xs" style={{ color: "var(--primary)" }} onClick={() => setShowWeekPicker((v) => !v)}>
                        {weekView} ▾
                      </button>
                      {showWeekPicker && (
                        <div className="absolute right-0 top-6 z-10 rounded-lg shadow-lg overflow-hidden"
                          style={{ background: "var(--card)", border: "1px solid var(--border)", minWidth: "110px" }}>
                          {weekViews.map((v) => (
                            <button key={v} onClick={() => { setWeekView(v); setShowWeekPicker(false); }}
                              className="w-full text-left px-3 py-2 text-xs transition-colors"
                              style={{ background: weekView === v ? "var(--primary-light)" : "transparent", color: weekView === v ? "var(--primary)" : "var(--foreground)" }}>
                              {v}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={weeklyDataSets[weekView]} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} domain={[6, 10]} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v) => [`${v} hrs`, "Hours"]} />
                      <Area type="monotone" dataKey="hours" stroke="var(--primary)" strokeWidth={2} fill="url(#hoursGrad)"
                        dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Progress */}
                <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold">Current Academic Year Progress</span>
                    <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>{progress}%</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--secondary)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: "var(--primary)" }} />
                  </div>
                  <div className="flex justify-between mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    <span>{hoursRendered} logged hrs</span>
                    <span>{(hoursRequired - hoursRendered).toFixed(1)} hrs remaining</span>
                  </div>
                </div>

              </div>

              {/* Evaluations panel */}
              <div className="lg:col-span-2 rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-sm font-semibold">Recent Evaluations</span>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: "380px" }}>
                  {evaluationList.map((ev, i) => (
                    <div key={i} className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">{ev.title}</div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{ev.subtitle}</div>
                          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{ev.date}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold" style={{ color: "var(--primary)" }}>{ev.score}/{ev.max}</div>
                          <div className="mt-1 h-1 w-14 rounded-full overflow-hidden ml-auto" style={{ background: "var(--secondary)" }}>
                            <div className="h-full rounded-full" style={{ width: `${(ev.score / ev.max) * 100}%`, background: "var(--primary)" }} />
                          </div>
                        </div>
                      </div>
                      {ev.feedback && (
                        <p className="text-xs mt-2 italic" style={{ color: "var(--muted-foreground)" }}>"{ev.feedback}"</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── ATTENDANCE ────────────────────────────────────────────────── */}
        {tab === "attendance" && (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold">My Attendance</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>TechCorp Manila · OJT Coordinator: Dr. Cruz · Manila time</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toast("Attendance data refreshed", "success")}
                  title="Refresh attendance data" aria-label="Refresh attendance data"
                  className="w-9 h-9 flex items-center justify-center rounded-lg border shrink-0"
                  style={{ borderColor: "var(--border)", color: "var(--primary)" }}>
                  <IconRefresh size={15} />
                </button>
                <button
                  onClick={() => isClockedIn ? setShowAccomplModal(true) : handleClockIn()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{ background: isClockedIn ? "var(--danger-bg)" : "var(--primary)", color: isClockedIn ? "var(--danger)" : "#fff" }}>
                  <IconClock size={14} />
                  {isClockedIn ? "Clock Out" : "Clock In"}
                </button>
              </div>
            </div>

            {/* Active session banner */}
            {isClockedIn && (
              <div className="rounded-xl p-4 flex items-center gap-4" style={{ background: "var(--info-bg)", border: "1px solid var(--info)" }}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse" style={{ background: "var(--info)" }} />
                <div className="flex-1">
                  <div className="text-xs font-semibold" style={{ color: "var(--info)" }}>Session Active</div>
                  <div className="text-xs" style={{ color: "var(--info)" }}>Clocked in at {clockInTime ? formatTime(clockInTime) : "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold font-mono" style={{ color: "var(--info)" }}>{elapsed}</div>
                  <div className="text-xs" style={{ color: "var(--info)" }}>elapsed</div>
                </div>
              </div>
            )}

            <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold">Recorded Hours</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>Chart period is independent from the history filter below.</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium">
                  Chart period
                  <select value={attendanceChartPeriod} onChange={(e) => setAttendanceChartPeriod(e.target.value as WeekView)}
                    className="text-xs px-3 py-2 rounded-lg border outline-none" style={inputStyle}>
                    {weekViews.map((period) => <option key={period}>{period}</option>)}
                  </select>
                </label>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={weeklyDataSets[attendanceChartPeriod]} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} domain={[6, 10]} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(v) => [`${v} hrs`, "Recorded hours"]} />
                  <Area type="monotone" dataKey="hours" stroke="var(--primary)" strokeWidth={2} fill="var(--primary-light)"
                    dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* DTR table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div>
                  <span className="text-sm font-semibold">Daily Time Record (DTR)</span>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>Attendance history</p>
                </div>
                <div className="flex rounded-lg overflow-x-auto self-start sm:self-auto max-w-full" style={{ border: "1px solid var(--border)" }}>
                  {(["all","week","month","year"] as const).map((f) => (
                    <button key={f} onClick={() => { setDtrFilter(f); setDtrPage(1); }}
                      className="text-xs px-2.5 py-2 whitespace-nowrap"
                      style={{ background: dtrFilter === f ? "var(--primary)" : "transparent", color: dtrFilter === f ? "#fff" : "var(--muted-foreground)" }}>
                      {f === "all" ? "All" : f === "week" ? "This Week" : f === "month" ? "This Month" : "This Year"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-4 py-2.5 text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>
                <span><strong style={{ color: "var(--success)" }}>Verified</strong> hours were reviewed and remain part of logged hours</span>
                <span><strong style={{ color: "var(--warning)" }}>Pending</strong> hours are logged and await coordinator review</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr style={{ background: "var(--muted)" }}>
                      {["Date", "Time In", "Time Out", "Hours", "Accomplishments", "Status"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedDtr.map((d, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-4 py-3 text-xs font-medium whitespace-nowrap">
                          {d.date}
                          {d.today && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded text-white" style={{ background: "var(--primary)", fontSize: "9px" }}>TODAY</span>}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">{d.inTime}</td>
                        <td className="px-4 py-3 text-xs font-mono" style={{ color: d.outTime === "—" ? "var(--muted-foreground)" : undefined }}>
                          {d.outTime === "—" && isClockedIn ? <span className="font-mono" style={{ color: "var(--info)" }}>{elapsed}</span> : d.outTime}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">{d.hours}</td>
                        <td className="px-4 py-3 text-xs max-w-xs" style={{ color: "var(--muted-foreground)" }}>
                          {d.accomplishment ? <span style={{ color: "var(--foreground)" }}>{d.accomplishment}</span> : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={d.today ? { background: "var(--info-bg)", color: "var(--info)" }
                              : d.verified ? { background: "var(--success-bg)", color: "var(--success)" }
                              : { background: "var(--warning-bg)", color: "var(--warning)" }}>
                            {d.today ? "In Progress" : d.verified ? "Verified" : "Pending"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {pagedDtr.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>No records for this period.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {filteredDtr.length === 0 ? "No records" : `${(dtrPage - 1) * dtrPageSize + 1}–${Math.min(dtrPage * dtrPageSize, filteredDtr.length)} of ${filteredDtr.length} records`}
                </span>
                <div className="flex items-center gap-2">
                  <button disabled={dtrPage === 1} onClick={() => setDtrPage((p) => p - 1)}
                    className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-40" style={{ borderColor: "var(--border)" }}>Previous</button>
                  <span className="text-xs font-medium">Page {dtrPage} of {dtrPageCount}</span>
                  <button disabled={dtrPage === dtrPageCount} onClick={() => setDtrPage((p) => p + 1)}
                    className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-40" style={{ borderColor: "var(--border)" }}>Next</button>
                </div>
              </div>
            </div>

            {/* Exception Request */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2">
                  <IconAlertTriangle size={14} style={{ color: "var(--warning)" }} />
                  <span className="text-sm font-semibold">Time Log Exception Request</span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>Submit a correction request for missed or incorrect clock entries.</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>Date</label>
                    <input type="date" value={exForm.date} onChange={(e) => setExForm((f) => ({ ...f, date: e.target.value }))}
                      className={inputCls} style={inputStyle} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>Clock In</label>
                      <input type="time" value={exForm.claimedIn} onChange={(e) => setExForm((f) => ({ ...f, claimedIn: e.target.value }))}
                        className={inputCls} style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>Clock Out</label>
                      <input type="time" value={exForm.claimedOut} onChange={(e) => setExForm((f) => ({ ...f, claimedOut: e.target.value }))}
                        className={inputCls} style={inputStyle} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>Reason / Explanation</label>
                  <textarea rows={2} value={exForm.reason} onChange={(e) => setExForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="Explain why a correction is needed..."
                    className="w-full text-sm py-2 px-3 rounded-lg border outline-none resize-none"
                    style={inputStyle} />
                </div>
                <div className="flex justify-end">
                  <button onClick={submitException} className="text-sm px-4 py-2 rounded-lg font-semibold"
                    style={{ background: "var(--primary)", color: "#fff" }}>
                    Submit Request
                  </button>
                </div>
              </div>

              {exceptions.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="px-4 py-2.5">
                    <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>My Submitted Requests</span>
                  </div>
                  {exceptions.map((ex) => (
                    <div key={ex.id} className="px-4 py-3 flex items-start justify-between gap-3"
                      style={{ borderTop: "1px solid var(--border)" }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">{ex.date} · {ex.claimedIn} – {ex.claimedOut}</div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>{ex.reason}</div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>Submitted: {ex.submittedAt}</div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
                        style={ex.status === "Approved" ? { background: "var(--success-bg)", color: "var(--success)" }
                          : ex.status === "Rejected" ? { background: "var(--danger-bg)", color: "var(--danger)" }
                          : { background: "var(--warning-bg)", color: "var(--warning)" }}>
                        {ex.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── DOCUMENTS ─────────────────────────────────────────────────── */}
        {tab === "documents" && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold">My Documents</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  Required internship submissions · {visibleDocApprovedCount}/{visibleDocs.length || 0} approved
                </p>
              </div>
              <label className="text-xs font-medium">
                Academic year
                <select value={documentYear} onChange={(e) => setDocumentYear(e.target.value)}
                  className="block mt-1 text-sm px-3 py-2 rounded-lg border outline-none min-w-48" style={inputStyle}>
                  <option value="current">Current assignment</option>
                  <option value="all">All academic years</option>
                  <option value="2024-2025">A.Y. 2024–2025</option>
                  <option value="2023-2024">A.Y. 2023–2024</option>
                  <option value="unassigned">Unassigned year</option>
                </select>
              </label>
            </div>

            <div className="space-y-3">
              {visibleDocs.map((doc) => (
                <div key={doc.id} className="rounded-xl p-4" style={{ background: "var(--card)", border: `1px solid ${doc.status === "Needs Revision" ? "#fca5a5" : "var(--border)"}` }}>
                  <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: doc.status === "Approved" ? "var(--success-bg)" : doc.status === "Needs Revision" ? "var(--danger-bg)" : "var(--warning-bg)" }}>
                      {doc.status === "Approved"
                        ? <IconCheck size={16} style={{ color: "var(--success)" }} />
                        : doc.status === "Needs Revision"
                        ? <IconAlertTriangle size={16} style={{ color: "var(--danger)" }} />
                        : <IconFileText size={16} style={{ color: "var(--warning)" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{doc.name}</span>
                        <DocStatusBadge status={doc.status} />
                      </div>
                      {doc.fileName && (
                        <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                          <IconFileText size={11} /> {doc.fileName}
                        </div>
                      )}
                      {doc.note && (
                        <div className="text-xs mt-1.5 px-2 py-1.5 rounded-lg" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                          <strong>Note:</strong> {doc.note}
                        </div>
                      )}
                    </div>
                    <div className="w-full sm:w-auto shrink-0 flex items-center gap-2 flex-wrap justify-end">
                      {doc.fileName && (
                        <>
                          <button onClick={() => toast(`Opening ${doc.fileName}`, "info")}
                            className="text-xs px-2.5 py-1.5 rounded-lg" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>
                            View file
                          </button>
                          <button onClick={() => toast(`${doc.fileName} downloaded`, "success")}
                            className="text-xs px-2.5 py-1.5 rounded-lg" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>
                            Download file
                          </button>
                        </>
                      )}
                      <input type="file" accept=".pdf,.doc,.docx,.jpg,.png"
                        ref={(el) => { fileInputRefs.current[doc.id] = el; }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(doc.id, f); e.target.value = ""; }}
                        className="hidden" />
                      <button onClick={() => fileInputRefs.current[doc.id]?.click()}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                        style={{ background: doc.status === "Approved" ? "var(--secondary)" : "var(--primary)", color: doc.status === "Approved" ? "var(--muted-foreground)" : "#fff" }}>
                        <IconUpload size={12} />
                        {doc.status === "Approved" ? "Replace" : doc.fileName ? "Resubmit" : "Upload"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {visibleDocs.length === 0 && (
                <div className="rounded-xl p-8 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="text-sm font-semibold">No document records available</div>
                  <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>This academic-year scope has no assigned document checklist.</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── EVALUATIONS ───────────────────────────────────────────────── */}
        {tab === "evaluations" && (
          <>
            <div>
              <h1 className="text-xl font-bold">My Evaluations</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>Informational performance feedback from your OJT Coordinator</p>
            </div>
            <div className="space-y-3">
              {evaluationList.map((ev, i) => (
                <div key={i} className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{ev.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{ev.subtitle} · {ev.date}</div>
                      {ev.feedback && (
                        <p className="text-sm mt-2 italic" style={{ color: "var(--muted-foreground)" }}>"{ev.feedback}"</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold" style={{ color: "var(--primary)" }}>
                        {ev.score}<span className="text-sm font-normal" style={{ color: "var(--muted-foreground)" }}>/{ev.max}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-24 rounded-full overflow-hidden ml-auto" style={{ background: "var(--secondary)" }}>
                        <div className="h-full rounded-full" style={{ width: `${(ev.score / ev.max) * 100}%`, background: "var(--primary)" }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

      </div>

      {/* ── Accomplishment Modal ─────────────────────────────────────────── */}
      {showAccomplModal && (
        <Modal title="Log Today's Accomplishments" onClose={() => setShowAccomplModal(false)} width="480px">
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Before clocking out, please briefly describe the tasks you completed during your shift.
            </p>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
                Accomplishments / Tasks Completed <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <textarea
                rows={5}
                value={accomplishment}
                onChange={(e) => setAccomplishment(e.target.value)}
                placeholder="e.g., Completed API integration for the user auth module, attended team standup, reviewed pull request #45, wrote unit tests for the login flow..."
                className="w-full text-sm rounded-lg border outline-none resize-none p-3"
                style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
              <div className="text-xs mt-1 text-right" style={{ color: "var(--muted-foreground)" }}>
                {accomplishment.trim().length} / 500 characters
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowAccomplModal(false)} className="text-sm px-4 py-2 rounded-lg"
                style={{ background: "var(--secondary)", color: "var(--foreground)" }}>Cancel</button>
              <button
                disabled={!accomplishment.trim()}
                onClick={() => { handleClockOut(accomplishment.trim()); setAccomplishment(""); setShowAccomplModal(false); }}
                className="text-sm px-4 py-2 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--danger)", color: "#fff" }}>
                Clock Out &amp; Save Log
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

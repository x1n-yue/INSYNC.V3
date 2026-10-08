import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "../lib/supabaseClient";
import { manilaDate, recordRpc } from "../lib/authority";
import { elapsedSession, formatBusinessDate, formatClockTime, isOpenSession } from "../lib/attendance";
import { downloadArtifact, dtrArtifact } from "../lib/exports";
import { evaluationResult } from "../lib/business";
import { chartHours, displayHours, filterAttendance, internMetrics } from "../lib/metrics";
import { completeRows } from "../lib/workflows";
import { recoverUpload, uploadDocument } from "../lib/documents";
import DocumentActions from "./DocumentActions";
import EvaluationCriteria from "./EvaluationCriteria";
import AnnouncementsFeed from "./AnnouncementsFeed";
import Shell from "./Shell";
import Modal from "./Modal";
import RefreshStatus from "./RefreshStatus";
import { academicRows, onboardingItems } from "../lib/assignments";
import { captureRequest } from "../lib/requests";
import { useToast } from "./Toast";
import {
  IconGrid,
  IconClock,
  IconFileText,
  IconFileDown,
  IconFolder,
  IconCheck,
  IconTrendingUp,
  IconCalendar,
  IconAward,
  IconAlertTriangle,
  IconUpload,
} from "./Icons";

const navItems = [
  { id: "dashboard", label: "My Dashboard", icon: <IconGrid size={15} /> },
  { id: "attendance", label: "My Attendance", icon: <IconClock size={15} /> },
  { id: "documents", label: "My Documents", icon: <IconFolder size={15} /> },
  { id: "evaluations", label: "My Evaluations", icon: <IconFileText size={15} /> },
  { id: "reports", label: "Reports", icon: <IconFileDown size={15} /> },
];

const weekViews = ["Weekly", "Monthly", "Yearly", "All Time"];
const dtrFilters = ["all", "week", "month", "year"];

function formatTime(d) {
  return formatClockTime(d);
}

function StatCard({ icon, iconBg, iconColor, label, value, sub }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: iconBg, color: iconColor }}>
        {icon}
      </div>
      <div className="text-2xl font-bold mb-0.5" style={{ color: "var(--foreground)" }}>{value}</div>
      <div className="text-xs font-medium mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{sub}</div>
    </div>
  );
}

function DocStatusBadge({ status }) {
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

const todayStr = () => manilaDate();
const inputCls = "w-full text-sm py-2 px-3 rounded-lg border outline-none";
const inputStyle = { borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" };

export default function InternDashboard({ profile, onLogout }) {
  const { toast } = useToast();
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [academicYears, setAcademicYears] = useState([]);
  const [documentYear, setDocumentYear] = useState("current");
  const [exportBusy, setExportBusy] = useState(false);
  const exportDtr = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const artifact = await dtrArtifact(supabase, profile.id);
      downloadArtifact(artifact);
      toast(`Download requested: ${artifact.filename} (${artifact.count} records)`);
    } catch (error) {
      toast(error.message || "DTR export failed", "error");
    } finally { setExportBusy(false); }
  };
  const [clockBusy, setClockBusy] = useState(false);
  const [clockLoadError, setClockLoadError] = useState(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(null);
  const [recoveryRows, setRecoveryRows] = useState([]);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const [resourceErrors, setResourceErrors] = useState({});
  const loadSequence = useRef(0);
  const [attendanceKnown, setAttendanceKnown] = useState(false);
  const [documentsKnown, setDocumentsKnown] = useState(false);
  const [internInfo, setInternInfo] = useState(null); // { required_hours, companies:{name}, profiles:{full_name} }
  const [dtr, setDtr] = useState([]); // attendance_logs, newest first
  const [evaluationList, setEvaluationList] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [docs, setDocs] = useState([]);
  const [weekView, setWeekView] = useState("Weekly");
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [dtrFilter, setDtrFilter] = useState("all");

  // Live elapsed timer while clocked in
  const [elapsed, setElapsed] = useState("00:00:00");

  // Accomplishment modal (shown before clock-out)
  const [showAccomplModal, setShowAccomplModal] = useState(false);
  const [accomplishment, setAccomplishment] = useState("");

  // Exception form
  const [exForm, setExForm] = useState({ date: "", endDate: "", claimedIn: "", claimedOut: "", reason: "" });

  // Document upload
  const fileInputRefs = useRef({});

  const loadAll = async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    const capture = captureRequest;
    try {
      const [internResult, attendanceResult, evalResult, exceptionResult, docResult, openResult, yearResult] = await Promise.all([
        capture(supabase.from("interns").select("*, companies(name), course_sections(name), academic_years(label)").eq("id", profile.id).maybeSingle()),
        capture(completeRows(supabase, "attendance_logs", profile.id).then(data => ({ data }))),
        capture(supabase.from("evaluations").select("*").eq("intern_id", profile.id).order("created_at", { ascending: false })),
        capture(supabase.from("attendance_exceptions").select("*").eq("intern_id", profile.id).order("created_at", { ascending: false })),
        capture(completeRows(supabase, "documents", profile.id).then(data => ({ data }))),
        capture(supabase.from("attendance_logs").select("*").eq("intern_id", profile.id).is("time_out", null).maybeSingle()),
        capture(supabase.from("academic_years").select("*").order("label", { ascending: false })),
      ]);
      if (sequence !== loadSequence.current) return;
      const errors = {};
      const mark = (key, result) => { if (result?.error) errors[key] = result.error.message || String(result.error); };
      mark("intern", internResult); mark("attendance", attendanceResult); mark("evaluations", evalResult); mark("exceptions", exceptionResult); mark("documents", docResult); mark("openSession", openResult);
      mark("years", yearResult);
      if (!errors.years) setAcademicYears(yearResult.data ?? []);
      const nameIds = [...new Set([internResult.data?.instructor_id, ...(evalResult.data ?? []).map(e => e.evaluator_id)].filter(Boolean))];
      const namesResult = await capture(supabase.rpc("related_profile_names", { p_ids: nameIds }));
      if (namesResult.error) errors.names = namesResult.error.message;
      if (sequence !== loadSequence.current) return;
      const names = Object.fromEntries((namesResult.data ?? []).map(p => [p.id, { full_name: p.full_name }]));
      if (!errors.intern) setInternInfo(internResult.data ? { ...internResult.data, profiles: names[internResult.data.instructor_id] } : null);
      if (!errors.openSession) setClockLoadError(null); else setClockLoadError(errors.openSession);
      setMetricsError(errors.intern || errors.attendance || errors.documents || null);
      setAttendanceKnown(!errors.attendance && Array.isArray(attendanceResult.data));
      setDocumentsKnown(!errors.documents && Array.isArray(docResult.data));
      if (!errors.attendance) {
        const history = [...(attendanceResult.data ?? [])].sort((a,b) => b.log_date.localeCompare(a.log_date) || b.id.localeCompare(a.id));
        setDtr(!errors.openSession && openResult.data && !history.some(row => row.id === openResult.data.id) ? [openResult.data, ...history] : history);
      }
      if (!errors.evaluations) setEvaluationList((evalResult.data ?? []).sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).map(e => ({ ...e, profiles: names[e.evaluator_id] })));
      if (!errors.exceptions) setExceptions(exceptionResult.data ?? []);
      if (!errors.documents) setDocs(docResult.data ?? []);
      setResourceErrors(errors);
      if (!Object.values(errors).some(Boolean)) setLastUpdated(new Date());
    } catch (error) {
      if (sequence === loadSequence.current) {
        setResourceErrors(prev => ({ ...prev, dashboard: error.message || "Dashboard refresh failed" }));
        setMetricsError(error.message || "Dashboard refresh failed");
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  };
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const todayRow = dtr.find((d) => d.time_in && !d.time_out) ?? dtr.find((d) => d.log_date === todayStr());
  const clockInDate = isOpenSession(todayRow) ? new Date(todayRow.clocked_in_at) : null;
  const isClockedIn = Boolean(todayRow && todayRow.time_in && !todayRow.time_out);

  // Live elapsed timer
  useEffect(() => {
    if (!isClockedIn || !isOpenSession(todayRow)) {
      setElapsed(isClockedIn ? "Legacy session · correction required" : "00:00:00");
      return;
    }
    const id = setInterval(() => {
      setElapsed(elapsedSession(todayRow));
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClockedIn, todayRow?.clocked_in_at]);

  const handleClockIn = async () => {
    if (clockBusy || clockLoadError) return;
    setClockBusy(true);
    try {
      const result = await recordRpc(supabase, "clock_in");
      if (!result.ok) return toast(result.error, "error");
      setDtr((prev) => [result.data, ...prev]);
      toast("Clocked in at " + result.data.time_in, "success");
    } finally { setClockBusy(false); }
  };

  const handleClockOut = async (accomp) => {
    if (!todayRow || clockBusy || clockLoadError) return { ok: false };
    setClockBusy(true);
    try {
      const result = await recordRpc(supabase, "clock_out", { p_id: todayRow.id, p_accomplishment: accomp });
      if (!result.ok) { toast(result.error, "error"); return result; }
      setDtr((prev) => prev.map((d) => d.id === result.data.id ? result.data : d));
      toast(`Clocked out — ${Number(result.data.hours).toFixed(2)} hrs logged`, "success");
      return result;
    } finally { setClockBusy(false); }
  };

  const submitException = async () => {
    if (!exForm.date || !exForm.claimedIn || !exForm.claimedOut || !exForm.reason.trim()) {
      toast("Please complete all fields", "error");
      return;
    }
    if (correctionBusy) return;
    setCorrectionBusy(true);
    try {
      const result = await recordRpc(supabase, "submit_correction", {
        p_date: exForm.date, p_in: exForm.claimedIn, p_out: exForm.claimedOut,
        p_end: exForm.endDate || exForm.date, p_reason: exForm.reason.trim(),
      });
      if (!result.ok) return toast(result.error, "error");
      setExceptions((prev) => [result.data, ...prev]);
      setExForm({ date: "", endDate: "", claimedIn: "", claimedOut: "", reason: "" });
      toast("Exception request submitted — awaiting instructor review", "info");
    } finally { setCorrectionBusy(false); }
  };

  const refreshRecovery = async () => {
    const { data, error } = await captureRequest(supabase.rpc("unfinished_document_uploads"));
    if (error) toast("Upload recovery unavailable: " + error.message, "error");
    else setRecoveryRows(data ?? []);
  };
  useEffect(() => { refreshRecovery(); /* own expired/abandoned receipts only */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);
  const handleDocUpload = async (doc, file) => {
    if (uploadBusy) return;
    setUploadBusy(doc.id);
    try {
      const result = await uploadDocument(supabase, doc, file);
      if (!result.ok) { toast(result.error, "error"); await refreshRecovery(); return result; }
      setDocs(prev => prev.map(d => d.id === result.data.id ? result.data : d));
      toast("Upload finalized; pending review", "info"); return result;
    } finally { setUploadBusy(null); }
  };
  const cleanupUpload = async (uploadId) => {
    if (recoveryBusy || uploadBusy) return;
    setRecoveryBusy(true);
    try {
      const result = await recoverUpload(supabase, uploadId);
      if (result.ok) setDocs(prev => prev.map(d => d.id === result.data.id ? result.data : d));
      toast(result.ok ? "Finalized upload recovered" : result.cleanupPending ? result.error : "Unfinished upload cleanup confirmed", result.cleanupPending ? "error" : "info");
      await refreshRecovery();
    } finally { setRecoveryBusy(false); }
  };
  const metric = useMemo(() => internMetrics({ internId: profile.id, required: internInfo?.required_hours, academicYearId: internInfo?.academic_year_id ?? null,
    attendance: attendanceKnown ? dtr : null, documents: documentsKnown ? docs : null }), [profile.id, internInfo, attendanceKnown, documentsKnown, dtr, docs]);
  const hoursRendered = metric.logged;
  const hoursRequired = metric.target;
  const progress = metric.progress;
  const remainingHours = metric.remaining;
  const filteredDtr = filterAttendance(dtr, dtrFilter);
  const latestEval = academicRows(evaluationList, internInfo?.academic_year_id)?.[0];
  const docApprovedCount = metric.approved;
  const clearanceReady = metric.cleared;
  const currentDocs = academicRows(docs, internInfo?.academic_year_id) ?? [];
  const visibleDocs = documentYear === "all" ? docs : documentYear === "current" ? currentDocs : academicRows(docs, documentYear === "unassigned" ? null : documentYear) ?? [];
  const onboarding = onboardingItems(internInfo, documentsKnown ? currentDocs : null);
  const yearName = (id) => id ? academicYears.find(year => year.id === id)?.label ?? "Academic year unavailable" : "Unassigned academic year";
  const weeklyDataSets = useMemo(() => {
    const rows = academicRows(dtr, internInfo?.academic_year_id) ?? [];
    return { Weekly: chartHours(rows, "week"), Monthly: chartHours(rows, "month"), Yearly: chartHours(rows, "year"), "All Time": chartHours(rows, "all") };
  }, [dtr, internInfo?.academic_year_id]);

  const stats = [
    { icon: <IconClock size={18} />, iconBg: "#eff6ff", iconColor: "#2563eb", label: "Logged Hours", value: displayHours(hoursRendered), sub: `Verified: ${displayHours(metric.verified)} / ${hoursRequired ?? "Unavailable"} required` },
    { icon: <IconCheck size={18} />, iconBg: "#f0fdf4", iconColor: "#16a34a", label: "Completion", value: progress === null ? "Unavailable" : `${progress}%`, sub: `Verified progress | ${metric.risk}` },
    { icon: <IconAward size={18} />, iconBg: "#fefce8", iconColor: "#d97706", label: "Latest Score", value: evaluationResult(latestEval) !== null ? `${evaluationResult(latestEval)}/100` : "—", sub: "Most recent evaluation" },
  ];

  return (
    <Shell
      userName={profile.full_name}
      userEmail={profile.email}
      userRole="Student/Intern"
      navItems={navItems}
      activeTab={tab}
      onTabChange={setTab}
      onLogout={onLogout}
    >
      <div className="p-6 space-y-5">
        <RefreshStatus loading={loading || clockBusy || correctionBusy || uploadBusy !== null || recoveryBusy} lastUpdated={lastUpdated} onRefresh={loadAll} />
        {Object.values(resourceErrors).some(Boolean) && <div role="alert" className="rounded-lg px-4 py-3 text-sm flex flex-wrap gap-3 items-center" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}><span>Some dashboard data is unavailable; displayed values may be stale.</span><button onClick={loadAll} className="underline font-semibold">Retry refresh</button></div>}
        {metricsError && <p role="alert" className="text-sm">Progress unavailable: {metricsError}</p>}
        {loading && <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading…</div>}
        {!loading && <section className="rounded-xl p-4 space-y-2" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold">My Internship Assignment</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            {[
              ["Instructor", resourceErrors.intern ? "Unavailable" : internInfo?.instructor_id ? internInfo?.profiles?.full_name ?? "Unavailable" : "Unassigned"],
              ["Company", resourceErrors.intern ? "Unavailable" : internInfo?.company_id ? internInfo?.companies?.name ?? "Unavailable" : "Unassigned"],
              ["Section", resourceErrors.intern ? "Unavailable" : internInfo?.section_id ? internInfo?.course_sections?.name ?? "Unavailable" : "Unassigned"],
              ["Academic year", resourceErrors.intern ? "Unavailable" : yearName(internInfo?.academic_year_id)],
              ["Required hours", hoursRequired === null ? "Unavailable" : `${hoursRequired} hours`],
            ].map(([label, value]) => <div key={label}><dt style={{ color: "var(--muted-foreground)" }}>{label}</dt><dd className="font-semibold mt-1">{value}</dd></div>)}
          </dl>
          {resourceErrors.intern ? <p role="alert" className="text-xs">Assignment information unavailable. Refresh data before relying on these details.</p> : !onboarding.every(item => item.complete) && <p className="text-xs" style={{ color: "var(--warning)" }}>Onboarding incomplete. Ask your administrator to finish: {onboarding.filter(item => !item.complete).map(item => item.label).join(", ")}.</p>}
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Completion counts verified hours and documents for your assigned academic year. Attendance keeps records from all years; earlier records are not moved when your assignment changes.</p>
        </section>}

        {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
        {!loading && tab === "dashboard" && (
          <>
            <div>
              <h1 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
                Hi, {profile.full_name.split(" ")[0]}!
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                {profile.organization ?? "—"}{internInfo?.companies?.name ? ` — ${internInfo.companies.name}` : ""}
              </p>
            </div>

            <AnnouncementsFeed />
            <p className="text-xs">Clearance: {clearanceReady === null ? "Unknown" : clearanceReady ? "Eligible" : "Incomplete"} | Standard requirements: {metric.checklist.present}/4</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {stats.map((s) => <StatCard key={s.label} {...s} />)}
            </div>

            <div className="grid lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3 space-y-4">
                <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold">{weekView} Logged Hours (sum)</h2>
                    <div className="relative">
                      <button className="text-xs" style={{ color: "var(--primary)" }}
                        onClick={() => setShowWeekPicker((v) => !v)}>
                        {weekView} ▾
                      </button>
                      {showWeekPicker && (
                        <div className="absolute right-0 top-6 z-10 rounded-lg shadow-lg overflow-hidden"
                          style={{ background: "var(--card)", border: "1px solid var(--border)", minWidth: "110px" }}>
                          {weekViews.map((v) => (
                            <button key={v} onClick={() => { setWeekView(v); setShowWeekPicker(false); }}
                              className="w-full text-left px-3 py-2 text-xs transition-colors"
                              style={{
                                background: weekView === v ? "var(--primary-light)" : "transparent",
                                color: weekView === v ? "var(--primary)" : "var(--foreground)",
                              }}>
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
                      <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} domain={[0, "auto"]} />
                      <Tooltip
                        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v) => [`${v} hrs`, "Logged hours (sum)"]}
                      />
                      <Area type="monotone" dataKey="hours" stroke="var(--primary)" strokeWidth={2} fill="url(#hoursGrad)"
                        dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold">Overall Progress</span>
                    <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>{progress === null ? "Unavailable" : `${progress}%`}</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--secondary)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress ?? 0}%`, background: "var(--primary)" }} />
                  </div>
                  <div className="flex justify-between mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    <span>{displayHours(metric.verified)} verified hrs</span>
                    <span>{displayHours(remainingHours)} verified hrs remaining</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-sm font-semibold">Recent Evaluations</span>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: "380px" }}>
                  {evaluationList.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No evaluations yet</div>
                  )}
                  {evaluationList.map((ev) => (
                    <div key={ev.id} className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">Evaluation</div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                            OJT Coordinator: {ev.profiles?.full_name ?? "—"}
                          </div>
                          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                            {new Date(ev.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" , timeZone: "Asia/Manila" })}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold" style={{ color: "var(--primary)" }}>{evaluationResult(ev) ?? "Unavailable"}/100</div>
                          <div className="mt-1 h-1 w-14 rounded-full overflow-hidden ml-auto" style={{ background: "var(--secondary)" }}>
                            <div className="h-full rounded-full" style={{ width: `${evaluationResult(ev) ?? 0}%`, background: "var(--primary)" }} />
                          </div>
                        </div>
                      </div>
                      <EvaluationCriteria criteria={ev.competencies} />
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
        {!loading && tab === "attendance" && (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold">My Attendance</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  {internInfo?.companies?.name ?? "—"} · Instructor: {internInfo?.profiles?.full_name ?? "—"}
                </p>
              </div>
              <button
                onClick={() => (isClockedIn ? setShowAccomplModal(true) : handleClockIn())}
                disabled={clockBusy || Boolean(clockLoadError) || Boolean(resourceErrors.attendance) || Boolean(todayRow?.time_out)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shrink-0"
                style={{ background: isClockedIn ? "var(--danger-bg)" : "var(--primary)", color: isClockedIn ? "var(--danger)" : "#fff" }}
              >
                <IconClock size={14} />
                {clockBusy ? "Saving…" : isClockedIn ? "Clock Out" : todayRow?.time_out ? "Day Completed" : "Clock In"}
              </button>
            </div>

            {/* Live session card */}
            {clockLoadError && <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
              Clock state unavailable: {clockLoadError}. <button onClick={loadAll} className="underline">Retry</button>
            </p>}
            {isClockedIn && (
              <div className="rounded-xl p-4 flex items-center gap-4" style={{ background: "var(--info-bg)", border: "1px solid var(--info)" }}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse" style={{ background: "var(--info)" }} />
                <div className="flex-1">
                  <div className="text-xs font-semibold mb-0.5" style={{ color: "var(--info)" }}>Session Active</div>
                  <div className="text-xs" style={{ color: "var(--info)" }}>
                    Clocked in at {clockInDate ? formatTime(clockInDate) : "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold font-mono" style={{ color: "var(--info)" }}>{elapsed}</div>
                  <div className="text-xs" style={{ color: "var(--info)" }}>elapsed</div>
                </div>
              </div>
            )}

            {/* DTR table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-sm font-semibold">Daily Time Record (DTR)</span>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                    {dtrFilters.map((f) => (
                      <button key={f} onClick={() => setDtrFilter(f)}
                        className="text-xs px-2.5 py-1.5 capitalize"
                        style={{ background: dtrFilter === f ? "var(--primary)" : "transparent", color: dtrFilter === f ? "#fff" : "var(--muted-foreground)" }}>
                        {f === "all" ? "All" : f === "week" ? "This Week" : f === "month" ? "This Month" : "This Year"}
                      </button>
                    ))}
                  </div>
                  <button className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--secondary)", color: "var(--foreground)" }}
                    disabled={exportBusy} onClick={exportDtr}>{exportBusy ? "Preparing CSV..." : "Export all CSV"}</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--muted)" }}>
                      {["Date", "Academic Year", "Time In", "Time Out", "Hours", "Accomplishments", "Status"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDtr.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-6 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>No records for this period.</td></tr>
                    )}
                    {filteredDtr.map((d) => {
                      const isToday = d.log_date === todayStr();
                      return (
                        <tr key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
                          <td className="px-4 py-3 text-xs font-medium whitespace-nowrap">
                            {formatBusinessDate(d.log_date, { month: "short", day: "numeric", weekday: "short" })}
                            {isToday && (
                              <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded text-white" style={{ background: "var(--primary)", fontSize: "9px" }}>TODAY</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs">{yearName(d.academic_year_id)}</td>
                          <td className="px-4 py-3 text-xs font-mono">{d.time_in ?? "—"}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: !d.time_out ? "var(--muted-foreground)" : undefined }}>
                            {!d.time_out && isToday && isClockedIn ? (
                              <span className="font-mono" style={{ color: "var(--info)" }}>{elapsed}</span>
                            ) : (d.time_out ?? "—")}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono">{d.hours ?? "—"}</td>
                          <td className="px-4 py-3 text-xs max-w-xs" style={{ color: "var(--muted-foreground)" }}>
                            {d.accomplishment ? <span style={{ color: "var(--foreground)" }}>{d.accomplishment}</span> : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={
                                isToday && !d.time_out ? { background: "var(--info-bg)", color: "var(--info)" }
                                : d.verified ? { background: "var(--success-bg)", color: "var(--success)" }
                                : { background: "var(--warning-bg)", color: "var(--warning)" }
                              }
                            >
                              {isToday && !d.time_out ? "In Progress" : d.verified ? "Verified" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <div>
                    <label htmlFor="correction-end-date" className="block text-xs font-medium mb-1">Clock-out date (overnight only)</label>
                    <input id="correction-end-date" type="date" value={exForm.endDate} onChange={(e) => setExForm((f) => ({ ...f, endDate: e.target.value }))}
                      className={inputCls} style={inputStyle} />
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
                  <button onClick={submitException} disabled={correctionBusy} className="text-sm px-4 py-2 rounded-lg font-semibold"
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
                        <div className="text-xs font-medium">
                          {formatBusinessDate(ex.log_date, { month: "short", day: "numeric" })} · {ex.claimed_time_in} – {ex.claimed_time_out}
                          {ex.claimed_end_date && ex.claimed_end_date !== ex.log_date && <> (ends {formatBusinessDate(ex.claimed_end_date)})</>}
                        </div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>{ex.reason}</div>
                        {ex.review_note && <div className="text-xs mt-1 break-words">Review note: {ex.review_note}</div>}
                        <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                          Submitted: {new Date(ex.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" , timeZone: "Asia/Manila" })}
                        </div>
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
        {!loading && tab === "documents" && (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold">My Documents</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  Assigned-year clearance & required submissions · {docApprovedCount}/{currentDocs.length} Approved
                </p>
              </div>
              {clearanceReady && (
                <span className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                  Clearance Eligible
                </span>
              )}
            </div>

            <p className="text-xs">PDF, JPEG or PNG, up to 10 MiB. Replacement resets current review and retains previous evidence.</p>
            {recoveryRows.map(v => <div key={v.id} className="text-xs">Unfinished upload: {v.file_name} <button disabled={recoveryBusy || uploadBusy !== null} onClick={() => cleanupUpload(v.id)} className="underline">Retry cleanup</button></div>)}
            <button onClick={refreshRecovery} disabled={recoveryBusy || uploadBusy !== null} className="text-xs underline">Refresh unfinished uploads</button>
            <p className="text-xs">Standard requirements: {documentsKnown ? `${metric.checklist.present}/4 present` : "Unavailable"}</p>
            <label className="block text-xs">Document academic year
              <select aria-label="Document academic year" value={documentYear} onChange={event => setDocumentYear(event.target.value)} className={inputCls} style={inputStyle}>
                <option value="current">Current assignment</option><option value="all">All academic years (history)</option>
                {academicYears.map(year => <option key={year.id} value={year.id}>{year.label}</option>)}
                <option value="unassigned">Unassigned academic year</option>
              </select>
            </label>
            {!documentsKnown ? <p role="alert">Document requirements unavailable. <button onClick={loadAll} className="underline">Retry</button></p> : visibleDocs.length === 0 ? (
              <div className="rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                No document requirements for this academic year — ask your administrator to attach the standard checklist.
              </div>
            ) : (
              <>
                {/* Clearance progress */}
                <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">Clearance Status</span>
                    <span className="text-sm font-bold" style={{ color: currentDocs.length > 0 && docApprovedCount === currentDocs.length ? "var(--success)" : "var(--primary)" }}>
                      {docApprovedCount}/{currentDocs.length} Approved for assigned year
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--secondary)" }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${currentDocs.length ? (docApprovedCount / currentDocs.length) * 100 : 0}%`, background: docApprovedCount === currentDocs.length ? "var(--success)" : "var(--primary)" }} />
                  </div>
                </div>

                <div className="space-y-3">
                  {visibleDocs.map((doc) => (
                    <div key={doc.id} className="rounded-xl p-4" style={{ background: "var(--card)", border: `1px solid ${doc.status === "Needs Revision" ? "#fca5a5" : "var(--border)"}` }}>
                      <div className="flex items-start gap-3">
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
                            <span className="text-xs">{yearName(doc.academic_year_id)}</span>
                            <DocStatusBadge status={doc.status} />
                          </div>
                          {doc.file_name && (
                            <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                              <IconFileText size={11} /> {doc.file_name}
                            </div>
                          )}
                          {doc.note && (
                            <div className="text-xs mt-1.5 px-2 py-1.5 rounded-lg" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                              <strong>Note:</strong> {doc.note}
                            </div>
                          )}
                        </div>
                        <DocumentActions doc={doc} />
                        <div className="shrink-0">
                          <input type="file" accept="application/pdf,image/jpeg,image/png"
                            ref={(el) => { fileInputRefs.current[doc.id] = el; }}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(doc, f); e.target.value = ""; }}
                            className="hidden" />
                          <button disabled={uploadBusy !== null || recoveryBusy} onClick={() => fileInputRefs.current[doc.id]?.click()}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                            style={{ background: doc.status === "Approved" ? "var(--secondary)" : "var(--primary)", color: doc.status === "Approved" ? "var(--muted-foreground)" : "#fff" }}>
                            <IconUpload size={12} />
                            {uploadBusy === doc.id ? "Uploading..." : doc.status === "Approved" ? "Replace" : doc.file_name ? "Resubmit" : "Upload"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── EVALUATIONS ───────────────────────────────────────────────── */}
        {!loading && tab === "evaluations" && (
          <>
            <div>
              <h1 className="text-xl font-bold">My Evaluations</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>Performance ratings from your OJT Coordinator</p>
            </div>
            <div className="space-y-3">
              {evaluationList.length === 0 && (
                <div className="rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                  No evaluations yet
                </div>
              )}
              {evaluationList.map((ev) => (
                <div key={ev.id} className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-sm font-semibold">Evaluation</div>
                      <p className="text-xs">{yearName(ev.academic_year_id)}</p>
                      <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                        OJT Coordinator: {ev.profiles?.full_name ?? "—"} · {new Date(ev.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" , timeZone: "Asia/Manila" })}
                      </div>
                      <EvaluationCriteria criteria={ev.competencies} />
                      {ev.feedback && (
                        <p className="text-sm mt-2 italic" style={{ color: "var(--muted-foreground)" }}>"{ev.feedback}"</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold" style={{ color: "var(--primary)" }}>
                        {evaluationResult(ev) ?? "Unavailable"}<span className="text-sm font-normal" style={{ color: "var(--muted-foreground)" }}>/100</span>
                      </div>
                      <div className="mt-1 h-1.5 w-24 rounded-full overflow-hidden ml-auto" style={{ background: "var(--secondary)" }}>
                        <div className="h-full rounded-full" style={{ width: `${evaluationResult(ev) ?? 0}%`, background: "var(--primary)" }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── REPORTS ───────────────────────────────────────────────────── */}
        {!loading && tab === "reports" && (
          <>
            <div>
              <h1 className="text-xl font-bold">Reports</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>Download an informational DTR CSV. Official reports are unavailable.</p>
            </div>


            <div className="grid lg:grid-cols-2 gap-4">
              {[
                { title: "Daily Time Record (DTR)", desc: "All your attendance records, with logged and verified hours distinguished; informational CSV only", icon: <IconClock size={22} /> },
                { title: "Performance Summary", desc: "All evaluation scores and coordinator ratings", icon: <IconTrendingUp size={22} /> },
                { title: "Weekly Hours Summary", desc: "Week-by-week hours breakdown", icon: <IconCalendar size={22} /> },
                { title: "Document Archive", desc: "All uploaded clearance forms", icon: <IconFolder size={22} /> },
              ].map((r) => (
                <div key={r.title} className="rounded-xl p-4 flex gap-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <span className="shrink-0 mt-0.5" style={{ color: "var(--muted-foreground)" }}>{r.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{r.title}</div>
                    <div className="text-xs mt-0.5 mb-3" style={{ color: "var(--muted-foreground)" }}>{r.desc}</div>
                    <div className="flex gap-2">
                      {r.title === "Daily Time Record (DTR)" && (
                        <button disabled={exportBusy} onClick={exportDtr} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: "var(--primary)", color: "#fff" }}>
                          {exportBusy ? "Preparing CSV..." : "Export all CSV"}
                        </button>
                      )}
                      <button disabled className="text-xs px-3 py-1.5 rounded-lg opacity-50">PDF unavailable</button>
                      <button disabled className="text-xs px-3 py-1.5 rounded-lg opacity-50">Excel unavailable</button>
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
                disabled={clockBusy || !accomplishment.trim() || accomplishment.length > 500}
                onClick={async () => { const result = await handleClockOut(accomplishment.trim()); if (result?.ok) { setAccomplishment(""); setShowAccomplModal(false); } }}
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

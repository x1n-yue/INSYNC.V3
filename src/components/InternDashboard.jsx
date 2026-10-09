import { useEffect, useRef, useState } from "react";
import HoursChart from "./HoursChart";
import { supabase } from "../lib/supabaseClient";
import { manilaDate, recordRpc } from "../lib/authority";
import { elapsedSession, formatAttendanceTime, formatBusinessDate, formatClockTime, isOpenSession } from "../lib/attendance";
import { evaluationResult } from "../lib/business";
import { displayHours, filterAttendance, internMetrics } from "../lib/metrics";
import { completeRows } from "../lib/workflows";
import { recoverUpload, uploadDocument } from "../lib/documents";
import DocumentActions from "./DocumentActions";
import EvaluationCriteria from "./EvaluationCriteria";
import AnnouncementsFeed from "./AnnouncementsFeed";
import Shell from "./Shell";
import Modal from "./Modal";
import TimeInput from "./TimeInput";
import { attendancePeriod, dashboardMetrics, detailPage, weeklyChartDays } from "../lib/dashboard";
import RefreshStatus from "./RefreshStatus";
import { academicRows, onboardingItems } from "../lib/assignments";
import { captureRequest } from "../lib/requests";
import { useToast } from "./Toast";
import {
  IconGrid,
  IconClock,
  IconFileText,
  IconFolder,
  IconCheck,
  IconAward,
  IconAlertTriangle,
  IconUpload,
} from "./Icons";

const navItems = [
  { id: "dashboard", label: "My Dashboard", icon: <IconGrid size={15} /> },
  { id: "attendance", label: "My Attendance", icon: <IconClock size={15} /> },
  { id: "documents", label: "My Documents", icon: <IconFolder size={15} /> },
  { id: "evaluations", label: "My Evaluations", icon: <IconFileText size={15} /> },
];

const weekViews = ["Weekly", "Monthly", "Yearly", "All Time"];
const dtrFilters = ["all", "week", "month", "year"];

function formatTime(d) {
  return formatClockTime(d);
}

function StatCard({ icon, iconBg, iconColor, label, value, sub }) {
  return (
    <div className="ui-card ui-stat-card rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
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
    Approved: { background: "var(--success-bg)", color: "var(--success)" },
    Pending: { background: "var(--warning-bg)", color: "var(--warning)" },
    "Needs Revision": { background: "var(--danger-bg)", color: "var(--danger)" },
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
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [academicYears, setAcademicYears] = useState([]);
  const [documentYear, setDocumentYear] = useState("current");
  const [clockBusy, setClockBusy] = useState(false);
  const [clockLoadError, setClockLoadError] = useState(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(null);
  const [recoveryRows, setRecoveryRows] = useState([]);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const [serverMetric, setServerMetric] = useState(null);
  const [latestServerEvaluation, setLatestServerEvaluation] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [weeklyHours, setWeeklyHours] = useState([]);
  const [attendancePage, setAttendancePage] = useState(0);
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [resourceErrors, setResourceErrors] = useState({});
  const loadSequence = useRef(0);
  const [documentsKnown, setDocumentsKnown] = useState(false);
  const [internInfo, setInternInfo] = useState(null); // { required_hours, companies:{name}, profiles:{full_name} }
  const [openSession, setOpenSession] = useState(null);
  const [todaySession, setTodaySession] = useState(null);
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
      const [internResult, attendanceResult, evalResult, exceptionResult, docResult, openResult, yearResult, metricsResult, chartResult, todayResult] = await Promise.all([
        capture(supabase.from("interns").select("*, companies(name), course_sections(name), academic_years(label)").eq("id", profile.id).maybeSingle()),
        capture(tab === "attendance" ? detailPage(supabase, "attendance_logs", { page: attendancePage, order: "log_date", filter: query => attendancePeriod(query.eq("intern_id", profile.id), dtrFilter) }) : Promise.resolve({ data: [], count: 0 })),
        capture((tab === "evaluations" ? completeRows(supabase, "evaluations", profile.id) : Promise.resolve([])).then(data => ({ data: data.sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) }))),
        capture(completeRows(supabase, "attendance_exceptions", profile.id).then(data => ({ data: data.sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) }))),
        capture(completeRows(supabase, "documents", profile.id).then(data => ({ data }))),
        capture(supabase.from("attendance_logs").select("*").eq("intern_id", profile.id).is("time_out", null).maybeSingle()),
        capture(completeRows(supabase, "academic_years").then(data => ({ data }))),
        capture(dashboardMetrics(supabase, profile.id).then(data => ({ data }))),
        capture(tab === "dashboard" || tab === "attendance" ? supabase.rpc("dashboard_chart", { p_period: tab === "dashboard" ? "week" : ({ Weekly: "week", Monthly: "month", Yearly: "year", "All Time": "all" })[weekView] }) : Promise.resolve({ data: [] })),
        capture(supabase.from("attendance_logs").select("*").eq("intern_id", profile.id).eq("log_date", todayStr()).maybeSingle()),
      ]);
      if (sequence !== loadSequence.current) return;
      const errors = {};
      const mark = (key, result) => { if (result?.error) errors[key] = result.error.message || String(result.error); };
      mark("intern", internResult); mark("attendance", attendanceResult); mark("evaluations", evalResult); mark("exceptions", exceptionResult); mark("documents", docResult); mark("openSession", openResult);
      mark("todaySession", todayResult);
      if (!errors.openSession) setOpenSession(openResult.data ?? null);
      if (!errors.todaySession) setTodaySession(todayResult.data ?? null);
      mark("years", yearResult); mark("metrics", metricsResult); mark("chart", chartResult);
      if (!errors.metrics) {
        const current = metricsResult.data.find(row => row.id === profile.id);
        setServerMetric(current?.metric ?? null); setLatestServerEvaluation(current?.latestEvaluation ?? null);
      }
      if (!errors.chart && tab === "dashboard") {
        try { setWeeklyHours(weeklyChartDays(chartResult.data)); }
        catch (error) { errors.chart = error.message; }
      } else if (!errors.chart && tab === "attendance") {
        try {
          if (!Array.isArray(chartResult.data)) throw new Error("Attendance hours are unavailable. Refresh and retry.");
          setChartData(weekView === "Weekly" ? weeklyChartDays(chartResult.data) : chartResult.data);
        } catch (error) { errors.chart = error.message; }
      }
      if (!errors.attendance) setAttendanceCount(attendanceResult.count ?? 0);
      if (!errors.years) setAcademicYears(yearResult.data ?? []);
      const nameIds = [...new Set([internResult.data?.instructor_id, ...(evalResult.data ?? []).map(e => e.evaluator_id), ...(metricsResult.data ?? []).map(row => row.latestEvaluation?.evaluator_id)].filter(Boolean))];
      const namesResult = await capture((nameIds.length ? completeRows(supabase, "profiles", undefined, {
        query: () => supabase.rpc("related_profile_names", { p_ids: nameIds }, { count: "exact" }),
      }) : Promise.resolve([])).then(data => ({ data })));
      if (namesResult.error) errors.names = namesResult.error.message;
      if (sequence !== loadSequence.current) return;
      const names = Object.fromEntries((namesResult.data ?? []).map(p => [p.id, { full_name: p.full_name }]));
      if (!errors.intern) setInternInfo(internResult.data ? { ...internResult.data, profiles: names[internResult.data.instructor_id] } : null);
      setClockLoadError(errors.openSession || errors.todaySession || null);
      setMetricsError(errors.intern || errors.metrics || null);
      setDocumentsKnown(!errors.documents && Array.isArray(docResult.data));
      if (!errors.attendance) {
        const history = [...(attendanceResult.data ?? [])].sort((a,b) => b.log_date.localeCompare(a.log_date) || b.id.localeCompare(a.id));
        setDtr(history);
      }
      if (!errors.evaluations) setEvaluationList((tab === "dashboard" ? (metricsResult.data ?? []).map(row => row.latestEvaluation).filter(Boolean) : evalResult.data ?? []).sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).map(e => ({ ...e, profiles: names[e.evaluator_id] })));
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
      if (sequence === loadSequence.current) { setHasLoaded(true); setLoading(false); }
    }
  };
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, tab, attendancePage, dtrFilter, weekView]);

  const todayRow = openSession ?? todaySession;
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
      setOpenSession(result.data); setTodaySession(result.data);
      setDtr((prev) => [result.data, ...prev]);
      toast("Clocked in at " + formatAttendanceTime(result.data.time_in), "success");
    } finally { setClockBusy(false); }
  };

  const handleClockOut = async (accomp) => {
    if (!todayRow || clockBusy || clockLoadError) return { ok: false };
    setClockBusy(true);
    try {
      const result = await recordRpc(supabase, "clock_out", { p_id: todayRow.id, p_accomplishment: accomp });
      if (!result.ok) { toast(result.error, "error"); return result; }
      setOpenSession(null); setTodaySession(result.data);
      setDtr((prev) => prev.map((d) => d.id === result.data.id ? result.data : d));
      await loadAll();
      toast(`Clocked out — ${displayHours(result.data.hours)} hrs logged`, "success");
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
      await loadAll();
      toast("Exception request submitted — awaiting instructor review", "info");
    } finally { setCorrectionBusy(false); }
  };

  const refreshRecovery = async () => {
    const { data, error } = await captureRequest(completeRows(supabase, "document_versions", undefined, {
      query: () => supabase.rpc("unfinished_document_uploads", {}, { count: "exact" }),
    }).then(data => ({ data })));
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
      await loadAll();
      toast("Upload finalized; pending review", "info"); return result;
    } finally { setUploadBusy(null); }
  };
  const cleanupUpload = async (uploadId) => {
    if (recoveryBusy || uploadBusy) return;
    setRecoveryBusy(true);
    try {
      const result = await recoverUpload(supabase, uploadId);
      if (result.ok) setDocs(prev => prev.map(d => d.id === result.data.id ? result.data : d));
      if (result.ok) await loadAll();
      toast(result.ok ? "Finalized upload recovered" : result.cleanupPending ? result.error : "Unfinished upload cleanup confirmed", result.cleanupPending ? "error" : "info");
      await refreshRecovery();
    } finally { setRecoveryBusy(false); }
  };
  const metric = serverMetric ?? internMetrics({ internId: profile.id, required: internInfo?.required_hours });
  const hoursRendered = metric.logged;
  const hoursRequired = metric.target;
  const progress = metric.progress;
  const filteredDtr = filterAttendance(dtr, dtrFilter);
  const latestEval = latestServerEvaluation ?? academicRows(evaluationList, internInfo?.academic_year_id)?.[0];
  const docApprovedCount = metric.approved;
  const clearanceReady = metric.cleared;
  const currentDocs = academicRows(docs, internInfo?.academic_year_id) ?? [];
  const visibleDocs = documentYear === "all" ? docs : documentYear === "current" ? currentDocs : academicRows(docs, documentYear === "unassigned" ? null : documentYear) ?? [];
  const onboarding = onboardingItems(internInfo, documentsKnown ? currentDocs : null);
  const yearName = (id) => id ? academicYears.find(year => year.id === id)?.label ?? "Academic year unavailable" : "Unassigned academic year";


  const stats = [
    { icon: <IconClock size={18} />, iconBg: "#eff6ff", iconColor: "#2563eb", label: "Logged Hours", value: displayHours(hoursRendered), sub: `Verified: ${displayHours(metric.verified)} / ${hoursRequired ?? "Unavailable"} required` },
    { icon: <IconCheck size={18} />, iconBg: "#f0fdf4", iconColor: "#16a34a", label: "Completion", value: progress === null ? "Unavailable" : `${progress}%`, sub: `Verified progress | ${metric.risk}` },
    { icon: <IconAward size={18} />, iconBg: "#fefce8", iconColor: "#d97706", label: "Latest Score", value: evaluationResult(latestEval) !== null ? `${evaluationResult(latestEval)}/100` : "—", sub: "Most recent evaluation" },
  ];

  const clockControl = (
    <button
      onClick={() => (isClockedIn ? setShowAccomplModal(true) : handleClockIn())}
      disabled={clockBusy || Boolean(clockLoadError) || Boolean(resourceErrors.attendance) || Boolean(todayRow?.time_out)}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shrink-0"
      style={{ background: isClockedIn ? "var(--danger-bg)" : "var(--primary)", color: isClockedIn ? "var(--danger)" : "#fff" }}
    >
      <IconClock size={14} />
      {clockBusy ? "Saving…" : isClockedIn ? "Clock Out" : todayRow?.time_out ? "Day Completed" : "Clock In"}
    </button>
  );

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
      <div className="workspace space-y-5">
        <RefreshStatus loading={loading || clockBusy || correctionBusy || uploadBusy !== null || recoveryBusy} lastUpdated={lastUpdated} onRefresh={loadAll} />
        {Object.values(resourceErrors).some(Boolean) && <div role="alert" className="rounded-lg px-4 py-3 text-sm flex flex-wrap gap-3 items-center" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}><span>Some dashboard data is unavailable; displayed values may be stale.</span><button onClick={loadAll} className="underline font-semibold">Retry refresh</button></div>}
        {metricsError && <p role="alert" className="text-sm">Progress unavailable: {metricsError}</p>}
        {loading && <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading…</div>}
        {hasLoaded && <details open={tab !== "dashboard"} className="ui-card rounded-xl p-4 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <summary className="text-sm font-semibold cursor-pointer">
            My Internship Assignment
            {!resourceErrors.intern && !onboarding.every(item => item.complete) && <span className="ml-2 text-xs font-normal" style={{ color: "var(--warning)" }}>Onboarding incomplete</span>}
          </summary>
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
          {tab !== "dashboard" && <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Completion counts verified hours and documents for your assigned academic year. Attendance keeps records from all years; earlier records are not moved when your assignment changes.</p>}
        </details>}

        {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
        {hasLoaded && tab === "dashboard" && (
          <>
            <div>
              <h1 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
                Hi, {profile.full_name.split(" ")[0]}!
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                {profile.organization ?? "—"}{internInfo?.companies?.name ? ` — ${internInfo.companies.name}` : ""}
              </p>
            </div>

            <section aria-label="Today's attendance" className="ui-card rounded-xl p-4 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-sm font-semibold">Today's Attendance</h2><p className="text-xs mt-1">{clockLoadError ? "Unavailable. Refresh before clocking in or out." : isClockedIn ? "Session in progress" : todayRow?.time_out ? "Session completed" : "Not clocked in"}</p></div>
                {clockControl}
              </div>
              {todayRow && <p className="text-xs">{todayRow.log_date} | In: {formatAttendanceTime(todayRow.time_in)} | Out: {formatAttendanceTime(todayRow.time_out)} | {isClockedIn ? elapsed : displayHours(todayRow.hours) + " logged hrs"} | {todayRow.verified ? "Verified" : "Unverified"}</p>}
              <button className="text-xs underline" onClick={() => setTab("attendance")}>View attendance and corrections</button>
            </section>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {stats.map((s) => <StatCard key={s.label} {...s} />)}
            </div>
            <div className="dashboard-columns">
            <section aria-label="This week's hours" className="ui-card rounded-xl p-4 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold">This Week's Hours</h2>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Monday to Sunday, Manila time. Your assigned academic year. Verified hours are included in logged hours; active sessions count after clock-out.</p>
              <HoursChart rows={weeklyHours} weekly loading={loading}
                error={resourceErrors.chart || resourceErrors.intern || resourceErrors.dashboard} onRetry={loadAll} />
            </section>
            <section aria-label="Internship actions" className="ui-card rounded-xl p-4 space-y-2" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold">My Next Actions</h2>
              <p className="text-xs">Documents requiring submission or revision: {documentsKnown ? currentDocs.filter(doc => !doc.file_path || doc.status === "Needs Revision").length : "Unavailable"}</p>
              <div className="action-links text-xs">
                <button onClick={() => setTab("documents")}>Open required documents</button>
                <button onClick={() => setTab("evaluations")}>View performance evaluations</button>
              </div>
            </section>
            </div>
            <details className="ui-card rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <summary className="text-sm font-semibold cursor-pointer">Announcements</summary>
              <div className="mt-3"><AnnouncementsFeed /></div>
            </details>
          </>
        )}

        {/* ── ATTENDANCE ────────────────────────────────────────────────── */}
        {hasLoaded && tab === "attendance" && (
          <>
            <div className="page-header">
              <div>
                <h1 className="text-xl font-bold">My Attendance</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  {internInfo?.companies?.name ?? "—"} · Instructor: {internInfo?.profiles?.full_name ?? "—"}
                </p>
              </div>
              {clockControl}
            </div>

                <section aria-label="Attendance hours" className="ui-card rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold">{weekView} Hours</h2>
                    <div className="relative">
                      <button className="text-xs" style={{ color: "var(--primary)" }}
                        aria-label="Chart period" aria-expanded={showWeekPicker} onClick={() => setShowWeekPicker((v) => !v)}>
                        {weekView} ▾
                      </button>
                      {showWeekPicker && (
                        <div className="ui-card absolute right-0 top-6 z-10 rounded-lg shadow-lg overflow-hidden"
                          style={{ background: "var(--card)", border: "1px solid var(--border)", minWidth: "110px" }}>
                          {weekViews.map((v) => (
                            <button key={v} aria-pressed={weekView === v} onClick={() => { setWeekView(v); setShowWeekPicker(false); }}
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
                  <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>Manila time. Your assigned academic year. Verified hours are included in logged hours; active sessions count after clock-out.</p>
                  <HoursChart rows={chartData} weekly={weekView === "Weekly"} loading={loading}
                    error={resourceErrors.chart || resourceErrors.intern || resourceErrors.dashboard} onRetry={loadAll} />
                </section>

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
            <div className="ui-card rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 toolbar justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold">Daily Time Record (DTR)</h2>
                <div className="toolbar text-xs"><button className="px-2 rounded-lg" disabled={loading || attendancePage === 0} onClick={() => setAttendancePage(page => page - 1)}>Previous attendance page</button><span>Page {attendancePage + 1} | {attendanceCount} records</span><button className="px-2 rounded-lg" disabled={loading || (attendancePage + 1) * 50 >= attendanceCount} onClick={() => setAttendancePage(page => page + 1)}>Next attendance page</button></div>
                <div className="flex items-center gap-2">
                  <div role="group" aria-label="Attendance period" className="flex flex-wrap rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                    {dtrFilters.map((f) => (
                      <button key={f} onClick={() => { setAttendancePage(0); setDtrFilter(f); }}
                        aria-pressed={dtrFilter === f}
                        className="text-xs px-2.5 py-1.5 capitalize"
                        style={{ background: dtrFilter === f ? "var(--primary)" : "transparent", color: dtrFilter === f ? "#fff" : "var(--muted-foreground)" }}>
                        {f === "all" ? "All" : f === "week" ? "This Week" : f === "month" ? "This Month" : "This Year"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {resourceErrors.attendance && <p role="alert" className="px-4 py-2 text-xs" style={{ color: "var(--danger)" }}>Attendance history is unavailable or stale. Refresh before relying on these records.</p>}
              <div role="region" aria-label="Attendance records" tabIndex={0} className="table-region overflow-x-auto">
                <table aria-label="Daily Time Record" className="data-table w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--muted)" }}>
                      {["Date", "Academic Year", "Time In", "Time Out", "Hours", "Accomplishments", "Status"].map((h) => (
                        <th scope="col" key={h} className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!loading && !resourceErrors.attendance && filteredDtr.length === 0 && (
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
                          <td className="px-4 py-3 text-xs font-mono whitespace-nowrap">{formatAttendanceTime(d.time_in)}</td>
                          <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: !d.time_out ? "var(--muted-foreground)" : undefined }}>
                            {!d.time_out && isToday && isClockedIn ? (
                              <span className="font-mono" style={{ color: "var(--info)" }}>{elapsed}</span>
                            ) : formatAttendanceTime(d.time_out)}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono">{d.hours == null ? "—" : displayHours(d.hours)}</td>
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
            <div className="ui-card rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2">
                  <IconAlertTriangle size={14} style={{ color: "var(--warning)" }} />
                  <span className="text-sm font-semibold">Time Log Exception Request</span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>Submit a correction request for missed or incorrect clock entries. Date, clock times and reason are required; the overnight clock-out date is optional.</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="correction-start-date" className="block text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>Date</label>
                    <input id="correction-start-date" type="date" value={exForm.date} onChange={(e) => setExForm((f) => ({ ...f, date: e.target.value }))}
                      className={inputCls} style={inputStyle} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 sm:col-span-2 gap-3">
                    <div>
                      <TimeInput label="Clock In" value={exForm.claimedIn} onChange={value => setExForm(form => ({ ...form, claimedIn: value }))} disabled={correctionBusy} />
                    </div>
                    <div>
                      <TimeInput label="Clock Out" value={exForm.claimedOut} onChange={value => setExForm(form => ({ ...form, claimedOut: value }))} disabled={correctionBusy} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="correction-end-date" className="block text-xs font-medium mb-1">Clock-out date (overnight only)</label>
                    <input id="correction-end-date" type="date" value={exForm.endDate} onChange={(e) => setExForm((f) => ({ ...f, endDate: e.target.value }))}
                      className={inputCls} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label htmlFor="correction-reason" className="block text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>Reason / Explanation</label>
                  <textarea id="correction-reason" rows={2} value={exForm.reason} onChange={(e) => setExForm((f) => ({ ...f, reason: e.target.value }))}
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
                          {formatBusinessDate(ex.log_date, { month: "short", day: "numeric" })} · {formatAttendanceTime(ex.claimed_time_in)} – {formatAttendanceTime(ex.claimed_time_out)}
                          {ex.claimed_end_date && ex.claimed_end_date !== ex.log_date && <> (ends {formatBusinessDate(ex.claimed_end_date)})</>}
                        </div>
                        <div className="text-xs mt-0.5 break-words" style={{ color: "var(--muted-foreground)" }}>{ex.reason}</div>
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
        {hasLoaded && tab === "documents" && (
          <>
            <p className="text-xs">Clearance: {clearanceReady === null ? "Unknown" : clearanceReady ? "Eligible" : "Incomplete"} | Standard requirements: {metric.checklist.present}/4</p>
            <div className="flex flex-wrap items-start justify-between gap-3">
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
              <div className="ui-card rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                No document requirements for this academic year — ask your administrator to attach the standard checklist.
              </div>
            ) : (
              <>
                {/* Clearance progress */}
                <div className="ui-card rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
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
                      <div className="document-row">
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
                            <div className="file-name text-xs mt-0.5 flex items-start gap-1" style={{ color: "var(--muted-foreground)" }}>
                              <IconFileText size={11} /> {doc.file_name}
                            </div>
                          )}
                          {doc.note && (
                            <div className="text-xs mt-1.5 px-2 py-1.5 rounded-lg" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                              <strong>Note:</strong> {doc.note}
                            </div>
                          )}
                        </div>
                        <div className="document-controls">
                          <DocumentActions doc={doc} />
                          <div className="shrink-0">
                            <input aria-label={`Upload ${doc.name}`} type="file" accept="application/pdf,image/jpeg,image/png"
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
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── EVALUATIONS ───────────────────────────────────────────────── */}
        {hasLoaded && tab === "evaluations" && (
          <>
            <div>
              <h1 className="text-xl font-bold">My Evaluations</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>Performance ratings from your OJT Coordinator</p>
            </div>
            <div className="space-y-3">
              {evaluationList.length === 0 && (
                <div className="ui-card rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                  No evaluations yet
                </div>
              )}
              {evaluationList.map((ev) => (
                <div key={ev.id} className="ui-card rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="page-header">
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


      </div>

      {/* ── Accomplishment Modal ─────────────────────────────────────────── */}
      {showAccomplModal && (
        <Modal title="Log Today's Accomplishments" onClose={() => setShowAccomplModal(false)} width="480px">
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Before clocking out, please briefly describe the tasks you completed during your shift.
            </p>
            <div>
              <label htmlFor="daily-accomplishment" className="block text-xs font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
                Accomplishments / Tasks Completed <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <textarea id="daily-accomplishment" maxLength={500}
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

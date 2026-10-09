import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { manilaDate, recordRpc, reviewCorrections } from "../lib/authority";
import { formatAttendanceTime, formatBusinessDate } from "../lib/attendance";
import { RUBRIC, evaluationResult, requiredHours, rubricScore } from "../lib/business";
import { displayHours, internMetrics } from "../lib/metrics";
import { completeRows, saveEvaluation } from "../lib/workflows";
import DocumentActions from "./DocumentActions";
import EvaluationCriteria from "./EvaluationCriteria";
import Shell from "./Shell";
import { dashboardMetrics, detailPage } from "../lib/dashboard";
import RefreshStatus from "./RefreshStatus";
import { clearAnnouncementDraft, emptyAnnouncement, readAnnouncementDraft, writeAnnouncementDraft } from "../lib/announcementDraft";
import { academicRows } from "../lib/assignments";
import { attendanceEvidence } from "../lib/hours";
import { captureRequest } from "../lib/requests";
import { useToast } from "./Toast";
import {
  IconGrid, IconBarChart, IconFileText, IconBell,
  IconGradCap, IconCheck, IconAlertTriangle, IconClock,
  IconMessageSquare, IconUser, IconFolder,
} from "./Icons";

const navItems = [
  { id: "overview", label: "Dashboard", icon: <IconGrid size={15} /> },
  { id: "progress", label: "My Interns", icon: <IconBarChart size={15} /> },
  { id: "evaluations", label: "Evaluations", icon: <IconFileText size={15} /> },
  { id: "dtr-review", label: "Attendance", icon: <IconClock size={15} /> },
  { id: "documents", label: "Intern Documents", icon: <IconFolder size={15} /> },
  { id: "announcements", label: "Announcements", icon: <IconBell size={15} /> },
];

const rubricCriteria = RUBRIC;
const scaleLabels = { 1: "Poor", 2: "Fair", 3: "Satisfactory", 4: "Good", 5: "Excellent" };

const inputStyle = { borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" };
const inputCls = "w-full text-sm py-2 px-3 rounded-lg border outline-none";

function ProgressBar({ value, max }) {
  if (value == null || requiredHours(max) === null) return <span className="text-xs">Unavailable</span>;
  const pct = Math.min(100, Math.floor(value / Number(max) * 100));
  const color = pct >= 100 ? "var(--success)" : pct > 60 ? "var(--primary)" : "var(--warning)";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--secondary)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <span className="font-mono text-xs w-8 text-right" style={{ color: "var(--muted-foreground)" }}>{pct}%</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    "On Track": { background: "var(--success-bg)", color: "var(--success)" },
    "At Risk": { background: "var(--danger-bg)", color: "var(--danger)" },
    "Near Complete": { background: "var(--info-bg)", color: "var(--info)" },
    Completed: { background: "var(--success-bg)", color: "var(--success)" },
    Unknown: { background: "var(--muted)", color: "var(--muted-foreground)" },
  };
  return <span className="text-xs px-2 py-0.5 rounded-full" style={map[status] ?? map.Unknown}>{status}</span>;
}

function DocStatusPill({ status }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={status === "Approved" ? { background: "var(--success-bg)", color: "var(--success)" }
        : status === "Needs Revision" ? { background: "var(--danger-bg)", color: "var(--danger)" }
        : { background: "var(--warning-bg)", color: "var(--warning)" }}>
      {status}
    </span>
  );
}

export default function InstructorDashboard({ profile, onLogout }) {
  const { toast } = useToast();
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [rosterBase, setRoster] = useState([]);
  const [sections, setSections] = useState(null);
  const [sectionFilter, setSectionFilter] = useState("");
  const [academicYears, setAcademicYears] = useState([]);
  const [yearFilter, setYearFilter] = useState("");
  const [attendanceBusy, setAttendanceBusy] = useState(null);
  const attendanceInFlight = useRef(false);
  const [metricAttendance, setMetricAttendance] = useState(null);
  const [serverMetrics, setServerMetrics] = useState({});
  const [attendancePage, setAttendancePage] = useState(0);
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [metricsError, setMetricsError] = useState(null);
  const [evalBusy, setEvalBusy] = useState(false);
  const evalAttempt = useRef(null);
  const evalInFlight = useRef(false);
  const [alerts, setAlerts] = useState([]);
  const [evalRecords, setEvalRecords] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [docs, setDocs] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [resourceErrors, setResourceErrors] = useState({});
  const loadSequence = useRef(0);

  // Evaluation form
  const [selectedInternId, setSelectedInternId] = useState("");
  const [rubricScores, setRubricScores] = useState({});
  const [qualFeedback, setQualFeedback] = useState("");
  const [showEvalSuccess, setShowEvalSuccess] = useState(false);

  // DTR review
  const [selectedEx, setSelectedEx] = useState([]);
  const [reviewNote, setReviewNote] = useState("");

  // Documents
  const [selectedDocInternId, setSelectedDocInternId] = useState("");
  const [documentHistory, setDocumentHistory] = useState(false);
  const [revisionNoteForm, setRevisionNoteForm] = useState({});
  const [showRevisionInput, setShowRevisionInput] = useState(null);

  // Announcements
  const [restoredAnnouncement] = useState(() => readAnnouncementDraft(profile.id));
  const [annForm, setAnnForm] = useState(() => restoredAnnouncement?.form ?? emptyAnnouncement());
  const [draftError, setDraftError] = useState("");
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const announcementInFlight = useRef(false);
  const announcementAttempt = useRef(restoredAnnouncement?.attempt ?? null);
  useEffect(() => {
    if (!annForm.title && !annForm.body && !announcementAttempt.current) { clearAnnouncementDraft(profile.id); return; }
    if (announcementAttempt.current) return;
    setDraftError(writeAnnouncementDraft(profile.id, annForm, announcementAttempt.current) ? "" : "Draft storage is unavailable. Enable session storage before sending.");
  }, [profile.id, annForm]);

  const roster = useMemo(() => rosterBase.map(r => {
    const metric = serverMetrics[r.id]?.metric ?? internMetrics({ internId: r.id, required: r.required });
    return { ...r, hours: metric.verified, logged: metric.logged, cleared: metric.cleared, status: metric.risk, remaining: metric.remaining };
  }), [rosterBase, serverMetrics]);
  const sectionName = (id) => id ? sections?.find((section) => section.id === id)?.name ?? "Section unavailable" : "Unassigned";
  const sectionOptions = [...new Set(roster.map((intern) => intern.sectionId).filter(Boolean))]
    .map((id) => ({ id, name: sectionName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const visibleRoster = roster.filter((intern) => (!sectionFilter
    || (sectionFilter === "unassigned" ? !intern.sectionId : intern.sectionId === sectionFilter))
    && (!yearFilter || (yearFilter === "unassigned" ? !intern.academicYearId : intern.academicYearId === yearFilter)));
  const visibleIds = new Set(visibleRoster.map(intern => intern.id));
  const visibleExceptions = exceptions.filter(row => visibleIds.has(row.intern_id));
  const visibleEvaluations = evalRecords.filter(row => visibleIds.has(row.intern_id));
  const visibleAnnouncements = announcements.filter(row => (!sectionFilter && !yearFilter)
    || (row.recipient_ids ?? []).some(id => visibleIds.has(id))
    || (row.target_intern_id && visibleIds.has(row.target_intern_id)));
  const attendancePager = <div className="toolbar py-2"><button disabled={loading || attendancePage === 0} onClick={() => setAttendancePage(page => page - 1)}>Previous attendance page</button><span>Page {attendancePage + 1} | {attendanceCount} records</span><button disabled={loading || (attendancePage + 1) * 50 >= attendanceCount} onClick={() => setAttendancePage(page => page + 1)}>Next attendance page</button></div>;
  const visibleAttendance = (metricAttendance ?? []).filter(row => visibleIds.has(row.intern_id))
    .sort((a,b) => b.log_date.localeCompare(a.log_date) || b.id.localeCompare(a.id));
  const yearName = (id) => id ? academicYears.find(year => year.id === id)?.label ?? "Academic year unavailable" : "Unassigned academic year";
  const loadAll = async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    const capture = captureRequest;
    try {
      const [internResult, peopleResult, companyResult, sectionResult, yearResult] = await Promise.all([
        capture(completeRows(supabase, "interns").then(data => ({ data }))),
        capture(completeRows(supabase, "profiles").then(data => ({ data }))),
        capture(completeRows(supabase, "companies").then(data => ({ data }))),
        capture(completeRows(supabase, "course_sections").then(data => ({ data }))),
        capture(completeRows(supabase, "academic_years").then(data => ({ data }))),
      ]);
      if (sequence !== loadSequence.current) return;
      const errors = {};
      if (internResult.error) errors.interns = internResult.error.message;
      if (peopleResult.error) errors.profiles = peopleResult.error.message;
      if (companyResult.error) errors.companies = companyResult.error.message;
      if (sectionResult.error) errors.sections = sectionResult.error.message;
      else setSections(sectionResult.data ?? []);
      if (yearResult.error) errors.years = yearResult.error.message;
      else setAcademicYears(yearResult.data ?? []);
      const internRows = !errors.interns && !errors.profiles
        ? (internResult.data ?? []).filter(r => r.instructor_id === profile.id).map(r => ({ ...r, profiles: peopleResult.data?.find(p => p.id === r.id), companies: companyResult.data?.find(c => c.id === r.company_id) })).filter(r => r.profiles?.role === "intern")
        : null;
      const scopedInterns = (internRows ?? []).filter(row => (!sectionFilter
        || (sectionFilter === "unassigned" ? !row.section_id : row.section_id === sectionFilter))
        && (!yearFilter || (yearFilter === "unassigned" ? !row.academic_year_id : row.academic_year_id === yearFilter)));
      const documentOwner = scopedInterns.find(row => row.id === selectedDocInternId)?.id ?? scopedInterns[0]?.id;

      const [attendanceResult, metricsResult, evalResult, exceptionResult, docResult, alertResult, annResult] = await Promise.all([
        capture(tab === "dtr-review" && scopedInterns.length ? detailPage(supabase, "attendance_logs", { page: attendancePage, order: "log_date", filter: query => query.in("intern_id", scopedInterns.map(row => row.id)) }) : Promise.resolve({ data: [], count: 0 })),
        capture(dashboardMetrics(supabase, profile.id).then(data => ({ data }))),
        capture((tab === "evaluations" ? completeRows(supabase, "evaluations") : Promise.resolve([])).then(data => ({ data }))),
        capture((tab === "dtr-review" ? completeRows(supabase, "attendance_exceptions") : Promise.resolve([])).then(data => ({ data: data.sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) }))),
        capture(tab === "documents" && documentOwner ? completeRows(supabase, "documents", documentOwner).then(data => ({ data })) : Promise.resolve({ data: [] })),
        capture(completeRows(supabase, "alerts", undefined, { filter: query => query.eq("dismissed", false) }).then(data => ({ data }))),
        capture((tab === "announcements" ? completeRows(supabase, "announcements", undefined, { filter: query => query.eq("instructor_id", profile.id) }) : Promise.resolve([])).then(data => ({ data: data.sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) }))),
      ]);
      if (sequence !== loadSequence.current) return;
      const named = [
        ["attendance", attendanceResult], ["metrics", metricsResult], ["evaluations", evalResult],
        ["exceptions", exceptionResult], ["documents", docResult], ["alerts", alertResult], ["announcements", annResult],
      ];
      for (const [key, result] of named) if (result?.error) errors[key] = result.error.message;
      if (!errors.attendance && Array.isArray(attendanceResult.data)) { setMetricAttendance(attendanceResult.data); setAttendanceCount(attendanceResult.count ?? 0); }
      if (!errors.metrics) setServerMetrics(Object.fromEntries(metricsResult.data.map(row => [row.id,row])));
      if (!errors.documents && Array.isArray(docResult.data)) setDocs(docResult.data);
      if (!errors.exceptions && Array.isArray(exceptionResult.data)) setExceptions(exceptionResult.data.map(e => ({ ...e, internName: "—" })));
      if (!errors.alerts && Array.isArray(alertResult.data)) setAlerts(alertResult.data);
      if (!errors.announcements && Array.isArray(annResult.data)) {
        setAnnouncements(annResult.data ?? []);
        const pending = announcementAttempt.current;
        const saved = pending && annResult.data.find(row => row.submission_id === pending.id && row.instructor_id === profile.id);
        if (saved) { clearAnnouncementDraft(profile.id); announcementAttempt.current = null; setAnnForm(emptyAnnouncement()); }
      }

      if (internRows) {
        const latestScoreByIntern = Object.fromEntries((metricsResult.data ?? []).map(row => [row.id,evaluationResult(row.latestEvaluation)]));
        const metricById = Object.fromEntries((metricsResult.data ?? []).map(row => [row.id,row]));
        const internNameById = {};
        const mergedRoster = internRows.map(r => {
          internNameById[r.id] = r.profiles?.full_name ?? "Unknown";
          return { id: r.id, name: r.profiles?.full_name ?? "Unknown", company: r.companies?.name ?? (r.company_id ? "Company unavailable" : "Unassigned"), required: r.required_hours,
            sectionId: r.section_id ?? null,
            academicYearId: r.academic_year_id ?? null,
            midterm: latestScoreByIntern[r.id] ?? null, accountStatus: r.profiles.status, studentId: r.profiles.student_id,
            clockedIn: errors.metrics ? null : metricById[r.id]?.clockedIn ?? null };
        });
        setRoster(mergedRoster);
        if (!errors.evaluations) setEvalRecords((evalResult.data ?? []).map(e => ({ ...e, internName: internNameById[e.intern_id] ?? "—" })));
        if (!errors.exceptions) setExceptions((exceptionResult.data ?? []).map(e => ({ ...e, internName: internNameById[e.intern_id] ?? "—" })));
        if (!errors.alerts) setAlerts((alertResult.data ?? []).map(a => ({ ...a, internName: internNameById[a.intern_id] ?? "—" })));
      }
      setResourceErrors(errors);
      if (!Object.values(errors).some(Boolean)) setLastUpdated(new Date());
      setMetricsError(Object.values(errors).length ? (errors.interns || errors.profiles || errors.metrics || null) : null);
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
  }, [profile.id, tab, attendancePage, sectionFilter, yearFilter, selectedDocInternId]);

  const refreshMetrics = async () => {
    try { const rows = await dashboardMetrics(supabase, profile.id); setServerMetrics(Object.fromEntries(rows.map(row => [row.id,row]))); }
    catch (error) { setMetricsError(error.message || "Progress refresh failed"); }
  };

  const internName = (id) => roster.find((r) => r.id === id)?.name ?? "—";

  const computedScore = rubricScore(rubricScores);
  const rubricComplete = computedScore !== null;

  const supervisionKnown = !metricsError && visibleRoster.every(intern => serverMetrics[intern.id]);
  const activeNow = !supervisionKnown || visibleRoster.some((r) => r.clockedIn === null) ? "Unavailable" : visibleRoster.filter((r) => r.clockedIn).length;
  const atRisk = !supervisionKnown || visibleRoster.some(r => r.status === "Unknown") ? "Unavailable" : visibleRoster.filter((r) => r.status === "At Risk").length;
  const withoutEvaluation = supervisionKnown ? visibleRoster.filter(r => !serverMetrics[r.id].latestEvaluation).length : "Unavailable";
  const pendingEx = supervisionKnown ? visibleRoster.reduce((total,row) => total + (serverMetrics[row.id].pendingCorrections ?? 0), 0) : "Unavailable";
  const attentionRoster = supervisionKnown ? visibleRoster.filter(intern => {
    const facts = serverMetrics[intern.id];
    return facts.pendingCorrections > 0 || facts.documentCount > facts.metric.approved || !facts.latestEvaluation || ["At Risk", "Unknown"].includes(intern.status);
  }) : [];

  const statCards = [
    { label: "Assigned Interns", value: metricsError ? "Unavailable" : `${visibleRoster.length}`, icon: <IconGradCap size={18} />, iconBg: "#eff6ff", iconColor: "#2563eb" },
    { label: "Active Now", value: `${activeNow}`, icon: <IconClock size={18} />, iconBg: "#f0fdf4", iconColor: "#16a34a" },
    { label: "At Risk", value: `${atRisk}`, icon: <IconAlertTriangle size={18} />, iconBg: "#fff1f2", iconColor: "#dc2626", warn: true },
    { label: "Attendance Corrections", value: `${pendingEx}`, icon: <IconClock size={18} />, iconBg: "#fefce8", iconColor: "#d97706" },
  ];

  const dismissAlert = async (id) => {
    if (resourceErrors.alerts) return toast("Alerts are unavailable; refresh before dismissing this item.", "error");
    const { data, error } = await captureRequest(supabase.from("alerts").update({ dismissed: true }).eq("id", id).select("id").maybeSingle());
    if (error) return toast(error.message, "error");
    if (!data?.id) return toast("Alert was not changed; it may already be dismissed or no longer be available. Refresh and retry.", "error");
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    toast("Alert dismissed", "success");
  };

  // ── Evaluation submit ──
  const submitEval = async () => {
    if (!selectedInternId || !visibleIds.has(selectedInternId) || !rubricComplete || evalInFlight.current) return;
    evalInFlight.current = true; setEvalBusy(true);
    const fingerprint = JSON.stringify([selectedInternId, rubricScores, qualFeedback]);
    if (evalAttempt.current?.fingerprint !== fingerprint) evalAttempt.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const result = await saveEvaluation(supabase, selectedInternId, rubricScores, qualFeedback, evalAttempt.current.id);
      if (!result.ok) { toast(result.error, "error"); return result; }
      const data = result.data;
      setEvalRecords(prev => [{ ...data, internName: internName(selectedInternId) }, ...prev.filter(e => e.id !== data.id)]);
      setRoster(prev => prev.map(r => r.id === selectedInternId && (data.academic_year_id ?? null) === r.academicYearId ? { ...r, midterm: evaluationResult(data) } : r));
      setSelectedInternId(""); setRubricScores({}); setQualFeedback(""); evalAttempt.current = null;
      setShowEvalSuccess(true); toast("Evaluation submitted", "success");
      setTimeout(() => setShowEvalSuccess(false), 3000); return result;
    } finally { evalInFlight.current = false; setEvalBusy(false); }
  };

  // ── DTR exception review ──
  // Approving a request doesn't just flip its status — it has to actually
  // create or correct the attendance_logs row it's claiming, or the fix
  // would never show up in the intern's DTR or Weekly Hours Log graph.
  const runReview = async (ids, decision) => {
    if (reviewBusy || !ids.length) return;
    if (resourceErrors.exceptions) { toast("DTR review data is unavailable; refresh before reviewing requests.", "error"); return; }
    if (reviewNote.length > 500 || (decision === "Rejected" && !reviewNote.trim())) {
      toast("Enter a rejection note (at most 500 characters)", "error");
      return;
    }
    if (ids.length > 100) { toast("Select at most 100 corrections per review", "error"); return; }
    setReviewBusy(true);
    try {
      const outcomes = await reviewCorrections(supabase, ids, decision, reviewNote.trim() || null);
      const committed = outcomes.filter((r) => r.ok);
      const failed = outcomes.filter((r) => !r.ok);
      const rows = Object.fromEntries(committed.map((r) => [r.id, r.data]));
      setExceptions((prev) => prev.map((e) => rows[e.id] ? { ...e, ...rows[e.id] } : e));
      setSelectedEx((prev) => prev.filter((id) => !rows[id]));
      if (committed.length) toast(committed.length + ' correction(s) ' + decision.toLowerCase(), 'success');
      if (failed.length) toast(failed.length + ' failed: ' + failed[0].error, 'error');
      if (!failed.length) setReviewNote("");
      if (committed.length) await loadAll();
    } finally { setReviewBusy(false); }
  };
  const approveEx = (id) => runReview([id], 'Approved');
  const rejectEx = (id) => runReview([id], 'Rejected');
  const bulkApprove = () => runReview(selectedEx.filter((id) => visibleExceptions.find((e) => e.id === id)?.status === 'Pending'), 'Approved');
  const bulkReject = () => runReview(selectedEx.filter((id) => visibleExceptions.find((e) => e.id === id)?.status === 'Pending'), 'Rejected');
  const toggleSelectEx = (id) => setSelectedEx((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectAllPending = () => setSelectedEx(visibleExceptions.filter((e) => e.status === "Pending").map((e) => e.id));

  const verifyAttendance = async (row) => {
    if (attendanceInFlight.current || resourceErrors.attendance) return;
    attendanceInFlight.current = true; setAttendanceBusy(row.id);
    try {
      const result = await recordRpc(supabase, "verify_attendance", { p_id: row.id, p_expected_in: row.clocked_in_at,
        p_expected_out: row.clocked_out_at, p_expected_hours: row.hours });
      if (!result.ok || result.data.verified !== true) return toast(result.error || "Verification was not confirmed; refresh before retrying.", "error");
      setMetricAttendance(prev => prev?.map(item => item.id === result.data.id ? result.data : item));
      await refreshMetrics();
      const assignment = rosterBase.find(intern => intern.id === result.data.intern_id);
      const historical = assignment && (assignment.academicYearId ?? null) !== (result.data.academic_year_id ?? null);
      toast(historical ? "Attendance verified. This record belongs to another academic year; current assigned-year progress is unchanged." : "Attendance verified.", "success");
    } finally { attendanceInFlight.current = false; setAttendanceBusy(null); }
  };

  // ── Documents review ──
  const updateDocStatus = async (doc, status, note) => {
    if (reviewBusy) return { ok: false };
    if (resourceErrors.documents) { toast("Document review data is unavailable; refresh before making this change.", "error"); return { ok: false }; }
    setReviewBusy(true);
    const result = await recordRpc(supabase, "review_document_version", {
      p_id: doc.id, p_status: status, p_note: note ?? null, p_expected_version: doc.upload_version, p_expected_revision: doc.review_revision,
    });
    setReviewBusy(false);
    if (!result.ok) { toast(result.error, "error"); return result; }
    setDocs((prev) => prev?.map((d) => d.id === doc.id ? result.data : d));
    await refreshMetrics();
    const name = internName(doc.intern_id);
    if (status === "Approved") toast(`${name} — document approved`, "success");
    else if (status === "Needs Revision") toast(`Revision requested for ${name}`, "info");
    return result;
  };

  // ── Announcements ──
  const sendAnnouncement = async () => {
    if (announcementInFlight.current) return;
    if (resourceErrors.announcements || resourceErrors.interns || resourceErrors.profiles) { toast("Announcements or recipients are unavailable; refresh before sending.", "error"); return; }
    if (!annForm.title.trim() || !annForm.body.trim()) {
      toast("Please fill in title and message", "error");
      return;
    }
    const target = annForm.target;
    const sectionId = target.startsWith("section:") ? target.slice(8) : null;
    const targetIntern = target === "All Interns" || sectionId ? null : visibleRoster.find((r) => r.id === target && r.accountStatus === "Active") ?? (announcementAttempt.current ? { id: target, name: "original recipient" } : null);
    if (sectionId && resourceErrors.sections && !announcementAttempt.current) return toast("Sections unavailable; refresh before sending.", "error");
    if (target !== "All Interns" && !sectionId && !targetIntern) return toast("Select a current recipient", "error");
    const payload = { p_title: annForm.title.trim(), p_body: annForm.body.trim(), p_target_intern_id: targetIntern?.id ?? null, p_section_id: sectionId };
    const fingerprint = JSON.stringify(payload);
    if (announcementAttempt.current && announcementAttempt.current.fingerprint !== fingerprint) return toast("Retry the pending announcement with its original content before composing another.", "error");
    if (!announcementAttempt.current) announcementAttempt.current = { fingerprint, id: crypto.randomUUID(), uncertain: false };
    if (!writeAnnouncementDraft(profile.id, annForm, announcementAttempt.current)) return toast("Draft storage is unavailable; the announcement was not sent.", "error");
    announcementInFlight.current = true; setAnnouncementBusy(true);
    try {
      const result = await recordRpc(supabase, "send_announcement", { ...payload, p_submission_id: announcementAttempt.current.id });
      if (!result.ok) {
        // A PostgreSQL rejection confirms this call did not commit. Transport
        // failures keep the original identity; unknown response codes stay pending.
        if (!announcementAttempt.current.uncertain && ["42501", "22023", "23514", "P0001"].includes(result.code)) {
          announcementAttempt.current = null; writeAnnouncementDraft(profile.id, annForm, null);
        } else {
          announcementAttempt.current.uncertain = true; writeAnnouncementDraft(profile.id, annForm, announcementAttempt.current);
        }
        return toast(result.error, "error");
      }
      if (result.data.submission_id !== announcementAttempt.current.id || result.data.instructor_id !== profile.id) {
        announcementAttempt.current.uncertain = true; writeAnnouncementDraft(profile.id, annForm, announcementAttempt.current);
        return toast("The saved announcement identity was not confirmed. Refresh to reconcile it before retrying.", "error");
      }
      setAnnouncements(prev => [result.data, ...prev.filter(item => item.id !== result.data.id)]);
      clearAnnouncementDraft(profile.id); announcementAttempt.current = null; setAnnForm(emptyAnnouncement());
      toast("Announcement saved for " + (sectionId ? sectionName(sectionId) : targetIntern?.name ?? "your active roster"), "success");
    } finally { announcementInFlight.current = false; setAnnouncementBusy(false); }
  };

  const selectedIntern = visibleRoster.find((r) => r.id === selectedDocInternId) ?? visibleRoster[0];
  const allSelectedDocs = (docs ?? []).filter((d) => d.intern_id === selectedIntern?.id);
  const selectedInternDocs = documentHistory ? allSelectedDocs : academicRows(allSelectedDocs, selectedIntern?.academicYearId) ?? [];
  const selectedApprovedCount = selectedInternDocs.filter((d) => d.status === "Approved").length;
  const selectedAllApproved = selectedInternDocs.length > 0 && selectedApprovedCount === selectedInternDocs.length;

  return (
    <Shell userName={profile.full_name} userEmail={profile.email} userRole="OJT Coordinator"
      navItems={navItems} activeTab={tab} onTabChange={setTab} onLogout={onLogout}>
      <div className="workspace space-y-5">
        <RefreshStatus loading={loading || reviewBusy || evalBusy || Boolean(attendanceBusy) || announcementBusy} lastUpdated={lastUpdated} onRefresh={loadAll} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{tab === "overview" ? `Hi, ${profile.full_name.split(" ")[0]}!` : navItems.find((n) => n.id === tab)?.label}</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              {profile.organization ?? "Your assigned interns"} · {roster.length} Interns
              {alerts.length > 0 && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{alerts.length} alerts</span>
              )}
              {pendingEx > 0 && (
                <span className="ml-1.5 text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>{pendingEx} DTR pending</span>
              )}
            </p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
            {new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" })}
          </span>
        </div>

        {Object.values(resourceErrors).some(Boolean) && <div role="alert" className="rounded-lg px-4 py-3 text-sm flex flex-wrap gap-3 items-center" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}><span>Some instructor data is unavailable; displayed values may be stale.</span><button onClick={loadAll} className="underline font-semibold">Retry refresh</button></div>}
        {metricsError && <p role="alert" className="text-sm">Progress unavailable: {metricsError}</p>}
        {loading && <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading…</div>}

        {(
          <div className="ui-card flex flex-wrap items-end gap-3 rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="w-full sm:w-64">
              <label htmlFor="instructor-section-filter" className="block text-xs font-medium mb-1.5">Section</label>
              <select id="instructor-section-filter" value={sectionFilter} onChange={(event) => { setAttendancePage(0); setSectionFilter(event.target.value); setSelectedEx([]); }}
                disabled={loading || Boolean(resourceErrors.sections)} className={inputCls} style={inputStyle}>
                <option value="">All sections</option>
                {sectionOptions.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                {sectionFilter && sectionFilter !== "unassigned" && !sectionOptions.some((section) => section.id === sectionFilter) && (
                  <option value={sectionFilter}>{sectionName(sectionFilter)}</option>
                )}
                <option value="unassigned">Unassigned</option>
              </select>
            </div>
            <div className="w-full sm:w-64">
              <label htmlFor="instructor-year-filter" className="block text-xs font-medium mb-1.5">Academic-year assignment</label>
              <select id="instructor-year-filter" value={yearFilter} onChange={event => { setAttendancePage(0); setYearFilter(event.target.value); setSelectedEx([]); }}
                disabled={loading || Boolean(resourceErrors.years)} className={inputCls} style={inputStyle}>
                <option value="">All assigned academic years</option>
                {academicYears.map(year => <option key={year.id} value={year.id}>{year.label}</option>)}
                <option value="unassigned">Unassigned academic year</option>
              </select>
            </div>
            <p className="text-xs py-2" style={{ color: "var(--muted-foreground)" }}>Showing {visibleRoster.length} of {roster.length} assigned interns</p>
            <button onClick={loadAll} disabled={loading} className="text-xs px-3 py-2 rounded-lg font-semibold disabled:opacity-50"
              style={{ background: "var(--secondary)", color: "var(--foreground)" }}>Refresh roster</button>
          </div>
        )}

        {/* ── OVERVIEW ── */}
        {hasLoaded && tab === "overview" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((s) => (
                <div key={s.label} className="ui-card ui-stat-card rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: s.iconBg, color: s.iconColor }}>{s.icon}</div>
                  <div className="text-2xl font-bold mb-0.5" style={{ color: s.warn ? "var(--danger)" : "var(--foreground)" }}>{s.value}</div>
                  <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <section aria-label="Pending actions" className="ui-card rounded-xl p-4 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold">Pending Actions</h2>
              <div className="action-links text-xs">
                <button className="underline" onClick={() => setTab("progress")}>View my interns</button>
                <button className="underline" onClick={() => setTab("documents")}>Requirements awaiting approval: {supervisionKnown ? visibleRoster.reduce((total, intern) => total + Math.max(0, serverMetrics[intern.id].documentCount - serverMetrics[intern.id].metric.approved), 0) : "Unavailable"}</button>
                <button className="underline" onClick={() => setTab("evaluations")}>Without an evaluation for the assigned year: {withoutEvaluation}</button>
              </div>
            </section>
          </>
        )}

        {/* ── PROGRESS ── */}
        {hasLoaded && tab === "progress" && (
          <div className="space-y-3">
            <section aria-label="Supervision actions" className="ui-card rounded-xl p-4 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold">Who Needs My Attention?</h2>
              <p className="text-xs">Without an evaluation for the assigned year: {withoutEvaluation}. Evaluation scores remain informational.</p>
              {!supervisionKnown ? <p role="status" className="text-xs">Supervision actions unavailable. Refresh the roster to check current evidence.</p> : <>
                {attentionRoster.map(intern => {
                  const facts = serverMetrics[intern.id];
                  return <div key={intern.id} className="flex flex-wrap items-center gap-3 text-xs py-2" style={{ borderTop: "1px solid var(--border)" }}>
                    <span className="font-semibold">{intern.name}</span><StatusBadge status={intern.status} />
                    <button className="underline" onClick={() => setTab("dtr-review")}>Attendance corrections: {facts.pendingCorrections}</button>
                    <button className="underline" onClick={() => { setSelectedDocInternId(intern.id); setTab("documents"); }}>Requirements awaiting approval: {Math.max(0, facts.documentCount - facts.metric.approved)}</button>
                    {!facts.latestEvaluation && <button className="underline" onClick={() => { if (selectedInternId !== intern.id) { setRubricScores({}); setQualFeedback(""); } setSelectedInternId(intern.id); setTab("evaluations"); }}>Evaluate {intern.name}</button>}
                  </div>;
                })}
                {visibleRoster.length === 0 && <p className="text-xs">No assigned interns in this selection.</p>}
                {visibleRoster.length > 0 && attentionRoster.length === 0 && <p className="text-xs">No outstanding actions in the current selection.</p>}
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Requirements awaiting approval include documents still awaiting submission. Open an intern's documents to review uploaded evidence.</p>
              </>}
            </section>
            <section aria-label="Assigned intern progress" className="space-y-3">
            {visibleRoster.length === 0 && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No assigned interns in this section.</p>}
            {visibleRoster.map((s) => {

              return (
                <div key={s.id} className="ui-card rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div>
                      <span className="text-sm font-semibold">{s.name}</span>
                      <span className="text-xs ml-2" style={{ color: "var(--muted-foreground)" }}>{s.company}</span>
                      <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Section: {sectionName(s.sectionId)}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Academic year: {yearName(s.academicYearId)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={s.status} />
                      <span className="font-mono text-sm">{displayHours(s.hours)} <span style={{ color: "var(--muted-foreground)" }}>/ {s.required} hrs</span></span>
                    </div>
                  </div>
                  <ProgressBar value={s.hours} max={s.required} />
                  <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    <span>Remaining: {displayHours(s.remaining)} verified hrs</span>
                    <span>Logged: {displayHours(s.logged)} hrs</span>
                    <span>Attendance: {s.clockedIn === null ? "Unavailable" : s.clockedIn ? "Clocked in" : "Not clocked in"}</span>
                    <span>Latest rating: {s.midterm === null ? "Unavailable" : `${s.midterm}/100`}</span>
                    {s.cleared && <span style={{ color: "var(--success)" }}>Clearance eligible</span>}

                  </div>
                </div>
              );
            })}
            </section>
          </div>
        )}

        {/* ── EVALUATIONS ── */}
        {hasLoaded && tab === "evaluations" && (
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div className="ui-card rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold mb-3">New Evaluation</h2>
                <div className="mb-4">
                  <label htmlFor="evaluation-intern" className="block text-xs font-medium mb-1.5" style={{ color: "var(--foreground)" }}>Select Intern</label>
                  <select id="evaluation-intern" disabled={evalBusy} value={selectedInternId} onChange={(e) => { setSelectedInternId(e.target.value); setRubricScores({}); setQualFeedback(""); }}
                    className={inputCls} style={inputStyle}>
                    <option value="">— Choose intern —</option>
                    {visibleRoster.filter(r => r.accountStatus === "Active").map((r) => <option key={r.id} value={r.id}>{r.name} · {sectionName(r.sectionId)}</option>)}
                  </select>
                </div>

                <div className="space-y-4">
                  {rubricCriteria.map((c) => (
                    <div key={c.id}>
                      <div className="toolbar justify-between mb-1.5">
                        <span className="text-xs font-medium" style={{ color: "var(--foreground)" }}>{c.label}</span>
                        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          Weight: {c.weight}%{" "}
                          {rubricScores[c.id] ? <span style={{ color: "var(--primary)", fontWeight: 600 }}>{scaleLabels[rubricScores[c.id]]}</span> : ""}
                        </span>
                      </div>
                      <div role="group" aria-label={`${c.label} score`} className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} aria-label={`${c.label}: ${n} of 5`} aria-pressed={rubricScores[c.id] === n} onClick={() => selectedInternId && setRubricScores((s) => ({ ...s, [c.id]: n }))}
                            disabled={evalBusy || !selectedInternId}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-30"
                            style={{ background: rubricScores[c.id] === n ? "var(--primary)" : "var(--secondary)", color: rubricScores[c.id] === n ? "#fff" : "var(--muted-foreground)" }}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {rubricComplete && (
                  <div className="mt-4 rounded-lg p-3 flex items-center justify-between" style={{ background: "var(--primary-light)" }}>
                    <span className="text-xs font-semibold" style={{ color: "var(--primary)" }}>Computed Score</span>
                    <span className="text-lg font-bold" style={{ color: "var(--primary)" }}>{Math.round(computedScore)}<span className="text-xs font-normal">/100</span></span>
                  </div>
                )}

                <div className="mt-4">
                  <label htmlFor="evaluation-feedback" className="block text-xs font-medium mb-1.5" style={{ color: "var(--foreground)" }}>Feedback & Guidance</label>
                  <textarea id="evaluation-feedback" rows={3} maxLength={500} disabled={evalBusy} value={qualFeedback} onChange={(e) => setQualFeedback(e.target.value)}
                    placeholder="Specific feedback, constructive guidance, areas for improvement..."
                    className="w-full text-sm py-2 px-3 rounded-lg border outline-none resize-none"
                    style={inputStyle} />
                </div>

                <div className="flex justify-end mt-3 gap-2">
                  {showEvalSuccess && (
                    <span className="text-xs flex items-center gap-1" style={{ color: "var(--success)" }}><IconCheck size={12} /> Saved</span>
                  )}
                  <button disabled={evalBusy} onClick={() => { setSelectedInternId(""); setRubricScores({}); setQualFeedback(""); }}
                    className="text-sm px-3 py-2 rounded-lg" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>
                    Clear
                  </button>
                  <button onClick={submitEval} disabled={evalBusy || !selectedInternId || !visibleIds.has(selectedInternId) || !rubricComplete}
                    className="text-sm px-4 py-2 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "var(--primary)", color: "#fff" }}>
                    Submit Evaluation
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className="ui-card rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-sm font-semibold">Evaluation Records ({visibleEvaluations.length})</span>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: "560px" }}>
                  {visibleEvaluations.length === 0 ? (
                    <div className="p-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No evaluations submitted yet.</div>
                  ) : visibleEvaluations.map((ev) => (
                    <div key={ev.id} className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="text-sm font-semibold">{ev.internName}</div>
                          <p className="text-xs">{yearName(ev.academic_year_id)}</p>
                          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                            Submitted: {new Date(ev.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" , timeZone: "Asia/Manila" })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold" style={{ color: "var(--primary)" }}>{evaluationResult(ev) ?? "Unavailable"}<span className="text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>/100</span></div>
                        </div>
                      </div>
                      <EvaluationCriteria criteria={ev.competencies} />
                      {ev.feedback && <p className="text-xs italic" style={{ color: "var(--muted-foreground)" }}>"{ev.feedback}"</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── DTR REVIEW ── */}
        {hasLoaded && tab === "dtr-review" && (
          <>
            <section className="ui-card rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 space-y-1">
                <h2 className="text-sm font-semibold">Attendance Verification</h2>
                {attendancePager}
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Review the recorded shift and accomplishments before verifying. History includes all academic years for the shown interns; each record keeps its original year. Only records from the intern's assigned academic year count toward their current progress.</p>
              </div>
              {resourceErrors.attendance && <p role="alert" className="px-4 text-xs">Attendance is stale or unavailable. Refresh before verifying.</p>}
              <div role="region" aria-label="Attendance verification records" tabIndex={0} className="table-region overflow-x-auto">
                <table className="data-table w-full text-sm" aria-label="Attendance verification">
                  <thead><tr style={{ background: "var(--muted)" }}>{["Intern", "Section", "Academic Year", "Date", "Time In", "Time Out", "Hours", "Accomplishments", "Status", "Action"].map(label => <th scope="col" key={label} className="text-left px-4 py-2 text-xs">{label}</th>)}</tr></thead>
                  <tbody>
                    {visibleAttendance.map(row => {
                      const intern = visibleRoster.find(item => item.id === row.intern_id);
                      const evidence = attendanceEvidence(row);
                      const endDate = row.clocked_out_at && Number.isFinite(Date.parse(row.clocked_out_at)) ? manilaDate(new Date(row.clocked_out_at)) : null;
                      return <tr key={row.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-4 py-3 text-xs">{intern?.name}</td>
                        <td className="px-4 py-3 text-xs">{sectionName(intern?.sectionId)}</td>
                        <td className="px-4 py-3 text-xs">{yearName(row.academic_year_id)}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">{formatBusinessDate(row.log_date)}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">{formatAttendanceTime(row.time_in)}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">{formatAttendanceTime(row.time_out)}{endDate && endDate !== row.log_date ? ` (${formatBusinessDate(endDate)})` : ""}</td>
                        <td className="px-4 py-3 text-xs">{displayHours(row.hours)}</td>
                        <td className="px-4 py-3 text-xs min-w-48 whitespace-pre-wrap break-words">{row.accomplishment || "—"}</td>
                        <td className="px-4 py-3 text-xs">{evidence.state === "legacy-or-invalid" ? "Correction needed" : row.verified ? "Verified" : evidence.state === "open" ? "In progress" : "Pending verification"}</td>
                        <td className="px-4 py-3 text-xs">{evidence.state === "closed" && !row.verified && <button disabled={Boolean(attendanceBusy) || Boolean(resourceErrors.attendance)} onClick={() => verifyAttendance(row)} className="px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50" style={{ background: "var(--success-bg)", color: "var(--success)" }}>{attendanceBusy === row.id ? "Verifying…" : "Verify attendance"}</button>}</td>
                      </tr>;
                    })}
                    {!loading && !resourceErrors.attendance && visibleAttendance.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-xs">No attendance records for the shown interns.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="ui-card rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 toolbar justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                <div>
                  <span className="text-sm font-semibold">DTR Exception Queue</span>
                  <span className="text-xs ml-2 px-2 py-0.5 rounded-full" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>{visibleExceptions.filter(row => row.status === "Pending").length} Pending</span>
                </div>
                {selectedEx.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{selectedEx.length} selected</span>
                    <button disabled={reviewBusy} onClick={bulkApprove} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: "var(--success-bg)", color: "var(--success)" }}>Approve All</button>
                    <button disabled={reviewBusy} onClick={bulkReject} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>Reject All</button>
                  </div>
                )}
                {selectedEx.length === 0 && visibleExceptions.some(row => row.status === "Pending") && (
                  <button onClick={selectAllPending} className="text-xs" style={{ color: "var(--primary)" }}>Select all pending</button>
                )}
              </div>
              <div className="px-4 py-3">
                <label htmlFor="correction-review-note" className="block text-xs mb-1">Review note (required to reject; applies to selected requests)</label>
                <textarea id="correction-review-note" value={reviewNote} maxLength={500} disabled={reviewBusy}
                  onChange={(e) => setReviewNote(e.target.value)} className={inputCls} style={inputStyle} rows={2} />
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{reviewNote.length}/500 characters. Failed reviews keep this draft.</p>
              </div>
              <div role="region" aria-label="Attendance correction records" tabIndex={0} className="table-region overflow-x-auto">
              <table className="data-table w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--muted)" }}>
                    <th className="px-4 py-2.5 w-8"><span className="sr-only">Select</span></th>
                    {["Intern", "Date", "Claimed Time In", "Claimed Time Out", "Reason", "Status", "Actions"].map((h) => (
                      <th scope="col" key={h} className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleExceptions.map((ex) => (
                    <tr key={ex.id} style={{ borderTop: "1px solid var(--border)", background: selectedEx.includes(ex.id) ? "var(--primary-light)" : undefined }}>
                      <td className="px-4 py-3">
                        <input aria-label={`Select correction for ${ex.internName} on ${ex.log_date}`} type="checkbox" checked={selectedEx.includes(ex.id)} disabled={reviewBusy || ex.status !== "Pending"}
                          onChange={() => toggleSelectEx(ex.id)} className="w-3.5 h-3.5 rounded" />
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">{ex.internName}</td>
                      <td className="px-4 py-3 text-xs">{formatBusinessDate(ex.log_date, { month: "short", day: "numeric" })}</td>
                      <td className="px-4 py-3 text-xs font-mono whitespace-nowrap">{formatAttendanceTime(ex.claimed_time_in)}</td>
                      <td className="px-4 py-3 text-xs font-mono whitespace-nowrap">{formatAttendanceTime(ex.claimed_time_out)}
                        {ex.claimed_end_date && ex.claimed_end_date !== ex.log_date && <div>Ends {formatBusinessDate(ex.claimed_end_date)}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-xs" style={{ color: "var(--muted-foreground)" }}>{ex.reason}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={ex.status === "Approved" ? { background: "var(--success-bg)", color: "var(--success)" }
                            : ex.status === "Rejected" ? { background: "var(--danger-bg)", color: "var(--danger)" }
                            : { background: "var(--warning-bg)", color: "var(--warning)" }}>
                          {ex.status}
                        </span>
                        {ex.review_note && <div className="text-xs mt-1 break-words">{ex.review_note}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {ex.status === "Pending" && (
                          <div className="flex gap-1.5">
                            <button disabled={reviewBusy} onClick={() => approveEx(ex.id)} className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: "var(--success-bg)", color: "var(--success)" }}>Approve</button>
                            <button disabled={reviewBusy} onClick={() => rejectEx(ex.id)} className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!loading && !resourceErrors.exceptions && visibleExceptions.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>No exception requests submitted.</td></tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>

            <div className="ui-card rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold mb-3">Recent Actions Log</h3>
              <div className="space-y-2">
                {visibleExceptions.filter((e) => e.status !== "Pending").map((ex) => (
                  <div key={ex.id} className="flex items-center gap-3 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ex.status === "Approved" ? "var(--success)" : "var(--danger)" }} />
                    <span style={{ color: "var(--muted-foreground)" }}>
                      <strong style={{ color: "var(--foreground)" }}>{ex.internName}</strong> — {formatBusinessDate(ex.log_date, { month: "short", day: "numeric" })} exception {ex.status.toLowerCase()}
                    </span>
                  </div>
                ))}
                {visibleExceptions.every((e) => e.status === "Pending") && (
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>No actions taken yet.</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── DOCUMENTS ── */}
        {hasLoaded && tab === "documents" && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              {visibleRoster.map((r) => {
                const rDocs = academicRows((docs ?? []).filter((d) => d.intern_id === r.id), r.academicYearId) ?? [];
                const rApproved = rDocs.filter((d) => d.status === "Approved").length;
                const rPending = rDocs.filter((d) => d.status === "Pending").length;
                const rRevision = rDocs.filter((d) => d.status === "Needs Revision").length;
                return (
                  <button key={r.id} onClick={() => { setSelectedDocInternId(r.id); setShowRevisionInput(null); }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
                    style={{
                      background: selectedIntern?.id === r.id ? "var(--primary)" : "var(--card)",
                      color: selectedIntern?.id === r.id ? "#fff" : "var(--foreground)",
                      border: `1px solid ${selectedIntern?.id === r.id ? "var(--primary)" : "var(--border)"}`,
                    }}>
                    <span className="font-medium">{r.name.split(" ")[0]}</span>
                    <span className="text-xs opacity-70">{rApproved}/{rDocs.length}</span>
                    {rRevision > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedIntern?.id === r.id ? "#fff" : "var(--danger)" }} />}
                    {rPending > 0 && rRevision === 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedIntern?.id === r.id ? "#fff" : "var(--warning)" }} />}
                  </button>
                );
              })}
            </div>
            {visibleRoster.length === 0 && <p className="text-sm">No assigned interns in this section.</p>}
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={documentHistory} onChange={event => setDocumentHistory(event.target.checked)} />Show document history from all academic years</label>

            {selectedIntern && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold">{selectedIntern.name}</h2>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {selectedIntern.company} · {selectedApprovedCount}/{selectedInternDocs.length} documents approved
                      {selectedIntern.cleared && <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "var(--success-bg)", color: "var(--success)" }}>Clearance Eligible</span>}
                    </p>
                  </div>
                  {selectedInternDocs.length > 0 && (
                    <div className="h-1.5 w-32 rounded-full overflow-hidden" style={{ background: "var(--secondary)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${(selectedApprovedCount / selectedInternDocs.length) * 100}%`, background: selectedAllApproved ? "var(--success)" : "var(--primary)" }} />
                    </div>
                  )}
                </div>

                {docs === null ? <p role="alert">Document requirements unavailable. <button onClick={loadAll} className="underline">Retry</button></p> : selectedInternDocs.length === 0 ? (
                  <div className="ui-card rounded-xl p-6 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                    No document requirements for this academic year. Ask an administrator to attach the standard checklist.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedInternDocs.map((doc) => {
                      const isShowingRevInput = showRevisionInput === doc.id;
                      return (
                        <div key={doc.id} className="rounded-xl p-4"
                          style={{ background: "var(--card)", border: `1px solid ${doc.status === "Needs Revision" ? "#fca5a5" : doc.status === "Approved" ? "#86efac" : "var(--border)"}` }}>
                          <div className="document-row">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                              style={{ background: doc.status === "Approved" ? "var(--success-bg)" : doc.status === "Needs Revision" ? "var(--danger-bg)" : "var(--warning-bg)" }}>
                              {doc.status === "Approved" ? <IconCheck size={16} style={{ color: "var(--success)" }} />
                                : doc.status === "Needs Revision" ? <IconAlertTriangle size={16} style={{ color: "var(--danger)" }} />
                                : <IconFileText size={16} style={{ color: "var(--warning)" }} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold">{doc.name}</span>
                                <span className="text-xs">{yearName(doc.academic_year_id)}</span>
                                <DocStatusPill status={doc.status} />
                              </div>
                              {doc.file_name
                                ? <div className="file-name text-xs mt-0.5 flex items-start gap-1" style={{ color: "var(--muted-foreground)" }}><IconFileText size={11} /> {doc.file_name}</div>
                                : <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>No file uploaded yet</div>}
                              {doc.note && (
                                <div className="text-xs mt-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                                  <strong>Review note:</strong> {doc.note}
                                </div>
                              )}
                            </div>
                            <div className="document-controls">
                              <DocumentActions doc={doc} />
                              <div className="flex flex-wrap items-center gap-2">
                                {doc.status === "Pending" && doc.upload_version > 0 && doc.file_name && (
                                  <button disabled={reviewBusy} onClick={() => updateDocStatus(doc, "Approved")} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                                    Approve
                                  </button>
                                )}
                                {doc.status === "Approved" && (
                                  <button disabled={reviewBusy} onClick={() => updateDocStatus(doc, "Pending")} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                                    Revoke
                                  </button>
                                )}
                                {doc.status === "Pending" && doc.upload_version > 0 && (
                                  <button onClick={() => setShowRevisionInput(isShowingRevInput ? null : doc.id)}
                                    className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                                    style={{ background: isShowingRevInput ? "var(--danger)" : "var(--danger-bg)", color: isShowingRevInput ? "#fff" : "var(--danger)" }}>
                                    Request Revision
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {isShowingRevInput && (
                            <div className="mt-3 toolbar">
                              <input aria-label={`Revision note for ${doc.name}`} type="text" maxLength={500} value={revisionNoteForm[doc.id] ?? ""} onChange={(e) => setRevisionNoteForm((f) => ({ ...f, [doc.id]: e.target.value }))}
                                placeholder="Describe what needs to be corrected..."
                                className="w-full sm:w-auto flex-1 text-sm py-1.5 px-3 rounded-lg border outline-none"
                                style={{ borderColor: "var(--danger)", background: "var(--card)", color: "var(--foreground)" }} />
                              <button
                                disabled={reviewBusy || !(revisionNoteForm[doc.id] ?? "").trim()}
                                onClick={async () => {
                                  const result = await updateDocStatus(doc, "Needs Revision", revisionNoteForm[doc.id] ?? "");
                                  if (result?.ok) {
                                    setRevisionNoteForm((f) => ({ ...f, [doc.id]: "" }));
                                    setShowRevisionInput(null);
                                  }
                                }}
                                className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0" style={{ background: "var(--danger)", color: "#fff" }}>
                                Send
                              </button>
                              <button onClick={() => setShowRevisionInput(null)} className="text-xs px-2 py-1.5 rounded-lg" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── ANNOUNCEMENTS ── */}
        {hasLoaded && tab === "announcements" && (
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="ui-card rounded-xl p-4 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold">Send Announcement</h2>
              <div>
                <label htmlFor="announcement-subject" className="block text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>Subject</label>
                {draftError && <p role="alert">{draftError}</p>}
                {announcementAttempt.current && <p role="status">A pending announcement is retained in this browser tab. Retry its original content to reconcile it before sending another.</p>}
                <input id="announcement-subject" type="text" aria-label="Announcement subject" maxLength={200} disabled={announcementBusy || Boolean(announcementAttempt.current)} value={annForm.title} onChange={(e) => setAnnForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g., Evaluation Deadline Reminder" className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label htmlFor="announcement-recipients" className="block text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>Recipients</label>
                <select id="announcement-recipients" aria-label="Announcement recipients" disabled={announcementBusy || Boolean(announcementAttempt.current)} value={annForm.target} onChange={(e) => setAnnForm((f) => ({ ...f, target: e.target.value }))} className={inputCls} style={inputStyle}>
                  <option value="All Interns">My active roster (all sections and years)</option>
                  {sectionOptions.map(section => <option disabled={Boolean(resourceErrors.sections)} key={section.id} value={`section:${section.id}`}>Section: {section.name} (all assigned years)</option>)}
                  {visibleRoster.filter(r => r.accountStatus === "Active").map((r) => <option key={r.id} value={r.id}>{r.name} · {sectionName(r.sectionId)} · {r.company}</option>)}
                  {annForm.target !== "All Interns" && !annForm.target.startsWith("section:") && !visibleRoster.some(r => r.id === annForm.target && r.accountStatus === "Active") && <option value={annForm.target} disabled>Recipient outside current filter; choose again</option>}
                </select>
              </div>
              <div>
                <label htmlFor="announcement-message" className="block text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>Message</label>
                <textarea id="announcement-message" rows={5} aria-label="Announcement message" maxLength={5000} disabled={announcementBusy || Boolean(announcementAttempt.current)} value={annForm.body} onChange={(e) => setAnnForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Type your announcement here..."
                  className="w-full text-sm py-2 px-3 rounded-lg border outline-none resize-none" style={inputStyle} />
              </div>
              <div className="flex justify-end">
                <button disabled={announcementBusy || Boolean(resourceErrors.announcements) || Boolean(resourceErrors.interns) || Boolean(resourceErrors.profiles)} onClick={sendAnnouncement} className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold disabled:opacity-50" style={{ background: "var(--primary)", color: "#fff" }}>
                  <IconMessageSquare size={14} /> {announcementBusy ? "Sending…" : "Send Announcement"}
                </button>
              </div>
            </div>

            <div>
              <div className="ui-card rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-sm font-semibold">Sent Announcements ({visibleAnnouncements.length})</span>
                </div>
                {visibleAnnouncements.length === 0 ? (
                  <div className="p-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No announcements sent yet.</div>
                ) : visibleAnnouncements.map((a) => (
                  <div key={a.id} className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{a.title}</div>
                        <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "var(--muted-foreground)" }}>
                          <span className="flex items-center gap-1"><IconUser size={10} /> {a.target_section_id ? `Section: ${a.section_name ?? "Previous section"}` : a.target}</span>
                          <span>· {new Date(a.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" , timeZone: "Asia/Manila" })}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>{a.body}</p>
                  </div>
                ))}
              </div>

              {alerts.length > 0 && (
                <div className="ui-card mt-4 rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                    <span className="text-sm font-semibold">Active Alerts ({alerts.length})</span>
                  </div>
                  {alerts.map((a) => (
                    <div key={a.id} className="px-4 py-3 flex gap-3 items-start" style={{ borderBottom: "1px solid var(--border)" }}>
                      <IconAlertTriangle size={14} style={{ color: a.severity === "high" ? "var(--danger)" : a.severity === "medium" ? "var(--warning)" : "var(--muted-foreground)", flexShrink: 0, marginTop: 2 }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold">{a.type} · {a.internName}</div>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{a.detail}</div>
                      </div>
                      <button onClick={() => dismissAlert(a.id)} className="text-xs px-2 py-1 rounded shrink-0" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                        Dismiss
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

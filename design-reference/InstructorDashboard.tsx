import { useState, useRef } from "react";
import Shell from "./Shell";
import Modal from "./Modal";
import { useToast } from "./Toast";
import {
  IconGrid, IconBarChart, IconFileText, IconBell,
  IconGradCap, IconCheck, IconAlertTriangle, IconTrendingUp, IconClock,
  IconMessageSquare, IconUser, IconFolder, IconUpload, IconRefresh,
} from "./Icons";

// ── Nav ───────────────────────────────────────────────────────────────────────
const navItems = [
  { id: "overview", label: "Class Dashboard", icon: <IconGrid size={15} /> },
  { id: "progress", label: "My Interns", icon: <IconBarChart size={15} /> },
  { id: "evaluations", label: "Evaluations", icon: <IconFileText size={15} /> },
  { id: "dtr-review", label: "DTR Review", icon: <IconClock size={15} /> },
  { id: "documents", label: "Intern Documents", icon: <IconFolder size={15} /> },
  { id: "announcements", label: "Announcements", icon: <IconBell size={15} /> },
];

// ── Roster ────────────────────────────────────────────────────────────────────
interface Intern {
  id: string; name: string; company: string; hours: number; required: number;
  midterm: number | null; status: "On Track" | "At Risk" | "Near Complete" | "Completed";
  clockedIn: boolean; cleared: boolean; section: string; academicYear: string;
}
const roster: Intern[] = [
  { id: "I001", name: "Maria Santos",   company: "TechCorp Manila",    hours: 312, required: 486, midterm: 4.2, status: "On Track",      clockedIn: true,  cleared: false, section: "BSIT 4A", academicYear: "2024–2025" },
  { id: "I002", name: "James Reyes",    company: "DataSoft Solutions", hours: 198, required: 486, midterm: 3.1, status: "At Risk",       clockedIn: false, cleared: false, section: "BSIT 4A", academicYear: "2024–2025" },
  { id: "I003", name: "Sofia Mendoza",  company: "TechCorp Manila",    hours: 402, required: 486, midterm: 4.7, status: "On Track",      clockedIn: true,  cleared: false, section: "BSCS 4B", academicYear: "2024–2025" },
  { id: "I004", name: "Kevin Dizon",    company: "Innovatek PH",       hours: 456, required: 486, midterm: 4.5, status: "Near Complete", clockedIn: false, cleared: false, section: "BSIT 4B", academicYear: "2024–2025" },
  { id: "I005", name: "Leah Castillo",  company: "DataSoft Solutions", hours: 88,  required: 486, midterm: null, status: "At Risk",      clockedIn: false, cleared: false, section: "BSCS 4A", academicYear: "2024–2025" },
  { id: "I006", name: "Marco Bautista", company: "CloudBase Inc.",     hours: 340, required: 486, midterm: 3.8, status: "On Track",      clockedIn: true,  cleared: false, section: "Unassigned", academicYear: "2024–2025" },
  { id: "I007", name: "Tricia Tan",     company: "BrainBytes Tech",    hours: 492, required: 486, midterm: 4.8, status: "Completed",     clockedIn: false, cleared: true,  section: "BSIT 4A", academicYear: "2023–2024" },
];

// ── Rubric ────────────────────────────────────────────────────────────────────
const rubricCriteria = [
  { id: "punctuality",    label: "Punctuality & Attendance",    weight: 0.25 },
  { id: "performance",   label: "Task Performance & Quality",  weight: 0.35 },
  { id: "conduct",       label: "Professional Conduct",        weight: 0.20 },
  { id: "communication", label: "Communication Skills",        weight: 0.20 },
];
const scaleLabels: Record<number, string> = { 1: "Poor", 2: "Fair", 3: "Satisfactory", 4: "Good", 5: "Excellent" };

// ── Interfaces ────────────────────────────────────────────────────────────────
interface EvalRecord {
  id: number; internId: string; internName: string; scores: Record<string, number>;
  feedback: string; finalScore: number; submittedAt: string;
}
interface ExceptionItem {
  id: number; internId: string; internName: string; date: string;
  claimedIn: string; claimedOut: string; reason: string;
  status: "Pending" | "Approved" | "Rejected";
}
interface Announcement {
  id: number; title: string; body: string; target: string; sentAt: string;
}
interface Alert { id: number; type: string; intern: string; detail: string; severity: "high" | "medium" | "low"; }
interface InternDocEntry {
  internId: string; docId: string; name: string;
  status: "Pending" | "Approved" | "Needs Revision";
  fileName?: string; note?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 100 ? "var(--success)" : pct > 60 ? "var(--primary)" : "var(--warning)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--secondary)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <span className="font-mono text-xs w-8 text-right" style={{ color: "var(--muted-foreground)" }}>{pct}%</span>
    </div>
  );
}

function StatusBadge({ status }: { status: Intern["status"] }) {
  const map = {
    "On Track":     { bg: "var(--success-bg)", color: "var(--success)" },
    "At Risk":      { bg: "var(--danger-bg)",  color: "var(--danger)"  },
    "Near Complete":{ bg: "var(--info-bg)",    color: "var(--info)"    },
    "Completed":    { bg: "var(--success-bg)", color: "var(--success)" },
  };
  return <span className="text-xs px-2 py-0.5 rounded-full" style={map[status]}>{status}</span>;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function InstructorDashboard({ onLogout }: { onLogout: () => void }) {
  const { toast } = useToast();
  const [tab, setTab] = useState("overview");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [attendancePage, setAttendancePage] = useState(1);
  const [showDocumentHistory, setShowDocumentHistory] = useState(false);

  // Alerts
  const [alerts, setAlerts] = useState<Alert[]>([
    { id: 1, type: "Low Attendance",     intern: "James Reyes",    detail: "40.7% hours completed — 288 hrs behind schedule",  severity: "high" },
    { id: 2, type: "Low Attendance",     intern: "Leah Castillo",  detail: "18.1% hours completed — 398 hrs behind schedule",  severity: "high" },
    { id: 3, type: "Overdue Evaluation", intern: "Leah Castillo",  detail: "Midterm evaluation not yet submitted",             severity: "medium" },
    { id: 4, type: "Unverified Hours",   intern: "Marco Bautista", detail: "12 hours pending coordinator verification",        severity: "low" },
  ]);

  // Evaluations
  const [evalRecords, setEvalRecords] = useState<EvalRecord[]>([
    { id: 1, internId: "I001", internName: "Maria Santos",  scores: { punctuality: 4, performance: 5, conduct: 4, communication: 4 }, feedback: "Excellent work ethic and quality output.", finalScore: 92, submittedAt: "May 12, 2025" },
    { id: 2, internId: "I003", internName: "Sofia Mendoza", scores: { punctuality: 5, performance: 5, conduct: 5, communication: 4 }, feedback: "Outstanding performance across all areas.", finalScore: 96, submittedAt: "May 12, 2025" },
  ]);
  const [selectedInternId, setSelectedInternId] = useState("");
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [qualFeedback, setQualFeedback] = useState("");
  const [showEvalSuccess, setShowEvalSuccess] = useState(false);
  const evalNextId = useRef(3);

  const computedScore = rubricCriteria.reduce((sum, c) => {
    const s = rubricScores[c.id] ?? 0;
    return sum + (s / 5) * 100 * c.weight;
  }, 0);
  const rubricComplete = rubricCriteria.every((c) => rubricScores[c.id] > 0);

  // DTR Exception Review
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([
    { id: 1, internId: "I002", internName: "James Reyes",   date: "May 18, Sat", claimedIn: "09:00 AM", claimedOut: "05:30 PM", reason: "Forgot to clock out — was working remotely", status: "Pending" },
    { id: 2, internId: "I005", internName: "Leah Castillo", date: "May 16, Thu", claimedIn: "08:45 AM", claimedOut: "04:00 PM", reason: "System error prevented clock-out",             status: "Pending" },
    { id: 3, internId: "I006", internName: "Marco Bautista",date: "May 14, Tue", claimedIn: "08:30 AM", claimedOut: "05:15 PM", reason: "Missed clock-in due to power outage",          status: "Approved" },
  ]);
  const [selectedEx, setSelectedEx] = useState<number[]>([]);

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([
    { id: 1, title: "Midterm Evaluation Deadline", body: "All midterm evaluations must be submitted by May 25, 2025. Interns should review their scores in the portal.", target: "All Interns", sentAt: "May 15, 2025" },
    { id: 2, title: "Clearance Reminder", body: "Please ensure all required documents (MOA, Endorsement, Consent, Medical Certificate) are uploaded by June 1.", target: "All Interns", sentAt: "May 10, 2025" },
  ]);
  const [annForm, setAnnForm] = useState({ title: "", body: "", target: "Active roster" });
  const annNextId = useRef(3);

  // Intern documents
  const [internDocs, setInternDocs] = useState<InternDocEntry[]>([
    { internId: "I001", docId: "moa",         name: "Memorandum of Agreement (MOA)",    status: "Approved",       fileName: "MOA_Santos.pdf" },
    { internId: "I001", docId: "endorsement", name: "Endorsement Letter",               status: "Approved",       fileName: "Endorsement_Santos.pdf" },
    { internId: "I001", docId: "consent",     name: "Parent / Guardian Consent Form",   status: "Needs Revision", fileName: "Consent_Santos.pdf",   note: "Please resubmit with guardian's signature and notarization date." },
    { internId: "I001", docId: "medical",     name: "Medical Certificate",              status: "Pending" },
    { internId: "I002", docId: "moa",         name: "Memorandum of Agreement (MOA)",    status: "Approved",       fileName: "MOA_Reyes.pdf" },
    { internId: "I002", docId: "endorsement", name: "Endorsement Letter",               status: "Pending" },
    { internId: "I002", docId: "consent",     name: "Parent / Guardian Consent Form",   status: "Pending" },
    { internId: "I002", docId: "medical",     name: "Medical Certificate",              status: "Pending" },
    { internId: "I003", docId: "moa",         name: "Memorandum of Agreement (MOA)",    status: "Approved",       fileName: "MOA_Mendoza.pdf" },
    { internId: "I003", docId: "endorsement", name: "Endorsement Letter",               status: "Approved",       fileName: "Endorsement_Mendoza.pdf" },
    { internId: "I003", docId: "consent",     name: "Parent / Guardian Consent Form",   status: "Approved",       fileName: "Consent_Mendoza.pdf" },
    { internId: "I003", docId: "medical",     name: "Medical Certificate",              status: "Approved",       fileName: "Medical_Mendoza.pdf" },
    { internId: "I004", docId: "moa",         name: "Memorandum of Agreement (MOA)",    status: "Approved",       fileName: "MOA_Dizon.pdf" },
    { internId: "I004", docId: "endorsement", name: "Endorsement Letter",               status: "Approved",       fileName: "Endorsement_Dizon.pdf" },
    { internId: "I004", docId: "consent",     name: "Parent / Guardian Consent Form",   status: "Needs Revision", fileName: "Consent_Dizon.pdf",     note: "Missing date. Please resubmit." },
    { internId: "I004", docId: "medical",     name: "Medical Certificate",              status: "Pending" },
    { internId: "I005", docId: "moa",         name: "Memorandum of Agreement (MOA)",    status: "Pending" },
    { internId: "I005", docId: "endorsement", name: "Endorsement Letter",               status: "Pending" },
    { internId: "I005", docId: "consent",     name: "Parent / Guardian Consent Form",   status: "Pending" },
    { internId: "I005", docId: "medical",     name: "Medical Certificate",              status: "Pending" },
    { internId: "I006", docId: "moa",         name: "Memorandum of Agreement (MOA)",    status: "Approved",       fileName: "MOA_Bautista.pdf" },
    { internId: "I006", docId: "endorsement", name: "Endorsement Letter",               status: "Approved",       fileName: "Endorsement_Bautista.pdf" },
    { internId: "I006", docId: "consent",     name: "Parent / Guardian Consent Form",   status: "Approved",       fileName: "Consent_Bautista.pdf" },
    { internId: "I006", docId: "medical",     name: "Medical Certificate",              status: "Pending" },
    { internId: "I007", docId: "moa",         name: "Memorandum of Agreement (MOA)",    status: "Approved",       fileName: "MOA_Tan.pdf" },
    { internId: "I007", docId: "endorsement", name: "Endorsement Letter",               status: "Approved",       fileName: "Endorsement_Tan.pdf" },
    { internId: "I007", docId: "consent",     name: "Parent / Guardian Consent Form",   status: "Approved",       fileName: "Consent_Tan.pdf" },
    { internId: "I007", docId: "medical",     name: "Medical Certificate",              status: "Approved",       fileName: "Medical_Tan.pdf" },
  ]);
  const [selectedDocInternId, setSelectedDocInternId] = useState("I001");
  const [revisionNoteForm, setRevisionNoteForm] = useState<Record<string, string>>({});
  const [showRevisionInput, setShowRevisionInput] = useState<string | null>(null);

  const updateDocStatus = (internId: string, docId: string, status: InternDocEntry["status"], note?: string) => {
    setInternDocs((prev) =>
      prev.map((d) => d.internId === internId && d.docId === docId ? { ...d, status, note: note ?? d.note } : d)
    );
    const intern = roster.find((r) => r.id === internId)?.name ?? "";
    if (status === "Approved") toast(`${intern} — document approved`, "success");
    else if (status === "Needs Revision") toast(`Revision requested for ${intern}`, "info");
  };

  // ── Derived stats ───────────────────────────────────────────────────────────
  const filteredRoster = roster.filter((r) =>
    (sectionFilter === "all" || r.section === sectionFilter) &&
    (yearFilter === "all" || r.academicYear === yearFilter)
  );
  const filteredRosterIds = new Set(filteredRoster.map((r) => r.id));
  const filteredExceptions = exceptions.filter((e) => filteredRosterIds.has(e.internId));
  const attendancePageSize = 2;
  const attendancePageCount = Math.max(1, Math.ceil(filteredExceptions.length / attendancePageSize));
  const pagedExceptions = filteredExceptions.slice((attendancePage - 1) * attendancePageSize, attendancePage * attendancePageSize);
  const activeNow = filteredRoster.filter((r) => r.clockedIn).length;
  const atRisk    = filteredRoster.filter((r) => r.status === "At Risk").length;
  const pendingEx = filteredExceptions.filter((e) => e.status === "Pending").length;

  const statCards = [
    { label: "Total Interns", value: `${filteredRoster.length}`,  icon: <IconGradCap size={18} />,      iconBg: "#eff6ff", iconColor: "#2563eb" },
    { label: "Active Now",    value: `${activeNow}`,       icon: <IconClock size={18} />,         iconBg: "#f0fdf4", iconColor: "#16a34a" },
    { label: "At Risk",       value: `${atRisk}`,          icon: <IconAlertTriangle size={18} />, iconBg: "#fff1f2", iconColor: "#dc2626", warn: true },
  ];

  // ── Actions ─────────────────────────────────────────────────────────────────
  const approveEx = (id: number) => {
    setExceptions((prev) => prev.map((e) => e.id === id ? { ...e, status: "Approved" } : e));
    setSelectedEx((prev) => prev.filter((x) => x !== id));
    toast("Time log exception approved", "success");
  };
  const rejectEx = (id: number) => {
    setExceptions((prev) => prev.map((e) => e.id === id ? { ...e, status: "Rejected" } : e));
    setSelectedEx((prev) => prev.filter((x) => x !== id));
    toast("Time log exception rejected");
  };
  const bulkApprove = () => {
    setExceptions((prev) => prev.map((e) => selectedEx.includes(e.id) && e.status === "Pending" ? { ...e, status: "Approved" } : e));
    toast(`${selectedEx.length} exception(s) approved`, "success");
    setSelectedEx([]);
  };
  const bulkReject = () => {
    setExceptions((prev) => prev.map((e) => selectedEx.includes(e.id) && e.status === "Pending" ? { ...e, status: "Rejected" } : e));
    toast(`${selectedEx.length} exception(s) rejected`);
    setSelectedEx([]);
  };
  const toggleSelectEx = (id: number) =>
    setSelectedEx((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const selectAllPending = () =>
    setSelectedEx(filteredExceptions.filter((e) => e.status === "Pending").map((e) => e.id));

  const submitEval = () => {
    if (!selectedInternId || !rubricComplete) return;
    const intern = roster.find((r) => r.id === selectedInternId)!;
    setEvalRecords((prev) => [
      ...prev,
      { id: evalNextId.current++, internId: selectedInternId, internName: intern.name,
        scores: { ...rubricScores }, feedback: qualFeedback,
        finalScore: Math.round(computedScore),
        submittedAt: new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) },
    ]);
    setSelectedInternId(""); setRubricScores({}); setQualFeedback("");
    setShowEvalSuccess(true);
    toast(`Evaluation for ${intern.name} submitted`, "success");
    setTimeout(() => setShowEvalSuccess(false), 3000);
  };

  const sendAnnouncement = () => {
    if (!annForm.title.trim() || !annForm.body.trim()) { toast("Please fill in title and message", "error"); return; }
    setAnnouncements((prev) => [
      { id: annNextId.current++, ...annForm, sentAt: new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) },
      ...prev,
    ]);
    setAnnForm({ title: "", body: "", target: "Active roster" });
    toast("Announcement sent to " + annForm.target, "success");
  };

  // ── Input style ─────────────────────────────────────────────────────────────
  const inputStyle = { borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" };
  const inputCls   = "w-full text-sm py-2 px-3 rounded-lg border outline-none";

  return (
    <Shell userName="Dr. Ramon Cruz" userEmail="instructor@bsu.edu.ph" userRole="OJT Coordinator"
      navItems={navItems} activeTab={tab} onTabChange={setTab} onLogout={onLogout}>
      <div className="dashboard-content p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {tab === "overview" ? "Hi, Dr. Cruz!" : navItems.find((n) => n.id === tab)?.label}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              Assigned roster · 2nd Semester · {filteredRoster.length} Interns shown
              {alerts.length > 0 && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                  {alerts.length} alerts
                </span>
              )}
              {pendingEx > 0 && (
                <span className="ml-1.5 text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
                  {pendingEx} DTR pending
                </span>
              )}
            </p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
            {new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}
          </span>
        </div>

        {["overview", "progress", "evaluations", "dtr-review", "documents"].includes(tab) && (
          <div className="rounded-xl p-3 flex flex-col sm:flex-row sm:items-end gap-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <label className="text-xs font-medium flex-1">
              Section
              <select value={sectionFilter} onChange={(e) => { setSectionFilter(e.target.value); setAttendancePage(1); setSelectedEx([]); setSelectedInternId(""); }}
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border outline-none" style={inputStyle}>
                <option value="all">All sections</option>
                <option>BSIT 4A</option>
                <option>BSIT 4B</option>
                <option>BSCS 4A</option>
                <option>BSCS 4B</option>
                <option>Unassigned</option>
              </select>
            </label>
            <label className="text-xs font-medium flex-1">
              Academic-year assignment
              <select value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setAttendancePage(1); setSelectedEx([]); setSelectedInternId(""); }}
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border outline-none" style={inputStyle}>
                <option value="all">All assigned academic years</option>
                <option>2024–2025</option>
                <option>2023–2024</option>
                <option>Unassigned</option>
              </select>
            </label>
            <button onClick={() => toast("Roster refreshed", "success")}
              title="Refresh roster" aria-label="Refresh roster"
              className="w-9 h-9 flex items-center justify-center rounded-lg border shrink-0" style={{ borderColor: "var(--border)", color: "var(--primary)" }}>
              <IconRefresh size={15} />
            </button>
          </div>
        )}

        {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {statCards.map((s) => (
                <div key={s.label} className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: s.iconBg, color: s.iconColor }}>{s.icon}</div>
                  <div className="text-2xl font-bold mb-0.5" style={{ color: s.warn ? "var(--danger)" : "var(--foreground)" }}>{s.value}</div>
                  <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-sm font-semibold">Class Roster</span>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {activeNow} active now · {filteredRoster.filter(r => r.status === "Completed").length} completed
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--muted)" }}>
                      {["Intern", "Company", "Hours Progress", "Midterm", "Status"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoster.map((s) => (
                      <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-sm">{s.name}</div>
                            {s.clockedIn && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} title="Active now" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{s.company}</td>
                        <td className="px-4 py-3 w-44">
                          <ProgressBar value={s.hours} max={s.required} />
                          <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{s.hours}/{s.required} hrs</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">
                          {s.midterm !== null
                            ? <span style={{ color: s.midterm >= 4 ? "var(--success)" : s.midterm >= 3 ? "var(--primary)" : "var(--warning)" }}>{s.midterm.toFixed(1)}</span>
                            : <span style={{ color: "var(--muted-foreground)" }}>Not available</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Alerts preview */}
            {alerts.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-sm font-semibold">Active Alerts</span>
                  <button className="text-xs" style={{ color: "var(--primary)" }} onClick={() => setTab("announcements")}>View all</button>
                </div>
                {alerts.slice(0, 3).map((a) => (
                  <div key={a.id} className="px-4 py-3 flex items-center gap-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <IconAlertTriangle size={14} style={{ color: a.severity === "high" ? "var(--danger)" : "var(--warning)", flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold">{a.intern} · </span>
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{a.detail}</span>
                    </div>
                    <button onClick={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))}
                      className="text-xs px-2 py-1 rounded shrink-0" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                      Dismiss
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── PROGRESS ──────────────────────────────────────────────────── */}
        {tab === "progress" && (
          <div className="space-y-3">
            {filteredRoster.map((s) => {
              const pct = Math.round((s.hours / s.required) * 100);
              const avgVelocity = 8.0;
              const daysLeft = Math.ceil(Math.max(0, s.required - s.hours) / avgVelocity);
              return (
                <div key={s.id} className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-semibold">{s.name}</span>
                      <span className="text-xs ml-2" style={{ color: "var(--muted-foreground)" }}>{s.company}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={s.status} />
                      <span className="font-mono text-sm">{s.hours} <span style={{ color: "var(--muted-foreground)" }}>/ {s.required} hrs</span></span>
                    </div>
                  </div>
                  <ProgressBar value={s.hours} max={s.required} />
                  <div className="flex gap-4 mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    <span>Remaining: {Math.max(0, s.required - s.hours)} hrs</span>
                    <span>Velocity: ~{avgVelocity} hrs/day</span>
                    <span style={{ color: s.status === "At Risk" ? "var(--danger)" : "var(--muted-foreground)" }}>
                      Est. finish: ~{daysLeft} working days
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── EVALUATIONS ───────────────────────────────────────────────── */}
        {tab === "evaluations" && (
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Rubric scoring form */}
            <div className="space-y-4">
              <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold mb-3">New Evaluation</h2>

                {/* Intern selector */}
                <div className="mb-4">
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--foreground)" }}>Select Intern</label>
                  <select value={selectedInternId} onChange={(e) => { setSelectedInternId(e.target.value); setRubricScores({}); setQualFeedback(""); }}
                    className={inputCls} style={inputStyle}>
                    <option value="">— Choose intern —</option>
                    {filteredRoster.filter((r) => r.status !== "Completed").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>

                {/* Rubric criteria */}
                <div className="space-y-4">
                  {rubricCriteria.map((c) => (
                    <div key={c.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium" style={{ color: "var(--foreground)" }}>{c.label}</span>
                        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          Weight: {c.weight * 100}% &nbsp;
                          {rubricScores[c.id] ? <span style={{ color: "var(--primary)", fontWeight: 600 }}>{scaleLabels[rubricScores[c.id]]}</span> : ""}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => selectedInternId && setRubricScores((s) => ({ ...s, [c.id]: n }))}
                            disabled={!selectedInternId}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-30"
                            style={{
                              background: rubricScores[c.id] === n ? "var(--primary)" : "var(--secondary)",
                              color: rubricScores[c.id] === n ? "#fff" : "var(--muted-foreground)",
                            }}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Computed score preview */}
                {rubricComplete && (
                  <div className="mt-4 rounded-lg p-3 flex items-center justify-between" style={{ background: "var(--primary-light)" }}>
                    <span className="text-xs font-semibold" style={{ color: "var(--primary)" }}>Computed Score</span>
                    <span className="text-lg font-bold" style={{ color: "var(--primary)" }}>{Math.round(computedScore)}<span className="text-xs font-normal">/100</span></span>
                  </div>
                )}

                {/* Qualitative feedback */}
                <div className="mt-4">
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--foreground)" }}>Feedback & Guidance</label>
                  <textarea rows={3} value={qualFeedback} onChange={(e) => setQualFeedback(e.target.value)}
                    placeholder="Specific feedback, constructive guidance, areas for improvement..."
                    className="w-full text-sm py-2 px-3 rounded-lg border outline-none resize-none"
                    style={inputStyle} disabled={!selectedInternId} />
                </div>

                <div className="flex justify-end mt-3 gap-2">
                  {showEvalSuccess && (
                    <span className="text-xs flex items-center gap-1" style={{ color: "var(--success)" }}>
                      <IconCheck size={12} /> Saved
                    </span>
                  )}
                  <button onClick={() => { setSelectedInternId(""); setRubricScores({}); setQualFeedback(""); }}
                    className="text-sm px-3 py-2 rounded-lg" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>
                    Clear
                  </button>
                  <button onClick={submitEval} disabled={!selectedInternId || !rubricComplete}
                    className="text-sm px-4 py-2 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "var(--primary)", color: "#fff" }}>
                    Submit Evaluation
                  </button>
                </div>
              </div>
            </div>

            {/* Evaluation history */}
            <div>
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-sm font-semibold">Evaluation Records ({evalRecords.length})</span>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: "560px" }}>
                  {evalRecords.length === 0 ? (
                    <div className="p-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No evaluations submitted yet.</div>
                  ) : evalRecords.map((ev) => (
                    <div key={ev.id} className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="text-sm font-semibold">{ev.internName}</div>
                          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Submitted: {ev.submittedAt}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold" style={{ color: "var(--primary)" }}>{ev.finalScore}<span className="text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>/100</span></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
                        {rubricCriteria.map((c) => (
                          <div key={c.id} className="flex items-center justify-between text-xs">
                            <span style={{ color: "var(--muted-foreground)" }}>{c.label.split(" ")[0]}</span>
                            <span className="font-semibold" style={{ color: "var(--foreground)" }}>{ev.scores[c.id] ?? "—"}/5</span>
                          </div>
                        ))}
                      </div>
                      {ev.feedback && <p className="text-xs italic" style={{ color: "var(--muted-foreground)" }}>"{ev.feedback}"</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── DTR REVIEW ────────────────────────────────────────────────── */}
        {tab === "dtr-review" && (
          <>
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div>
                  <span className="text-sm font-semibold">DTR Exception Queue</span>
                  <span className="text-xs ml-2 px-2 py-0.5 rounded-full" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
                    {pendingEx} Pending
                  </span>
                </div>
                {selectedEx.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{selectedEx.length} selected</span>
                    <button onClick={bulkApprove} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                      style={{ background: "var(--success-bg)", color: "var(--success)" }}>Approve All</button>
                    <button onClick={bulkReject} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                      style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>Reject All</button>
                  </div>
                )}
                {selectedEx.length === 0 && pendingEx > 0 && (
                  <button onClick={selectAllPending} className="text-xs" style={{ color: "var(--primary)" }}>Select all pending</button>
                )}
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr style={{ background: "var(--muted)" }}>
                    <th className="px-4 py-2.5 w-8"><span className="sr-only">Select</span></th>
                    {["Intern", "Date", "Claimed Time In", "Claimed Time Out", "Reason", "Status", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedExceptions.map((ex) => (
                    <tr key={ex.id} style={{ borderTop: "1px solid var(--border)", background: selectedEx.includes(ex.id) ? "var(--primary-light)" : undefined }}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedEx.includes(ex.id)} disabled={ex.status !== "Pending"}
                          onChange={() => toggleSelectEx(ex.id)}
                          className="w-3.5 h-3.5 rounded" />
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">{ex.internName}</td>
                      <td className="px-4 py-3 text-xs">{ex.date}</td>
                      <td className="px-4 py-3 text-xs font-mono">{ex.claimedIn}</td>
                      <td className="px-4 py-3 text-xs font-mono">{ex.claimedOut}</td>
                      <td className="px-4 py-3 text-xs max-w-xs" style={{ color: "var(--muted-foreground)" }}>{ex.reason}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={ex.status === "Approved" ? { background: "var(--success-bg)", color: "var(--success)" }
                            : ex.status === "Rejected" ? { background: "var(--danger-bg)", color: "var(--danger)" }
                            : { background: "var(--warning-bg)", color: "var(--warning)" }}>
                          {ex.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {ex.status === "Pending" && (
                          <div className="flex gap-1.5">
                            <button onClick={() => approveEx(ex.id)} className="text-xs px-2 py-1 rounded-lg font-medium"
                              style={{ background: "var(--success-bg)", color: "var(--success)" }}>Approve</button>
                            <button onClick={() => rejectEx(ex.id)} className="text-xs px-2 py-1 rounded-lg font-medium"
                              style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredExceptions.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>No exception requests submitted.</td></tr>
                  )}
                </tbody>
              </table>
              </div>
              <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {filteredExceptions.length === 0 ? "No attendance requests" : `${(attendancePage - 1) * attendancePageSize + 1}–${Math.min(attendancePage * attendancePageSize, filteredExceptions.length)} of ${filteredExceptions.length} requests`}
                </span>
                <div className="flex items-center gap-2">
                  <button disabled={attendancePage === 1} onClick={() => setAttendancePage((p) => p - 1)}
                    className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-40" style={{ borderColor: "var(--border)" }}>Previous</button>
                  <span className="text-xs font-medium">Page {attendancePage} of {attendancePageCount}</span>
                  <button disabled={attendancePage === attendancePageCount} onClick={() => setAttendancePage((p) => p + 1)}
                    className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-40" style={{ borderColor: "var(--border)" }}>Next</button>
                </div>
              </div>
            </div>

            {/* Audit trail */}
            <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold mb-3">Recent Actions Log</h3>
              <div className="space-y-2">
                {exceptions.filter((e) => e.status !== "Pending").map((ex) => (
                  <div key={ex.id} className="flex items-center gap-3 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ex.status === "Approved" ? "var(--success)" : "var(--danger)" }} />
                    <span style={{ color: "var(--muted-foreground)" }}>
                      <strong style={{ color: "var(--foreground)" }}>{ex.internName}</strong> — {ex.date} exception {ex.status.toLowerCase()} by Dr. Cruz
                    </span>
                  </div>
                ))}
                {exceptions.every((e) => e.status === "Pending") && (
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>No actions taken yet.</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── DOCUMENTS ─────────────────────────────────────────────────── */}
        {tab === "documents" && (() => {
          const selectedIntern = filteredRoster.find((r) => r.id === selectedDocInternId) ?? filteredRoster[0];
          if (!selectedIntern) {
            return (
              <div className="rounded-xl p-8 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div className="text-sm font-semibold">No interns match these roster filters</div>
                <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Choose a different section or academic-year assignment to review documents.</p>
              </div>
            );
          }
          const docs = internDocs.filter((d) => d.internId === selectedIntern.id);
          const approvedCount = docs.filter((d) => d.status === "Approved").length;
          const allApproved = approvedCount === docs.length;

          return (
            <>
              {/* Intern selector row */}
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-xs font-medium self-start">
                  <input type="checkbox" checked={showDocumentHistory} onChange={(e) => setShowDocumentHistory(e.target.checked)}
                    className="w-4 h-4 rounded" />
                  Show document history from all academic years
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                {filteredRoster.map((r) => {
                  const rDocs = internDocs.filter((d) => d.internId === r.id);
                  const rApproved = rDocs.filter((d) => d.status === "Approved").length;
                  const rPending  = rDocs.filter((d) => d.status === "Pending").length;
                  const rRevision = rDocs.filter((d) => d.status === "Needs Revision").length;
                  return (
                    <button key={r.id} onClick={() => { setSelectedDocInternId(r.id); setShowRevisionInput(null); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
                      style={{
                        background: selectedIntern.id === r.id ? "var(--primary)" : "var(--card)",
                        color: selectedIntern.id === r.id ? "#fff" : "var(--foreground)",
                        border: `1px solid ${selectedIntern.id === r.id ? "var(--primary)" : "var(--border)"}`,
                      }}>
                      <span className="font-medium">{r.name.split(" ")[0]}</span>
                      <span className="text-xs opacity-70">{rApproved}/{rDocs.length}</span>
                      {rRevision > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedIntern.id === r.id ? "#fff" : "var(--danger)" }} />}
                      {rPending > 0 && rRevision === 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedIntern.id === r.id ? "#fff" : "var(--warning)" }} />}
                    </button>
                  );
                })}
                </div>
              </div>

              {/* Selected intern header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold">{selectedIntern.name}</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                    {selectedIntern.company} · {approvedCount}/{docs.length} documents approved
                  </p>
                </div>
                <div className="h-1.5 w-32 rounded-full overflow-hidden" style={{ background: "var(--secondary)" }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${(approvedCount / docs.length) * 100}%`, background: allApproved ? "var(--success)" : "var(--primary)" }} />
                </div>
              </div>

              {/* Document cards */}
              <div className="space-y-3">
                {docs.map((doc) => {
                  const revKey = `${doc.internId}-${doc.docId}`;
                  const isShowingRevInput = showRevisionInput === revKey;
                  return (
                    <div key={revKey} className="rounded-xl p-4"
                      style={{ background: "var(--card)", border: `1px solid ${doc.status === "Needs Revision" ? "#fca5a5" : doc.status === "Approved" ? "#86efac" : "var(--border)"}` }}>
                      <div className="flex items-start gap-3">
                        {/* Status icon */}
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: doc.status === "Approved" ? "var(--success-bg)" : doc.status === "Needs Revision" ? "var(--danger-bg)" : "var(--warning-bg)" }}>
                          {doc.status === "Approved"
                            ? <IconCheck size={16} style={{ color: "var(--success)" }} />
                            : doc.status === "Needs Revision"
                            ? <IconAlertTriangle size={16} style={{ color: "var(--danger)" }} />
                            : <IconFileText size={16} style={{ color: "var(--warning)" }} />}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{doc.name}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={doc.status === "Approved" ? { background: "var(--success-bg)", color: "var(--success)" }
                                : doc.status === "Needs Revision" ? { background: "var(--danger-bg)", color: "var(--danger)" }
                                : { background: "var(--warning-bg)", color: "var(--warning)" }}>
                              {doc.status}
                            </span>
                          </div>
                          {doc.fileName
                            ? <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}><IconFileText size={11} /> {doc.fileName}</div>
                            : <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>No file uploaded yet</div>}
                          {doc.note && (
                            <div className="text-xs mt-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                              <strong>Revision note:</strong> {doc.note}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          {doc.fileName && (
                            <>
                              <button onClick={() => toast(`Opening ${doc.fileName}`, "info")}
                                className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>
                                View file
                              </button>
                              <button onClick={() => toast(`${doc.fileName} downloaded`, "success")}
                                className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>
                                Download file
                              </button>
                            </>
                          )}
                          {doc.status !== "Approved" && doc.fileName && (
                            <button onClick={() => updateDocStatus(doc.internId, doc.docId, "Approved")}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                              style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                              Approve
                            </button>
                          )}
                          {doc.status === "Approved" && (
                            <button onClick={() => updateDocStatus(doc.internId, doc.docId, "Pending")}
                              className="text-xs px-3 py-1.5 rounded-lg"
                              style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                              Revoke
                            </button>
                          )}
                          {doc.status !== "Needs Revision" && (
                            <button onClick={() => setShowRevisionInput(isShowingRevInput ? null : revKey)}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                              style={{ background: isShowingRevInput ? "var(--danger)" : "var(--danger-bg)", color: isShowingRevInput ? "#fff" : "var(--danger)" }}>
                              Request Revision
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Revision note input */}
                      {isShowingRevInput && (
                        <div className="mt-3 flex gap-2">
                          <input type="text"
                            value={revisionNoteForm[revKey] ?? ""}
                            onChange={(e) => setRevisionNoteForm((f) => ({ ...f, [revKey]: e.target.value }))}
                            placeholder="Describe what needs to be corrected..."
                            className="flex-1 text-sm py-1.5 px-3 rounded-lg border outline-none"
                            style={{ borderColor: "var(--danger)", background: "var(--card)", color: "var(--foreground)" }} />
                          <button
                            onClick={() => {
                              updateDocStatus(doc.internId, doc.docId, "Needs Revision", revisionNoteForm[revKey] ?? "");
                              setRevisionNoteForm((f) => ({ ...f, [revKey]: "" }));
                              setShowRevisionInput(null);
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0"
                            style={{ background: "var(--danger)", color: "#fff" }}>
                            Send
                          </button>
                          <button onClick={() => setShowRevisionInput(null)}
                            className="text-xs px-2 py-1.5 rounded-lg"
                            style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* ── ANNOUNCEMENTS ─────────────────────────────────────────────── */}
        {tab === "announcements" && (
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Compose */}
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h2 className="text-sm font-semibold">Send Announcement</h2>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>Subject</label>
                <input type="text" value={annForm.title} onChange={(e) => setAnnForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g., Evaluation Deadline Reminder"
                  className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>Recipients</label>
                <select value={annForm.target} onChange={(e) => setAnnForm((f) => ({ ...f, target: e.target.value }))}
                  className={inputCls} style={inputStyle}>
                  <option>Active roster</option>
                  {[...new Set(roster.map((r) => r.section).filter((s) => s !== "Unassigned"))].map((section) => (
                    <option key={section} value={`Section: ${section}`}>Section: {section}</option>
                  ))}
                  {roster.filter((r) => r.status !== "Completed").map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>Message</label>
                <textarea rows={5} value={annForm.body} onChange={(e) => setAnnForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Type your announcement here..."
                  className="w-full text-sm py-2 px-3 rounded-lg border outline-none resize-none"
                  style={inputStyle} />
              </div>
              <div className="flex justify-end">
                <button onClick={sendAnnouncement} className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold"
                  style={{ background: "var(--primary)", color: "#fff" }}>
                  <IconMessageSquare size={14} /> Send Announcement
                </button>
              </div>
            </div>

            {/* History */}
            <div>
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-sm font-semibold">Sent Announcements ({announcements.length})</span>
                  <button onClick={() => toast("Announcements refreshed", "success")}
                    title="Refresh announcements" aria-label="Refresh announcements"
                    className="w-8 h-8 flex items-center justify-center rounded-lg border shrink-0"
                    style={{ borderColor: "var(--border)", color: "var(--primary)" }}>
                    <IconRefresh size={14} />
                  </button>
                </div>
                {announcements.length === 0 ? (
                  <div className="p-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No announcements sent yet.</div>
                ) : announcements.map((a) => (
                  <details key={a.id} className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
                    <summary className="cursor-pointer list-none flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{a.title}</div>
                        <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "var(--muted-foreground)" }}>
                          <span className="flex items-center gap-1"><IconUser size={10} /> {a.target}</span>
                          <span>· {a.sentAt}</span>
                        </div>
                      </div>
                      <span className="text-xs" style={{ color: "var(--primary)" }}>View message</span>
                    </summary>
                    <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>{a.body}</p>
                  </details>
                ))}
              </div>

              {/* Alerts */}
              {alerts.length > 0 && (
                <div className="mt-4 rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                    <span className="text-sm font-semibold">Active Alerts ({alerts.length})</span>
                  </div>
                  {alerts.map((a) => (
                    <div key={a.id} className="px-4 py-3 flex gap-3 items-start" style={{ borderBottom: "1px solid var(--border)" }}>
                      <IconAlertTriangle size={14} style={{ color: a.severity === "high" ? "var(--danger)" : a.severity === "medium" ? "var(--warning)" : "var(--muted-foreground)", flexShrink: 0, marginTop: 2 }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold">{a.type} · {a.intern}</div>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{a.detail}</div>
                      </div>
                      <button onClick={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))}
                        className="text-xs px-2 py-1 rounded shrink-0" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
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

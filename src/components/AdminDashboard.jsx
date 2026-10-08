import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { auditArtifact, downloadArtifact, templateArtifact } from "../lib/exports";
import { recordRpc } from "../lib/authority";
import { checklistState } from "../lib/business";
import { displayHours, internMetrics } from "../lib/metrics";
import { completeRows, saveAssignment } from "../lib/workflows";
import Shell from "./Shell";
import Modal from "./Modal";
import RefreshStatus from "./RefreshStatus";
import { academicRows, onboardingItems } from "../lib/assignments";
import { captureRequest, withTimeout } from "../lib/requests";
import { useToast } from "./Toast";
import {
  IconGrid, IconUsers, IconFolder, IconUpload, IconClipboard, IconShield,
  IconGradCap, IconBuilding, IconCheck,
} from "./Icons";

const navItems = [
  { id: "overview", label: "Overview", icon: <IconGrid size={15} /> },
  { id: "accounts", label: "Account Management", icon: <IconUsers size={15} /> },
  { id: "interns", label: "Interns", icon: <IconGradCap size={15} /> },
  { id: "masterdata", label: "Master Data", icon: <IconFolder size={15} /> },
  { id: "import", label: "Bulk Import", icon: <IconUpload size={15} /> },
  { id: "auditlogs", label: "Audit Logs", icon: <IconClipboard size={15} /> },
  { id: "backup", label: "Backup & Security", icon: <IconShield size={15} /> },
];

const roleLabel = { admin: "Admin", instructor: "Instructor", intern: "Intern" };
const roleColors = { Intern: "#d97706", Instructor: "#7c3aed", Admin: "#1a2f5e" };
const roles = ["Intern", "Instructor", "Admin"];

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full text-sm px-3 py-2.5 rounded-lg border outline-none transition-all";
const inputStyle = { borderColor: "var(--border)", background: "var(--muted)", color: "var(--foreground)" };

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }) : "—";

export default function AdminDashboard({ profile, onLogout }) {
  const { toast } = useToast();
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [sections, setSections] = useState([]);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [resourceErrors, setResourceErrors] = useState({});
  const loadSequence = useRef(0);
  const [auditPage, setAuditPage] = useState(0);
  const [auditCount, setAuditCount] = useState(null);
  const AUDIT_PAGE_SIZE = 50;

  // User modal
  const [userModal, setUserModal] = useState({ open: false, editing: null });
  const [userForm, setUserForm] = useState({ name: "", role: "Intern", status: "Active", companyId: "" });

  // Interns tab — intern rows from the `interns` table, keyed edit buffer, and
  // per-intern document-checklist counts (for the "attach standard docs" button)
  const [internRows, setInternRows] = useState([]);
  const [internForms, setInternForms] = useState({});
  const [docCounts, setDocCounts] = useState({});
  const [metricAttendance, setMetricAttendance] = useState(null);
  const [metricDocuments, setMetricDocuments] = useState(null);
  const [metricsError, setMetricsError] = useState(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [savingInternId, setSavingInternId] = useState(null);
  const [attachingDocsId, setAttachingDocsId] = useState(null);

  // Master data modals — { table, editId, value }
  const [masterModal, setMasterModal] = useState(null);
  const [masterBusy, setMasterBusy] = useState(false);

  const [exportBusy, setExportBusy] = useState(false);
  const requestExport = async (createArtifact) => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const artifact = await createArtifact();
      downloadArtifact(artifact);
      toast(`Download requested: ${artifact.filename}`, "info");
    } catch (error) { toast(error.message || "Export failed; retry", "error"); }
    finally { setExportBusy(false); }
  };

  const loadAuditPage = async (page = auditPage) => {
    const from = page * AUDIT_PAGE_SIZE;
    const { data, error, count } = await withTimeout(supabase.from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + AUDIT_PAGE_SIZE - 1));
    if (error) throw error;
    setLogs(data ?? []);
    setAuditCount(count ?? null);
  };

  const loadAll = async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    const capture = captureRequest;
    try {
      const [profilesResult, auditResult, companyResult, sectionResult, yearResult, internsResult, docsResult, attendanceResult] = await Promise.all([
        capture(completeRows(supabase, "profiles").then(data => ({ data }))),
        capture(supabase.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(0, AUDIT_PAGE_SIZE - 1)),
        capture(supabase.from("companies").select("*").order("name")),
        capture(supabase.from("course_sections").select("*").order("name")),
        capture(supabase.from("academic_years").select("*").order("label", { ascending: false })),
        capture(completeRows(supabase, "interns").then(data => ({ data }))),
        capture(completeRows(supabase, "documents").then(data => ({ data }))),
        capture(completeRows(supabase, "attendance_logs").then(data => ({ data }))),
      ]);
      if (sequence !== loadSequence.current) return;
      const errors = {};
      const assign = (key, result, preserve) => {
        if (result?.error) { errors[key] = result.error.message || String(result.error); return; }
        if (result && Object.hasOwn(result, "data")) preserve(result.data);
      };
      assign("profiles", profilesResult, data => setUsers(data ?? []));
      assign("companies", companyResult, data => setCompanies(data ?? []));
      assign("sections", sectionResult, data => setSections(data ?? []));
      assign("years", yearResult, data => setYears(data ?? []));
      assign("interns", internsResult, data => {
        setInternRows(data ?? []);
        setInternForms(Object.fromEntries((data ?? []).map(r => [r.id, { instructor_id: r.instructor_id ?? "", company_id: r.company_id ?? "", section_id: r.section_id ?? "", academic_year_id: r.academic_year_id ?? "", required_hours: r.required_hours ?? "" }])));
      });
      assign("documents", docsResult, data => setMetricDocuments(data));
      assign("attendance", attendanceResult, data => setMetricAttendance(data));
      if (auditResult?.error) errors.audit = auditResult.error.message || String(auditResult.error);
      else { setLogs(auditResult.data ?? []); setAuditCount(auditResult.count ?? null); }
      setResourceErrors(errors);
      if (!Object.values(errors).some(Boolean)) setLastUpdated(new Date());
      setMetricsError(errors.profiles || errors.interns || errors.documents || errors.attendance || null);
      if (!errors.documents && !errors.interns) {
        const counts = {};
        (internsResult.data ?? []).forEach(r => { counts[r.id] = checklistState(academicRows((docsResult.data ?? []).filter(d => d.intern_id === r.id), r.academic_year_id)); });
        setDocCounts(counts);
      }
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
  }, []);

  useEffect(() => {
    if (auditPage === 0) return;
    loadAuditPage(auditPage).catch(error => setResourceErrors(prev => ({ ...prev, audit: error.message || "Audit history unavailable" })));
    // loadAuditPage is a stable local read helper; auditPage is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditPage]);

  const filtered = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.role?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  // ── Interns tab: merge `interns` rows with their profile (name/email) ──
  // Only people whose CURRENT role is "intern" belong here — a leftover
  // `interns` row from before a role change should not make someone with
  // the Instructor or Admin role show up in this list.
  const instructorOptions = users.filter((u) => u.role === "instructor" && u.status === "Active");
  const internsForTab = internRows
    .map((r) => {
      const p = users.find((u) => u.id === r.id);
      return p && p.role === "intern" ? { ...r, full_name: p.full_name, email: p.email, status: p.status } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const updateInternForm = (internId, field, value) =>
    setInternForms((prev) => ({ ...prev, [internId]: { ...prev[internId], [field]: value } }));

  const applyIntern = (row) => {
    if (!row) return;
    setInternRows(prev => prev.some(r => r.id === row.id) ? prev.map(r => r.id === row.id ? row : r) : [...prev, row]);
    setInternForms(prev => ({ ...prev, [row.id]: { instructor_id: row.instructor_id ?? "", company_id: row.company_id ?? "", section_id: row.section_id ?? "", academic_year_id: row.academic_year_id ?? "", required_hours: row.required_hours ?? "" } }));
    setDocCounts(prev => ({ ...prev, [row.id]: checklistState(academicRows(metricDocuments?.filter(d => d.intern_id === row.id), row.academic_year_id)) }));
  };
  const saveInternAssignment = async (internId) => {
    if (savingInternId || !internForms[internId]) return;
    setSavingInternId(internId);
    try {
      const result = await saveAssignment(supabase, internId, internForms[internId]);
      if (!result.ok) { toast(result.error, "error"); return result; }
      applyIntern(result.data);
      await refreshAudit(); toast("Assignment saved", "success");
      return result;
    } finally { setSavingInternId(null); }
  };
  const attachStandardDocs = async (internId) => {
    if (attachingDocsId) return;
    setAttachingDocsId(internId);
    try {
      const result = await recordRpc(supabase, "attach_standard_docs", { p_id: internId });
      if (!result.ok) return toast(result.error, "error");
      setDocCounts(prev => ({ ...prev, [internId]: checklistState(academicRows(result.data.documents, internRows.find(r => r.id === internId)?.academic_year_id)) }));
      setMetricDocuments(prev => prev ? [...prev.filter(d => d.intern_id !== internId), ...result.data.documents] : null);
      await refreshAudit(); toast("Missing standard requirements attached", "success");
    } finally { setAttachingDocsId(null); }
  };

  const refreshAudit = async () => {
    try {
      await loadAuditPage(auditPage);
      setResourceErrors(prev => ({ ...prev, audit: undefined }));
    } catch (error) {
      setResourceErrors(prev => ({ ...prev, audit: error.message || "Audit history unavailable" }));
      toast(`Change committed, but audit history could not refresh: ${error.message}`, "error");
    }
  };

  // ── User modal handlers ──
  const openEdit = (u) => {
    const existingInternRow = internRows.find((r) => r.id === u.id);
    setUserForm({
      name: u.full_name,
      role: roleLabel[u.role] ?? u.role,
      status: u.status,
      companyId: existingInternRow?.company_id ?? "",
    });
    setUserModal({ open: true, editing: u });
  };
  const applyAccount = (data) => {
    setUsers(prev => prev.map(u => u.id === data.id ? data.profile : u));
    applyIntern(data.intern);
  };
  const saveUser = async () => {
    if (!userModal.editing || accountBusy) return;
    setAccountBusy(true);
    try {
      const patch = { full_name: userForm.name, role: userForm.role.toLowerCase(), status: userForm.status };
      if (patch.role === "intern") patch.company_id = userForm.companyId || null;
      const result = await recordRpc(supabase, "admin_update_account", { p_id: userModal.editing.id, p_patch: patch });
      if (!result.ok) { toast(result.error, "error"); return result; }
      applyAccount(result.data);
      await refreshAudit(); toast("Account updated", "success");
      setUserModal({ open: false, editing: null }); return result;
    } finally { setAccountBusy(false); }
  };
  const deactivate = async (u) => {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      const next = u.status === "Active" ? "Inactive" : "Active";
      const result = await recordRpc(supabase, "admin_update_account", { p_id: u.id, p_patch: { status: next } });
      if (!result.ok) return toast(result.error, "error");
      applyAccount(result.data); await refreshAudit(); toast("Account status updated", "success");
    } finally { setAccountBusy(false); }
  };

  // ── Master data handlers ──
  const masterSections = [
    { key: "academic_years", title: "Academic Years", table: "academic_years", rows: years, field: "label" },
    { key: "course_sections", title: "Course Sections", table: "course_sections", rows: sections, field: "name" },
    { key: "companies", title: "Company Directory", table: "companies", rows: companies, field: "name" },
  ];
  const setRowsFor = (table, updater) => {
    if (table === "academic_years") setYears(updater);
    if (table === "course_sections") setSections(updater);
    if (table === "companies") setCompanies(updater);
  };

  const openMasterAdd = (table) => setMasterModal({ table, editId: null, value: "" });
  const openMasterEdit = (table, row, field) => setMasterModal({ table, editId: row.id, value: row[field] });
  const saveMaster = async () => {
    if (!masterModal || masterModal.mode === "delete") return;
    if (!masterModal.value.trim()) { toast("Value cannot be empty", "error"); return; }
    const { table, editId, value } = masterModal;
    const field = table === "academic_years" ? "label" : "name";
    if (masterBusy) return;
    setMasterBusy(true);
    try {
      if (editId) {
        const { data, error } = await captureRequest(supabase.from(table).update({ [field]: value.trim() }).eq("id", editId).select().maybeSingle());
        if (error) return toast(error.message, "error");
        if (!data?.id) return toast("No entry was updated; it may have changed or been removed. Refresh and retry.", "error");
        setRowsFor(table, prev => prev.map(r => r.id === editId ? data : r));
        toast("Changes saved", "success");
      } else {
        const { data, error } = await captureRequest(supabase.from(table).insert({ [field]: value.trim() }).select().maybeSingle());
        if (error) return toast(error.message, "error");
        if (!data?.id) return toast("The new entry was not confirmed by the server; refresh before retrying.", "error");
        setRowsFor(table, prev => [...prev, data]);
        toast("Entry added", "success");
      }
      setMasterModal(null);
      await refreshAudit();
    } finally { setMasterBusy(false); }
  };

  const openMasterDelete = (table, row) => {
    if (table === "academic_years" && row.is_current) {
      toast("Set a replacement academic year as current before deleting this year.", "error");
      return;
    }
    const field = table === "companies" ? "company_id" : table === "course_sections" ? "section_id" : null;
    const affected = field ? internRows.filter(r => r[field] === row.id).length : 0;
    setMasterModal({ mode: "delete", table, editId: row.id, value: row.name ?? row.label, row, affected });
  };

  const removeMaster = async () => {
    if (!masterModal || masterModal.mode !== "delete" || masterBusy) return;
    if (masterModal.table !== "academic_years" && resourceErrors.interns) {
      toast("Intern assignments are unavailable, so deletion impact cannot be verified. Refresh and retry.", "error");
      return;
    }
    setMasterBusy(true);
    try {
      const result = await recordRpc(supabase, "admin_delete_master", { p_table: masterModal.table, p_id: masterModal.editId });
      if (!result.ok) { toast(result.error, "error"); return; }
      const deletedId = result.data.id;
      const field = masterModal.table === "companies" ? "company_id" : masterModal.table === "course_sections" ? "section_id" : null;
      setRowsFor(masterModal.table, prev => prev.filter(r => r.id !== deletedId));
      if (field) {
        setInternRows(prev => prev.map(r => r[field] === deletedId ? { ...r, [field]: null } : r));
        setInternForms(prev => Object.fromEntries(Object.entries(prev).map(([id, form]) => [id, form[field] === deletedId ? { ...form, [field]: "" } : form])));
      }
      setMasterModal(null);
      toast(`${masterModal.value} deleted; ${Number(result.data.affected_interns || 0)} intern assignment(s) cleared.`, "success");
      await refreshAudit();
    } finally { setMasterBusy(false); }
  };

  const setCurrentYear = async (row) => {
    if (masterBusy || row.is_current) return;
    setMasterBusy(true);
    try {
      const result = await recordRpc(supabase, "admin_set_current_academic_year", { p_id: row.id });
      if (!result.ok) { toast(result.error, "error"); return; }
      setYears(prev => prev.map(y => ({ ...y, is_current: y.id === result.data.id })));
      toast(`${row.label} is now the current academic year`, "success");
      await refreshAudit();
    } finally { setMasterBusy(false); }
  };


  const stats = [
    { label: "Total Users", value: `${users.length}`, sub: `${users.filter((u) => u.status === "Active").length} active`, icon: <IconUsers size={18} />, iconBg: "#eff6ff", iconColor: "#2563eb" },
    { label: "Active Interns", value: `${users.filter((u) => u.role === "intern" && u.status === "Active").length}`, sub: "Live count", icon: <IconGradCap size={18} />, iconBg: "#f0fdf4", iconColor: "#16a34a" },
    { label: "Companies", value: `${companies.length}`, sub: "In directory", icon: <IconBuilding size={18} />, iconBg: "#fefce8", iconColor: "#d97706" },
    { label: "System Uptime", value: "Unavailable", sub: "Monitoring not connected", icon: <IconCheck size={18} />, iconBg: "#f0fdf4", iconColor: "#16a34a" },
  ];

  return (
    <>
      <Shell userName={profile.full_name} userEmail={profile.email} userRole="Administrator"
        navItems={navItems} activeTab={tab} onTabChange={setTab} onLogout={onLogout}>
        <div className="p-6 max-w-6xl mx-auto space-y-5">
          <RefreshStatus loading={loading || Boolean(savingInternId) || accountBusy || masterBusy || Boolean(attachingDocsId)} lastUpdated={lastUpdated} onRefresh={loadAll} />
          {Object.keys(resourceErrors).some((key) => resourceErrors[key]) && <div role="alert" className="rounded-lg px-4 py-3 text-sm flex flex-wrap items-center gap-3" style={{ background: "var(--warning-bg)", color: "var(--foreground)", border: "1px solid var(--warning)" }}><span>Some data could not be refreshed. Existing values may be stale.</span><button onClick={loadAll} className="font-semibold underline">Retry refresh</button></div>}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold">{tab === "overview" ? `Hi, ${profile.full_name.split(" ")[0]}!` : navItems.find((n) => n.id === tab)?.label}</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                {years.find((y) => y.is_current)?.label ?? "Setup required: current academic year"}
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
              {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}
            </span>
          </div>

          {loading && <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading…</div>}

          {/* ── OVERVIEW ── */}
          {!loading && tab === "overview" && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: s.iconBg, color: s.iconColor }}>{s.icon}</div>
                    <div className="text-2xl font-bold mb-0.5">{s.value}</div>
                    <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{s.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--primary)" }}>{s.sub}</div>
                  </div>
                ))}
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                    <span className="text-sm font-semibold">Recent Accounts</span>
                    <button className="text-xs" style={{ color: "var(--primary)" }} onClick={() => setTab("accounts")}>View all →</button>
                  </div>
                  {users.slice(0, 5).map((u) => (
                    <div key={u.id} className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 text-white"
                        style={{ background: roleColors[roleLabel[u.role]] ?? "var(--primary)" }}>
                        {u.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{u.full_name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{u.email}</div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${roleColors[roleLabel[u.role]]}20`, color: roleColors[roleLabel[u.role]] }}>{roleLabel[u.role] ?? u.role}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                    <span className="text-sm font-semibold">Audit Log — Recent</span>
                    <button className="text-xs" style={{ color: "var(--primary)" }} onClick={() => setTab("auditlogs")}>View all →</button>
                  </div>
                  {logs.slice(0, 5).map((l) => (
                    <div key={l.id} className="px-4 py-3 flex gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <span className="font-mono text-xs shrink-0 mt-0.5 w-20" style={{ color: "var(--muted-foreground)" }}>
                        {new Date(l.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}
                      </span>
                      <div>
                        <div className="text-xs font-medium">{l.source === "database-trigger-v2" ? "DB recorded" : "Legacy (provenance unverified)"} | {l.action}</div>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{l.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── ACCOUNTS ── */}
          {!loading && tab === "accounts" && (
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--foreground)" }} />
                <span className="text-xs whitespace-nowrap" style={{ color: "var(--muted-foreground)" }}>
                  New accounts are created via Register — edit role/status below
                </span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--muted)" }}>
                    {["Name", "Role", "Email", "Status", "Joined", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-4 py-3 font-medium">{u.full_name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${roleColors[roleLabel[u.role]] ?? "#888"}20`, color: roleColors[roleLabel[u.role]] ?? "#888" }}>{roleLabel[u.role] ?? u.role}</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: u.status === "Active" ? "var(--success-bg)" : "var(--danger-bg)", color: u.status === "Active" ? "var(--success)" : "var(--danger)" }}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button className="text-xs" style={{ color: "var(--primary)" }} onClick={() => openEdit(u)}>Edit</button>
                          <button className="text-xs" style={{ color: u.status === "Active" ? "var(--danger)" : "var(--success)" }}
                            disabled={accountBusy} onClick={() => deactivate(u)}>
                            {u.status === "Active" ? "Deactivate" : "Reactivate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* ── INTERNS ── */}
          {!loading && tab === "interns" && (
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-sm font-semibold">Intern Assignments</span>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  Assign each intern to an instructor, company, section, and academic year, set their required hours, and attach the standard document checklist. Active status and onboarding readiness are separate.
                </p>
              </div>
              {metricsError && <p role="alert" className="px-4 py-2 text-xs">Progress unavailable: {metricsError}</p>}
              {internsForTab.length === 0 && (
                <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                  No intern accounts yet — they'll appear here once someone registers with the Intern role.
                </div>
              )}
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {internsForTab.map((intern) => {
                  const form = internForms[intern.id] ?? { instructor_id: "", company_id: "", section_id: "", academic_year_id: "", required_hours: intern.required_hours ?? "" };
                  const checklist = docCounts[intern.id] ?? checklistState(null);
                  const onboarding = onboardingItems(intern, academicRows(metricDocuments?.filter(d => d.intern_id === intern.id), intern.academic_year_id));
                  const metric = internMetrics({ internId: intern.id, required: intern.required_hours, academicYearId: intern.academic_year_id ?? null,
                    attendance: metricAttendance?.filter(a => a.intern_id === intern.id), documents: metricDocuments?.filter(d => d.intern_id === intern.id) });
                  return (
                    <div key={intern.id} className="px-4 py-4" style={{ borderTop: "1px solid var(--border)" }}>
                      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                        <div>
                          <div className="text-sm font-medium">{intern.full_name}</div>
                          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{intern.email}</div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: intern.status === "Active" ? "var(--success-bg)" : "var(--warning-bg)", color: intern.status === "Active" ? "var(--success)" : "var(--warning)" }}>
                          {intern.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <Field label="Instructor">
                          <select value={form.instructor_id} onChange={(e) => updateInternForm(intern.id, "instructor_id", e.target.value)}
                            className={inputCls} style={inputStyle}>
                            <option value="">— Unassigned —</option>
                            {instructorOptions.map((i) => <option key={i.id} value={i.id}>{i.full_name}</option>)}
                          </select>
                        </Field>
                        <Field label="Company">
                          <select value={form.company_id} onChange={(e) => updateInternForm(intern.id, "company_id", e.target.value)}
                            className={inputCls} style={inputStyle}>
                            <option value="">— None —</option>
                            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </Field>
                        <Field label="Section">
                          <select aria-label="Section" value={form.section_id}
                            onChange={(e) => updateInternForm(intern.id, "section_id", e.target.value)}
                            disabled={Boolean(resourceErrors.sections) || savingInternId === intern.id}
                            className={inputCls} style={inputStyle}>
                            <option value="">— Unassigned —</option>
                            {form.section_id && !sections.some((section) => section.id === form.section_id) && (
                              <option value={form.section_id} disabled>Assigned section unavailable</option>
                            )}
                            {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                          </select>
                          {!resourceErrors.sections && sections.length === 0 && (
                            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Add sections in Master Data → Course Sections.</p>
                          )}
                        </Field>
                        <Field label="Required Hours">
                          <input type="number" min="0.01" max="10000" step="0.01" value={form.required_hours}
                            onChange={(e) => updateInternForm(intern.id, "required_hours", e.target.value)}
                            className={inputCls} style={inputStyle} />
                        </Field>
                        <Field label="Academic Year">
                          <select aria-label="Academic Year" value={form.academic_year_id}
                            disabled={Boolean(resourceErrors.years) || savingInternId === intern.id}
                            onChange={(e) => updateInternForm(intern.id, "academic_year_id", e.target.value)} className={inputCls} style={inputStyle}>
                            <option value="">Unassigned academic year</option>
                            {years.map((year) => <option key={year.id} value={year.id}>{year.label}{year.is_current ? " (Current)" : ""}</option>)}
                          </select>
                          <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Select explicitly. Changing years starts a separate progress total and checklist; earlier records stay in history.</p>
                        </Field>
                      </div>
                      <div className="mt-3 text-xs space-y-1">
                        <p className="font-semibold">Onboarding: {onboarding.every(item => item.complete) ? "Ready" : "Incomplete"} ({onboarding.filter(item => item.complete).length}/{onboarding.length})</p>
                        <p>{onboarding.map(item => `${item.complete ? "✓" : "Missing:"} ${item.label}`).join(" · ")}</p>
                        <p style={{ color: "var(--muted-foreground)" }}>Checklist reflects saved assignments. Save a year change before attaching that year's requirements.</p>
                      </div>
                      <p className="text-xs mt-2">Logged: {displayHours(metric.logged)} hrs | Verified: {displayHours(metric.verified)} hrs | {metric.risk} | Clearance: {metric.cleared === null ? "Unknown" : metric.cleared ? "Eligible" : "Incomplete"}</p>
                      <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                        <button onClick={() => attachStandardDocs(intern.id)} disabled={checklist.complete || !checklist.known || attachingDocsId === intern.id}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                          style={{ background: checklist.complete ? "var(--success-bg)" : "var(--secondary)", color: checklist.complete ? "var(--success)" : "var(--primary)" }}>
                          {attachingDocsId === intern.id ? "Attaching..." : checklist.complete ? "Standard checklist complete (4/4)" : checklist.known ? `Attach missing standard requirements (${checklist.present}/4 present)` : "Checklist unavailable"}
                        </button>
                        <button onClick={() => saveInternAssignment(intern.id)} disabled={savingInternId === intern.id}
                          className="text-xs px-4 py-1.5 rounded-lg font-semibold disabled:opacity-60"
                          style={{ background: "var(--primary)", color: "#fff" }}>
                          {savingInternId === intern.id ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── MASTER DATA ── */}
          {!loading && tab === "masterdata" && (
            <div className="grid lg:grid-cols-2 gap-4">
              {masterSections.map((section) => (
                <div key={section.key} className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                    <span className="text-sm font-semibold">{section.title}</span>
                    <button onClick={() => openMasterAdd(section.table)} className="text-xs px-2.5 py-1 rounded-lg"
                      style={{ background: "var(--secondary)", color: "var(--primary)" }}>+ Add</button>
                  </div>
                  {section.rows.map((row) => (
                    <div key={row.id} className="px-4 py-2.5 flex items-center justify-between text-sm" style={{ borderBottom: "1px solid var(--border)" }}>
                      <span>{row[section.field]}{section.table === "academic_years" && row.is_current ? " (Current)" : ""}</span>
                      <div className="flex gap-3">
                        {section.table === "academic_years" && !row.is_current && <button className="text-xs" disabled={masterBusy} style={{ color: "var(--primary)" }} onClick={() => setCurrentYear(row)}>Set Current</button>}
                        <button className="text-xs" style={{ color: "var(--primary)" }} onClick={() => openMasterEdit(section.table, row, section.field)}>Edit</button>
                        <button className="text-xs" style={{ color: "var(--danger)" }} onClick={() => openMasterDelete(section.table, row)}>Delete</button>
                      </div>
                    </div>
                  ))}
                  {section.rows.length === 0 && (
                    <div className="px-4 py-4 text-xs text-center" style={{ color: "var(--muted-foreground)" }}>No entries yet</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── IMPORT ── */}
          {!loading && tab === "import" && (
            <div className="space-y-4">
              <div className="rounded-xl p-8 text-center" style={{ background: "var(--card)", border: "2px dashed var(--border)" }}>
                <div className="flex justify-center mb-3" style={{ color: "var(--muted-foreground)" }}>
                  <IconUpload size={36} strokeWidth={1.2} />
                </div>
                <h3 className="text-sm font-semibold mb-1">Bulk import unavailable</h3>
                <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>File upload, drag and drop, validation and account creation are not implemented. Register accounts individually, then approve them through an administrator.</p>
                <button disabled className="text-sm px-4 py-2 rounded-lg" style={{ background: "var(--secondary)" }}>Import unavailable</button>
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                {[{ kind: "student", title: "Student planning template" }, { kind: "instructor", title: "Instructor planning template" }].map((t) => (
                  <div key={t.kind} className="rounded-xl p-4 flex flex-wrap gap-3 items-center justify-between" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                    <div>
                      <div className="text-sm font-medium">{t.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>Blank headers only. Import is unavailable.</div>
                    </div>
                    <div className="flex gap-2">{["csv", "xlsx"].map((format) => <button key={format} disabled={exportBusy}
                      className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50" style={{ background: "var(--secondary)", color: "var(--primary)" }}
                      onClick={() => requestExport(() => templateArtifact(t.kind, format))}>Download {format.toUpperCase()}</button>)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AUDIT LOGS ── */}
          {!loading && tab === "auditlogs" && (
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-sm font-semibold">System Activity Log</span>
                <button disabled={exportBusy} className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50" style={{ background: "var(--secondary)", color: "var(--primary)" }}
                  onClick={() => requestExport(() => auditArtifact(supabase))}>{exportBusy ? "Preparing CSV…" : "Export audit CSV"}</button>
              </div>
              <p className="px-4 py-2 text-xs" style={{ color: "var(--muted-foreground)" }}>Audit history is paginated in deterministic 50-record pages. Export remains bounded at 50,000 records and is not a transactional snapshot.</p>
              {resourceErrors.audit && <p role="alert" className="px-4 py-2 text-xs" style={{ color: "var(--danger)" }}>Audit history unavailable: {resourceErrors.audit}</p>}
              {logs.map((l) => (
                <div key={l.id} className="px-4 py-3 flex gap-4 items-start" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="font-mono text-xs shrink-0 mt-0.5 w-20" style={{ color: "var(--muted-foreground)" }}>
                    {new Date(l.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}
                  </span>
                  <div className="w-36 shrink-0 text-xs font-medium truncate">{l.actor_name}</div>
                  <div className="flex-1">
                    <div className="text-sm">{l.source === "database-trigger-v2" ? "DB recorded" : "Legacy (provenance unverified)"} | {l.action}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{l.detail}</div>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderTop: "1px solid var(--border)" }}>
                <button disabled={auditPage === 0 || Boolean(resourceErrors.audit)} onClick={() => setAuditPage(p => Math.max(0, p - 1))} className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ background: "var(--secondary)" }}>Previous</button>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Page {auditPage + 1}{auditCount == null ? "" : ` · ${auditCount} records`}</span>
                <button disabled={Boolean(resourceErrors.audit) || auditCount == null || (auditPage + 1) * AUDIT_PAGE_SIZE >= auditCount} onClick={() => setAuditPage(p => p + 1)} className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ background: "var(--secondary)" }}>Next</button>
              </div>
            </div>
          )}

          {/* ── BACKUP ── */}
          {!loading && tab === "backup" && (
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <h3 className="text-sm font-semibold mb-4">Database Backup</h3>
                <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
                  Backup status is not connected. An authorized operator must verify
                  backup availability, retention and restore capability in the
                  Supabase dashboard. This application does not create snapshots.
                </p>
                <button disabled
                  className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-60 transition-opacity"
                  style={{ background: "var(--primary)", color: "#fff" }}>
                  Manual backup unavailable
                </button>
              </div>
              <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <h3 className="text-sm font-semibold mb-4">Role Permissions</h3>
                <div className="space-y-2">
                  {[
                    { role: "System Admin", perms: ["Full access", "User management", "Audit logs"] },
                    { role: "Instructor", perms: ["Assigned evaluations", "Reports unavailable", "Assigned attendance", "Manage assigned alerts"] },
                    { role: "Intern", perms: ["Log attendance", "View evaluations", "View progress"] },
                  ].map((r) => (
                    <div key={r.role} className="p-3 rounded-lg" style={{ background: "var(--muted)" }}>
                      <div className="text-xs font-semibold mb-2">{r.role}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {r.perms.map((p) => (
                          <span key={p} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>{p}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </Shell>

      {/* ── EDIT USER MODAL ── */}
      {userModal.open && (
        <Modal title="Edit User" onClose={() => setUserModal({ open: false, editing: null })}>
          <div className="space-y-4">
            <Field label="Full Name">
              <input value={userForm.name} onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Maria Santos" className={inputCls} style={inputStyle} />
            </Field>
            <Field label="Role">
              <select value={userForm.role} onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}
                className={inputCls} style={inputStyle}>
                {roles.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            {userForm.role === "Intern" && (
              <Field label="Company">
                <select value={userForm.companyId} onChange={(e) => setUserForm((f) => ({ ...f, companyId: e.target.value }))}
                  className={inputCls} style={inputStyle}>
                  <option value="">— None —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Status">
              <select value={userForm.status} onChange={(e) => setUserForm((f) => ({ ...f, status: e.target.value }))}
                className={inputCls} style={inputStyle}>
                <option>Active</option>
                <option>Inactive</option>
                <option>Pending</option>
              </select>
            </Field>
            {userForm.role === "Intern" && userForm.status === "Active" && <p className="text-xs" style={{ color: "var(--warning)" }}>Activation enables sign-in. Complete the saved instructor, company, section, academic-year, hours, and document checklist under Intern Assignments before treating onboarding as ready.</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={saveUser} disabled={accountBusy} className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: "var(--primary)", color: "#fff" }}>
                Save Changes
              </button>
              <button onClick={() => setUserModal({ open: false, editing: null })}
                className="px-4 py-2.5 rounded-lg text-sm"
                style={{ background: "var(--secondary)", color: "var(--foreground)" }}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MASTER DATA MODAL ── */}
      {masterModal && (
        <Modal
          title={masterModal.mode === "delete" ? `Delete ${masterModal.table === "companies" ? "Company" : masterModal.table === "course_sections" ? "Course Section" : "Academic Year"}` : masterModal.editId ? "Edit Entry" : "Add Entry"}
          onClose={() => !masterBusy && setMasterModal(null)}
          width="420px"
        >
          {masterModal.mode === "delete" ? (
            <div className="space-y-4">
              <p className="text-sm">Delete <strong>{masterModal.value}</strong>? This action cannot be undone.</p>
              {masterModal.table !== "academic_years" && <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>The server reports {masterModal.affected} intern assignment(s) referencing this record. Those references will be cleared by the database and the local assignment buffers will be refreshed.</p>}
              {masterModal.table === "academic_years" && <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Only non-current academic years can be deleted. Historical records are not rewritten.</p>}
              <div className="flex gap-2">
                <button onClick={removeMaster} disabled={masterBusy} className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: "var(--danger)", color: "#fff" }}>{masterBusy ? "Deleting…" : "Delete"}</button>
                <button onClick={() => setMasterModal(null)} disabled={masterBusy} className="px-4 py-2.5 rounded-lg text-sm" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Value">
                <input aria-label={masterModal.editId ? "Edit value" : "New value"} value={masterModal.value} onChange={(e) => setMasterModal((m) => ({ ...m, value: e.target.value }))}
                  placeholder="Enter value…" className={inputCls} style={inputStyle}
                  onKeyDown={(e) => e.key === "Enter" && saveMaster()} autoFocus />
              </Field>
              <div className="flex gap-2">
                <button onClick={saveMaster} disabled={masterBusy} className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: "var(--primary)", color: "#fff" }}>
                  {masterBusy ? "Saving…" : masterModal.editId ? "Save Changes" : `Add ${masterModal.table === "companies" ? "Company" : masterModal.table === "course_sections" ? "Course Section" : "Academic Year"}`}
                </button>
                <button onClick={() => setMasterModal(null)} disabled={masterBusy} className="px-4 py-2.5 rounded-lg text-sm" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>Cancel</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

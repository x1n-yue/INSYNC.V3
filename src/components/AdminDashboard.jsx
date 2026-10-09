import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { recordRpc } from "../lib/authority";
import { checklistState } from "../lib/business";
import { displayHours, internMetrics } from "../lib/metrics";
import { completeRows, saveAssignment } from "../lib/workflows";
import Shell from "./Shell";
import { auditChanges, auditScope, auditTables } from "../lib/audit";
import { dashboardMetrics, detailPage } from "../lib/dashboard";
import Modal from "./Modal";
import RefreshStatus from "./RefreshStatus";
import { onboardingItems } from "../lib/assignments";
import { captureRequest } from "../lib/requests";
import { useToast } from "./Toast";
import {
  IconGrid, IconUsers, IconFolder, IconClipboard,
  IconGradCap, IconClock, IconCheck,
} from "./Icons";

const navItems = [
  { id: "overview", label: "Overview", icon: <IconGrid size={15} /> },
  { id: "interns", label: "Interns", icon: <IconGradCap size={15} /> },
  { id: "accounts", label: "Account Management", icon: <IconUsers size={15} /> },
  { id: "masterdata", label: "Master Data", icon: <IconFolder size={15} /> },
  { id: "auditlogs", label: "Audit Logs", icon: <IconClipboard size={15} /> },
];

const roleLabel = { admin: "Admin", instructor: "Instructor", intern: "Intern" };
const roleColors = { Intern: "#92400e", Instructor: "#7c3aed", Admin: "#1a2f5e" };
const roles = ["Intern", "Instructor", "Admin"];

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>{label}</span>
      {children}
    </label>
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
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [resourceErrors, setResourceErrors] = useState({});
  const loadSequence = useRef(0);
  const [auditPage, setAuditPage] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const auditSequence = useRef(0);
  const [auditCount, setAuditCount] = useState(null);
  const AUDIT_PAGE_SIZE = 50;
  const [auditFilters, setAuditFilters] = useState({});
  const [auditFilterDraft, setAuditFilterDraft] = useState({ actor: "", table: "", start: "", end: "" });

  // User modal
  const [userModal, setUserModal] = useState({ open: false, editing: null });
  const [userForm, setUserForm] = useState({ name: "", role: "Intern", status: "Active", companyId: "" });

  // Interns tab — intern rows from the `interns` table, keyed edit buffer, and
  // per-intern document-checklist counts (for the "attach standard docs" button)
  const [internRows, setInternRows] = useState([]);
  const [internForms, setInternForms] = useState({});
  const [docCounts, setDocCounts] = useState({});
  const [serverMetrics, setServerMetrics] = useState({});
  const dirtyInterns = useRef(new Set());
  const [metricsError, setMetricsError] = useState(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [savingInternId, setSavingInternId] = useState(null);
  const [attachingDocsId, setAttachingDocsId] = useState(null);

  // Master data modals — { table, editId, value }
  const [masterModal, setMasterModal] = useState(null);
  const [masterBusy, setMasterBusy] = useState(false);

  const loadAuditPage = async (page = auditPage, filters = auditFilters) => {
    const request = ++auditSequence.current;
    setAuditLoading(true);
    try {
      const { data, count } = await detailPage(supabase, "audit_logs", { page, filter: auditScope(filters) });
      if (request !== auditSequence.current) return;
      setLogs(data ?? []);
      setAuditCount(count ?? null);
      setAuditPage(page); setAuditFilters(filters);
      setResourceErrors(prev => ({ ...prev, audit: undefined }));
    } catch (error) {
      if (request === auditSequence.current) throw error;
    } finally {
      if (request === auditSequence.current) setAuditLoading(false);
    }
  };
  const changeAuditPage = async (page) => {
    try { await loadAuditPage(page); }
    catch (error) { setResourceErrors(prev => ({ ...prev, audit: error.message || "Audit history unavailable" })); }
  };

  const loadAll = async () => {
    const sequence = ++loadSequence.current;
    const auditRequest = ++auditSequence.current;
    setAuditLoading(false);
    setLoading(true);
    const capture = captureRequest;
    try {
      const [profilesResult, auditResult, companyResult, sectionResult, yearResult, internsResult, metricsResult] = await Promise.all([
        capture(completeRows(supabase, "profiles").then(data => ({ data }))),
        capture(tab === "auditlogs" ? detailPage(supabase, "audit_logs", { page: auditPage, filter: auditScope(auditFilters) }) : Promise.resolve({ data: logs, count: auditCount })),
        capture(completeRows(supabase, "companies").then(data => ({ data }))),
        capture(completeRows(supabase, "course_sections").then(data => ({ data }))),
        capture(completeRows(supabase, "academic_years").then(data => ({ data }))),
        capture(completeRows(supabase, "interns").then(data => ({ data }))),
        capture(dashboardMetrics(supabase, profile.id).then(data => ({ data }))),
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
        setInternForms(prev => Object.fromEntries((data ?? []).map(r => [r.id, dirtyInterns.current.has(r.id) ? prev[r.id] : { instructor_id: r.instructor_id ?? "", company_id: r.company_id ?? "", section_id: r.section_id ?? "", academic_year_id: r.academic_year_id ?? "", required_hours: r.required_hours ?? "" }])));
      });
      assign("metrics", metricsResult, data => setServerMetrics(Object.fromEntries(data.map(row => [row.id,row]))));
      if (auditRequest === auditSequence.current) {
        if (auditResult?.error) errors.audit = auditResult.error.message || String(auditResult.error);
        else { setLogs(auditResult.data ?? []); setAuditCount(auditResult.count ?? null); }
      }
      setResourceErrors(errors);
      if (!Object.values(errors).some(Boolean)) setLastUpdated(new Date());
      setMetricsError(errors.profiles || errors.interns || errors.metrics || null);
      if (!errors.metrics) setDocCounts(Object.fromEntries(metricsResult.data.map(row => [row.id,row.metric.checklist])));
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
    // Initial load only; subsequent refreshes and page changes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "auditlogs") changeAuditPage(auditPage);
    // Navigation loads the selected page; form submission applies filters explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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

  const updateInternForm = (internId, field, value) => {
    dirtyInterns.current.add(internId);
    setInternForms((prev) => ({ ...prev, [internId]: { ...prev[internId], [field]: value } }));
  };

  const applyIntern = (row) => {
    if (!row) return;
    setInternRows(prev => prev.some(r => r.id === row.id) ? prev.map(r => r.id === row.id ? row : r) : [...prev, row]);
    setInternForms(prev => ({ ...prev, [row.id]: { instructor_id: row.instructor_id ?? "", company_id: row.company_id ?? "", section_id: row.section_id ?? "", academic_year_id: row.academic_year_id ?? "", required_hours: row.required_hours ?? "" } }));
    dirtyInterns.current.delete(row.id);
  };
  const saveInternAssignment = async (internId) => {
    if (savingInternId || !internForms[internId]) return;
    setSavingInternId(internId);
    try {
      const result = await saveAssignment(supabase, internId, internForms[internId]);
      if (!result.ok) { toast(result.error, "error"); return result; }
      applyIntern(result.data);
      await loadAll(); toast("Assignment saved", "success");
      return result;
    } finally { setSavingInternId(null); }
  };
  const attachStandardDocs = async (internId) => {
    if (attachingDocsId) return;
    setAttachingDocsId(internId);
    try {
      const result = await recordRpc(supabase, "attach_standard_docs", { p_id: internId });
      if (!result.ok) return toast(result.error, "error");
      await loadAll(); toast("Missing standard requirements attached", "success");
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
    { label: "Clocked In", value: metricsError || Object.values(serverMetrics).some(row => row.clockedIn == null) ? "Unavailable" : `${Object.values(serverMetrics).filter(row => row.clockedIn).length}`, sub: "At last refresh", icon: <IconClock size={18} />, iconBg: "#eff6ff", iconColor: "#2563eb" },
    { label: "Active Interns", value: `${users.filter((u) => u.role === "intern" && u.status === "Active").length}`, sub: "At last refresh", icon: <IconGradCap size={18} />, iconBg: "#f0fdf4", iconColor: "#16a34a" },
    { label: "Unassigned Interns", value: metricsError ? "Unavailable" : `${internsForTab.filter(intern => !intern.instructor_id).length}`, sub: "Need an instructor", icon: <IconGradCap size={18} />, iconBg: "#fefce8", iconColor: "#d97706" },
    { label: "Pending Accounts", value: `${users.filter(user => user.status === "Pending").length}`, sub: "Awaiting approval", icon: <IconCheck size={18} />, iconBg: "#f0fdf4", iconColor: "#16a34a" },
  ];

  return (
    <>
      <Shell userName={profile.full_name} userEmail={profile.email} userRole="Administrator"
        navItems={navItems} activeTab={tab} onTabChange={setTab} onLogout={onLogout}>
        <div className="workspace space-y-5">
          <RefreshStatus loading={loading || auditLoading || Boolean(savingInternId) || accountBusy || masterBusy || Boolean(attachingDocsId)} lastUpdated={lastUpdated} onRefresh={loadAll} />
          {Object.keys(resourceErrors).some((key) => resourceErrors[key]) && <div role="alert" className="rounded-lg px-4 py-3 text-sm flex flex-wrap items-center gap-3" style={{ background: "var(--warning-bg)", color: "var(--foreground)", border: "1px solid var(--warning)" }}><span>Some data could not be refreshed. Existing values may be stale.</span><button onClick={loadAll} className="font-semibold underline">Retry refresh</button></div>}
          <div className="flex flex-wrap items-start justify-between gap-3">
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
          {hasLoaded && tab === "overview" && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((s) => (
                  <div key={s.label} className="ui-card ui-stat-card rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: s.iconBg, color: s.iconColor }}>{s.icon}</div>
                    <div className="text-2xl font-bold mb-0.5">{s.value}</div>
                    <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{s.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--primary)" }}>{s.sub}</div>
                  </div>
                ))}
              </div>
              <section aria-label="Intern monitoring overview" className="ui-card rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div className="px-4 py-3 flex justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <h2 className="text-sm font-semibold">Intern Monitoring</h2><button className="text-xs underline" onClick={() => setTab("interns")}>View interns and assignments</button>
                </div>
                {metricsError ? <p role="status" className="p-4 text-xs">Attendance and progress unavailable. Refresh data to check current evidence.</p> : <>
                  {internsForTab.slice(0, 5).map(intern => {
                    const facts = serverMetrics[intern.id];
                    return <div key={intern.id} className="px-4 py-3 space-y-1 text-xs" style={{ borderBottom: "1px solid var(--border)" }}>
                      <p className="font-semibold">{intern.full_name}</p>
                      <p>Logged: {displayHours(facts?.metric.logged)} hrs | Verified: {displayHours(facts?.metric.verified)} hrs | {facts?.metric.risk ?? "Unknown"}</p>
                      <p>Attendance corrections: {facts?.pendingCorrections ?? "Unavailable"} | Approved documents: {facts?.metric.approved ?? "Unavailable"}/{facts?.documentCount ?? "Unavailable"} | Evaluation: {!facts ? "Unavailable" : facts.latestEvaluation ? "Available" : "No evaluation for assigned year"}</p>
                    </div>;
                  })}
                  {internsForTab.length === 0 && <p className="p-4 text-xs">No intern accounts yet.</p>}
                </>}
              </section>
              <section aria-label="System setup actions" className="ui-card rounded-xl p-4 space-y-3 text-xs" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold">System Setup</h2>
                {!years.some(year => year.is_current) && <p>Set the current academic year in Master Data.</p>}
                <div className="action-links">
                  <button onClick={() => setTab("interns")}>Review assignments and document checklists</button>
                  <button onClick={() => setTab("accounts")}>Review pending accounts</button>
                  <button onClick={() => setTab("masterdata")}>Open master data</button>
                </div>
              </section>
            </>
          )}

          {/* ── ACCOUNTS ── */}
          {hasLoaded && tab === "accounts" && (
            <div className="ui-card rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 toolbar" style={{ borderBottom: "1px solid var(--border)" }}>
                <input aria-label="Search users" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:w-auto flex-1 min-w-0 text-sm px-3 py-1.5 rounded-lg border outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--foreground)" }} />
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  New accounts are created via Register — edit role/status below
                </span>
              </div>
              <div role="region" aria-label="User accounts" tabIndex={0} className="table-region overflow-x-auto">
              <table className="data-table w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--muted)" }}>
                    {["Name", "Role", "Email", "Status", "Joined", "Actions"].map((h) => (
                      <th scope="col" key={h} className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!loading && !resourceErrors.profiles && filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{search.trim() ? "No users match your search." : "No user accounts available."}</td></tr>}
                  {filtered.map((u) => (
                    <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-4 py-3 font-medium">{u.full_name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${roleColors[roleLabel[u.role]] ?? "#888"}20`, color: roleColors[roleLabel[u.role]] ?? "#888" }}>{roleLabel[u.role] ?? u.role}</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: u.status === "Active" ? "var(--success-bg)" : u.status === "Pending" ? "var(--warning-bg)" : "var(--danger-bg)", color: u.status === "Active" ? "var(--success)" : u.status === "Pending" ? "var(--warning)" : "var(--danger)" }}>
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
          {hasLoaded && tab === "interns" && (
            <div className="ui-card rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
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
                  const onboarding = onboardingItems(intern, null, checklist);
                  const metric = serverMetrics[intern.id]?.metric ?? internMetrics({ internId: intern.id, required: intern.required_hours });
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
          {hasLoaded && tab === "masterdata" && (
            <div className="grid lg:grid-cols-2 gap-4">
              {masterSections.map((section) => (
                <div key={section.key} className="ui-card rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
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

          {/* ── AUDIT LOGS ── */}
          {hasLoaded && tab === "auditlogs" && (
            <div className="ui-card rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-sm font-semibold">System Activity Log</span>
              </div>
              <p className="px-4 py-2 text-xs" style={{ color: "var(--muted-foreground)" }}>Audit history is paginated in deterministic 50-record pages.</p>
              <form className="audit-filters px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs" onSubmit={async event => { event.preventDefault(); try { await loadAuditPage(0, auditFilterDraft); } catch (error) { setResourceErrors(prev => ({ ...prev, audit: error.message })); } }}>
                <label>Actor<select aria-label="Audit actor" value={auditFilterDraft.actor} onChange={event => setAuditFilterDraft(filters => ({ ...filters, actor: event.target.value }))}><option value="">All actors</option><option value="system">System / trusted SQL</option>{users.map(user => <option key={user.id} value={user.id}>{user.full_name}</option>)}</select></label>
                <label>Table<select aria-label="Audit table" value={auditFilterDraft.table} onChange={event => setAuditFilterDraft(filters => ({ ...filters, table: event.target.value }))}><option value="">All tables</option>{auditTables.map(table => <option key={table}>{table}</option>)}</select></label>
                <label>From (Manila)<input aria-label="Audit start date" type="date" value={auditFilterDraft.start} onChange={event => setAuditFilterDraft(filters => ({ ...filters, start: event.target.value }))} /></label>
                <label>Through (Manila)<input aria-label="Audit end date" type="date" value={auditFilterDraft.end} onChange={event => setAuditFilterDraft(filters => ({ ...filters, end: event.target.value }))} /></label>
                <button className="px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }} disabled={loading || auditLoading}>Apply audit filters</button>
                <span className="sm:col-span-2 lg:col-span-3 self-center leading-relaxed" style={{ color: "var(--muted-foreground)" }}>The history uses the applied filters. Unapplied edits do not change the current results.</span>
              </form>
              {resourceErrors.audit && <p role="alert" className="px-4 py-2 text-xs" style={{ color: "var(--danger)" }}>Audit history unavailable: {resourceErrors.audit}</p>}
              {logs.map((l) => (
                <div key={l.id} className="px-4 py-3 grid grid-cols-1 lg:grid-cols-[9rem_9rem_minmax(0,1fr)] gap-x-4 gap-y-2 items-start" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="font-mono text-xs shrink-0 mt-0.5 w-36" style={{ color: "var(--muted-foreground)" }}>
                    {new Date(l.created_at).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" })}
                  </span>
                  <div className="text-xs font-medium break-words">{l.actor_name}</div>
                  <div className="flex-1">
                    <div className="text-sm break-words">{l.source === "database-trigger-v2" ? "DB recorded" : "Legacy (provenance unverified)"} | {l.action}</div>
                    <div className="text-xs mt-0.5 break-words" style={{ color: "var(--muted-foreground)" }}>{l.detail}</div>
                    <details className="mt-2 text-xs"><summary>View recorded changes</summary><div role="region" aria-label="Recorded audit changes" tabIndex={0} className="table-region overflow-x-auto"><table className="data-table w-full text-xs"><thead><tr><th>Field</th><th>Previous</th><th>New</th></tr></thead><tbody>{auditChanges(l.event_data).map(change => <tr key={change.field}><td>{change.field}</td><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody></table></div><pre className="whitespace-pre-wrap break-words">{JSON.stringify(l.event_data ?? { note: "No structured metadata recorded" }, null, 2)}</pre></details>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 toolbar justify-between" style={{ borderTop: "1px solid var(--border)" }}>
                <button disabled={auditLoading || auditPage === 0 || Boolean(resourceErrors.audit)} onClick={() => changeAuditPage(Math.max(0, auditPage - 1))} className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ background: "var(--secondary)" }}>Previous</button>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{auditLoading ? "Loading audit page… · " : ""}Page {auditPage + 1}{auditCount == null ? "" : ` · ${auditCount} records`}</span>
                <button disabled={auditLoading || Boolean(resourceErrors.audit) || auditCount == null || (auditPage + 1) * AUDIT_PAGE_SIZE >= auditCount} onClick={() => changeAuditPage(auditPage + 1)} className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ background: "var(--secondary)" }}>Next</button>
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

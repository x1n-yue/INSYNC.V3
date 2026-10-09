import { useState } from "react";
import Shell from "./Shell";
import Modal from "./Modal";
import { useToast } from "./Toast";
import {
  IconGrid, IconUsers, IconFolder, IconClipboard, IconRefresh,
  IconGradCap, IconBuilding, IconCheck, IconAlertTriangle, IconTrendingUp, IconBarChart,
} from "./Icons";

const navItems = [
  { id: "overview", label: "Overview", icon: <IconGrid size={15} /> },
  { id: "accounts", label: "Account Management", icon: <IconUsers size={15} /> },
  { id: "masterdata", label: "Master Data", icon: <IconFolder size={15} /> },
  { id: "auditlogs", label: "Audit Logs", icon: <IconClipboard size={15} /> },
];

type UserEntry = {
  id: string; name: string; role: string; email: string; status: string; joined: string;
  company?: string; instructor?: string; section?: string; academicYear?: string;
};

const initialUsers: UserEntry[] = [
  { id: "U001", name: "Maria Santos", role: "Intern", email: "m.santos@university.edu", status: "Active", joined: "Jan 15, 2025" },
  { id: "U002", name: "Dr. Ramon Cruz", role: "Instructor", email: "r.cruz@university.edu", status: "Active", joined: "Aug 1, 2024" },
  { id: "U003", name: "Andrea Lim", role: "Supervisor", email: "a.lim@techcorp.com", status: "Active", joined: "Sep 3, 2024" },
  { id: "U004", name: "James Reyes", role: "Intern", email: "j.reyes@university.edu", status: "Pending", joined: "Jan 15, 2025" },
  { id: "U005", name: "Sofia Mendoza", role: "Intern", email: "s.mendoza@university.edu", status: "Active", joined: "Jan 15, 2025" },
  { id: "U006", name: "Prof. Elena Torres", role: "Instructor", email: "e.torres@university.edu", status: "Active", joined: "Aug 1, 2024" },
];

const initialLogs = [
  { time: "10:42 AM", user: "Dr. Ramon Cruz", action: "Edited evaluation score", detail: "Maria Santos — Midterm +2pts" },
  { time: "10:15 AM", user: "Andrea Lim", action: "Approved attendance", detail: "3 interns — May 20, 2025" },
  { time: "09:58 AM", user: "System", action: "Database backup completed", detail: "Snapshot: DB-20250520-0958" },
  { time: "09:30 AM", user: "Admin", action: "User account created", detail: "New intern: Kevin Dizon" },
  { time: "08:47 AM", user: "Sofia Mendoza", action: "Clock-in recorded", detail: "TechCorp Manila — 08:47" },
  { time: "08:01 AM", user: "System", action: "Audit log rotation", detail: "Archived logs older than 90 days" },
];

type MasterSection = { title: string; items: string[] };
const initialMaster: MasterSection[] = [
  { title: "Academic Years", items: ["A.Y. 2024–2025 (Current)", "A.Y. 2023–2024", "A.Y. 2022–2023"] },
  { title: "Course Sections", items: ["BSIT 4A — OJT 2025", "BSIT 4B — OJT 2025", "BSCS 4A — OJT 2025", "BSCS 4B — OJT 2025"] },
  { title: "Company Directory", items: ["TechCorp Manila", "DataSoft Solutions", "Innovatek PH", "CloudBase Inc.", "NextGen Systems"] },
];

const roleColors: Record<string, string> = {
  Intern: "#d97706", Instructor: "#7c3aed", Supervisor: "#0d9488", Admin: "#1a2f5e",
};

const roles = ["Intern", "Instructor", "Supervisor", "Admin"];

const emptyUser = {
  name: "", role: "Intern", email: "", status: "Active", company: "",
  instructor: "", section: "", academicYear: "",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full text-sm px-3 py-2.5 rounded-lg border outline-none transition-all";
const inputStyle = { borderColor: "var(--border)", background: "var(--muted)", color: "var(--foreground)" };

export default function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const { toast } = useToast();
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserEntry[]>(initialUsers);
  const [logs, setLogs] = useState(initialLogs);
  const [master, setMaster] = useState<MasterSection[]>(initialMaster);

  // User modal
  const [userModal, setUserModal] = useState<{ open: boolean; editing: UserEntry | null }>({ open: false, editing: null });
  const [userForm, setUserForm] = useState(emptyUser);

  // Master data modals
  const [masterModal, setMasterModal] = useState<{ sectionIdx: number | null; editIdx: number | null; value: string }>({ sectionIdx: null, editIdx: null, value: "" });
  const [auditDraft, setAuditDraft] = useState({ actor: "all", table: "all", from: "", through: "" });
  const [auditFilters, setAuditFilters] = useState(auditDraft);
  const [auditPage, setAuditPage] = useState(1);

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const addLog = (action: string, detail: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    setLogs((l) => [{ time, user: "Admin", action, detail }, ...l]);
  };

  // ── User modal handlers ──
  const openAdd = () => {
    setUserForm(emptyUser);
    setUserModal({ open: true, editing: null });
  };
  const openEdit = (u: UserEntry) => {
    setUserForm({
      name: u.name, role: u.role, email: u.email, status: u.status,
      company: u.company ?? "", instructor: u.instructor ?? "",
      section: u.section ?? "", academicYear: u.academicYear ?? "",
    });
    setUserModal({ open: true, editing: u });
  };
  const saveUser = () => {
    if (!userForm.name || !userForm.email) { toast("Name and email are required", "error"); return; }
    if (userModal.editing) {
      setUsers((prev) => prev.map((u) => u.id === userModal.editing!.id ? { ...u, ...userForm } : u));
      addLog("User account updated", `${userForm.name} (${userForm.role})`);
      toast(`${userForm.name} updated`);
    } else {
      const id = `U${String(users.length + 1).padStart(3, "0")}`;
      const joined = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      setUsers((prev) => [...prev, { id, ...userForm, joined }]);
      addLog("User account created", `New ${userForm.role.toLowerCase()}: ${userForm.name}`);
      toast(`${userForm.name} added successfully`);
    }
    setUserModal({ open: false, editing: null });
  };
  const deactivate = (u: UserEntry) => {
    const next = u.status === "Active" ? "Inactive" : "Active";
    const action = u.status === "Pending" ? "approved" : next === "Inactive" ? "deactivated" : "reactivated";
    setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, status: next } : x));
    addLog(`User ${action}`, u.name);
    toast(`${u.name} ${action}`);
  };

  // ── Master data handlers ──
  const openMasterAdd = (sectionIdx: number) => setMasterModal({ sectionIdx, editIdx: null, value: "" });
  const openMasterEdit = (sectionIdx: number, editIdx: number) =>
    setMasterModal({ sectionIdx, editIdx, value: master[sectionIdx].items[editIdx] });
  const saveMaster = () => {
    const { sectionIdx, editIdx, value } = masterModal;
    if (sectionIdx === null || !value.trim()) { toast("Value cannot be empty", "error"); return; }
    setMaster((prev) => {
      const next = prev.map((s, i) => {
        if (i !== sectionIdx) return s;
        const items = editIdx !== null
          ? s.items.map((item, j) => (j === editIdx ? value.trim() : item))
          : [...s.items, value.trim()];
        return { ...s, items };
      });
      return next;
    });
    toast(editIdx !== null ? "Entry updated" : "Entry added");
    setMasterModal({ sectionIdx: null, editIdx: null, value: "" });
  };
  const removeMaster = (sectionIdx: number, itemIdx: number) => {
    setMaster((prev) => prev.map((s, i) => i === sectionIdx ? { ...s, items: s.items.filter((_, j) => j !== itemIdx) } : s));
    toast("Entry removed");
  };

  const stats = [
    { label: "Total Users", value: `${users.length}`, sub: `${users.filter(u => u.status === "Active").length} active`, icon: <IconUsers size={18} />, iconBg: "#eff6ff", iconColor: "#2563eb" },
    { label: "Active Interns", value: `${users.filter(u => u.role === "Intern" && u.status === "Active").length}`, sub: "94% placement rate", icon: <IconGradCap size={18} />, iconBg: "#f0fdf4", iconColor: "#16a34a" },
    { label: "Companies", value: `${master[2].items.length}`, sub: "+3 this month", icon: <IconBuilding size={18} />, iconBg: "#fefce8", iconColor: "#d97706" },
    { label: "System Uptime", value: "99.8%", sub: "Last 30 days", icon: <IconCheck size={18} />, iconBg: "#f0fdf4", iconColor: "#16a34a" },
  ];
  const auditTable = (action: string) =>
    action.toLowerCase().includes("attendance") || action.toLowerCase().includes("clock") ? "Attendance"
    : action.toLowerCase().includes("evaluation") ? "Evaluations"
    : action.toLowerCase().includes("user") || action.toLowerCase().includes("account") ? "Accounts"
    : "System";
  const auditRecordDate = "2025-05-20";
  const filteredLogs = logs.filter((log) =>
    (auditFilters.actor === "all" || log.user === auditFilters.actor) &&
    (auditFilters.table === "all" || auditTable(log.action) === auditFilters.table) &&
    (!auditFilters.from || auditRecordDate >= auditFilters.from) &&
    (!auditFilters.through || auditRecordDate <= auditFilters.through)
  );
  const auditPageSize = 4;
  const auditPageCount = Math.max(1, Math.ceil(filteredLogs.length / auditPageSize));
  const pagedLogs = filteredLogs.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize);

  return (
    <>
      <Shell userName="System Admin" userEmail="admin@insync.ph" userRole="Administrator"
        navItems={navItems} activeTab={tab} onTabChange={setTab} onLogout={onLogout}>
        <div className="dashboard-content p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold">{tab === "overview" ? "Hi, Admin!" : navItems.find((n) => n.id === tab)?.label}</h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>Academic Year 2024–2025 · S.Y. Second Semester</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>May 20, 2025</span>
          </div>

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
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
                        style={{ background: roleColors[u.role] ?? "var(--primary)" }}>
                        {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{u.name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{u.email}</div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${roleColors[u.role]}20`, color: roleColors[u.role] }}>{u.role}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                    <span className="text-sm font-semibold">Audit Log — Today</span>
                    <button className="text-xs" style={{ color: "var(--primary)" }} onClick={() => setTab("auditlogs")}>View all →</button>
                  </div>
                  {logs.slice(0, 5).map((l, i) => (
                    <div key={i} className="px-4 py-3 flex gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <span className="font-mono text-xs shrink-0 mt-0.5 w-20" style={{ color: "var(--muted-foreground)" }}>{l.time}</span>
                      <div>
                        <div className="text-xs font-medium">{l.action}</div>
                        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{l.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── ACCOUNTS ── */}
          {tab === "accounts" && (
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <label htmlFor="account-search" className="sr-only">Search accounts by name, role, or email</label>
                <input id="account-search" placeholder="Search by name, role, or email…" value={search} onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border outline-none"
                  style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--foreground)" }} />
                <span className="hidden sm:inline text-xs whitespace-nowrap" style={{ color: "var(--muted-foreground)" }}>{filtered.length} accounts</span>
                <button onClick={openAdd} className="text-sm px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
                  style={{ background: "var(--primary)", color: "#fff" }}>+ Add User</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr style={{ background: "var(--muted)" }}>
                      {["ID", "Name", "Role", "Email", "Status", "Joined", "Actions"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{u.id}</td>
                        <td className="px-4 py-3 font-medium">{u.name}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${roleColors[u.role] ?? "#888"}20`, color: roleColors[u.role] ?? "#888" }}>{u.role}</span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{u.email}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              background: u.status === "Active" ? "var(--success-bg)" : u.status === "Pending" ? "var(--warning-bg)" : "var(--danger-bg)",
                              color: u.status === "Active" ? "var(--success)" : u.status === "Pending" ? "var(--warning)" : "var(--danger)",
                            }}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{u.joined}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            <button className="text-xs" style={{ color: "var(--primary)" }} onClick={() => openEdit(u)}>Edit</button>
                            <button className="text-xs" style={{ color: u.status === "Active" ? "var(--danger)" : "var(--success)" }}
                              onClick={() => deactivate(u)}>
                              {u.status === "Active" ? "Deactivate" : u.status === "Pending" ? "Approve" : "Reactivate"}
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

          {/* ── MASTER DATA ── */}
          {tab === "masterdata" && (
            <div className="grid lg:grid-cols-2 gap-4">
              {master.map((section, si) => (
                <div key={section.title} className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                    <span className="text-sm font-semibold">{section.title}</span>
                    <button onClick={() => openMasterAdd(si)} className="text-xs px-2.5 py-1 rounded-lg"
                      style={{ background: "var(--secondary)", color: "var(--primary)" }}>+ Add</button>
                  </div>
                  {section.items.map((item, ii) => (
                    <div key={ii} className="px-4 py-2.5 flex items-center justify-between text-sm" style={{ borderBottom: "1px solid var(--border)" }}>
                      <span>{item}</span>
                      <div className="flex gap-3">
                        <button className="text-xs" style={{ color: "var(--primary)" }} onClick={() => openMasterEdit(si, ii)}>Edit</button>
                        <button className="text-xs" style={{ color: "var(--danger)" }} onClick={() => removeMaster(si, ii)}>Remove</button>
                      </div>
                    </div>
                  ))}
                  {section.items.length === 0 && (
                    <div className="px-4 py-4 text-xs text-center" style={{ color: "var(--muted-foreground)" }}>No entries yet</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── AUDIT LOGS ── */}
          {tab === "auditlogs" && (
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div>
                  <span className="text-sm font-semibold">System Activity Log</span>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>Dates use Manila day boundaries. Records remain chronologically ordered.</p>
                </div>
                <button onClick={() => toast("Audit data refreshed", "success")}
                  title="Refresh audit data" aria-label="Refresh audit data"
                  className="w-9 h-9 flex items-center justify-center rounded-lg border shrink-0"
                  style={{ borderColor: "var(--border)", color: "var(--primary)" }}>
                  <IconRefresh size={15} />
                </button>
              </div>
              <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3" style={{ background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                <label className="text-xs font-medium">
                  Actor
                  <select value={auditDraft.actor} onChange={(e) => setAuditDraft((f) => ({ ...f, actor: e.target.value }))}
                    className="mt-1 w-full text-sm px-3 py-2 rounded-lg border outline-none" style={inputStyle}>
                    <option value="all">All actors</option>
                    {[...new Set(logs.map((log) => log.user))].map((actor) => <option key={actor}>{actor}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium">
                  Table
                  <select value={auditDraft.table} onChange={(e) => setAuditDraft((f) => ({ ...f, table: e.target.value }))}
                    className="mt-1 w-full text-sm px-3 py-2 rounded-lg border outline-none" style={inputStyle}>
                    <option value="all">All tables</option>
                    {["Accounts", "Attendance", "Evaluations", "System"].map((table) => <option key={table}>{table}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium">
                  From
                  <input type="date" value={auditDraft.from} onChange={(e) => setAuditDraft((f) => ({ ...f, from: e.target.value }))}
                    className="mt-1 w-full text-sm px-3 py-2 rounded-lg border outline-none" style={inputStyle} />
                </label>
                <label className="text-xs font-medium">
                  Through
                  <input type="date" value={auditDraft.through} onChange={(e) => setAuditDraft((f) => ({ ...f, through: e.target.value }))}
                    className="mt-1 w-full text-sm px-3 py-2 rounded-lg border outline-none" style={inputStyle} />
                </label>
                <button onClick={() => { setAuditFilters(auditDraft); setAuditPage(1); toast("Audit filters applied", "info"); }}
                  className="self-end text-sm px-4 py-2 rounded-lg font-semibold" style={{ background: "var(--primary)", color: "#fff" }}>
                  Apply filters
                </button>
              </div>
              {pagedLogs.map((l, i) => (
                <details key={`${l.time}-${i}`} className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <summary className="cursor-pointer list-none flex gap-4 items-start">
                    <span className="font-mono text-xs shrink-0 mt-0.5 w-20" style={{ color: "var(--muted-foreground)" }}>{l.time}</span>
                    <div className="w-28 sm:w-36 shrink-0 text-xs font-medium truncate">{l.user}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{l.action}</div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>{l.detail}</div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>{auditTable(l.action)}</span>
                  </summary>
                  <div className="ml-24 sm:ml-60 mt-2 text-xs p-3 rounded-lg" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                    Recorded change: {l.detail}
                  </div>
                </details>
              ))}
              {filteredLogs.length === 0 && <div className="p-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No audit records match the applied filters.</div>}
              <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {filteredLogs.length === 0 ? "0 available records" : `${(auditPage - 1) * auditPageSize + 1}–${Math.min(auditPage * auditPageSize, filteredLogs.length)} of ${filteredLogs.length} available records`}
                </span>
                <div className="flex items-center gap-2">
                  <button disabled={auditPage === 1} onClick={() => setAuditPage((p) => p - 1)}
                    className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-40" style={{ borderColor: "var(--border)" }}>Previous</button>
                  <span className="text-xs font-medium">Page {auditPage} of {auditPageCount}</span>
                  <button disabled={auditPage === auditPageCount} onClick={() => setAuditPage((p) => p + 1)}
                    className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-40" style={{ borderColor: "var(--border)" }}>Next</button>
                </div>
              </div>
            </div>
          )}

        </div>
      </Shell>

      {/* ── ADD / EDIT USER MODAL ── */}
      {userModal.open && (
        <Modal title={userModal.editing ? "Edit User" : "Add New User"} onClose={() => setUserModal({ open: false, editing: null })}>
          <div className="space-y-4">
            <Field label="Full Name">
              <input value={userForm.name} onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Maria Santos" className={inputCls} style={inputStyle} />
            </Field>
            <Field label="Email Address">
              <input type="email" value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="m.santos@university.edu" className={inputCls} style={inputStyle} />
            </Field>
            <Field label="Role">
              <select value={userForm.role} onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}
                className={inputCls} style={inputStyle}>
                {roles.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={userForm.status} onChange={(e) => setUserForm((f) => ({ ...f, status: e.target.value }))}
                className={inputCls} style={inputStyle}>
                <option>Active</option>
                <option>Pending</option>
                <option>Inactive</option>
              </select>
            </Field>
            {(userForm.role === "Intern" || userForm.role === "Supervisor") && (
              <Field label="Applicable Company">
                <select value={userForm.company} onChange={(e) => setUserForm((f) => ({ ...f, company: e.target.value }))}
                  className={inputCls} style={inputStyle}>
                  <option value="">— Select company —</option>
                  {master[2].items.map((company) => <option key={company}>{company}</option>)}
                </select>
              </Field>
            )}
            {userForm.role === "Intern" && (
              <div className="grid sm:grid-cols-2 gap-3 pt-1">
                <Field label="Assigned Instructor">
                  <select value={userForm.instructor} onChange={(e) => setUserForm((f) => ({ ...f, instructor: e.target.value }))}
                    className={inputCls} style={inputStyle}>
                    <option value="">— Unassigned —</option>
                    {users.filter((user) => user.role === "Instructor" && user.status === "Active").map((user) => <option key={user.id}>{user.name}</option>)}
                  </select>
                </Field>
                <Field label="Section">
                  <select value={userForm.section} onChange={(e) => setUserForm((f) => ({ ...f, section: e.target.value }))}
                    className={inputCls} style={inputStyle}>
                    <option value="">— Unassigned —</option>
                    {master[1].items.map((section) => <option key={section}>{section}</option>)}
                  </select>
                </Field>
                <Field label="Academic Year">
                  <select value={userForm.academicYear} onChange={(e) => setUserForm((f) => ({ ...f, academicYear: e.target.value }))}
                    className={inputCls} style={inputStyle}>
                    <option value="">— Unassigned —</option>
                    {master[0].items.map((year) => <option key={year}>{year}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={saveUser} className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: "var(--primary)", color: "#fff" }}>
                {userModal.editing ? "Save Changes" : "Add User"}
              </button>
              <button onClick={() => setUserModal({ open: false, editing: null })}
                className="px-4 py-2.5 rounded-lg text-sm"
                style={{ background: "var(--secondary)", color: "var(--foreground)" }}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MASTER DATA MODAL ── */}
      {masterModal.sectionIdx !== null && (
        <Modal
          title={masterModal.editIdx !== null ? `Edit ${master[masterModal.sectionIdx!].title} Entry` : `Add to ${master[masterModal.sectionIdx!].title}`}
          onClose={() => setMasterModal({ sectionIdx: null, editIdx: null, value: "" })}
          width="380px"
        >
          <div className="space-y-4">
            <Field label="Value">
              <input value={masterModal.value} onChange={(e) => setMasterModal((m) => ({ ...m, value: e.target.value }))}
                placeholder="Enter value…" className={inputCls} style={inputStyle}
                onKeyDown={(e) => e.key === "Enter" && saveMaster()} autoFocus />
            </Field>
            <div className="flex gap-2">
              <button onClick={saveMaster} className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: "var(--primary)", color: "#fff" }}>
                {masterModal.editIdx !== null ? "Save" : "Add"}
              </button>
              <button onClick={() => setMasterModal({ sectionIdx: null, editIdx: null, value: "" })}
                className="px-4 py-2.5 rounded-lg text-sm"
                style={{ background: "var(--secondary)", color: "var(--foreground)" }}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

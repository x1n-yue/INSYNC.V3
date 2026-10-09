import { useState } from "react";
import Shell from "./Shell";
import { useToast } from "./Toast";
import {
  IconGrid, IconClock, IconFileText, IconMessageSquare, IconBarChart,
  IconGradCap, IconCheck, IconAlertTriangle, IconCalendar,
} from "./Icons";

const navItems = [
  { id: "overview", label: "Overview", icon: <IconGrid size={15} /> },
  { id: "attendance", label: "Attendance", icon: <IconClock size={15} /> },
  { id: "evaluate", label: "Evaluations", icon: <IconFileText size={15} /> },
  { id: "feedback", label: "Feedback", icon: <IconMessageSquare size={15} /> },
  { id: "hours", label: "Hours Summary", icon: <IconBarChart size={15} /> },
];

type InternEntry = { id: string; name: string; section: string; hours: number; required: number; status: string; lastIn: string };

const initialInterns: InternEntry[] = [
  { id: "I001", name: "Maria Santos", section: "BSIT 4A", hours: 312, required: 486, status: "On Track", lastIn: "08:47 AM" },
  { id: "I002", name: "James Reyes", section: "BSIT 4A", hours: 198, required: 486, status: "Behind", lastIn: "Absent" },
  { id: "I003", name: "Sofia Mendoza", section: "BSCS 4B", hours: 402, required: 486, status: "On Track", lastIn: "08:52 AM" },
  { id: "I004", name: "Kevin Dizon", section: "BSIT 4B", hours: 456, required: 486, status: "Near Complete", lastIn: "08:31 AM" },
  { id: "I005", name: "Leah Castillo", section: "BSCS 4A", hours: 88, required: 486, status: "Behind", lastIn: "09:15 AM" },
];

const pending = [
  { name: "Maria Santos", action: "Clock-in", time: "08:47 AM", date: "May 20, 2025" },
  { name: "Sofia Mendoza", action: "Clock-in", time: "08:52 AM", date: "May 20, 2025" },
  { name: "Kevin Dizon", action: "Clock-in", time: "08:31 AM", date: "May 20, 2025" },
];

const competencies = ["Punctuality", "Technical Skills", "Professionalism", "Initiative", "Communication", "Teamwork"];

type FeedbackEntry = { intern: string; type: string; notes: string; date: string };
type EvalStatus = { midterm: number | null; final: number | null };

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  const color = pct > 80 ? "var(--success)" : pct > 50 ? "var(--primary)" : "var(--warning)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--secondary)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-xs w-8 text-right" style={{ color: "var(--muted-foreground)" }}>{pct}%</span>
    </div>
  );
}

export default function SupervisorDashboard({ onLogout }: { onLogout: () => void }) {
  const { toast } = useToast();
  const [tab, setTab] = useState("overview");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [evalIntern, setEvalIntern] = useState("Maria Santos");
  const [evalType, setEvalType] = useState<"midterm" | "final">("midterm");
  const [approvedList, setApprovedList] = useState<string[]>([]);
  const [flaggedList, setFlaggedList] = useState<string[]>([]);
  const [evalStatuses, setEvalStatuses] = useState<Record<string, EvalStatus>>(
    Object.fromEntries(initialInterns.map((i) => [i.name, { midterm: null, final: null }]))
  );
  const [feedbackList, setFeedbackList] = useState<FeedbackEntry[]>([]);
  const [feedbackIntern, setFeedbackIntern] = useState(initialInterns[0].name);
  const [feedbackType, setFeedbackType] = useState("Constructive Feedback");
  const [feedbackNotes, setFeedbackNotes] = useState("");

  const avgRating = Object.values(ratings).length > 0
    ? (Object.values(ratings).reduce((a, b) => a + b, 0) / Object.values(ratings).length).toFixed(1)
    : "—";

  const submitEval = () => {
    if (Object.keys(ratings).length < competencies.length) {
      toast("Please rate all competencies before submitting", "error");
      return;
    }
    const score = parseFloat(avgRating);
    setEvalStatuses((prev) => ({
      ...prev,
      [evalIntern]: { ...prev[evalIntern], [evalType]: score },
    }));
    toast(`${evalType === "midterm" ? "Midterm" : "Final"} evaluation for ${evalIntern} submitted (avg ${avgRating})`);
    setRatings({});
  };

  const submitFeedback = () => {
    if (!feedbackNotes.trim()) { toast("Please add notes before submitting", "error"); return; }
    const entry: FeedbackEntry = {
      intern: feedbackIntern,
      type: feedbackType,
      notes: feedbackNotes.trim(),
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
    setFeedbackList((prev) => [entry, ...prev]);
    setFeedbackNotes("");
    toast(`Feedback submitted for ${feedbackIntern}`);
  };

  const statCards = [
    { label: "Interns Assigned", value: `${initialInterns.length}`, icon: <IconGradCap size={18} />, iconBg: "#eff6ff", iconColor: "#2563eb" },
    { label: "Present Today", value: `${approvedList.length + 1}`, icon: <IconCheck size={18} />, iconBg: "#f0fdf4", iconColor: "#16a34a" },
    { label: "Pending Approvals", value: `${pending.filter((p) => !approvedList.includes(p.name) && !flaggedList.includes(p.name)).length}`, icon: <IconCalendar size={18} />, iconBg: "#fefce8", iconColor: "#d97706" },
    { label: "Evals Due", value: `${initialInterns.filter((i) => !evalStatuses[i.name]?.midterm).length}`, icon: <IconAlertTriangle size={18} />, iconBg: "#fff1f2", iconColor: "#dc2626" },
  ];

  return (
    <Shell userName="Andrea Lim" userEmail="supervisor@techcorp.ph" userRole="Supervisor"
      navItems={navItems} activeTab={tab} onTabChange={setTab} onLogout={onLogout}>
      <div className="p-6 max-w-6xl mx-auto space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">{tab === "overview" ? "Hi, Andrea!" : navItems.find((n) => n.id === tab)?.label}</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>TechCorp Manila · {initialInterns.length} Assigned Interns</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>May 20, 2025</span>
        </div>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((s) => (
                <div key={s.label} className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: s.iconBg, color: s.iconColor }}>{s.icon}</div>
                  <div className="text-2xl font-bold mb-0.5">{s.value}</div>
                  <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-sm font-semibold">Pending Attendance Approvals</span>
              </div>
              {pending.map((p) => {
                const approved = approvedList.includes(p.name);
                const flagged = flaggedList.includes(p.name);
                return (
                  <div key={p.name} className="px-4 py-3 flex items-center gap-4" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{p.action} · {p.time} · {p.date}</div>
                    </div>
                    {approved && <span className="text-xs px-2 py-1 rounded-full" style={{ background: "var(--success-bg)", color: "var(--success)" }}>Approved</span>}
                    {flagged && <span className="text-xs px-2 py-1 rounded-full" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>Flagged</span>}
                    {!approved && !flagged && (
                      <div className="flex gap-2">
                        <button className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: "var(--primary)", color: "#fff" }}
                          onClick={() => { setApprovedList((l) => [...l, p.name]); toast(`${p.name} attendance approved`); }}>
                          Approve
                        </button>
                        <button className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                          onClick={() => { setFlaggedList((l) => [...l, p.name]); toast(`${p.name} attendance flagged`, "info"); }}>
                          Flag
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-sm font-semibold">Intern Roster</span>
              </div>
              {initialInterns.map((intern) => (
                <div key={intern.id} className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium">{intern.name}</span>
                      <span className="text-xs ml-2" style={{ color: "var(--muted-foreground)" }}>{intern.section}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>Last in: {intern.lastIn}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: intern.status === "On Track" ? "var(--success-bg)" : intern.status === "Near Complete" ? "var(--info-bg)" : "var(--warning-bg)",
                          color: intern.status === "On Track" ? "var(--success)" : intern.status === "Near Complete" ? "var(--info)" : "var(--warning)",
                        }}
                      >{intern.status}</span>
                    </div>
                  </div>
                  <ProgressBar value={intern.hours} max={intern.required} />
                  <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{intern.hours} / {intern.required} hours</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── ATTENDANCE ── */}
        {tab === "attendance" && (
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-sm font-semibold">Attendance Log — May 2025</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--muted)" }}>
                  {["Intern", "Date", "Clock In", "Clock Out", "Hours", "Status"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "Maria Santos", date: "May 20", cin: "08:47 AM", cout: "—", hrs: "—", status: "Present" },
                  { name: "Sofia Mendoza", date: "May 20", cin: "08:52 AM", cout: "—", hrs: "—", status: "Present" },
                  { name: "Kevin Dizon", date: "May 20", cin: "08:31 AM", cout: "—", hrs: "—", status: "Present" },
                  { name: "James Reyes", date: "May 20", cin: "—", cout: "—", hrs: "—", status: "Absent" },
                  { name: "Maria Santos", date: "May 19", cin: "08:55 AM", cout: "05:02 PM", hrs: "8.1", status: "Verified" },
                  { name: "Sofia Mendoza", date: "May 19", cin: "09:01 AM", cout: "05:00 PM", hrs: "8.0", status: "Verified" },
                ].map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.date}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.cin}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.cout}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.hrs}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: r.status === "Verified" ? "var(--success-bg)" : r.status === "Present" ? "var(--info-bg)" : "var(--danger-bg)",
                          color: r.status === "Verified" ? "var(--success)" : r.status === "Present" ? "var(--info)" : "var(--danger)",
                        }}
                      >{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── EVALUATIONS ── */}
        {tab === "evaluate" && (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold mb-3">Performance Evaluation</h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "var(--muted-foreground)" }}>Intern</label>
                  <select value={evalIntern} onChange={(e) => { setEvalIntern(e.target.value); setRatings({}); }}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--foreground)" }}>
                    {initialInterns.map((i) => <option key={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "var(--muted-foreground)" }}>Type</label>
                  <select value={evalType} onChange={(e) => { setEvalType(e.target.value as "midterm" | "final"); setRatings({}); }}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--foreground)" }}>
                    <option value="midterm">Midterm</option>
                    <option value="final">Final</option>
                  </select>
                </div>
              </div>
              <div className="space-y-4">
                {competencies.map((comp) => (
                  <div key={comp}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm">{comp}</span>
                      <span className="font-mono text-xs font-semibold" style={{ color: "var(--primary)" }}>{ratings[comp] ?? "—"} / 5</span>
                    </div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => setRatings((r) => ({ ...r, [comp]: n }))}
                          className="w-8 h-8 rounded-lg text-xs font-semibold transition-all"
                          style={{
                            background: (ratings[comp] ?? 0) >= n ? "var(--primary)" : "var(--secondary)",
                            color: (ratings[comp] ?? 0) >= n ? "#fff" : "var(--muted-foreground)",
                          }}>{n}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--border)" }}>
                <div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Average Score</div>
                  <div className="text-2xl font-bold" style={{ color: "var(--primary)" }}>{avgRating}</div>
                </div>
                <button onClick={submitEval} className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--primary)", color: "#fff" }}>Submit Evaluation</button>
              </div>
            </div>

            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold mb-3">Evaluation Status</h3>
              {initialInterns.map((intern) => {
                const es = evalStatuses[intern.name];
                return (
                  <div key={intern.id} className="flex items-center justify-between py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
                    <span className="text-sm">{intern.name}</span>
                    <div className="flex gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={es?.midterm ? { background: "var(--success-bg)", color: "var(--success)" } : { background: "var(--warning-bg)", color: "var(--warning)" }}>
                        Midterm {es?.midterm ? `✓ ${es.midterm.toFixed(1)}` : "Pending"}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={es?.final ? { background: "var(--success-bg)", color: "var(--success)" } : { background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                        Final {es?.final ? `✓ ${es.final.toFixed(1)}` : "Pending"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── FEEDBACK ── */}
        {tab === "feedback" && (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold mb-4">Add Feedback / Incident Report</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Intern</label>
                  <select value={feedbackIntern} onChange={(e) => setFeedbackIntern(e.target.value)}
                    className="w-full text-sm px-3 py-2.5 rounded-lg border outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--foreground)" }}>
                    {initialInterns.map((i) => <option key={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Type</label>
                  <select value={feedbackType} onChange={(e) => setFeedbackType(e.target.value)}
                    className="w-full text-sm px-3 py-2.5 rounded-lg border outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--foreground)" }}>
                    <option>Constructive Feedback</option>
                    <option>Commendation</option>
                    <option>Attendance Issue</option>
                    <option>Conduct Incident</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Notes</label>
                  <textarea rows={4} value={feedbackNotes} onChange={(e) => setFeedbackNotes(e.target.value)}
                    placeholder="Add your feedback here…"
                    className="w-full text-sm px-3 py-2.5 rounded-lg border resize-none outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--foreground)" }} />
                </div>
                <button onClick={submitFeedback} className="px-4 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: "var(--primary)", color: "#fff" }}>Submit Feedback</button>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-sm font-semibold">Submitted Feedback</span>
              </div>
              {feedbackList.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                  No feedback submitted yet
                </div>
              ) : (
                feedbackList.map((f, i) => (
                  <div key={i} className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{f.intern}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: f.type === "Commendation" ? "var(--success-bg)" : f.type.includes("Issue") || f.type.includes("Incident") ? "var(--warning-bg)" : "var(--info-bg)",
                          color: f.type === "Commendation" ? "var(--success)" : f.type.includes("Issue") || f.type.includes("Incident") ? "var(--warning)" : "var(--info)" }}>
                        {f.type}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{f.notes}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)", opacity: 0.6 }}>{f.date}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── HOURS ── */}
        {tab === "hours" && (
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-sm font-semibold">Hours Summary</span>
            </div>
            {initialInterns.map((intern) => (
              <div key={intern.id} className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-medium">{intern.name}</span>
                    <span className="text-xs ml-2 font-mono" style={{ color: "var(--muted-foreground)" }}>{intern.section}</span>
                  </div>
                  <span className="font-mono text-sm font-semibold">
                    {intern.hours} <span className="text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>/ {intern.required} hrs</span>
                  </span>
                </div>
                <ProgressBar value={intern.hours} max={intern.required} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

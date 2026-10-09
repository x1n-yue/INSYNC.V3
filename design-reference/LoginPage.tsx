import { useState } from "react";
import type { Role } from "../App";
import {
  IconGradCap,
  IconEye,
  IconEyeOff,
  IconMail,
  IconLock,
  IconUser,
  IconBuilding,
  IconCheck,
} from "./Icons";

interface Props {
  onLogin: (role: Role) => void;
}

const demoAccounts: { role: Role; label: string; email: string }[] = [
  { role: "admin", label: "Admin", email: "admin@insync.ph" },
  { role: "instructor", label: "Instructor", email: "instructor@bsu.edu.ph" },
  { role: "intern", label: "Intern", email: "andrea@intern.ph" },
];

const roleOptions: { value: Role; label: string; desc: string }[] = [
  { value: "intern", label: "Intern / Student", desc: "Track hours & evaluations" },
  { value: "instructor", label: "Academic Instructor", desc: "Monitor class progress" },
  { value: "admin", label: "System Administrator", desc: "Manage platform, users & settings" },
];

function InputField({
  label,
  type,
  value,
  onChange,
  placeholder,
  icon,
  rightEl,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  rightEl?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
        {label} <span aria-hidden="true" style={{ color: "var(--danger)" }}>*</span>
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted-foreground)" }}>
            {icon}
          </span>
        )}
        <input
          required
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full py-2.5 text-sm rounded-lg border outline-none transition-all"
          style={{
            paddingLeft: icon ? "36px" : "12px",
            paddingRight: rightEl ? "40px" : "12px",
            borderColor: "var(--border)",
            background: "var(--card)",
            color: "var(--foreground)",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        />
        {rightEl && <span className="absolute right-3 top-1/2 -translate-y-1/2">{rightEl}</span>}
      </div>
    </div>
  );
}

export default function LoginPage({ onLogin }: Props) {
  const [activeTab, setActiveTab] = useState<"signin" | "register">("signin");

  // Sign in
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>(null);

  // Register
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regRole, setRegRole] = useState<Role>("intern");
  const [regOrg, setRegOrg] = useState("");
  const [regId, setRegId] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  const passwordMatch = regPassword === regConfirm && regConfirm.length > 0;
  const regValid = regName && regEmail && regPassword.length >= 8 && passwordMatch && regRole;

  const fillDemo = (role: Role, demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("password123");
    setSelectedRole(role);
  };

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    const match = demoAccounts.find((d) => d.email === email);
    onLogin(match?.role ?? selectedRole ?? "intern");
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regValid) return;
    setRegSuccess(true);
  };

  const eyeBtn = (show: boolean, toggle: () => void) => (
    <button type="button" onClick={toggle} aria-label={show ? "Hide password" : "Show password"} className="transition-opacity hover:opacity-70" style={{ color: "var(--muted-foreground)" }}>
      {show ? <IconEyeOff size={15} /> : <IconEye size={15} />}
    </button>
  );

  return (
    <div className="login-page min-h-screen flex flex-col items-center justify-center px-4 py-10" style={{ background: "var(--background)" }}>
      <div className="w-full max-w-md rounded-2xl shadow-xl shadow-blue-950/5 overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>

        {/* Logo */}
        <div className="flex flex-col items-center pt-8 pb-5 px-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--primary)" }}>
            <IconGradCap size={26} style={{ color: "#fff" }} strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--foreground)" }}>INSync</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>Internship Performance Monitoring System</p>
        </div>

        {/* Tabs */}
        <div className="flex mx-8" style={{ borderBottom: "1px solid var(--border)" }}>
          {(["signin", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setActiveTab(t); setRegSuccess(false); }}
              className="flex-1 py-3 text-sm font-medium transition-colors"
              style={{
                color: activeTab === t ? "var(--primary)" : "var(--muted-foreground)",
                borderBottom: activeTab === t ? `2px solid var(--primary)` : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {t === "signin" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>

        {/* ── SIGN IN ── */}
        {activeTab === "signin" && (
          <form onSubmit={handleSignIn} className="px-8 pt-6 pb-8 space-y-4">
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
              Use your approved institutional account to continue.
            </p>
            <InputField label="Email Address" type="email" value={email} onChange={setEmail}
              placeholder="andrea@intern.ph" icon={<IconMail size={15} />} />
            <InputField label="Password" type={showPassword ? "text" : "password"} value={password} onChange={setPassword}
              placeholder="••••••••••" icon={<IconLock size={15} />}
              rightEl={eyeBtn(showPassword, () => setShowPassword(!showPassword))} />

            <button type="submit" className="w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--primary)", color: "#fff" }}>
              Sign In
            </button>

            <div>
              <p className="text-xs text-center mb-3" style={{ color: "var(--muted-foreground)" }}>
                Demo accounts — click to auto-fill:
              </p>
              <div className="grid grid-cols-3 gap-2">
                {demoAccounts.map((d) => (
                  <button key={d.role} type="button" onClick={() => fillDemo(d.role, d.email)}
                    className="text-left px-3 py-2.5 rounded-lg border transition-all"
                    style={{
                      borderColor: selectedRole === d.role ? "var(--primary)" : "var(--border)",
                      background: selectedRole === d.role ? "var(--primary-light)" : "var(--muted)",
                    }}>
                    <div className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{d.label}</div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>{d.email}</div>
                  </button>
                ))}
              </div>
            </div>
          </form>
        )}

        {/* ── REGISTER ── */}
        {activeTab === "register" && !regSuccess && (
          <form onSubmit={handleRegister} className="px-8 pt-6 pb-8 space-y-4">
            <InputField label="Full Name" type="text" value={regName} onChange={setRegName}
              placeholder="Maria Santos" icon={<IconUser size={15} />} />
            <InputField label="Email Address" type="email" value={regEmail} onChange={setRegEmail}
              placeholder="you@institution.edu" icon={<IconMail size={15} />} />

            {/* Role selector */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--foreground)" }}>Role</label>
              <div className="grid grid-cols-1 gap-2">
                {roleOptions.map((r) => (
                  <button key={r.value} type="button" onClick={() => setRegRole(r.value)}
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-left transition-all"
                    style={{
                      borderColor: regRole === r.value ? "var(--primary)" : "var(--border)",
                      background: regRole === r.value ? "var(--primary-light)" : "var(--muted)",
                    }}>
                    <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                      style={{
                        borderColor: regRole === r.value ? "var(--primary)" : "var(--border)",
                        background: regRole === r.value ? "var(--primary)" : "transparent",
                      }}>
                      {regRole === r.value && <IconCheck size={9} style={{ color: "#fff" }} strokeWidth={3} />}
                    </div>
                    <div>
                      <div className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{r.label}</div>
                      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{r.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <InputField
              label={regRole === "intern" ? "University / School" : "Institution"}
              type="text" value={regOrg} onChange={setRegOrg}
              placeholder="Polytechnic College of La Union"
              icon={<IconBuilding size={15} />} />

            {regRole === "intern" && (
              <InputField label="Student ID" type="text" value={regId} onChange={setRegId}
                placeholder="1201010-I" icon={<IconUser size={15} />} />
            )}

            <InputField label="Password" type={showRegPassword ? "text" : "password"} value={regPassword} onChange={setRegPassword}
              placeholder="Min. 8 characters" icon={<IconLock size={15} />}
              rightEl={eyeBtn(showRegPassword, () => setShowRegPassword(!showRegPassword))} />

            <div>
              <InputField label="Confirm Password" type={showRegConfirm ? "text" : "password"} value={regConfirm} onChange={setRegConfirm}
                placeholder="Re-enter password" icon={<IconLock size={15} />}
                rightEl={eyeBtn(showRegConfirm, () => setShowRegConfirm(!showRegConfirm))} />
              {regConfirm.length > 0 && !passwordMatch && (
                <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>Passwords do not match</p>
              )}
              {passwordMatch && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--success)" }}>
                  <IconCheck size={12} strokeWidth={2.5} /> Passwords match
                </p>
              )}
            </div>

            <button type="submit" disabled={!regValid}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--primary)", color: "#fff" }}>
              Create Account
            </button>

            <p className="text-xs text-center" style={{ color: "var(--muted-foreground)" }}>
              By registering, your account will be reviewed and activated by an administrator.
            </p>
          </form>
        )}

        {/* ── REGISTER SUCCESS ── */}
        {activeTab === "register" && regSuccess && (
          <div className="px-8 pt-6 pb-8 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--success-bg)" }}>
              <IconCheck size={22} style={{ color: "var(--success)" }} strokeWidth={2.5} />
            </div>
            <h3 className="text-base font-semibold mb-1">Account Request Submitted</h3>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full mb-3" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
              Pending approval
            </span>
            <p className="text-sm mb-1" style={{ color: "var(--muted-foreground)" }}>
              Welcome, <span className="font-medium" style={{ color: "var(--foreground)" }}>{regName}</span>!
            </p>
            <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
              Your registration request was recorded as{" "}
              <span className="font-medium" style={{ color: "var(--primary)" }}>
                {roleOptions.find((r) => r.value === regRole)?.label}
              </span>
              . An administrator will review and activate it before you can sign in.
            </p>
            <button onClick={() => { setActiveTab("signin"); setEmail(regEmail); setRegSuccess(false); }}
              className="w-full py-2.5 rounded-lg text-sm font-semibold"
              style={{ background: "var(--primary)", color: "#fff" }}>
              Go to Sign In
            </button>
          </div>
        )}
      </div>

      <p className="text-xs mt-6" style={{ color: "var(--muted-foreground)" }}>
        © 2026 INSync. For authorized users only.
      </p>
    </div>
  );
}

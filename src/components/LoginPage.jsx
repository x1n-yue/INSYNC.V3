import { useId, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { withTimeout } from "../lib/requests";
import { requestAccountEmail } from "../lib/accountRecovery";
import {
  IconGradCap,
  IconEye,
  IconEyeOff,
  IconMail,
  IconLock,
  IconUser,
  IconBuilding,
  IconCheck,
  IconAlertTriangle,
} from "./Icons";

const demoEnabled = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true";
const demoAccounts = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true" ? [
  { label: "Admin", email: "admin@insync.ph" },
  { label: "Instructor", email: "instructor@bsu.edu.ph" },
  { label: "Intern", email: "andrea@intern.ph" },
] : [];

const roleOptions = [
  { value: "intern", label: "Intern / Student", desc: "Track hours & evaluations" },
];

function InputField({ label, type, value, onChange, placeholder, icon, rightEl, autoComplete, invalid, describedBy, required = false }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--muted-foreground)" }}
          >
            {icon}
          </span>
        )}
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          aria-required={required || undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full py-2.5 text-sm rounded-lg border outline-none transition-all"
          style={{
            paddingLeft: icon ? "36px" : "12px",
            paddingRight: rightEl ? "56px" : "12px",
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

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState("signin");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [emailNotice, setEmailNotice] = useState("");
  const emailRequest = useRef({ busy: false, next: 0 });
  const sendAccountEmail = async kind => {
    if (emailRequest.current.busy || submitting) return;
    if (Date.now() < emailRequest.current.next) { setErrorMsg("Wait one minute before requesting another email."); return; }
    emailRequest.current = { busy: true, next: Date.now() + 60000 }; setSubmitting(true); setErrorMsg(""); setEmailNotice("");
    try { setEmailNotice(await requestAccountEmail(supabase, kind, email)); }
    catch (error) { setErrorMsg(error.message); }
    finally { emailRequest.current.busy = false; setSubmitting(false); }
  };

  // Sign in state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Register state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regRole, setRegRole] = useState("intern");
  const [regOrg, setRegOrg] = useState("");
  const [regId, setRegId] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  const passwordMatch = regPassword === regConfirm && regConfirm.length > 0;
  const regValid = regName.trim() && regEmail.trim() && regPassword.length >= 8 && passwordMatch && regRole && (regRole !== "intern" || regId.trim());

  const fillDemo = (demoEmail) => {
    if (import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true") {
      setEmail(demoEmail);
      setPassword("password123");
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSubmitting(true);
    try {
      const { error } = await withTimeout(supabase.auth.signInWithPassword({ email: email.trim(), password }), "Sign in timed out. Check your connection and retry.");
      if (error) setErrorMsg(error.message);
      // On success, App.jsx observes the new session and loads the authorized profile.
    } catch (error) {
      setErrorMsg(error?.message || "Sign in failed. Check your connection and retry.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regValid) return;
    setErrorMsg("");
    setSubmitting(true);
    try {
      const { data, error } = await withTimeout(supabase.auth.signUp({
        email: regEmail.trim(),
        password: regPassword,
        options: {
          data: {
            full_name: regName.trim(),
            requested_role: regRole,
            organization: regOrg.trim(),
            student_id: regRole === "intern" ? regId.trim() : null,
          },
        },
      }), "Registration timed out. Check your email or try signing in before submitting another registration.");
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      if (!data?.user) {
        setErrorMsg("Registration did not return a user record. No account request was confirmed; retry or contact an administrator.");
        return;
      }
      setRegSuccess(true);
    } catch (error) {
      setErrorMsg(error?.message || "Registration failed. Check your connection and retry.");
    } finally {
      setSubmitting(false);
    }
  };

  const eyeBtn = (show, toggle) => (
    <button
      type="button"
      aria-label={show ? "Hide password" : "Show password"}
      onClick={toggle}
      className="icon-button flex items-center justify-center transition-opacity hover:opacity-70"
      style={{ color: "var(--muted-foreground)" }}
    >
      {show ? <IconEyeOff size={15} /> : <IconEye size={15} />}
    </button>
  );

  return (
    <main className="auth-screen min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ background: "var(--background)" }}>
      <div className="ui-card auth-card w-full max-w-md rounded-2xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        {/* Logo + title */}
        <div className="flex flex-col items-center pt-8 pb-5 px-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--primary)" }}>
            <IconGradCap size={26} style={{ color: "#fff" }} strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--foreground)" }}>
            INSync
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Internship Performance Monitoring System
          </p>
        </div>

        {/* Tabs */}
        <div className="auth-tabs flex mx-8" style={{ borderBottom: "1px solid var(--border)" }}>
          {["signin", "register"].map((t) => (
            <button
              key={t}
              aria-pressed={activeTab === t}
              onClick={() => {
                setActiveTab(t);
                setRegSuccess(false);
                setErrorMsg("");
              }}
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
            <InputField
              label="Email Address"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              icon={<IconMail size={15} />}
            />
            <InputField
              label="Password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={setPassword}
              placeholder="••••••••••"
              icon={<IconLock size={15} />}
              rightEl={eyeBtn(showPassword, () => setShowPassword(!showPassword))}
            />

            {errorMsg && (
              <div role="alert"
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
              >
                <IconAlertTriangle size={13} strokeWidth={2} />
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              {submitting ? "Signing in…" : "Sign In"}
            </button>

            <div className="flex flex-wrap gap-4 text-sm">
              <button type="button" disabled={submitting || !email.trim()} onClick={() => sendAccountEmail("reset")} className="underline">Forgot password?</button>
              <button type="button" disabled={submitting || !email.trim()} onClick={() => sendAccountEmail("confirm")} className="underline">Resend confirmation</button>
            </div>
            <p className="text-xs">Enter your email above to request a recovery or confirmation link.</p>
            {emailNotice && <p role="status" className="text-sm">{emailNotice}</p>}
            {demoEnabled && <div>
              <p className="text-xs text-center mb-2.5" style={{ color: "var(--muted-foreground)" }}>
                Disposable demo project only. Staff roles require trusted Admin approval.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {demoAccounts.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => fillDemo(d.email)}
                    className="px-2.5 py-2 rounded-lg border text-left transition-all hover:opacity-80"
                    style={{ borderColor: "var(--border)", background: "var(--muted)" }}
                  >
                    <div className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                      {d.label}
                    </div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>
                      {d.email}
                    </div>
                  </button>
                ))}
              </div>
            </div>}
          </form>
        )}

        {/* ── REGISTER ── */}
        {activeTab === "register" && !regSuccess && (
          <form onSubmit={handleRegister} className="px-8 pt-6 pb-8 space-y-4">
            <InputField
              label="Full Name"
              type="text"
              autoComplete="name"
              required
              value={regName}
              onChange={setRegName}
              placeholder="Maria Santos"
              icon={<IconUser size={15} />}
            />

            <InputField
              label="Email Address"
              type="email"
              autoComplete="email"
              required
              value={regEmail}
              onChange={setRegEmail}
              placeholder="you@institution.edu"
              icon={<IconMail size={15} />}
            />

            {/* Role selector */}
            <div>
              <p id="registration-role-label" className="block text-sm font-medium mb-1.5" style={{ color: "var(--foreground)" }}>
                Account request
              </p>
              <div role="group" aria-labelledby="registration-role-label" className="grid grid-cols-1 gap-2">
                {roleOptions.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    aria-pressed={regRole === r.value}
                    onClick={() => setRegRole(r.value)}
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-left transition-all"
                    style={{
                      borderColor: regRole === r.value ? "var(--primary)" : "var(--border)",
                      background: regRole === r.value ? "var(--primary-light)" : "var(--muted)",
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                      style={{
                        borderColor: regRole === r.value ? "var(--primary)" : "var(--border)",
                        background: regRole === r.value ? "var(--primary)" : "transparent",
                      }}
                    >
                      {regRole === r.value && <IconCheck size={9} style={{ color: "#fff" }} strokeWidth={3} />}
                    </div>
                    <div>
                      <div className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                        {r.label}
                      </div>
                      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {r.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Org / ID */}
            <InputField
              label={regRole === "intern" ? "University / School" : "Institution"}
              type="text"
              value={regOrg}
              onChange={setRegOrg}
              placeholder="Polytechnic College of La Union"
              icon={<IconBuilding size={15} />}
            />

            {regRole === "intern" && (
              <InputField
                label="Student ID"
                type="text"
                required
                value={regId}
                onChange={setRegId}
                placeholder="1201010-I"
                icon={<IconUser size={15} />}
              />
            )}

            <InputField
              label="Password"
              type={showRegPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={regPassword}
              onChange={setRegPassword}
              placeholder="Min. 8 characters"
              icon={<IconLock size={15} />}
              rightEl={eyeBtn(showRegPassword, () => setShowRegPassword(!showRegPassword))}
            />

            <div>
              <InputField
                label="Confirm Password"
                type={showRegConfirm ? "text" : "password"}
                autoComplete="new-password"
                required
                invalid={regConfirm.length > 0 && !passwordMatch}
                describedBy={regConfirm.length > 0 && !passwordMatch ? "password-match-error" : undefined}
                value={regConfirm}
                onChange={setRegConfirm}
                placeholder="Re-enter password"
                icon={<IconLock size={15} />}
                rightEl={eyeBtn(showRegConfirm, () => setShowRegConfirm(!showRegConfirm))}
              />
              {regConfirm.length > 0 && !passwordMatch && (
                <p id="password-match-error" role="alert" className="text-xs mt-1" style={{ color: "var(--danger)" }}>
                  Passwords do not match
                </p>
              )}
              {passwordMatch && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--success)" }}>
                  <IconCheck size={12} strokeWidth={2.5} /> Passwords match
                </p>
              )}
            </div>

            {errorMsg && (
              <div role="alert"
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
              >
                <IconAlertTriangle size={13} strokeWidth={2} />
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={!regValid || submitting}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              {submitting ? "Creating account…" : "Create Account"}
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
            <p className="text-sm mb-1" style={{ color: "var(--muted-foreground)" }}>
              Welcome, <span className="font-medium" style={{ color: "var(--foreground)" }}>{regName}</span>!
            </p>
            <p className="text-sm mb-2" style={{ color: "var(--muted-foreground)" }}>
              Your account request is for{" "}
              <span className="font-medium" style={{ color: "var(--primary)" }}>
                {roleOptions.find((r) => r.value === regRole)?.label}
              </span>
              . An administrator must approve effective role and access. Contact your administrator for a staff-role request.
            </p>
            <button
              onClick={() => {
                setActiveTab("signin");
                setEmail(regEmail);
                setRegSuccess(false);
              }}
              className="w-full py-2.5 rounded-lg text-sm font-semibold"
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              Go to Sign In
            </button>
          </div>
        )}
      </div>

      <p className="text-xs mt-6" style={{ color: "var(--muted-foreground)" }}>
        © 2026 INSync. For authorized users only.
      </p>
    </main>
  );
}

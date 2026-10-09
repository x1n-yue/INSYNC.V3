import { useId, useRef, useState } from "react";
import { withTimeout } from "../lib/requests";
import { supabase } from "../lib/supabaseClient";

export default function RecoverPassword({ session, onDone, linkError }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const id = useId();
  const submit = async event => {
    event.preventDefault();
    if (inFlight.current || !session?.user?.id || password.length < 8 || password !== confirm) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await withTimeout(supabase.auth.updateUser({ password }), "Password update timed out. Try signing in with the new password before retrying.");
      if (result.error || result.data?.user?.id !== session.user.id) throw new Error("The password could not be updated. Request a new recovery link and retry.");
      setPassword(""); setConfirm(""); setSaved(true);
    } catch (failure) { setError(failure.message || "Password update failed; request a new link."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <main className="auth-screen min-h-screen flex items-center justify-center p-4"><section className="ui-card auth-card w-full max-w-md space-y-4 rounded-xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
    <h1 className="text-lg font-semibold">Set a new password</h1>
    {saved ? <p role="status">Your password has been updated.</p> : !session || linkError ? <p role="alert">This recovery link is invalid, expired, or unavailable. Return to sign in and request a new link.</p> : <form onSubmit={submit} className="space-y-4">
      <div><label className="block text-sm font-medium mb-1.5" htmlFor={`${id}-password`}>New password</label><input id={`${id}-password`} autoComplete="new-password" required minLength={8} type="password" disabled={busy} value={password} onChange={event => setPassword(event.target.value)} className="w-full border rounded p-2" /></div>
      <div><label className="block text-sm font-medium mb-1.5" htmlFor={`${id}-confirm`}>Confirm new password</label><input id={`${id}-confirm`} aria-invalid={Boolean(confirm && password !== confirm)} aria-describedby={confirm && password !== confirm ? `${id}-match-error` : undefined} autoComplete="new-password" required minLength={8} type="password" disabled={busy} value={confirm} onChange={event => setConfirm(event.target.value)} className="w-full border rounded p-2" /></div>
      {confirm && password !== confirm && <p id={`${id}-match-error`} role="alert" className="text-sm" style={{ color: "var(--danger)" }}>Passwords do not match.</p>}
      {error && <p role="alert">{error}</p>}
      <button disabled={busy || password.length < 8 || password !== confirm} className="rounded px-4 py-2" style={{ background: "var(--primary)", color: "white" }}>{busy ? "Updating password…" : "Update password"}</button>
    </form>}
    <button disabled={busy} onClick={onDone} className="underline">{saved ? "Continue" : "Return to sign in"}</button>
  </section></main>;
}

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { supabase, setupError } from "./lib/supabaseClient";
import LoginPage from "./components/LoginPage";
import { withTimeout } from "./lib/requests";
import RecoverPassword from "./components/RecoverPassword";
import { clearUnsentAnnouncementDrafts } from "./lib/announcementDraft";

const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const InstructorDashboard = lazy(() => import("./components/InstructorDashboard"));
const InternDashboard = lazy(() => import("./components/InternDashboard"));

const roleComponents = { admin: AdminDashboard, instructor: InstructorDashboard, intern: InternDashboard };

function CenteredState({ title, message, action, feedback, error = false }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p role={error ? "alert" : undefined} className="max-w-xl text-sm" style={{ color: "var(--muted-foreground)" }}>{message}</p>
      {feedback && <p role="alert" className="max-w-xl text-sm" style={{ color: "var(--danger)" }}>{feedback}</p>}
      {action}
    </div>
  );
}

export default function App() {
  if (setupError) return <CenteredState title="Setup required" message={setupError} error />;
  return <ConfiguredApp />;
}

function ConfiguredApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [logoutError, setLogoutError] = useState(null);
  const profileRequest = useRef(0);
  const authGeneration = useRef(0);
  const [recoveryMode, setRecoveryMode] = useState(() => new URLSearchParams(window.location.search).get("flow") === "recovery" || new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery");
  const [recoveryLinkError] = useState(() => new URLSearchParams(window.location.hash.slice(1)).has("error") || new URLSearchParams(window.location.search).has("error"));

  const loadProfile = async (currentSession) => {
    const requestId = ++profileRequest.current;
    if (!currentSession?.user?.id) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    setProfileError(null);
    try {
      const { data, error } = await withTimeout(supabase.rpc("my_profile"), "Profile loading timed out. Check your connection and retry.");
      if (requestId !== profileRequest.current) return;
      if (error) throw error;
      if (!data) throw new Error("Your account is signed in, but no INSync profile is available.");
      if (data.id !== currentSession.user.id) throw new Error("The returned profile does not match your signed-in account. Retry to refresh your session.");
      setProfile(data);
    } catch (error) {
      if (requestId !== profileRequest.current) return;
      setProfile(null);
      setProfileError(error?.message || "Unable to load your profile.");
    } finally {
      if (requestId === profileRequest.current) setProfileLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    const restoreGeneration = authGeneration.current;
    const restoreTimeout = setTimeout(() => {
      if (!alive || restoreGeneration !== authGeneration.current) return;
      // Ignore a late response from this attempt after showing the retry screen.
      authGeneration.current += 1;
      setAuthError("Session restoration timed out. Check your connection and retry.");
      setAuthReady(true);
    }, 15000);
    const restore = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!alive || restoreGeneration !== authGeneration.current) return;
        clearTimeout(restoreTimeout);
        if (error) throw error;
        setAuthError(null);
        setSession(data.session ?? null);
        setAuthReady(true);
      } catch (error) {
        if (!alive || restoreGeneration !== authGeneration.current) return;
        clearTimeout(restoreTimeout);
        setSession(null);
        setAuthError(error?.message || "Unable to restore your session.");
        setAuthReady(true);
      }
    };
    restore();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!alive) return;
      if (_event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      authGeneration.current += 1;
      clearTimeout(restoreTimeout);
      setAuthError(null);
      setSession(newSession ?? null);
      // Auth events can arrive before getSession resolves and supersede it.
      setAuthReady(true);
      setLogoutError(null);
      if (!newSession) {
        clearUnsentAnnouncementDrafts();
        profileRequest.current += 1;
        setProfile(null);
        setProfileLoading(false);
        setProfileError(null);
      }
    });
    return () => {
      alive = false;
      clearTimeout(restoreTimeout);
      profileRequest.current += 1;
      listener.subscription.unsubscribe();
    };
  }, [restoreAttempt]);

  useEffect(() => {
    if (!authReady) return;
    loadProfile(session);
  }, [authReady, session]);

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      const { error } = await withTimeout(supabase.auth.signOut(), "Sign out timed out. Retry or close this session securely.");
      if (error) throw error;
      profileRequest.current += 1;
      clearUnsentAnnouncementDrafts();
      authGeneration.current += 1;
      setSession(null);
      setProfile(null);
    } catch (error) {
      setLogoutError(error?.message || "Sign out could not be completed. Retry or close this session securely.");
    }
  };

  if (!authReady) {
    return <CenteredState title="Restoring session" message="Checking your signed-in session and preparing your INSync profile…" />;
  }
  if (recoveryMode || recoveryLinkError) return <RecoverPassword session={session} linkError={recoveryLinkError || Boolean(authError)} onDone={() => {
    const url = new URL(window.location.href); url.searchParams.delete("flow"); url.searchParams.delete("error"); url.searchParams.delete("error_description"); url.hash = "";
    window.history.replaceState(null, "", url.pathname + url.search);
    setRecoveryMode(false);
    // Clear invalid callback state by navigating explicitly, never an automatic loop.
    if (recoveryLinkError) window.location.reload();
  }} />;
  if (authError) {
    return <CenteredState title="Session restoration failed" message={authError} error action={<div className="flex gap-2"><button onClick={() => { setAuthReady(false); setAuthError(null); setRestoreAttempt((attempt) => attempt + 1); }} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--primary)", color: "#fff" }}>Retry</button><button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg text-sm" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>Reload</button></div>} />;
  }

  if (!session) return <LoginPage />;
  // Rechecking the same user must keep mounted forms and unsaved drafts.
  // A different account never inherits the previous account's dashboard.
  if ((!profile || profile.id !== session.user.id) && !profileError) {
    return <CenteredState title="Loading profile" message="Your session is restored. Loading your authorized INSync profile…" />;
  }
  if (profileError) {
    return (
      <CenteredState
        title="Profile unavailable"
        message={profileError}
        feedback={logoutError}
        error
        action={
          <div className="flex gap-2">
            <button onClick={() => loadProfile(session)} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--primary)", color: "#fff" }}>Retry</button>
            <button onClick={handleLogout} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>Sign out</button>
          </div>
        }
      />
    );
  }
  if (profile.status !== "Active") {
    return (
      <CenteredState
        title="Account pending activation"
        message={<>Your account is <strong>{profile.status}</strong>. An administrator needs to activate it before you can access internship records.</>}
        feedback={logoutError}
        action={<div className="flex gap-2"><button disabled={profileLoading} onClick={() => loadProfile(session)} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: "var(--primary)", color: "#fff" }}>{profileLoading ? "Checking…" : profile.status === "Pending" ? "Check activation" : "Check account status"}</button><button onClick={handleLogout} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>Back to Sign In</button></div>}
      />
    );
  }

  const Dashboard = roleComponents[profile.role];
  if (!Dashboard) {
    return <CenteredState title="Unsupported account role" message={`The profile role “${profile.role ?? "unknown"}” is not supported by this application. Contact an administrator rather than continuing with an unauthorized dashboard.`} feedback={logoutError} error action={<button onClick={handleLogout} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>Sign out</button>} />;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {logoutError && <div role="alert" className="fixed top-3 right-3 z-[70] max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }}>{logoutError}</div>}
      <Suspense fallback={<CenteredState title="Loading dashboard" message="Preparing the tools for your authorized role…" />}>
        <Dashboard profile={profile} onLogout={handleLogout} />
      </Suspense>
    </div>
  );
}

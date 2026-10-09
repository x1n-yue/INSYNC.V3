// Host-neutral, redacted hooks. No network destination or personal payload.
// A separately configured observer can listen to insync:health events.
const allowed = new Set(["render-error", "unhandled-error", "unhandled-rejection", "offline", "online"]);
export function reportHealth(kind) {
  if (typeof window !== "undefined" && allowed.has(kind)) window.dispatchEvent(new CustomEvent("insync:health", { detail: { kind, at: new Date().toISOString() } }));
}
export function installMonitoring() {
  const listeners = { error: () => reportHealth("unhandled-error"), unhandledrejection: () => reportHealth("unhandled-rejection"), offline: () => reportHealth("offline"), online: () => reportHealth("online") };
  for (const [name, handler] of Object.entries(listeners)) window.addEventListener(name, handler);
  return () => { for (const [name, handler] of Object.entries(listeners)) window.removeEventListener(name, handler); };
}

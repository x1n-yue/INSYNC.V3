// Setup validation only. Actual identity and authorization belong to Supabase/RLS.
// Never echo supplied values: even misconfigured private keys must stay out of UI.
export function validateBrowserConfig(env = {}) {
  const url = String(env.VITE_SUPABASE_URL ?? "").trim();
  const key = String(env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  const errors = [];
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:"))
      || parsed.username || parsed.password || parsed.search || parsed.hash
      || parsed.hostname.includes("your-project-ref")) throw new Error("invalid");
  } catch { errors.push("Set VITE_SUPABASE_URL to your HTTPS project URL (HTTP allowed only on loopback)."); }
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key);
  if (!publicKey && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    try {
      const payload = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      publicKey = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))).role === "anon";
    } catch { /* Malformed public key; no value or decoder error is exposed. */ }
  }
  if (!publicKey) errors.push("Set VITE_SUPABASE_ANON_KEY to a publishable key or legacy anon key. Private/secret keys are forbidden.");
  return errors.length ? { ok: false, error: errors.join(" ") } : { ok: true, url, key, error: null };
}

export function createBrowserClient(env, factory) {
  const config = validateBrowserConfig(env);
  if (!config.ok) return { client: null, error: config.error };
  try { return { client: factory(config.url, config.key), error: null }; }
  catch { return { client: null, error: "Unable to initialize Supabase. Check public setup values and rebuild the application." }; }
}

import { createClient } from "@supabase/supabase-js";
import { adminOperation } from "../server/adminOperations.js";

export function makeHandler({ env = process.env, clientFactory = createClient, fetcher = fetch, logger = console } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Use POST." }); }
    const origin = env.APP_ORIGIN;
    if (!origin || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: "Server setup required: APP_ORIGIN, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." });
    if (req.headers.origin !== origin || !String(req.headers["content-type"] ?? "").startsWith("application/json")) return res.status(403).json({ error: "Request origin or content type rejected." });
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return res.status(401).json({ error: "Sign in again." });
    if (!req.body || Buffer.byteLength(JSON.stringify(req.body)) > 300000) return res.status(413).json({ error: "Request exceeds the import limit." });
    const deadline = Date.now() + 50000;
    const db = clientFactory(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options = {}) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Operation deadline reached.");
      return fetcher(url, { ...options, signal: AbortSignal.timeout(Math.min(12000, remaining)) });
    } } });
    try {
      // getUser verifies the actual JWT with Auth. Never trust decoded role claims.
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user?.id) return res.status(401).json({ error: "Sign in again." });
      const profile = await db.from("profiles").select("id,role,status").eq("id", data.user.id).single();
      if (profile.error || profile.data?.role !== "admin" || profile.data.status !== "Active") return res.status(403).json({ error: "Active Admin required." });
      const result = await adminOperation({ db, actor: data.user.id, body: req.body, fetcher, settings: { origin, githubToken: env.BACKUP_GITHUB_TOKEN, backupRepository: env.BACKUP_GITHUB_REPOSITORY, backupRef: env.BACKUP_GITHUB_REF } });
      return res.status(200).json(result);
    } catch (error) {
      // Vercel captures these structured server logs. Do not log exception
      // objects, request bodies, addresses, headers or provider responses.
      logger.warn(JSON.stringify({ event: "insync.admin-operation.failed", at: new Date().toISOString() }));
      // Never forward SDK errors, URLs, tokens, SMTP details or provider bodies.
      const safe = ["Invalid", "Unknown", "Choose", "CSV", "Row ", "Import ", "Malformed", "Unterminated", "Only the", "Configure", "Database operation", "Incomplete", "Job not"].some(prefix => error.message?.startsWith(prefix));
      return res.status(400).json({ error: safe ? error.message : "Operation failed. Refresh job status before retrying." });
    }
  };
}
export default makeHandler();

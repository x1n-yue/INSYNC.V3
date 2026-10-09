import { parseOnboardingCSV } from "../src/lib/onboarding.js";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function checked(query) {
  const result = await query;
  if (result.error?.code === "23505" && result.error.message?.includes("m16_onboarding_identity_pending")) throw new Error("Import contains an email reserved by another pending job. Inspect and reconcile that job first.");
  if (result.error) throw new Error("Database operation failed; refresh job status before retrying.");
  return result.data;
}
export function summary(job) {
  return { id: job.id, actor_id: job.actor_id, kind: job.kind, status: job.status, created_at: job.created_at, updated_at: job.updated_at, result: job.result };
}
async function getJob(db, id) {
  if (!UUID.test(id ?? "")) throw new Error("Invalid job identity.");
  const job = await checked(db.from("admin_operations").select("*").eq("id", id).single());
  if (!job) throw new Error("Job not found.");
  return job;
}
async function existing(db, rows) {
  const emails = await checked(db.rpc("onboarding_existing", { p_emails: rows.map(row => row.email) }));
  if (!Array.isArray(emails) || emails.some(email => typeof email !== "string" || !rows.some(row => row.email === email))) throw new Error("Incomplete duplicate check; retry the preview.");
  return new Set(emails);
}
async function reconcileBackup(db, job, settings, fetcher) {
  const run = job.result?.worker_run_id;
  if (!["running", "failed"].includes(job.status) || !/^\d+$/.test(run ?? "") || !settings.githubToken || !/^[\w.-]+\/[\w.-]+$/.test(settings.backupRepository ?? "")) return summary(job);
  const read = async suffix => {
    const response = await fetcher(`https://api.github.com/repos/${settings.backupRepository}/actions/runs/${run}${suffix}`, { signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${settings.githubToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" } });
    if (!response.ok) throw new Error("Status lookup failed");
    return response.json();
  };
  try {
    const workflow = await read("");
    if (workflow.status !== "completed") return summary(job);
    const delivery = await read("/artifacts?per_page=100");
    if (!Number.isSafeInteger(delivery.total_count) || delivery.total_count !== delivery.artifacts?.length) throw new Error("Incomplete artifact list");
    const artifact = delivery.artifacts.find(item => item.name === `insync-${job.id}` && !item.expired && item.size_in_bytes > 0 && Number.isSafeInteger(item.id));
    const result = artifact ? { ...job.result, artifact_id: String(artifact.id), expires_at: artifact.expires_at, delivery_reconciled: true }
      : { ...job.result, error: "The workflow finished without an available backup artifact. Inspect the workflow before requesting another backup." };
    const status = artifact ? "completed" : "failed";
    // Compare the observed state so a parallel finalizer cannot be overwritten.
    await checked(db.from("admin_operations").update({ status, result, updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", job.status));
    return summary(await getJob(db, job.id));
  } catch { return { ...summary(job), message: "Provider status could not be reconciled. Evidence was retained; inspect the workflow and retry status." }; }
}
async function reconcile(db, job) {
  // One SQL reconciliation handles the entire bounded job irrespective of the
  // provider API row cap. Unknown outcomes never authorize automatic resends.
  return summary(await checked(db.rpc("summarize_admin_import", { p_job: job.id })));
}
export async function runImport(db, job, actor, redirectTo, now = () => Date.now()) {
  if (job.actor_id !== actor) throw new Error("Only the creating administrator may continue this import.");
  const start = now();
  const candidates = await checked(db.from("onboarding_rows").select("row_index").eq("job_id", job.id).eq("status", "ready").order("row_index").limit(2));
  for (const candidate of candidates) {
    if (now() - start > 20000) break;
    const row = await checked(db.rpc("claim_onboarding_row", { p_job: job.id, p_index: candidate.row_index, p_actor: actor }));
    if (!row?.job_id) continue;
    if (row.job_id !== job.id || row.row_index !== candidate.row_index || row.status !== "running") throw new Error("Invalid row reservation.");
    const person = job.payload.rows[row.row_index];
    const identities = await checked(db.rpc("onboarding_identity", { p_email: person.email }));
    let outcome;
    if (identities.length) outcome = { status: "duplicate" };
    else {
      try {
        const response = await db.auth.admin.inviteUserByEmail(person.email, { redirectTo, data: { ...person, insync_import: `${job.id}:${row.row_index}` } });
        if (response.data?.user?.id && !response.error) outcome = { status: "invited", account_id: response.data.user.id };
        // Even provider errors can accompany account creation/SMTP failures.
        // Reconciliation determines what committed; never auto-resend a write.
        else outcome = { status: "uncertain" };
      } catch { outcome = { status: "uncertain" }; }
    }
    await checked(db.from("onboarding_rows").update(outcome).eq("job_id", job.id).eq("row_index", row.row_index));
  }
  return reconcile(db, job);
}

export async function adminOperation({ db, actor, body, settings, fetcher = fetch }) {
  const action = body?.action;
  if (action === "list") {
    const jobs = []; let count;
    do {
      const page = await db.from("admin_operations").select("id,actor_id,kind,status,created_at,updated_at,result", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(jobs.length, 19);
      if (page.error || !Number.isSafeInteger(page.count) || (count !== undefined && count !== page.count) || (jobs.length < Math.min(page.count, 20) && !page.data?.length)) throw new Error("Incomplete job list; refresh before retrying.");
      count = page.count; jobs.push(...page.data);
      if (new Set(jobs.map(job => job.id)).size !== jobs.length) throw new Error("Incomplete job list; refresh before retrying.");
    } while (jobs.length < Math.min(count, 20));
    return { jobs, count, limit: 20, backupConfigured: Boolean(settings.githubToken && settings.backupRepository && settings.backupRef) };
  }
  if (action === "preview" || action === "import") {
    const rows = parseOnboardingCSV(body.csv, body.kind);
    const duplicates = await existing(db, rows);
    if (action === "preview") return { rows: rows.map((row, index) => ({ ...row, index, status: duplicates.has(row.email) ? "duplicate" : "ready" })), count: rows.length };
    if (!UUID.test(body.id ?? "")) throw new Error("Invalid retry identity.");
    const job = await checked(db.rpc("prepare_admin_operation", { p_id: body.id, p_actor: actor, p_kind: "import", p_payload: { rows } }));
    if (!["queued", "running"].includes(job.status)) return reconcile(db, job);
    return runImport(db, job, actor, `${settings.origin}/?flow=recovery`);
  }
  if (action === "status" || action === "continue" || action === "stop") {
    const job = await getJob(db, body.id);
    if (job.kind === "backup") {
      if (action === "stop") {
        // Cancelling only queued jobs serializes with the worker's queued claim.
        // A running dump is never represented as cancelled by a UI action.
        await checked(db.from("admin_operations").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "queued"));
        return summary(await getJob(db, job.id));
      }
      return reconcileBackup(db, job, settings, fetcher);
    }
    if (action === "stop") {
      if (job.actor_id !== actor) throw new Error("Only the creating administrator may stop this import.");
      await checked(db.from("onboarding_rows").update({ status: "cancelled" }).eq("job_id", job.id).eq("status", "ready"));
    }
    if (action === "continue" && ["queued", "running"].includes(job.status)) return runImport(db, job, actor, `${settings.origin}/?flow=recovery`);
    return reconcile(db, job);
  }
  if (action === "backup") {
    if (!settings.githubToken || !/^[\w.-]+\/[\w.-]+$/.test(settings.backupRepository ?? "") || !settings.backupRef) throw new Error("Configure the server backup connection before requesting a backup.");
    if (!UUID.test(body.id ?? "")) throw new Error("Invalid retry identity.");
    const job = await checked(db.rpc("prepare_admin_operation", { p_id: body.id, p_actor: actor, p_kind: "backup", p_payload: {} }));
    if (job.status !== "queued") return summary(job);
    // Repeated dispatches carry one durable job ID; the worker atomically claims
    // queued jobs so duplicate/lost dispatch responses cannot create two dumps.
    try {
      const response = await fetcher(`https://api.github.com/repos/${settings.backupRepository}/actions/workflows/insync-backup.yml/dispatches`, {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${settings.githubToken}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2026-03-10" },
        body: JSON.stringify({ ref: settings.backupRef, inputs: { job_id: job.id } }),
      });
      if (!response.ok) throw new Error("dispatch failed");
      return { ...summary(job), dispatch: "requested" };
    } catch { return { ...summary(job), dispatch: "unconfirmed", message: "Backup dispatch is unconfirmed. Refresh status; retry the same job identity if it remains queued." }; }
  }
  throw new Error("Unknown operation.");
}

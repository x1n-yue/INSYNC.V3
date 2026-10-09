import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { backupKey, encryptBackup } from "./backup-crypto.mjs";
import { checked, UUID } from "../server/adminOperations.js";

export function runCommand(command, args, env = process.env) {
  return new Promise((done, reject) => {
    // Neither arguments/environment nor pg_dump stderr (which may contain URLs)
    // are logged. No shell interpolation, and credentials use environment only.
    const child = spawn(command, args, { env, stdio: "ignore", timeout: 20 * 60 * 1000, windowsHide: true });
    child.once("error", () => reject(new Error("Backup command could not start.")));
    child.once("exit", code => code === 0 ? done() : reject(new Error("Backup command failed.")));
  });
}
export async function copyStorage(db, directory, { readPage, maxBytes = 5 * 1024 ** 3, maxObjects = 10000 } = {}) {
  if (!readPage) throw new Error("A trusted Storage catalog connection is required.");
  const objects = []; let after = "", total = 0;
  for (;;) {
    // Database keyset pagination has explicit ordering/counts and handles a
    // provider row cap below the requested size. Object names are never paths.
    const page = await readPage(after);
    if (!page.length) break;
    for (const object of page) {
      if (!UUID.test(object.id) || objects.length >= maxObjects) throw new Error("Storage snapshot limit reached.");
      const { data, error } = await db.storage.from("documents").download(object.name);
      if (error || !data) throw new Error("A private file could not be backed up.");
      const bytes = Buffer.from(await data.arrayBuffer()); total += bytes.length;
      if (total > maxBytes || bytes.length > 10 * 1024 ** 2) throw new Error("Storage snapshot size limit reached.");
      const filename = `${object.id}.bin`;
      await writeFile(join(directory, filename), bytes, { flag: "wx", mode: 0o600 });
      objects.push({ ...object, filename, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    const next = page.at(-1).id;
    if (next <= after) throw new Error("Storage snapshot ordering changed.");
    after = next;
  }
  return { objects, bytes: total };
}

export async function performBackup({ db, jobId, env, output, command = runCommand, storage = copyStorage, databaseFactory = config => new pg.Client(config) }) {
  if (!UUID.test(jobId ?? "")) throw new Error("Invalid backup job ID.");
  const key = backupKey(env.BACKUP_ENCRYPTION_KEY);
  if (!env.BACKUP_DATABASE_URL) throw new Error("Database backup connection is missing.");
  const provenance = { worker_run_id: env.GITHUB_RUN_ID, run_url: `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` };
  const job = await checked(db.rpc("claim_backup_operation", { p_job: jobId, p_run: env.GITHUB_RUN_ID, p_repository: env.GITHUB_REPOSITORY }));
  if (!job) return { claimed: false };
  const temporary = await mkdtemp(join(tmpdir(), "insync-backup-"));
  const started = new Date().toISOString();
  let catalog;
  try {
    catalog = databaseFactory({ connectionString: env.BACKUP_DATABASE_URL, connectionTimeoutMillis: 15000, query_timeout: 60000, application_name: "insync-backup" });
    await catalog.connect();
    await catalog.query("begin isolation level repeatable read read only");
    const { rows: [{ snapshot }] } = await catalog.query("select pg_export_snapshot() snapshot");
    await mkdir(join(temporary, "files"));
    // Full logical DB dump retains ACLs, Auth identities, private Storage metadata,
    // schema/functions and audit. Provider-managed role/config recovery is separate.
    await command("pg_dump", ["--format=custom", "--no-owner", "--snapshot", snapshot, "--file", join(temporary, "database.dump")], { ...env, PGDATABASE: env.BACKUP_DATABASE_URL });
    const files = await storage(db, join(temporary, "files"), { readPage: async after => (await catalog.query("select id,bucket_id,name,metadata,updated_at from storage.objects where bucket_id='documents' and ($1::uuid is null or id>$1::uuid) order by id limit 250", [after || null])).rows });
    await catalog.query("commit");
    const manifest = { format: 1, jobId, started, finished: new Date().toISOString(), database: "database.dump", storage: files, consistency: "One exported database snapshot covers SQL and Storage catalog; file bytes are sequential reads. Use a write-maintenance window to prevent file replacement/deletion during capture.", excluded: ["Provider settings", "SMTP credentials", "OAuth secrets", "External services", "Non-documents buckets"] };
    await writeFile(join(temporary, "manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
    const archive = join(temporary, "backup.tar.gz");
    await command("tar", ["-czf", archive, "-C", temporary, "database.dump", "manifest.json", "files"], env);
    await mkdir(output, { recursive: true });
    const target = join(output, `insync-${jobId}.tar.gz.enc`);
    await encryptBackup(archive, target, key);
    return { claimed: true, target, result: { ...provenance, started, prepared_at: new Date().toISOString(), objects: files.objects.length, bytes: files.bytes, encryption: "AES-256-GCM", retention_days: 7, consistency: manifest.consistency } };
  } finally {
    if (catalog) await catalog.end().catch(() => {});
    // Only the verified, locally-created temp directory is ever removed.
    if (resolve(temporary).startsWith(resolve(tmpdir()) + "/") || resolve(temporary).startsWith(resolve(tmpdir()) + "\\")) await rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const env = process.env, jobId = env.BACKUP_JOB_ID;
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(60000) }) } });
  if (!UUID.test(jobId ?? "")) throw new Error("Invalid backup job identity.");
  if (env.BACKUP_FINALIZE) {
    const prepared = JSON.parse(await readFile("backup-output/result.json", "utf8"));
    const result = { ...prepared, artifact_id: env.BACKUP_ARTIFACT_ID, run_url: `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() };
    if (!/^\d+$/.test(result.artifact_id ?? "")) throw new Error("Artifact delivery not confirmed.");
    await checked(db.from("admin_operations").update({ status: "completed", result, lease_until: null, updated_at: new Date().toISOString() }).eq("id", jobId).eq("status", "running").contains("result", { worker_run_id: env.GITHUB_RUN_ID }));
    return;
  }
  if (env.BACKUP_FAILED) {
    const observed = await checked(db.from("admin_operations").select("result").eq("id", jobId).single());
    await checked(db.from("admin_operations").update({ status: "failed", result: { ...observed.result, worker_run_id: env.GITHUB_RUN_ID, error: "Backup did not complete. An operator must inspect the workflow and reconcile any uploaded artifact before starting another job." }, updated_at: new Date().toISOString() }).eq("id", jobId).eq("status", "running").contains("result", { worker_run_id: env.GITHUB_RUN_ID }));
    return;
  }
  const result = await performBackup({ db, jobId, env, output: "backup-output" });
  if (result.claimed) {
    await writeFile("backup-output/result.json", JSON.stringify(result.result), { mode: 0o600 });
    await checked(db.from("admin_operations").update({ result: result.result, updated_at: new Date().toISOString() }).eq("id", jobId).eq("status", "running").contains("result", { worker_run_id: env.GITHUB_RUN_ID }));
  }
  // Only a boolean is exposed to Actions; no secret, manifest, or file contents.
  if (env.GITHUB_OUTPUT) await writeFile(env.GITHUB_OUTPUT, `claimed=${result.claimed}\n`, { flag: "a" });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write("Backup operation failed; inspect configuration and job state.\n"); process.exitCode = 1; });
}

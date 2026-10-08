// Native, multi-connection tests ONLY. No supplied URL/env credentials accepted.
// Never connects until our own fresh loopback server reports readiness. Never
// reads schema.sql, creates an OS user, registers a service, or contacts Supabase.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function run(binary, args) {
  const child = spawn(binary, args, { windowsHide: true, stdio: "pipe" });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const [code] = await once(child, "close");
  if (code !== 0) throw new Error(`Disposable Postgres command failed (${code}): ${output}`);
}

export async function disposablePostgres() {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const { initdb, postgres, pg_ctl: pgCtl } = await import(`@embedded-postgres/${platform}-${process.arch}`);
  const root = path.resolve(".test-postgres");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "synthetic-"));
  const dataDir = path.join(directory, "data");
  const passwordFile = path.join(directory, "synthetic-password");
  const password = randomBytes(32).toString("hex");
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const clients = new Set();
  let server;
  let ready = false;
  let serverExited = false;
  let serverError;
  const connect = async () => {
    if (!ready || serverExited) throw new Error("Our disposable server is not ready");
    const client = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password,
      database: "postgres", ssl: false, connectionTimeoutMillis: 5000,
      application_name: "insync-synthetic-phase2", options: "-c statement_timeout=10000 -c lock_timeout=5000" });
    await client.connect();
    clients.add(client);
    return client;
  };
  const stop = async () => {
    await Promise.allSettled([...clients].map((client) => client.end()));
    if (server && !serverExited) await run(pgCtl, ["-D", dataDir, "-m", "fast", "-w", "-t", "10", "stop"]);
    if (server && !serverExited) await once(server, "close");
    // Verify actual resolved paths before ANY recursive removal on Windows.
    const actualRoot = await realpath(root);
    const actualDir = await realpath(directory);
    if (path.dirname(actualDir) !== actualRoot || !path.basename(actualDir).startsWith("synthetic-")) {
      throw new Error("Refusing cleanup outside disposable test workspace");
    }
    await rm(actualDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  try {
    await writeFile(passwordFile, `${password}\n`, { mode: 0o600 });
    try {
      await run(initdb, ["-D", dataDir, "--username=postgres", "--auth=scram-sha-256", `--pwfile=${passwordFile}`, "--locale=C", "--encoding=UTF8"]);
    } finally { await rm(passwordFile, { force: true }); }
    server = spawn(postgres, ["-D", dataDir, "-h", "127.0.0.1", "-p", String(port)], {
      windowsHide: true, stdio: "pipe", env: { ...process.env, LC_MESSAGES: "C" },
    });
    server.on("error", (error) => { serverError = error; });
    server.on("close", () => { serverExited = true; });
    const capture = (chunk) => { if (String(chunk).includes("database system is ready to accept connections")) ready = true; };
    server.stdout.on("data", capture);
    server.stderr.on("data", capture);
    for (let count = 0; count < 200 && !ready && !serverExited && !serverError; count++) await wait(50);
    if (!ready || serverExited || serverError) throw new Error("Our disposable Postgres failed to become ready");
    return { connect, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

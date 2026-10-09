import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backupKey, decryptBackup, encryptBackup } from "../scripts/backup-crypto.mjs";
import { copyStorage, performBackup } from "../scripts/backup-worker.mjs";

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let directory;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "insync-crypto-test-")); });
afterEach(async () => {
  const actual = await realpath(directory), parent = await realpath(tmpdir());
  if (dirname(actual) !== parent) throw new Error("Unsafe test cleanup target");
  await rm(actual, { recursive: true, force: true });
});

describe("encrypted backup artifacts", () => {
  it("round trips real bytes, uses a fresh IV and refuses existing output", async () => {
    const source = join(directory, "source"), first = join(directory, "first.enc"), second = join(directory, "second.enc"), target = join(directory, "restored");
    const bytes = Buffer.from("synthetic private database and file evidence"), key = backupKey("ab".repeat(32));
    await writeFile(source, bytes); await encryptBackup(source, first, key); await encryptBackup(source, second, key);
    expect(await readFile(first)).not.toEqual(await readFile(second)); expect((await readFile(first)).includes(bytes)).toBe(false);
    await decryptBackup(first, target, key); expect(await readFile(target)).toEqual(bytes);
    await expect(decryptBackup(second, target, key)).rejects.toThrow(); expect(await readFile(target)).toEqual(bytes);
  });
  it.each(["wrong key", "modified ciphertext", "truncated"])("rejects %s and removes unauthenticated output", async mode => {
    const source = join(directory, "source"), encrypted = join(directory, "backup.enc"), target = join(directory, "restored");
    const key = backupKey("ab".repeat(32)); await writeFile(source, "synthetic evidence"); await encryptBackup(source, encrypted, key);
    const bytes = await readFile(encrypted);
    if (mode === "modified ciphertext") { bytes[22] ^= 1; await writeFile(encrypted, bytes); }
    if (mode === "truncated") await writeFile(encrypted, bytes.subarray(0, 20));
    await expect(decryptBackup(encrypted, target, mode === "wrong key" ? backupKey("cd".repeat(32)) : key)).rejects.toThrow();
    await expect(readFile(target)).rejects.toThrow();
  });
  it.each(["", "a".repeat(63), "z".repeat(64)])("rejects invalid encryption key configuration", value => expect(() => backupKey(value)).toThrow());
});

describe("private file capture and backup claims", () => {
  it("captures every short catalog page, hashes bytes and never trusts object paths", async () => {
    const objects = [1, 2, 3].map(index => ({ id: id(index), name: index === 1 ? "../../sensitive.pdf" : `owner/file${index}.pdf`, bucket_id: "documents", metadata: { mimetype: "application/pdf" } }));
    const readPage = vi.fn(async after => objects.filter(row => row.id > after).slice(0, 1));
    const download = vi.fn(async name => ({ data: new Blob([`private ${name}`]) }));
    const result = await copyStorage({ storage: { from: vi.fn(() => ({ download })) } }, directory, { readPage });
    expect(result.objects).toHaveLength(3); expect(readPage).toHaveBeenCalledTimes(4);
    expect(result.objects[0].filename).toBe(`${id(1)}.bin`);
    expect(result.objects[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(String(await readFile(join(directory, `${id(1)}.bin`)))).toContain("../../sensitive.pdf");
  });
  it("fails visibly on missing evidence or bounded snapshot limits", async () => {
    const readPage = async () => [{ id: id(1), name: "private.pdf" }];
    await expect(copyStorage({ storage: { from: () => ({ download: async () => ({ error: true }) }) } }, directory, { readPage })).rejects.toThrow("could not");
    await expect(copyStorage({}, directory, { readPage, maxObjects: 0 })).rejects.toThrow("limit");
  });
  it("skips duplicate workers without starting a dump", async () => {
    const command = vi.fn();
    const result = await performBackup({ db: { rpc: vi.fn(async () => ({ data: null })) }, jobId: id(1), env: { BACKUP_DATABASE_URL: "synthetic", BACKUP_ENCRYPTION_KEY: "ab".repeat(32), GITHUB_RUN_ID: "12", GITHUB_REPOSITORY: "owner/repo" }, output: directory, command });
    expect(result.claimed).toBe(false); expect(command).not.toHaveBeenCalled();
  });
  it("exports one SQL snapshot for dump/catalog and produces an encrypted artifact without completing delivery", async () => {
    const query = vi.fn(async sql => sql.includes("pg_export_snapshot") ? { rows: [{ snapshot: "synthetic-snapshot" }] } : { rows: [] });
    const catalog = { connect: vi.fn(), query, end: vi.fn(async () => {}) };
    const command = vi.fn(async (name, args) => {
      if (name === "pg_dump") await writeFile(args[args.indexOf("--file") + 1], "synthetic database dump");
      else await writeFile(args[1], "synthetic tar contents");
    });
    const db = { rpc: vi.fn(async () => ({ data: { id: id(1) } })) };
    const result = await performBackup({ db, jobId: id(1), env: { BACKUP_DATABASE_URL: "synthetic-private-url", BACKUP_ENCRYPTION_KEY: "ab".repeat(32), GITHUB_RUN_ID: "12", GITHUB_REPOSITORY: "owner/repo" }, output: directory, command, databaseFactory: () => catalog, storage: async () => ({ objects: [], bytes: 0 }) });
    expect(result.claimed).toBe(true); expect(result.result.encryption).toBe("AES-256-GCM");
    expect(command.mock.calls[0][1]).toContain("synthetic-snapshot");
    expect(command.mock.calls[0][1]).not.toContain("synthetic-private-url");
    expect(db.rpc).toHaveBeenCalledTimes(1); expect(query).toHaveBeenCalledWith("commit"); expect(catalog.end).toHaveBeenCalled();
    expect((await readFile(result.target)).subarray(0, 8).toString()).toBe("INSYNCB1");
    // Real pg_dump/tar/provider restore are intentionally not mocked into a claim
    // of backup validity; this test covers orchestration and encryption only.
  });
});

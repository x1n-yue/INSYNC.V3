import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("INSYNCB1");
export function backupKey(encoded) {
  if (!/^[a-f0-9]{64}$/i.test(encoded ?? "")) throw new Error("BACKUP_ENCRYPTION_KEY must be 64 hexadecimal characters.");
  return Buffer.from(encoded, "hex");
}
export async function encryptBackup(source, target, key) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const handle = await open(target, "wx", 0o600);
  try { await handle.write(Buffer.concat([MAGIC, iv])); } finally { await handle.close(); }
  await pipeline(createReadStream(source), cipher, createWriteStream(target, { flags: "a" }));
  const out = await open(target, "a");
  try { await out.write(cipher.getAuthTag()); } finally { await out.close(); }
}
export async function decryptBackup(source, target, key) {
  const handle = await open(source, "r");
  const size = (await stat(source)).size;
  if (size < 36) { await handle.close(); throw new Error("Invalid backup format."); }
  const header = Buffer.alloc(20), tag = Buffer.alloc(16);
  try { await handle.read(header, 0, 20, 0); await handle.read(tag, 0, 16, size - 16); } finally { await handle.close(); }
  if (!header.subarray(0, 8).equals(MAGIC)) throw new Error("Invalid backup format.");
  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(8));
  decipher.setAuthTag(tag);
  const output = createWriteStream(target, { flags: "wx", mode: 0o600 });
  let created = false;
  try {
    await new Promise((done, reject) => { output.once("open", () => { created = true; done(); }); output.once("error", reject); });
    await pipeline(createReadStream(source, { start: 20, end: size - 17 }), decipher, output);
  } catch (error) {
    output.destroy();
    if (created) await rm(target, { force: true });
    throw error;
  }
}

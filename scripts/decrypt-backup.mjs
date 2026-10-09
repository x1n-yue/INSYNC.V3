import { backupKey, decryptBackup } from "./backup-crypto.mjs";
import { resolve } from "node:path";

const [source, target] = process.argv.slice(2);
if (!source || !target || resolve(source) === resolve(target)) throw new Error("Usage: node scripts/decrypt-backup.mjs encrypted-file new-output-file");
// Never remove or overwrite an existing user file on authentication failure.
try {
  await decryptBackup(source, target, backupKey(process.env.BACKUP_ENCRYPTION_KEY));
  process.stdout.write("Backup decrypted and authenticated. Validate the manifest before restoring.\n");
} catch {
  process.stderr.write("Decryption failed. No restore should be attempted.\n"); process.exitCode = 1;
}

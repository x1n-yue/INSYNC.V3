import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(root).filter(name => /^M\d+_.*\.sql$/.test(name)).sort((a,b) => Number(a.match(/^M(\d+)/)[1]) - Number(b.match(/^M(\d+)/)[1]));
const orders = new Set();
const manifest = files.map(file => {
  const order = Number(file.match(/^M(\d+)/)[1]);
  if (orders.has(order)) throw new Error(`Duplicate migration label M${order}`);
  orders.add(order);
  return { order, file, sha256: createHash("sha256").update(readFileSync(new URL(file,root))).digest("hex") };
});
console.log(JSON.stringify({ note: "Reviewed local file hashes only; no SQL executed and no deployment state inferred.", migrations: manifest },null,2));

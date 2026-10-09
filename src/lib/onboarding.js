export const IMPORT_HEADERS = {
  student: ["full_name", "email", "organization", "student_id"],
  instructor: ["full_name", "email", "organization"],
};
export const IMPORT_LIMIT = 200;

// Strict RFC-style CSV parsing: quoted commas/newlines and escaped quotes work;
// malformed records are rejected rather than silently shifting identities.
export function parseOnboardingCSV(text, kind) {
  const headers = IMPORT_HEADERS[kind];
  if (!headers || typeof text !== "string" || text.length > 256000) throw new Error("Choose a student or instructor CSV under 256 KB.");
  const records = []; let record = [], value = "", quoted = false, closed = false;
  const cell = () => { record.push(value); value = ""; closed = false; };
  const row = () => { cell(); if (record.some(item => item.trim())) records.push(record); record = []; };
  text = text.replace(/^\ufeff/, "");
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === '"' && !value && !closed) quoted = true;
    else if (char === ",") cell();
    else if (char === "\n" || char === "\r") { if (char === "\r" && text[index + 1] === "\n") index++; row(); }
    else if (closed || char === '"') throw new Error("Malformed CSV quoting.");
    else value += char;
    if (records.length > IMPORT_LIMIT + 1) throw new Error(`Import at most ${IMPORT_LIMIT} accounts per file.`);
  }
  if (quoted) throw new Error("Unterminated CSV quote.");
  if (value || record.length || closed) row();
  if (JSON.stringify(records.shift()?.map(item => item.trim())) !== JSON.stringify(headers)) throw new Error(`CSV headers must be: ${headers.join(",")}`);
  if (!records.length || records.length > IMPORT_LIMIT) throw new Error(`Import between 1 and ${IMPORT_LIMIT} accounts.`);
  const seen = new Set();
  return records.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`Row ${index + 2}: incorrect column count.`);
    // eslint-disable-next-line no-control-regex
    if (cells.some(part => /[\u0000-\u001f\u007f]/.test(part))) throw new Error(`Row ${index + 2}: plain text fields cannot contain controls.`);
    const item = Object.fromEntries(headers.map((key, column) => [key, cells[column].trim()]));
    item.email = item.email.toLowerCase();
    // eslint-disable-next-line no-control-regex
    const invalid = Object.values(item).some(part => part.length > 254 || /[\u0000-\u001f\u007f]/.test(part));
    if (invalid || !item.full_name || item.full_name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) throw new Error(`Row ${index + 2}: supply a valid name/email and plain text fields.`);
    if (seen.has(item.email)) throw new Error(`Row ${index + 2}: duplicate email in this file.`);
    seen.add(item.email);
    return { ...item, requested_role: kind === "instructor" ? "instructor" : "intern" };
  });
}

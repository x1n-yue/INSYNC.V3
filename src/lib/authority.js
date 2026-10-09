// No authority decisions here: all RPCs authorize in Postgres. Normalize returned
// composites across SDK transports and reject empty/multi-row success responses.
import { withTimeout } from "./requests";

export async function recordRpc(client, name, args = {}) {
  try {
    const { data, error } = await withTimeout(client.rpc(name, args), "Request timed out. Refresh to check whether the change was saved before retrying.");
    if (error) return { ok: false, error: error.message, data: null, code: error.code };
    const row = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
    if (!row?.id) return { ok: false, error: "No single record returned; refresh and retry.", data: null };
    if (args.p_id && row.id !== args.p_id) return { ok: false, error: "Unexpected record returned; refresh and retry.", data: null };
    return { ok: true, data: row, error: null };
  } catch (error) {
    return { ok: false, data: null, error: error.message || "Request failed; retry." };
  }
}

export async function reviewCorrections(client, ids, decision, note = null) {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const failed = (error) => unique.map((id) => ({ id, ok: false, data: null, error }));
  try {
    const { data, error } = await withTimeout(client.rpc("review_exceptions", { p_ids: unique, p_decision: decision, p_note: note }));
    if (error) return failed(error.message);
    // Reject missing, duplicate, foreign or inconsistent results. A transport
    // success alone is never evidence that all selected requests were reviewed.
    if (!Array.isArray(data) || data.length !== unique.length || new Set(data.map((r) => r.id)).size !== unique.length
      || data.some((r) => !unique.includes(r.id) || typeof r.ok !== "boolean"
        || (r.ok && (r.data?.id !== r.id || r.data?.status !== decision)) || (!r.ok && !r.error))) {
      return failed("Incomplete review response; refresh before retrying.");
    }
    return unique.map((id) => data.find((r) => r.id === id));
  } catch (error) {
    return failed(error.message || "Review request failed; refresh before retrying.");
  }
}

export function manilaDate(instant = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

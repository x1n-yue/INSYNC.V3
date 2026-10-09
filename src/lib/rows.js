import { remainingTime, withTimeout } from "./requests";

const ROW_LIMIT = 50000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Shared RLS-scoped traversal for core workflows, including RPC queries.
// Exact counts, stable identities and deadlines reject partial results.
// This is a bounded read, not a transactionally consistent snapshot.
export async function readRows(client, table, columns, ownerId, options = {}) {
  const deadline = Math.min(options.deadline ?? Infinity, Date.now() + 60000);
  const source = () => options.query ? options.query() : client.from(table);
  const read = (query) => withTimeout(query, "Data loading timed out. Refresh and retry.", remainingTime(deadline));
  const scope = (query) => options.filter ? options.filter(ownerId ? query.eq("intern_id", ownerId) : query) : ownerId ? query.eq("intern_id", ownerId) : query;
  const anchor = await read(scope(source().select("id", { count: "exact" })).order("id", { ascending: false }).limit(1));
  if (anchor.error) throw new Error(anchor.error.message);
  if (!Number.isSafeInteger(anchor.count) || anchor.count < 0 || !Array.isArray(anchor.data)
    || anchor.data.length !== (anchor.count ? 1 : 0)) throw new Error("Record count unavailable; refresh and retry");
  if (anchor.count > ROW_LIMIT) throw new Error(`Data exceeds ${ROW_LIMIT} records; ask an operator for assistance`);
  if (!anchor.count) {
    const final = await read(scope(source().select("id", { count: "exact", head: true })));
    if (final.error) throw new Error(final.error.message);
    if (final.count !== 0) throw new Error("Data changed during loading; retry");
    return [];
  }
  const upper = anchor.data[0]?.id;
  if (!UUID.test(upper)) throw new Error("Invalid record identity");
  const records = [];
  let cursor;
  while (records.length < anchor.count) {
    let query = scope(source().select(columns)).lte("id", upper).order("id", { ascending: true }).limit(250);
    if (cursor) query = query.gt("id", cursor);
    const page = await read(query);
    if (page.error) throw new Error(page.error.message);
    if (!Array.isArray(page.data) || !page.data.length) throw new Error("Data changed or was truncated; retry");
    for (const row of page.data) {
      if (!UUID.test(row.id) || (cursor && row.id <= cursor) || row.id > upper
        || (ownerId && row.intern_id !== ownerId)) throw new Error("Unexpected record; refresh and retry");
      records.push(row); cursor = row.id;
    }
    if (records.length > anchor.count) throw new Error("Data changed during loading; retry");
  }
  const final = await read(scope(source().select("id", { count: "exact", head: true })).lte("id", upper));
  if (final.error) throw new Error(final.error.message);
  if (final.count !== anchor.count) throw new Error("Data changed during loading; retry");
  return records;
}

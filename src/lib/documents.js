import { recordRpc } from "./authority";

export const DOCUMENT_LIMIT = 10 * 1024 * 1024;
const MIMES = ["application/pdf", "image/jpeg", "image/png"];
export function validateDocument(file) {
  if (!file || !MIMES.includes(file.type) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > DOCUMENT_LIMIT)
    return "Select a PDF, JPEG or PNG file between 1 byte and 10 MiB";
  if (typeof file.name !== "string" || !file.name.trim() || file.name.length > 255 || [...file.name].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return "Filename must be nonempty, <=255 characters and contain no controls";
  return null;
}
// First reconcile a possibly committed RPC. Never remove evidence on an
// ambiguous response: cancel RPC is serialized with finalize and is authoritative.
export async function recoverUpload(client, uploadId) {
  const outcome = await recordRpc(client, "cancel_document_upload", { p_id: uploadId });
  if (!outcome.ok) return { ok: false, data: null, cleanupPending: true, error: `Upload outcome unknown; recovery required: ${outcome.error}` };
  if (outcome.data.committed === true && outcome.data.document?.id) return { ok: true, data: outcome.data.document, reconciled: true };
  if (outcome.data.committed !== false || !outcome.data.path) return { ok: false, cleanupPending: true, error: "Incomplete recovery response; retry recovery" };
  try {
    const { data, error } = await client.storage.from("documents").remove([outcome.data.path]);
    if (error || !Array.isArray(data) || !(data.length === 1 || (data.length === 0 && outcome.data.object_exists === false))) return { ok: false, cleanupPending: true, error: error?.message || "Cleanup not confirmed; retry recovery" };
    return { ok: false, data: null, cleanupPending: false, error: "Upload was not finalized; staged object removed" };
  } catch (error) { return { ok: false, cleanupPending: true, error: `Cleanup pending: ${error.message}` }; }
}
export async function uploadDocument(client, doc, file) {
  const error = validateDocument(file);
  if (error) return { ok: false, error };
  const reserved = await recordRpc(client, "stage_document_upload", { p_id: doc.id, p_name: file.name, p_mime: file.type,
    p_size: file.size, p_expected_version: doc.upload_version });
  if (!reserved.ok) return reserved;
  const upload = reserved.data.upload;
  if (!upload?.id || !upload.file_path?.startsWith(`${doc.intern_id}/`) || upload.document_id !== doc.id) return { ok: false, cleanupPending: true, error: "Invalid upload reservation; refresh before retrying" };
  let failure;
  try {
    const { error: storageError } = await client.storage.from("documents").upload(upload.file_path, file, { upsert: false, contentType: file.type });
    if (storageError) throw new Error(storageError.message);
    const result = await recordRpc(client, "finalize_document_upload", { p_upload_id: upload.id });
    if (result.ok && result.data.id === doc.id) return result;
    failure = result.error || "Unexpected finalized document; refresh";
  } catch (error) { failure = error.message || "Upload failed"; }
  const recovery = await recoverUpload(client, upload.id);
  return recovery.ok ? recovery : { ...recovery, uploadId: upload.id, error: `${failure}. ${recovery.error}` };
}
export async function documentLink(client, doc, download = false) {
  const access = await recordRpc(client, "document_access", { p_id: doc.id, p_expected_version: doc.upload_version, p_expected_revision: doc.review_revision });
  if (!access.ok) return access;
  try {
    const { data, error } = await client.storage.from("documents").createSignedUrl(access.data.file_path, 60,
      download ? { download: access.data.file_name || "document" } : {});
    if (error) throw new Error(error.message);
    const url = new URL(data?.signedUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Invalid file link");
    return { ok: true, url: url.href, expiresAt: Date.now() + 60000, error: null };
  } catch (error) { return { ok: false, url: null, error: error.message || "File link unavailable; retry" }; }
}

const prefix = "insync:announcement:v1:";
const ttl = 24 * 60 * 60 * 1000;
const uuid = /^[0-9a-f-]{36}$/;
export const emptyAnnouncement = () => ({ title: "", body: "", target: "All Interns" });

export function readAnnouncementDraft(owner, storage, now = Date.now()) {
  try {
    storage ??= window.sessionStorage;
    const raw = storage.getItem(prefix + owner);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.owner !== owner || !Number.isFinite(saved.at) || typeof saved.form?.title !== "string" || saved.form.title.length > 200
      || typeof saved.form.body !== "string" || saved.form.body.length > 5000 || typeof saved.form.target !== "string"
      || (saved.attempt && (!uuid.test(saved.attempt.id) || typeof saved.attempt.fingerprint !== "string"))) return null;
    // Unsent drafts expire. An uncertain send retains its identity until reconciled.
    if (!saved.attempt && now - saved.at > ttl) { storage.removeItem(prefix + owner); return null; }
    return saved;
  } catch { return null; }
}
export function writeAnnouncementDraft(owner, form, attempt, storage) {
  try { storage ??= window.sessionStorage; storage.setItem(prefix + owner, JSON.stringify({ owner, form, attempt, at: Date.now() })); return true; }
  catch { return false; }
}
export function clearAnnouncementDraft(owner, storage) {
  try { storage ??= window.sessionStorage; storage.removeItem(prefix + owner); } catch { /* Success remains authoritative; reconciliation on next load is safe. */ }
}
export function clearUnsentAnnouncementDrafts(storage) {
  try {
    storage ??= window.sessionStorage;
    for (const key of Object.keys(storage)) if (key.startsWith(prefix)) {
      const saved = JSON.parse(storage.getItem(key));
      if (!saved?.attempt) storage.removeItem(key);
    }
  } catch { /* Storage may be disabled; sending is separately guarded. */ }
}

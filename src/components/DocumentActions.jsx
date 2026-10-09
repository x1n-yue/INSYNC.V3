import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { documentLink } from "../lib/documents";

export default function DocumentActions({ doc }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  useEffect(() => {
    const guard = sequence;
    guard.current += 1;
    setLink(null); setError(""); setBusy(false);
    return () => { guard.current += 1; };
  }, [doc.id, doc.upload_version, doc.review_revision, doc.file_path]);
  useEffect(() => {
    if (!link) return;
    const timer = setTimeout(() => { setLink(null); setError("Link expired. Request a new link."); }, Math.max(0, link.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [link]);
  const prepare = async (download) => {
    if (busy) return;
    const request = ++sequence.current;
    setBusy(true); setLink(null); setError("");
    try {
      const result = await documentLink(supabase, doc, download);
      if (request !== sequence.current) return;
      if (result.ok) setLink({ ...result, download }); else setError(result.error);
    } catch (failure) {
      if (request === sequence.current) setError(failure.message || "File link unavailable; retry");
    } finally { if (request === sequence.current) setBusy(false); }
  };
  return <div className="document-actions text-xs mt-2 space-y-1">
    <div className="flex flex-wrap gap-2">
      <button disabled={busy || !doc.file_path} onClick={() => prepare(false)} className="px-3 py-2 rounded-lg border disabled:opacity-50" style={{ borderColor: "var(--border)" }}>{busy ? "Preparing..." : "View file"}</button>
      <button disabled={busy || !doc.file_path} onClick={() => prepare(true)} className="px-3 py-2 rounded-lg border disabled:opacity-50" style={{ borderColor: "var(--border)" }}>Download file</button>
    </div>
    {link && <p><a href={link.url} target="_blank" rel="noopener noreferrer" className="underline">{link.download ? "Download prepared file" : "Open prepared file"}</a> · Link expires in 60 seconds. Request a new link if access fails.</p>}
    {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
    {doc.file_path && doc.upload_version === 0 && <p>Legacy evidence: resubmission required before approval or clearance.</p>}
  </div>;
}

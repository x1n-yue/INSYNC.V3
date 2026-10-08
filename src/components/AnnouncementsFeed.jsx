import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { announcementFeed } from "../lib/workflows";

export default function AnnouncementsFeed() {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const sequence = useRef(0);
  const load = async () => {
    const request = ++sequence.current;
    setState({ loading: true, data: null, error: null });
    const result = await announcementFeed(supabase);
    if (request !== sequence.current) return;
    setState({ loading: false, data: result.data?.sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) ?? null, error: result.error });
  };
  useEffect(() => { const guard = sequence; load(); return () => { guard.current++; }; }, []);
  return <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
    <div className="flex justify-between"><h2 className="text-sm font-semibold">Announcements</h2><button disabled={state.loading} onClick={load} className="text-xs underline">{state.error ? "Retry" : "Refresh"}</button></div>
    {state.loading && <p className="text-xs" role="status">Loading announcements...</p>}
    {state.error && <p className="text-xs" role="alert">Announcements unavailable: {state.error}</p>}
    {!state.loading && !state.error && state.data?.length === 0 && <p className="text-xs">No announcements for you yet.</p>}
    {state.data?.map(a => <article key={a.id} className="space-y-1 border-t pt-2">
      <h3 className="text-sm font-semibold">{a.title}</h3>
      <p className="text-xs whitespace-pre-wrap break-words">{a.body}</p>
      <p className="text-xs">{new Date(a.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · {a.target_section_id ? `Section: ${a.section_name ?? "Previous section"}` : a.target_intern_id ? "Personal" : "Roster announcement"}</p>
    </article>)}
  </section>;
}

import { useEffect, useState } from "react";

export default function RefreshStatus({ loading, lastUpdated, onRefresh }) {
  const [suggestRefresh, setSuggestRefresh] = useState(false);
  useEffect(() => {
    setSuggestRefresh(false);
    const suggest = () => { if (lastUpdated && Date.now() - lastUpdated.getTime() >= 60000) setSuggestRefresh(true); };
    const timer = setTimeout(() => setSuggestRefresh(Boolean(lastUpdated)), 300000);
    window.addEventListener("focus", suggest);
    return () => { clearTimeout(timer); window.removeEventListener("focus", suggest); };
  }, [lastUpdated]);
  return <div className="toolbar text-xs rounded-lg px-3 py-2" style={{ background: "var(--secondary)" }} aria-live="polite">
    <button disabled={loading} onClick={onRefresh} className="px-3 py-2 rounded-lg font-semibold disabled:opacity-50"
      style={{ background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)" }}>{loading ? "Refreshing…" : "Refresh data"}</button>
    <span className="flex-1 min-w-0 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
      {lastUpdated ? `Last updated: ${lastUpdated.toLocaleString("en-PH", { timeZone: "Asia/Manila", hour12: true })}` : "No complete refresh yet"}
      {" · Refresh to load changes made by other users."}
    </span>
    {suggestRefresh && <span role="status">Data may have changed. Refresh when ready; your current draft will stay open.</span>}
  </div>;
}

export default function RefreshStatus({ loading, lastUpdated, onRefresh }) {
  return <div className="flex flex-wrap items-center gap-3 text-xs" aria-live="polite">
    <button disabled={loading} onClick={onRefresh} className="px-3 py-2 rounded-lg font-semibold disabled:opacity-50"
      style={{ background: "var(--secondary)", color: "var(--foreground)" }}>{loading ? "Refreshing…" : "Refresh data"}</button>
    <span style={{ color: "var(--muted-foreground)" }}>
      {lastUpdated ? `Last updated: ${lastUpdated.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}` : "No complete refresh yet"}
      {" · Refresh to load changes made by other users."}
    </span>
  </div>;
}

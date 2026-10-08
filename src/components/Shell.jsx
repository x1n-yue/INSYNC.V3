import { useState } from "react";
import { IconGradCap, IconChevronLeft, IconChevronRight, IconLogOut, IconGrid } from "./Icons";

const MAX_BOTTOM_TABS = 5; // if navItems fits within this, show them all; otherwise 4 + "More"

export default function Shell({
  userName,
  userEmail,
  userRole,
  navItems,
  activeTab,
  onTabChange,
  onLogout,
  children,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const needsOverflow = navItems.length > MAX_BOTTOM_TABS;
  const primaryTabs = needsOverflow ? navItems.slice(0, 4) : navItems;
  const overflowTabs = needsOverflow ? navItems.slice(4) : [];
  const overflowHasActive = overflowTabs.some((item) => item.id === activeTab);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Desktop sidebar (md and up) ─────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col shrink-0 transition-all duration-200"
        style={{
          width: collapsed ? "60px" : "220px",
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-4 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--primary)" }}
          >
            <IconGradCap size={16} style={{ color: "#fff" }} strokeWidth={1.6} />
          </div>
          {!collapsed && (
            <span className="text-sm font-bold tracking-tight" style={{ color: "var(--sidebar-fg)" }}>
              INSync
            </span>
          )}
        </div>

        {/* User info */}
        <div className="px-4 py-4 shrink-0" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: "var(--sidebar-fg)" }}>
                  {userEmail}
                </div>
                <div
                  className="text-xs mt-0.5 px-1.5 py-0.5 rounded inline-block"
                  style={{ background: "var(--sidebar-active-bg)", color: "var(--sidebar-active-fg)", fontSize: "10px" }}
                >
                  {userRole}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                title={collapsed ? item.label : undefined}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all text-left"
                style={{
                  background: isActive ? "var(--sidebar-active-bg)" : "transparent",
                  color: isActive ? "var(--sidebar-active-fg)" : "var(--sidebar-muted)",
                  borderLeft: isActive ? "2px solid var(--primary)" : "2px solid transparent",
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                <span className="shrink-0 flex items-center">{item.icon}</span>
                {!collapsed && <span className="truncate text-xs">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="shrink-0 pb-2" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand" : "Collapse"}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-all hover:opacity-80"
            style={{ color: "var(--sidebar-muted)" }}
          >
            <span className="shrink-0 flex items-center">
              {collapsed ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
            </span>
            {!collapsed && <span>Collapse</span>}
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-all hover:opacity-80"
            style={{ color: "var(--sidebar-muted)" }}
          >
            <span className="shrink-0 flex items-center">
              <IconLogOut size={14} />
            </span>
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Right-hand column: mobile top bar + shared content + mobile bottom tabs ── */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Mobile top bar (below md only) */}
        <header
          className="md:hidden h-14 shrink-0 flex items-center justify-between px-4"
          style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--primary)" }}>
              <IconGradCap size={14} style={{ color: "#fff" }} strokeWidth={1.6} />
            </div>
            <span className="text-sm font-bold tracking-tight" style={{ color: "var(--sidebar-fg)" }}>INSync</span>
          </div>
          <button
            onClick={() => setShowProfile(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ background: "var(--primary)", color: "#fff" }}
          >
            {initials}
          </button>
        </header>

        {/* Content — single shared instance for both desktop and mobile */}
        <main className="flex-1 overflow-y-auto" style={{ background: "var(--background)" }}>
          {children}
        </main>

        {/* Mobile bottom tab bar (below md only) */}
        <nav
          className="md:hidden shrink-0 flex items-stretch"
          style={{ background: "var(--sidebar-bg)", borderTop: "1px solid var(--sidebar-border)", height: "60px" }}
        >
          {primaryTabs.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onTabChange(item.id); setShowMore(false); }}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
                style={{ color: isActive ? "var(--primary)" : "var(--sidebar-muted)" }}
              >
                <span className="flex items-center justify-center">{item.icon}</span>
                <span className="text-[10px] leading-tight truncate max-w-full px-0.5" style={{ fontWeight: isActive ? 600 : 400 }}>
                  {item.label}
                </span>
              </button>
            );
          })}
          {needsOverflow && (
            <button
              onClick={() => setShowMore(true)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
              style={{ color: overflowHasActive ? "var(--primary)" : "var(--sidebar-muted)" }}
            >
              <span className="flex items-center justify-center"><IconGrid size={15} /></span>
              <span className="text-[10px] leading-tight" style={{ fontWeight: overflowHasActive ? 600 : 400 }}>More</span>
            </button>
          )}
        </nav>
      </div>

      {/* ── Mobile "More" sheet ──────────────────────────────────────────── */}
      {showMore && (
        <div className="fixed inset-0 z-50 md:hidden flex items-end" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setShowMore(false)}>
          <div
            className="w-full rounded-t-2xl overflow-hidden"
            style={{ background: "var(--card)", maxHeight: "70vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-sm font-semibold">More</span>
              <button onClick={() => setShowMore(false)} className="text-lg" style={{ color: "var(--muted-foreground)" }}>×</button>
            </div>
            <div className="overflow-y-auto py-2" style={{ maxHeight: "calc(70vh - 56px)" }}>
              {overflowTabs.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onTabChange(item.id); setShowMore(false); }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left"
                    style={{ background: isActive ? "var(--primary-light)" : "transparent", color: isActive ? "var(--primary)" : "var(--foreground)" }}
                  >
                    <span className="shrink-0 flex items-center">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile profile sheet ─────────────────────────────────────────── */}
      {showProfile && (
        <div className="fixed inset-0 z-50 md:hidden flex items-end" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setShowProfile(false)}>
          <div className="w-full rounded-t-2xl overflow-hidden" style={{ background: "var(--card)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: "var(--primary)", color: "#fff" }}>
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{userEmail}</div>
                <div className="text-xs mt-0.5 px-1.5 py-0.5 rounded inline-block" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
                  {userRole}
                </div>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-5 py-4 text-sm text-left"
              style={{ color: "var(--danger)" }}
            >
              <IconLogOut size={15} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

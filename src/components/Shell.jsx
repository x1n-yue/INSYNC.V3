import { useId, useState } from "react";
import { IconGradCap, IconChevronLeft, IconChevronRight, IconLogOut, IconGrid } from "./Icons";

import Modal from "./Modal";

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
  const mainId = useId();

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
    <div className="app-shell flex overflow-hidden">
      <a className="skip-link" href={`#${mainId}`} onClick={event => { event.preventDefault(); document.getElementById(mainId)?.focus(); }}>Skip to content</a>
      {/* ── Desktop sidebar (md and up) ─────────────────────────────────── */}
      <aside
        className="sidebar hidden md:flex flex-col shrink-0 transition-all duration-200"
        style={{
          width: collapsed ? "68px" : "240px",
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-4 py-5 shrink-0"
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--primary)" }}
          >
            <IconGradCap size={16} style={{ color: "#fff" }} strokeWidth={1.6} />
          </div>
          {!collapsed && (
            <div>
              <div className="text-sm font-bold tracking-tight" style={{ color: "var(--sidebar-fg)" }}>INSync</div>
              <div className="text-[10px] mt-0.5 tracking-wide" style={{ color: "var(--sidebar-muted)" }}>INTERNSHIP PORTAL</div>
            </div>
          )}
        </div>

        {/* User info */}
        <button type="button" aria-label="Open profile" aria-haspopup="dialog" aria-expanded={showProfile} onClick={() => setShowProfile(true)} className="px-4 py-4 shrink-0 text-left" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              style={{ background: "var(--primary)", color: "#fff" }}
            >
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate" style={{ color: "var(--sidebar-fg)" }}>{userName}</div>
                <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--sidebar-muted)" }}>
                  {userEmail}
                </div>
                <div
                  className="text-xs mt-2 px-2 py-1 rounded-md inline-block"
                  style={{ background: "var(--sidebar-active-bg)", color: "var(--sidebar-active-fg)", fontSize: "10px" }}
                >
                  {userRole}
                </div>
              </div>
            )}
          </div>
        </button>

        {/* Nav */}
        <nav aria-label="Main navigation" className="flex-1 px-2 py-3 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all text-left"
                style={{
                  background: isActive ? "var(--sidebar-active-bg)" : "transparent",
                  color: isActive ? "var(--sidebar-active-fg)" : "var(--sidebar-muted)",
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                <span className="shrink-0 flex items-center">{item.icon}</span>
                {!collapsed && <span className="truncate text-xs">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <footer className="shrink-0 px-2 py-2" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
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
            aria-label="Sign out"
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-all hover:opacity-80"
            style={{ color: "var(--sidebar-muted)" }}
          >
            <span className="shrink-0 flex items-center">
              <IconLogOut size={14} />
            </span>
            {!collapsed && <span>Sign Out</span>}
          </button>
        </footer>
      </aside>

      {/* ── Right-hand column: mobile top bar + shared content + mobile bottom tabs ── */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Mobile top bar (below md only) */}
        <header
          className="mobile-header md:hidden h-14 shrink-0 flex items-center justify-between px-4"
          style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--primary)" }}>
              <IconGradCap size={14} style={{ color: "#fff" }} strokeWidth={1.6} />
            </div>
            <span className="text-sm font-bold tracking-tight" style={{ color: "var(--sidebar-fg)" }}>INSync</span>
          </div>
          <button
            aria-label="Open profile"
            aria-haspopup="dialog"
            aria-expanded={showProfile}
            onClick={() => setShowProfile(true)}
            className="icon-button rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ background: "var(--primary)", color: "#fff" }}
          >
            {initials}
          </button>
        </header>

        {/* Content — single shared instance for both desktop and mobile */}
        <main id={mainId} tabIndex={-1} aria-label="Workspace" className="flex-1 min-h-0 overflow-y-auto" style={{ background: "var(--background)" }}>
          {children}
        </main>

        {/* Mobile bottom tab bar (below md only) */}
        <nav
          aria-label="Mobile navigation"
          className="mobile-navigation md:hidden shrink-0 flex items-stretch"
          style={{ background: "var(--sidebar-bg)", borderTop: "1px solid var(--sidebar-border)", minHeight: "60px" }}
        >
          {primaryTabs.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onTabChange(item.id); setShowMore(false); }}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className="min-w-0 flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors"
                style={{ color: isActive ? "var(--sidebar-active-fg)" : "var(--sidebar-muted)", background: isActive ? "var(--sidebar-active-bg)" : "transparent" }}
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
              aria-haspopup="dialog"
              aria-expanded={showMore}
              aria-current={overflowHasActive ? "true" : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
              style={{ color: overflowHasActive ? "var(--sidebar-active-fg)" : "var(--sidebar-muted)", background: overflowHasActive ? "var(--sidebar-active-bg)" : "transparent" }}
            >
              <span className="flex items-center justify-center"><IconGrid size={15} /></span>
              <span className="text-[10px] leading-tight" style={{ fontWeight: overflowHasActive ? 600 : 400 }}>More</span>
            </button>
          )}
        </nav>
      </div>

      {/* ── Mobile "More" sheet ──────────────────────────────────────────── */}
      {showMore && (
        <Modal title="More navigation" onClose={() => setShowMore(false)}>
            <div className="overflow-y-auto py-2" style={{ maxHeight: "calc(70vh - 56px)" }}>
              {overflowTabs.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onTabChange(item.id); setShowMore(false); }}
                    aria-current={isActive ? "page" : undefined}
                    className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left"
                    style={{ background: isActive ? "var(--primary-light)" : "transparent", color: isActive ? "var(--primary)" : "var(--foreground)" }}
                  >
                    <span className="shrink-0 flex items-center">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
        </Modal>
      )}

      {/* ── Mobile profile sheet ─────────────────────────────────────────── */}
      {showProfile && (
        <Modal title="Your profile" onClose={() => setShowProfile(false)}>
            <div className="px-5 pt-5 pb-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: "var(--primary)", color: "#fff" }}>
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold break-words">{userName}</div>
                <div className="text-sm break-all">{userEmail}</div>
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
        </Modal>
      )}
    </div>
  );
}

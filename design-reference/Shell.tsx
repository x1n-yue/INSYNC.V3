import { useState } from "react";
import { IconGradCap, IconChevronLeft, IconChevronRight, IconLogOut, IconMenu, IconX } from "./Icons";
import Modal from "./Modal";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface Props {
  userName: string;
  userEmail: string;
  userRole: string;
  navItems: NavItem[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function Shell({
  userName, userEmail, userRole, navItems, activeTab, onTabChange, onLogout, children,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const initials = userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const handleNav = (id: string) => {
    onTabChange(id);
    setMobileOpen(false);
  };

  const SidebarContent = ({ compact }: { compact?: boolean }) => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 shrink-0" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: "var(--primary)" }}>
          <IconGradCap size={16} style={{ color: "#fff" }} strokeWidth={1.6} />
        </div>
        {!compact && (
          <div>
            <div className="text-sm font-bold tracking-tight" style={{ color: "var(--sidebar-fg)" }}>INSync</div>
            <div className="text-[10px] mt-0.5 tracking-wide" style={{ color: "var(--sidebar-muted)" }}>INTERNSHIP PORTAL</div>
          </div>
        )}
      </div>

      {/* User info */}
      <div className="px-4 py-4 shrink-0" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
        <button type="button" onClick={() => setProfileOpen(true)} className="w-full flex items-center gap-3 text-left rounded-lg" aria-label="Open profile">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ring-2 ring-white/10"
            style={{ background: "var(--primary)", color: "#fff" }}>
            {initials}
          </div>
          {!compact && (
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate" style={{ color: "var(--sidebar-fg)" }}>{userName}</div>
              <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--sidebar-muted)" }}>{userEmail}</div>
            </div>
          )}
        </button>
        {!compact && (
          <div className="text-[10px] mt-3 px-2 py-1 rounded-md inline-block font-medium"
            style={{ background: "var(--sidebar-active-bg)", color: "var(--sidebar-active-fg)" }}>
            {userRole}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto" aria-label="Primary navigation">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button key={item.id} onClick={() => handleNav(item.id)}
              title={compact ? item.label : undefined}
              className="w-full flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg text-sm transition-all text-left hover:bg-white/5"
              aria-current={isActive ? "page" : undefined}
              style={{
                background: isActive ? "var(--sidebar-active-bg)" : "transparent",
                color: isActive ? "var(--sidebar-active-fg)" : "var(--sidebar-muted)",
                fontWeight: isActive ? 600 : 500,
              }}>
              <span className="shrink-0 flex items-center">{item.icon}</span>
              {!compact && <span className="truncate text-xs">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 pb-2" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        {!compact && (
          <button onClick={() => setCollapsed(!collapsed)} title="Collapse"
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-all hover:opacity-80"
            style={{ color: "var(--sidebar-muted)" }}>
            <span className="shrink-0 flex items-center"><IconChevronLeft size={14} /></span>
            <span>Collapse</span>
          </button>
        )}
        {compact && !mobileOpen && (
          <button onClick={() => setCollapsed(false)} title="Expand"
            className="w-full flex items-center justify-center px-4 py-2.5 text-xs transition-all hover:opacity-80"
            style={{ color: "var(--sidebar-muted)" }}>
            <IconChevronRight size={14} />
          </button>
        )}
        <button onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-all hover:opacity-80"
          style={{ color: "var(--sidebar-muted)" }}>
          <span className="shrink-0 flex items-center"><IconLogOut size={14} /></span>
          {!compact && <span>Sign Out</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Mobile overlay drawer ──────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.55)" }}
            onClick={() => setMobileOpen(false)} />
          {/* Drawer */}
          <aside className="relative flex flex-col w-72 h-full z-10 overflow-hidden"
            style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border)" }}>
          <button onClick={() => setMobileOpen(false)} aria-label="Close navigation"
              className="absolute top-3.5 right-3.5 p-1.5 rounded-lg z-10 transition-opacity hover:opacity-70"
              style={{ color: "var(--sidebar-muted)" }}>
              <IconX size={16} />
            </button>
            <SidebarContent compact={false} />
          </aside>
        </div>
      )}

      {/* ── Desktop sidebar ────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col shrink-0 transition-all duration-200 shadow-xl shadow-slate-950/5"
        style={{ width: collapsed ? "64px" : "240px", background: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border)" }}>
        {collapsed ? (
          <>
            {/* Compact logo */}
            <div className="flex items-center justify-center px-4 py-4 shrink-0"
              style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--primary)" }}>
                <IconGradCap size={16} style={{ color: "#fff" }} strokeWidth={1.6} />
              </div>
            </div>
            {/* Compact avatar */}
            <div className="flex justify-center px-4 py-4 shrink-0"
              style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
              <button type="button" onClick={() => setProfileOpen(true)} aria-label="Open profile"
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{ background: "var(--primary)", color: "#fff" }}>
                {initials}
              </button>
            </div>
            {/* Compact nav */}
            <nav className="flex-1 py-3 overflow-y-auto" aria-label="Primary navigation">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button key={item.id} onClick={() => handleNav(item.id)} title={item.label}
                    aria-current={isActive ? "page" : undefined}
                    className="w-full flex items-center justify-center py-3 transition-all"
                    style={{
                      background: isActive ? "var(--sidebar-active-bg)" : "transparent",
                      color: isActive ? "var(--sidebar-active-fg)" : "var(--sidebar-muted)",
                      borderLeft: isActive ? "2px solid var(--primary)" : "2px solid transparent",
                    }}>
                    {item.icon}
                  </button>
                );
              })}
            </nav>
            <div className="shrink-0 pb-2" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
              <button onClick={() => setCollapsed(false)} title="Expand"
                className="w-full flex items-center justify-center py-2.5 hover:opacity-80"
                style={{ color: "var(--sidebar-muted)" }}>
                <IconChevronRight size={14} />
              </button>
              <button onClick={onLogout} title="Sign Out"
                className="w-full flex items-center justify-center py-2.5 hover:opacity-80"
                style={{ color: "var(--sidebar-muted)" }}>
                <IconLogOut size={14} />
              </button>
            </div>
          </>
        ) : (
          <SidebarContent compact={false} />
        )}
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 shrink-0 shadow-sm"
          style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => setMobileOpen(true)} aria-label="Open More menu" className="p-2 rounded-lg transition-colors hover:bg-slate-100"
            style={{ color: "var(--foreground)" }}>
            <IconMenu size={18} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "var(--primary)" }}>
              <IconGradCap size={12} style={{ color: "#fff" }} strokeWidth={1.6} />
            </div>
            <span className="text-sm font-bold tracking-tight" style={{ color: "var(--foreground)" }}>INSync</span>
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>·</span>
            <span className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
              {navItems.find((n) => n.id === activeTab)?.label}
            </span>
          </div>
          <button type="button" onClick={() => setProfileOpen(true)} aria-label="Open profile"
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ background: "var(--primary)", color: "#fff" }}>
            {initials}
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>

      {profileOpen && (
        <Modal title="Profile" onClose={() => setProfileOpen(false)} width="420px">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold truncate">{userName}</div>
                <div className="text-sm truncate" style={{ color: "var(--muted-foreground)" }}>{userEmail}</div>
              </div>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between gap-4 px-4 py-3" style={{ background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Role</span>
                <span className="text-xs font-semibold">{userRole}</span>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Account status</span>
                <span className="text-xs font-semibold" style={{ color: "var(--success)" }}>Active</span>
              </div>
            </div>
            <button type="button" onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold"
              style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
              <IconLogOut size={14} />
              Sign Out
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

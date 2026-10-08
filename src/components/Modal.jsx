import { useEffect, useId, useRef } from "react";

export default function Modal({ title, onClose, children, width = "460px" }) {
  const dialogRef = useRef(null);
  const previousFocus = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  // Keep keyboard dismissal current without resetting focus on parent renders.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () => [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
    const first = focusable()[0];
    first?.focus();
    const handler = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const current = document.activeElement;
      const index = items.indexOf(current);
      if (e.shiftKey && (index <= 0 || current === dialog)) { e.preventDefault(); items.at(-1).focus(); }
      else if (!e.shiftKey && index === items.length - 1) { e.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (previousFocus.current?.focus) previousFocus.current.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="w-full rounded-2xl shadow-xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
        style={{ maxWidth: width, background: "var(--card)", border: "1px solid var(--border)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 id={titleId} className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-lg transition-opacity hover:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}
          >
            ×
          </button>
        </div>
        <div className="px-5 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

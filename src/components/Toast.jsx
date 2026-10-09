import { useState, useCallback, createContext, useContext } from "react";
import { IconCheck, IconAlertTriangle } from "./Icons";

const ToastContext = createContext({ toast: () => {} });

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = "success") => {
    const id = ++counter;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div role="region" aria-label="Notifications" className="toast-stack fixed space-y-2 z-50 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            aria-atomic="true"
            className="notification-toast flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm pointer-events-auto"
            style={{
              background: t.type === "error" ? "var(--danger-bg)" : t.type === "info" ? "var(--info-bg)" : "var(--success-bg)",
              color: t.type === "error" ? "var(--danger)" : t.type === "info" ? "var(--info)" : "var(--success)",
              border: `1px solid ${t.type === "error" ? "#fca5a5" : t.type === "info" ? "#bae6fd" : "#86efac"}`,
              animation: "slideUp 0.2s ease-out",
            }}
          >
            <span aria-hidden="true" className="shrink-0 mt-0.5">{t.type === "error" ? (
              <IconAlertTriangle size={14} strokeWidth={2} />
            ) : (
              <IconCheck size={14} strokeWidth={2.5} />
            )}</span>
            <span className="min-w-0">{t.message}</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

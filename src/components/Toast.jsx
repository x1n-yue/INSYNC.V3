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
      <div className="fixed bottom-5 right-5 space-y-2 z-50 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm pointer-events-auto"
            style={{
              background: t.type === "error" ? "var(--danger-bg)" : t.type === "info" ? "var(--info-bg)" : "#f0fdf4",
              color: t.type === "error" ? "var(--danger)" : t.type === "info" ? "var(--info)" : "var(--success)",
              border: `1px solid ${t.type === "error" ? "#fca5a5" : t.type === "info" ? "#bae6fd" : "#86efac"}`,
              animation: "slideUp 0.2s ease-out",
            }}
          >
            {t.type === "error" ? (
              <IconAlertTriangle size={14} strokeWidth={2} />
            ) : (
              <IconCheck size={14} strokeWidth={2.5} />
            )}
            {t.message}
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

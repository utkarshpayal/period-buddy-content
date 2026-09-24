import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; message: string };

type ToastApi = {
  show: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS: Record<ToastTone, number> = { success: 3500, info: 4500, error: 6000 };
const MAX_VISIBLE = 4;

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 size={18} />,
  error: <AlertCircle size={18} />,
  info: <Info size={18} />
};

/**
 * Floating, auto-dismissing messages (top-right). Used instead of inline
 * success banners, which pushed the page content down every time they
 * appeared and disappeared.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((prev) => {
        // Collapse an identical message that's already showing (e.g. saving
        // the same setting twice) instead of stacking duplicates.
        const rest = prev.filter((t) => !(t.message === message && t.tone === tone));
        return [...rest, { id, tone, message }].slice(-MAX_VISIBLE);
      });
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS[tone])
      );
    },
    [dismiss]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  const api = React.useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, "success"),
      error: (m) => show(m, "error")
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
            <span className="toast-icon">{ICONS[t.tone]}</span>
            <span className="toast-message">{t.message}</span>
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
};

/**
 * Bridges a page's existing `notice` state to a toast: whenever a success
 * message is set it's shown as a toast and the state is cleared, so pages
 * keep calling setNotice(...) exactly as before.
 */
export const useNoticeToast = (notice: string | null, clear: () => void) => {
  const toast = useToast();
  const clearRef = useRef(clear);
  clearRef.current = clear;
  useEffect(() => {
    if (!notice) return;
    toast.success(notice);
    clearRef.current();
  }, [notice, toast]);
};

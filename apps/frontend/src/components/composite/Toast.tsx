import { cn } from "@/lib/cn";
import { AlertCircle, AlertTriangle, Check, Info, X } from "@/tokens/icons";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useToast } from "./useToast";
import type { Toast as ToastType } from "./useToast";

const DEFAULT_DURATION = 5000;

type ToastVariant = NonNullable<ToastType["variant"]>;

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "border-l-[var(--color-action-success)] bg-[var(--color-action-success)]/10",
  error: "border-l-[var(--color-action-danger)] bg-[var(--color-action-danger)]/10",
  warning: "border-l-[var(--color-action-warning)] bg-[var(--color-action-warning)]/10",
  info: "border-l-[var(--color-action-primary)] bg-[var(--color-action-primary)]/10",
};

const VARIANT_ICONS: Record<ToastVariant, ReactNode> = {
  success: <Check size={18} className="text-[var(--color-action-success)]" aria-hidden="true" />,
  error: <AlertCircle size={18} className="text-[var(--color-action-danger)]" aria-hidden="true" />,
  warning: (
    <AlertTriangle size={18} className="text-[var(--color-action-warning)]" aria-hidden="true" />
  ),
  info: <Info size={18} className="text-[var(--color-action-primary)]" aria-hidden="true" />,
};

/** Renders a single toast notification with auto-dismiss. */
function ToastItem({ toast, onRemove }: { toast: ToastType; onRemove: (id: string) => void }) {
  const variant = toast.variant ?? "info";
  const duration = toast.duration ?? DEFAULT_DURATION;

  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, onRemove]);

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 p-3 rounded-[var(--radius-md)]",
        "border border-[var(--color-border-default)] border-l-4",
        "bg-[var(--color-surface-secondary)] shadow-[var(--shadow-md)]",
        "animate-[slideInRight_var(--duration-fast)_var(--ease-default)]",
        VARIANT_CLASSES[variant],
      )}
    >
      <span className="shrink-0 mt-0.5">{VARIANT_ICONS[variant]}</span>
      <p className="flex-1 text-sm text-[var(--color-text-primary)]">{toast.message}</p>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className={cn(
          "shrink-0 p-0.5 rounded-[var(--radius-sm)]",
          "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
          "hover:bg-[var(--color-surface-tertiary)]",
          "transition-colors duration-[var(--duration-fast)]",
        )}
        aria-label="Dismiss"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Container that renders all active toasts. Place once at the app root. */
export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-label="Notifications"
      className={cn(
        "fixed top-[var(--spacing-4)] right-[var(--spacing-4)] z-50",
        "flex flex-col gap-[var(--spacing-2)] w-80",
      )}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>,
    document.body,
  );
}

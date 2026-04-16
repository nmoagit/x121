import { cn } from "@/lib/cn";
import { Spinner } from "@/components/primitives/Spinner";
import { X } from "@/tokens/icons";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "full";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalSize;
  /** Show a centered spinner placeholder instead of children. */
  loading?: boolean;
  children: ReactNode;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  full: "max-w-[calc(100vw-var(--spacing-8))]",
};

export function Modal({ open, onClose, title, size = "md", loading, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus the dialog only when it first opens.
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement;

    requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });
  }, [open]);

  // Keyboard handling and body scroll lock — stable deps, no focus stealing.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") {
        trapFocus(e, dialogRef.current);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    if ("target" in e && e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-[var(--color-surface-badge-overlay)] backdrop-blur-sm",
        "animate-[fadeIn_var(--duration-fast)_var(--ease-default)]",
      )}
      role="presentation"
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropClick}
    >
      <dialog
        ref={dialogRef}
        open
        tabIndex={-1}
        aria-label={title}
        className={cn(
          "relative w-full mx-[var(--spacing-4)] max-h-[calc(100vh-var(--spacing-8))]",
          "flex flex-col",
          "bg-[var(--color-surface-primary)] text-[var(--color-text-primary)]",
          "border border-[var(--color-border-default)] rounded-[var(--radius-lg)]",
          "shadow-[0_8px_32px_rgba(0,0,0,0.6)]",
          "animate-[scaleIn_var(--duration-fast)_var(--ease-default)]",
          "focus:outline-none",
          SIZE_CLASSES[size],
        )}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] rounded-t-[var(--radius-lg)] shrink-0">
            <h2 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-0.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              aria-label="Close"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Close button when no title */}
        {!title && (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "absolute top-2 right-2 z-10",
              "p-0.5 rounded-[var(--radius-sm)]",
              "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              "transition-colors",
            )}
            aria-label="Close"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}

        {/* Body */}
        <div className="overflow-y-auto min-h-0 px-3 py-2 scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center min-h-[120px]">
              <Spinner size="md" />
            </div>
          ) : (
            children
          )}
        </div>
      </dialog>
    </div>,
    document.body,
  );
}

function trapFocus(e: KeyboardEvent, container: HTMLDialogElement | null) {
  if (!container) return;

  const focusable = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (!first || !last) return;

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

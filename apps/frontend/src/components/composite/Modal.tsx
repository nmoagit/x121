import { cn } from "@/lib/cn";
import { X } from "@/tokens/icons";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalSize = "sm" | "md" | "lg" | "xl";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalSize;
  children: ReactNode;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

export function Modal({ open, onClose, title, size = "md", children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        trapFocus(e, dialogRef.current);
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    if ("target" in e && e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-[var(--color-surface-overlay)]",
        "animate-[fadeIn_var(--duration-fast)_var(--ease-default)]",
      )}
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropClick}
      aria-hidden="true"
    >
      <dialog
        ref={dialogRef}
        open
        tabIndex={-1}
        aria-label={title}
        className={cn(
          "relative w-full mx-[var(--spacing-4)]",
          "bg-[var(--color-surface-secondary)] rounded-[var(--radius-lg)]",
          "shadow-[var(--shadow-lg)] p-[var(--spacing-6)]",
          "animate-[scaleIn_var(--duration-fast)_var(--ease-default)]",
          "focus:outline-none",
          SIZE_CLASSES[size],
        )}
      >
        {title && (
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] pr-8 mb-[var(--spacing-4)]">
            {title}
          </h2>
        )}

        <button
          type="button"
          onClick={onClose}
          className={cn(
            "absolute top-[var(--spacing-4)] right-[var(--spacing-4)]",
            "p-1 rounded-[var(--radius-sm)]",
            "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            "hover:bg-[var(--color-surface-tertiary)]",
            "transition-colors duration-[var(--duration-fast)]",
          )}
          aria-label="Close"
        >
          <X size={20} aria-hidden="true" />
        </button>

        {children}
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

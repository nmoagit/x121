import { cn } from "@/lib/cn";
import { X } from "@/tokens/icons";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type DrawerPosition = "left" | "right";
type DrawerSize = "sm" | "md" | "lg";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  position?: DrawerPosition;
  size?: DrawerSize;
  title?: string;
  children: ReactNode;
}

const SIZE_CLASSES: Record<DrawerSize, string> = {
  sm: "w-80", // 320px
  md: "w-[480px]",
  lg: "w-[640px]",
};

const POSITION_CLASSES: Record<DrawerPosition, string> = {
  left: "left-0 right-auto top-0 bottom-0",
  right: "right-0 left-auto top-0 bottom-0",
};

const SLIDE_ANIMATION: Record<DrawerPosition, string> = {
  left: "animate-[slideInLeft_var(--duration-normal)_var(--ease-default)]",
  right: "animate-[slideInRight_var(--duration-normal)_var(--ease-default)]",
};

export function Drawer({
  open,
  onClose,
  position = "right",
  size = "md",
  title,
  children,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus the drawer only when it first opens.
  useEffect(() => {
    if (!open) return;

    requestAnimationFrame(() => {
      drawerRef.current?.focus();
    });
  }, [open]);

  // Escape key and body scroll lock — stable deps, no focus stealing.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    if ("target" in e && e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50",
        "bg-[var(--color-surface-overlay)]",
        "animate-[fadeIn_var(--duration-fast)_var(--ease-default)]",
      )}
      role="presentation"
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropClick}
    >
      <dialog
        ref={drawerRef}
        open
        tabIndex={-1}
        aria-label={title}
        className={cn(
          "fixed flex flex-col h-full m-0 p-0 border-none",
          "bg-[var(--color-surface-secondary)] shadow-[var(--shadow-lg)]",
          "focus:outline-none",
          SIZE_CLASSES[size],
          POSITION_CLASSES[position],
          SLIDE_ANIMATION[position],
        )}
      >
        <div className="flex items-center justify-between p-[var(--spacing-4)] border-b border-[var(--color-border-default)]">
          {title && (
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "p-1 rounded-[var(--radius-sm)] ml-auto",
              "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              "hover:bg-[var(--color-surface-tertiary)]",
              "transition-colors duration-[var(--duration-fast)]",
            )}
            aria-label="Close"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-[var(--spacing-4)]">{children}</div>
      </dialog>
    </div>,
    document.body,
  );
}

/**
 * SplitButton — a button with a primary action and a dropdown for secondary actions.
 *
 * Follows the same styling patterns as the Button component.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/cn";
import { ChevronDown } from "@/tokens/icons";

import { Tooltip } from "./Tooltip";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

type SplitButtonVariant = "primary" | "secondary" | "danger";
type SplitButtonSize = "sm" | "md";

interface SplitButtonAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface SplitButtonProps {
  children: ReactNode;
  onClick: (e: React.MouseEvent) => void;
  actions: SplitButtonAction[];
  variant?: SplitButtonVariant;
  size?: SplitButtonSize;
  icon?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
  className?: string;
}

/* --------------------------------------------------------------------------
   Style maps
   -------------------------------------------------------------------------- */

const VARIANT_CLASSES: Record<SplitButtonVariant, string> = {
  primary: [
    "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]",
    "hover:bg-[var(--color-action-primary-hover)]",
  ].join(" "),
  secondary: [
    "bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]",
    "border border-[var(--color-border-default)]",
    "hover:bg-[var(--color-surface-secondary)]",
  ].join(" "),
  danger: [
    "bg-[var(--color-action-danger)] text-[var(--color-text-inverse)]",
    "hover:bg-[var(--color-action-danger-hover)]",
  ].join(" "),
};

const SIZE_CLASSES: Record<SplitButtonSize, string> = {
  sm: "text-sm",
  md: "text-base",
};

const MAIN_PADDING: Record<SplitButtonSize, string> = {
  sm: "px-3 py-1.5 gap-1.5",
  md: "px-4 py-2 gap-2",
};

const ARROW_PADDING: Record<SplitButtonSize, string> = {
  sm: "px-1.5 py-1.5",
  md: "px-2 py-2",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SplitButton({
  children,
  onClick,
  actions,
  variant = "secondary",
  size = "sm",
  icon,
  disabled = false,
  disabledReason,
  loading = false,
  className,
}: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape — must check both the button container
  // AND the portalled dropdown menu since they are in different DOM trees.
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const isDisabled = disabled || loading;

  // Compute portal position from the arrow button's bounding rect.
  const arrowRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !arrowRef.current) return;
    const rect = arrowRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.right });
  }, [open]);

  const content = (
    <div
      ref={containerRef}
      className={cn("relative flex", className)}
    >
      {/* Main button — flex-1 so it fills the available width */}
      <button
        type="button"
        disabled={isDisabled}
        onClick={onClick}
        className={cn(
          "flex-1 inline-flex items-center justify-center font-medium",
          "rounded-l-[var(--radius-md)] rounded-r-none",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
          "disabled:opacity-50 disabled:pointer-events-none",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          MAIN_PADDING[size],
          variant === "secondary" && "border-r-0",
        )}
      >
        {icon && (
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
        {children}
      </button>

      {/* Dropdown arrow — fixed width */}
      <button
        ref={arrowRef}
        type="button"
        disabled={isDisabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={cn(
          "shrink-0 inline-flex items-center justify-center",
          "rounded-r-[var(--radius-md)] rounded-l-none",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
          "disabled:opacity-50 disabled:pointer-events-none",
          "border-l border-l-[var(--color-border-default)]/30",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          ARROW_PADDING[size],
        )}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="More actions"
      >
        <ChevronDown size={size === "sm" ? 14 : 16} />
      </button>

      {/* Dropdown menu — portalled to body to escape overflow-hidden containers */}
      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, transform: "translateX(-100%)" }}
          className={cn(
            "z-50 min-w-[160px] py-1",
            "bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)]",
            "rounded-[var(--radius-md)] shadow-[var(--shadow-lg)]",
            "animate-[fadeIn_var(--duration-fast)_var(--ease-default)]",
          )}
        >
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left",
                "text-[var(--color-text-primary)]",
                "hover:bg-[var(--color-surface-tertiary)]",
                "disabled:opacity-50 disabled:pointer-events-none",
                "transition-colors duration-[var(--duration-fast)]",
              )}
            >
              {action.icon && (
                <span className="shrink-0" aria-hidden="true">
                  {action.icon}
                </span>
              )}
              {action.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );

  if (isDisabled && disabledReason) {
    return <Tooltip content={disabledReason}>{content}</Tooltip>;
  }
  return content;
}

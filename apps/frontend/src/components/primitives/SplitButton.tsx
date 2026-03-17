/**
 * SplitButton — a button with a primary action and a dropdown for secondary actions.
 *
 * Follows the same styling patterns as the Button component.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { ChevronDown } from "@/tokens/icons";

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

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const isDisabled = disabled || loading;

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-flex", className)}
      title={isDisabled ? disabledReason : undefined}
    >
      {/* Main button */}
      <button
        type="button"
        disabled={isDisabled}
        onClick={onClick}
        className={cn(
          "inline-flex items-center justify-center font-medium",
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

      {/* Dropdown arrow */}
      <button
        type="button"
        disabled={isDisabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={cn(
          "inline-flex items-center justify-center",
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

      {/* Dropdown menu */}
      {open && (
        <div
          className={cn(
            "absolute top-full right-0 mt-1 z-50",
            "min-w-[160px] py-1",
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
        </div>
      )}
    </div>
  );
}

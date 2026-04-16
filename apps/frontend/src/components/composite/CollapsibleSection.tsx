import { useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { TERMINAL_PANEL } from "@/lib/ui-classes";
import { ChevronDown } from "@/tokens/icons";

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  /** Controlled open state. When provided, `onToggle` must also be provided. */
  open?: boolean;
  /** Callback for controlled mode. */
  onToggle?: () => void;
  /** Wrap in a card with border and background. */
  card?: boolean;
  /** Action buttons rendered to the right of the title (click events stop propagation). */
  actions?: ReactNode;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  description,
  defaultOpen = true,
  open: controlledOpen,
  onToggle,
  card = false,
  actions,
  children,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const toggle = onToggle ?? (() => setInternalOpen((prev) => !prev));

  if (!card) {
    // Non-card mode — simple section with no wrapper styling
    return (
      <div>
        <div className="flex w-full items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggle}
            className="flex flex-1 items-center justify-between text-left group min-w-0"
          >
            <div className="min-w-0">
              <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">{title}</h3>
              {description && (
                <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)] font-mono">{description}</p>
              )}
            </div>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={cn(
                "shrink-0 text-[var(--color-text-muted)] transition-transform duration-150",
                open && "rotate-180",
              )}
            />
          </button>
          {actions && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          )}
        </div>

        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-[var(--ease-default)]",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="pt-3">{children}</div>
          </div>
        </div>
      </div>
    );
  }

  // Card mode — terminal-style dark panel
  return (
    <div className={TERMINAL_PANEL}>
      {/* Header */}
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          className="flex flex-1 items-center justify-between text-left px-[var(--spacing-3)] py-[var(--spacing-2)] bg-[var(--color-surface-secondary)] hover:bg-[var(--color-surface-tertiary)] transition-colors min-w-0"
        >
          <div className="min-w-0">
            <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">{title}</h3>
            {description && (
              <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)] font-mono opacity-60">{description}</p>
            )}
          </div>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-[var(--color-text-muted)] transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </button>
        {actions && (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div className="shrink-0 pr-[var(--spacing-3)]" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-[var(--ease-default)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="p-[var(--spacing-3)]">{children}</div>
        </div>
      </div>
    </div>
  );
}

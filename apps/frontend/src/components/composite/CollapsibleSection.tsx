import { useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
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

  return (
    <div
      className={cn(
        card && "rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-4",
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          className="flex flex-1 items-center justify-between text-left group min-w-0"
        >
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h3>
            {description && (
              <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{description}</p>
            )}
          </div>
          <ChevronDown
            size={16}
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

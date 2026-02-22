/**
 * Visual indicator showing whether a metadata field is linked or copied (PRD-60).
 *
 * Displays a small badge/icon next to a field name to communicate
 * its synchronisation status with the library character.
 */

import { cn } from "@/lib/cn";
import { Check, Copy } from "@/tokens/icons";

type LinkMode = "linked" | "copied";

interface LinkedFieldIndicatorProps {
  mode: LinkMode;
  onToggle?: () => void;
  className?: string;
}

const MODE_CONFIG: Record<
  LinkMode,
  { label: string; icon: typeof Check; color: string; bgColor: string }
> = {
  linked: {
    label: "Linked",
    icon: Check,
    color: "text-[var(--color-status-success)]",
    bgColor: "bg-[var(--color-status-success)]/10",
  },
  copied: {
    label: "Copied",
    icon: Copy,
    color: "text-[var(--color-text-muted)]",
    bgColor: "bg-[var(--color-surface-tertiary)]",
  },
};

export function LinkedFieldIndicator({
  mode,
  onToggle,
  className,
}: LinkedFieldIndicatorProps) {
  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  const content = (
    <>
      <Icon size={12} aria-hidden="true" />
      <span>{config.label}</span>
    </>
  );

  const baseClasses = cn(
    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium",
    config.color,
    config.bgColor,
    className,
  );

  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          baseClasses,
          "cursor-pointer hover:opacity-80 transition-opacity",
        )}
        title={`Click to switch to ${mode === "linked" ? "copied" : "linked"}`}
        data-testid={`field-indicator-${mode}`}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={baseClasses} data-testid={`field-indicator-${mode}`}>
      {content}
    </span>
  );
}

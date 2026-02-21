/**
 * Review controls for cinema and grid modes (PRD-036 Phase 4).
 *
 * Provides approve/reject/flag buttons with keyboard shortcut integration,
 * and visual feedback (green/red flash) on action execution.
 */

import { useCallback, useState } from "react";

import { cn } from "@/lib/cn";
import { Check, AlertTriangle, XCircle } from "@/tokens/icons";

import { useShortcut } from "@/features/shortcuts";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const FLASH_DURATION_MS = 600;

type ReviewAction = "approve" | "reject" | "flag";

const ACTION_CONFIG: Record<
  ReviewAction,
  {
    label: string;
    shortcutKey: string;
    shortcutId: string;
    icon: typeof Check;
    buttonClass: string;
    flashClass: string;
  }
> = {
  approve: {
    label: "Approve",
    shortcutKey: "a",
    shortcutId: "review.cinemaApprove",
    icon: Check,
    buttonClass:
      "bg-[var(--color-action-success)]/20 text-[var(--color-action-success)] hover:bg-[var(--color-action-success)]/40",
    flashClass: "bg-[var(--color-action-success)]/30",
  },
  reject: {
    label: "Reject",
    shortcutKey: "r",
    shortcutId: "review.cinemaReject",
    icon: XCircle,
    buttonClass:
      "bg-[var(--color-action-danger)]/20 text-[var(--color-action-danger)] hover:bg-[var(--color-action-danger)]/40",
    flashClass: "bg-[var(--color-action-danger)]/30",
  },
  flag: {
    label: "Flag",
    shortcutKey: "f",
    shortcutId: "review.cinemaFlag",
    icon: AlertTriangle,
    buttonClass:
      "bg-[var(--color-action-warning)]/20 text-[var(--color-action-warning)] hover:bg-[var(--color-action-warning)]/40",
    flashClass: "bg-[var(--color-action-warning)]/30",
  },
};

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CinemaReviewControlsProps {
  onApprove: () => void;
  onReject: () => void;
  onFlag: () => void;
  /** Optional cell label for grid mode. */
  cellLabel?: string;
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CinemaReviewControls({
  onApprove,
  onReject,
  onFlag,
  cellLabel,
  className,
}: CinemaReviewControlsProps) {
  const [flash, setFlash] = useState<ReviewAction | null>(null);

  const triggerFlash = useCallback((action: ReviewAction) => {
    setFlash(action);
    const timer = setTimeout(() => setFlash(null), FLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  const handleAction = useCallback(
    (action: ReviewAction, handler: () => void) => {
      handler();
      triggerFlash(action);
    },
    [triggerFlash],
  );

  const handleApprove = useCallback(
    () => handleAction("approve", onApprove),
    [handleAction, onApprove],
  );

  const handleReject = useCallback(
    () => handleAction("reject", onReject),
    [handleAction, onReject],
  );

  const handleFlag = useCallback(
    () => handleAction("flag", onFlag),
    [handleAction, onFlag],
  );

  // Register keyboard shortcuts.
  useShortcut(
    {
      id: ACTION_CONFIG.approve.shortcutId,
      key: ACTION_CONFIG.approve.shortcutKey,
      label: "Approve segment",
      category: "review",
      action: handleApprove,
    },
    [handleApprove],
  );

  useShortcut(
    {
      id: ACTION_CONFIG.reject.shortcutId,
      key: ACTION_CONFIG.reject.shortcutKey,
      label: "Reject segment",
      category: "review",
      action: handleReject,
    },
    [handleReject],
  );

  useShortcut(
    {
      id: ACTION_CONFIG.flag.shortcutId,
      key: ACTION_CONFIG.flag.shortcutKey,
      label: "Flag segment",
      category: "review",
      action: handleFlag,
    },
    [handleFlag],
  );

  const actions: Array<{ key: ReviewAction; handler: () => void }> = [
    { key: "approve", handler: handleApprove },
    { key: "reject", handler: handleReject },
    { key: "flag", handler: handleFlag },
  ];

  return (
    <div className={cn("relative", className)}>
      {/* Flash overlay */}
      {flash && (
        <div
          className={cn(
            "absolute inset-0 pointer-events-none rounded-[var(--radius-md)]",
            "animate-pulse",
            ACTION_CONFIG[flash].flashClass,
          )}
        />
      )}

      {/* Controls */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        {cellLabel && (
          <span className="text-xs text-[var(--color-text-muted)] mr-[var(--spacing-1)]">
            {cellLabel}
          </span>
        )}

        {actions.map(({ key, handler }) => {
          const config = ACTION_CONFIG[key];
          const Icon = config.icon;
          return (
            <button
              key={key}
              type="button"
              onClick={handler}
              className={cn(
                "inline-flex items-center gap-[var(--spacing-1)]",
                "px-[var(--spacing-2)] py-[var(--spacing-1)]",
                "text-sm rounded-[var(--radius-md)]",
                "transition-colors duration-[var(--duration-fast)]",
                config.buttonClass,
              )}
              title={`${config.label} (${config.shortcutKey.toUpperCase()})`}
            >
              <Icon size={16} />
              <span>{config.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

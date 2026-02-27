/**
 * Warning banner shown when restart-required settings have been changed (PRD-110).
 */

import { useState } from "react";

import { cn } from "@/lib/cn";
import { AlertTriangle, X } from "@/tokens/icons";

interface RestartBannerProps {
  pendingKeys: string[];
}

export function RestartBanner({ pendingKeys }: RestartBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || pendingKeys.length === 0) return null;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-[var(--spacing-3)]",
        "rounded-[var(--radius-md)] border",
        "border-[var(--color-action-warning)]/30 bg-[var(--color-action-warning)]/10",
        "p-[var(--spacing-4)]",
      )}
    >
      <AlertTriangle
        size={20}
        className="mt-0.5 shrink-0 text-[var(--color-action-warning)]"
        aria-hidden
      />

      <div className="flex-1">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">
          Restart required
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          The following settings have been changed and require an application
          restart to take effect:{" "}
          <span className="font-medium text-[var(--color-text-secondary)]">
            {pendingKeys.join(", ")}
          </span>
        </p>
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        className={cn(
          "shrink-0 rounded-[var(--radius-sm)] p-1",
          "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
          "transition-colors duration-[var(--duration-fast)]",
        )}
        aria-label="Dismiss restart warning"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

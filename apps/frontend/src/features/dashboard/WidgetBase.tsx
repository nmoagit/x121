import type { ReactNode } from "react";

import { Button ,  WireframeLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_BODY,
} from "@/lib/ui-classes";
import { AlertCircle, RefreshCw } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface WidgetBaseProps {
  /** Widget title displayed in the header. */
  title: string;
  /** Optional icon displayed before the title. */
  icon?: ReactNode;
  /** Whether the widget is in a loading state. */
  loading?: boolean;
  /** Error message to display. Shows retry button when set. */
  error?: string;
  /** Optional action buttons in the header (right side). */
  headerActions?: ReactNode;
  /** Called when the user clicks the retry button in the error state. */
  onRetry?: () => void;
  /** Additional CSS class for the outer panel. */
  className?: string;
  /** Widget content. */
  children: ReactNode;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

/**
 * Shared container for all dashboard widgets (PRD-42).
 *
 * Uses the terminal panel aesthetic: dark bg, monospace header, compact body.
 * Provides consistent header styling, loading skeleton, and error state
 * with retry. All core widgets extend this base component.
 *
 * Designed for extensibility: PRD-89 will add widget customization hooks.
 */
export function WidgetBase({
  title,
  icon,
  loading = false,
  error,
  headerActions,
  onRetry,
  className,
  children,
}: WidgetBaseProps) {
  return (
    <div className={cn(TERMINAL_PANEL, "flex flex-col h-full", className)}>
      <div className={cn(TERMINAL_HEADER, "flex items-center justify-between")}>
        <div className="flex items-center gap-[var(--spacing-2)]">
          {icon && (
            <span className="text-[var(--color-text-muted)]" aria-hidden="true">
              {icon}
            </span>
          )}
          <h3 className={TERMINAL_HEADER_TITLE}>{title}</h3>
        </div>
        {headerActions && <div className="flex items-center gap-1">{headerActions}</div>}
      </div>

      <div className={cn(TERMINAL_BODY, "flex-1 overflow-auto")}>
        {loading ? (
          <div className="flex items-center justify-center py-[var(--spacing-8)]">
            <WireframeLoader size={48} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)] text-center">
            <AlertCircle
              size={24}
              className="text-red-400"
              aria-hidden="true"
            />
            <p className="text-xs font-mono text-[var(--color-text-muted)]">{error}</p>
            {onRetry && (
              <Button
                variant="secondary"
                size="xs"
                icon={<RefreshCw size={14} />}
                onClick={onRetry}
              >
                Retry
              </Button>
            )}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

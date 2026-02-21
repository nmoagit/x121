import type { ReactNode } from "react";

import { Card, CardBody, CardHeader } from "@/components/composite/Card";
import { Button } from "@/components/primitives";
import { Spinner } from "@/components/primitives";
import { cn } from "@/lib/cn";
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
  /** Additional CSS class for the outer card. */
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
 * Provides consistent header styling, loading skeleton, and error state
 * with retry. All four core widgets extend this base component.
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
    <Card className={cn("flex flex-col h-full", className)} elevation="sm" padding="none">
      <CardHeader className="flex items-center justify-between px-[var(--spacing-4)] py-[var(--spacing-3)]">
        <div className="flex items-center gap-[var(--spacing-2)]">
          {icon && (
            <span className="text-[var(--color-text-muted)]" aria-hidden="true">
              {icon}
            </span>
          )}
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
        </div>
        {headerActions && <div className="flex items-center gap-1">{headerActions}</div>}
      </CardHeader>

      <CardBody className="flex-1 overflow-auto px-[var(--spacing-4)] py-[var(--spacing-3)]">
        {loading ? (
          <div className="flex items-center justify-center py-[var(--spacing-8)]">
            <Spinner size="md" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)] text-center">
            <AlertCircle
              size={24}
              className="text-[var(--color-action-danger)]"
              aria-hidden="true"
            />
            <p className="text-sm text-[var(--color-text-muted)]">{error}</p>
            {onRetry && (
              <Button
                variant="secondary"
                size="sm"
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
      </CardBody>
    </Card>
  );
}

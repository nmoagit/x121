/**
 * Compact infrastructure status summary for the generation page.
 *
 * Shows connection status and a link to the full infrastructure
 * control panel. Start/stop controls live on the dedicated page.
 */

import { Link } from "@tanstack/react-router";

import { Badge, Spinner } from "@/components/primitives";
import { Server, ArrowRight } from "@/tokens/icons";
import { cn } from "@/lib/cn";

import { useInfrastructureStatus } from "./hooks/use-infrastructure";

export function InfrastructurePanel() {
  const { data: status, isLoading } = useInfrastructureStatus();

  const connectedCount = status?.connected_count ?? 0;
  const isConnected = connectedCount > 0;

  return (
    <div className="rounded-lg border border-[var(--color-border-default)] overflow-hidden">
      <div className="flex items-center justify-between px-[var(--spacing-3)] py-[var(--spacing-2)] bg-[var(--color-surface-tertiary)]">
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Server size={14} className="text-[var(--color-text-muted)]" />
          <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
            Infrastructure
          </span>
        </div>

        {isLoading ? (
          <Spinner size="sm" />
        ) : (
          <div className="flex items-center gap-[var(--spacing-2)]">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                isConnected
                  ? "bg-[var(--color-action-success)]"
                  : "bg-[var(--color-text-muted)]",
              )}
            />
            <Badge
              size="sm"
              variant={isConnected ? "success" : "default"}
            >
              {isConnected
                ? `${connectedCount} connected`
                : "Disconnected"}
            </Badge>
          </div>
        )}
      </div>

      <div className="px-[var(--spacing-3)] py-[var(--spacing-2)] border-t border-[var(--color-border-default)]">
        <Link
          to="/admin/infrastructure"
          className="inline-flex items-center gap-[var(--spacing-1)] text-xs text-[var(--color-action-primary)] hover:underline"
        >
          Manage Infrastructure
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

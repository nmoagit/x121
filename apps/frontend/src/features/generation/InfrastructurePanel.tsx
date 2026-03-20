/**
 * Compact infrastructure status summary for the generation page.
 *
 * Shows connection status and a link to the full infrastructure
 * control panel. Start/stop controls live on the dedicated page.
 */

import { Link } from "@tanstack/react-router";

import { WireframeLoader } from "@/components/primitives";
import { Server, ArrowRight } from "@/tokens/icons";
import { cn } from "@/lib/cn";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_BODY,
} from "@/lib/ui-classes";

import { useInfrastructureStatus } from "./hooks/use-infrastructure";

export function InfrastructurePanel() {
  const { data: status, isLoading } = useInfrastructureStatus();

  const connectedCount = status?.connected_count ?? 0;
  const isConnected = connectedCount > 0;

  return (
    <div className={TERMINAL_PANEL}>
      <div className={`${TERMINAL_HEADER} flex items-center justify-between`}>
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Server size={14} className="text-[var(--color-text-muted)]" />
          <span className={TERMINAL_HEADER_TITLE}>
            Infrastructure
          </span>
        </div>

        {isLoading ? (
          <WireframeLoader size={32} />
        ) : (
          <div className="flex items-center gap-[var(--spacing-2)]">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                isConnected
                  ? "bg-green-400"
                  : "bg-[var(--color-text-muted)]",
              )}
            />
            <span className={`font-mono text-xs ${isConnected ? "text-green-400" : "text-[var(--color-text-muted)]"}`}>
              {isConnected
                ? `${connectedCount} connected`
                : "Disconnected"}
            </span>
          </div>
        )}
      </div>

      <div className={TERMINAL_BODY}>
        <Link
          to="/admin/infrastructure"
          className="inline-flex items-center gap-[var(--spacing-1)] font-mono text-xs text-[var(--color-action-primary)] hover:underline"
        >
          Manage Infrastructure
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

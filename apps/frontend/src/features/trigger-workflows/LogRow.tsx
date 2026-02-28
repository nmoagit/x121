/**
 * Expandable trigger log row (PRD-97).
 *
 * Displays a single log entry with expandable JSON detail panels
 * for event_data and actions_taken.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

import type { TriggerLog } from "./types";
import { TRIGGER_RESULT_BADGE } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function LogRow({ log }: { log: TriggerLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={cn(
          "border-b border-[var(--color-border-default)] last:border-b-0",
          "hover:bg-[var(--color-surface-tertiary)]/50",
          "transition-colors duration-[var(--duration-instant)] cursor-pointer",
        )}
        onClick={() => setExpanded((prev) => !prev)}
        data-testid={`log-row-${log.id}`}
      >
        <td className="px-3 py-2.5 text-sm text-[var(--color-text-secondary)]">
          {formatDateTime(log.created_at)}
        </td>
        <td className="px-3 py-2.5 text-sm text-[var(--color-text-primary)]">
          #{log.trigger_id}
        </td>
        <td className="px-3 py-2.5">
          <Badge variant={TRIGGER_RESULT_BADGE[log.result]} size="sm">
            {log.result}
          </Badge>
        </td>
        <td className="px-3 py-2.5 text-sm text-[var(--color-text-secondary)] text-center">
          {log.chain_depth}
        </td>
        <td className="px-3 py-2.5 text-sm text-[var(--color-action-danger)]">
          {log.error_message ?? "\u2014"}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="px-4 py-3 bg-[var(--color-surface-primary)]">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                  Event Data
                </p>
                <pre className="text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-secondary)] px-3 py-2 rounded-[var(--radius-md)] overflow-auto max-h-40">
                  {JSON.stringify(log.event_data, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                  Actions Taken
                </p>
                <pre className="text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-secondary)] px-3 py-2 rounded-[var(--radius-md)] overflow-auto max-h-40">
                  {JSON.stringify(log.actions_taken, null, 2)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

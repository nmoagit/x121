/**
 * DeliveryRow -- single delivery log entry in the table (PRD-99).
 *
 * Displays timestamp, endpoint, event type, status, duration, and result
 * badges. Expandable to show full request/response detail via
 * FailedDeliveryInspector.
 */

import { useCallback } from "react";

import { Badge, Button } from "@/components/primitives";
import { formatDateTime } from "@/lib/format";
import { RefreshCw } from "@/tokens/icons";

import { FailedDeliveryInspector } from "./FailedDeliveryInspector";
import { useReplay } from "./hooks/use-webhook-testing";
import type { WebhookDeliveryLog } from "./types";
import { ENDPOINT_TYPE_LABEL } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface DeliveryRowProps {
  delivery: WebhookDeliveryLog;
  isExpanded: boolean;
  onToggle: () => void;
}

export function DeliveryRow({ delivery, isExpanded, onToggle }: DeliveryRowProps) {
  const replayMutation = useReplay(delivery.id);

  const handleReplay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      replayMutation.mutate();
    },
    [replayMutation],
  );

  return (
    <>
      <tr
        data-testid={`delivery-row-${delivery.id}`}
        className="cursor-pointer border-b border-[var(--color-border-default)] hover:bg-[var(--color-surface-tertiary)]"
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
          {formatDateTime(delivery.created_at)}
        </td>
        <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
          {ENDPOINT_TYPE_LABEL[delivery.endpoint_type] ?? delivery.endpoint_type}
          {" #"}
          {delivery.endpoint_id}
        </td>
        <td className="px-4 py-3">
          <Badge variant="default" size="sm">
            {delivery.event_type}
          </Badge>
        </td>
        <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
          {delivery.response_status ?? "-"}
        </td>
        <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
          {delivery.duration_ms}ms
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Badge variant={delivery.success ? "success" : "danger"} size="sm">
              {delivery.success ? "OK" : "Fail"}
            </Badge>
            {delivery.is_test && (
              <Badge variant="info" size="sm">Test</Badge>
            )}
            {delivery.is_replay && (
              <Badge variant="warning" size="sm">Replay</Badge>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReplay}
            loading={replayMutation.isPending}
            icon={<RefreshCw size={14} />}
            aria-label={`Replay delivery ${delivery.id}`}
          >
            Replay
          </Button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="bg-[var(--color-surface-tertiary)] px-4 py-4">
            <FailedDeliveryInspector delivery={delivery} />
          </td>
        </tr>
      )}
    </>
  );
}

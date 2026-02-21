/**
 * Delivery history log for a single webhook (PRD-12).
 *
 * Displays deliveries with status, response codes, and retry info.
 * Supports replaying failed deliveries.
 */

import { useCallback } from "react";

import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Spinner } from "@/components/primitives";
import { formatDateTime } from "@/lib/format";
import { RefreshCw } from "@/tokens/icons";

import { useReplayDelivery, useWebhookDeliveries } from "./hooks/use-api-keys";
import type { Webhook, WebhookDelivery } from "./types";

/* --------------------------------------------------------------------------
   Status badge helper
   -------------------------------------------------------------------------- */

function deliveryBadgeVariant(status: WebhookDelivery["status"]): "success" | "danger" | "warning" | "default" {
  switch (status) {
    case "delivered":
      return "success";
    case "failed":
      return "danger";
    case "retrying":
      return "warning";
    default:
      return "default";
  }
}

/* --------------------------------------------------------------------------
   Delivery row
   -------------------------------------------------------------------------- */

interface DeliveryRowProps {
  delivery: WebhookDelivery;
  onReplay: (id: number) => void;
  isReplaying: boolean;
}

function DeliveryRow({ delivery, onReplay, isReplaying }: DeliveryRowProps) {
  const canReplay = delivery.status === "failed" || delivery.status === "delivered";

  return (
    <tr className="border-b border-[var(--color-border-default)]">
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        {delivery.id}
      </td>
      <td className="px-4 py-3">
        <Badge variant={deliveryBadgeVariant(delivery.status)} size="sm">
          {delivery.status}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        {delivery.response_status_code ?? "-"}
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        {delivery.attempt_count} / {delivery.max_attempts}
      </td>
      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
        {delivery.delivered_at
          ? formatDateTime(delivery.delivered_at)
          : delivery.next_retry_at
            ? `Retry at ${formatDateTime(delivery.next_retry_at)}`
            : "Pending"}
      </td>
      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
        {formatDateTime(delivery.created_at)}
      </td>
      <td className="px-4 py-3">
        {canReplay && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReplay(delivery.id)}
            loading={isReplaying}
            icon={<RefreshCw size={14} />}
            aria-label={`Replay delivery ${delivery.id}`}
          >
            Replay
          </Button>
        )}
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export interface DeliveryLogProps {
  webhook: Webhook;
}

export function DeliveryLog({ webhook }: DeliveryLogProps) {
  const { data: deliveries, isLoading } = useWebhookDeliveries(webhook.id);
  const replayMutation = useReplayDelivery();

  const handleReplay = useCallback(
    (deliveryId: number) => {
      replayMutation.mutate(deliveryId);
    },
    [replayMutation],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <Stack gap={4}>
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Delivery History: {webhook.name}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {webhook.url}
        </p>
      </div>

      <Card elevation="sm" padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">ID</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Status</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">HTTP Code</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Attempts</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Delivered / Next</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Created</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!deliveries || deliveries.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                  >
                    No deliveries yet for this webhook.
                  </td>
                </tr>
              ) : (
                deliveries.map((d) => (
                  <DeliveryRow
                    key={d.id}
                    delivery={d}
                    onReplay={handleReplay}
                    isReplaying={replayMutation.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
}

/**
 * FailedDeliveryInspector -- full request/response detail view (PRD-99).
 *
 * Shows method, URL, headers, body for both request and response.
 * Displays retry history, replay button, and "Copy as cURL" functionality.
 */

import { useCallback } from "react";

import { Stack } from "@/components/layout";
import { Badge, Button } from "@/components/primitives";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { Copy, RefreshCw } from "@/tokens/icons";

import { useReplay } from "./hooks/use-webhook-testing";
import type { WebhookDeliveryLog } from "./types";

/* --------------------------------------------------------------------------
   cURL generator
   -------------------------------------------------------------------------- */

function buildCurlCommand(delivery: WebhookDeliveryLog): string {
  const parts = [`curl -X ${delivery.request_method}`];

  if (delivery.request_headers_json) {
    for (const [key, value] of Object.entries(delivery.request_headers_json)) {
      parts.push(`-H '${key}: ${String(value)}'`);
    }
  }

  if (delivery.request_body_json) {
    parts.push(`-d '${JSON.stringify(delivery.request_body_json)}'`);
  }

  parts.push(`'${delivery.request_url}'`);
  return parts.join(" \\\n  ");
}

/* --------------------------------------------------------------------------
   JSON section sub-component
   -------------------------------------------------------------------------- */

interface JsonSectionProps {
  label: string;
  data: Record<string, unknown> | null;
  testId?: string;
}

function JsonSection({ label, data, testId }: JsonSectionProps) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
        {label}
      </span>
      <pre
        data-testid={testId}
        className="max-h-40 overflow-auto rounded bg-[var(--color-bg-secondary)] p-2 font-mono text-xs text-[var(--color-text-primary)]"
      >
        {data ? JSON.stringify(data, null, 2) : "(none)"}
      </pre>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface FailedDeliveryInspectorProps {
  delivery: WebhookDeliveryLog;
}

export function FailedDeliveryInspector({ delivery }: FailedDeliveryInspectorProps) {
  const replayMutation = useReplay(delivery.id);
  const { copied, copy } = useCopyToClipboard();

  const handleCopyCurl = useCallback(() => {
    copy(buildCurlCommand(delivery));
  }, [delivery, copy]);

  const handleReplay = useCallback(() => {
    replayMutation.mutate();
  }, [replayMutation]);

  return (
    <div data-testid="delivery-inspector" className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleReplay}
          loading={replayMutation.isPending}
          icon={<RefreshCw size={14} />}
        >
          Replay
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyCurl}
          icon={<Copy size={14} />}
        >
          {copied ? "Copied" : "Copy as cURL"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Request side */}
        <Stack gap={3}>
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Request
          </h4>
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <Badge variant="info" size="sm">{delivery.request_method}</Badge>
            <span className="truncate">{delivery.request_url}</span>
          </div>
          <JsonSection
            label="Headers"
            data={delivery.request_headers_json}
            testId="request-headers"
          />
          <JsonSection
            label="Body"
            data={delivery.request_body_json}
            testId="request-body"
          />
        </Stack>

        {/* Response side */}
        <Stack gap={3}>
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Response
          </h4>
          <div className="flex items-center gap-2">
            <Badge
              variant={delivery.success ? "success" : "danger"}
              size="sm"
            >
              {delivery.response_status ?? "N/A"}
            </Badge>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {delivery.duration_ms}ms
            </span>
          </div>
          <JsonSection
            label="Headers"
            data={delivery.response_headers_json}
            testId="response-headers"
          />
          <div>
            <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
              Body
            </span>
            <pre
              data-testid="response-body"
              className="max-h-40 overflow-auto rounded bg-[var(--color-bg-secondary)] p-2 font-mono text-xs text-[var(--color-text-primary)]"
            >
              {delivery.response_body ?? "(no response body)"}
            </pre>
          </div>
        </Stack>
      </div>

      {/* Error message */}
      {delivery.error_message && (
        <div>
          <span className="mb-1 block text-xs font-medium text-[var(--color-action-danger)]">
            Error
          </span>
          <pre className="max-h-32 overflow-auto rounded bg-red-50 p-2 font-mono text-xs text-red-700">
            {delivery.error_message}
          </pre>
        </div>
      )}

      {/* Retry info */}
      {delivery.retry_count > 0 && (
        <div className="text-xs text-[var(--color-text-muted)]">
          Retried {delivery.retry_count} {delivery.retry_count === 1 ? "time" : "times"}
          {delivery.replay_of_id != null && (
            <span> (replay of #{delivery.replay_of_id})</span>
          )}
        </div>
      )}
    </div>
  );
}

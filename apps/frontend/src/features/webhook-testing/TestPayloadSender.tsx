/**
 * TestPayloadSender -- send test webhook payloads to endpoints (PRD-99).
 *
 * Provides endpoint selection, event type dropdown with sample payload
 * preview, a custom JSON editor, and result display.
 */

import { useCallback, useState } from "react";

import { Card, CardBody, CardHeader } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Select ,  ContextLoader } from "@/components/primitives";

import { useSamplePayloads, useTestSend } from "./hooks/use-webhook-testing";
import { TestResultDisplay } from "./TestResultDisplay";
import type { SamplePayload, WebhookDeliveryLog } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEFAULT_PAYLOAD = JSON.stringify(
  { example: "test", timestamp: new Date().toISOString() },
  null,
  2,
);

/* --------------------------------------------------------------------------
   Sample preview sub-component
   -------------------------------------------------------------------------- */

function SamplePreview({ sample }: { sample?: SamplePayload }) {
  if (!sample) return null;

  return (
    <div className="rounded border border-dashed border-[var(--color-border-default)] p-3">
      <span className="text-xs font-medium text-[var(--color-text-secondary)]">
        Sample: {sample.description}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function TestPayloadSender() {
  const [endpointId, setEndpointId] = useState("");
  const [eventType, setEventType] = useState("");
  const [payloadText, setPayloadText] = useState(DEFAULT_PAYLOAD);
  const [result, setResult] = useState<WebhookDeliveryLog | null>(null);

  const { data: samplePayloads = [], isLoading: samplesLoading } = useSamplePayloads();
  const testSend = useTestSend(Number(endpointId) || 0);

  const eventTypeOptions = samplePayloads.map((sp: SamplePayload) => ({
    value: sp.event_type,
    label: sp.event_type,
  }));

  const handleEventTypeChange = useCallback(
    (value: string) => {
      setEventType(value);
      const sample = samplePayloads.find((sp: SamplePayload) => sp.event_type === value);
      if (sample) {
        setPayloadText(JSON.stringify(sample.payload, null, 2));
      }
    },
    [samplePayloads],
  );

  const handleSend = useCallback(() => {
    if (!endpointId || !eventType) return;

    let payload: Record<string, unknown> | undefined;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      // If invalid JSON, send without payload
    }

    testSend.mutate(
      { event_type: eventType, payload },
      { onSuccess: (data) => setResult(data) },
    );
  }, [endpointId, eventType, payloadText, testSend]);

  return (
    <Card>
      <CardHeader>
        <h3
          data-testid="sender-title"
          className="text-sm font-semibold text-[var(--color-text-primary)]"
        >
          Test Payload Sender
        </h3>
      </CardHeader>
      <CardBody>
        <Stack gap={4}>
          {samplesLoading ? (
            <div className="flex justify-center py-4">
              <ContextLoader size={32} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                    Endpoint ID
                  </label>
                  <input
                    data-testid="endpoint-id-input"
                    type="number"
                    min="1"
                    value={endpointId}
                    onChange={(e) => setEndpointId(e.target.value)}
                    placeholder="Enter endpoint ID"
                    className="w-full rounded border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                  />
                </div>

                <Select
                  label="Event Type"
                  options={eventTypeOptions}
                  value={eventType}
                  onChange={handleEventTypeChange}
                  placeholder="Select event type"
                />
              </div>

              {eventType && (
                <SamplePreview
                  sample={samplePayloads.find((sp) => sp.event_type === eventType)}
                />
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                  Custom Payload (JSON)
                </label>
                <textarea
                  data-testid="payload-editor"
                  className="w-full rounded border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-2 font-mono text-xs text-[var(--color-text-primary)]"
                  rows={8}
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                />
              </div>

              <div>
                <Button
                  data-testid="send-test-btn"
                  onClick={handleSend}
                  loading={testSend.isPending}
                  disabled={!endpointId || !eventType}
                >
                  Send Test
                </Button>
              </div>

              {result && <TestResultDisplay result={result} />}
            </>
          )}
        </Stack>
      </CardBody>
    </Card>
  );
}

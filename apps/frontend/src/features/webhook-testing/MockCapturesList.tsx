/**
 * MockCapturesList -- expandable captured payloads for a mock endpoint (PRD-99).
 */

import { useState } from "react";

import { Badge, Spinner } from "@/components/primitives";
import { formatDateTime } from "@/lib/format";

import { useMockCaptures } from "./hooks/use-webhook-testing";
import type { MockEndpointCapture } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface MockCapturesListProps {
  mockId: number;
}

export function MockCapturesList({ mockId }: MockCapturesListProps) {
  const { data: capturesPage, isLoading } = useMockCaptures(mockId);
  const captures = capturesPage?.items ?? [];
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="sm" />
      </div>
    );
  }

  if (captures.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-[var(--color-text-muted)]">
        No captured payloads yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {captures.map((cap: MockEndpointCapture) => (
        <div
          key={cap.id}
          className="rounded border border-[var(--color-border-default)] p-2"
        >
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setExpandedId((prev) => (prev === cap.id ? null : cap.id))}
          >
            <div className="flex items-center gap-2">
              <Badge variant="info" size="sm">{cap.request_method}</Badge>
              <span className="text-xs text-[var(--color-text-muted)]">
                {formatDateTime(cap.received_at)}
              </span>
            </div>
            <span className="text-xs text-[var(--color-text-muted)]">
              {expandedId === cap.id ? "Collapse" : "Expand"}
            </span>
          </button>
          {expandedId === cap.id && (
            <div className="mt-2 space-y-2 border-t border-[var(--color-border-default)] pt-2">
              {cap.request_headers_json && (
                <div>
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    Headers:
                  </span>
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-[var(--color-bg-secondary)] p-2 font-mono text-xs text-[var(--color-text-primary)]">
                    {JSON.stringify(cap.request_headers_json, null, 2)}
                  </pre>
                </div>
              )}
              {cap.request_body_json && (
                <div>
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    Body:
                  </span>
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-[var(--color-bg-secondary)] p-2 font-mono text-xs text-[var(--color-text-primary)]">
                    {JSON.stringify(cap.request_body_json, null, 2)}
                  </pre>
                </div>
              )}
              {cap.source_ip && (
                <span className="text-xs text-[var(--color-text-muted)]">
                  Source IP: {cap.source_ip}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

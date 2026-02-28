/**
 * MockRow -- single mock endpoint entry with actions (PRD-99).
 */

import { useState } from "react";

import { Badge, Button } from "@/components/primitives";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { API_BASE_URL } from "@/lib/api";
import { Copy, Trash2 } from "@/tokens/icons";

import { MockCapturesList } from "./MockCapturesList";
import type { MockEndpoint } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface MockRowProps {
  mock: MockEndpoint;
  onDelete: (mock: MockEndpoint) => void;
}

export function MockRow({ mock, onDelete }: MockRowProps) {
  const [showCaptures, setShowCaptures] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  const mockUrl = `${API_BASE_URL}/mock/${mock.token}`;

  return (
    <div
      data-testid={`mock-row-${mock.id}`}
      className="rounded border border-[var(--color-border-default)] p-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {mock.name}
          </span>
          <div className="mt-1 flex items-center gap-2">
            <Badge
              variant={mock.capture_enabled ? "success" : "default"}
              size="sm"
            >
              {mock.capture_enabled ? "Capturing" : "Disabled"}
            </Badge>
            <span className="text-xs text-[var(--color-text-muted)]">
              Retention: {mock.retention_hours}h
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copy(mockUrl)}
            icon={<Copy size={14} />}
          >
            {copied ? "Copied" : "Copy URL"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCaptures((v) => !v)}
          >
            {showCaptures ? "Hide" : "Captures"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onDelete(mock)}
            icon={<Trash2 size={14} />}
            aria-label={`Delete ${mock.name}`}
          >
            Delete
          </Button>
        </div>
      </div>

      {showCaptures && (
        <div className="mt-3 border-t border-[var(--color-border-default)] pt-3">
          <MockCapturesList mockId={mock.id} />
        </div>
      )}
    </div>
  );
}

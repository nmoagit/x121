/**
 * Numeric ID input for segment selection with render-prop pattern.
 *
 * Used by pages that require a segment ID before showing content
 * (annotations, cinema mode, review notes, etc.).
 */

import { useState, type ReactNode } from "react";

import { Stack } from "@/components/layout";
import { Input } from "@/components/primitives";
import { EmptyState } from "@/components/domain/EmptyState";
import { Layers } from "@/tokens/icons";

interface SegmentIdPickerProps {
  /** Render-prop called when a valid segment ID is entered. */
  children: (segmentId: number) => ReactNode;
  /** Icon shown in the empty state. Defaults to Hash icon. */
  emptyIcon?: ReactNode;
  /** Description shown in the empty state. */
  emptyDescription?: string;
}

export function SegmentIdPicker({
  children,
  emptyIcon,
  emptyDescription = "Type a segment ID above to continue.",
}: SegmentIdPickerProps) {
  const [segmentIdInput, setSegmentIdInput] = useState("");
  const segmentId = Number(segmentIdInput);
  const hasSegment = segmentId > 0;

  return (
    <Stack gap={4}>
      <div className="w-[200px]">
        <Input
          label="Segment ID"
          type="number"
          placeholder="Enter segment ID..."
          value={segmentIdInput}
          onChange={(e) => setSegmentIdInput(e.target.value)}
          min="1"
        />
      </div>

      {hasSegment ? (
        children(segmentId)
      ) : (
        <EmptyState
          icon={emptyIcon ?? <Layers size={32} />}
          title="Enter a segment ID"
          description={emptyDescription}
        />
      )}
    </Stack>
  );
}

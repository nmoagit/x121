/**
 * RegenerateSegmentButton — triggers single-segment regeneration (PRD-25).
 *
 * Shows a confirmation dialog with downstream impact estimation before
 * dispatching the regeneration request.
 */

import { useState } from "react";

import { Button } from "@/components/primitives";
import { Modal } from "@/components/composite";

import { useRegenerateSegment } from "./hooks/use-restitching";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface RegenerateSegmentButtonProps {
  segmentId: number;
  segmentIndex: number;
  totalSegments: number;
  onRegenerated?: (newSegmentId: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RegenerateSegmentButton({
  segmentId,
  segmentIndex,
  totalSegments,
  onRegenerated,
}: RegenerateSegmentButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const regenerate = useRegenerateSegment(segmentId);

  const downstreamCount =
    segmentIndex < totalSegments - 1
      ? totalSegments - segmentIndex - 1
      : 0;

  function handleConfirm() {
    regenerate.mutate(
      {},
      {
        onSuccess: (data) => {
          setShowConfirm(false);
          onRegenerated?.(data.new_segment_id);
        },
      },
    );
  }

  return (
    <>
      <Button
        data-testid="regenerate-segment-btn"
        variant="secondary"
        size="sm"
        onClick={() => setShowConfirm(true)}
        disabled={regenerate.isPending}
      >
        Regenerate
      </Button>

      <Modal
        open={showConfirm}
        title="Regenerate Segment"
        onClose={() => setShowConfirm(false)}
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-primary)]">
            This will regenerate segment {segmentIndex + 1}.
            {downstreamCount > 0 && (
              <>
                {" "}Segments {segmentIndex + 2} to {totalSegments} may need
                re-checking.
              </>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              data-testid="confirm-regenerate-btn"
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              disabled={regenerate.isPending}
            >
              {regenerate.isPending ? "Regenerating..." : "Confirm"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

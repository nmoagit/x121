/**
 * Color-coded badge displaying a character's face embedding status (PRD-76).
 *
 * Uses the shared Badge primitive from the design system.
 */

import { Badge, type BadgeVariant } from "@/components/primitives";
import {
  EMBEDDING_STATUS,
  EMBEDDING_STATUS_LABEL,
  type EmbeddingStatusId,
} from "./types";

/* --------------------------------------------------------------------------
   Variant mapping
   -------------------------------------------------------------------------- */

const STATUS_VARIANT: Record<EmbeddingStatusId, BadgeVariant> = {
  [EMBEDDING_STATUS.PENDING]: "default",
  [EMBEDDING_STATUS.EXTRACTING]: "info",
  [EMBEDDING_STATUS.COMPLETED]: "success",
  [EMBEDDING_STATUS.FAILED]: "danger",
  [EMBEDDING_STATUS.LOW_CONFIDENCE]: "warning",
  [EMBEDDING_STATUS.MULTI_FACE_PENDING]: "warning",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface EmbeddingStatusBadgeProps {
  statusId: EmbeddingStatusId;
  /** Optional confidence value displayed alongside the label. */
  confidence?: number | null;
}

export function EmbeddingStatusBadge({
  statusId,
  confidence,
}: EmbeddingStatusBadgeProps) {
  const variant = STATUS_VARIANT[statusId] ?? "default";
  const label = EMBEDDING_STATUS_LABEL[statusId] ?? "Unknown";

  return (
    <Badge variant={variant} size="sm">
      {label}
      {confidence != null && (
        <span className="ml-1 opacity-75">
          ({(confidence * 100).toFixed(0)}%)
        </span>
      )}
    </Badge>
  );
}

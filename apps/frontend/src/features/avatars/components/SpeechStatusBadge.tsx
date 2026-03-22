/**
 * Badge displaying speech approval status (PRD-136).
 *
 * Maps status IDs to colored Badge variants.
 */

import { Badge } from "@/components/primitives";
import type { BadgeVariant } from "@/components/primitives";
import { SPEECH_STATUS_APPROVED, SPEECH_STATUS_REJECTED } from "../types";

const STATUS_CONFIG: Record<number, { label: string; variant: BadgeVariant }> = {
  1: { label: "Draft", variant: "default" },
  2: { label: "Approved", variant: "success" },
  3: { label: "Rejected", variant: "danger" },
};

interface SpeechStatusBadgeProps {
  statusId: number;
}

export function SpeechStatusBadge({ statusId }: SpeechStatusBadgeProps) {
  const config = STATUS_CONFIG[statusId] ?? { label: `Status ${statusId}`, variant: "default" as BadgeVariant };

  return (
    <Badge variant={config.variant} size="sm">
      {config.label}
    </Badge>
  );
}

/** Check if a status ID represents an actionable (non-approved) state. */
export function isApprovable(statusId: number): boolean {
  return statusId !== SPEECH_STATUS_APPROVED;
}

/** Check if a status ID represents a rejectable (non-rejected) state. */
export function isRejectable(statusId: number): boolean {
  return statusId !== SPEECH_STATUS_REJECTED;
}

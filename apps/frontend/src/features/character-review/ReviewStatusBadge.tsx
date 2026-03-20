import { TERMINAL_STATUS_COLORS } from "@/lib/ui-classes";
import type { CharacterReviewStatus } from "./types";

const STATUS_LABELS: Record<CharacterReviewStatus, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  in_review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
  rework: "Rework",
  re_queued: "Re-queued",
};

interface ReviewStatusBadgeProps {
  status: CharacterReviewStatus;
  size?: "sm" | "md";
}

export function ReviewStatusBadge({ status }: ReviewStatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? STATUS_LABELS.unassigned;
  const colorClass = TERMINAL_STATUS_COLORS[status] ?? "text-[var(--color-text-muted)]";
  return (
    <span className={`font-mono text-xs uppercase tracking-wide ${colorClass}`}>
      {label}
    </span>
  );
}

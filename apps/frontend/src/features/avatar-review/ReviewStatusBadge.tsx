import { TERMINAL_STATUS_COLORS } from "@/lib/ui-classes";
import type { AvatarReviewStatus } from "./types";
import { TYPO_DATA } from "@/lib/typography-tokens";

const STATUS_LABELS: Record<AvatarReviewStatus, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  in_review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
  rework: "Rework",
  re_queued: "Re-queued",
};

interface ReviewStatusBadgeProps {
  status: AvatarReviewStatus;
  size?: "sm" | "md";
}

export function ReviewStatusBadge({ status }: ReviewStatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? STATUS_LABELS.unassigned;
  const colorClass = TERMINAL_STATUS_COLORS[status] ?? "text-[var(--color-text-muted)]";
  return (
    <span className={`${TYPO_DATA} uppercase tracking-wide ${colorClass}`}>
      {label}
    </span>
  );
}

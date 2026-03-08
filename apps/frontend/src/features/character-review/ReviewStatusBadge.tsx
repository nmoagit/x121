import { Badge } from "@/components/primitives";
import type { CharacterReviewStatus } from "./types";

const STATUS_CONFIG: Record<
  CharacterReviewStatus,
  { variant: "default" | "info" | "warning" | "success" | "danger"; label: string }
> = {
  unassigned: { variant: "default", label: "Unassigned" },
  assigned: { variant: "info", label: "Assigned" },
  in_review: { variant: "warning", label: "In Review" },
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "danger", label: "Rejected" },
  rework: { variant: "warning", label: "Rework" },
  re_queued: { variant: "info", label: "Re-queued" },
};

interface ReviewStatusBadgeProps {
  status: CharacterReviewStatus;
  size?: "sm" | "md";
}

export function ReviewStatusBadge({ status, size = "md" }: ReviewStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unassigned;
  return (
    <Badge variant={config.variant} size={size}>
      {config.label}
    </Badge>
  );
}

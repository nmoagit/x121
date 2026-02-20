import { Badge } from "@/components/primitives";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";
type StatusBadgeSize = "sm" | "md";

interface StatusBadgeProps {
  status: string;
  size?: StatusBadgeSize;
}

const STATUS_VARIANT_MAP: Record<string, BadgeVariant> = {
  active: "success",
  success: "success",
  completed: "success",
  enabled: "success",
  pending: "warning",
  processing: "warning",
  queued: "warning",
  in_progress: "warning",
  failed: "danger",
  error: "danger",
  rejected: "danger",
  archived: "default",
  inactive: "default",
  draft: "default",
  disabled: "default",
  review: "info",
  info: "info",
};

function getVariant(status: string): BadgeVariant {
  return STATUS_VARIANT_MAP[status.toLowerCase()] ?? "default";
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, " ");
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  return (
    <Badge variant={getVariant(status)} size={size}>
      {capitalize(status)}
    </Badge>
  );
}

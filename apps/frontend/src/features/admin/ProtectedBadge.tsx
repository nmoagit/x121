import { Badge } from "@/components/primitives";

interface ProtectedBadgeProps {
  isActive: boolean;
}

/**
 * Small badge showing whether a protection rule is active or inactive.
 */
export function ProtectedBadge({ isActive }: ProtectedBadgeProps) {
  if (isActive) {
    return (
      <Badge variant="success" size="sm">
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="default" size="sm">
      Inactive
    </Badge>
  );
}

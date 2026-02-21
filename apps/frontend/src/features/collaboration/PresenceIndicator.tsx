/**
 * Displays avatar indicators for users currently viewing an entity (PRD-11).
 *
 * Uses the `usePresence` hook to poll for presence data and renders a
 * compact row of `Avatar` components showing who is viewing.
 */

import { Avatar } from "@/components/primitives/Avatar";
import { Spinner } from "@/components/primitives/Spinner";
import { Tooltip } from "@/components/primitives/Tooltip";

import { usePresence } from "./hooks/use-collaboration";

interface PresenceIndicatorProps {
  entityType: string;
  entityId: number;
}

export function PresenceIndicator({
  entityType,
  entityId,
}: PresenceIndicatorProps) {
  const { data: users, isPending } = usePresence(entityType, entityId);

  if (isPending) {
    return <Spinner size="sm" />;
  }

  if (!users || users.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1" aria-label="Users viewing this entity">
      {users.map((user) => (
        <Tooltip key={user.user_id} content={`User ${user.user_id}`}>
          <Avatar
            name={`User ${user.user_id}`}
            size="sm"
          />
        </Tooltip>
      ))}
      {users.length > 0 && (
        <span className="text-xs text-[var(--color-text-muted)] ml-1">
          {users.length} viewing
        </span>
      )}
    </div>
  );
}

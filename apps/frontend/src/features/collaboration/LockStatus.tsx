/**
 * Displays lock status and provides lock/unlock actions for an entity (PRD-11).
 *
 * Shows whether the entity is locked, by whom, and when it expires.
 * Provides buttons to acquire or release the lock.
 */

import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";
import { Spinner } from "@/components/primitives/Spinner";
import { Lock, Unlock } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { formatDateTime, formatCountdown } from "@/lib/format";

import { useLock } from "./hooks/use-collaboration";

interface LockStatusProps {
  entityType: string;
  entityId: number;
  /** The current user's ID, used to determine if they hold the lock. */
  currentUserId: number;
}

export function LockStatus({
  entityType,
  entityId,
  currentUserId,
}: LockStatusProps) {
  const {
    lock,
    isLoading,
    acquire,
    release,
    isAcquiring,
    isReleasing,
    acquireError,
  } = useLock(entityType, entityId);

  if (isLoading) {
    return <Spinner size="sm" />;
  }

  const isLockedByMe = lock !== null && lock.user_id === currentUserId;
  const isLockedByOther = lock !== null && lock.user_id !== currentUserId;

  return (
    <div className="flex items-center gap-2">
      {/* No lock held */}
      {lock === null && (
        <>
          <Badge variant="default" size="sm">
            <Unlock size={iconSizes.sm} className="mr-1" />
            Unlocked
          </Badge>
          <Button
            size="sm"
            variant="secondary"
            onClick={acquire}
            loading={isAcquiring}
            icon={<Lock size={iconSizes.sm} />}
          >
            Lock
          </Button>
        </>
      )}

      {/* Locked by me */}
      {isLockedByMe && (
        <>
          <Badge variant="success" size="sm">
            <Lock size={iconSizes.sm} className="mr-1" />
            Locked by you
          </Badge>
          <span className="text-xs text-[var(--color-text-muted)]">
            expires {formatCountdown(lock.expires_at)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={release}
            loading={isReleasing}
            icon={<Unlock size={iconSizes.sm} />}
          >
            Unlock
          </Button>
        </>
      )}

      {/* Locked by another user */}
      {isLockedByOther && (
        <>
          <Badge variant="warning" size="sm">
            <Lock size={iconSizes.sm} className="mr-1" />
            Locked by user {lock.user_id}
          </Badge>
          <span className="text-xs text-[var(--color-text-muted)]">
            since {formatDateTime(lock.acquired_at)} &mdash; expires{" "}
            {formatCountdown(lock.expires_at)}
          </span>
        </>
      )}

      {/* Acquire error */}
      {acquireError && (
        <span className="text-xs text-[var(--color-action-danger)]">
          {acquireError.message}
        </span>
      )}
    </div>
  );
}

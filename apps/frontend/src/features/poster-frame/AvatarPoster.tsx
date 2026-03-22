/**
 * Avatar poster frame display (PRD-96).
 *
 * Thin wrapper around EntityPoster for avatar entities.
 * Includes a "Manual" badge in the overlay.
 */

import { Badge } from "@/components/primitives";

import { EntityPoster } from "./EntityPoster";
import { ENTITY_TYPE_CHARACTER } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface AvatarPosterProps {
  avatarId: number;
  /** Callback when the user wants to change the poster. */
  onChange?: () => void;
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AvatarPoster({
  avatarId,
  onChange,
  className,
}: AvatarPosterProps) {
  return (
    <EntityPoster
      entityType={ENTITY_TYPE_CHARACTER}
      entityId={avatarId}
      testId="avatar-poster"
      altText={`Avatar ${avatarId} poster`}
      overlayContent={
        <Badge variant="info" size="sm">
          Manual
        </Badge>
      }
      onChange={onChange}
      className={className}
    />
  );
}

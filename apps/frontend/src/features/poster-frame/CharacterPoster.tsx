/**
 * Character poster frame display (PRD-96).
 *
 * Thin wrapper around EntityPoster for character entities.
 * Includes a "Manual" badge in the overlay.
 */

import { Badge } from "@/components/primitives";

import { EntityPoster } from "./EntityPoster";
import { ENTITY_TYPE_CHARACTER } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CharacterPosterProps {
  characterId: number;
  /** Callback when the user wants to change the poster. */
  onChange?: () => void;
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterPoster({
  characterId,
  onChange,
  className,
}: CharacterPosterProps) {
  return (
    <EntityPoster
      entityType={ENTITY_TYPE_CHARACTER}
      entityId={characterId}
      testId="character-poster"
      altText={`Character ${characterId} poster`}
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

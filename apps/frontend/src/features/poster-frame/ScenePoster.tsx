/**
 * Scene poster frame display (PRD-96).
 *
 * Thin wrapper around EntityPoster for scene entities.
 */

import { EntityPoster } from "./EntityPoster";
import { ENTITY_TYPE_SCENE } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ScenePosterProps {
  sceneId: number;
  /** Callback when the user wants to change the poster. */
  onChange?: () => void;
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ScenePoster({
  sceneId,
  onChange,
  className,
}: ScenePosterProps) {
  return (
    <EntityPoster
      entityType={ENTITY_TYPE_SCENE}
      entityId={sceneId}
      testId="scene-poster"
      altText={`Scene ${sceneId} poster`}
      onChange={onChange}
      className={className}
    />
  );
}

/**
 * Character scenes tab — scene picker with clip gallery (PRD-112).
 */

import { ScenePicker } from "@/components/domain/ScenePicker";
import { ClipGallery } from "@/features/scenes/ClipGallery";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterScenesTabProps {
  characterId: number;
}

export function CharacterScenesTab({ characterId }: CharacterScenesTabProps) {
  return (
    <ScenePicker characterId={characterId}>
      {(sceneId) => <ClipGallery sceneId={sceneId} />}
    </ScenePicker>
  );
}

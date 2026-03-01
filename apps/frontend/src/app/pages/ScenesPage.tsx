/**
 * Scenes content page — project/character picker, then scene list
 * with clip gallery for the selected scene.
 */

import { ProjectCharacterPicker, ScenePicker } from "@/components/domain";
import { Layers } from "@/tokens/icons";

import { ClipGallery } from "@/features/scenes/ClipGallery";

export function ScenesPage() {
  return (
    <ProjectCharacterPicker
      title="Scenes"
      description="View and manage scene video clips for a character."
    >
      {(_projectId, characterId) => (
        <ScenePicker
          characterId={characterId}
          emptyIcon={<Layers size={32} />}
          noScenesDescription="This character has no scenes yet. Create scenes from the project detail page."
        >
          {(sceneId) => <ClipGallery sceneId={sceneId} />}
        </ScenePicker>
      )}
    </ProjectCharacterPicker>
  );
}

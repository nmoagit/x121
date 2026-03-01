/**
 * Scene selection widget for a given character.
 *
 * Loads scenes via `useCharacterScenes`, shows a Select dropdown,
 * and delegates rendering of the selected scene to a render-prop.
 */

import { useState } from "react";

import { Stack } from "@/components/layout";
import { Select, Spinner } from "@/components/primitives";
import { EmptyState } from "@/components/domain/EmptyState";
import { useCharacterScenes } from "@/features/scenes/hooks/useCharacterScenes";
import { toSelectOptionsBy } from "@/lib/select-utils";
import { Layers } from "@/tokens/icons";

interface ScenePickerProps {
  characterId: number;
  /** Render-prop called with the selected scene id. */
  children: (sceneId: number) => React.ReactNode;
  /** Icon shown in the empty state. Defaults to Layers. */
  emptyIcon?: React.ReactNode;
  /** Title for the "no scenes" empty state. */
  noScenesTitle?: string;
  /** Description for the "no scenes" empty state. */
  noScenesDescription?: string;
}

export function ScenePicker({
  characterId,
  children,
  emptyIcon = <Layers size={32} />,
  noScenesTitle = "No scenes",
  noScenesDescription = "This character has no scenes yet.",
}: ScenePickerProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string>("");
  const { data: scenes, isLoading } = useCharacterScenes(characterId);

  const sceneId = Number(selectedSceneId);

  const sceneOptions = toSelectOptionsBy(
    scenes,
    (s) => `Scene #${s.id} (type ${s.scene_type_id})`,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-8)]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!scenes?.length) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={noScenesTitle}
        description={noScenesDescription}
      />
    );
  }

  return (
    <Stack gap={6}>
      <div className="w-[300px]">
        <Select
          label="Scene"
          placeholder="Select a scene..."
          options={sceneOptions}
          value={selectedSceneId}
          onChange={setSelectedSceneId}
        />
      </div>

      {sceneId > 0 ? (
        children(sceneId)
      ) : (
        <EmptyState
          icon={emptyIcon}
          title="Select a scene"
          description="Choose a scene from the dropdown to continue."
        />
      )}
    </Stack>
  );
}

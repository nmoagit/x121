/**
 * Character all-scenes inverse view (PRD-68).
 *
 * Shows all scene types for a single character with synchronized
 * playback, sorting, filtering, and quick actions.
 */

import { useCharacterAllScenes } from "./hooks/use-comparison";
import { GalleryLayout } from "./GalleryLayout";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface CharacterAllScenesProps {
  projectId: number;
  characterId: number;
  characterName?: string;
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterAllScenes({
  projectId,
  characterId,
  characterName,
  className,
}: CharacterAllScenesProps) {
  const { data: cells = [], isLoading } = useCharacterAllScenes(projectId, characterId);

  return (
    <GalleryLayout
      cells={cells}
      isLoading={isLoading}
      header={
        characterName ? (
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {characterName} &mdash; All Scenes
          </h2>
        ) : undefined
      }
      cellLabelField="scene_type_name"
      cellKeyField="scene_type_id"
      emptyTitle="No scenes for this character"
      emptyDescription="Generate scenes to see them here."
      className={className}
    />
  );
}

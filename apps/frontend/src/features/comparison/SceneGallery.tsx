/**
 * Scene-type comparison gallery (PRD-68).
 *
 * Shows one cell per character for a given scene type, with
 * synchronized playback, sorting, filtering, and quick actions.
 */

import { useSceneComparison } from "./hooks/use-comparison";
import { GalleryLayout } from "./GalleryLayout";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SceneGalleryProps {
  projectId: number;
  sceneTypeId: number;
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SceneGallery({ projectId, sceneTypeId, className }: SceneGalleryProps) {
  const { data, isLoading } = useSceneComparison(projectId, sceneTypeId);
  const cells = data?.cells ?? [];

  return (
    <GalleryLayout
      cells={cells}
      isLoading={isLoading}
      header={
        data?.scene_type_name ? (
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {data.scene_type_name}
          </h2>
        ) : undefined
      }
      cellLabelField="character_name"
      cellKeyField="character_id"
      emptyTitle="No scenes to compare"
      emptyDescription="Generate scenes for more characters to see them side-by-side."
      className={className}
    />
  );
}

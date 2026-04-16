/**
 * Avatar all-scenes inverse view (PRD-68).
 *
 * Shows all scene types for a single avatar with synchronized
 * playback, sorting, filtering, and quick actions.
 */

import { TYPO_PAGE_TITLE } from "@/lib/typography-tokens";

import { useAvatarAllScenes } from "./hooks/use-comparison";
import { GalleryLayout } from "./GalleryLayout";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface AvatarAllScenesProps {
  projectId: number;
  avatarId: number;
  avatarName?: string;
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AvatarAllScenes({
  projectId,
  avatarId,
  avatarName,
  className,
}: AvatarAllScenesProps) {
  const { data: cells = [], isLoading } = useAvatarAllScenes(projectId, avatarId);

  return (
    <GalleryLayout
      cells={cells}
      isLoading={isLoading}
      header={
        avatarName ? (
          <h2 className={TYPO_PAGE_TITLE}>
            {avatarName} &mdash; All Scenes
          </h2>
        ) : undefined
      }
      cellLabelField="scene_type_name"
      cellKeyField="scene_type_id"
      emptyTitle="No scenes for this avatar"
      emptyDescription="Generate scenes to see them here."
      className={className}
    />
  );
}

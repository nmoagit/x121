/**
 * Storyboard content page — project/character/scene picker wrapping
 * the storyboard timeline and keyframe components.
 */

import { ProjectCharacterPicker, ScenePicker, EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Spinner } from "@/components/primitives";
import { Layout } from "@/tokens/icons";

import { ThumbnailStrip } from "@/features/storyboard/ThumbnailStrip";
import { useSceneStoryboard } from "@/features/storyboard/hooks/use-storyboard";

function StoryboardViewer({ sceneId }: { sceneId: number }) {
  const { data: keyframes, isLoading } = useSceneStoryboard(sceneId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-8)]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!keyframes?.length) {
    return (
      <EmptyState
        icon={<Layout size={32} />}
        title="No keyframes"
        description="This scene has no storyboard keyframes yet. They will appear after video generation."
      />
    );
  }

  return (
    <Stack gap={4}>
      <h3 className="text-sm font-medium text-[var(--color-text-secondary)]">
        Storyboard Timeline
      </h3>
      <ThumbnailStrip
        segmentId={sceneId}
        keyframes={keyframes}
      />
    </Stack>
  );
}

export function StoryboardPage() {
  return (
    <ProjectCharacterPicker
      title="Storyboard"
      description="View storyboard timeline and keyframes for a scene."
    >
      {(_projectId, characterId) => (
        <ScenePicker
          characterId={characterId}
          emptyIcon={<Layout size={32} />}
          noScenesDescription="This model has no scenes yet."
        >
          {(sceneId) => <StoryboardViewer sceneId={sceneId} />}
        </ScenePicker>
      )}
    </ProjectCharacterPicker>
  );
}

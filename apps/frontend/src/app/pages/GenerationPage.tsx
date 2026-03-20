/**
 * Generation page — project/character/scene picker wrapping the
 * generation progress bar, boundary frame scrubber, and start controls.
 *
 * Flow: Project -> Character -> Scene -> GenerationProgressBar + start control
 */

import { ProjectCharacterPicker, ScenePicker, EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { WireframeLoader } from "@/components/primitives";
import { Button  } from "@/components/primitives";
import { Zap } from "@/tokens/icons";

import {
  GenerationProgressBar,
  useGenerationProgress,
  useStartGeneration,
} from "@/features/generation";

function SceneGeneration({ sceneId }: { sceneId: number }) {
  const { data: progress, isLoading } = useGenerationProgress(sceneId);
  const startGeneration = useStartGeneration(sceneId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-8)]">
        <WireframeLoader size={64} />
      </div>
    );
  }

  const isGenerating =
    progress != null && progress.segments_completed < (progress.segments_estimated ?? 0);

  return (
    <Stack gap={4}>
      {progress && <GenerationProgressBar progress={progress} />}

      {!progress && (
        <EmptyState
          icon={<Zap size={32} />}
          title="No generation data"
          description="Start generation to see progress here."
        />
      )}

      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          icon={<Zap size={16} />}
          onClick={() => startGeneration.mutate({})}
          loading={startGeneration.isPending}
          disabled={isGenerating}
        >
          {isGenerating ? "Generating..." : "Start Generation"}
        </Button>
      </div>
    </Stack>
  );
}

export function GenerationPage() {
  return (
    <ProjectCharacterPicker
      title="Generation"
      description="Start and monitor video generation jobs for scenes."
    >
      {(_projectId, characterId) => (
        <ScenePicker
          characterId={characterId}
          emptyIcon={<Zap size={32} />}
          noScenesDescription="This model has no scenes yet. Create scenes first."
        >
          {(sceneId) => <SceneGeneration sceneId={sceneId} />}
        </ScenePicker>
      )}
    </ProjectCharacterPicker>
  );
}

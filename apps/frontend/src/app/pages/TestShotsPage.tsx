/**
 * Test Shots page — project/character picker wrapping the test shot
 * gallery with generate and promote actions.
 *
 * Flow: Project -> Character -> TestShotGallery + TestShotButton
 */

import { ProjectCharacterPicker } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Spinner } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Image } from "@/tokens/icons";

import {
  TestShotGallery,
  TestShotButton,
  useTestShotGallery,
  useGenerateTestShot,
  usePromoteTestShot,
  useDeleteTestShot,
} from "@/features/test-shots";
import { useSceneTypes } from "@/features/scene-types/hooks/use-scene-types";

function CharacterTestShots({ characterId }: { characterId: number }) {
  const { data: sceneTypes, isLoading: stLoading } = useSceneTypes();
  const generateTestShot = useGenerateTestShot();
  const promoteTestShot = usePromoteTestShot();

  /** Use the first scene type as default for the gallery and button. */
  const defaultSceneTypeId = sceneTypes?.[0]?.id ?? 0;
  const {
    data: testShots,
    isLoading: galleryLoading,
  } = useTestShotGallery(defaultSceneTypeId, characterId);
  const deleteTestShot = useDeleteTestShot(defaultSceneTypeId);

  if (stLoading || galleryLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-8)]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!sceneTypes?.length) {
    return (
      <EmptyState
        icon={<Image size={32} />}
        title="No scene types"
        description="Create scene types first to generate test shots."
      />
    );
  }

  return (
    <Stack gap={4}>
      <div className="flex items-center gap-3">
        <TestShotButton
          sceneTypeId={defaultSceneTypeId}
          characterId={characterId}
          isLoading={generateTestShot.isPending}
          onGenerate={(req) => generateTestShot.mutate(req)}
        />
      </div>
      <TestShotGallery
        testShots={testShots ?? []}
        onPromote={(id) => promoteTestShot.mutate(id)}
        onDelete={(id) => deleteTestShot.mutate(id)}
        isPromoting={promoteTestShot.isPending}
      />
    </Stack>
  );
}

export function TestShotsPage() {
  return (
    <ProjectCharacterPicker
      title="Test Shots"
      description="Generate and review test shots for a model."
    >
      {(_projectId, characterId) => (
        <CharacterTestShots characterId={characterId} />
      )}
    </ProjectCharacterPicker>
  );
}

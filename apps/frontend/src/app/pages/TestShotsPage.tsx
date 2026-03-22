/**
 * Test Shots page — project/avatar picker wrapping the test shot
 * gallery with generate and promote actions.
 *
 * Flow: Project -> Avatar -> TestShotGallery + TestShotButton
 */

import { ProjectAvatarPicker } from "@/components/domain";
import { Stack } from "@/components/layout";
import { WireframeLoader } from "@/components/primitives";
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

function AvatarTestShots({ avatarId }: { avatarId: number }) {
  const { data: sceneTypes, isLoading: stLoading } = useSceneTypes();
  const generateTestShot = useGenerateTestShot();
  const promoteTestShot = usePromoteTestShot();

  /** Use the first scene type as default for the gallery and button. */
  const defaultSceneTypeId = sceneTypes?.[0]?.id ?? 0;
  const {
    data: testShots,
    isLoading: galleryLoading,
  } = useTestShotGallery(defaultSceneTypeId, avatarId);
  const deleteTestShot = useDeleteTestShot(defaultSceneTypeId);

  if (stLoading || galleryLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-8)]">
        <WireframeLoader size={64} />
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
          avatarId={avatarId}
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
    <ProjectAvatarPicker
      title="Test Shots"
      description="Generate and review test shots for a model."
    >
      {(_projectId, avatarId) => (
        <AvatarTestShots avatarId={avatarId} />
      )}
    </ProjectAvatarPicker>
  );
}

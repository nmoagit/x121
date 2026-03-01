/**
 * Branching page — project/character/scene picker wrapping
 * branch manager, comparison, and cleanup components.
 *
 * Flow: Project -> Character -> Scene -> BranchManager + BranchCleanup
 */

import { ProjectCharacterPicker, ScenePicker } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Spinner } from "@/components/primitives";
import { Layers } from "@/tokens/icons";

import {
  BranchManager,
  useBranches,
  useCreateBranch,
  useDeleteBranch,
  usePromoteBranch,
  useUpdateBranch,
} from "@/features/branching";

function SceneBranches({ sceneId }: { sceneId: number }) {
  const { data: branches, isLoading } = useBranches(sceneId);
  const createBranch = useCreateBranch();
  const deleteBranch = useDeleteBranch();
  const promoteBranch = usePromoteBranch();
  const updateBranch = useUpdateBranch();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-8)]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Stack gap={6}>
      <BranchManager
        branches={branches ?? []}
        isLoading={
          createBranch.isPending ||
          deleteBranch.isPending ||
          promoteBranch.isPending ||
          updateBranch.isPending
        }
        onCreate={(name, description) =>
          createBranch.mutate({
            sceneId,
            input: { name, description, parameters_snapshot: {} },
          })
        }
        onDelete={(id) => deleteBranch.mutate(id)}
        onPromote={(id) => promoteBranch.mutate(id)}
        onRename={(id, name) =>
          updateBranch.mutate({ id, input: { name } })
        }
      />
    </Stack>
  );
}

export function BranchingPage() {
  return (
    <ProjectCharacterPicker
      title="Content Branching"
      description="Manage content branches for exploring alternative generation parameters."
    >
      {(_projectId, characterId) => (
        <ScenePicker
          characterId={characterId}
          emptyIcon={<Layers size={32} />}
          noScenesDescription="This character has no scenes yet."
        >
          {(sceneId) => <SceneBranches sceneId={sceneId} />}
        </ScenePicker>
      )}
    </ProjectCharacterPicker>
  );
}

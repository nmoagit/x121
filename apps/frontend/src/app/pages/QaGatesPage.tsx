/**
 * QA Gates page — project picker wrapping threshold editor and
 * scene QA summary components.
 *
 * Flow: Project -> ThresholdEditor + SceneQaSummaryCard (per scene via scene picker)
 */

import { Stack } from "@/components/layout";
import { LoadingPane } from "@/components/primitives";
import { ProjectPicker } from "@/components/domain";

import {
  ThresholdEditor,
  useProjectThresholds,
  useUpsertThreshold,
} from "@/features/quality-gates";

function ProjectQaGates({ projectId }: { projectId: number }) {
  const { data: thresholds, isLoading } = useProjectThresholds(projectId);
  const upsertThreshold = useUpsertThreshold(projectId);

  if (isLoading) {
    return <LoadingPane />;
  }

  return (
    <Stack gap={6}>
      <ThresholdEditor
        thresholds={thresholds ?? []}
        onSave={(input) => upsertThreshold.mutate(input)}
        showStudioIndicator
      />
    </Stack>
  );
}

export function QaGatesPage() {
  return (
    <ProjectPicker
      title="QA Gates"
      description="Configure quality thresholds and review QA scorecards for generated segments."
    >
      {(projectId) => <ProjectQaGates projectId={projectId} />}
    </ProjectPicker>
  );
}

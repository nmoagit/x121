/**
 * Page wrapper for pipeline settings.
 *
 * Supports two route patterns:
 * - /admin/pipelines/$pipelineId — direct ID access
 * - /pipelines/$pipelineCode/settings — code-based access (resolves via API)
 */

import { useParams } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { LoadingPane } from "@/components/primitives";
import { PipelineSettingsPage as PipelineSettingsFeature, usePipelineByCode } from "@/features/pipelines";
import { Settings } from "@/tokens/icons";

export function PipelineSettingsPage() {
  const params = useParams({ strict: false }) as {
    pipelineId?: string;
    pipelineCode?: string;
  };

  // Direct ID route (admin)
  if (params.pipelineId) {
    const id = Number(params.pipelineId);
    return <PipelineSettingsFeature pipelineId={id} />;
  }

  // Code-based route (pipeline-scoped)
  return <PipelineSettingsByCode code={params.pipelineCode ?? ""} />;
}

function PipelineSettingsByCode({ code }: { code: string }) {
  const { data: pipeline, isLoading, error } = usePipelineByCode(code);

  if (isLoading) return <LoadingPane />;

  if (error || !pipeline) {
    return (
      <EmptyState
        icon={<Settings size={32} />}
        title="Pipeline not found"
        description={`No pipeline with code "${code}" exists.`}
      />
    );
  }

  return <PipelineSettingsFeature pipelineId={pipeline.id} />;
}

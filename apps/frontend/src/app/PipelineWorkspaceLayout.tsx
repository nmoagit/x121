/**
 * Layout component for pipeline-scoped routes.
 *
 * Reads `$pipelineCode` from the URL, wraps children in PipelineProvider,
 * and renders an Outlet for nested pipeline routes.
 */

import { Outlet, useParams } from "@tanstack/react-router";

import { PipelineProvider } from "@/features/pipelines/PipelineProvider";

export function PipelineWorkspaceLayout() {
  const { pipelineCode } = useParams({ strict: false }) as { pipelineCode: string };

  return (
    <PipelineProvider pipelineCode={pipelineCode}>
      <Outlet />
    </PipelineProvider>
  );
}

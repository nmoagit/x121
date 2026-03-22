/**
 * Pipeline selector landing page.
 *
 * Shows all active pipelines as cards. Each card navigates to the
 * pipeline's workspace at /pipelines/:code/dashboard.
 */

import { useNavigate } from "@tanstack/react-router";

import { Card } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Grid, Stack } from "@/components/layout";
import { Badge, LoadingPane } from "@/components/primitives";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { Workflow } from "@/tokens/icons";

import { usePipelines } from "@/features/pipelines/hooks/use-pipelines";

export function PipelineSelectorPage() {
  useSetPageTitle("Pipelines", "Select a pipeline to start working.");

  const navigate = useNavigate();
  const { data: pipelines, isLoading, error } = usePipelines();

  if (isLoading) return <LoadingPane />;

  if (error) {
    return (
      <EmptyState
        icon={<Workflow size={32} />}
        title="Failed to load pipelines"
        description="An error occurred while fetching pipelines."
      />
    );
  }

  const activePipelines = pipelines?.filter((p) => p.is_active) ?? [];

  if (activePipelines.length === 0) {
    return (
      <EmptyState
        icon={<Workflow size={32} />}
        title="No pipelines configured"
        description="Create a pipeline in the admin area to get started."
      />
    );
  }

  return (
    <Stack gap={6}>
      <div>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Select Pipeline
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Choose a pipeline to enter its workspace.
        </p>
      </div>

      <Grid cols={1} gap={4} className="sm:grid-cols-2 lg:grid-cols-3">
        {activePipelines.map((pipeline) => (
          <button
            key={pipeline.id}
            type="button"
            onClick={() => navigate({ to: `/pipelines/${pipeline.code}/dashboard` })}
            className="text-left h-full"
          >
            <Card
              className="cursor-pointer transition-colors hover:border-[var(--color-action-primary)] hover:bg-[var(--color-surface-tertiary)] h-full"
              padding="md"
            >
              <Stack gap={3}>
                <div className="flex items-center gap-2">
                  <Workflow size={18} className="text-[var(--color-action-primary)] shrink-0" />
                  <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                    {pipeline.name}
                  </span>
                  <Badge variant="default" size="sm">
                    {pipeline.code}
                  </Badge>
                </div>

                {pipeline.description && (
                  <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                    {pipeline.description}
                  </p>
                )}

                <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                  <span>
                    {pipeline.seed_slots.length} seed slot{pipeline.seed_slots.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </Stack>
            </Card>
          </button>
        ))}
      </Grid>
    </Stack>
  );
}

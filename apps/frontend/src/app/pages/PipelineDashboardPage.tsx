/**
 * Dashboard page for a specific pipeline workspace (PRD-139).
 *
 * Shows pipeline-specific stats (active tasks, project progress) scoped
 * to the pipeline's projects, plus pipeline info and quick navigation.
 */

import { useNavigate } from "@tanstack/react-router";

import { Card } from "@/components/composite";
import { Grid, Stack } from "@/components/layout";
import { Badge } from "@/components/primitives";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { usePipelineContext } from "@/features/pipelines/PipelineProvider";
import { buildPipelineNavGroups } from "@/app/pipeline-navigation";
import { ActiveTasksWidget } from "@/features/dashboard/widgets/ActiveTasksWidget";
import { ProjectProgressWidget } from "@/features/dashboard/widgets/ProjectProgressWidget";
import type { NavItemDef } from "@/app/navigation";
import { Workflow } from "@/tokens/icons";

export function PipelineDashboardPage() {
  const { pipeline, pipelineCode, pipelineId } = usePipelineContext();
  const navigate = useNavigate();

  useSetPageTitle(pipeline.name, "Pipeline workspace dashboard");

  // Derive quick links from all nav groups, excluding the current page (Dashboard)
  const quickLinks: NavItemDef[] = buildPipelineNavGroups(pipelineCode)
    .flatMap((group) => group.items)
    .filter((item) => !item.path.endsWith("/dashboard"))
    .filter((item) => item.prominent);

  return (
    <Stack gap={6}>
      {/* Pipeline header */}
      <div className="flex items-center gap-3">
        <Workflow size={24} className="text-[var(--color-action-primary)] shrink-0" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {pipeline.name}
            </h1>
            <Badge variant="default" size="sm">{pipeline.code}</Badge>
          </div>
          {pipeline.description && (
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              {pipeline.description}
            </p>
          )}
        </div>
      </div>

      {/* Pipeline-scoped dashboard widgets */}
      <div className="grid grid-cols-1 gap-[var(--spacing-4)] lg:grid-cols-2">
        <ActiveTasksWidget pipelineId={pipelineId} showPipeline={false} />
        <ProjectProgressWidget pipelineId={pipelineId} showPipeline={false} />
      </div>

      {/* Seed slots summary */}
      {pipeline.seed_slots.length > 0 && (
        <Card padding="sm">
          <div className="text-xs font-mono uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            Seed Slots
          </div>
          <div className="flex flex-wrap gap-2">
            {pipeline.seed_slots.map((slot) => (
              <Badge key={slot.name} variant={slot.required ? "warning" : "default"} size="sm">
                {slot.name}{slot.required ? " *" : ""}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Quick navigation */}
      <div>
        <h2 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
          Quick Navigation
        </h2>
        <Grid cols={2} gap={3} className="sm:grid-cols-3 lg:grid-cols-6">
          {quickLinks.map(({ label, icon: Icon, path }) => (
            <button
              key={path}
              type="button"
              onClick={() => navigate({ to: path })}
              className="text-left"
            >
              <Card
                className="cursor-pointer transition-colors hover:border-[var(--color-action-primary)] hover:bg-[var(--color-surface-tertiary)]"
                padding="sm"
              >
                <Stack gap={2} className="items-center text-center">
                  <Icon size={20} className="text-[var(--color-text-muted)]" />
                  <span className="text-xs font-medium text-[var(--color-text-primary)]">
                    {label}
                  </span>
                </Stack>
              </Card>
            </button>
          ))}
        </Grid>
      </div>
    </Stack>
  );
}

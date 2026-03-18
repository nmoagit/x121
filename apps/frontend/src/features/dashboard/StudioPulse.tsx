import { Stack } from "@/components/layout";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useIsAdmin } from "@/features/dashboard/hooks/use-dashboard";
import { ActiveTasksWidget } from "@/features/dashboard/widgets/ActiveTasksWidget";
import { ActivityFeedWidget } from "@/features/dashboard/widgets/ActivityFeedWidget";
import { DiskHealthWidget } from "@/features/dashboard/widgets/DiskHealthWidget";
import { InfraStatusWidget } from "@/features/dashboard/widgets/InfraStatusWidget";
import { ModelReadinessWidget } from "@/features/dashboard/widgets/ModelReadinessWidget";
import { ProjectProgressWidget } from "@/features/dashboard/widgets/ProjectProgressWidget";
import { ScheduledGenerationsWidget } from "@/features/dashboard/widgets/ScheduledGenerationsWidget";

/* --------------------------------------------------------------------------
   Studio Pulse Dashboard (PRD-42)
   --------------------------------------------------------------------------

   Default landing page after login. Provides at-a-glance visibility into:
   - Active generation tasks and queue (with summary counts)
   - Per-project scene approval progress (with mini-indicators)
   - Model readiness across all projects
   - Upcoming scheduled generations
   - Filesystem disk health
   - Infrastructure status (admin only)
   - Chronological activity feed

   Layout follows a responsive grid:
   - Desktop: 4-column layout
     Row 1: Active Tasks (2 cols) | Project Progress (2 cols)
     Row 2: Model Readiness (1)   | Scheduled (1)  | Disk (1)  | Infra (1)
     Row 3: Activity Feed (4 cols)
   - Tablet: 2-column layout
   - Mobile: single column stack

   PRD-89 will extend this with drag-and-drop widget customization.
   -------------------------------------------------------------------------- */

export function StudioPulse() {
  useSetPageTitle("Studio Pulse", "Real-time overview of your studio. Widgets refresh automatically.");
  const isAdmin = useIsAdmin();

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        {/* Widget grid */}
        <div className="grid grid-cols-1 gap-[var(--spacing-4)] md:grid-cols-2 lg:grid-cols-4">
          {/* Row 1: Active Tasks + Project Progress */}
          <div className="md:col-span-1 lg:col-span-2">
            <ActiveTasksWidget />
          </div>
          <div className="md:col-span-1 lg:col-span-2">
            <ProjectProgressWidget />
          </div>

          {/* Row 2: Model Readiness + Scheduled Generations + Disk Health + Infra (admin) */}
          <div className="md:col-span-1 lg:col-span-1">
            <ModelReadinessWidget />
          </div>
          <div className="md:col-span-1 lg:col-span-1">
            <ScheduledGenerationsWidget />
          </div>
          <div className="md:col-span-1 lg:col-span-1">
            <DiskHealthWidget />
          </div>
          <div className="md:col-span-1 lg:col-span-1">
            {isAdmin ? <InfraStatusWidget /> : <ActivityFeedWidget />}
          </div>

          {/* Row 3: Activity Feed (full width for admins, since they get infra widget above) */}
          {isAdmin && (
            <div className="md:col-span-2 lg:col-span-4">
              <ActivityFeedWidget />
            </div>
          )}
        </div>
      </Stack>
    </div>
  );
}

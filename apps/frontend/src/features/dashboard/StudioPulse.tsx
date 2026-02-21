import { Stack } from "@/components/layout";
import { ActiveTasksWidget } from "@/features/dashboard/widgets/ActiveTasksWidget";
import { ActivityFeedWidget } from "@/features/dashboard/widgets/ActivityFeedWidget";
import { DiskHealthWidget } from "@/features/dashboard/widgets/DiskHealthWidget";
import { ProjectProgressWidget } from "@/features/dashboard/widgets/ProjectProgressWidget";

/* --------------------------------------------------------------------------
   Studio Pulse Dashboard (PRD-42)
   --------------------------------------------------------------------------

   Default landing page after login. Provides at-a-glance visibility into:
   - Active generation tasks and queue
   - Per-project scene approval progress
   - Filesystem disk health
   - Chronological activity feed

   Layout follows a responsive grid:
   - Desktop: 4-column layout
     Row 1: Active Tasks (2 cols) | Project Progress (2 cols)
     Row 2: Disk Health (1 col)   | Activity Feed (3 cols)
   - Tablet: 2-column layout
   - Mobile: single column stack

   PRD-89 will extend this with drag-and-drop widget customization.
   -------------------------------------------------------------------------- */

export function StudioPulse() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)] p-[var(--spacing-6)]">
      <Stack gap={6}>
        {/* Page header */}
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Studio Pulse
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Real-time overview of your studio. Widgets refresh automatically.
          </p>
        </div>

        {/* Widget grid */}
        <div className="grid grid-cols-1 gap-[var(--spacing-4)] md:grid-cols-2 lg:grid-cols-4">
          {/* Row 1: Active Tasks + Project Progress */}
          <div className="md:col-span-1 lg:col-span-2">
            <ActiveTasksWidget />
          </div>
          <div className="md:col-span-1 lg:col-span-2">
            <ProjectProgressWidget />
          </div>

          {/* Row 2: Disk Health + Activity Feed */}
          <div className="md:col-span-1 lg:col-span-1">
            <DiskHealthWidget />
          </div>
          <div className="md:col-span-1 lg:col-span-3">
            <ActivityFeedWidget />
          </div>
        </div>
      </Stack>
    </div>
  );
}

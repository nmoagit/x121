/**
 * Project delivery tab with status summary, log viewer, and export history
 * (PRD-39 Amendments A.3 & A.4).
 */

import { Badge } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { EmptyState } from "@/components/domain";
import { formatDateTime } from "@/lib/format";
import { Download } from "@/tokens/icons";

import {
  DeliveryDestinationManager,
  DeliveryLogViewer,
  ExportHistory,
  useDeliveryStatus,
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_VARIANT,
} from "@/features/delivery";

import { useProject, useUpdateProject } from "../hooks/use-projects";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ProjectDeliveryTabProps {
  projectId: number;
}

export function ProjectDeliveryTab({ projectId }: ProjectDeliveryTabProps) {
  const { data: project } = useProject(projectId);
  const updateProject = useUpdateProject();
  const { data: statuses = [], isLoading: statusLoading } =
    useDeliveryStatus(projectId);

  function handleToggleAutoDeliver(enabled: boolean) {
    updateProject.mutate({
      id: projectId,
      data: { auto_deliver_on_final: enabled },
    });
  }

  return (
    <Stack gap={6}>
      {/* Delivery Destinations (PRD-039 A.1 & A.2) */}
      <section>
        <DeliveryDestinationManager
          projectId={projectId}
          autoDeliverOnFinal={project?.auto_deliver_on_final ?? false}
          onToggleAutoDeliver={handleToggleAutoDeliver}
        />
      </section>

      {/* Delivery Status Summary */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">
          Character Delivery Status
        </h2>

        {statusLoading && (
          <p className="text-sm text-[var(--color-text-muted)]">
            Loading delivery status...
          </p>
        )}

        {!statusLoading && statuses.length === 0 && (
          <EmptyState
            icon={<Download size={24} />}
            title="No models"
            description="This project has no models to track delivery status for."
          />
        )}

        {statuses.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)] text-left text-xs text-[var(--color-text-muted)]">
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Last Delivered</th>
                </tr>
              </thead>
              <tbody>
                {statuses.map((s) => (
                  <tr
                    key={s.character_id}
                    className="border-b border-[var(--color-border-default)]"
                  >
                    <td className="py-2 pr-3 text-[var(--color-text-primary)] font-medium">
                      {s.character_name}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        variant={DELIVERY_STATUS_VARIANT[s.status]}
                        size="sm"
                      >
                        {DELIVERY_STATUS_LABELS[s.status]}
                      </Badge>
                    </td>
                    <td className="py-2 text-[var(--color-text-secondary)]">
                      {s.last_delivered_at
                        ? formatDateTime(s.last_delivered_at)
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Delivery Log Viewer */}
      <section>
        <DeliveryLogViewer projectId={projectId} />
      </section>

      {/* Export History */}
      <section>
        <ExportHistory projectId={projectId} />
      </section>
    </Stack>
  );
}

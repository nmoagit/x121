/**
 * Project delivery tab with status summary, log viewer, and export history
 * (PRD-39 Amendments A.3 & A.4).
 */

import { useMemo, useState } from "react";

import { Stack } from "@/components/layout";
import { EmptyState, TerminalSection } from "@/components/domain";
import { API_BASE_URL } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  TERMINAL_TH,
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  TERMINAL_STATUS_COLORS,
} from "@/lib/ui-classes";
import { Download } from "@/tokens/icons";
import { useAuthStore } from "@/stores/auth-store";

import {
  DeliveryDestinationManager,
  DeliveryLogViewer,
  ExportHistory,
  ExportPanel,
  ValidationReport,
  useDeliveryExports,
  useDeliveryStatus,
  useDeliveryValidation,
  DELIVERY_STATUS_LABELS,
} from "@/features/delivery";

import { useProject, useUpdateProject } from "../hooks/use-projects";
import { useProjectAvatars } from "../hooks/use-project-avatars";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ProjectDeliveryTabProps {
  projectId: number;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

export function ProjectDeliveryTab({ projectId }: ProjectDeliveryTabProps) {
  const token = useAuthStore((s) => s.accessToken);
  const { data: project } = useProject(projectId);
  const updateProject = useUpdateProject();
  const { data: avatars = [] } = useProjectAvatars(projectId);
  const { data: exports = [] } = useDeliveryExports(projectId);
  const hasActiveExport = exports.some((e) => e.status_id >= 1 && e.status_id <= 5);
  const { data: statuses = [], isLoading: statusLoading } =
    useDeliveryStatus(projectId, hasActiveExport);
  // Lifted model selection state shared between ExportPanel and ValidationReport.
  const [allAvatars, setAllAvatars] = useState(true);
  const [selectedAvatarIds, setSelectedAvatarIds] = useState<number[]>([]);

  // Derive avatar IDs for scoped validation (null = all).
  const validationAvatarIds = allAvatars ? null : selectedAvatarIds;

  const { data: validationResult } = useDeliveryValidation(projectId, true, validationAvatarIds);

  function handleToggleAutoDeliver(enabled: boolean) {
    updateProject.mutate({
      id: projectId,
      data: { auto_deliver_on_final: enabled },
    });
  }

  const avatarOptions = avatars.map((c) => ({ id: c.id, name: c.name }));

  // Collect model IDs that have validation errors (entity_id on error-severity issues
  // where category targets a specific model: metadata_not_approved, no_scenes)
  const invalidModelIds = useMemo(() => {
    const ids = new Set<number>();
    if (!validationResult) return ids;
    for (const issue of validationResult.issues) {
      if (issue.severity === "error" && issue.entity_id != null) {
        // metadata_not_approved and no_scenes use avatar ID as entity_id
        if (issue.category === "metadata_not_approved" || issue.category === "no_scenes") {
          ids.add(issue.entity_id);
        }
      }
    }
    return ids;
  }, [validationResult]);

  return (
    <Stack gap={6}>
      {/* Pre-export validation */}
      <section>
        <ValidationReport projectId={projectId} initialData={validationResult} avatarIds={validationAvatarIds} />
      </section>

      {/* Export delivery */}
      <section>
        <ExportPanel
          projectId={projectId}
          avatars={avatarOptions}
          validationPassed={validationResult?.passed}
          invalidModelIds={invalidModelIds}
          projectDefaultProfileId={project?.default_format_profile_id}
          allAvatars={allAvatars}
          onAllAvatarsChange={setAllAvatars}
          selectedAvatarIds={selectedAvatarIds}
          onSelectedAvatarIdsChange={setSelectedAvatarIds}
        />
      </section>

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
          <TerminalSection title="Avatar Delivery Status" collapsible>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={TERMINAL_DIVIDER}>
                      <th className={`${TERMINAL_TH} py-2 pr-3`}>Model</th>
                      <th className={`${TERMINAL_TH} py-2 pr-3`}>Status</th>
                      <th className={`${TERMINAL_TH} py-2 pr-3`}>Last Delivered</th>
                      <th className={`${TERMINAL_TH} py-2`}>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statuses.map((s) => {
                      const canDownload = s.status !== "not_delivered" && s.export_id != null;
                      const slug = slugify(s.avatar_name);
                      const statusColor = TERMINAL_STATUS_COLORS[s.status] ?? "text-[var(--color-text-muted)]";
                      return (
                        <tr
                          key={s.avatar_id}
                          className={`${TERMINAL_DIVIDER} ${TERMINAL_ROW_HOVER}`}
                        >
                          <td className="py-2 pr-3 font-mono text-xs text-[var(--color-text-primary)] font-medium">
                            {s.avatar_name}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            <span className={statusColor}>
                              {DELIVERY_STATUS_LABELS[s.status]}
                            </span>
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs text-[var(--color-text-muted)]">
                            {s.last_delivered_at
                              ? formatDateTime(s.last_delivered_at)
                              : "--"}
                          </td>
                          <td className="py-2">
                            {canDownload ? (
                              <a
                                href={`${API_BASE_URL}/projects/${projectId}/exports/${s.export_id}/download/${slug}?token=${token}`}
                                className="font-mono text-xs text-cyan-400 hover:underline"
                              >
                                {slug}.rar
                              </a>
                            ) : (
                              <span className="font-mono text-xs text-[var(--color-text-muted)]">--</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          </TerminalSection>
        )}
      </section>

      {/* Delivery Log Viewer */}
      <section>
        <DeliveryLogViewer projectId={projectId} poll={hasActiveExport} />
      </section>

      {/* Export History */}
      <section>
        <ExportHistory projectId={projectId} />
      </section>
    </Stack>
  );
}

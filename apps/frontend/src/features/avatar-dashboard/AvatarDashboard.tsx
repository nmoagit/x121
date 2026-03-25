/**
 * Avatar Settings Dashboard main page component (PRD-108).
 *
 * Aggregates all dashboard sections into a unified view for a single
 * avatar: identity, missing items, pipeline settings, metadata
 * completeness, scene assignments, and generation history.
 */

import { ContextLoader } from "@/components";

import { GenerationHistorySection } from "./GenerationHistorySection";
import { deriveMissingItems } from "./helpers";
import { MetadataSummarySection } from "./MetadataSummarySection";
import { MissingItemsBanner } from "./MissingItemsBanner";
import { PipelineSettingsEditor } from "./PipelineSettingsEditor";
import { SceneAssignmentsSection } from "./SceneAssignmentsSection";
import {
  useAvatarDashboard,
  usePatchSettings,
} from "./hooks/use-avatar-dashboard";
import type { SceneAssignment } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface AvatarDashboardProps {
  /** The avatar to show the dashboard for. */
  avatarId: number;
  /** Scene assignments to display (passed in from parent or fetched separately). */
  sceneAssignments?: SceneAssignment[];
  /** Called when the user navigates to a missing item action. */
  onNavigate?: (url: string) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AvatarDashboard({
  avatarId,
  sceneAssignments = [],
  onNavigate,
}: AvatarDashboardProps) {
  const { data: dashboard, isLoading, error } = useAvatarDashboard(avatarId);
  const patchSettings = usePatchSettings(avatarId);

  if (isLoading) {
    return (
      <div data-testid="dashboard-loading" className="flex items-center justify-center p-8">
        <ContextLoader size={48} />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div data-testid="dashboard-error" className="p-4 text-sm text-[var(--color-text-danger)]">
        Failed to load dashboard data.
      </div>
    );
  }

  const missingItems = dashboard.readiness?.missing_items
    ? deriveMissingItems(avatarId, dashboard.readiness.missing_items)
    : [];

  return (
    <div data-testid="avatar-dashboard" className="flex flex-col gap-6">
      {/* Identity Header */}
      <div data-testid="dashboard-identity" className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
          {dashboard.avatar_name}
        </h2>
        <span
          data-testid="dashboard-avatar-id"
          className="text-xs text-[var(--color-text-tertiary)]"
        >
          Avatar #{dashboard.avatar_id} &middot; Project #{dashboard.project_id}
        </span>
      </div>

      {/* Missing Items Banner */}
      <MissingItemsBanner
        items={missingItems}
        onAction={(item) => onNavigate?.(item.actionUrl)}
      />

      {/* Pipeline Settings Editor */}
      <PipelineSettingsEditor
        settings={dashboard.settings as Record<string, unknown>}
        onSave={(updates) => patchSettings.mutate(updates)}
        isSaving={patchSettings.isPending}
      />

      {/* Metadata Summary */}
      <MetadataSummarySection
        avatarId={avatarId}
        sourceImageCount={dashboard.source_image_count}
        onEditClick={(id) => onNavigate?.(`/avatars/${id}/metadata`)}
      />

      {/* Scene Assignments */}
      <SceneAssignmentsSection
        assignments={sceneAssignments}
        sceneCount={dashboard.scene_count}
        onSceneClick={(sceneId) => onNavigate?.(`/scenes/${sceneId}`)}
      />

      {/* Generation History */}
      <GenerationHistorySection summary={dashboard.generation_summary} />
    </div>
  );
}

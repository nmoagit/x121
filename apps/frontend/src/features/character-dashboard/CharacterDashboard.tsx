/**
 * Character Settings Dashboard main page component (PRD-108).
 *
 * Aggregates all dashboard sections into a unified view for a single
 * character: identity, missing items, pipeline settings, metadata
 * completeness, scene assignments, and generation history.
 */

import { Spinner } from "@/components";

import { GenerationHistorySection } from "./GenerationHistorySection";
import { MetadataSummarySection } from "./MetadataSummarySection";
import { MissingItemsBanner } from "./MissingItemsBanner";
import { PipelineSettingsEditor } from "./PipelineSettingsEditor";
import { SceneAssignmentsSection } from "./SceneAssignmentsSection";
import {
  useCharacterDashboard,
  usePatchSettings,
} from "./hooks/use-character-dashboard";
import type { MissingItem, SceneAssignment } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CharacterDashboardProps {
  /** The character to show the dashboard for. */
  characterId: number;
  /** Scene assignments to display (passed in from parent or fetched separately). */
  sceneAssignments?: SceneAssignment[];
  /** Called when the user navigates to a missing item action. */
  onNavigate?: (url: string) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function deriveMissingItems(
  characterId: number,
  missingItems: string[],
): MissingItem[] {
  return missingItems.map((item) => {
    // Determine category from the item label.
    let category: MissingItem["category"] = "pipeline_setting";
    if (item === "source_image") category = "source_image";
    else if (item === "approved_variant") category = "approved_variant";
    else if (item === "metadata_complete") category = "metadata_complete";

    // Build action URL based on category.
    const urlMap: Record<MissingItem["category"], string> = {
      source_image: `/characters/${characterId}/source-images`,
      approved_variant: `/characters/${characterId}/image-variants`,
      metadata_complete: `/characters/${characterId}/metadata`,
      pipeline_setting: `/characters/${characterId}/settings`,
    };

    return {
      category,
      label: item.replace(/_/g, " "),
      actionUrl: urlMap[category],
    };
  });
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterDashboard({
  characterId,
  sceneAssignments = [],
  onNavigate,
}: CharacterDashboardProps) {
  const { data: dashboard, isLoading, error } = useCharacterDashboard(characterId);
  const patchSettings = usePatchSettings(characterId);

  if (isLoading) {
    return (
      <div data-testid="dashboard-loading" className="flex items-center justify-center p-8">
        <Spinner />
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
    ? deriveMissingItems(characterId, dashboard.readiness.missing_items)
    : [];

  return (
    <div data-testid="character-dashboard" className="flex flex-col gap-6">
      {/* Identity Header */}
      <div data-testid="dashboard-identity" className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
          {dashboard.character_name}
        </h2>
        <span
          data-testid="dashboard-character-id"
          className="text-xs text-[var(--color-text-tertiary)]"
        >
          Character #{dashboard.character_id} &middot; Project #{dashboard.project_id}
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
        characterId={characterId}
        settings={dashboard.settings as Record<string, unknown>}
        sourceImageCount={dashboard.source_image_count}
        onEditClick={(id) => onNavigate?.(`/characters/${id}/metadata`)}
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

/**
 * Character overview tab showing identity, stats, and completeness (PRD-112).
 */

import { useMemo } from "react";

import { Card } from "@/components/composite";
import { Grid, Stack } from "@/components/layout";
import { LoadingPane, Tooltip } from "@/components/primitives";

import {
  deriveMissingItems,
  GenerationHistorySection,
  MetadataSummarySection,
  MissingItemsBanner,
  SceneAssignmentsSection,
  useCharacterDashboard,
} from "@/features/character-dashboard";
import type { Character } from "@/features/projects/types";
import { useCharacterSceneSettings } from "@/features/scene-catalog/hooks/use-character-scene-settings";
import { useExpandedSettings } from "@/features/scene-catalog/hooks/use-expanded-settings";
import { ReadinessStateBadge } from "@/features/readiness/ReadinessStateBadge";
import type { ReadinessState } from "@/features/readiness/types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CharacterOverviewTabProps {
  character: Character;
  characterId: number;
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

/** Total source images needed (clothed + topless tracks). */
const TOTAL_SOURCE_IMAGES_NEEDED = 2;

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card elevation="flat" padding="md">
      <dt className="text-xs text-[var(--color-text-muted)] mb-[var(--spacing-1)]">
        {label}
      </dt>
      <dd className="text-lg font-semibold text-[var(--color-text-primary)]">
        {value}
      </dd>
    </Card>
  );
}

/** Stat card showing N/M ratio, green when complete. */
function RatioStatCard({
  label,
  current,
  total,
  tooltip,
}: {
  label: string;
  current: number;
  total: number;
  tooltip: string;
}) {
  const isComplete = current >= total && total > 0;
  return (
    <Card elevation="flat" padding="md">
      <dt className="text-xs text-[var(--color-text-muted)] mb-[var(--spacing-1)]">
        {label}
      </dt>
      <Tooltip content={tooltip} side="bottom">
        <dd
          className={`text-lg font-semibold cursor-help ${
            isComplete
              ? "text-[var(--color-status-success)]"
              : "text-[var(--color-text-primary)]"
          }`}
        >
          {current}/{total}
        </dd>
      </Tooltip>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterOverviewTab({
  character,
  characterId,
}: CharacterOverviewTabProps) {
  const { data: dashboard, isLoading: dashboardLoading } =
    useCharacterDashboard(characterId);
  const { data: sceneSettings, isLoading: settingsLoading } =
    useCharacterSceneSettings(characterId);
  const expandedSettings = useExpandedSettings(sceneSettings);

  /** Set of enabled scene_type+track keys from the effective scene settings. */
  const enabledKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const s of expandedSettings) {
      if (s.is_enabled) {
        keys.add(`${s.scene_type_id}-${s.track_id ?? 0}`);
      }
    }
    return keys;
  }, [expandedSettings]);

  /** Dashboard assignments filtered to only enabled scene+track combos. */
  const activeAssignments = useMemo(() => {
    const raw = dashboard?.scene_assignments ?? [];
    return raw.filter((a) => enabledKeys.has(`${a.scene_type_id}-${a.track_id ?? 0}`));
  }, [dashboard?.scene_assignments, enabledKeys]);

  if (dashboardLoading || settingsLoading) {
    return <LoadingPane />;
  }

  const missingItems =
    dashboard?.readiness?.missing_items
      ? deriveMissingItems(characterId, dashboard.readiness.missing_items)
      : [];

  const metadataFieldCount = Object.keys(character.metadata ?? {}).length;

  return (
    <Stack gap={4}>
      {/* Stats grid */}
      {dashboard && (() => {
        const scenesAssigned = activeAssignments.length;
        const scenesWithFinalVideo = activeAssignments.filter((a) => a.final_video_count > 0).length;

        return (
          <Grid cols={2} gap={3}>
            <RatioStatCard
              label="Source Images"
              current={dashboard.source_image_count}
              total={TOTAL_SOURCE_IMAGES_NEEDED}
              tooltip={`${dashboard.source_image_count} provided / ${TOTAL_SOURCE_IMAGES_NEEDED} needed (clothed + topless)`}
            />
            <StatCard
              label="Variants"
              value={`${dashboard.variant_counts.approved} / ${dashboard.variant_counts.total}`}
            />
            <RatioStatCard
              label="Scenes"
              current={scenesWithFinalVideo}
              total={scenesAssigned}
              tooltip={`${scenesWithFinalVideo} with final video / ${scenesAssigned} assigned`}
            />
            <StatCard label="Metadata Fields" value={metadataFieldCount} />
          </Grid>
        );
      })()}

      {/* Completeness */}
      {dashboard?.readiness && (
        <Card elevation="flat" padding="md">
          <Stack gap={2}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Readiness
              </h3>
              <div className="flex items-center gap-[var(--spacing-2)]">
                <ReadinessStateBadge
                  state={dashboard.readiness.state as ReadinessState}
                  missingItems={dashboard.readiness.missing_items}
                />
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {dashboard.readiness.readiness_pct}%
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
              <div
                className="h-full rounded-full bg-[var(--color-action-primary)] transition-all"
                style={{ width: `${dashboard.readiness.readiness_pct}%` }}
              />
            </div>

            <MissingItemsBanner items={missingItems} />
          </Stack>
        </Card>
      )}

      {/* Metadata Completeness */}
      {dashboard && (
        <Card elevation="flat" padding="md">
          <MetadataSummarySection
            characterId={characterId}
            sourceImageCount={dashboard.source_image_count}
          />
        </Card>
      )}

      {/* Scene Assignments */}
      {dashboard && (
        <Card elevation="flat" padding="md">
          <SceneAssignmentsSection
            assignments={activeAssignments}
            sceneCount={activeAssignments.length}
          />
        </Card>
      )}

      {/* Generation History */}
      {dashboard && (
        <Card elevation="flat" padding="md">
          <GenerationHistorySection summary={dashboard.generation_summary} />
        </Card>
      )}
    </Stack>
  );
}

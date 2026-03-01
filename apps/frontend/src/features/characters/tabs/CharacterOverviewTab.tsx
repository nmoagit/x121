/**
 * Character overview tab showing identity, stats, and completeness (PRD-112).
 */

import { Card } from "@/components/composite";
import { Grid, Stack } from "@/components/layout";
import { Badge, LoadingPane } from "@/components/primitives";
import { User } from "@/tokens/icons";

import {
  deriveMissingItems,
  GenerationHistorySection,
  MetadataSummarySection,
  MissingItemsBanner,
  SceneAssignmentsSection,
  useCharacterDashboard,
} from "@/features/character-dashboard";
import { useImageVariants } from "@/features/images/hooks/use-image-variants";
import { pickAvatarUrl } from "@/features/images/utils";
import type { Character } from "@/features/projects/types";
import {
  characterStatusBadgeVariant,
  characterStatusLabel,
} from "@/features/projects/types";
import { ReadinessStateBadge } from "@/features/readiness/ReadinessStateBadge";
import type { ReadinessState } from "@/features/readiness/types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CharacterOverviewTabProps {
  character: Character;
  characterId: number;
  groupName?: string;
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

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

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterOverviewTab({
  character,
  characterId,
  groupName,
}: CharacterOverviewTabProps) {
  const { data: dashboard, isLoading: dashboardLoading } =
    useCharacterDashboard(characterId);
  const { data: variants } = useImageVariants(characterId);

  const statusLabel = characterStatusLabel(character.status_id);
  const badgeVariant = characterStatusBadgeVariant(character.status_id);
  const avatarUrl = pickAvatarUrl(variants ?? []);

  if (dashboardLoading) {
    return <LoadingPane />;
  }

  const missingItems =
    dashboard?.readiness?.missing_items
      ? deriveMissingItems(characterId, dashboard.readiness.missing_items)
      : [];

  const metadataFieldCount = Object.keys(character.metadata ?? {}).length;

  return (
    <Stack gap={4}>
      {/* Identity card */}
      <Card elevation="flat" padding="md">
        <div className="flex items-center gap-[var(--spacing-3)]">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={character.name}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-secondary)]">
              <User size={32} className="text-[var(--color-text-muted)]" />
            </div>
          )}
          <div className="flex flex-col gap-[var(--spacing-1)]">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {character.name}
            </h2>
            <div className="flex items-center gap-[var(--spacing-2)]">
              <Badge variant={badgeVariant} size="sm">
                {statusLabel}
              </Badge>
              <span className="text-sm text-[var(--color-text-muted)]">
                {groupName ?? "Ungrouped"}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats grid */}
      {dashboard && (
        <Grid cols={2} gap={3}>
          <StatCard
            label="Source Images"
            value={dashboard.source_image_count}
          />
          <StatCard
            label="Variants"
            value={`${dashboard.variant_counts.approved} / ${dashboard.variant_counts.total}`}
          />
          <StatCard label="Scenes" value={dashboard.scene_count} />
          <StatCard label="Metadata Fields" value={metadataFieldCount} />
        </Grid>
      )}

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
            assignments={dashboard.scene_assignments ?? []}
            sceneCount={dashboard.scene_count}
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

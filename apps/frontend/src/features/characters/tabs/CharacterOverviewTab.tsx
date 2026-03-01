/**
 * Character overview tab showing identity, stats, and completeness (PRD-112).
 */

import { Card } from "@/components/composite";
import { Grid, Stack } from "@/components/layout";
import { Badge, LoadingPane } from "@/components/primitives";
import { User } from "@/tokens/icons";

import {
  deriveMissingItems,
  MissingItemsBanner,
  useCharacterDashboard,
} from "@/features/character-dashboard";
import { useImageVariants } from "@/features/images/hooks/use-image-variants";
import { IMAGE_VARIANT_STATUS } from "@/features/images/types";
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
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function findAvatarUrl(
  variants: { is_hero: boolean; status_id: number; file_path: string }[] | undefined,
): string | null {
  if (!variants?.length) return null;
  const hero = variants.find((v) => v.is_hero && v.file_path);
  if (hero) return hero.file_path;
  const approved = variants.find(
    (v) => v.status_id === IMAGE_VARIANT_STATUS.APPROVED && v.file_path,
  );
  return approved?.file_path ?? null;
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
}: CharacterOverviewTabProps) {
  const { data: dashboard, isLoading: dashboardLoading } =
    useCharacterDashboard(characterId);
  const { data: variants } = useImageVariants(characterId);

  const statusLabel = characterStatusLabel(character.status_id);
  const badgeVariant = characterStatusBadgeVariant(character.status_id);
  const avatarUrl = findAvatarUrl(variants);

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
                {character.group_id ? `Group #${character.group_id}` : "Ungrouped"}
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
    </Stack>
  );
}

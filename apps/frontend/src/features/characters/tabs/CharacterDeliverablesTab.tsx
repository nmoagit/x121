/**
 * Character deliverables tab — approved variants and final videos (PRD-112).
 */

import { Card } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Grid, Stack } from "@/components/layout";
import { Badge, Button, LoadingPane, Spinner } from "@/components/primitives";
import { Download, Video, Image } from "@/tokens/icons";

import { useImageVariants } from "@/features/images/hooks/use-image-variants";
import { IMAGE_VARIANT_STATUS } from "@/features/images/types";
import type { ImageVariant } from "@/features/images/types";
import { useCharacterScenes } from "@/features/scenes/hooks/useCharacterScenes";
import { useSceneVersions } from "@/features/scenes/hooks/useClipManagement";
import type { Scene, SceneVideoVersion } from "@/features/scenes/types";

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function ApprovedVariantCard({ variant }: { variant: ImageVariant }) {
  return (
    <Card elevation="sm" padding="sm">
      <Stack gap={2}>
        {variant.file_path ? (
          <img
            src={variant.file_path}
            alt={variant.variant_label}
            className="h-32 w-full rounded-[var(--radius-sm)] object-cover"
          />
        ) : (
          <div className="flex h-32 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]">
            No image
          </div>
        )}
        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
          {variant.variant_label}
        </p>
        <div className="flex items-center gap-[var(--spacing-1)]">
          <Badge variant="success" size="sm">
            {variant.is_hero ? "Hero" : "Approved"}
          </Badge>
          {variant.variant_type && (
            <Badge variant="info" size="sm">
              {variant.variant_type}
            </Badge>
          )}
        </div>
        {variant.file_path && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Download size={14} />}
            onClick={() => window.open(variant.file_path, "_blank")}
          >
            Download
          </Button>
        )}
      </Stack>
    </Card>
  );
}

function SceneFinalClips({ scene }: { scene: Scene }) {
  const { data: clips, isLoading } = useSceneVersions(scene.id);

  if (isLoading) {
    return (
      <div className="flex items-center gap-[var(--spacing-2)] py-[var(--spacing-2)]">
        <Spinner size="sm" />
        <span className="text-sm text-[var(--color-text-muted)]">
          Loading clips...
        </span>
      </div>
    );
  }

  const finalClips = clips?.filter((c: SceneVideoVersion) => c.is_final) ?? [];

  if (finalClips.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-[var(--spacing-2)]">
        No final clips for Scene #{scene.id}
      </p>
    );
  }

  return (
    <Stack gap={2}>
      <h4 className="text-sm font-medium text-[var(--color-text-secondary)]">
        Scene #{scene.id}
      </h4>
      {finalClips.map((clip) => (
        <Card key={clip.id} elevation="flat" padding="sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[var(--spacing-2)]">
              <Video size={16} className="text-[var(--color-text-muted)]" />
              <span className="text-sm text-[var(--color-text-primary)]">
                Version {clip.version_number}
              </span>
              <Badge variant="success" size="sm">
                Final
              </Badge>
              {clip.duration_secs != null && (
                <span className="text-xs text-[var(--color-text-muted)]">
                  {clip.duration_secs.toFixed(1)}s
                </span>
              )}
            </div>
            {clip.file_path && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Download size={14} />}
                onClick={() => window.open(clip.file_path, "_blank")}
              >
                Download
              </Button>
            )}
          </div>
        </Card>
      ))}
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterDeliverablesTabProps {
  characterId: number;
}

export function CharacterDeliverablesTab({
  characterId,
}: CharacterDeliverablesTabProps) {
  const { data: variants, isLoading: variantsLoading } =
    useImageVariants(characterId);
  const { data: scenes, isLoading: scenesLoading } =
    useCharacterScenes(characterId);

  const isLoading = variantsLoading || scenesLoading;

  if (isLoading) {
    return <LoadingPane />;
  }

  const approvedVariants =
    variants?.filter(
      (v) =>
        v.is_hero ||
        v.status_id === IMAGE_VARIANT_STATUS.APPROVED,
    ) ?? [];

  return (
    <Stack gap={6}>
      {/* Approved Images */}
      <Card elevation="flat" padding="md">
        <Stack gap={3}>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            Approved Images
          </h3>
          {approvedVariants.length === 0 ? (
            <EmptyState
              icon={<Image size={32} />}
              title="No approved images"
              description="Approve image variants to see them here."
            />
          ) : (
            <Grid cols={3} gap={4}>
              {approvedVariants.map((v) => (
                <ApprovedVariantCard key={v.id} variant={v} />
              ))}
            </Grid>
          )}
        </Stack>
      </Card>

      {/* Final Videos */}
      <Card elevation="flat" padding="md">
        <Stack gap={3}>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            Final Videos
          </h3>
          {!scenes?.length ? (
            <EmptyState
              icon={<Video size={32} />}
              title="No scenes"
              description="Create scenes and mark clips as final to see them here."
            />
          ) : (
            <Stack gap={4}>
              {scenes.map((scene) => (
                <SceneFinalClips key={scene.id} scene={scene} />
              ))}
            </Stack>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

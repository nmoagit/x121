/**
 * Avatar seeds tab -- shows every generation slot that needs a seed image (PRD-146).
 * Enhanced with MediaVariantPicker and auto-assign (PRD-147 Phases 5+7).
 * Split into Image Generation and Scene Generation sections (PRD-154).
 */

import { useCallback, useState } from "react";

import { Button, ContextLoader } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Image, Sparkles } from "@/tokens/icons";

import {
  useAvatarSeedSummary,
  useAssignMedia,
  useRemoveMediaAssignment,
  useAutoAssignSeeds,
} from "../hooks/use-media-assignments";
import type {
  SeedSlotWithAssignment,
  AutoAssignResult,
} from "../hooks/use-media-assignments";
import { AutoAssignPreviewModal } from "./AutoAssignPreviewModal";
import { SeedSlotCard, ImageSlotCard } from "./SeedSlotCards";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface AvatarSeedsTabProps {
  avatarId: number;
  projectId: number;
}

export function AvatarSeedsTab({ avatarId, projectId: _projectId }: AvatarSeedsTabProps) {
  const { data: seedSummary, isLoading } = useAvatarSeedSummary(avatarId);
  const assignMutation = useAssignMedia(avatarId);
  const removeMutation = useRemoveMediaAssignment(avatarId);
  const autoAssignMutation = useAutoAssignSeeds(avatarId);

  const [autoAssignPreview, setAutoAssignPreview] = useState<AutoAssignResult | null>(null);

  const handleSelectVariant = useCallback(
    (entry: SeedSlotWithAssignment, variantId: number) => {
      if (!entry.media_slot_id) return;
      assignMutation.mutate({
        media_slot_id: entry.media_slot_id,
        scene_type_id: entry.scene_type_id,
        track_id: entry.track_id,
        media_variant_id: variantId,
        media_type: "image",
      });
    },
    [assignMutation],
  );

  const handleClearVariant = useCallback(
    (assignmentId: number) => removeMutation.mutate(assignmentId),
    [removeMutation],
  );

  const handleAutoAssign = useCallback(async () => {
    try {
      const preview = await autoAssignMutation.mutateAsync({ dry_run: true });
      setAutoAssignPreview(preview);
    } catch {
      // mutation error handled by TanStack Query
    }
  }, [autoAssignMutation]);

  const handleConfirmAutoAssign = useCallback(async () => {
    try {
      await autoAssignMutation.mutateAsync({ dry_run: false, overwrite_existing: false });
      setAutoAssignPreview(null);
    } catch {
      // mutation error handled by TanStack Query
    }
  }, [autoAssignMutation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ContextLoader size={48} />
      </div>
    );
  }

  const slots = seedSummary?.slots ?? [];

  if (slots.length === 0) {
    return (
      <EmptyState
        icon={<Image size={32} />}
        title="No seed slots"
        description="No scene type x track configurations found for this avatar's pipeline."
      />
    );
  }

  const imageSlots = slots.filter((s) => s.slot_kind === "image");
  const sceneSlots = slots.filter((s) => s.slot_kind !== "image");

  const allAssigned = slots.every((s) => s.assignment != null);
  const unassignedCount = slots.filter((s) => s.assignment == null && s.media_slot_id != null).length;

  return (
    <Stack gap={4}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-[var(--color-text-muted)]">
          Each slot needs a seed image for generation.
        </p>
        <Button
          size="xs"
          variant="secondary"
          icon={<Sparkles size={12} />}
          disabled={allAssigned || autoAssignMutation.isPending}
          loading={autoAssignMutation.isPending}
          onClick={handleAutoAssign}
        >
          Auto-assign ({unassignedCount})
        </Button>
      </div>

      {/* Auto-assign preview modal */}
      <AutoAssignPreviewModal
        preview={autoAssignPreview}
        onConfirm={handleConfirmAutoAssign}
        onCancel={() => setAutoAssignPreview(null)}
        loading={autoAssignMutation.isPending}
      />

      {/* Image Generation section */}
      {imageSlots.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-mono uppercase tracking-wide text-violet-400">
            Image Generation
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {imageSlots.map((entry) => (
              <ImageSlotCard
                key={`image-${entry.image_type_id}-${entry.track_id}`}
                entry={entry}
                avatarId={avatarId}
                onSelectVariant={handleSelectVariant}
                onClearVariant={handleClearVariant}
                assigning={assignMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Scene Generation section */}
      {sceneSlots.length > 0 && (
        <div className="space-y-2">
          {imageSlots.length > 0 && (
            <h3 className="text-[10px] font-mono uppercase tracking-wide text-cyan-400">
              Scene Generation
            </h3>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sceneSlots.map((entry) => (
              <SeedSlotCard
                key={`${entry.scene_type_id}-${entry.track_id}`}
                entry={entry}
                avatarId={avatarId}
                onSelectVariant={handleSelectVariant}
                onClearVariant={handleClearVariant}
                assigning={assignMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}
    </Stack>
  );
}

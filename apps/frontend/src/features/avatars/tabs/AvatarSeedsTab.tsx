/**
 * Avatar seeds tab -- shows every scene_type x track that needs a seed image (PRD-146).
 * Enhanced with MediaVariantPicker and auto-assign (PRD-147 Phases 5+7).
 *
 * Each row represents a generation slot: a scene type + track combination
 * that needs a seed file for video generation.
 */

import { useCallback, useState } from "react";

import { Button, WireframeLoader } from "@/components/primitives";
import { Modal } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Image, Sparkles } from "@/tokens/icons";
import { TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";
import { variantThumbnailUrl } from "@/features/media/utils";

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
import { MediaVariantPicker } from "../components/MediaVariantPicker";

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
        <WireframeLoader size={48} />
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

  const allAssigned = slots.every((s) => s.assignment != null);
  const unassignedCount = slots.filter((s) => s.assignment == null && s.media_slot_id != null).length;

  return (
    <Stack gap={4}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-[var(--color-text-muted)]">
          Each scene type x track combination needs a seed image for video generation.
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((entry) => (
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
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Auto-assign preview modal
   -------------------------------------------------------------------------- */

function AutoAssignPreviewModal({
  preview,
  onConfirm,
  onCancel,
  loading,
}: {
  preview: AutoAssignResult | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <Modal
      open={preview !== null}
      onClose={onCancel}
      title="Auto-Assign Seeds"
      size="lg"
    >
      {preview && (
        <Stack gap={4}>
          <p className="text-xs font-mono text-[var(--color-text-muted)]">
            {preview.total_assigned} of {preview.total_slots} slots will be assigned.
            {preview.total_skipped > 0 && ` ${preview.total_skipped} skipped.`}
          </p>

          {/* Assignments */}
          {preview.assigned.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-mono text-green-400 uppercase tracking-wide">Will Assign</h4>
              <div className="space-y-1">
                {preview.assigned.map((a) => (
                  <div
                    key={`${a.scene_type_id}-${a.track_id}`}
                    className="flex items-center gap-2 rounded bg-green-500/5 border border-green-500/20 px-2 py-1.5 font-mono text-xs"
                  >
                    <span className="text-[var(--color-text-primary)]">{a.scene_type_name}</span>
                    <span className={TRACK_TEXT_COLORS[a.track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]"}>{a.track_name}</span>
                    <span className="text-[var(--color-text-muted)]">→</span>
                    {a.media_variant_id && (
                      <img
                        src={variantThumbnailUrl(a.media_variant_id, 64)}
                        alt={a.variant_label}
                        className="h-6 w-6 rounded object-cover"
                      />
                    )}
                    <span className="text-cyan-400 truncate">{a.variant_label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skipped */}
          {preview.skipped.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-mono text-orange-400 uppercase tracking-wide">Skipped</h4>
              <div className="space-y-1">
                {preview.skipped.map((s) => (
                  <div
                    key={`${s.scene_type_name}-${s.track_name}`}
                    className="flex items-center gap-2 rounded bg-orange-500/5 border border-orange-500/20 px-2 py-1.5 font-mono text-[10px] text-[var(--color-text-muted)]"
                  >
                    <span>{s.scene_type_name}</span>
                    <span>{s.track_name}</span>
                    <span className="text-orange-400">{s.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-default)]">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={onConfirm} loading={loading}>
              Confirm ({preview.total_assigned})
            </Button>
          </div>
        </Stack>
      )}
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Seed slot card
   -------------------------------------------------------------------------- */

function SeedSlotCard({
  entry,
  avatarId,
  onSelectVariant,
  onClearVariant,
  assigning: _assigning,
}: {
  entry: SeedSlotWithAssignment;
  avatarId: number;
  onSelectVariant: (entry: SeedSlotWithAssignment, variantId: number) => void;
  onClearVariant: (assignmentId: number) => void;
  assigning: boolean;
}) {
  const hasAssignment = entry.assignment != null;
  const trackColor = TRACK_TEXT_COLORS[entry.track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]";

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border bg-[#0d1117] p-3 space-y-2",
        hasAssignment
          ? "border-green-500/40"
          : "border-red-500/40",
      )}
    >
      {/* Header: scene type + track */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="font-medium text-[var(--color-text-primary)]">
            {entry.scene_type_name}
          </span>
          <span className={trackColor}>
            {entry.track_name}
          </span>
        </div>
        {hasAssignment ? (
          <span className="text-[10px] font-mono text-green-400">assigned</span>
        ) : (
          <span className="text-[10px] font-mono text-red-400">missing</span>
        )}
      </div>

      {/* Workflow context */}
      {entry.workflow_name && (
        <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
          workflow: {entry.workflow_name}
        </p>
      )}

      {/* Variant picker — shows thumbnails to select/change, or drop zone if no variants */}
      {entry.media_slot_id ? (
        <MediaVariantPicker
          avatarId={avatarId}
          trackName={entry.track_name}
          selectedVariantId={entry.assignment?.media_variant_id ?? null}
          onSelect={(variantId) => onSelectVariant(entry, variantId)}
          onClear={entry.assignment ? () => onClearVariant(entry.assignment!.id) : undefined}
        />
      ) : (
        <p className="text-[10px] font-mono text-orange-400">
          No workflow assigned — cannot configure seed.
        </p>
      )}
    </div>
  );
}

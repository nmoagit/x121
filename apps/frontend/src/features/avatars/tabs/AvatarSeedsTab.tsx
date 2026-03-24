/**
 * Avatar seeds tab -- shows every scene_type x track that needs a seed image (PRD-146).
 * Enhanced with MediaVariantPicker and auto-assign (PRD-147 Phases 5+7).
 *
 * Each row represents a generation slot: a scene type + track combination
 * that needs a seed file for video generation.
 */

import { useCallback, useState } from "react";

import { Button, WireframeLoader } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Image, Sparkles, X } from "@/tokens/icons";
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
      if (preview.total_assigned === 0) {
        window.alert("No slots can be auto-assigned. Upload variants first.");
        return;
      }
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

      {/* Auto-assign preview */}
      {autoAssignPreview && (
        <AutoAssignPreview
          preview={autoAssignPreview}
          onConfirm={handleConfirmAutoAssign}
          onCancel={() => setAutoAssignPreview(null)}
          loading={autoAssignMutation.isPending}
        />
      )}

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
   Auto-assign preview banner
   -------------------------------------------------------------------------- */

function AutoAssignPreview({
  preview,
  onConfirm,
  onCancel,
  loading,
}: {
  preview: AutoAssignResult;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-blue-500/40 bg-blue-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-blue-400">
          Auto-assign {preview.total_assigned} of {preview.total_slots} slots
          {preview.total_skipped > 0 && ` (${preview.total_skipped} skipped)`}
        </p>
        <div className="flex items-center gap-2">
          <Button size="xs" variant="primary" onClick={onConfirm} loading={loading}>
            Confirm
          </Button>
          <Button size="xs" variant="ghost" onClick={onCancel} icon={<X size={12} />}>
            Cancel
          </Button>
        </div>
      </div>

      {preview.assigned.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {preview.assigned.map((a) => (
            <span
              key={`${a.scene_type_id}-${a.track_id}`}
              className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-mono text-blue-300"
            >
              {a.scene_type_name}/{a.track_name}
              <span className="text-blue-400/60">{a.variant_label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
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

      {/* Current assignment preview with clear button */}
      {hasAssignment && entry.assignment && (
        <div className="flex items-center gap-2">
          {entry.assignment.media_variant_id != null ? (
            <img
              src={variantThumbnailUrl(entry.assignment.media_variant_id, 128)}
              alt={`${entry.scene_type_name} ${entry.track_name} seed`}
              className="h-10 w-10 rounded-[var(--radius-md)] object-cover border border-green-500/30"
            />
          ) : entry.assignment.file_path ? (
            <span className="text-[10px] font-mono text-[var(--color-text-muted)] bg-[var(--color-surface-secondary)] rounded px-2 py-1 truncate max-w-[180px]">
              {entry.assignment.file_path.split("/").pop()}
            </span>
          ) : null}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onClearVariant(entry.assignment!.id)}
            icon={<X size={12} />}
          >
            Remove
          </Button>
        </div>
      )}

      {/* Variant picker when slot has a workflow but no assignment */}
      {!hasAssignment && entry.media_slot_id && (
        <MediaVariantPicker
          avatarId={avatarId}
          trackName={entry.track_name}
          selectedVariantId={null}
          onSelect={(variantId) => onSelectVariant(entry, variantId)}
        />
      )}

      {/* No workflow = can't assign */}
      {!hasAssignment && !entry.media_slot_id && (
        <p className="text-[10px] font-mono text-orange-400">
          No workflow assigned — cannot configure seed.
        </p>
      )}

      {/* Show picker below assigned variant for re-assignment */}
      {hasAssignment && entry.media_slot_id && (
        <MediaVariantPicker
          avatarId={avatarId}
          trackName={entry.track_name}
          selectedVariantId={entry.assignment?.media_variant_id ?? null}
          onSelect={(variantId) => onSelectVariant(entry, variantId)}
          onClear={entry.assignment ? () => onClearVariant(entry.assignment!.id) : undefined}
        />
      )}
    </div>
  );
}

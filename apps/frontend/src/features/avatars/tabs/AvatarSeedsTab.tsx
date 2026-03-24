/**
 * Avatar seeds tab — shows every scene_type × track that needs a seed image (PRD-146).
 *
 * Each row represents a generation slot: a scene type + track combination
 * that needs a seed file for video generation.
 */

import { useCallback } from "react";

import { WireframeLoader } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Image } from "@/tokens/icons";
import { TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";

import { variantThumbnailUrl } from "@/features/media/utils";

import {
  useAvatarSeedSummary,
  useAssignMedia,
  useRemoveMediaAssignment,
} from "../hooks/use-media-assignments";
import type { SeedSlotWithAssignment } from "../hooks/use-media-assignments";
import { SeedDataDropSlot } from "../components/SeedDataDropSlot";

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

  const handleUpload = useCallback(
    (entry: SeedSlotWithAssignment, file: File) => {
      if (!entry.media_slot_id) return;
      assignMutation.mutate({
        media_slot_id: entry.media_slot_id,
        track_id: entry.track_id,
        file_path: file.name,
        media_type: file.type.startsWith("image") ? "image" : file.type.startsWith("video") ? "video" : "other",
      });
    },
    [assignMutation],
  );

  const handleRemove = useCallback(
    (assignmentId: number) => removeMutation.mutate(assignmentId),
    [removeMutation],
  );

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
        description="No scene type × track configurations found for this avatar's pipeline."
      />
    );
  }

  return (
    <Stack gap={4}>
      <p className="text-xs font-mono text-[var(--color-text-muted)]">
        Each scene type × track combination needs a seed image for video generation.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((entry) => (
          <SeedSlotCard
            key={`${entry.scene_type_id}-${entry.track_id}`}
            entry={entry}
            onUpload={handleUpload}
            onRemove={handleRemove}
            uploading={assignMutation.isPending}
          />
        ))}
      </div>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Seed slot card
   -------------------------------------------------------------------------- */

function SeedSlotCard({
  entry,
  onUpload,
  onRemove,
  uploading,
}: {
  entry: SeedSlotWithAssignment;
  onUpload: (entry: SeedSlotWithAssignment, file: File) => void;
  onRemove: (assignmentId: number) => void;
  uploading: boolean;
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

      {/* Current assignment preview */}
      {hasAssignment && entry.assignment && (
        <div className="flex items-center gap-2">
          {entry.assignment.media_variant_id != null ? (
            <img
              src={variantThumbnailUrl(entry.assignment.media_variant_id, 128)}
              alt={`${entry.scene_type_name} ${entry.track_name} seed`}
              className="h-12 w-12 rounded-[var(--radius-md)] object-cover border border-[var(--color-border-default)]"
            />
          ) : entry.assignment.file_path ? (
            <span className="text-[10px] font-mono text-[var(--color-text-muted)] bg-[var(--color-surface-secondary)] rounded px-2 py-1 truncate max-w-[180px]">
              {entry.assignment.file_path.split("/").pop()}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(entry.assignment!.id)}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-red-400 hover:bg-[#161b22] transition-colors"
            title="Remove assignment"
          >
            <span className="text-[10px] font-mono">remove</span>
          </button>
        </div>
      )}

      {/* Drop zone when not assigned */}
      {!hasAssignment && entry.media_slot_id && (
        <SeedDataDropSlot
          accept="image/*"
          label="Drop seed image"
          loading={uploading}
          onFile={(file) => onUpload(entry, file)}
          compact
        />
      )}

      {/* No workflow = can't assign */}
      {!hasAssignment && !entry.media_slot_id && (
        <p className="text-[10px] font-mono text-orange-400">
          No workflow assigned — cannot configure seed.
        </p>
      )}
    </div>
  );
}

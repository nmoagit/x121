/**
 * Avatar seeds tab — shows workflow media slots and their assignments (PRD-146).
 *
 * Fetches the seed summary (slots + assignments) and renders a card per slot.
 * Each card shows the slot label, media type badge, current assignment preview,
 * passthrough toggle, and a drop zone for uploading/assigning files.
 */

import { useCallback, useMemo } from "react";

import { WireframeLoader } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Image } from "@/tokens/icons";

import { usePipelineContextSafe } from "@/features/pipelines";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";

import {
  useAvatarSeedSummary,
  useAssignMedia,
  useRemoveMediaAssignment,
  useUpdateMediaAssignment,
} from "../hooks/use-media-assignments";
import type { AvatarMediaAssignment, WorkflowMediaSlot } from "../hooks/use-media-assignments";
import { MediaSlotCard } from "./MediaSlotCard";

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
  const updateMutation = useUpdateMediaAssignment(avatarId);

  const pipelineCtx = usePipelineContextSafe();
  const { data: tracks } = useTracks(false, pipelineCtx?.pipelineId);

  const trackOptions = useMemo(() => {
    if (!tracks) return [];
    return tracks.map((t) => ({ value: String(t.id), label: t.name }));
  }, [tracks]);

  /** Map slot ID to assignment for quick lookup. */
  const assignmentBySlot = useMemo(() => {
    const map = new Map<number, AvatarMediaAssignment>();
    if (seedSummary?.assignments) {
      for (const a of seedSummary.assignments) {
        map.set(a.media_slot_id, a);
      }
    }
    return map;
  }, [seedSummary?.assignments]);

  /** Split slots into required vs optional. */
  const { requiredSlots, optionalSlots } = useMemo(() => {
    const slots = seedSummary?.slots ?? [];
    const sorted = [...slots].sort((a, b) => a.sort_order - b.sort_order);
    return {
      requiredSlots: sorted.filter((s) => s.is_required),
      optionalSlots: sorted.filter((s) => !s.is_required),
    };
  }, [seedSummary?.slots]);

  const handleUpload = useCallback(
    (slotId: number, file: File) => {
      assignMutation.mutate({
        media_slot_id: slotId,
        file_path: file.name,
        media_type: file.type.split("/")[0] || "other",
      });
    },
    [assignMutation],
  );

  const handleRemove = useCallback(
    (assignmentId: number) => removeMutation.mutate(assignmentId),
    [removeMutation],
  );

  const handleTogglePassthrough = useCallback(
    (slot: WorkflowMediaSlot, assignment: AvatarMediaAssignment | undefined, checked: boolean) => {
      if (assignment) {
        updateMutation.mutate({
          assignmentId: assignment.id,
          data: { is_passthrough: checked, passthrough_track_id: null },
        });
      } else {
        assignMutation.mutate({
          media_slot_id: slot.id,
          is_passthrough: checked,
          media_type: slot.media_type,
        });
      }
    },
    [assignMutation, updateMutation],
  );

  const handleTrackSelect = useCallback(
    (assignmentId: number, trackId: number | null) => {
      updateMutation.mutate({ assignmentId, data: { passthrough_track_id: trackId } });
    },
    [updateMutation],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <WireframeLoader size={48} />
      </div>
    );
  }

  const hasSlots = requiredSlots.length > 0 || optionalSlots.length > 0;

  if (!hasSlots) {
    return (
      <EmptyState
        icon={<Image size={32} />}
        title="No media slots"
        description="This avatar's workflow has no media slots configured. Slots are detected automatically from the workflow definition."
      />
    );
  }

  const renderSlotGrid = (slots: WorkflowMediaSlot[]) => (
    <div className="grid grid-cols-1 gap-[var(--spacing-3)] sm:grid-cols-2 lg:grid-cols-3">
      {slots.map((slot) => (
        <MediaSlotCard
          key={slot.id}
          slot={slot}
          assignment={assignmentBySlot.get(slot.id)}
          onUpload={handleUpload}
          onRemove={handleRemove}
          onTogglePassthrough={handleTogglePassthrough}
          onTrackSelect={handleTrackSelect}
          trackOptions={trackOptions}
          uploading={assignMutation.isPending}
        />
      ))}
    </div>
  );

  return (
    <Stack gap={6}>
      {requiredSlots.length > 0 && (
        <div className="space-y-[var(--spacing-2)]">
          <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
            Required Slots ({requiredSlots.length})
          </h3>
          {renderSlotGrid(requiredSlots)}
        </div>
      )}

      {optionalSlots.length > 0 && (
        <div className="space-y-[var(--spacing-2)]">
          <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
            Optional Slots ({optionalSlots.length})
          </h3>
          {renderSlotGrid(optionalSlots)}
        </div>
      )}
    </Stack>
  );
}

/**
 * Card component for a single workflow media slot (PRD-146).
 *
 * Renders slot label, media type badge, current assignment preview,
 * passthrough toggle with track selector, and a drop zone for uploads.
 */

import { Badge, Button, Select, Toggle } from "@/components/primitives";
import { File, Image, Trash2, Video } from "@/tokens/icons";
import { cn } from "@/lib/cn";

import { variantThumbnailUrl } from "@/features/images/utils";

import type { AvatarMediaAssignment, WorkflowMediaSlot } from "../hooks/use-media-assignments";
import { SeedDataDropSlot } from "../components/SeedDataDropSlot";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const MEDIA_TYPE_ICON: Record<string, React.ReactNode> = {
  image: <Image size={14} />,
  video: <Video size={14} />,
  audio: <File size={14} />,
  other: <File size={14} />,
};

const MEDIA_TYPE_BADGE_VARIANT: Record<string, "info" | "success" | "warning" | "default"> = {
  image: "info",
  video: "success",
  audio: "warning",
  other: "default",
};

const MEDIA_TYPE_ACCEPT: Record<string, string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  other: "*/*",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export interface MediaSlotCardProps {
  slot: WorkflowMediaSlot;
  assignment: AvatarMediaAssignment | undefined;
  onUpload: (slotId: number, file: File) => void;
  onRemove: (assignmentId: number) => void;
  onTogglePassthrough: (slot: WorkflowMediaSlot, assignment: AvatarMediaAssignment | undefined, checked: boolean) => void;
  onTrackSelect: (assignmentId: number, trackId: number | null) => void;
  trackOptions: { value: string; label: string }[];
  uploading: boolean;
}

export function MediaSlotCard({
  slot,
  assignment,
  onUpload,
  onRemove,
  onTogglePassthrough,
  onTrackSelect,
  trackOptions,
  uploading,
}: MediaSlotCardProps) {
  const hasAssignment = assignment != null;
  const isPassthrough = assignment?.is_passthrough ?? false;
  const isMissing = slot.is_required && !hasAssignment;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border bg-[#0d1117] p-[var(--spacing-3)] space-y-[var(--spacing-2)]",
        isMissing
          ? "border-red-500/60"
          : "border-[var(--color-border-default)]",
      )}
    >
      {/* Header: label + badges */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        <span className="text-[var(--color-text-muted)]">
          {MEDIA_TYPE_ICON[slot.media_type] ?? MEDIA_TYPE_ICON.other}
        </span>
        <span className="text-xs font-mono font-medium text-[var(--color-text-primary)] truncate">
          {slot.slot_label}
        </span>
        <Badge size="sm" variant={MEDIA_TYPE_BADGE_VARIANT[slot.media_type] ?? "default"}>
          {slot.media_type}
        </Badge>
        {slot.is_required && (
          <span className="text-[10px] font-mono text-red-400">required</span>
        )}
        {isPassthrough && (
          <span className="text-[10px] font-mono text-cyan-400">passthrough</span>
        )}
      </div>

      {/* Description */}
      {slot.description && (
        <p className="text-[10px] font-mono text-[var(--color-text-muted)] leading-tight">
          {slot.description}
        </p>
      )}

      {/* Current assignment preview */}
      {hasAssignment && !isPassthrough && (
        <div className="flex items-center gap-[var(--spacing-2)]">
          {assignment.image_variant_id != null ? (
            <img
              src={variantThumbnailUrl(assignment.image_variant_id, 128)}
              alt={slot.slot_label}
              className="h-12 w-12 rounded-[var(--radius-md)] object-cover border border-[var(--color-border-default)]"
            />
          ) : assignment.file_path ? (
            <div className="flex items-center gap-1 text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-surface-secondary)] rounded-[var(--radius-md)] px-2 py-1">
              <File size={12} />
              <span className="truncate max-w-[160px]">{assignment.file_path.split("/").pop()}</span>
            </div>
          ) : null}
          <Button
            size="xs"
            variant="danger"
            icon={<Trash2 size={12} />}
            onClick={() => onRemove(assignment.id)}
          >
            Remove
          </Button>
        </div>
      )}

      {/* Passthrough toggle + track selector */}
      <div className="flex items-center gap-[var(--spacing-3)]">
        <Toggle
          size="xs"
          label="Passthrough"
          checked={isPassthrough}
          onChange={(checked) => onTogglePassthrough(slot, assignment, checked)}
        />
        {isPassthrough && (
          <Select
            size="sm"
            placeholder="Select track..."
            options={trackOptions}
            value={assignment?.passthrough_track_id != null ? String(assignment.passthrough_track_id) : ""}
            onChange={(val) => {
              if (assignment) {
                onTrackSelect(assignment.id, val ? Number(val) : null);
              }
            }}
          />
        )}
      </div>

      {/* Drop zone — only when not assigned and not passthrough */}
      {!hasAssignment && !isPassthrough && (
        <SeedDataDropSlot
          accept={MEDIA_TYPE_ACCEPT[slot.media_type] ?? "*/*"}
          label={`Drop ${slot.media_type} or click to upload`}
          loading={uploading}
          onFile={(file) => onUpload(slot.id, file)}
          compact
        />
      )}

      {/* Missing required indicator */}
      {isMissing && (
        <p className="text-[10px] font-mono text-red-400">
          This required slot has no assignment.
        </p>
      )}
    </div>
  );
}

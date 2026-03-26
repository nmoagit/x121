/**
 * Slot card components for the Avatar Seeds tab (PRD-146, PRD-154).
 *
 * - SeedSlotCard: scene generation slot (green/red border)
 * - ImageSlotCard: image generation slot (violet border, PRD-154)
 */

import { AlertTriangle, ArrowRight } from "@/tokens/icons";
import { TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";

import type { SeedSlotWithAssignment } from "../hooks/use-media-assignments";
import { MediaVariantPicker } from "../components/MediaVariantPicker";

/* --------------------------------------------------------------------------
   Shared card props
   -------------------------------------------------------------------------- */

export interface SlotCardProps {
  entry: SeedSlotWithAssignment;
  avatarId: number;
  onSelectVariant: (entry: SeedSlotWithAssignment, variantId: number) => void;
  onClearVariant: (assignmentId: number) => void;
  assigning: boolean;
}

/* --------------------------------------------------------------------------
   Scene seed slot card
   -------------------------------------------------------------------------- */

export function SeedSlotCard({
  entry,
  avatarId,
  onSelectVariant,
  onClearVariant,
  assigning: _assigning,
}: SlotCardProps) {
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

      {/* Variant picker */}
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

/* --------------------------------------------------------------------------
   Image slot card (PRD-154)
   -------------------------------------------------------------------------- */

export function ImageSlotCard({
  entry,
  avatarId,
  onSelectVariant,
  onClearVariant,
  assigning: _assigning,
}: SlotCardProps) {
  const hasAssignment = entry.assignment != null;
  const noWorkflow = entry.workflow_name == null;
  const noSlot = entry.media_slot_id == null;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border bg-[#0d1117] p-3 space-y-2",
        hasAssignment
          ? "border-violet-500/40"
          : "border-violet-500/20",
      )}
    >
      {/* Header: image type name */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-xs min-w-0">
          <span className="font-medium text-violet-300 truncate">
            {entry.scene_type_name}
          </span>
        </div>
        {hasAssignment ? (
          <span className="text-[10px] font-mono text-violet-400 shrink-0">assigned</span>
        ) : (
          <span className="text-[10px] font-mono text-violet-300/60 shrink-0">pending</span>
        )}
      </div>

      {/* Track flow: source → output */}
      <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-text-muted)]">
        <span className={TRACK_TEXT_COLORS[entry.track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]"}>
          {entry.track_name}
        </span>
        {entry.output_track_name && (
          <>
            <ArrowRight size={10} className="text-[var(--color-text-muted)] shrink-0" />
            <span className={TRACK_TEXT_COLORS[entry.output_track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]"}>
              {entry.output_track_name}
            </span>
          </>
        )}
      </div>

      {/* Workflow context */}
      {entry.workflow_name && (
        <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
          workflow: {entry.workflow_name}
        </p>
      )}

      {/* Warnings */}
      {noWorkflow && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-orange-400">
          <AlertTriangle size={10} className="shrink-0" />
          <span>No workflow assigned</span>
        </div>
      )}
      {noSlot && !noWorkflow && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-orange-400">
          <AlertTriangle size={10} className="shrink-0" />
          <span>Source seed missing</span>
        </div>
      )}

      {/* Variant picker */}
      {entry.media_slot_id ? (
        <MediaVariantPicker
          avatarId={avatarId}
          trackName={entry.track_name}
          selectedVariantId={entry.assignment?.media_variant_id ?? null}
          onSelect={(variantId) => onSelectVariant(entry, variantId)}
          onClear={entry.assignment ? () => onClearVariant(entry.assignment!.id) : undefined}
        />
      ) : noWorkflow ? null : (
        <p className="text-[10px] font-mono text-orange-400">
          No media slot — cannot configure seed.
        </p>
      )}
    </div>
  );
}

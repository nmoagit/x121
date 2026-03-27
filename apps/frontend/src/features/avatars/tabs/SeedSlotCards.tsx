/**
 * Slot card components for the Avatar Seeds tab (PRD-146, PRD-154).
 *
 * - SeedSlotCard: scene generation slot (green/red border)
 * - ImageSlotCard: image generation slot (violet border, PRD-154)
 *
 * Clicking the card image opens an inline variant picker for assignment.
 */

import { useState } from "react";
import { AlertTriangle, ArrowRight } from "@/tokens/icons";
import { TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";
import { variantThumbnailUrl } from "@/features/media/utils";
import type { MediaVariant } from "@/features/media/types";

import { ContextLoader } from "@/components/primitives";
import { useMediaVariants } from "@/features/media/hooks/use-media-variants";

import type { SeedSlotWithAssignment } from "../hooks/use-media-assignments";

/* --------------------------------------------------------------------------
   Shared card props
   -------------------------------------------------------------------------- */

export interface SlotCardProps {
  entry: SeedSlotWithAssignment;
  avatarId: number;
  onSelectVariant: (entry: SeedSlotWithAssignment, variantId: number) => void;
  onClearVariant: (assignmentId: number) => void;
  assigning: boolean;
  /** For image/scene slots: the source track's hero variant (to show a thumbnail). */
  sourceVariant?: MediaVariant | null;
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
  sourceVariant,
}: SlotCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasAssignment = entry.assignment != null;
  const noWorkflow = !entry.workflow_name;
  const assignedVariantId = entry.assignment?.media_variant_id;
  const canAssign = entry.media_slot_id != null;

  return (
    <div
      className={cn(
        "relative rounded-[var(--radius-lg)] border bg-[#0d1117] overflow-hidden",
        hasAssignment
          ? "border-green-500/40"
          : "border-[var(--color-border-default)]",
      )}
    >
      {/* Thumbnail — clickable to open picker */}
      <div
        role="button"
        tabIndex={0}
        className={cn("relative aspect-square bg-[#161b22]", canAssign && "cursor-pointer")}
        onClick={() => canAssign && setPickerOpen((p) => !p)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && canAssign) setPickerOpen((p) => !p); }}
      >
        {assignedVariantId ? (
          <img
            src={variantThumbnailUrl(assignedVariantId, 512)}
            alt={`${entry.scene_type_name} seed`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : sourceVariant ? (
          <img
            src={variantThumbnailUrl(sourceVariant.id, 512)}
            alt={`${entry.track_name} seed`}
            className="absolute inset-0 w-full h-full object-cover opacity-40"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[var(--color-text-muted)] text-[10px] font-mono">no seed</span>
          </div>
        )}

        {/* Track badge — bottom-left */}
        <div className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px]">
          <span className={TRACK_TEXT_COLORS[entry.track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]"}>
            {entry.track_name}
          </span>
        </div>

        {/* Warning icons — bottom-right */}
        {(noWorkflow || !hasAssignment) && (
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
            {!hasAssignment && !noWorkflow && (
              <span
                className="flex items-center justify-center size-5 rounded-full bg-orange-500/80"
                title="Seed image not assigned"
              >
                <AlertTriangle size={11} className="text-white" />
              </span>
            )}
            {noWorkflow && (
              <span
                className="flex items-center justify-center size-5 rounded-full bg-red-500/80"
                title="No workflow assigned"
              >
                <AlertTriangle size={11} className="text-white" />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content below image */}
      <div className="p-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-medium text-[var(--color-text-primary)] truncate">
            {entry.scene_type_name}
          </span>
          {hasAssignment ? (
            <span className="text-[10px] font-mono text-green-400 shrink-0">assigned</span>
          ) : (
            <span className="text-[10px] font-mono text-red-400 shrink-0">missing</span>
          )}
        </div>
      </div>

      {/* Picker overlay — covers the card when open */}
      {pickerOpen && canAssign && (
        <PickerOverlay
          avatarId={avatarId}
          entry={entry}
          onSelectVariant={(variantId) => {
            onSelectVariant(entry, variantId);
            setPickerOpen(false);
          }}
          onClear={entry.assignment ? () => {
            onClearVariant(entry.assignment!.id);
            setPickerOpen(false);
          } : undefined}
          onClose={() => setPickerOpen(false)}
        />
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
  sourceVariant,
}: SlotCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasAssignment = entry.assignment != null;
  const noWorkflow = entry.workflow_name == null;
  const canAssign = entry.media_slot_id != null;

  return (
    <div
      className={cn(
        "relative rounded-[var(--radius-lg)] border bg-[#0d1117] overflow-hidden",
        hasAssignment
          ? "border-violet-500/40"
          : "border-violet-500/20",
      )}
    >
      {/* Source image thumbnail — clickable to open picker */}
      <div
        role="button"
        tabIndex={0}
        className={cn("relative aspect-square bg-[#161b22]", canAssign && "cursor-pointer")}
        onClick={() => canAssign && setPickerOpen((p) => !p)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && canAssign) setPickerOpen((p) => !p); }}
      >
        {sourceVariant ? (
          <img
            src={variantThumbnailUrl(sourceVariant.id, 512)}
            alt={`${entry.track_name} seed`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[var(--color-text-muted)] text-[10px] font-mono">no source image</span>
          </div>
        )}

        {/* Track flow badge — bottom-left overlay */}
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px]">
          <span className={TRACK_TEXT_COLORS[entry.track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]"}>
            {entry.track_name}
          </span>
          {entry.output_track_name && (
            <>
              <ArrowRight size={8} className="text-white/50 shrink-0" />
              <span className={TRACK_TEXT_COLORS[entry.output_track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]"}>
                {entry.output_track_name}
              </span>
            </>
          )}
        </div>

        {/* Warning icons — bottom-right overlay */}
        {(noWorkflow || (!sourceVariant && !noWorkflow)) && (
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
            {!sourceVariant && !noWorkflow && (
              <span
                className="flex items-center justify-center size-5 rounded-full bg-orange-500/80"
                title="Source seed image missing"
              >
                <AlertTriangle size={11} className="text-white" />
              </span>
            )}
            {noWorkflow && (
              <span
                className="flex items-center justify-center size-5 rounded-full bg-red-500/80"
                title="No workflow assigned"
              >
                <AlertTriangle size={11} className="text-white" />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content below image */}
      <div className="p-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-medium text-violet-300 truncate">
            {entry.scene_type_name}
          </span>
          {hasAssignment ? (
            <span className="text-[10px] font-mono text-violet-400 shrink-0">assigned</span>
          ) : (
            <span className="text-[10px] font-mono text-violet-300/60 shrink-0">pending</span>
          )}
        </div>
      </div>

      {/* Picker overlay — covers the card when open */}
      {pickerOpen && canAssign && (
        <PickerOverlay
          avatarId={avatarId}
          entry={entry}
          onSelectVariant={(variantId) => {
            onSelectVariant(entry, variantId);
            setPickerOpen(false);
          }}
          onClear={entry.assignment ? () => {
            onClearVariant(entry.assignment!.id);
            setPickerOpen(false);
          } : undefined}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Shared picker overlay
   -------------------------------------------------------------------------- */

function PickerOverlay({
  avatarId,
  entry,
  onSelectVariant,
  onClear,
  onClose,
}: {
  avatarId: number;
  entry: SeedSlotWithAssignment;
  onSelectVariant: (variantId: number) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const { data: trackVariants, isLoading: trackLoading } = useMediaVariants(avatarId, entry.track_name);
  const { data: allVariants, isLoading: allLoading } = useMediaVariants(avatarId);
  const isLoading = trackLoading || allLoading;

  const trackFiltered = (trackVariants ?? []).filter((v) => !v.deleted_at);
  const allFiltered = (allVariants ?? []).filter((v) => !v.deleted_at);
  const available = (trackFiltered.length > 0 ? trackFiltered : allFiltered)
    .sort((a, b) => (a.is_hero !== b.is_hero ? (a.is_hero ? -1 : 1) : b.id - a.id));

  const selectedId = entry.assignment?.media_variant_id ?? null;

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0d1117]/95 backdrop-blur-sm rounded-[inherit] cursor-pointer"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="button"
      tabIndex={0}
    >
      {isLoading ? (
        <ContextLoader size={24} />
      ) : available.length === 0 ? (
        <span className="text-[10px] font-mono text-[var(--color-text-muted)]">no variants</span>
      ) : (
        <div
          className="flex flex-col items-center justify-center gap-2 p-2 max-h-full overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          role="presentation"
        >
          {available.map((v) => {
            const isSelected = v.id === selectedId;
            return (
              <button
                type="button"
                key={v.id}
                onClick={() => {
                  if (isSelected && onClear) onClear();
                  else onSelectVariant(v.id);
                }}
                title={`${v.variant_label}${v.is_hero ? " (hero)" : ""}`}
                className={cn(
                  "relative shrink-0 rounded-[var(--radius-md)] overflow-hidden transition-all duration-150 cursor-pointer",
                  "w-[80%] aspect-square border-2",
                  isSelected
                    ? "border-green-500 ring-1 ring-green-500/40"
                    : "border-transparent hover:border-[var(--color-border-primary)]",
                )}
              >
                <img
                  src={variantThumbnailUrl(v.id, 256)}
                  alt={v.variant_label}
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        className="absolute bottom-0 inset-x-0 py-1.5 text-[10px] font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-black/60 transition-colors"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        close
      </button>
    </div>
  );
}

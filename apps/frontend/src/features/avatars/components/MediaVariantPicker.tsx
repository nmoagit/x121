/**
 * Compact thumbnail picker for selecting an existing media variant
 * to assign as a seed for a specific track slot (PRD-147).
 *
 * Shows approved variants filtered by variant_type matching the track name.
 * Hero variants appear first, followed by most recent.
 */

import { cn } from "@/lib/cn";
import { ContextLoader, Tooltip } from "@/components/primitives";
import { X } from "@/tokens/icons";
import { variantThumbnailUrl } from "@/features/media/utils";
import { useMediaVariants } from "@/features/media/hooks/use-media-variants";
import type { MediaVariant } from "@/features/media/types";

import { SeedDataDropSlot } from "./SeedDataDropSlot";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface MediaVariantPickerProps {
  avatarId: number;
  /** Filters variants by variant_type matching this track name. */
  trackName: string;
  /** Currently selected variant, if any. */
  selectedVariantId: number | null;
  /** Called when user clicks a variant thumbnail to select it. */
  onSelect: (variantId: number) => void;
  /** Called when user clears the current selection. */
  onClear?: () => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Sort variants: hero first, then most recent (highest id). */
function sortVariants(variants: MediaVariant[]): MediaVariant[] {
  return [...variants].sort((a, b) => {
    if (a.is_hero !== b.is_hero) return a.is_hero ? -1 : 1;
    return b.id - a.id;
  });
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

const THUMB_SIZE = 96;

export function MediaVariantPicker({
  avatarId,
  trackName,
  selectedVariantId,
  onSelect,
  onClear,
}: MediaVariantPickerProps) {
  // Try track-filtered first, fall back to all variants
  const { data: trackVariants, isLoading: trackLoading } = useMediaVariants(avatarId, trackName);
  const { data: allVariants, isLoading: allLoading } = useMediaVariants(avatarId);

  const isLoading = trackLoading || allLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-2">
        <ContextLoader size={20} />
      </div>
    );
  }

  // Use track-filtered variants if any match, otherwise fall back to all
  const trackFiltered = (trackVariants ?? []).filter((v) => !v.deleted_at);
  const allFiltered = (allVariants ?? []).filter((v) => !v.deleted_at);
  const available = sortVariants(trackFiltered.length > 0 ? trackFiltered : allFiltered);

  if (available.length === 0) {
    return (
      <SeedDataDropSlot
        accept="image/*"
        label="No variants available"
        loading={false}
        onFile={() => {}}
        compact
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1">
      {available.map((v, idx) => {
        const isSelected = v.id === selectedVariantId;
        const isSuggested = idx === 0 && selectedVariantId == null;

        return (
          <Tooltip key={v.id} content={`${v.variant_label}${v.is_hero ? " (hero)" : ""}`}>
            <button
              type="button"
              onClick={() => {
                if (isSelected && onClear) {
                  onClear();
                } else {
                  onSelect(v.id);
                }
              }}
              className={cn(
                "relative shrink-0 rounded-[var(--radius-md)] overflow-hidden",
                "transition-all duration-150 cursor-pointer",
                "h-10 w-10 border-2",
                isSelected
                  ? "border-green-500 ring-1 ring-green-500/40"
                  : isSuggested
                    ? "border-blue-500/50 ring-1 ring-blue-500/20"
                    : "border-transparent hover:border-[var(--color-border-primary)]",
              )}
            >
              <img
                src={variantThumbnailUrl(v.id, THUMB_SIZE)}
                alt={v.variant_label}
                className="h-full w-full object-cover"
              />

              {/* Hero indicator */}
              {v.is_hero && (
                <span className="absolute top-0 right-0 h-2 w-2 rounded-bl bg-yellow-400" />
              )}

              {/* Selected clear overlay */}
              {isSelected && onClear && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                  <X size={14} className="text-white" />
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * CSS grid of face-crop images for the contact sheet (PRD-103).
 *
 * Displays face crops with confidence badges, scene labels, and
 * optional selection checkboxes for bulk operations.
 */

import { Badge, Checkbox } from "@/components/primitives";
import { formatPercent } from "@/lib/format";

import type { ContactSheetImage, GridColumns } from "./types";
import { confidenceBadgeVariant } from "./types";

/* --------------------------------------------------------------------------
   Grid column class map
   -------------------------------------------------------------------------- */

const GRID_COL_CLASSES: Record<GridColumns, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface FaceCropGridProps {
  images: ContactSheetImage[];
  columns?: GridColumns;
  selectedIds?: Set<number>;
  onSelectionChange?: (selectedIds: Set<number>) => void;
  sceneLabels?: Record<number, string>;
}

export function FaceCropGrid({
  images,
  columns = 4,
  selectedIds = new Set(),
  onSelectionChange,
  sceneLabels = {},
}: FaceCropGridProps) {
  if (images.length === 0) {
    return (
      <div
        data-testid="face-crop-grid-empty"
        className="flex flex-col items-center justify-center py-12 text-[var(--color-text-muted)]"
      >
        <p className="text-sm">No face crops available.</p>
        <p className="text-xs mt-1">Generate a contact sheet to extract face crops from scenes.</p>
      </div>
    );
  }

  function handleToggle(imageId: number, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(imageId);
    } else {
      next.delete(imageId);
    }
    onSelectionChange?.(next);
  }

  return (
    <div
      data-testid="face-crop-grid"
      className={`grid ${GRID_COL_CLASSES[columns]} gap-3`}
    >
      {images.map((image) => (
        <div
          key={image.id}
          data-testid="face-crop-cell"
          className="group relative rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] overflow-hidden"
        >
          {/* Selection checkbox */}
          {onSelectionChange && (
            <div className="absolute top-2 left-2 z-10">
              <Checkbox
                checked={selectedIds.has(image.id)}
                onChange={(checked) => handleToggle(image.id, checked)}
              />
            </div>
          )}

          {/* Face crop image */}
          <div className="aspect-square bg-[var(--color-surface-tertiary)]">
            <img
              src={image.face_crop_path}
              alt={`Face crop from scene ${sceneLabels[image.scene_id] ?? image.scene_id}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>

          {/* Metadata footer */}
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <span className="text-xs text-[var(--color-text-secondary)] truncate">
              {sceneLabels[image.scene_id] ?? `Scene ${image.scene_id}`}
            </span>

            {image.confidence_score !== null && (
              <Badge
                variant={confidenceBadgeVariant(image.confidence_score)}
                size="sm"
              >
                {formatPercent(image.confidence_score, 0)}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

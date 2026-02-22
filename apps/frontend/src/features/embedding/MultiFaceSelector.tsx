/**
 * Multi-face selector overlay for choosing the primary face (PRD-76).
 *
 * Renders detected faces with bounding box overlays on a character's image.
 * Users click a face to select it as the primary identity.
 */

import { cn } from "@/lib/cn";
import type { DetectedFace } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface MultiFaceSelectorProps {
  /** Detected faces to display. */
  faces: DetectedFace[];
  /** Natural width of the source image in pixels. */
  imageWidth: number;
  /** Natural height of the source image in pixels. */
  imageHeight: number;
  /** URL of the source image to overlay bounding boxes on. */
  imageUrl?: string;
  /** Called when a face is selected. */
  onSelectFace: (faceId: number) => void;
  /** Currently selected face ID (if any). */
  selectedFaceId?: number | null;
}

export function MultiFaceSelector({
  faces,
  imageWidth,
  imageHeight,
  imageUrl,
  onSelectFace,
  selectedFaceId,
}: MultiFaceSelectorProps) {
  if (faces.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-tertiary)]">
        No faces detected.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Image with bounding box overlays */}
      <div
        className="relative inline-block overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-primary)]"
        style={{ maxWidth: imageWidth, aspectRatio: `${imageWidth}/${imageHeight}` }}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Character source"
            className="block w-full h-auto"
          />
        )}

        {/* Bounding box overlays */}
        {faces.map((face) => {
          const isSelected = face.id === selectedFaceId;
          const left = (face.bounding_box.x / imageWidth) * 100;
          const top = (face.bounding_box.y / imageHeight) * 100;
          const width = (face.bounding_box.width / imageWidth) * 100;
          const height = (face.bounding_box.height / imageHeight) * 100;

          return (
            <button
              key={face.id}
              type="button"
              aria-label={`Select face ${face.id} (${(face.confidence * 100).toFixed(0)}% confidence)`}
              className={cn(
                "absolute border-2 cursor-pointer transition-colors",
                isSelected
                  ? "border-[var(--color-action-primary)] bg-[var(--color-action-primary)]/10"
                  : "border-[var(--color-action-warning)] bg-transparent hover:bg-[var(--color-action-warning)]/10",
              )}
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                height: `${height}%`,
              }}
              onClick={() => onSelectFace(face.id)}
            />
          );
        })}
      </div>

      {/* Face list with confidence */}
      <ul className="flex flex-col gap-2">
        {faces.map((face) => {
          const isSelected = face.id === selectedFaceId;
          return (
            <li key={face.id}>
              <button
                type="button"
                aria-label={`Select face ${face.id}`}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors",
                  isSelected
                    ? "bg-[var(--color-action-primary)]/10 text-[var(--color-text-primary)]"
                    : "bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]",
                )}
                onClick={() => onSelectFace(face.id)}
              >
                <span>
                  Face {face.id}
                  {face.is_primary && (
                    <span className="ml-2 text-xs text-[var(--color-action-success)]">
                      (Primary)
                    </span>
                  )}
                </span>
                <span className="text-xs opacity-75">
                  {(face.confidence * 100).toFixed(1)}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

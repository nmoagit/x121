/**
 * Clickable thumbnail/card sub-components used by FileAssignmentModal.
 *
 * ImageThumbnail renders a square image preview; JsonFileCard renders
 * a compact file-name card. Both support selected, locked, and
 * assigned-elsewhere visual states.
 */

import { cn } from "@/lib/cn";
import { Check, FileText } from "@/tokens/icons";

/* ------------------------------------------------------------------ */
/*  Shared props                                                       */
/* ------------------------------------------------------------------ */

export interface FileThumbnailProps {
  fk: string;
  file: File;
  previewUrl?: string;
  isSelected: boolean;
  isLocked: boolean;
  isAssignedElsewhere: boolean;
  onToggle: (fk: string) => void;
}

/* ------------------------------------------------------------------ */
/*  ImageThumbnail                                                     */
/* ------------------------------------------------------------------ */

export function ImageThumbnail({
  fk,
  previewUrl,
  isSelected,
  isLocked,
  isAssignedElsewhere,
  onToggle,
}: FileThumbnailProps) {
  const interactive = !isLocked && !isAssignedElsewhere;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={() => interactive && onToggle(fk)}
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-[var(--radius-md)] border-2 transition-all",
        isLocked && "border-[var(--color-action-success)] cursor-default",
        isSelected && !isLocked && "border-[var(--color-action-primary)] ring-1 ring-[var(--color-action-primary)]",
        isAssignedElsewhere && "opacity-30 cursor-not-allowed",
        !isSelected && !isLocked && !isAssignedElsewhere &&
          "border-[var(--color-border-default)] hover:border-[var(--color-border-focus)] cursor-pointer",
      )}
    >
      {previewUrl && <img src={previewUrl} alt="" className="h-full w-full object-cover" />}
      {(isSelected || isLocked) && (
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            isLocked ? "bg-[var(--color-action-success)]/20" : "bg-[var(--color-action-primary)]/20",
          )}
        >
          <Check size={20} className="text-white drop-shadow" />
        </div>
      )}
      {isAssignedElsewhere && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="text-[10px] font-semibold uppercase text-white">Assigned</span>
        </div>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  JsonFileCard                                                       */
/* ------------------------------------------------------------------ */

export function JsonFileCard({
  fk,
  file,
  isSelected,
  isLocked,
  isAssignedElsewhere,
  onToggle,
}: FileThumbnailProps) {
  const interactive = !isLocked && !isAssignedElsewhere;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={() => interactive && onToggle(fk)}
      className={cn(
        "relative flex w-full items-center gap-1.5 rounded-[var(--radius-md)] border-2 px-2 py-1.5 text-left transition-all",
        isLocked && "border-[var(--color-action-success)] bg-[var(--color-action-success)]/10 cursor-default",
        isSelected && !isLocked &&
          "border-[var(--color-action-primary)] bg-[var(--color-action-primary)]/10 ring-1 ring-[var(--color-action-primary)]",
        isAssignedElsewhere && "opacity-30 cursor-not-allowed",
        !isSelected && !isLocked && !isAssignedElsewhere &&
          "border-[var(--color-border-default)] bg-[var(--color-surface-tertiary)] hover:border-[var(--color-border-focus)] cursor-pointer",
      )}
    >
      <FileText size={14} className="shrink-0 text-[var(--color-text-muted)]" />
      <span className="truncate text-xs text-[var(--color-text-primary)]">{file.name}</span>
      {(isSelected || isLocked) && (
        <Check size={14} className="ml-auto shrink-0 text-[var(--color-action-success)]" />
      )}
      {isAssignedElsewhere && (
        <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
          Assigned
        </span>
      )}
    </button>
  );
}

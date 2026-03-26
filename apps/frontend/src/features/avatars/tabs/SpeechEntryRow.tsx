/**
 * Single speech entry row with inline edit, status badge, drag handle, and action buttons (PRD-136).
 * Uses @dnd-kit/sortable for drag-and-drop reordering.
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/primitives";
import { ICON_ACTION_BTN, ICON_ACTION_BTN_DANGER, TEXTAREA_BASE } from "@/lib/ui-classes";
import { Check, Edit3, GripVertical, Trash2, XCircle } from "@/tokens/icons";

import { SpeechStatusBadge, isApprovable, isRejectable } from "../components/SpeechStatusBadge";
import type { AvatarSpeech } from "../types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SpeechEntryRowProps {
  speech: AvatarSpeech;
  typeName: string;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onReject: () => void;
  saving: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SpeechEntryRow({
  speech,
  typeName,
  isEditing,
  editText,
  onEditTextChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onApprove,
  onReject,
  saving,
}: SpeechEntryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: speech.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    position: "relative" as const,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="px-[var(--spacing-3)] py-[var(--spacing-2)]">
      <div className="flex items-start gap-[var(--spacing-2)]">
        {/* Drag handle */}
        {!isEditing && (
          <button
            type="button"
            className="mt-0.5 cursor-grab touch-none text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <GripVertical size={14} />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[var(--spacing-2)]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              {typeName}_{speech.version}
            </span>
            <SpeechStatusBadge statusId={speech.status_id} />
          </div>
          {isEditing ? (
            <div className="mt-1 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => onEditTextChange(e.target.value)}
                rows={4}
                className={TEXTAREA_BASE}
              />
              <div className="flex gap-[var(--spacing-1)]">
                <Button size="sm" onClick={onSaveEdit} loading={saving}>
                  Save
                </Button>
                <Button size="sm" variant="secondary" onClick={onCancelEdit}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
              {speech.text}
            </p>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-[var(--spacing-1)] shrink-0">
            {/* Approval buttons */}
            {isApprovable(speech.status_id) && (
              <button
                type="button"
                onClick={onApprove}
                className={ICON_ACTION_BTN}
                aria-label="Approve"
                title="Approve"
              >
                <Check size={14} />
              </button>
            )}
            {isRejectable(speech.status_id) && (
              <button
                type="button"
                onClick={onReject}
                className={ICON_ACTION_BTN_DANGER}
                aria-label="Reject"
                title="Reject"
              >
                <XCircle size={14} />
              </button>
            )}

            {/* Edit & delete */}
            <button
              type="button"
              onClick={onStartEdit}
              className={ICON_ACTION_BTN}
              aria-label="Edit speech"
            >
              <Edit3 size={14} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className={ICON_ACTION_BTN_DANGER}
              aria-label="Delete speech"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

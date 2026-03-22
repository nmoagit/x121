/**
 * Single speech entry row with inline edit, status badge, and action buttons (PRD-136).
 */

import { Button } from "@/components/primitives";
import { ICON_ACTION_BTN, ICON_ACTION_BTN_DANGER, TEXTAREA_BASE } from "@/lib/ui-classes";
import { ArrowDown, ArrowUp, Check, Edit3, Trash2, XCircle } from "@/tokens/icons";

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
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
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
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  saving,
}: SpeechEntryRowProps) {
  return (
    <div className="px-[var(--spacing-3)] py-[var(--spacing-2)]">
      <div className="flex items-start gap-[var(--spacing-2)]">
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
            {/* Reorder buttons */}
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              className={ICON_ACTION_BTN}
              aria-label="Move up"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              className={ICON_ACTION_BTN}
              aria-label="Move down"
            >
              <ArrowDown size={14} />
            </button>

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

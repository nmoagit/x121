/**
 * Warning dialog for non-undoable actions (PRD-51).
 *
 * Shown before executing an action that cannot be reversed,
 * giving the user a chance to confirm or cancel.
 */

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";

interface NonUndoableWarningProps {
  /** The type of action that cannot be undone. */
  actionType: string;
  /** Human-readable label for the action. */
  actionLabel?: string;
  /** Called when the user confirms proceeding with the action. */
  onConfirm: () => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

export function NonUndoableWarning({
  actionType,
  actionLabel,
  onConfirm,
  onCancel,
}: NonUndoableWarningProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-[var(--color-border-warning)] bg-[var(--color-bg-surface)] p-4"
      role="alertdialog"
      aria-label="Non-undoable action warning"
    >
      <div className="flex items-center gap-2">
        <Badge variant="warning" size="sm">
          Warning
        </Badge>
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          This action cannot be undone
        </span>
      </div>

      <p className="text-sm text-[var(--color-text-secondary)]">
        {actionLabel
          ? `"${actionLabel}" is a non-undoable action.`
          : "This action is non-undoable."}{" "}
        Once executed, it cannot be reversed through the undo system.
      </p>

      <div className="text-xs text-[var(--color-text-muted)]">
        Action type: <code className="font-mono">{actionType}</code>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="primary" onClick={onConfirm}>
          Confirm
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

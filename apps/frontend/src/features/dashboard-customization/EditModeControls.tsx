/**
 * EditModeControls -- toolbar for dashboard edit mode (PRD-89).
 *
 * Provides toggle for edit mode, "Add Widget" (opens catalogue),
 * "Save", and "Cancel" actions.
 */

import { Button } from "@/components/primitives";
import { Edit3, Plus, Save, X } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface EditModeControlsProps {
  isEditing: boolean;
  onToggleEdit: () => void;
  onAddWidget: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function EditModeControls({
  isEditing,
  onToggleEdit,
  onAddWidget,
  onSave,
  onCancel,
  isSaving = false,
}: EditModeControlsProps) {
  if (!isEditing) {
    return (
      <div data-testid="edit-mode-controls">
        <Button
          variant="secondary"
          size="sm"
          icon={<Edit3 size={16} aria-hidden="true" />}
          onClick={onToggleEdit}
        >
          Edit Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="edit-mode-controls" className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        icon={<Plus size={16} aria-hidden="true" />}
        onClick={onAddWidget}
      >
        Add Widget
      </Button>

      <Button
        variant="primary"
        size="sm"
        icon={<Save size={16} aria-hidden="true" />}
        onClick={onSave}
        loading={isSaving}
        disabled={isSaving}
      >
        Save
      </Button>

      <Button
        variant="ghost"
        size="sm"
        icon={<X size={16} aria-hidden="true" />}
        onClick={onCancel}
        disabled={isSaving}
      >
        Cancel
      </Button>
    </div>
  );
}

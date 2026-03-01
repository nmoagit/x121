/**
 * Reusable character edit modal with name input, group select,
 * and a "Delete character" link.
 *
 * Extracted from ProjectCharactersTab and CharacterDetailPage which
 * had identical edit modal implementations.
 */

import { useEffect, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input, Select } from "@/components/primitives";

import { useGroupSelectOptions } from "../hooks/use-group-select-options";
import type { Character, UpdateCharacter } from "../types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface CharacterEditModalProps {
  /** The character to edit, or `null` when closed. */
  character: Character | null;
  /** Project ID for group options. */
  projectId: number;
  /** Close the modal without saving. */
  onClose: () => void;
  /** Submit an update with only the changed fields. */
  onSave: (characterId: number, data: UpdateCharacter) => void;
  /** Whether the update mutation is in-flight. */
  saving?: boolean;
  /** Called when the user clicks the "Delete character" link. */
  onDeleteRequest: (character: Character) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterEditModal({
  character,
  projectId,
  onClose,
  onSave,
  saving,
  onDeleteRequest,
}: CharacterEditModalProps) {
  const { options: groupOptions } = useGroupSelectOptions(projectId);

  const [editName, setEditName] = useState("");
  const [editGroupId, setEditGroupId] = useState("");

  // Sync local state when the character changes (modal opens)
  useEffect(() => {
    if (character) {
      setEditName(character.name);
      setEditGroupId(character.group_id ? String(character.group_id) : "");
    }
  }, [character]);

  function handleUpdate() {
    if (!character || !editName.trim()) return;

    const data: UpdateCharacter = {};
    if (editName.trim() !== character.name) {
      data.name = editName.trim();
    }
    const newGroupId = editGroupId ? Number(editGroupId) : null;
    if (newGroupId !== character.group_id) {
      data.group_id = newGroupId;
    }

    if (Object.keys(data).length === 0) {
      onClose();
      return;
    }

    onSave(character.id, data);
  }

  return (
    <Modal open={character !== null} onClose={onClose} title="Edit Character" size="sm">
      <Stack gap={4}>
        <Input
          label="Character Name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />
        <Select
          label="Group"
          options={groupOptions}
          value={editGroupId}
          onChange={setEditGroupId}
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-xs text-[var(--color-action-danger)] hover:text-[var(--color-action-danger-hover)] hover:underline cursor-pointer"
            onClick={() => character && onDeleteRequest(character)}
          >
            Delete character
          </button>
          <div className="flex gap-[var(--spacing-2)]">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} loading={saving} disabled={!editName.trim()}>
              Save Changes
            </Button>
          </div>
        </div>
      </Stack>
    </Modal>
  );
}

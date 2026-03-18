/**
 * Reusable character edit modal with name input, status select, group select
 * (with inline "create new group"), and a "Delete character" link.
 *
 * Extracted from ProjectCharactersTab and CharacterDetailPage which
 * had identical edit modal implementations.
 *
 * VoiceID approval gate (PRD-013 A.4): the "Active" status option is
 * disabled when `elevenlabs_voice` is not configured in character settings.
 */

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input, Select } from "@/components/primitives";
import { AlertTriangle, Plus } from "@/tokens/icons";

import { hasVoiceId } from "@/features/characters/types";

import { useCreateGroup } from "../hooks/use-character-groups";
import { useGroupSelectOptions } from "../hooks/use-group-select-options";
import { CHARACTER_STATUS_ID_ACTIVE } from "../types";
import type { Character, UpdateCharacter } from "../types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Sentinel value for the "Create new group" dropdown option. */
const NEW_GROUP_VALUE = "__new__";

/** Status options for the character status select. */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "Draft" },
  { value: "2", label: "Active" },
  { value: "3", label: "Archived" },
];

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
  const createGroup = useCreateGroup(projectId);

  // Append "Create new group" option
  const extendedGroupOptions = useMemo(
    () => [...groupOptions, { value: NEW_GROUP_VALUE, label: "+ New group" }],
    [groupOptions],
  );

  const [editName, setEditName] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editStatusId, setEditStatusId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Derive whether the character has a VoiceID configured in settings.
  const voiceConfigured = useMemo(
    () => hasVoiceId(character?.settings as Record<string, unknown> | null),
    [character?.settings],
  );

  // Build status options, disabling "Active" when VoiceID is missing.
  const statusOptions = useMemo(
    () =>
      STATUS_OPTIONS.map((opt) => ({
        ...opt,
        disabled:
          opt.value === String(CHARACTER_STATUS_ID_ACTIVE) && !voiceConfigured,
      })),
    [voiceConfigured],
  );

  // Sync local state when the character changes (modal opens)
  useEffect(() => {
    if (character) {
      setEditName(character.name);
      setEditGroupId(character.group_id ? String(character.group_id) : "");
      setEditStatusId(character.status_id ? String(character.status_id) : "1");
      setNewGroupName("");
      setCreatingGroup(false);
    }
  }, [character]);

  function handleGroupChange(value: string) {
    if (value === NEW_GROUP_VALUE) {
      setCreatingGroup(true);
      setNewGroupName("");
    } else {
      setCreatingGroup(false);
      setEditGroupId(value);
    }
  }

  async function handleCreateAndSelectGroup() {
    if (!newGroupName.trim()) return;
    try {
      const created = await createGroup.mutateAsync({ name: newGroupName.trim() });
      setEditGroupId(String(created.id));
      setCreatingGroup(false);
      setNewGroupName("");
    } catch {
      // Group creation failed — stay in creation mode
    }
  }

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
    const newStatusId = editStatusId ? Number(editStatusId) : null;
    if (newStatusId !== character.status_id) {
      data.status_id = newStatusId ?? undefined;
    }

    if (Object.keys(data).length === 0) {
      onClose();
      return;
    }

    onSave(character.id, data);
  }

  return (
    <Modal open={character !== null} onClose={onClose} title="Edit Model" size="md">
      <Stack gap={4}>
        <Input
          label="Model Name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />
        <div>
          <Select
            label="Status"
            options={statusOptions}
            value={editStatusId}
            onChange={setEditStatusId}
          />
          {!voiceConfigured && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-[var(--color-status-warning)] shrink-0" />
              <span className="text-xs text-[var(--color-text-muted)]">
                VoiceID must be configured in Settings before activating
              </span>
            </div>
          )}
        </div>

        {/* Group select with inline "create new" */}
        {creatingGroup ? (
          <div className="space-y-[var(--spacing-2)]">
            <Input
              label="New Group Name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateAndSelectGroup(); }}
              autoFocus
            />
            <div className="flex gap-[var(--spacing-2)]">
              <Button
                size="sm"
                variant="primary"
                onClick={handleCreateAndSelectGroup}
                loading={createGroup.isPending}
                disabled={!newGroupName.trim()}
                icon={<Plus size={14} />}
              >
                Create
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setCreatingGroup(false);
                  setEditGroupId(character?.group_id ? String(character.group_id) : "");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Select
            label="Group"
            options={extendedGroupOptions}
            value={editGroupId}
            onChange={handleGroupChange}
          />
        )}

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--color-action-danger)] hover:text-[var(--color-action-danger-hover)]"
            onClick={() => character && onDeleteRequest(character)}
          >
            Delete model
          </Button>
          <div className="flex gap-[var(--spacing-2)]">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} loading={saving} disabled={!editName.trim() || creatingGroup}>
              Save Changes
            </Button>
          </div>
        </div>
      </Stack>
    </Modal>
  );
}

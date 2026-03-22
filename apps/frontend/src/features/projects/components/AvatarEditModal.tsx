/**
 * Reusable avatar edit modal with name input, status select, group select
 * (with inline "create new group"), and a "Delete avatar" link.
 *
 * Extracted from ProjectAvatarsTab and AvatarDetailPage which
 * had identical edit modal implementations.
 *
 * VoiceID approval gate (PRD-013 A.4): the "Active" status option is
 * disabled when `elevenlabs_voice` is not configured in avatar settings.
 */

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input, Select } from "@/components/primitives";
import { AlertTriangle, Plus } from "@/tokens/icons";

import { hasVoiceId } from "@/features/avatars/types";

import { useCreateGroup } from "../hooks/use-avatar-groups";
import { useGroupSelectOptions } from "../hooks/use-group-select-options";
import { CHARACTER_STATUS_ID_ACTIVE } from "../types";
import type { Avatar, UpdateAvatar } from "../types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Sentinel value for the "Create new group" dropdown option. */
const NEW_GROUP_VALUE = "__new__";

/** Status options for the avatar status select. */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "Draft" },
  { value: "2", label: "Active" },
  { value: "3", label: "Archived" },
];

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface AvatarEditModalProps {
  /** The avatar to edit, or `null` when closed. */
  avatar: Avatar | null;
  /** Project ID for group options. */
  projectId: number;
  /** Close the modal without saving. */
  onClose: () => void;
  /** Submit an update with only the changed fields. */
  onSave: (avatarId: number, data: UpdateAvatar) => void;
  /** Whether the update mutation is in-flight. */
  saving?: boolean;
  /** Called when the user clicks the "Delete avatar" link. */
  onDeleteRequest: (avatar: Avatar) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AvatarEditModal({
  avatar,
  projectId,
  onClose,
  onSave,
  saving,
  onDeleteRequest,
}: AvatarEditModalProps) {
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

  // Derive whether the avatar has a VoiceID configured in settings.
  const voiceConfigured = useMemo(
    () => hasVoiceId(avatar?.settings as Record<string, unknown> | null),
    [avatar?.settings],
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

  // Sync local state when the avatar changes (modal opens)
  useEffect(() => {
    if (avatar) {
      setEditName(avatar.name);
      setEditGroupId(avatar.group_id ? String(avatar.group_id) : "");
      setEditStatusId(avatar.status_id ? String(avatar.status_id) : "1");
      setNewGroupName("");
      setCreatingGroup(false);
    }
  }, [avatar]);

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
    if (!avatar || !editName.trim()) return;

    const data: UpdateAvatar = {};
    if (editName.trim() !== avatar.name) {
      data.name = editName.trim();
    }
    const newGroupId = editGroupId ? Number(editGroupId) : null;
    if (newGroupId !== avatar.group_id) {
      data.group_id = newGroupId;
    }
    const newStatusId = editStatusId ? Number(editStatusId) : null;
    if (newStatusId !== avatar.status_id) {
      data.status_id = newStatusId ?? undefined;
    }

    if (Object.keys(data).length === 0) {
      onClose();
      return;
    }

    onSave(avatar.id, data);
  }

  return (
    <Modal open={avatar !== null} onClose={onClose} title="Edit Model" size="md">
      <Stack gap={4}>
        <Input
          label="Avatar Name"
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
              <AlertTriangle size={14} className="text-orange-400 shrink-0" />
              <span className="text-xs font-mono text-orange-400">
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
                  setEditGroupId(avatar?.group_id ? String(avatar.group_id) : "");
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

        <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border-default)]">
          <Button
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300"
            onClick={() => avatar && onDeleteRequest(avatar)}
          >
            Delete model
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleUpdate} loading={saving} disabled={!editName.trim() || creatingGroup}>
              Save Changes
            </Button>
          </div>
        </div>
      </Stack>
    </Modal>
  );
}

/**
 * Groups management tab for project detail page.
 *
 * Provides CRUD for character groups with expandable sections showing
 * each group's characters, plus an "Ungrouped" section.
 */

import { useMemo, useState } from "react";

import { Modal } from "@/components/composite";
import { EmptyState, FileDropZone } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, Input, LoadingPane } from "@/components/primitives";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Folder,
  Plus,
  Trash2,
  User,
} from "@/tokens/icons";

import {
  useCharacterGroups,
  useCreateGroup,
  useDeleteGroup,
  useUpdateGroup,
} from "../hooks/use-character-groups";
import { ImportConfirmModal } from "../components/ImportConfirmModal";
import { useCharacterImport } from "../hooks/use-character-import";
import { useProjectCharacters } from "../hooks/use-project-characters";
import type { Character, CharacterGroup } from "../types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ProjectGroupsTabProps {
  projectId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ProjectGroupsTab({ projectId }: ProjectGroupsTabProps) {
  const { data: groups, isLoading: groupsLoading } =
    useCharacterGroups(projectId);
  const { data: characters, isLoading: charsLoading } =
    useProjectCharacters(projectId);

  const createGroup = useCreateGroup(projectId);
  const updateGroup = useUpdateGroup(projectId);
  const deleteGroup = useDeleteGroup(projectId);
  const charImport = useCharacterImport(projectId);

  /* --- search --- */
  const [searchQuery, setSearchQuery] = useState("");

  /* --- create/edit modal --- */
  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CharacterGroup | null>(null);
  const [groupName, setGroupName] = useState("");

  /* --- delete confirmation --- */
  const [deleteTarget, setDeleteTarget] = useState<CharacterGroup | null>(null);

  /* --- expanded groups --- */
  const [expandedIds, setExpandedIds] = useState<Set<number | "ungrouped">>(
    new Set(),
  );

  /* --- group -> characters mapping --- */
  const charactersByGroup = useMemo(() => {
    const map = new Map<number | "ungrouped", Character[]>();
    if (!characters) return map;

    for (const c of characters) {
      const key = c.group_id ?? "ungrouped";
      const arr = map.get(key);
      if (arr) {
        arr.push(c);
      } else {
        map.set(key, [c]);
      }
    }
    return map;
  }, [characters]);

  /* --- filtered groups --- */
  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (!searchQuery) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, searchQuery]);

  const ungroupedChars = charactersByGroup.get("ungrouped") ?? [];

  /* --- handlers --- */
  function openCreate() {
    setEditingGroup(null);
    setGroupName("");
    setFormOpen(true);
  }

  function openEdit(group: CharacterGroup) {
    setEditingGroup(group);
    setGroupName(group.name);
    setFormOpen(true);
  }

  function handleSave() {
    const name = groupName.trim();
    if (!name) return;

    if (editingGroup) {
      updateGroup.mutate(
        { groupId: editingGroup.id, data: { name } },
        { onSuccess: () => setFormOpen(false) },
      );
    } else {
      createGroup.mutate(
        { name },
        { onSuccess: () => setFormOpen(false) },
      );
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteGroup.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  function toggleExpanded(id: number | "ungrouped") {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const isLoading = groupsLoading || charsLoading;

  if (isLoading) {
    return <LoadingPane />;
  }

  return (
    <FileDropZone onNamesDropped={charImport.handleImportDrop}>
    <Stack gap={4}>
      {/* Top bar */}
      <div className="flex flex-wrap items-end gap-[var(--spacing-3)]">
        <div className="flex-1 min-w-[200px] max-w-[280px]">
          <Input
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>
          Create Group
        </Button>
      </div>

      {/* Group sections */}
      {filteredGroups.length === 0 && ungroupedChars.length === 0 ? (
        <EmptyState
          icon={<Folder size={32} />}
          title="No groups"
          description="Create a group to organize characters."
          action={
            <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>
              Create Group
            </Button>
          }
        />
      ) : (
        <Stack gap={2}>
          {filteredGroups.map((group) => {
            const chars = charactersByGroup.get(group.id) ?? [];
            const expanded = expandedIds.has(group.id);

            return (
              <GroupSection
                key={group.id}
                group={group}
                characters={chars}
                expanded={expanded}
                onToggle={() => toggleExpanded(group.id)}
                onEdit={() => openEdit(group)}
                onDelete={() => setDeleteTarget(group)}
              />
            );
          })}

          {/* Ungrouped section */}
          {ungroupedChars.length > 0 && (
            <GroupSection
              label="Ungrouped"
              characters={ungroupedChars}
              expanded={expandedIds.has("ungrouped")}
              onToggle={() => toggleExpanded("ungrouped")}
            />
          )}
        </Stack>
      )}

      {/* Create / Edit group modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingGroup ? "Edit Group" : "Create Group"}
        size="sm"
      >
        <Stack gap={4}>
          <Input
            label="Group Name"
            placeholder="e.g. Main Cast"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <Button
            onClick={handleSave}
            loading={createGroup.isPending || updateGroup.isPending}
            disabled={!groupName.trim()}
          >
            {editingGroup ? "Save Changes" : "Create Group"}
          </Button>
        </Stack>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Group"
        size="sm"
      >
        <Stack gap={4}>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Are you sure you want to delete{" "}
            <strong>{deleteTarget?.name}</strong>? Characters in this group will
            become ungrouped.
          </p>
          <div className="flex gap-[var(--spacing-2)] justify-end">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={deleteGroup.isPending}
            >
              Delete
            </Button>
          </div>
        </Stack>
      </Modal>

      {/* Import confirmation modal */}
      <ImportConfirmModal
        open={charImport.importOpen}
        onClose={charImport.closeImport}
        names={charImport.importNames}
        projectId={projectId}
        onConfirm={charImport.handleImportConfirm}
        loading={charImport.bulkCreatePending}
      />
    </Stack>
    </FileDropZone>
  );
}

/* --------------------------------------------------------------------------
   GroupSection — expandable group header with character list
   -------------------------------------------------------------------------- */

interface GroupSectionProps {
  group?: CharacterGroup;
  label?: string;
  characters: Character[];
  expanded: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function GroupSection({
  group,
  label,
  characters,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: GroupSectionProps) {
  const displayName = group?.name ?? label ?? "Unknown";
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-left hover:bg-[var(--color-surface-secondary)] transition-colors rounded-t-[var(--radius-md)]"
        onClick={onToggle}
      >
        <Chevron
          size={16}
          className="text-[var(--color-text-muted)] shrink-0"
          aria-hidden
        />
        <span className="font-medium text-[var(--color-text-primary)] flex-1">
          {displayName}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {characters.length} {characters.length === 1 ? "character" : "characters"}
        </span>
        {onEdit && (
          <button
            type="button"
            className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label={`Edit ${displayName}`}
          >
            <Edit3 size={14} aria-hidden />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-danger)] hover:bg-[var(--color-surface-tertiary)]"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Delete ${displayName}`}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        )}
      </button>

      {/* Expanded character list */}
      {expanded && (
        <div className="border-t border-[var(--color-border-default)] px-[var(--spacing-3)] py-[var(--spacing-2)]">
          {characters.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-[var(--spacing-2)]">
              No characters in this group.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-default)]">
              {characters.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-[var(--spacing-2)] py-[var(--spacing-2)]"
                >
                  <User
                    size={14}
                    className="text-[var(--color-text-muted)] shrink-0"
                    aria-hidden
                  />
                  <span className="text-sm text-[var(--color-text-primary)]">
                    {c.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

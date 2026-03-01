/**
 * Groups management tab for project detail page.
 *
 * Provides CRUD for character groups with expandable sections showing
 * each group's characters as draggable cards, plus an "Ungrouped" section.
 * Characters can be dragged between groups to reassign them.
 */

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import { ConfirmDeleteModal, Modal } from "@/components/composite";
import { EmptyState, FileDropZone } from "@/components/domain";
import { Grid, Stack } from "@/components/layout";
import { Button, Input, LoadingPane } from "@/components/primitives";
import { ChevronDown, ChevronRight, Edit3, Folder, Plus, Trash2, Upload } from "@/tokens/icons";

import { CharacterCard } from "../components/CharacterCard";
import { ImportConfirmModal } from "../components/ImportConfirmModal";
import {
  useCharacterGroups,
  useCreateGroup,
  useDeleteGroup,
  useMoveCharacterToGroup,
  useUpdateGroup,
} from "../hooks/use-character-groups";
import { useCharacterImport } from "../hooks/use-character-import";
import { useGroupMap } from "../hooks/use-group-map";
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
  const navigate = useNavigate();

  const { data: groups, isLoading: groupsLoading } = useCharacterGroups(projectId);
  const { data: characters, isLoading: charsLoading } = useProjectCharacters(projectId);

  const createGroup = useCreateGroup(projectId);
  const updateGroup = useUpdateGroup(projectId);
  const deleteGroup = useDeleteGroup(projectId);
  const moveCharacter = useMoveCharacterToGroup(projectId);
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
  const [expandedIds, setExpandedIds] = useState<Set<number | "ungrouped">>(new Set());

  /* --- drag state --- */
  const [dragOverGroupId, setDragOverGroupId] = useState<number | "ungrouped" | null>(null);

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

  /* --- group lookup map --- */
  const groupMap = useGroupMap(groups);

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
      createGroup.mutate({ name }, { onSuccess: () => setFormOpen(false) });
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

  /* --- drag and drop --- */
  const handleCharDragStart = useCallback((e: React.DragEvent, characterId: number) => {
    e.dataTransfer.setData("text/plain", String(characterId));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleGroupDragOver = useCallback((e: React.DragEvent, groupId: number | "ungrouped") => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroupId(groupId);
  }, []);

  const handleGroupDragLeave = useCallback(() => {
    setDragOverGroupId(null);
  }, []);

  const handleGroupDrop = useCallback(
    (e: React.DragEvent, targetGroupId: number | "ungrouped") => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverGroupId(null);

      const charIdStr = e.dataTransfer.getData("text/plain");
      const charId = Number(charIdStr);
      if (!charId) return;

      const newGroupId = targetGroupId === "ungrouped" ? null : targetGroupId;

      // Find the character to check if it's already in this group
      const char = characters?.find((c) => c.id === charId);
      if (!char || char.group_id === newGroupId) return;

      moveCharacter.mutate({ characterId: charId, groupId: newGroupId });
    },
    [characters, moveCharacter],
  );

  const isLoading = groupsLoading || charsLoading;

  if (isLoading) {
    return <LoadingPane />;
  }

  return (
    <FileDropZone
      onNamesDropped={charImport.handleImportDrop}
      browseFolderRef={charImport.browseFolderRef}
    >
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
          <Button
            size="sm"
            variant="secondary"
            icon={<Upload size={14} />}
            onClick={charImport.browseFolder}
          >
            Import Folder
          </Button>
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
                  groupId={group.id}
                  group={group}
                  characters={chars}
                  groupMap={groupMap}
                  expanded={expanded}
                  isDragOver={dragOverGroupId === group.id}
                  projectId={projectId}
                  onToggle={() => toggleExpanded(group.id)}
                  onEdit={() => openEdit(group)}
                  onDelete={() => setDeleteTarget(group)}
                  onCharClick={(char) =>
                    navigate({
                      to: `/projects/${projectId}/characters/${char.id}`,
                    })
                  }
                  onCharDragStart={handleCharDragStart}
                  onDragOver={(e) => handleGroupDragOver(e, group.id)}
                  onDragLeave={handleGroupDragLeave}
                  onDrop={(e) => handleGroupDrop(e, group.id)}
                />
              );
            })}

            {/* Ungrouped section */}
            {ungroupedChars.length > 0 && (
              <GroupSection
                groupId="ungrouped"
                label="Ungrouped"
                characters={ungroupedChars}
                groupMap={groupMap}
                expanded={expandedIds.has("ungrouped")}
                isDragOver={dragOverGroupId === "ungrouped"}
                projectId={projectId}
                onToggle={() => toggleExpanded("ungrouped")}
                onCharClick={(char) =>
                  navigate({
                    to: `/projects/${projectId}/characters/${char.id}`,
                  })
                }
                onCharDragStart={handleCharDragStart}
                onDragOver={(e) => handleGroupDragOver(e, "ungrouped")}
                onDragLeave={handleGroupDragLeave}
                onDrop={(e) => handleGroupDrop(e, "ungrouped")}
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
        <ConfirmDeleteModal
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          title="Delete Group"
          entityName={deleteTarget?.name ?? ""}
          warningText="Characters in this group will become ungrouped."
          onConfirm={handleDelete}
          loading={deleteGroup.isPending}
        />

        {/* Import confirmation modal */}
        <ImportConfirmModal
          open={charImport.importOpen}
          onClose={charImport.closeImport}
          names={charImport.importNames}
          projectId={projectId}
          existingNames={characters?.map((c) => c.name) ?? []}
          onConfirm={charImport.handleImportConfirm}
          loading={charImport.bulkCreatePending}
        />
      </Stack>
    </FileDropZone>
  );
}

/* --------------------------------------------------------------------------
   GroupSection — expandable group header with draggable character cards
   -------------------------------------------------------------------------- */

interface GroupSectionProps {
  groupId: number | "ungrouped";
  group?: CharacterGroup;
  label?: string;
  characters: Character[];
  groupMap: Map<number, CharacterGroup>;
  expanded: boolean;
  isDragOver: boolean;
  projectId: number;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCharClick: (char: Character) => void;
  onCharDragStart: (e: React.DragEvent, characterId: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

function GroupSection({
  group,
  label,
  characters,
  groupMap,
  expanded,
  isDragOver,
  onToggle,
  onEdit,
  onDelete,
  onCharClick,
  onCharDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: GroupSectionProps) {
  const displayName = group?.name ?? label ?? "Unknown";
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      className={`rounded-[var(--radius-md)] border bg-[var(--color-surface-primary)] transition-colors ${
        isDragOver
          ? "border-[var(--color-border-accent)] bg-[var(--color-surface-secondary)]"
          : "border-[var(--color-border-default)]"
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        className="flex w-full items-center gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-left hover:bg-[var(--color-surface-secondary)] transition-colors rounded-t-[var(--radius-md)] cursor-pointer"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <Chevron size={16} className="text-[var(--color-text-muted)] shrink-0" aria-hidden />
        <span className="font-medium text-[var(--color-text-primary)] flex-1">{displayName}</span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {characters.length} {characters.length === 1 ? "character" : "characters"}
        </span>
        {onEdit && (
          <button
            type="button"
            className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer"
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
            className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-danger)] hover:bg-[var(--color-surface-tertiary)] cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Delete ${displayName}`}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        )}
      </div>

      {/* Expanded character cards */}
      {expanded && (
        <div className="border-t border-[var(--color-border-default)] px-[var(--spacing-3)] py-[var(--spacing-3)]">
          {characters.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-[var(--spacing-2)]">
              No characters in this group.
            </p>
          ) : (
            <Grid cols={1} gap={3} className="sm:grid-cols-2 lg:grid-cols-3">
              {characters.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => onCharDragStart(e, c.id)}
                  className="cursor-grab active:cursor-grabbing"
                >
                  <CharacterCard
                    character={c}
                    group={c.group_id ? groupMap.get(c.group_id) : undefined}
                    onClick={() => onCharClick(c)}
                  />
                </div>
              ))}
            </Grid>
          )}
        </div>
      )}
    </div>
  );
}

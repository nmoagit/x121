/**
 * Merged characters + groups tab for the project detail page (PRD-112).
 *
 * Shows characters as avatar cards inside expandable, collapsible group
 * sections. Supports drag-and-drop between groups, multi-select, group
 * CRUD, character CRUD, folder import, and search/filter.
 */

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDeleteModal, Modal } from "@/components/composite";
import { EmptyState, FileDropZone } from "@/components/domain";
import { Grid, Stack } from "@/components/layout";
import { Button, Input, LoadingPane, Select } from "@/components/primitives";
import { GroupSceneOverrides } from "@/features/scene-catalog";
import { cn } from "@/lib/cn";
import { toSelectOptions } from "@/lib/select-utils";
import { ICON_ACTION_BTN, ICON_ACTION_BTN_DANGER } from "@/lib/ui-classes";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Folder,
  Plus,
  Trash2,
  Upload,
  User,
} from "@/tokens/icons";

import { CharacterCard } from "../components/CharacterCard";
import { CharacterEditModal } from "../components/CharacterEditModal";
import { ImportConfirmModal } from "../components/ImportConfirmModal";
import { useCharacterAvatars } from "../hooks/use-character-avatars";
import {
  useCharacterGroups,
  useCreateGroup,
  useDeleteGroup,
  useMoveCharacterToGroup,
  useUpdateGroup,
} from "../hooks/use-character-groups";
import { useCharacterImport } from "../hooks/use-character-import";
import { useGroupMap } from "../hooks/use-group-map";
import { useGroupSelectOptions } from "../hooks/use-group-select-options";
import {
  useCreateCharacter,
  useDeleteCharacter,
  useProjectCharacters,
  useUpdateCharacter,
} from "../hooks/use-project-characters";
import type { Character, CharacterGroup, UpdateCharacter } from "../types";

/* --------------------------------------------------------------------------
   Shared class strings
   -------------------------------------------------------------------------- */

/** Inline text-link style for small action buttons (e.g. "Clear", "+ Create new group"). */
const INLINE_LINK_BTN =
  "text-xs text-[var(--color-action-primary)] hover:text-[var(--color-action-primary-hover)] hover:underline cursor-pointer";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ProjectCharactersTabProps {
  projectId: number;
}

export function ProjectCharactersTab({ projectId }: ProjectCharactersTabProps) {
  const navigate = useNavigate();

  const { data: characters, isLoading: charsLoading } = useProjectCharacters(projectId);
  const { data: groups, isLoading: groupsLoading } = useCharacterGroups(projectId);
  const createCharacter = useCreateCharacter(projectId);
  const updateCharacter = useUpdateCharacter(projectId);
  const deleteCharacter = useDeleteCharacter(projectId);
  const createGroup = useCreateGroup(projectId);
  const updateGroup = useUpdateGroup(projectId);
  const deleteGroup = useDeleteGroup(projectId);
  const moveCharacter = useMoveCharacterToGroup(projectId);
  const charImport = useCharacterImport(projectId);

  const groupMap = useGroupMap(groups);
  const { options: modalGroupOptions } = useGroupSelectOptions(projectId);
  const characterIds = useMemo(() => (characters ?? []).map((c) => c.id), [characters]);
  const avatarMap = useCharacterAvatars(characterIds);

  /* --- search & filter --- */
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  /* --- create character modal --- */
  const [charModalOpen, setCharModalOpen] = useState(false);
  const [newCharName, setNewCharName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);

  /* --- create/edit group modal --- */
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CharacterGroup | null>(null);
  const [groupNameInput, setGroupNameInput] = useState("");

  /* --- edit/delete character modals --- */
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [charDeleteTarget, setCharDeleteTarget] = useState<Character | null>(null);

  /* --- delete group confirmation --- */
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<CharacterGroup | null>(null);

  /* --- expanded groups (session-persisted, defaults to all expanded) --- */
  const storageKey = `project-${projectId}-group-collapsed`;
  const [collapsedIds, setCollapsedIds] = useState<Set<number | "ungrouped">>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw) as (number | "ungrouped")[]);
    } catch { /* ignore */ }
    return new Set();
  });
  const collapsedRef = useRef(collapsedIds);
  collapsedRef.current = collapsedIds;

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify([...collapsedRef.current]));
  }, [collapsedIds, storageKey]);

  function toggleExpanded(id: number | "ungrouped") {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* --- drag state --- */
  const [dragOverGroupId, setDragOverGroupId] = useState<number | "ungrouped" | null>(null);

  /* --- multi-select --- */
  const [selectedCharIds, setSelectedCharIds] = useState<Set<number>>(new Set());

  const toggleCharSelection = useCallback((charId: number) => {
    setSelectedCharIds((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) next.delete(charId);
      else next.add(charId);
      return next;
    });
  }, []);

  /* --- group filter options --- */
  const groupOptions = useMemo(
    () => [
      { value: "", label: "All Groups" },
      ...toSelectOptions(groups),
      ...(groups?.length ? [{ value: "ungrouped", label: "Ungrouped" }] : []),
    ],
    [groups],
  );

  /* --- characters by group --- */
  const charactersByGroup = useMemo(() => {
    const map = new Map<number | "ungrouped", Character[]>();
    if (!characters) return map;

    let filtered = [...characters];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(q));
    }

    for (const c of filtered) {
      const key = c.group_id ?? "ungrouped";
      const arr = map.get(key);
      if (arr) arr.push(c);
      else map.set(key, [c]);
    }
    return map;
  }, [characters, searchQuery]);

  /* --- filtered groups for display --- */
  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (groupFilter === "ungrouped") return [];
    if (groupFilter) return groups.filter((g) => g.id === Number(groupFilter));
    return groups;
  }, [groups, groupFilter]);

  const showUngrouped = !groupFilter || groupFilter === "ungrouped";
  const ungroupedChars = charactersByGroup.get("ungrouped") ?? [];

  const totalFiltered = useMemo(() => {
    let count = 0;
    for (const chars of charactersByGroup.values()) count += chars.length;
    return count;
  }, [charactersByGroup]);

  /* --- drag and drop --- */
  const handleCharDragStart = useCallback(
    (e: React.DragEvent, characterId: number) => {
      const ids = selectedCharIds.has(characterId)
        ? [...selectedCharIds]
        : [characterId];
      e.dataTransfer.setData("text/plain", ids.join(","));
      e.dataTransfer.effectAllowed = "move";
    },
    [selectedCharIds],
  );

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

      const raw = e.dataTransfer.getData("text/plain");
      const charIds = raw.split(",").map(Number).filter((id) => id > 0);
      if (charIds.length === 0) return;

      const newGroupId = targetGroupId === "ungrouped" ? null : targetGroupId;
      for (const charId of charIds) {
        const char = characters?.find((c) => c.id === charId);
        if (!char || char.group_id === newGroupId) continue;
        moveCharacter.mutate({ characterId: charId, groupId: newGroupId });
      }
      setSelectedCharIds(new Set());
    },
    [characters, moveCharacter],
  );

  /* --- character CRUD handlers --- */
  function handleCreateCharacter() {
    if (!newCharName.trim()) return;
    const groupId = selectedGroupId ? Number(selectedGroupId) : undefined;
    createCharacter.mutate(
      { name: newCharName.trim(), group_id: groupId },
      {
        onSuccess: () => {
          setCharModalOpen(false);
          setNewCharName("");
          setSelectedGroupId("");
          setShowNewGroup(false);
          setNewGroupName("");
        },
      },
    );
  }

  function handleCreateNewGroupInline() {
    const name = newGroupName.trim();
    if (!name) return;
    createGroup.mutate(
      { name },
      {
        onSuccess: (created) => {
          setSelectedGroupId(String(created.id));
          setNewGroupName("");
          setShowNewGroup(false);
        },
      },
    );
  }

  function handleSaveCharEdit(characterId: number, data: UpdateCharacter) {
    updateCharacter.mutate({ characterId, data }, { onSuccess: () => setEditingChar(null) });
  }

  function handleDeleteCharacter() {
    if (!charDeleteTarget) return;
    deleteCharacter.mutate(charDeleteTarget.id, {
      onSuccess: () => {
        setCharDeleteTarget(null);
        setEditingChar(null);
      },
    });
  }

  /* --- group CRUD handlers --- */
  function openCreateGroup() {
    setEditingGroup(null);
    setGroupNameInput("");
    setGroupFormOpen(true);
  }

  function openEditGroup(group: CharacterGroup) {
    setEditingGroup(group);
    setGroupNameInput(group.name);
    setGroupFormOpen(true);
  }

  function handleSaveGroup() {
    const name = groupNameInput.trim();
    if (!name) return;
    if (editingGroup) {
      updateGroup.mutate(
        { groupId: editingGroup.id, data: { name } },
        { onSuccess: () => setGroupFormOpen(false) },
      );
    } else {
      createGroup.mutate({ name }, { onSuccess: () => setGroupFormOpen(false) });
    }
  }

  function handleDeleteGroup() {
    if (!groupDeleteTarget) return;
    deleteGroup.mutate(groupDeleteTarget.id, {
      onSuccess: () => setGroupDeleteTarget(null),
    });
  }

  const isLoading = charsLoading || groupsLoading;

  if (isLoading) {
    return <LoadingPane />;
  }

  return (
    <FileDropZone
      onNamesDropped={charImport.handleImportDrop}
      onFolderDropped={charImport.handleFolderDrop}
      browseFolderRef={charImport.browseFolderRef}
    >
      <Stack gap={4}>
        {/* Top bar */}
        <div className="flex flex-wrap items-end gap-[var(--spacing-3)]">
          <div className="flex-1 min-w-[200px] max-w-[280px]">
            <Input
              placeholder="Search characters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-[160px]">
            <Select options={groupOptions} value={groupFilter} onChange={setGroupFilter} />
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={<Upload size={14} />}
            onClick={charImport.browseFolder}
          >
            Import Folder
          </Button>
          <Button size="sm" variant="secondary" icon={<Folder size={14} />} onClick={openCreateGroup}>
            New Group
          </Button>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCharModalOpen(true)}>
            Add Character
          </Button>
          {selectedCharIds.size > 0 && (
            <span className="text-sm text-[var(--color-text-muted)] flex items-center gap-[var(--spacing-2)]">
              {selectedCharIds.size} selected
              <button
                type="button"
                className={INLINE_LINK_BTN}
                onClick={() => setSelectedCharIds(new Set())}
              >
                Clear
              </button>
            </span>
          )}
        </div>

        {/* Content */}
        {totalFiltered === 0 ? (
          <EmptyState
            icon={<User size={32} />}
            title="No characters"
            description={
              characters && characters.length > 0
                ? "No characters match your filter."
                : "Add a character to this project."
            }
            action={
              !characters?.length ? (
                <Button size="sm" icon={<Plus size={14} />} onClick={() => setCharModalOpen(true)}>
                  Add Character
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Stack gap={2}>
            {filteredGroups.map((group) => {
              const chars = charactersByGroup.get(group.id) ?? [];
              const expanded = !collapsedIds.has(group.id);

              return (
                <GroupSection
                  key={group.id}
                  group={group}
                  characters={chars}
                  avatarMap={avatarMap}
                  groupMap={groupMap}
                  expanded={expanded}
                  isDragOver={dragOverGroupId === group.id}
                  projectId={projectId}
                  onToggle={() => toggleExpanded(group.id)}
                  onEdit={() => openEditGroup(group)}
                  onDelete={() => setGroupDeleteTarget(group)}
                  selectedCharIds={selectedCharIds}
                  onCharSelect={toggleCharSelection}
                  onCharClick={(char) =>
                    navigate({ to: `/projects/${projectId}/characters/${char.id}` })
                  }
                  onCharEdit={setEditingChar}
                  onCharDragStart={handleCharDragStart}
                  onDragOver={(e) => handleGroupDragOver(e, group.id)}
                  onDragLeave={handleGroupDragLeave}
                  onDrop={(e) => handleGroupDrop(e, group.id)}
                />
              );
            })}

            {/* Ungrouped section */}
            {showUngrouped && ungroupedChars.length > 0 && (
              <GroupSection
                label="Ungrouped"
                characters={ungroupedChars}
                avatarMap={avatarMap}
                groupMap={groupMap}
                expanded={!collapsedIds.has("ungrouped")}
                isDragOver={dragOverGroupId === "ungrouped"}
                projectId={projectId}
                onToggle={() => toggleExpanded("ungrouped")}
                selectedCharIds={selectedCharIds}
                onCharSelect={toggleCharSelection}
                onCharClick={(char) =>
                  navigate({ to: `/projects/${projectId}/characters/${char.id}` })
                }
                onCharEdit={setEditingChar}
                onCharDragStart={handleCharDragStart}
                onDragOver={(e) => handleGroupDragOver(e, "ungrouped")}
                onDragLeave={handleGroupDragLeave}
                onDrop={(e) => handleGroupDrop(e, "ungrouped")}
              />
            )}
          </Stack>
        )}

        {/* Add character modal */}
        <Modal open={charModalOpen} onClose={() => setCharModalOpen(false)} title="Add Character" size="sm">
          <Stack gap={4}>
            <Input
              label="Character Name"
              placeholder="e.g. Aria"
              value={newCharName}
              onChange={(e) => setNewCharName(e.target.value)}
            />
            <div>
              <Select
                label="Group"
                options={modalGroupOptions}
                value={selectedGroupId}
                onChange={setSelectedGroupId}
              />
              {!showNewGroup ? (
                <button
                  type="button"
                  className={cn("mt-[var(--spacing-1)]", INLINE_LINK_BTN)}
                  onClick={() => setShowNewGroup(true)}
                >
                  + Create new group
                </button>
              ) : (
                <div className="mt-[var(--spacing-2)] flex items-end gap-[var(--spacing-2)]">
                  <div className="flex-1">
                    <Input
                      placeholder="New group name"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCreateNewGroupInline}
                    loading={createGroup.isPending}
                    disabled={!newGroupName.trim()}
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowNewGroup(false);
                      setNewGroupName("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            <Button
              onClick={handleCreateCharacter}
              loading={createCharacter.isPending}
              disabled={!newCharName.trim()}
            >
              Create Character
            </Button>
          </Stack>
        </Modal>

        {/* Create / Edit group modal */}
        <Modal
          open={groupFormOpen}
          onClose={() => setGroupFormOpen(false)}
          title={editingGroup ? `Edit Group — ${editingGroup.name}` : "Create Group"}
          size={editingGroup ? "lg" : "sm"}
        >
          <Stack gap={4}>
            <Input
              label="Group Name"
              placeholder="e.g. Main Cast"
              value={groupNameInput}
              onChange={(e) => setGroupNameInput(e.target.value)}
            />
            <Button
              onClick={handleSaveGroup}
              loading={createGroup.isPending || updateGroup.isPending}
              disabled={!groupNameInput.trim()}
            >
              {editingGroup ? "Save Changes" : "Create Group"}
            </Button>

            {editingGroup && (
              <>
                <hr className="border-[var(--color-border-default)]" />
                <GroupSceneOverrides projectId={projectId} groupId={editingGroup.id} />
              </>
            )}
          </Stack>
        </Modal>

        {/* Edit character modal */}
        <CharacterEditModal
          character={editingChar}
          projectId={projectId}
          onClose={() => setEditingChar(null)}
          onSave={handleSaveCharEdit}
          saving={updateCharacter.isPending}
          onDeleteRequest={(char) => setCharDeleteTarget(char)}
        />

        {/* Delete character confirmation */}
        <ConfirmDeleteModal
          open={charDeleteTarget !== null}
          onClose={() => setCharDeleteTarget(null)}
          title="Delete Character"
          entityName={charDeleteTarget?.name ?? ""}
          onConfirm={handleDeleteCharacter}
          loading={deleteCharacter.isPending}
        />

        {/* Delete group confirmation */}
        <ConfirmDeleteModal
          open={groupDeleteTarget !== null}
          onClose={() => setGroupDeleteTarget(null)}
          title="Delete Group"
          entityName={groupDeleteTarget?.name ?? ""}
          warningText="Characters in this group will become ungrouped."
          onConfirm={handleDeleteGroup}
          loading={deleteGroup.isPending}
        />

        {/* Import confirmation modal */}
        <ImportConfirmModal
          open={charImport.importOpen}
          onClose={charImport.closeImport}
          names={charImport.importNames}
          payloads={charImport.importPayloads.length > 0 ? charImport.importPayloads : undefined}
          projectId={projectId}
          existingNames={characters?.map((c) => c.name) ?? []}
          onConfirm={charImport.handleImportConfirm}
          onConfirmWithAssets={charImport.handleImportConfirmWithAssets}
          loading={charImport.bulkCreatePending}
        />
      </Stack>
    </FileDropZone>
  );
}

/* --------------------------------------------------------------------------
   GroupSection — expandable group with draggable avatar character cards
   -------------------------------------------------------------------------- */

interface GroupSectionProps {
  group?: CharacterGroup;
  label?: string;
  characters: Character[];
  avatarMap: Map<number, string>;
  groupMap: Map<number, CharacterGroup>;
  expanded: boolean;
  isDragOver: boolean;
  projectId: number;
  selectedCharIds: Set<number>;
  onCharSelect: (charId: number) => void;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCharClick: (char: Character) => void;
  onCharEdit: (char: Character) => void;
  onCharDragStart: (e: React.DragEvent, characterId: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

function GroupSection({
  group,
  label,
  characters,
  avatarMap,
  groupMap,
  expanded,
  isDragOver,
  selectedCharIds,
  onCharSelect,
  onToggle,
  onEdit,
  onDelete,
  onCharClick,
  onCharEdit,
  onCharDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: GroupSectionProps) {
  const displayName = group?.name ?? label ?? "Unknown";
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border bg-[var(--color-surface-primary)] transition-colors",
        isDragOver
          ? "border-[var(--color-border-accent)] bg-[var(--color-surface-secondary)]"
          : "border-[var(--color-border-default)]",
      )}
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
            className={ICON_ACTION_BTN}
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
            className={ICON_ACTION_BTN_DANGER}
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
              No characters in this group. Drag characters here to add them.
            </p>
          ) : (
            <Grid cols={2} gap={3} className="sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
                    avatarUrl={avatarMap.get(c.id)}
                    selected={selectedCharIds.has(c.id)}
                    onSelect={onCharSelect}
                    onClick={() => onCharClick(c)}
                    onEdit={() => onCharEdit(c)}
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

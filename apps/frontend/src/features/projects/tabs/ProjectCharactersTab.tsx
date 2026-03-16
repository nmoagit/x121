/**
 * Merged characters + groups tab for the project detail page (PRD-112).
 *
 * Shows characters as avatar cards inside expandable, collapsible group
 * sections. Supports drag-and-drop between groups, multi-select, group
 * CRUD, character CRUD, folder import, and search/filter.
 */

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSetToggle } from "@/hooks/useSetToggle";

import { CollapsibleSection, ConfirmDeleteModal, ConfigToolbar, Modal } from "@/components/composite";
import { EmptyState, FileDropZone } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, Input, LoadingPane, Select } from "@/components/primitives";
import { CharacterFilterBar, CharacterGroupSection, FileAssignmentModal } from "@/features/characters/components";
import type { GroupSectionDragHandlers } from "@/features/characters/components";
import { useExportGroupSettings, useConfigImport } from "@/features/config-io";
import { GroupPromptOverrides } from "@/features/prompt-management";
import { GroupSceneOverrides, GroupWorkflowOverrides } from "@/features/scene-catalogue";
import { cn } from "@/lib/cn";
import { toSelectOptions } from "@/lib/select-utils";
import { INLINE_LINK_BTN } from "@/lib/ui-classes";
import {
  Folder,
  Plus,
  Upload,
  User,
} from "@/tokens/icons";

import { variantThumbnailUrl } from "@/features/images/utils";

import { CharacterCard } from "../components/CharacterCard";
import { ImportProgressBar } from "../components/ImportProgressBar";
import { useCharacterDeliverables } from "../hooks/use-character-deliverables";
import { CharacterEditModal } from "../components/CharacterEditModal";
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
import { useGroupSelectOptions } from "../hooks/use-group-select-options";
import {
  useCreateCharacter,
  useDeleteCharacter,
  useProjectCharacters,
  useToggleCharacterEnabled,
  useUpdateCharacter,
} from "../hooks/use-project-characters";
import type { Character, CharacterGroup, SectionKey, SectionReadiness, UpdateCharacter } from "../types";
import { computeSectionReadiness } from "../types";

/** localStorage key for the show/hide disabled characters toggle. */
const SHOW_DISABLED_KEY = "x121.project.showDisabled";
/** localStorage key for audit view toggle. */
const AUDIT_VIEW_KEY = "x121.project.auditView";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ProjectCharactersTabProps {
  projectId: number;
  /** Project name for folder import project-name matching. */
  projectName?: string;
  /** When provided, auto-expand and scroll to the group section on mount. */
  scrollToGroupId?: string;
  /** Which deliverable sections are blocking for character completion. */
  blockingDeliverables?: string[];
}

export function ProjectCharactersTab({ projectId, projectName, scrollToGroupId, blockingDeliverables }: ProjectCharactersTabProps) {
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
  const toggleEnabled = useToggleCharacterEnabled(projectId);
  const groupExport = useExportGroupSettings();
  const groupImport = useConfigImport();

  const groupMap = useGroupMap(groups);
  const { options: modalGroupOptions } = useGroupSelectOptions(projectId);

  /** Build avatar URL map from hero_variant_id included in character response. */
  const avatarMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of characters ?? []) {
      if (c.hero_variant_id) {
        map.set(c.id, variantThumbnailUrl(c.hero_variant_id, 1024));
      }
    }
    return map;
  }, [characters]);

  /* --- search & filter --- */
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string[]>([]);

  const [showDisabled, setShowDisabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(SHOW_DISABLED_KEY);
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });
  const toggleShowDisabled = useCallback(() => {
    setShowDisabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(SHOW_DISABLED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  /* --- audit view (shows blocking reasons on character cards) --- */
  const [auditView, setAuditView] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUDIT_VIEW_KEY) === "true";
    } catch {
      return false;
    }
  });
  const toggleAuditView = useCallback(() => {
    setAuditView((prev) => {
      const next = !prev;
      try { localStorage.setItem(AUDIT_VIEW_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const { data: deliverables } = useCharacterDeliverables(projectId);
  const blockingMap = useMemo(() => {
    const map = new Map<number, string[]>();
    if (!deliverables) return map;
    for (const d of deliverables) {
      if (d.blocking_reasons.length > 0) {
        map.set(d.id, d.blocking_reasons);
      }
    }
    return map;
  }, [deliverables]);

  const sectionReadinessMap = useMemo(() => {
    const map = new Map<number, Record<SectionKey, SectionReadiness>>();
    if (!deliverables) return map;
    for (const d of deliverables) {
      map.set(d.id, computeSectionReadiness(d));
    }
    return map;
  }, [deliverables]);

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

  /* --- auto-scroll to group from URL param --- */
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!scrollToGroupId || scrolledRef.current) return;
    scrolledRef.current = true;

    // Determine the group key and section element id
    const groupKey: number | "ungrouped" =
      scrollToGroupId === "ungrouped" ? "ungrouped" : Number(scrollToGroupId);
    const sectionElId =
      scrollToGroupId === "ungrouped" ? "group-ungrouped" : `group-${scrollToGroupId}`;

    // Expand the group if it is collapsed
    setCollapsedIds((prev) => {
      if (prev.has(groupKey)) {
        const next = new Set(prev);
        next.delete(groupKey);
        return next;
      }
      return prev;
    });

    // Scroll after a short delay to allow expansion render
    requestAnimationFrame(() => {
      document
        .getElementById(sectionElId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [scrollToGroupId]);

  function toggleExpanded(id: number | "ungrouped") {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allGroupKeys = useMemo(() => {
    const keys: (number | "ungrouped")[] = (groups ?? []).map((g) => g.id);
    keys.push("ungrouped");
    return keys;
  }, [groups]);

  const allCollapsed = allGroupKeys.length > 0 && allGroupKeys.every((k) => collapsedIds.has(k));

  const toggleCollapseAll = useCallback(() => {
    setCollapsedIds(allCollapsed ? new Set() : new Set(allGroupKeys));
  }, [allCollapsed, allGroupKeys]);

  /* --- drag state --- */
  const [dragOverGroupId, setDragOverGroupId] = useState<number | "ungrouped" | null>(null);
  const dragCounterRef = useRef<Map<number | "ungrouped", number>>(new Map());

  /* --- multi-select --- */
  const [selectedCharIds, toggleCharSelection, setSelectedCharIds] = useSetToggle<number>();

  /* --- group filter options --- */
  const groupOptions = useMemo(
    () => [
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
    if (!showDisabled) {
      filtered = filtered.filter((c) => c.is_enabled);
    }
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
    // Sort characters alphabetically within each group
    for (const chars of map.values()) {
      chars.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [characters, searchQuery, showDisabled]);

  /* --- filtered groups for display --- */
  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (groupFilter.length === 0) return groups;
    // If only "ungrouped" is selected, show no named groups
    const groupIds = groupFilter.filter((f) => f !== "ungrouped").map(Number);
    if (groupIds.length === 0) return [];
    return groups.filter((g) => groupIds.includes(g.id));
  }, [groups, groupFilter]);

  const showUngrouped = groupFilter.length === 0 || groupFilter.includes("ungrouped");
  const ungroupedChars = charactersByGroup.get("ungrouped") ?? [];

  const totalFiltered = useMemo(() => {
    let count = 0;
    for (const chars of charactersByGroup.values()) count += chars.length;
    return count;
  }, [charactersByGroup]);

  /* --- quick-nav entries --- */
  const quickNavEntries = useMemo(() => {
    const entries: { id: number | "ungrouped"; name: string }[] = [];
    for (const g of filteredGroups) {
      entries.push({ id: g.id, name: g.name });
    }
    if (showUngrouped) {
      entries.push({ id: "ungrouped", name: "Ungrouped" });
    }
    return entries;
  }, [filteredGroups, showUngrouped]);

  const handleToggleEnabled = useCallback(
    (charId: number, enabled: boolean) => {
      toggleEnabled.mutate({ characterId: charId, isEnabled: enabled });
    },
    [toggleEnabled],
  );

  /* --- group select all --- */
  const handleSelectAll = useCallback(
    (charIds: number[]) => {
      if (charIds.length === 0) {
        // Deselect: clear all (could also be scoped, but clearing is simpler UX)
        setSelectedCharIds(new Set());
      } else {
        setSelectedCharIds((prev) => {
          const next = new Set(prev);
          for (const id of charIds) next.add(id);
          return next;
        });
      }
    },
    [],
  );

  /* --- drag and drop --- */
  const handleCharDragStart = useCallback(
    (e: React.DragEvent, characterId: number) => {
      const ids = selectedCharIds.has(characterId)
        ? [...selectedCharIds]
        : [characterId];
      e.dataTransfer.setData("text/plain", ids.join(","));
      // Sentinel so FileDropZone can distinguish internal drags from external file drops
      e.dataTransfer.setData("application/x-character-drag", "1");
      e.dataTransfer.effectAllowed = "move";
    },
    [selectedCharIds],
  );

  const handleGroupDragOver = useCallback((e: React.DragEvent) => {
    // Let file drops bubble to FileDropZone
    if (e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleGroupDragEnter = useCallback((e: React.DragEvent, groupId: number | "ungrouped") => {
    if (e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    const counter = (dragCounterRef.current.get(groupId) ?? 0) + 1;
    dragCounterRef.current.set(groupId, counter);
    if (counter === 1) {
      setDragOverGroupId(groupId);
    }
  }, []);

  const handleGroupDragLeave = useCallback((_e: React.DragEvent, groupId: number | "ungrouped") => {
    const counter = (dragCounterRef.current.get(groupId) ?? 1) - 1;
    dragCounterRef.current.set(groupId, counter);
    if (counter <= 0) {
      dragCounterRef.current.set(groupId, 0);
      setDragOverGroupId((prev) => (prev === groupId ? null : prev));
    }
  }, []);

  const handleGroupDrop = useCallback(
    (e: React.DragEvent, targetGroupId: number | "ungrouped") => {
      // Let file drops bubble to FileDropZone
      if (e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current.set(targetGroupId, 0);
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
        {/* Filter row */}
        <CharacterFilterBar
          searchQuery={searchQuery}
          onSearchChange={(e) => setSearchQuery(e.target.value)}
          groupOptions={groupOptions}
          groupFilter={groupFilter}
          onGroupFilterChange={setGroupFilter}
          allCollapsed={allCollapsed}
          onToggleCollapseAll={toggleCollapseAll}
          showDisabled={showDisabled}
          onToggleShowDisabled={toggleShowDisabled}
          auditView={auditView}
          onAuditViewChange={toggleAuditView}
          selectedCount={selectedCharIds.size}
          onClearSelection={() => setSelectedCharIds(new Set())}
        />

        {/* Action row */}
        <div className="flex flex-wrap items-center gap-[var(--spacing-3)]">
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
        </div>

        {/* Import progress */}
        {charImport.importProgress && charImport.importProgress.phase !== "done" && (
          <ImportProgressBar progress={charImport.importProgress} />
        )}

        {/* Group quick-nav */}
        {quickNavEntries.length >= 2 && (
          <div className="flex flex-wrap items-center gap-[var(--spacing-2)]">
            <span className="text-xs text-[var(--color-text-muted)]">Jump to:</span>
            {quickNavEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={INLINE_LINK_BTN}
                onClick={() =>
                  document
                    .getElementById(entry.id === "ungrouped" ? "group-ungrouped" : `group-${entry.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                {entry.name}
              </button>
            ))}
          </div>
        )}

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
              const dragHandlers: GroupSectionDragHandlers = {
                onDragEnter: (e) => handleGroupDragEnter(e, group.id),
                onDragOver: handleGroupDragOver,
                onDragLeave: (e) => handleGroupDragLeave(e, group.id),
                onDrop: (e) => handleGroupDrop(e, group.id),
              };

              return (
                <CharacterGroupSection
                  key={group.id}
                  sectionId={`group-${group.id}`}
                  label={group.name}
                  characters={chars}
                  expanded={expanded}
                  isDragOver={dragOverGroupId === group.id}
                  onToggle={() => toggleExpanded(group.id)}
                  onEdit={() => openEditGroup(group)}
                  onDelete={() => setGroupDeleteTarget(group)}
                  selectedCharIds={selectedCharIds}
                  onCharSelect={toggleCharSelection}
                  onSelectAll={handleSelectAll}
                  dragHandlers={dragHandlers}
                  renderCard={(c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => handleCharDragStart(e, c.id)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <CharacterCard
                        character={c}
                        group={c.group_id ? groupMap.get(c.group_id) : undefined}
                        avatarUrl={avatarMap.get(c.id)}
                        heroVariantId={c.hero_variant_id}
                        selected={selectedCharIds.has(c.id)}
                        blockingReasons={auditView ? blockingMap.get(c.id) : undefined}
                        sectionReadiness={sectionReadinessMap.get(c.id)}
                        blockingDeliverables={blockingDeliverables}
                        projectId={projectId}
                        onSelect={toggleCharSelection}
                        onClick={() => navigate({ to: `/projects/${projectId}/characters/${c.id}` })}
                        onEdit={() => setEditingChar(c)}
                        onToggleEnabled={handleToggleEnabled}
                      />
                    </div>
                  )}
                />
              );
            })}

            {/* Ungrouped section — always visible as a drop target */}
            {showUngrouped && (
              <CharacterGroupSection
                sectionId="group-ungrouped"
                label="Ungrouped"
                characters={ungroupedChars}
                expanded={!collapsedIds.has("ungrouped")}
                isDragOver={dragOverGroupId === "ungrouped"}
                onToggle={() => toggleExpanded("ungrouped")}
                selectedCharIds={selectedCharIds}
                onCharSelect={toggleCharSelection}
                onSelectAll={handleSelectAll}
                dragHandlers={{
                  onDragEnter: (e) => handleGroupDragEnter(e, "ungrouped"),
                  onDragOver: handleGroupDragOver,
                  onDragLeave: (e) => handleGroupDragLeave(e, "ungrouped"),
                  onDrop: (e) => handleGroupDrop(e, "ungrouped"),
                }}
                renderCard={(c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => handleCharDragStart(e, c.id)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <CharacterCard
                      character={c}
                      group={c.group_id ? groupMap.get(c.group_id) : undefined}
                      avatarUrl={avatarMap.get(c.id)}
                      heroVariantId={c.hero_variant_id}
                      selected={selectedCharIds.has(c.id)}
                      blockingReasons={auditView ? blockingMap.get(c.id) : undefined}
                      sectionReadiness={sectionReadinessMap.get(c.id)}
                      blockingDeliverables={blockingDeliverables}
                      projectId={projectId}
                      onSelect={toggleCharSelection}
                      onClick={() => navigate({ to: `/projects/${projectId}/characters/${c.id}` })}
                      onEdit={() => setEditingChar(c)}
                      onToggleEnabled={handleToggleEnabled}
                    />
                  </div>
                )}
              />
            )}
          </Stack>
        )}

        {/* Add character modal */}
        <Modal open={charModalOpen} onClose={() => setCharModalOpen(false)} title="Add Character" size="md">
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
          size={editingGroup ? "3xl" : "sm"}
        >
          <Stack gap={4}>
            <div className="max-w-xs">
              <Input
                label="Group Name"
                placeholder="e.g. Main Cast"
                value={groupNameInput}
                onChange={(e) => setGroupNameInput(e.target.value)}
              />
            </div>
            <Button
              className="w-fit"
              onClick={handleSaveGroup}
              loading={createGroup.isPending || updateGroup.isPending}
              disabled={!groupNameInput.trim()}
            >
              {editingGroup ? "Save Changes" : "Create Group"}
            </Button>

            {editingGroup && (
              <div className="mt-2">
                <hr className="border-[var(--color-border-default)] mb-4" />
                <div className="flex justify-end mb-3">
                  <ConfigToolbar
                    onExport={() => groupExport.exportConfig(projectId, editingGroup.id, editingGroup.name)}
                    onImport={(file) => groupImport.importFile(file)}
                    exporting={groupExport.exporting}
                    importing={groupImport.importing}
                  />
                </div>
                <Stack gap={4}>
                  <CollapsibleSection card title="Scene Settings" description="Override scene settings for this group.">
                    <GroupSceneOverrides projectId={projectId} groupId={editingGroup.id} />
                  </CollapsibleSection>
                  <CollapsibleSection card title="Workflow Assignments" description="Assign workflows per scene and track.">
                    <GroupWorkflowOverrides projectId={projectId} groupId={editingGroup.id} />
                  </CollapsibleSection>
                  <CollapsibleSection card title="Prompt Overrides" description="Override prompt templates for this group.">
                    <GroupPromptOverrides projectId={projectId} groupId={editingGroup.id} />
                  </CollapsibleSection>
                </Stack>
              </div>
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

        {/* File assignment modal (unmatched files) */}
        <FileAssignmentModal
          open={charImport.unmatchedFiles.length > 0}
          onClose={charImport.dismissUnmatchedFiles}
          unmatchedFiles={charImport.unmatchedFiles}
          onConfirm={(assignments) => charImport.resolveUnmatchedFiles(assignments)}
        />

        {/* Import confirmation modal */}
        <ImportConfirmModal
          open={charImport.importOpen}
          onClose={charImport.closeImport}
          names={charImport.importNames}
          payloads={charImport.importPayloads.length > 0 ? charImport.importPayloads : undefined}
          projectId={projectId}
          existingNames={characters?.map((c) => c.name) ?? []}
          characters={characters ?? []}
          onConfirm={charImport.handleImportConfirm}
          onConfirmWithAssets={charImport.handleImportConfirmWithAssets}
          loading={charImport.bulkCreatePending}
          importProgress={charImport.importProgress}
          onAbort={charImport.abortImport}
          detectedProjectName={charImport.importResult?.detectedProjectName}
          projectName={projectName}
          existingGroupNames={groups?.map((g) => g.name) ?? []}
          hashSummary={charImport.hashSummary}
        />
      </Stack>
    </FileDropZone>
  );
}


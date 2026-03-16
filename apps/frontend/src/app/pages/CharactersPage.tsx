/**
 * Characters content page — full browse/creator view (PRD-135).
 *
 * Admin users see all characters across projects with a project filter.
 * Non-admin users see only their project's characters.
 * Supports folder import with the base import hook (no videos).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQueries, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";


import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useSetToggle } from "@/hooks/useSetToggle";

import { ConfirmDeleteModal, Modal } from "@/components/composite";
import { EmptyState, FileDropZone } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, Input, LoadingPane, Select } from "@/components/primitives";
import { CharacterFilterBar, CharacterGroupSection, CharacterSeedDataModal, FileAssignmentModal } from "@/features/characters/components";
import { useCharacterImport } from "@/features/projects/hooks/use-character-import";
import { CharacterCard } from "@/features/projects/components/CharacterCard";
import type { SeedDataStatus } from "@/features/projects/components/CharacterCard";
import { useImageVariantsBrowse } from "@/features/images/hooks/use-image-variants";
import { SOURCE_KEY_BIO, SOURCE_KEY_TOV } from "@/features/characters/types";
import { ImportConfirmModal } from "@/features/projects/components/ImportConfirmModal";
import { ImportProgressBar } from "@/features/projects/components/ImportProgressBar";
import {
  useCreateGroup,
  useDeleteGroup,
  useUpdateGroup,
} from "@/features/projects/hooks/use-character-groups";
import { useGroupMap } from "@/features/projects/hooks/use-group-map";
import { useGroupSelectOptions } from "@/features/projects/hooks/use-group-select-options";
import {
  useDeleteCharacter,

  useToggleCharacterEnabled,
  useUpdateCharacter,
} from "@/features/projects/hooks/use-project-characters";
import { useCreateProject, useProjects } from "@/features/projects/hooks/use-projects";
import type { Character, CharacterGroup, FolderDropResult, UpdateCharacter } from "@/features/projects/types";
import { CharacterEditModal } from "@/features/projects/components/CharacterEditModal";
import { variantThumbnailUrl } from "@/features/images/utils";
import { cn } from "@/lib/cn";
import { toSelectOptions } from "@/lib/select-utils";
import { INLINE_LINK_BTN } from "@/lib/ui-classes";
import { useAuthStore } from "@/stores/auth-store";
import {
  Folder,
  FolderKanban,
  Plus,
  Upload,
  User,
} from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const SHOW_DISABLED_KEY = "x121.characters.showDisabled";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharactersPage() {
  useSetPageTitle("Characters");
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  // Project selection (admin: multi-project, non-admin: single project)
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<number>(0);

  // Auto-select first project for non-admin users
  useEffect(() => {
    if (!isAdmin && projects?.length && selectedProjectId === 0) {
      setSelectedProjectId(projects[0]!.id);
    }
  }, [isAdmin, projects, selectedProjectId]);

  // For admin: project filter (multi-select values as string[])
  const [projectFilter, setProjectFilter] = useState<string[]>([]);

  const projectOptions = useMemo(
    () => toSelectOptions(projects),
    [projects],
  );

  // Which project IDs to display
  const displayProjectIds = useMemo(() => {
    if (!isAdmin) return selectedProjectId > 0 ? [selectedProjectId] : [];
    if (projectFilter.length > 0) return projectFilter.map(Number);
    return (projects ?? []).map((p) => p.id);
  }, [isAdmin, selectedProjectId, projectFilter, projects]);

  // Primary project for mutations/import (first in list)
  const primaryProjectId = displayProjectIds[0] ?? 0;

  // Fetch characters and groups from all display projects
  // useQueries supports dynamic arrays — the number of queries can change
  const characterQueries = useQueries({
    queries: displayProjectIds.map((pid) => ({
      queryKey: ["projects", pid, "characters", "list"] as const,
      queryFn: () => api.get<Character[]>(`/projects/${pid}/characters`),
      enabled: pid > 0,
    })),
  });

  const groupQueries = useQueries({
    queries: displayProjectIds.map((pid) => ({
      queryKey: ["projects", pid, "groups"] as const,
      queryFn: () => api.get<CharacterGroup[]>(`/projects/${pid}/groups`),
      enabled: pid > 0,
    })),
  });

  const charsLoading = characterQueries.some((q) => q.isLoading);
  const groupsLoading = groupQueries.some((q) => q.isLoading);

  const allProjectCharacters = useMemo(() => {
    const chars: Character[] = [];
    for (const q of characterQueries) {
      if (q.data) chars.push(...q.data);
    }
    return chars;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const groups = useMemo(() => {
    const allGroups: CharacterGroup[] = [];
    for (const q of groupQueries) {
      if (q.data) allGroups.push(...q.data);
    }
    return allGroups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const charImport = useCharacterImport(primaryProjectId);

  const updateCharacter = useUpdateCharacter(primaryProjectId);
  const deleteCharacter = useDeleteCharacter(primaryProjectId);
  const createGroup = useCreateGroup(primaryProjectId);
  const updateGroup = useUpdateGroup(primaryProjectId);
  const deleteGroup = useDeleteGroup(primaryProjectId);
  const toggleEnabled = useToggleCharacterEnabled(primaryProjectId);
  const createProject = useCreateProject();

  /* --- create project modal (admin only) --- */
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  function handleCreateProject() {
    if (!newProjectName.trim()) return;
    createProject.mutate(
      { name: newProjectName.trim() },
      {
        onSuccess: (created) => {
          setProjectModalOpen(false);
          setNewProjectName("");
          setProjectFilter([String(created.id)]);
        },
      },
    );
  }

  const groupMap = useGroupMap(groups);
  const { options: modalGroupOptions } = useGroupSelectOptions(primaryProjectId);

  const avatarMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of allProjectCharacters) {
      if (c.hero_variant_id) {
        map.set(c.id, variantThumbnailUrl(c.hero_variant_id, 1024));
      }
    }
    return map;
  }, [allProjectCharacters]);

  // Fetch all image variants for the project to compute seed data status
  const { data: allVariants } = useImageVariantsBrowse(primaryProjectId || undefined);

  const seedDataStatusMap = useMemo(() => {
    const map = new Map<number, SeedDataStatus>();
    // Build a set of variant types per character from browse data
    const variantTypes = new Map<number, Set<string>>();
    if (allVariants) {
      for (const v of allVariants) {
        if (!v.variant_type) continue;
        let set = variantTypes.get(v.character_id);
        if (!set) { set = new Set(); variantTypes.set(v.character_id, set); }
        set.add(v.variant_type.toLowerCase());
      }
    }
    for (const c of allProjectCharacters) {
      const types = variantTypes.get(c.id);
      const meta = c.metadata;
      map.set(c.id, {
        hasClothedImage: types?.has("clothed") ?? false,
        hasToplessImage: types?.has("topless") ?? false,
        hasBio: meta?.[SOURCE_KEY_BIO] != null,
        hasTov: meta?.[SOURCE_KEY_TOV] != null,
      });
    }
    return map;
  }, [allProjectCharacters, allVariants]);

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

  /* --- create character modal --- */
  const [charModalOpen, setCharModalOpen] = useState(false);
  const [newCharName, setNewCharName] = useState("");
  const [newCharProjectId, setNewCharProjectId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);

  /* --- create/edit group modal --- */
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CharacterGroup | null>(null);
  const [groupNameInput, setGroupNameInput] = useState("");

  /* --- seed data modal --- */
  const [seedDataTarget, setSeedDataTarget] = useState<Character | null>(null);

  /* --- edit/delete character modals --- */
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [charDeleteTarget, setCharDeleteTarget] = useState<Character | null>(null);

  /* --- delete group confirmation --- */
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<CharacterGroup | null>(null);

  /* --- expanded groups --- */
  const storageKey = `characters-page-group-collapsed-${primaryProjectId}`;
  const [collapsedIds, setCollapsedIds] = useState<Set<number | "ungrouped">>(new Set());
  const collapsedRef = useRef(collapsedIds);
  collapsedRef.current = collapsedIds;

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setCollapsedIds(new Set(JSON.parse(raw) as (number | "ungrouped")[]));
      else setCollapsedIds(new Set());
    } catch {
      setCollapsedIds(new Set());
    }
  }, [storageKey]);

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

  const allGroupKeys = useMemo(() => {
    const keys: (number | "ungrouped")[] = (groups ?? []).map((g) => g.id);
    keys.push("ungrouped");
    return keys;
  }, [groups]);

  const allCollapsed = allGroupKeys.length > 0 && allGroupKeys.every((k) => collapsedIds.has(k));

  const toggleCollapseAll = useCallback(() => {
    setCollapsedIds(allCollapsed ? new Set() : new Set(allGroupKeys));
  }, [allCollapsed, allGroupKeys]);

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
    const chars = allProjectCharacters;

    let filtered = [...chars];
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
    for (const chars of map.values()) {
      chars.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [allProjectCharacters, searchQuery, showDisabled]);

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (groupFilter.length === 0) return groups;
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

  const handleToggleEnabled = useCallback(
    (charId: number, enabled: boolean) => {
      toggleEnabled.mutate({ characterId: charId, isEnabled: enabled });
    },
    [toggleEnabled],
  );

  const handleSelectAll = useCallback(
    (charIds: number[]) => {
      if (charIds.length === 0) {
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

  /* --- character CRUD --- */
  async function handleCreateCharacter() {
    if (!newCharName.trim()) return;
    const targetProjectId = isAdmin && newCharProjectId ? Number(newCharProjectId) : primaryProjectId;
    if (!targetProjectId) return;
    const gId = selectedGroupId ? Number(selectedGroupId) : undefined;

    try {
      await api.post(`/projects/${targetProjectId}/characters`, {
        name: newCharName.trim(),
        group_id: gId,
      });
      setCharModalOpen(false);
      setNewCharName("");
      setNewCharProjectId("");
      setSelectedGroupId("");
      setShowNewGroup(false);
      setNewGroupName("");
      // Switch to the target project
      if (isAdmin) {
        setProjectFilter([String(targetProjectId)]);
      }
      // Invalidate character queries
      queryClient.invalidateQueries({ queryKey: ["projects", targetProjectId, "characters"] });
    } catch {
      // Error handled by API layer
    }
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

  /* --- group CRUD --- */
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

  /* --- intercept folder drop for admin project selection --- */
  const [pendingFolderDrop, setPendingFolderDrop] = useState<FolderDropResult | null>(null);
  const [pickProjectForImport, setPickProjectForImport] = useState(false);
  const [importTargetProjectId, setImportTargetProjectId] = useState("");

  const handleFolderDrop = useCallback(
    (result: FolderDropResult) => {
      if (isAdmin && primaryProjectId === 0) {
        setPendingFolderDrop(result);
        setPickProjectForImport(true);
      } else {
        charImport.handleFolderDrop(result);
      }
    },
    [isAdmin, primaryProjectId, charImport],
  );

  function handlePickProjectConfirm() {
    if (!importTargetProjectId || !pendingFolderDrop) return;
    const pid = Number(importTargetProjectId);
    setProjectFilter([String(pid)]);
    setPickProjectForImport(false);
    const result = pendingFolderDrop;
    setPendingFolderDrop(null);
    setImportTargetProjectId("");
    setTimeout(() => charImport.handleFolderDrop(result), 100);
  }

  const isLoading = projectsLoading || charsLoading || groupsLoading;

  if (isLoading && allProjectCharacters.length === 0) {
    return <LoadingPane />;
  }

  // Non-admin without a project selected
  if (!isAdmin && primaryProjectId === 0) {
    return (
      <EmptyState
        icon={<User size={32} />}
        title="No project found"
        description="You are not assigned to any project."
      />
    );
  }

  // Admin with no projects at all
  if (isAdmin && (!projects || projects.length === 0) && !projectsLoading) {
    return (
      <EmptyState
        icon={<User size={32} />}
        title="No projects"
        description="Create a project first to manage characters."
      />
    );
  }

  const renderCard = (c: Character) => (
    <CharacterCard
      key={c.id}
      character={c}
      group={c.group_id ? groupMap.get(c.group_id) : undefined}
      avatarUrl={avatarMap.get(c.id)}
      heroVariantId={c.hero_variant_id}
      selected={selectedCharIds.has(c.id)}
      projectId={primaryProjectId}
      seedDataStatus={seedDataStatusMap.get(c.id)}
      onSelect={toggleCharSelection}
      onClick={() => setSeedDataTarget(c)}
      onEdit={() => setEditingChar(c)}
      onToggleEnabled={handleToggleEnabled}
    />
  );

  return (
    <FileDropZone
      onNamesDropped={charImport.handleImportDrop}
      onFolderDropped={handleFolderDrop}
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
          projectOptions={isAdmin ? projectOptions : undefined}
          projectFilter={isAdmin ? projectFilter : undefined}
          onProjectFilterChange={isAdmin ? setProjectFilter : undefined}
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
            disabled={primaryProjectId === 0}
          >
            Import Folder
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="secondary"
              icon={<FolderKanban size={14} />}
              onClick={() => setProjectModalOpen(true)}
            >
              New Project
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            icon={<Folder size={14} />}
            onClick={openCreateGroup}
            disabled={primaryProjectId === 0}
          >
            New Group
          </Button>
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setCharModalOpen(true)}
          >
            Add Character
          </Button>
        </div>

        {/* Import progress */}
        {charImport.importProgress && charImport.importProgress.phase !== "done" && (
          <ImportProgressBar progress={charImport.importProgress} />
        )}

        {/* Content */}
        {totalFiltered === 0 ? (
          <EmptyState
            icon={<User size={32} />}
            title="No characters"
            description={
              allProjectCharacters.length > 0
                ? "No characters match your filter."
                : "Add a character or import a folder."
            }
            action={
              allProjectCharacters.length === 0 ? (
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
                <CharacterGroupSection
                  key={group.id}
                  sectionId={`group-${group.id}`}
                  label={group.name}
                  subtitle={projects?.find((p) => p.id === group.project_id)?.name}
                  characters={chars}
                  expanded={expanded}
                  onToggle={() => toggleExpanded(group.id)}
                  onEdit={() => openEditGroup(group)}
                  onDelete={() => setGroupDeleteTarget(group)}
                  selectedCharIds={selectedCharIds}
                  onCharSelect={toggleCharSelection}
                  onSelectAll={handleSelectAll}
                  renderCard={renderCard}
                />
              );
            })}

            {showUngrouped && (
              <CharacterGroupSection
                sectionId="group-ungrouped"
                label="Ungrouped"
                subtitle={projects?.find((p) => p.id === primaryProjectId)?.name}
                characters={ungroupedChars}
                expanded={!collapsedIds.has("ungrouped")}
                onToggle={() => toggleExpanded("ungrouped")}
                selectedCharIds={selectedCharIds}
                onCharSelect={toggleCharSelection}
                onSelectAll={handleSelectAll}
                renderCard={renderCard}
              />
            )}
          </Stack>
        )}

        {/* Add character modal */}
        <Modal open={charModalOpen} onClose={() => setCharModalOpen(false)} title="Add Character" size="md">
          <Stack gap={4}>
            {isAdmin ? (
              <Select
                label="Project"
                options={[
                  { value: "", label: "— Select project —" },
                  ...(projects ?? []).map((p) => ({ value: String(p.id), label: p.name })),
                ]}
                value={newCharProjectId || String(primaryProjectId || "")}
                onChange={setNewCharProjectId}
              />
            ) : (
              primaryProjectId > 0 && projects?.length && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  Project: <span className="font-medium text-[var(--color-text-primary)]">{projects.find((p) => p.id === primaryProjectId)?.name}</span>
                </p>
              )
            )}
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
              disabled={!newCharName.trim() || (isAdmin && !newCharProjectId && !primaryProjectId)}
            >
              Create Character
            </Button>
          </Stack>
        </Modal>

        {/* Pick project for import (admin, no project selected) */}
        <Modal
          open={pickProjectForImport}
          onClose={() => { setPickProjectForImport(false); setPendingFolderDrop(null); }}
          title="Select Project for Import"
          size="sm"
        >
          <Stack gap={4}>
            <p className="text-sm text-[var(--color-text-muted)]">
              Choose which project to import the dropped files into.
            </p>
            <Select
              label="Project"
              options={[
                { value: "", label: "— Select —" },
                ...(projects ?? []).map((p) => ({ value: String(p.id), label: p.name })),
              ]}
              value={importTargetProjectId}
              onChange={setImportTargetProjectId}
            />
            <Button
              onClick={handlePickProjectConfirm}
              disabled={!importTargetProjectId}
            >
              Continue Import
            </Button>
          </Stack>
        </Modal>

        {/* Create project modal (admin) */}
        {isAdmin && (
          <Modal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} title="New Project" size="sm">
            <Stack gap={4}>
              <Input
                label="Project Name"
                placeholder="e.g. Season 3"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
              <Button
                onClick={handleCreateProject}
                loading={createProject.isPending}
                disabled={!newProjectName.trim()}
              >
                Create Project
              </Button>
            </Stack>
          </Modal>
        )}

        {/* Create / Edit group modal */}
        <Modal
          open={groupFormOpen}
          onClose={() => setGroupFormOpen(false)}
          title={editingGroup ? `Edit Group — ${editingGroup.name}` : "Create Group"}
          size="sm"
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
          </Stack>
        </Modal>

        {/* Edit character modal */}
        <CharacterEditModal
          character={editingChar}
          projectId={primaryProjectId}
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

        {/* Seed data modal */}
        <CharacterSeedDataModal
          character={seedDataTarget}
          projectId={primaryProjectId}
          onClose={() => setSeedDataTarget(null)}
        />

        {/* Import confirmation modal */}
        <ImportConfirmModal
          open={charImport.importOpen}
          onClose={charImport.closeImport}
          names={charImport.importNames}
          payloads={charImport.importPayloads.length > 0 ? charImport.importPayloads : undefined}
          projectId={primaryProjectId}
          projectName={projects?.find((p) => p.id === primaryProjectId)?.name}
          existingNames={allProjectCharacters.map((c) => c.name)}
          characters={allProjectCharacters}
          onConfirm={charImport.handleImportConfirm}
          onConfirmWithAssets={charImport.handleImportConfirmWithAssets}
          loading={charImport.bulkCreatePending}
          importProgress={charImport.importProgress}
          onAbort={charImport.abortImport}
          detectedProjectName={charImport.importResult?.detectedProjectName}
          existingGroupNames={groups?.map((g) => g.name) ?? []}
          hashSummary={charImport.hashSummary}
        />
      </Stack>
    </FileDropZone>
  );
}

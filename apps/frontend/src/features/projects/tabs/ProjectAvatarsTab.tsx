/**
 * Merged avatars + groups tab for the project detail page (PRD-112).
 *
 * Shows avatars as avatar cards inside expandable, collapsible group
 * sections. Supports drag-and-drop between groups, multi-select, group
 * CRUD, avatar CRUD, folder import, and search/filter.
 */

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAvatarPath } from "@/hooks/usePipelinePath";
import { useSetToggle } from "@/hooks/useSetToggle";

import { CollapsibleSection, ConfirmDeleteModal, ConfirmModal, ConfigToolbar, Modal } from "@/components/composite";
import { BlockingDeliverablesEditor, EmptyState, FileDropZone } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, Input, LoadingPane, Select } from "@/components/primitives";
import { AvatarFilterBar, AvatarGroupSection, FileAssignmentModal } from "@/features/avatars/components";
import type { GroupSectionDragHandlers } from "@/features/avatars/components";
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

import { variantThumbnailUrl } from "@/features/media/utils";

import { AvatarCard } from "../components/AvatarCard";
import { ImportProgressBar } from "../components/ImportProgressBar";
import { useAvatarDeliverables, useSpeechLanguageCounts } from "../hooks/use-avatar-deliverables";
import { SpeechImportResultModal } from "../components/SpeechImportResultModal";
import { VoiceImportConfirmModal, VoiceImportResultModal } from "../components/VoiceImportModals";
import { useBulkImportSpeeches } from "../hooks/use-project-speech-import";
import { useVoiceImportFlow } from "../hooks/use-voice-import-flow";
import type { SpeechLanguageSummary } from "../components/AvatarCard";
import type { BulkImportReport } from "@/features/avatars/types";
import { AvatarEditModal } from "../components/AvatarEditModal";
import { ImportConfirmModal } from "../components/ImportConfirmModal";
import {
  useAvatarGroups,
  useCreateGroup,
  useDeleteGroup,
  useMoveAvatarToGroup,
  useUpdateGroup,
} from "../hooks/use-avatar-groups";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useAvatarImport } from "../hooks/use-avatar-import";
import { useGroupMap } from "../hooks/use-group-map";
import { useGroupSelectOptions } from "../hooks/use-group-select-options";
import {
  useCreateAvatar,
  useDeleteAvatar,
  useProjectAvatars,
  useToggleAvatarEnabled,
  useUpdateAvatar,
} from "../hooks/use-project-avatars";
import type { Avatar, AvatarGroup, SectionKey, SectionReadiness, UpdateAvatar } from "../types";
import { computeSectionReadiness, filterBlockingReasons } from "../types";

/** localStorage key for the show/hide disabled avatars toggle. */
const SHOW_DISABLED_KEY = "an2n.project.showDisabled";
/** localStorage key for audit view toggle. */
const AUDIT_VIEW_KEY = "an2n.project.auditView";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ProjectAvatarsTabProps {
  projectId: number;
  /** Project name for folder import project-name matching. */
  projectName?: string;
  /** When provided, auto-expand and scroll to the group section on mount. */
  scrollToGroupId?: string;
  /** Which deliverable sections are blocking for avatar completion. */
  blockingDeliverables?: string[];
}

export function ProjectAvatarsTab({ projectId, projectName, scrollToGroupId, blockingDeliverables }: ProjectAvatarsTabProps) {
  const navigate = useNavigate();
  const avatarPath = useAvatarPath();
  const pipelineCtx = usePipelineContextSafe();

  const { data: avatars, isLoading: charsLoading } = useProjectAvatars(projectId);
  const { data: groups, isLoading: groupsLoading } = useAvatarGroups(projectId);
  const createAvatar = useCreateAvatar(projectId);
  const updateAvatar = useUpdateAvatar(projectId);
  const deleteAvatar = useDeleteAvatar(projectId);
  const createGroup = useCreateGroup(projectId);
  const updateGroup = useUpdateGroup(projectId);
  const deleteGroup = useDeleteGroup(projectId);
  const moveAvatar = useMoveAvatarToGroup(projectId);
  const charImport = useAvatarImport(projectId, undefined, pipelineCtx?.pipelineId);
  const toggleEnabled = useToggleAvatarEnabled(projectId);
  const groupExport = useExportGroupSettings();
  const groupImport = useConfigImport();
  const bulkSpeechImport = useBulkImportSpeeches(projectId);

  const groupMap = useGroupMap(groups);
  const { options: modalGroupOptions } = useGroupSelectOptions(projectId);

  /** Build avatar URL map from hero_variant_id included in avatar response. */
  const avatarMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of avatars ?? []) {
      if (c.hero_variant_id) {
        map.set(c.id, variantThumbnailUrl(c.hero_variant_id, 1024));
      }
    }
    return map;
  }, [avatars]);

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

  const [hideComplete, setHideComplete] = useState(false);
  const toggleHideComplete = useCallback(() => setHideComplete((p) => !p), []);

  /* --- audit view (shows blocking reasons on avatar cards) --- */
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

  const { data: deliverables } = useAvatarDeliverables(projectId);
  const { data: speechLangCounts } = useSpeechLanguageCounts(projectId);

  /** Per-avatar language summary for avatar card flags. */
  const speechLanguageMap = useMemo(() => {
    const map = new Map<number, SpeechLanguageSummary[]>();
    if (!speechLangCounts) return map;
    for (const row of speechLangCounts) {
      const arr = map.get(row.avatar_id) ?? [];
      arr.push({ flagCode: row.flag_code, languageCode: row.code, count: row.count });
      map.set(row.avatar_id, arr);
    }
    return map;
  }, [speechLangCounts]);

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

  /** Resolve per-avatar blocking deliverables: avatar → group → project prop. */
  const resolveCharBlockingDeliverables = useMemo(() => {
    // Build group blocking deliverables map
    const groupBdMap = new Map<number, string[]>();
    if (groups) {
      for (const g of groups) {
        if (g.blocking_deliverables) {
          groupBdMap.set(g.id, g.blocking_deliverables);
        }
      }
    }

    return (c: Avatar): string[] | undefined => {
      // Avatar override
      if (c.blocking_deliverables) return c.blocking_deliverables;
      // Group override
      if (c.group_id && groupBdMap.has(c.group_id)) return groupBdMap.get(c.group_id);
      // Project-level (passed as prop)
      return blockingDeliverables;
    };
  }, [groups, blockingDeliverables]);

  /* --- speech import from dropped file --- */
  const [speechImport, setSpeechImport] = useState<{ format: "json" | "csv"; data: string } | null>(null);
  const [speechImportResult, setSpeechImportResult] = useState<BulkImportReport | null>(null);

  const handleSpeechFileDrop = useCallback((format: "json" | "csv", data: string) => {
    setSpeechImport({ format, data });
    setSpeechImportResult(null);
  }, []);

  function handleSpeechImportConfirm() {
    if (!speechImport) return;
    bulkSpeechImport.mutate(
      { format: speechImport.format, data: speechImport.data, skip_existing: true },
      {
        onSuccess: (result) => {
          setSpeechImportResult(result);
          setSpeechImport(null);
        },
      },
    );
  }

  /* --- voice ID import from dropped CSV --- */
  const voiceFlow = useVoiceImportFlow(projectId, avatars ?? []);

  /* --- create avatar modal --- */
  const [charModalOpen, setCharModalOpen] = useState(false);
  const [newCharName, setNewCharName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);

  /* --- create/edit group modal --- */
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AvatarGroup | null>(null);
  const [groupNameInput, setGroupNameInput] = useState("");

  /* --- edit/delete avatar modals --- */
  const [editingChar, setEditingChar] = useState<Avatar | null>(null);
  const [charDeleteTarget, setCharDeleteTarget] = useState<Avatar | null>(null);

  /* --- delete group confirmation --- */
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<AvatarGroup | null>(null);

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

  /* --- avatars by group --- */
  const avatarsByGroup = useMemo(() => {
    const map = new Map<number | "ungrouped", Avatar[]>();
    if (!avatars) return map;

    let filtered = [...avatars];
    if (!showDisabled) {
      filtered = filtered.filter((c) => c.is_enabled);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (hideComplete) {
      filtered = filtered.filter((c) => {
        const readiness = sectionReadinessMap.get(c.id);
        if (!readiness) return true; // No readiness data → keep visible
        // Only check sections that are blocking deliverables — non-blocking
        // sections (e.g. speech when not selected) are treated as complete.
        const charBd = resolveCharBlockingDeliverables(c);
        const entries = Object.entries(readiness) as [string, { state: string }][];
        const relevant = charBd
          ? entries.filter(([key]) => charBd.includes(key))
          : entries;
        return !relevant.every(([, s]) => s.state === "complete");
      });
    }

    for (const c of filtered) {
      const key = c.group_id ?? "ungrouped";
      const arr = map.get(key);
      if (arr) arr.push(c);
      else map.set(key, [c]);
    }
    // Sort avatars alphabetically within each group
    for (const chars of map.values()) {
      chars.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [avatars, searchQuery, showDisabled, hideComplete, sectionReadinessMap, resolveCharBlockingDeliverables]);

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
  const ungroupedChars = avatarsByGroup.get("ungrouped") ?? [];

  const totalFiltered = useMemo(() => {
    let count = 0;
    for (const chars of avatarsByGroup.values()) count += chars.length;
    return count;
  }, [avatarsByGroup]);

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
      toggleEnabled.mutate({ avatarId: charId, isEnabled: enabled });
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
    (e: React.DragEvent, avatarId: number) => {
      const ids = selectedCharIds.has(avatarId)
        ? [...selectedCharIds]
        : [avatarId];
      e.dataTransfer.setData("text/plain", ids.join(","));
      // Sentinel so FileDropZone can distinguish internal drags from external file drops
      e.dataTransfer.setData("application/x-avatar-drag", "1");
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
        const char = avatars?.find((c) => c.id === charId);
        if (!char || char.group_id === newGroupId) continue;
        moveAvatar.mutate({ avatarId: charId, groupId: newGroupId });
      }
      setSelectedCharIds(new Set());
    },
    [avatars, moveAvatar],
  );

  /* --- avatar CRUD handlers --- */
  function handleCreateAvatar() {
    if (!newCharName.trim()) return;
    const groupId = selectedGroupId ? Number(selectedGroupId) : undefined;
    createAvatar.mutate(
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

  function handleSaveCharEdit(avatarId: number, data: UpdateAvatar) {
    updateAvatar.mutate({ avatarId, data }, { onSuccess: () => setEditingChar(null) });
  }

  function handleDeleteAvatar() {
    if (!charDeleteTarget) return;
    deleteAvatar.mutate(charDeleteTarget.id, {
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

  function openEditGroup(group: AvatarGroup) {
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
      onSpeechFileDropped={handleSpeechFileDrop}
      onVoiceFileDropped={voiceFlow.handleVoiceFileDrop}
      browseFolderRef={charImport.browseFolderRef}
    >
      <Stack gap={4}>
        {/* Filter row */}
        <AvatarFilterBar
          searchQuery={searchQuery}
          onSearchChange={(e) => setSearchQuery(e.target.value)}
          groupOptions={groupOptions}
          groupFilter={groupFilter}
          onGroupFilterChange={setGroupFilter}
          allCollapsed={allCollapsed}
          onToggleCollapseAll={toggleCollapseAll}
          showDisabled={showDisabled}
          onToggleShowDisabled={toggleShowDisabled}
          hideComplete={hideComplete}
          onToggleHideComplete={toggleHideComplete}
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
            Add Model
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
            title="No models"
            description={
              avatars && avatars.length > 0
                ? "No models match your filter."
                : "Add a model to this project."
            }
            action={
              !avatars?.length ? (
                <Button size="sm" icon={<Plus size={14} />} onClick={() => setCharModalOpen(true)}>
                  Add Model
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Stack gap={2}>
            {filteredGroups.map((group) => {
              const chars = avatarsByGroup.get(group.id) ?? [];
              const expanded = !collapsedIds.has(group.id);
              const dragHandlers: GroupSectionDragHandlers = {
                onDragEnter: (e) => handleGroupDragEnter(e, group.id),
                onDragOver: handleGroupDragOver,
                onDragLeave: (e) => handleGroupDragLeave(e, group.id),
                onDrop: (e) => handleGroupDrop(e, group.id),
              };

              return (
                <AvatarGroupSection
                  key={group.id}
                  sectionId={`group-${group.id}`}
                  label={group.name}
                  avatars={chars}
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
                      <AvatarCard
                        avatar={c}
                        group={c.group_id ? groupMap.get(c.group_id) : undefined}
                        avatarUrl={avatarMap.get(c.id)}
                        heroVariantId={c.hero_variant_id}
                        selected={selectedCharIds.has(c.id)}
                        blockingReasons={auditView ? filterBlockingReasons(blockingMap.get(c.id) ?? [], resolveCharBlockingDeliverables(c)) : undefined}
                        sectionReadiness={sectionReadinessMap.get(c.id)}
                        blockingDeliverables={resolveCharBlockingDeliverables(c)}
                        projectId={projectId}
                        speechLanguages={speechLanguageMap.get(c.id)}
                        onSelect={toggleCharSelection}
                        onClick={() => navigate({ to: avatarPath(projectId, c.id) as string })}
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
              <AvatarGroupSection
                sectionId="group-ungrouped"
                label="Ungrouped"
                avatars={ungroupedChars}
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
                    <AvatarCard
                      avatar={c}
                      group={c.group_id ? groupMap.get(c.group_id) : undefined}
                      avatarUrl={avatarMap.get(c.id)}
                      heroVariantId={c.hero_variant_id}
                      selected={selectedCharIds.has(c.id)}
                      blockingReasons={auditView ? filterBlockingReasons(blockingMap.get(c.id) ?? [], resolveCharBlockingDeliverables(c)) : undefined}
                      sectionReadiness={sectionReadinessMap.get(c.id)}
                      blockingDeliverables={blockingDeliverables}
                      projectId={projectId}
                      speechLanguages={speechLanguageMap.get(c.id)}
                      onSelect={toggleCharSelection}
                      onClick={() => navigate({ to: avatarPath(projectId, c.id) as string })}
                      onEdit={() => setEditingChar(c)}
                      onToggleEnabled={handleToggleEnabled}
                    />
                  </div>
                )}
              />
            )}
          </Stack>
        )}

        {/* Add avatar modal */}
        <Modal open={charModalOpen} onClose={() => setCharModalOpen(false)} title="Add Model" size="md">
          <Stack gap={4}>
            <Input
              label="Avatar Name"
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
            <div className="pt-1 border-t border-[var(--color-border-default)]">
              <Button
                size="sm"
                onClick={handleCreateAvatar}
                loading={createAvatar.isPending}
                disabled={!newCharName.trim()}
              >
                Create Model
              </Button>
            </div>
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
              size="sm"
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
                  <CollapsibleSection card title="Blocking Deliverables" description="Override which deliverable sections must be complete for avatars in this group.">
                    <BlockingDeliverablesEditor
                      effective={editingGroup.blocking_deliverables ?? blockingDeliverables ?? []}
                      isOverridden={editingGroup.blocking_deliverables != null}
                      inheritLabel="Inherited from Project"
                      overrideLabel="Group Override"
                      resetLabel="Reset to Project Default"
                      onUpdate={(next) =>
                        updateGroup.mutate(
                          { groupId: editingGroup.id, data: { blocking_deliverables: next } },
                          { onSuccess: (updated) => setEditingGroup(updated) },
                        )
                      }
                    />
                  </CollapsibleSection>
                  <CollapsibleSection card title="Scene Settings" description="Override scene settings for this group.">
                    <GroupSceneOverrides projectId={projectId} groupId={editingGroup.id} />
                  </CollapsibleSection>
                  <CollapsibleSection card title="Workflow Assignments" description="Assign workflows for image and scene types.">
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

        {/* Edit avatar modal */}
        <AvatarEditModal
          avatar={editingChar}
          projectId={projectId}
          onClose={() => setEditingChar(null)}
          onSave={handleSaveCharEdit}
          saving={updateAvatar.isPending}
          onDeleteRequest={(char) => setCharDeleteTarget(char)}
        />

        {/* Delete avatar confirmation */}
        <ConfirmDeleteModal
          open={charDeleteTarget !== null}
          onClose={() => setCharDeleteTarget(null)}
          title="Delete Model"
          entityName={charDeleteTarget?.name ?? ""}
          onConfirm={handleDeleteAvatar}
          loading={deleteAvatar.isPending}
        />

        {/* Delete group confirmation */}
        <ConfirmDeleteModal
          open={groupDeleteTarget !== null}
          onClose={() => setGroupDeleteTarget(null)}
          title="Delete Group"
          entityName={groupDeleteTarget?.name ?? ""}
          warningText="Models in this group will become ungrouped."
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

        {/* Speech file import confirmation */}
        <ConfirmModal
          open={speechImport !== null}
          onClose={() => setSpeechImport(null)}
          title="Import Speech File"
          confirmLabel="Import"
          confirmVariant="primary"
          loading={bulkSpeechImport.isPending}
          onConfirm={handleSpeechImportConfirm}
        >
          {(() => {
            if (!speechImport) return null;
            try {
              const slugify = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
              type Row = { charSlug: string; type: string; lang: string; count: number; matched: boolean };
              const rows: Row[] = [];

              if (speechImport.format === "json") {
                const parsed = JSON.parse(speechImport.data) as Record<string, unknown>;
                for (const [charSlug, typesVal] of Object.entries(parsed)) {
                  const matched = avatars?.some((c) => slugify(c.name) === slugify(charSlug)) ?? false;
                  for (const [typeName, langsVal] of Object.entries(typesVal as Record<string, unknown>)) {
                    for (const [langName, textsVal] of Object.entries(langsVal as Record<string, unknown>)) {
                      const count = Array.isArray(textsVal) ? textsVal.length : 0;
                      if (count > 0) rows.push({ charSlug, type: typeName, lang: langName, count, matched });
                    }
                  }
                }
              } else {
                const lines = speechImport.data.split(/\r?\n/).filter((l) => l.trim());
                const counts = new Map<string, Row>();
                for (const line of lines.slice(1)) {
                  const parts = line.match(/^([^,]*),([^,]*),([^,]*),(.*)$/);
                  if (!parts) continue;
                  const key = `${parts[1]}|${parts[2]}|${parts[3]}`;
                  const existing = counts.get(key);
                  if (existing) {
                    existing.count += 1;
                  } else {
                    const charSlug = parts[1]!;
                    counts.set(key, {
                      charSlug,
                      type: parts[2]!,
                      lang: parts[3]!,
                      count: 1,
                      matched: avatars?.some((c) => slugify(c.name) === slugify(charSlug)) ?? false,
                    });
                  }
                }
                rows.push(...counts.values());
              }

              const matchedCount = new Set(rows.filter((r) => r.matched).map((r) => r.charSlug)).size;
              const totalChars = new Set(rows.map((r) => r.charSlug)).size;
              const totalEntries = rows.reduce((sum, r) => sum + r.count, 0);

              return (
                <Stack gap={2}>
                  <p className="text-xs font-mono">
                    <span className="text-[var(--color-text-primary)]">{totalChars}</span> avatars, <span className="text-[var(--color-text-primary)]">{rows.length}</span> combinations, <span className="text-[var(--color-text-primary)]">{totalEntries}</span> entries total.
                    {" "}<span className="text-[var(--color-text-muted)]">(<span className="text-green-400">{matchedCount} matched</span>, <span className="text-orange-400">{totalChars - matchedCount} unmatched</span>)</span>
                  </p>
                  <div className="max-h-80 overflow-y-auto rounded border border-[var(--color-border-default)]">
                    <table className="w-full text-xs font-mono">
                      <thead className="sticky top-0 bg-[#161b22]">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Avatar</th>
                          <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Speech Type</th>
                          <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Language</th>
                          <th className="text-right px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Entries</th>
                          <th className="text-center px-2 py-1.5 font-medium text-[var(--color-text-muted)]">Match</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} className="border-b border-white/5 hover:bg-[#161b22]">
                            <td className="px-2 py-1 text-[var(--color-text-primary)]">{row.charSlug}</td>
                            <td className="px-2 py-1 text-[var(--color-text-primary)]">{row.type}</td>
                            <td className="px-2 py-1 text-[var(--color-text-primary)]">{row.lang}</td>
                            <td className="px-2 py-1 text-right text-[var(--color-text-primary)]">{row.count}</td>
                            <td className="px-2 py-1 text-center">
                              <span className={row.matched ? "text-green-400" : "text-orange-400"}>
                                {row.matched ? "Yes" : "No"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Stack>
              );
            } catch {
              return <p>Invalid file data.</p>;
            }
          })()}
        </ConfirmModal>

        {/* Speech import result */}
        {speechImportResult && (
          <SpeechImportResultModal
            open
            onClose={() => setSpeechImportResult(null)}
            result={speechImportResult}
          />
        )}

        {/* Import confirmation modal */}
        <ImportConfirmModal
          open={charImport.importOpen}
          onClose={charImport.closeImport}
          names={charImport.importNames}
          payloads={charImport.importPayloads.length > 0 ? charImport.importPayloads : undefined}
          projectId={projectId}
          existingNames={avatars?.map((c) => c.name) ?? []}
          avatars={avatars ?? []}
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

        {/* Voice ID import */}
        {voiceFlow.voiceImport && (
          <VoiceImportConfirmModal
            open
            onClose={() => voiceFlow.setVoiceImport(null)}
            entries={voiceFlow.voiceImport}
            avatars={avatars ?? []}
            mode={voiceFlow.voiceImportMode}
            onModeChange={voiceFlow.setVoiceImportMode}
            loading={voiceFlow.bulkVoiceImport.isPending}
            onConfirm={voiceFlow.handleVoiceImportConfirm}
          />
        )}
        <VoiceImportResultModal
          result={voiceFlow.voiceImportResult}
          onClose={() => voiceFlow.setVoiceImportResult(null)}
        />
      </Stack>
    </FileDropZone>
  );
}


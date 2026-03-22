/**
 * Avatars content page — full browse/creator view (PRD-135).
 *
 * Admin users see all avatars across projects with a project filter.
 * Non-admin users see only their project's avatars.
 * Supports folder import with the base import hook (no videos).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQueries, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";


import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useSetToggle } from "@/hooks/useSetToggle";

import { ConfirmDeleteModal, ConfirmModal, Modal } from "@/components/composite";
import { EmptyState, FileDropZone } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, Input, LoadingPane, Select } from "@/components/primitives";
import type { BulkImportReport } from "@/features/avatars/types";
import { AvatarFilterBar, AvatarGroupSection, AvatarSeedDataModal, FileAssignmentModal, type GroupSectionDragHandlers } from "@/features/avatars/components";
import { useAvatarImport } from "@/features/projects/hooks/use-avatar-import";
import { useBulkImportSpeeches } from "@/features/projects/hooks/use-project-speech-import";
import { useVoiceImportFlow } from "@/features/projects/hooks/use-voice-import-flow";
import { SpeechImportResultModal } from "@/features/projects/components/SpeechImportResultModal";
import { VoiceImportConfirmModal, VoiceImportResultModal } from "@/features/projects/components/VoiceImportModals";
import { AvatarCard } from "@/features/projects/components/AvatarCard";
import type { SeedDataStatus, SpeechLanguageSummary } from "@/features/projects/components/AvatarCard";
import type { ProjectLanguageCount } from "@/features/projects/hooks/use-avatar-deliverables";
import { useImageVariantsBrowse } from "@/features/images/hooks/use-image-variants";
import { SOURCE_KEY_BIO, SOURCE_KEY_TOV } from "@/features/avatars/types";
import { ImportConfirmModal } from "@/features/projects/components/ImportConfirmModal";
import { ImportProgressBar } from "@/features/projects/components/ImportProgressBar";
import {
  useCreateGroup,
  useDeleteGroup,
  useUpdateGroup,
} from "@/features/projects/hooks/use-avatar-groups";
import { useGroupMap } from "@/features/projects/hooks/use-group-map";
import { useGroupSelectOptions } from "@/features/projects/hooks/use-group-select-options";
import {
  useDeleteAvatar,

  useToggleAvatarEnabled,
  useUpdateAvatar,
} from "@/features/projects/hooks/use-project-avatars";
import { useCreateProject, useProjects } from "@/features/projects/hooks/use-projects";
import type { Avatar, AvatarDropPayload, AvatarGroup, FolderDropResult } from "@/features/projects/types";

import { variantThumbnailUrl } from "@/features/images/utils";
import { cn } from "@/lib/cn";
import { toSelectOptions } from "@/lib/select-utils";
import {
  INLINE_LINK_BTN,
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  TERMINAL_TH,
} from "@/lib/ui-classes";
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

const SHOW_DISABLED_KEY = "an2n.avatars.showDisabled";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AvatarsPage() {
  useSetPageTitle("Avatars");
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

  // Fetch avatars and groups from all display projects
  // useQueries supports dynamic arrays — the number of queries can change
  const avatarQueries = useQueries({
    queries: displayProjectIds.map((pid) => ({
      queryKey: ["projects", pid, "avatars", "list"] as const,
      queryFn: () => api.get<Avatar[]>(`/projects/${pid}/avatars`),
      enabled: pid > 0,
    })),
  });

  const groupQueries = useQueries({
    queries: displayProjectIds.map((pid) => ({
      queryKey: ["projects", pid, "groups"] as const,
      queryFn: () => api.get<AvatarGroup[]>(`/projects/${pid}/groups`),
      enabled: pid > 0,
    })),
  });

  const speechLangQueries = useQueries({
    queries: displayProjectIds.map((pid) => ({
      queryKey: ["deliverables", "speechLanguageCounts", pid] as const,
      queryFn: () => api.get<ProjectLanguageCount[]>(`/projects/${pid}/speech-language-counts`),
      enabled: pid > 0,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const speechLanguageMap = useMemo(() => {
    const map = new Map<number, SpeechLanguageSummary[]>();
    for (const q of speechLangQueries) {
      if (!q.data) continue;
      for (const row of q.data) {
        const arr = map.get(row.avatar_id) ?? [];
        arr.push({ flagCode: row.flag_code, languageCode: row.code, count: row.count });
        map.set(row.avatar_id, arr);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechLangQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const charsLoading = avatarQueries.some((q) => q.isLoading);
  const groupsLoading = groupQueries.some((q) => q.isLoading);

  const allProjectAvatars = useMemo(() => {
    const chars: Avatar[] = [];
    for (const q of avatarQueries) {
      if (q.data) chars.push(...q.data);
    }
    return chars;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const groups = useMemo(() => {
    const allGroups: AvatarGroup[] = [];
    for (const q of groupQueries) {
      if (q.data) allGroups.push(...q.data);
    }
    return allGroups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const charImport = useAvatarImport(primaryProjectId, allProjectAvatars);

  const updateAvatar = useUpdateAvatar(primaryProjectId);
  const deleteAvatar = useDeleteAvatar(primaryProjectId);
  const createGroup = useCreateGroup(primaryProjectId);
  const updateGroup = useUpdateGroup(primaryProjectId);
  const deleteGroup = useDeleteGroup(primaryProjectId);
  const toggleEnabled = useToggleAvatarEnabled(primaryProjectId);
  const createProject = useCreateProject();
  const bulkSpeechImport = useBulkImportSpeeches(primaryProjectId);

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
  const voiceFlow = useVoiceImportFlow(primaryProjectId, allProjectAvatars);

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
    for (const c of allProjectAvatars) {
      if (c.hero_variant_id) {
        map.set(c.id, variantThumbnailUrl(c.hero_variant_id, 1024));
      }
    }
    return map;
  }, [allProjectAvatars]);

  // Fetch image variants across all displayed projects to compute seed data status.
  // Pass undefined (no project filter) so variants from every visible project are included.
  const { data: allVariants } = useImageVariantsBrowse(undefined);

  const seedDataStatusMap = useMemo(() => {
    const map = new Map<number, SeedDataStatus>();
    // Build a set of variant types per avatar from browse data
    const variantTypes = new Map<number, Set<string>>();
    if (allVariants) {
      for (const v of allVariants) {
        if (!v.variant_type) continue;
        let set = variantTypes.get(v.avatar_id);
        if (!set) { set = new Set(); variantTypes.set(v.avatar_id, set); }
        set.add(v.variant_type.toLowerCase());
      }
    }
    for (const c of allProjectAvatars) {
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
  }, [allProjectAvatars, allVariants]);

  /* --- search & filter --- */
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string[]>([]);

  // Reset group filter when project selection changes (groups are project-scoped).
  useEffect(() => {
    setGroupFilter([]);
  }, [projectFilter, selectedProjectId]);

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

  /* --- create avatar modal --- */
  const [charModalOpen, setCharModalOpen] = useState(false);
  const [newCharName, setNewCharName] = useState("");
  const [newCharProjectId, setNewCharProjectId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);

  /* --- create/edit group modal --- */
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AvatarGroup | null>(null);
  const [groupNameInput, setGroupNameInput] = useState("");

  /* --- seed data modal --- */
  const [seedDataTargetId, setSeedDataTargetId] = useState<number | null>(null);
  // Always derive from latest query data so metadata updates reflect immediately
  const seedDataTarget = seedDataTargetId != null
    ? allProjectAvatars.find((c) => c.id === seedDataTargetId) ?? null
    : null;

  /* --- delete avatar modal --- */
  const [charDeleteTarget, setCharDeleteTarget] = useState<Avatar | null>(null);

  /* --- delete group confirmation --- */
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<AvatarGroup | null>(null);

  /* --- expanded groups --- */
  const storageKey = `avatars-page-group-collapsed-${primaryProjectId}`;
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

  /* --- drag-and-drop between groups --- */
  const [dragOverGroupId, setDragOverGroupId] = useState<number | "ungrouped" | null>(null);
  const dragCounterRef = useRef<Map<number | "ungrouped", number>>(new Map());

  const handleCharDragStart = useCallback(
    (e: React.DragEvent, avatarId: number) => {
      const ids = selectedCharIds.has(avatarId)
        ? [...selectedCharIds]
        : [avatarId];
      e.dataTransfer.setData("text/plain", ids.join(","));
      // Sentinel so FileDropZone can distinguish internal drags from file drops
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
    if (counter === 1) setDragOverGroupId(groupId);
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
      if (!raw) return;
      const charIds = raw.split(",").map(Number).filter(Boolean);

      const newGroupId = targetGroupId === "ungrouped" ? null : targetGroupId;
      for (const charId of charIds) {
        const char = allProjectAvatars.find((c) => c.id === charId);
        if (!char || char.group_id === newGroupId) continue;
        const pid = char.project_id;
        api.put(`/projects/${pid}/avatars/${charId}/group`, { group_id: newGroupId });
      }
      setSelectedCharIds(new Set());
      // Refresh after a short delay to let the API calls complete
      setTimeout(() => {
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey.includes("avatars") &&
            query.queryKey.includes("list"),
        });
      }, 300);
    },
    [allProjectAvatars, queryClient, setSelectedCharIds],
  );

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
    const chars = allProjectAvatars;

    let filtered = [...chars];
    if (!showDisabled) {
      filtered = filtered.filter((c) => c.is_enabled);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (hideComplete) {
      filtered = filtered.filter((c) => {
        const status = seedDataStatusMap.get(c.id);
        if (!status) return true;
        return !(status.hasClothedImage && status.hasToplessImage && status.hasBio && status.hasTov);
      });
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
  }, [allProjectAvatars, searchQuery, showDisabled, hideComplete, seedDataStatusMap]);

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (groupFilter.length === 0) return groups;
    const groupIds = groupFilter.filter((f) => f !== "ungrouped").map(Number);
    if (groupIds.length === 0) return [];
    return groups.filter((g) => groupIds.includes(g.id));
  }, [groups, groupFilter]);

  const showUngrouped = groupFilter.length === 0 || groupFilter.includes("ungrouped");
  const allUngroupedChars = avatarsByGroup.get("ungrouped") ?? [];

  // Split ungrouped avatars by project so each project gets its own section
  const ungroupedByProject = useMemo(() => {
    const map = new Map<number, Avatar[]>();
    for (const c of allUngroupedChars) {
      const arr = map.get(c.project_id);
      if (arr) arr.push(c);
      else map.set(c.project_id, [c]);
    }
    return map;
  }, [allUngroupedChars]);

  const totalFiltered = useMemo(() => {
    let count = 0;
    for (const chars of avatarsByGroup.values()) count += chars.length;
    return count;
  }, [avatarsByGroup]);

  const handleToggleEnabled = useCallback(
    (charId: number, enabled: boolean) => {
      toggleEnabled.mutate({ avatarId: charId, isEnabled: enabled });
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

  /* --- avatar CRUD --- */
  async function handleCreateAvatar() {
    if (!newCharName.trim()) return;
    const targetProjectId = isAdmin && newCharProjectId ? Number(newCharProjectId) : primaryProjectId;
    if (!targetProjectId) return;
    const gId = selectedGroupId ? Number(selectedGroupId) : undefined;

    try {
      await api.post(`/projects/${targetProjectId}/avatars`, {
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
      // Invalidate avatar queries
      queryClient.invalidateQueries({ queryKey: ["projects", targetProjectId, "avatars"] });
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



  function handleDeleteAvatar() {
    if (!charDeleteTarget) return;
    deleteAvatar.mutate(charDeleteTarget.id, {
      onSuccess: () => {
        setCharDeleteTarget(null);
      },
    });
  }

  /* --- group CRUD --- */
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
    const pid = groupDeleteTarget.project_id;
    if (pid !== primaryProjectId) {
      // Group belongs to a different project — call API directly
      api.delete(`/projects/${pid}/groups/${groupDeleteTarget.id}`).then(() => {
        setGroupDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: ["projects", pid, "groups"] });
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey.includes("avatars") &&
            query.queryKey.includes("list"),
        });
      });
    } else {
      deleteGroup.mutate(groupDeleteTarget.id, {
        onSuccess: () => {
          setGroupDeleteTarget(null);
          // Also invalidate avatar lists so ungrouped chars refresh
          queryClient.invalidateQueries({
            predicate: (query) =>
              Array.isArray(query.queryKey) &&
              query.queryKey.includes("avatars") &&
              query.queryKey.includes("list"),
          });
        },
      });
    }
  }

  /* --- intercept folder drop for admin project selection --- */
  const [pendingFolderDrop, setPendingFolderDrop] = useState<FolderDropResult | null>(null);
  const [pickProjectForImport, setPickProjectForImport] = useState(false);
  const [importTargetProjectId, setImportTargetProjectId] = useState("");

  /** Strip video assets — this page is for seed images, metadata, and speech only. */
  const stripVideos = useCallback((result: FolderDropResult): FolderDropResult => {
    const filtered = new Map<string, AvatarDropPayload[]>();
    for (const [group, payloads] of result.groupedPayloads) {
      filtered.set(group, payloads.map((p) => ({
        ...p,
        assets: p.assets.filter((a) => a.kind !== "video"),
      })));
    }
    return { ...result, groupedPayloads: filtered };
  }, []);

  const handleFolderDrop = useCallback(
    (result: FolderDropResult) => {
      const cleaned = stripVideos(result);
      // Admin without an explicit project filter — need to pick/match a project first
      if (isAdmin && projectFilter.length === 0) {
        const folderName = cleaned.detectedProjectName;
        if (folderName && projects) {
          const match = projects.find(
            (p) => p.name.toLowerCase() === folderName.toLowerCase(),
          );
          if (match) {
            setProjectFilter([String(match.id)]);
            setImportTargetProjectId(String(match.id));
          }
        }
        setPendingFolderDrop(cleaned);
        setPickProjectForImport(true);
      } else {
        charImport.handleFolderDrop(cleaned);
      }
    },
    [isAdmin, projectFilter.length, charImport, projects, stripVideos],
  );

  // When a project is picked for import, set the filter and defer the import
  // until charImport rebinds to the new project on the next render cycle.
  const pendingImportRef = useRef<FolderDropResult | null>(null);
  const [importTrigger, setImportTrigger] = useState(0);

  function handlePickProjectConfirm() {
    if (!importTargetProjectId || !pendingFolderDrop) return;
    setProjectFilter([String(Number(importTargetProjectId))]);
    setPickProjectForImport(false);
    pendingImportRef.current = pendingFolderDrop;
    setPendingFolderDrop(null);
    setImportTargetProjectId("");
    // Bump trigger to fire the effect after the filter state propagates
    setImportTrigger((n) => n + 1);
  }

  useEffect(() => {
    if (!pendingImportRef.current) return;
    // Wait two frames for projectFilter → displayProjectIds → primaryProjectId → charImport to rebind
    const timer = setTimeout(() => {
      const result = pendingImportRef.current;
      if (result) {
        pendingImportRef.current = null;
        charImport.handleFolderDrop(result);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [importTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading = projectsLoading || charsLoading || groupsLoading;

  if (isLoading && allProjectAvatars.length === 0) {
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
        description="Create a project first to manage models."
      />
    );
  }

  const renderCard = (c: Avatar) => (
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
        projectId={c.project_id}
        seedDataStatus={seedDataStatusMap.get(c.id)}
        speechLanguages={speechLanguageMap.get(c.id)}
        onSelect={toggleCharSelection}
        onClick={() => setSeedDataTargetId(c.id)}
        onToggleEnabled={handleToggleEnabled}
      />
    </div>
  );

  return (
    <FileDropZone
      onNamesDropped={charImport.handleImportDrop}
      onFolderDropped={handleFolderDrop}
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
          projectOptions={isAdmin ? projectOptions : undefined}
          projectFilter={isAdmin ? projectFilter : undefined}
          onProjectFilterChange={isAdmin ? setProjectFilter : undefined}
          selectedCount={selectedCharIds.size}
          onClearSelection={() => setSelectedCharIds(new Set())}
          onClearFilters={() => {
            setSearchQuery("");
            setGroupFilter([]);
            if (isAdmin) setProjectFilter([]);
          }}
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
            Add Model
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
            title="No models"
            description={
              allProjectAvatars.length > 0
                ? "No models match your filter."
                : "Add a model or import a folder."
            }
            action={
              allProjectAvatars.length === 0 ? (
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
                  subtitle={projects?.find((p) => p.id === group.project_id)?.name}
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
                  renderCard={renderCard}
                />
              );
            })}

            {showUngrouped && [...ungroupedByProject.entries()].map(([pid, chars]) => (
              <AvatarGroupSection
                key={`ungrouped-${pid}`}
                sectionId={`group-ungrouped-${pid}`}
                label="Ungrouped"
                subtitle={projects?.find((p) => p.id === pid)?.name}
                avatars={chars}
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
                renderCard={renderCard}
              />
            ))}
          </Stack>
        )}

        {/* Add avatar modal */}
        <Modal open={charModalOpen} onClose={() => setCharModalOpen(false)} title="Add Model" size="md">
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
            <Button
              onClick={handleCreateAvatar}
              disabled={!newCharName.trim() || (isAdmin && !newCharProjectId && !primaryProjectId)}
            >
              Create Model
            </Button>
          </Stack>
        </Modal>

        {/* Pick project for import (admin, no project selected) */}
        <Modal
          open={pickProjectForImport}
          onClose={() => { setPickProjectForImport(false); setPendingFolderDrop(null); setImportTargetProjectId(""); }}
          title="Import to Project"
          size="sm"
        >
          <Stack gap={3}>
            {/* Folder name match indicator */}
            {pendingFolderDrop?.detectedProjectName && (() => {
              const folderName = pendingFolderDrop.detectedProjectName!;
              const match = projects?.find((p) => p.name.toLowerCase() === folderName.toLowerCase());
              return (
                <p className={`font-mono text-xs border-l-2 pl-2 py-0.5 ${match ? "border-green-400 text-green-400" : "border-orange-400 text-orange-400"}`}>
                  {match
                    ? `folder "${folderName}" matches project "${match.name}"`
                    : `folder "${folderName}" — no matching project`}
                </p>
              );
            })()}
            <Select
              label="Project"
              options={[
                { value: "", label: "— Select —" },
                ...(projects ?? []).map((p) => ({ value: String(p.id), label: p.name })),
              ]}
              value={importTargetProjectId}
              onChange={setImportTargetProjectId}
            />
            <div className="flex justify-end pt-1 border-t border-[var(--color-border-default)]">
              <Button
                size="sm"
                onClick={handlePickProjectConfirm}
                disabled={!importTargetProjectId}
              >
                Continue Import
              </Button>
            </div>
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

        {/* Seed data modal */}
        <AvatarSeedDataModal
          avatar={seedDataTarget}
          projectId={seedDataTarget?.project_id ?? primaryProjectId}
          onClose={() => setSeedDataTargetId(null)}
          groupOptions={(() => {
            const pid = seedDataTarget?.project_id ?? primaryProjectId;
            const projectGroups = groups.filter((g) => g.project_id === pid);
            return [
              { value: "", label: "No group" },
              ...projectGroups.map((g) => ({ value: String(g.id), label: g.name })),
            ];
          })()}
          onGroupChange={(charId, groupId) => {
            const char = allProjectAvatars.find((c) => c.id === charId);
            const pid = char?.project_id ?? primaryProjectId;
            api.put(`/projects/${pid}/avatars/${charId}`, { group_id: groupId }).then(() => {
              queryClient.invalidateQueries({
                predicate: (query) =>
                  Array.isArray(query.queryKey) &&
                  query.queryKey.includes("avatars") &&
                  query.queryKey.includes("list"),
              });
            });
          }}
          onCreateGroup={async (name) => {
            const pid = seedDataTarget?.project_id ?? primaryProjectId;
            const created = await api.post<AvatarGroup>(`/projects/${pid}/groups`, { name });
            queryClient.invalidateQueries({ queryKey: ["projects", pid, "groups"] });
            return created.id;
          }}
          onDelete={(charId) => {
            const char = allProjectAvatars.find((c) => c.id === charId);
            const pid = char?.project_id ?? primaryProjectId;
            api.delete(`/projects/${pid}/avatars/${charId}`).then(() => {
              queryClient.invalidateQueries({
                predicate: (query) =>
                  Array.isArray(query.queryKey) &&
                  query.queryKey.includes("avatars") &&
                  query.queryKey.includes("list"),
              });
            });
          }}
          onUpdate={(charId, data) => {
            const char = allProjectAvatars.find((c) => c.id === charId);
            const pid = char?.project_id ?? primaryProjectId;
            api.put(`/projects/${pid}/avatars/${charId}`, data).then(() => {
              queryClient.invalidateQueries({
                predicate: (query) =>
                  Array.isArray(query.queryKey) &&
                  query.queryKey.includes("avatars") &&
                  query.queryKey.includes("list"),
              });
            });
          }}
          updating={updateAvatar.isPending}
        />

        {/* Import confirmation modal */}
        <ImportConfirmModal
          open={charImport.importOpen}
          onClose={charImport.closeImport}
          names={charImport.importNames}
          payloads={charImport.importPayloads.length > 0 ? charImport.importPayloads : undefined}
          projectId={primaryProjectId}
          projectName={projects?.find((p) => p.id === primaryProjectId)?.name}
          existingNames={allProjectAvatars.map((c) => c.name)}
          avatars={allProjectAvatars}
          onConfirm={charImport.handleImportConfirm}
          onConfirmWithAssets={charImport.handleImportConfirmWithAssets}
          loading={charImport.bulkCreatePending}
          importProgress={charImport.importProgress}
          onAbort={charImport.abortImport}
          detectedProjectName={charImport.importResult?.detectedProjectName}
          existingGroupNames={groups?.map((g) => g.name) ?? []}
          hashSummary={charImport.hashSummary}
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
                  const matched = allProjectAvatars.some((c) => slugify(c.name) === slugify(charSlug));
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
                      matched: allProjectAvatars.some((c) => slugify(c.name) === slugify(charSlug)),
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
                  <p className="text-sm">
                    <strong>{totalChars}</strong> avatars, <strong>{rows.length}</strong> combinations, <strong>{totalEntries}</strong> entries total.
                    {" "}<span className="text-[var(--color-text-muted)]">({matchedCount} matched, {totalChars - matchedCount} unmatched)</span>
                  </p>
                  <div className="max-h-80 overflow-y-auto rounded border border-[var(--color-border-default)]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#161b22]">
                        <tr>
                          <th className={cn(TERMINAL_TH, "px-2 py-1.5")}>Avatar</th>
                          <th className={cn(TERMINAL_TH, "px-2 py-1.5")}>Speech Type</th>
                          <th className={cn(TERMINAL_TH, "px-2 py-1.5")}>Language</th>
                          <th className={cn(TERMINAL_TH, "px-2 py-1.5 text-right")}>Entries</th>
                          <th className={cn(TERMINAL_TH, "px-2 py-1.5 text-center")}>Match</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER)}>
                            <td className="px-2 py-1 font-mono text-xs text-cyan-400">{row.charSlug}</td>
                            <td className="px-2 py-1 font-mono text-xs text-[var(--color-text-muted)]">{row.type}</td>
                            <td className="px-2 py-1 font-mono text-xs text-[var(--color-text-muted)]">{row.lang}</td>
                            <td className="px-2 py-1 text-right font-mono text-xs text-[var(--color-text-muted)]">{row.count}</td>
                            <td className="px-2 py-1 text-center">
                              <span className={cn("font-mono text-xs", row.matched ? "text-green-400" : "text-orange-400")}>
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

        {/* Voice ID import */}
        {voiceFlow.voiceImport && (
          <VoiceImportConfirmModal
            open
            onClose={() => voiceFlow.setVoiceImport(null)}
            entries={voiceFlow.voiceImport}
            avatars={allProjectAvatars}
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

/**
 * Derived Clips browse page — shows only clips with a parent
 * (hasParent: true). Mirrors ScenesPage patterns but focused on
 * derived/imported clips with parent info and scan directory action.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { PageHeader, Stack } from "@/components/layout";
import { Button, Checkbox, MultiFilterBar, Pagination, SearchInput, Toggle, ContextLoader } from "@/components/primitives";
import type { FilterConfig, FilterOption } from "@/components/primitives";
import { useClipsBrowse, useBrowseApproveClip, useBrowseUnapproveClip, useBrowseRejectClip, useBulkApproveClips, useBulkRejectClips } from "@/features/scenes/hooks/useClipManagement";
import type { ClipBrowseItem } from "@/features/scenes/hooks/useClipManagement";
import { toSelectOptions } from "@/lib/select-utils";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useSceneTypes } from "@/features/scene-types/hooks/use-scene-types";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { TagFilter } from "@/components/domain/TagFilter";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { useBulkOperations } from "@/hooks/useBulkOperations";
import { FolderSearch, GitBranch } from "@/tokens/icons";

import { DerivedClipDialogs } from "./DerivedClipDialogs";
import { DerivedClipRow } from "./DerivedClipRow";

/* -------------------------------------------------------------------------- */

const STATUS_OPTIONS: FilterOption[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const DEFAULT_PAGE_SIZE = 25;

/* -------------------------------------------------------------------------- */

export function DerivedClipsPage() {
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sceneTypeFilter, setSceneTypeFilter] = useState<string[]>([]);
  const [trackFilter, setTrackFilter] = useState<string[]>([]);
  const [labelFilter, setLabelFilter] = useState<number[]>([]);
  const [excludeLabelFilter, setExcludeLabelFilter] = useState<number[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [playingClipId, setPlayingClipId] = useState<number | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [scanOpen, setScanOpen] = useState(false);

  const pipelineCtx = usePipelineContextSafe();

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchInput); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const bulkResetKey = useMemo(
    () => JSON.stringify({ projectFilter, statusFilter, sceneTypeFilter, trackFilter, labelFilter, excludeLabelFilter, debouncedSearch, showDisabled }),
    [projectFilter, statusFilter, sceneTypeFilter, trackFilter, labelFilter, excludeLabelFilter, debouncedSearch, showDisabled],
  );
  const bulk = useBulkSelection(bulkResetKey);

  const { data: projects } = useProjects(pipelineCtx?.pipelineId);
  const projectId = projectFilter.length === 1 ? Number(projectFilter[0]) : undefined;

  const { data: browseResult, isLoading } = useClipsBrowse({
    projectId,
    pipelineId: pipelineCtx?.pipelineId,
    sceneType: sceneTypeFilter.length > 0 ? sceneTypeFilter.join(",") : undefined,
    track: trackFilter.length > 0 ? trackFilter.join(",") : undefined,
    qaStatus: statusFilter.length > 0 ? statusFilter.join(",") : undefined,
    showDisabled,
    tagIds: labelFilter.length > 0 ? labelFilter.join(",") : undefined,
    excludeTagIds: excludeLabelFilter.length > 0 ? excludeLabelFilter.join(",") : undefined,
    search: debouncedSearch || undefined,
    hasParent: true,
    limit: pageSize,
    offset: page * pageSize,
  });

  const clips = browseResult?.items ?? [];
  const total = browseResult?.total ?? 0;
  const pageIds = useMemo(() => clips.map((c) => c.id), [clips]);

  // Filter options
  const projectOptions: FilterOption[] = useMemo(
    () => toSelectOptions(projects).map((o) => ({ value: o.value, label: o.label })),
    [projects],
  );
  const { data: sceneTypes } = useSceneTypes(undefined, pipelineCtx?.pipelineId);
  const { data: tracks } = useTracks(false, pipelineCtx?.pipelineId);
  const sceneTypeOptions: FilterOption[] = useMemo(
    () => (sceneTypes ?? []).map((st) => ({ value: st.name, label: st.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [sceneTypes],
  );
  const trackOptions: FilterOption[] = useMemo(
    () => (tracks ?? []).map((t) => ({ value: t.name, label: t.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [tracks],
  );

  // Mutations
  const approveMut = useBrowseApproveClip();
  const unapproveMut = useBrowseUnapproveClip();
  const rejectMut = useBrowseRejectClip();

  const buildFilters = useCallback(() => ({
    projectId,
    pipelineId: pipelineCtx?.pipelineId,
    sceneType: sceneTypeFilter.length > 0 ? sceneTypeFilter.join(",") : undefined,
    track: trackFilter.length > 0 ? trackFilter.join(",") : undefined,
    qaStatus: statusFilter.length > 0 ? statusFilter.join(",") : undefined,
    showDisabled,
    tagIds: labelFilter.length > 0 ? labelFilter.join(",") : undefined,
    excludeTagIds: excludeLabelFilter.length > 0 ? excludeLabelFilter.join(",") : undefined,
    search: debouncedSearch || undefined,
    hasParent: true as const,
  }), [projectId, pipelineCtx?.pipelineId, sceneTypeFilter, trackFilter, statusFilter, showDisabled, labelFilter, excludeLabelFilter, debouncedSearch]);

  const bulkOps = useBulkOperations({
    entityType: "scene_video_version",
    entityNoun: "clip",
    bulk,
    total,
    buildFilters,
    approveMut: useBulkApproveClips(),
    rejectMut: useBulkRejectClips(),
    pipelineId: pipelineCtx?.pipelineId,
  });

  const filters: FilterConfig[] = useMemo(() => [
    { key: "project", label: "Project", options: projectOptions, selected: projectFilter, onChange: (v: string[]) => { setProjectFilter(v); setPage(0); }, width: "w-44" },
    { key: "status", label: "Status", options: STATUS_OPTIONS, selected: statusFilter, onChange: (v: string[]) => { setStatusFilter(v); setPage(0); } },
    { key: "sceneType", label: "Scene Type", options: sceneTypeOptions, selected: sceneTypeFilter, onChange: (v: string[]) => { setSceneTypeFilter(v); setPage(0); }, width: "w-44" },
    { key: "track", label: "Track", options: trackOptions, selected: trackFilter, onChange: (v: string[]) => { setTrackFilter(v); setPage(0); } },
  ], [projectOptions, projectFilter, statusFilter, sceneTypeOptions, sceneTypeFilter, trackOptions, trackFilter]);

  const handleApprove = useCallback((clip: ClipBrowseItem) => {
    if (clip.qa_status === "approved") unapproveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id });
    else approveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id });
  }, [approveMut, unapproveMut]);

  const handleReject = useCallback((clip: ClipBrowseItem) => {
    if (clip.qa_status === "rejected") unapproveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id });
    else rejectMut.mutate({ sceneId: clip.scene_id, versionId: clip.id, input: { reason: "Rejected from browse" } });
  }, [rejectMut, unapproveMut]);

  const handleNavigate = useCallback((clip: ClipBrowseItem) => {
    navigate({
      to: "/projects/$projectId/avatars/$avatarId",
      params: { projectId: String(clip.project_id), avatarId: String(clip.avatar_id) },
      search: { tab: "scenes", scene: String(clip.scene_id) },
    });
  }, [navigate]);

  return (
    <Stack gap={6}>
      <PageHeader
        title="Derived Clips"
        description="Browse imported and derived clips across all avatars."
        actions={pipelineCtx?.pipelineId ? (
          <Button size="sm" variant="secondary" icon={<FolderSearch size={14} />} onClick={() => setScanOpen(true)}>
            Scan Directory
          </Button>
        ) : undefined}
      />

      <SearchInput value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search by avatar, scene type, track, project..." size="sm" />

      <MultiFilterBar filters={filters} size="xs">
        <div className="flex items-center gap-3">
          <Checkbox checked={bulk.isAllPageSelected(pageIds)} indeterminate={bulk.isIndeterminate(pageIds)} onChange={(checked) => checked ? bulk.selectPage(pageIds) : bulk.deselectPage(pageIds)} label="Select all" size="sm" />
          <Toggle checked={showDisabled} onChange={setShowDisabled} label="Show disabled" size="sm" />
          <span className="text-xs text-[var(--color-text-muted)]">{clips.length} clip{clips.length !== 1 ? "s" : ""}</span>
        </div>
      </MultiFilterBar>

      {total > 0 && (
        <TagFilter selectedTagIds={labelFilter} onSelectionChange={(ids) => { setLabelFilter(ids); setPage(0); }} excludedTagIds={excludeLabelFilter} onExclusionChange={(ids) => { setExcludeLabelFilter(ids); setPage(0); }} pipelineId={pipelineCtx?.pipelineId} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><ContextLoader size={48} /></div>
      ) : !clips.length ? (
        <EmptyState icon={<GitBranch size={32} />} title="No derived clips" description="No derived or imported clips match the current filters." />
      ) : (
        <div className="flex flex-col gap-2">
          {clips.map((clip) => (
            <DerivedClipRow key={clip.id} clip={clip} selected={bulk.isSelected(clip.id)} onToggleSelect={() => bulk.toggle(clip.id)} onPlay={() => setPlayingClipId(clip.id)} onNavigate={() => handleNavigate(clip)} onApprove={() => handleApprove(clip)} onReject={() => handleReject(clip)} />
          ))}
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />

      <DerivedClipDialogs
        clips={clips}
        playingClipId={playingClipId}
        onClosePlayback={() => setPlayingClipId(null)}
        onSetPlayingId={setPlayingClipId}
        onApprove={handleApprove}
        onReject={handleReject}
        pipelineId={pipelineCtx?.pipelineId}
        bulk={bulk}
        bulkOps={bulkOps}
        total={total}
        pageIds={pageIds}
        scanOpen={scanOpen}
        onCloseScan={() => setScanOpen(false)}
      />
    </Stack>
  );
}

/**
 * Scenes content page — browse all generated clips across avatars,
 * most recent first. Read-only clip list items with video playback
 * and navigation to avatar scene detail.
 */

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BulkActionBar,
  BulkLabelDialog,
  BulkRejectDialog,
  EmptyState,
  ExportStatusPanel,
  ScanInputDialog,
} from "@/components/domain";
import { TagFilter } from "@/components/domain/TagFilter";
import { PageHeader, Stack } from "@/components/layout";
import {
  Button,
  Checkbox,
  ContextLoader,
  MultiFilterBar,
  Pagination,
  SearchInput,
  Toggle,
} from "@/components/primitives";
import type { FilterConfig, FilterOption } from "@/components/primitives";
import { usePipelineContextSafe } from "@/features/pipelines";
import { ImportConfirmModal } from "@/features/projects/components/ImportConfirmModal";
import { useAvatarGroups } from "@/features/projects/hooks/use-avatar-groups";
import { useProjectAvatars } from "@/features/projects/hooks/use-project-avatars";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { useSceneTypes } from "@/features/scene-types/hooks/use-scene-types";
import { BrowseClipCard } from "@/features/scenes/BrowseClipCard";
import { ClipPlaybackModal } from "@/features/scenes/ClipPlaybackModal";
import {
  useBrowseApproveClip,
  useBrowseRejectClip,
  useBrowseUnapproveClip,
  useBulkApproveClips,
  useBulkRejectClips,
  useClipsBrowse,
} from "@/features/scenes/hooks/useClipManagement";
import type { ClipBrowseItem } from "@/features/scenes/hooks/useClipManagement";
import { type SceneVideoVersion, isEmptyClip, isPurgedClip } from "@/features/scenes/types";
import { getStreamUrl } from "@/features/video-player";
import { formatDuration } from "@/features/video-player/frame-utils";
import { useBulkOperations } from "@/hooks/useBulkOperations";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { useScanImportFlow } from "@/hooks/useScanImportFlow";
import { formatBytes, formatDateTime } from "@/lib/format";
import { toSelectOptions } from "@/lib/select-utils";
import { TYPO_DATA } from "@/lib/typography-tokens";
import { TERMINAL_STATUS_COLORS, TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import {
  Ban,
  CheckCircle,
  FolderSearch,
  Layers,
  LayoutGrid,
  List,
  Play,
  XCircle,
} from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Read-only clip list item
   -------------------------------------------------------------------------- */

function BrowseClipItem({
  clip,
  onPlay,
  onNavigate,
  onApprove,
  onReject,
  selected,
  onToggleSelect,
}: {
  clip: ClipBrowseItem;
  onPlay: () => void;
  onNavigate: () => void;
  onApprove: () => void;
  onReject: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const sourceLabel = clip.source === "imported" ? "imported" : "generated";

  // Lazy-load video: only mount when the card enters the viewport
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoSrc = getStreamUrl("version", clip.id, "proxy");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Preload video offscreen once visible — only mount <video> when metadata is ready.
  useEffect(() => {
    if (!isVisible || isPurgedClip(clip)) return;
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = videoSrc;
    v.onloadeddata = () => setVideoReady(true);
    return () => {
      v.src = "";
      v.onloadeddata = null;
    };
  }, [isVisible, videoSrc, clip]);

  return (
    <div
      ref={ref}
      className={`rounded-[var(--radius-lg)] border transition-colors bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-secondary)] ${
        selected ? "ring-2 ring-blue-500/50" : ""
      } ${
        clip.qa_status === "approved"
          ? "border-green-500"
          : clip.qa_status === "rejected"
            ? "border-red-500"
            : "border-[var(--color-border-default)]"
      } ${!clip.avatar_is_enabled ? "opacity-70 grayscale" : ""}`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Selection checkbox */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onChange={onToggleSelect} size="sm" />
        </div>

        {/* Clickable video thumbnail */}
        {isPurgedClip(clip) ? (
          <div className="relative flex h-14 w-20 shrink-0 items-center justify-center rounded bg-[var(--color-surface-secondary)]">
            <Ban size={18} className="text-[var(--color-text-muted)]" />
          </div>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            className="group/play relative h-14 w-20 shrink-0 rounded overflow-hidden bg-[var(--color-surface-secondary)] cursor-pointer"
          >
            {videoReady ? (
              <video
                src={videoSrc}
                className="absolute inset-0 w-full h-full object-cover"
                preload="metadata"
                muted
              />
            ) : isVisible ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <ContextLoader size={14} />
              </div>
            ) : null}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/play:opacity-100 transition-opacity">
              <Play size={18} className="text-white" />
            </div>
          </button>
        )}

        {/* Clickable metadata area */}
        <button
          type="button"
          onClick={onNavigate}
          className={`flex min-w-0 flex-1 flex-col gap-0.5 text-left cursor-pointer ${TYPO_DATA}`}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--color-text-primary)]">{clip.avatar_name}</span>
            <span className="text-[var(--color-text-muted)] uppercase">{clip.scene_type_name}</span>
            <span
              className={
                TRACK_TEXT_COLORS[clip.track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]"
              }
            >
              {clip.track_name}
            </span>
            {clip.clip_index != null && (
              <span className="text-[var(--color-data-cyan)]">#{clip.clip_index}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
            <span className="text-[var(--color-data-cyan)] font-semibold">
              v{clip.version_number}
            </span>
            <span className="opacity-30">|</span>
            <span>{sourceLabel}</span>
            {clip.is_final && (
              <>
                <span className="opacity-30">|</span>
                <span className="text-[var(--color-data-green)]">final</span>
              </>
            )}
            {clip.qa_status !== "pending" && (
              <>
                <span className="opacity-30">|</span>
                <span
                  className={
                    TERMINAL_STATUS_COLORS[clip.qa_status] ?? "text-[var(--color-text-muted)]"
                  }
                >
                  {clip.qa_status}
                </span>
              </>
            )}
            {isPurgedClip(clip) && (
              <>
                <span className="opacity-30">|</span>
                <span className="text-[var(--color-data-orange)]">purged</span>
              </>
            )}
            {!isPurgedClip(clip) && isEmptyClip(clip) && (
              <>
                <span className="opacity-30">|</span>
                <span className="text-[var(--color-data-orange)]">empty</span>
              </>
            )}
            {clip.annotation_count > 0 && (
              <>
                <span className="opacity-30">|</span>
                <span className="text-[var(--color-data-orange)]">
                  {clip.annotation_count} annotated
                </span>
              </>
            )}
            {clip.parent_version_id != null && (
              <>
                <span className="opacity-30">|</span>
                <span className="text-[var(--color-data-violet)]">derived</span>
              </>
            )}
            <span className="opacity-30">|</span>
            <span>
              {clip.file_size_bytes != null ? formatBytes(clip.file_size_bytes) : "\u2014"}
            </span>
            <span className="opacity-30">|</span>
            <span>
              {clip.duration_secs != null ? formatDuration(clip.duration_secs) : "\u2014"}
            </span>
            <span className="opacity-30">|</span>
            <span>{clip.project_name}</span>
            <span className="opacity-30">|</span>
            <span>{formatDateTime(clip.created_at)}</span>
          </div>
        </button>

        {/* Approve / Reject */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onApprove}
            className={`p-1 rounded transition-colors ${clip.qa_status === "approved" ? "text-[var(--color-data-green)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-green)]"}`}
            title={clip.qa_status === "approved" ? "Approved" : "Approve"}
          >
            <CheckCircle size={16} />
          </button>
          <button
            type="button"
            onClick={onReject}
            className={`p-1 rounded transition-colors ${clip.qa_status === "rejected" ? "text-[var(--color-data-red)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-red)]"}`}
            title={clip.qa_status === "rejected" ? "Rejected" : "Reject"}
          >
            <XCircle size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Filter option constants
   -------------------------------------------------------------------------- */

const SOURCE_OPTIONS: FilterOption[] = [
  { value: "generated", label: "Generated" },
  { value: "imported", label: "Imported" },
  { value: "derived", label: "Derived" },
];

const STATUS_OPTIONS: FilterOption[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

/* --------------------------------------------------------------------------
   Pagination constants
   -------------------------------------------------------------------------- */

const DEFAULT_PAGE_SIZE = 25;

/* --------------------------------------------------------------------------
   Page
   -------------------------------------------------------------------------- */

export function ScenesPage() {
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sceneTypeFilter, setSceneTypeFilter] = useState<string[]>([]);
  const [trackFilter, setTrackFilter] = useState<string[]>([]);
  const [labelFilter, setLabelFilter] = useState<number[]>([]);
  const [excludeLabelFilter, setExcludeLabelFilter] = useState<number[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Track playing clip by ID so approve/reject doesn't jump to another clip
  const [playingClipId, setPlayingClipId] = useState<number | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);
  const [noTags, setNoTags] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  // PRD-165: scan flow is only available when a single project is in context
  // (the SSE import needs a project_id for avatar creation + group routing).

  // Bulk selection — reset key serializes all filter state
  const bulkResetKey = useMemo(
    () =>
      JSON.stringify({
        projectFilter,
        sourceFilter,
        statusFilter,
        sceneTypeFilter,
        trackFilter,
        labelFilter,
        excludeLabelFilter,
        debouncedSearch,
        showDisabled,
      }),
    [
      projectFilter,
      sourceFilter,
      statusFilter,
      sceneTypeFilter,
      trackFilter,
      labelFilter,
      excludeLabelFilter,
      debouncedSearch,
      showDisabled,
    ],
  );
  const bulk = useBulkSelection(bulkResetKey);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const pipelineCtx = usePipelineContextSafe();
  const { data: projects } = useProjects(pipelineCtx?.pipelineId);
  // All filters passed server-side as comma-separated OR values
  const projectId = projectFilter.length === 1 ? Number(projectFilter[0]) : undefined;

  // PRD-165: unified scan → confirm → SSE import flow. Requires a pipeline
  // context and a single-project filter since the backend orchestrator
  // needs both to route avatar/group creation.
  const scanFlow = useScanImportFlow({
    pipelineId: pipelineCtx?.pipelineId ?? 0,
    projectId: projectId ?? 0,
  });
  const scanAvailable = Boolean(pipelineCtx?.pipelineId && projectId);
  // Avatars + groups for the scan's ImportConfirmModal (only queried when
  // a single project is active, otherwise returns an empty list).
  const { data: scanAvatars } = useProjectAvatars(projectId ?? 0);
  const { data: scanGroups } = useAvatarGroups(projectId ?? 0);
  const scanProjectName = useMemo(
    () => (projectId ? projects?.find((p) => p.id === projectId)?.name : undefined),
    [projectId, projects],
  );
  // "derived" is a virtual source that maps to has_parent=true
  const isDerivedFilter = sourceFilter.includes("derived");
  const actualSourceFilter = sourceFilter.filter((s) => s !== "derived");
  const { data: browseResult, isLoading } = useClipsBrowse({
    projectId,
    pipelineId: pipelineCtx?.pipelineId,
    sceneType: sceneTypeFilter.length > 0 ? sceneTypeFilter.join(",") : undefined,
    track: trackFilter.length > 0 ? trackFilter.join(",") : undefined,
    source: actualSourceFilter.length > 0 ? actualSourceFilter.join(",") : undefined,
    qaStatus: statusFilter.length > 0 ? statusFilter.join(",") : undefined,
    showDisabled,
    tagIds: labelFilter.length > 0 ? labelFilter.join(",") : undefined,
    excludeTagIds: excludeLabelFilter.length > 0 ? excludeLabelFilter.join(",") : undefined,
    search: debouncedSearch || undefined,
    hasParent: isDerivedFilter ? true : undefined,
    noTags: noTags || undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  const clips = browseResult?.items;
  const total = browseResult?.total ?? 0;

  const projectOptions: FilterOption[] = useMemo(
    () => toSelectOptions(projects).map((o) => ({ value: o.value, label: o.label })),
    [projects],
  );
  const { data: sceneTypes } = useSceneTypes(undefined, pipelineCtx?.pipelineId);
  const { data: tracks } = useTracks(false, pipelineCtx?.pipelineId);
  const sceneTypeOptions: FilterOption[] = useMemo(
    () =>
      (sceneTypes ?? [])
        .map((st) => ({ value: st.name, label: st.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [sceneTypes],
  );
  const trackOptions: FilterOption[] = useMemo(
    () =>
      (tracks ?? [])
        .map((t) => ({ value: t.name, label: t.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tracks],
  );

  // All filtering is server-side; clips are the final filtered list
  const filteredClips = clips ?? [];
  const pageIds = useMemo(() => filteredClips.map((c) => c.id), [filteredClips]);

  // Resolve playing clip by ID — stable across refetches.
  // Sentinel values: -1 = select last clip on page, -2 = select first clip on page
  // (used when crossing page boundaries via prev/next navigation).
  useEffect(() => {
    if (playingClipId === -1 && filteredClips.length > 0) {
      setPlayingClipId(filteredClips[filteredClips.length - 1]!.id);
    } else if (playingClipId === -2 && filteredClips.length > 0) {
      setPlayingClipId(filteredClips[0]!.id);
    }
  }, [playingClipId, filteredClips]);

  const playingLocalIndex =
    playingClipId != null && playingClipId > 0
      ? filteredClips.findIndex((c) => c.id === playingClipId)
      : -1;
  const playingClipData = playingLocalIndex >= 0 ? filteredClips[playingLocalIndex] : null;

  const approveMut = useBrowseApproveClip();
  const unapproveMut = useBrowseUnapproveClip();
  const rejectMut = useBrowseRejectClip();
  const bulkApproveMut = useBulkApproveClips();
  const bulkRejectMut = useBulkRejectClips();
  // Bulk operations (shared hook eliminates ~130 lines of duplication with MediaPage)
  const buildFilters = useCallback(
    () => ({
      projectId: projectFilter.length === 1 ? Number(projectFilter[0]) : undefined,
      pipelineId: pipelineCtx?.pipelineId,
      sceneType: sceneTypeFilter.length > 0 ? sceneTypeFilter.join(",") : undefined,
      track: trackFilter.length > 0 ? trackFilter.join(",") : undefined,
      source: actualSourceFilter.length > 0 ? actualSourceFilter.join(",") : undefined,
      qaStatus: statusFilter.length > 0 ? statusFilter.join(",") : undefined,
      showDisabled,
      tagIds: labelFilter.length > 0 ? labelFilter.join(",") : undefined,
      excludeTagIds: excludeLabelFilter.length > 0 ? excludeLabelFilter.join(",") : undefined,
      search: debouncedSearch || undefined,
      hasParent: isDerivedFilter ? true : undefined,
    }),
    [
      projectFilter,
      pipelineCtx?.pipelineId,
      sceneTypeFilter,
      trackFilter,
      actualSourceFilter,
      isDerivedFilter,
      statusFilter,
      showDisabled,
      labelFilter,
      excludeLabelFilter,
      debouncedSearch,
    ],
  );

  const bulkOps = useBulkOperations({
    entityType: "scene_video_version",
    entityNoun: "clip",
    bulk,
    total,
    buildFilters,
    approveMut: bulkApproveMut,
    rejectMut: bulkRejectMut,
    pipelineId: pipelineCtx?.pipelineId,
  });

  const filters: FilterConfig[] = useMemo(
    () => [
      {
        key: "project",
        label: "Project",
        options: projectOptions,
        selected: projectFilter,
        onChange: (v: string[]) => {
          setProjectFilter(v);
          setPage(0);
        },
        width: "w-44",
      },
      {
        key: "source",
        label: "Source",
        options: SOURCE_OPTIONS,
        selected: sourceFilter,
        onChange: (v: string[]) => {
          setSourceFilter(v);
          setPage(0);
        },
      },
      {
        key: "status",
        label: "Status",
        options: STATUS_OPTIONS,
        selected: statusFilter,
        onChange: (v: string[]) => {
          setStatusFilter(v);
          setPage(0);
        },
      },
      {
        key: "sceneType",
        label: "Scene Type",
        options: sceneTypeOptions,
        selected: sceneTypeFilter,
        onChange: (v: string[]) => {
          setSceneTypeFilter(v);
          setPage(0);
        },
        width: "w-44",
      },
      {
        key: "track",
        label: "Track",
        options: trackOptions,
        selected: trackFilter,
        onChange: (v: string[]) => {
          setTrackFilter(v);
          setPage(0);
        },
      },
    ],
    [
      projectOptions,
      projectFilter,
      sourceFilter,
      statusFilter,
      sceneTypeOptions,
      sceneTypeFilter,
      trackOptions,
      trackFilter,
    ],
  );

  const toPlayable = useCallback(
    (clip: ClipBrowseItem): SceneVideoVersion => ({
      id: clip.id,
      scene_id: clip.scene_id,
      version_number: clip.version_number,
      source: clip.source,
      file_path: clip.file_path,
      file_size_bytes: clip.file_size_bytes,
      duration_secs: clip.duration_secs,
      width: clip.width,
      height: clip.height,
      frame_rate: clip.frame_rate,
      preview_path: clip.preview_path,
      video_codec: null,
      is_final: clip.is_final,
      notes: clip.notes,
      qa_status: clip.qa_status,
      qa_reviewed_by: null,
      qa_reviewed_at: null,
      qa_rejection_reason: clip.qa_rejection_reason,
      qa_notes: clip.qa_notes,
      generation_snapshot: clip.generation_snapshot,
      file_purged: clip.file_purged,
      deleted_at: null,
      created_at: clip.created_at,
      updated_at: clip.created_at,
      annotation_count: clip.annotation_count,
      parent_version_id: clip.parent_version_id,
      clip_index: clip.clip_index,
      transcode_state: clip.transcode_state,
      transcode_error: clip.transcode_error,
      transcode_started_at: clip.transcode_started_at,
      transcode_attempts: clip.transcode_attempts,
      transcode_job_id: clip.transcode_job_id,
    }),
    [],
  );

  return (
    <Stack gap={6}>
      <PageHeader
        title="Scenes"
        description="Browse all generated scene clips, most recent first."
        actions={
          scanAvailable ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<FolderSearch size={14} />}
              onClick={scanFlow.openScan}
            >
              Scan Directory
            </Button>
          ) : undefined
        }
      />

      {/* Search */}
      <SearchInput
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search by avatar, scene type, track, project..."
        size="sm"
      />

      {/* Filter bar */}
      <MultiFilterBar filters={filters} size="xs">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={bulk.isAllPageSelected(pageIds)}
            indeterminate={bulk.isIndeterminate(pageIds)}
            onChange={(checked) =>
              checked ? bulk.selectPage(pageIds) : bulk.deselectPage(pageIds)
            }
            label="Select all"
            size="sm"
          />
          <Toggle
            checked={showDisabled}
            onChange={setShowDisabled}
            label="Show disabled"
            size="sm"
          />
          <Toggle
            checked={noTags}
            onChange={(v) => {
              setNoTags(v);
              setPage(0);
            }}
            label="No tags"
            size="sm"
          />
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="xs"
            icon={<LayoutGrid size={14} />}
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
          />
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="xs"
            icon={<List size={14} />}
            onClick={() => setViewMode("list")}
            aria-label="List view"
          />
          <span className="text-xs text-[var(--color-text-muted)]">
            {filteredClips.length}
            {clips && filteredClips.length !== clips.length ? ` of ${clips.length}` : ""} clip
            {filteredClips.length !== 1 ? "s" : ""}
          </span>
        </div>
      </MultiFilterBar>

      {/* Label filter */}
      <TagFilter
        selectedTagIds={labelFilter}
        onSelectionChange={(ids) => {
          setLabelFilter(ids);
          setPage(0);
        }}
        excludedTagIds={excludeLabelFilter}
        onExclusionChange={(ids) => {
          setExcludeLabelFilter(ids);
          setPage(0);
        }}
        pipelineId={pipelineCtx?.pipelineId}
        entityType="scene_video_version"
      />

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <ContextLoader size={48} />
        </div>
      ) : !filteredClips.length ? (
        <EmptyState
          icon={<Layers size={32} />}
          title="No clips found"
          description="No scene video clips match the current filters."
        />
      ) : viewMode === "list" ? (
        <div className="flex flex-col gap-2">
          {filteredClips.map((clip) => (
            <BrowseClipItem
              key={clip.id}
              clip={clip}
              selected={bulk.isSelected(clip.id)}
              onToggleSelect={() => bulk.toggle(clip.id)}
              onPlay={() => setPlayingClipId(clip.id)}
              onNavigate={() =>
                navigate({
                  to: "/projects/$projectId/avatars/$avatarId",
                  params: {
                    projectId: String(clip.project_id),
                    avatarId: String(clip.avatar_id),
                  },
                  search: { tab: "scenes", scene: String(clip.scene_id) },
                })
              }
              onApprove={() =>
                clip.qa_status === "approved"
                  ? unapproveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id })
                  : approveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id })
              }
              onReject={() =>
                clip.qa_status === "rejected"
                  ? unapproveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id })
                  : rejectMut.mutate({
                      sceneId: clip.scene_id,
                      versionId: clip.id,
                      input: { reason: "Rejected from browse" },
                    })
              }
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 min-[1500px]:grid-cols-6 gap-3">
          {filteredClips.map((clip) => (
            <BrowseClipCard
              key={clip.id}
              clip={clip}
              selected={bulk.isSelected(clip.id)}
              onToggleSelect={() => bulk.toggle(clip.id)}
              onPlay={() => setPlayingClipId(clip.id)}
              onNavigate={() =>
                navigate({
                  to: "/projects/$projectId/avatars/$avatarId",
                  params: {
                    projectId: String(clip.project_id),
                    avatarId: String(clip.avatar_id),
                  },
                  search: { tab: "scenes", scene: String(clip.scene_id) },
                })
              }
              onApprove={() =>
                clip.qa_status === "approved"
                  ? unapproveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id })
                  : approveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id })
              }
              onReject={() =>
                clip.qa_status === "rejected"
                  ? unapproveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id })
                  : rejectMut.mutate({
                      sceneId: clip.scene_id,
                      versionId: clip.id,
                      input: { reason: "Rejected from browse" },
                    })
              }
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Video playback modal */}
      <ClipPlaybackModal
        clip={playingClipData ? toPlayable(playingClipData) : null}
        onClose={() => setPlayingClipId(null)}
        onPrev={(() => {
          if (playingLocalIndex > 0) {
            // Previous clip on same page
            return () => setPlayingClipId(filteredClips[playingLocalIndex - 1]!.id);
          }
          if (page > 0) {
            // Go to previous page, select last clip (will resolve after page loads)
            return () => {
              setPage((p) => p - 1);
              setPlayingClipId(-1);
            };
          }
          return undefined; // at absolute start
        })()}
        onNext={(() => {
          if (playingLocalIndex >= 0 && playingLocalIndex < filteredClips.length - 1) {
            // Next clip on same page
            return () => setPlayingClipId(filteredClips[playingLocalIndex + 1]!.id);
          }
          const absoluteIndex = page * pageSize + playingLocalIndex;
          if (absoluteIndex < total - 1) {
            // Go to next page, select first clip (will resolve after page loads)
            return () => {
              setPage((p) => p + 1);
              setPlayingClipId(-2);
            };
          }
          return undefined; // at absolute end
        })()}
        onApprove={
          playingClipData
            ? () =>
                playingClipData.qa_status === "approved"
                  ? unapproveMut.mutate({
                      sceneId: playingClipData.scene_id,
                      versionId: playingClipData.id,
                    })
                  : approveMut.mutate({
                      sceneId: playingClipData.scene_id,
                      versionId: playingClipData.id,
                    })
            : undefined
        }
        onReject={
          playingClipData
            ? () =>
                playingClipData.qa_status === "rejected"
                  ? unapproveMut.mutate({
                      sceneId: playingClipData.scene_id,
                      versionId: playingClipData.id,
                    })
                  : rejectMut.mutate({
                      sceneId: playingClipData.scene_id,
                      versionId: playingClipData.id,
                      input: { reason: "Rejected from browse" },
                    })
            : undefined
        }
        pipelineId={pipelineCtx?.pipelineId}
        meta={
          playingClipData
            ? {
                projectName: playingClipData.project_name,
                avatarName: playingClipData.avatar_name,
                sceneTypeName: playingClipData.scene_type_name,
                trackName: playingClipData.track_name,
              }
            : undefined
        }
      />

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={bulk.selectedCount}
        totalCount={total}
        selectAllMatching={bulk.selectAllMatching}
        onApproveAll={bulkOps.handleBulkApprove}
        onRejectAll={() => bulkOps.setRejectDialogOpen(true)}
        onAddLabel={() => bulkOps.setLabelDialogOpen("add")}
        onRemoveLabel={() => bulkOps.setLabelDialogOpen("remove")}
        onExport={bulkOps.handleExport}
        onClearSelection={bulk.clearAll}
        onSelectAllMatching={() => bulk.selectAll(total)}
        isAllPageSelected={bulk.isAllPageSelected(pageIds)}
        pageItemCount={filteredClips.length}
      >
        {bulkOps.exportJob && (
          <ExportStatusPanel job={bulkOps.exportJob} onDismiss={bulkOps.dismissExport} />
        )}
      </BulkActionBar>

      {/* Bulk reject dialog */}
      <BulkRejectDialog
        open={bulkOps.rejectDialogOpen}
        count={bulk.selectedCount}
        onConfirm={bulkOps.handleBulkRejectConfirm}
        onCancel={() => bulkOps.setRejectDialogOpen(false)}
        loading={bulkOps.rejectLoading}
      />

      {/* Bulk label dialog */}
      <BulkLabelDialog
        open={bulkOps.labelDialogOpen !== null}
        mode={bulkOps.labelDialogOpen ?? "add"}
        count={bulk.selectedCount}
        pipelineId={pipelineCtx?.pipelineId}
        entityType="scene_video_version"
        entityIds={Array.from(bulk.selectedIds)}
        onConfirm={bulkOps.handleBulkAddLabel}
        onConfirmRemove={bulkOps.handleBulkRemoveLabel}
        onCancel={() => bulkOps.setLabelDialogOpen(null)}
      />

      {scanAvailable && pipelineCtx?.pipelineId && projectId && (
        <>
          <ScanInputDialog
            open={scanFlow.scanOpen}
            onClose={scanFlow.closeScan}
            pipelineId={pipelineCtx.pipelineId}
            projectId={projectId}
            onScanSuccess={scanFlow.handleScanSuccess}
          />
          {scanFlow.confirmPayloads && (
            <ImportConfirmModal
              open={scanFlow.confirmOpen}
              onClose={scanFlow.closeConfirm}
              names={scanFlow.confirmPayloads.map((p) => p.rawName)}
              payloads={scanFlow.confirmPayloads}
              projectId={projectId}
              existingNames={scanAvatars?.map((c) => c.name) ?? []}
              avatars={scanAvatars ?? []}
              onConfirm={() => {}}
              onConfirmWithAssets={(
                newPayloads,
                existingPayloads,
                groupId,
                overwrite,
                skipExisting,
              ) =>
                scanFlow.handleConfirm(
                  newPayloads,
                  existingPayloads,
                  groupId,
                  overwrite,
                  skipExisting,
                  true,
                )
              }
              loading={scanFlow.isImporting}
              importProgress={scanFlow.importProgress}
              onAbort={scanFlow.cancelImport}
              projectName={scanProjectName}
              existingGroupNames={scanGroups?.map((g) => g.name) ?? []}
              hashSummary={scanFlow.hashSummary}
            />
          )}
        </>
      )}
    </Stack>
  );
}

/**
 * Scenes content page — browse all generated clips across avatars,
 * most recent first. Read-only clip list items with video playback
 * and navigation to avatar scene detail.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState, BulkActionBar, BulkRejectDialog, BulkLabelDialog, ExportStatusPanel } from "@/components/domain";
import { PageHeader, Stack } from "@/components/layout";
import { Button, Checkbox, MultiFilterBar, Pagination, SearchInput, Toggle, ContextLoader } from "@/components/primitives";
import type { FilterConfig, FilterOption } from "@/components/primitives";
import { useClipsBrowse, useBrowseApproveClip, useBrowseUnapproveClip, useBrowseRejectClip, useBulkApproveClips, useBulkRejectClips } from "@/features/scenes/hooks/useClipManagement";
import type { ClipBrowseItem } from "@/features/scenes/hooks/useClipManagement";
import { ClipPlaybackModal } from "@/features/scenes/ClipPlaybackModal";
import { isEmptyClip, isPurgedClip, type SceneVideoVersion } from "@/features/scenes/types";
import { getStreamUrl } from "@/features/video-player";
import { formatDuration } from "@/features/video-player/frame-utils";
import { formatBytes, formatDateTime } from "@/lib/format";
import { TERMINAL_STATUS_COLORS, TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { toSelectOptions } from "@/lib/select-utils";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useSceneTypes } from "@/features/scene-types/hooks/use-scene-types";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { TagFilter } from "@/components/domain/TagFilter";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { useBulkOperations } from "@/hooks/useBulkOperations";
import { Ban, CheckCircle, Layers, LayoutGrid, List, Play, XCircle } from "@/tokens/icons";

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
      ([entry]) => { if (entry?.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
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
    return () => { v.src = ""; v.onloadeddata = null; };
  }, [isVisible, videoSrc, clip]);

  return (
    <div
      ref={ref}
      className={`rounded-[var(--radius-lg)] border transition-colors bg-[#0d1117] hover:bg-[#161b22] ${
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
          <div className="relative flex h-14 w-20 shrink-0 items-center justify-center rounded bg-[#161b22]">
            <Ban size={18} className="text-[var(--color-text-muted)]" />
          </div>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            className="group/play relative h-14 w-20 shrink-0 rounded overflow-hidden bg-[#161b22] cursor-pointer"
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
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-left cursor-pointer font-mono text-xs"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--color-text-primary)]">
              {clip.avatar_name}
            </span>
            <span className="text-[var(--color-text-muted)] uppercase">{clip.scene_type_name}</span>
            <span className={TRACK_TEXT_COLORS[clip.track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]"}>{clip.track_name}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
            <span className="text-cyan-400 font-semibold">v{clip.version_number}</span>
            <span className="opacity-30">|</span>
            <span>{sourceLabel}</span>
            {clip.is_final && <><span className="opacity-30">|</span><span className="text-green-400">final</span></>}
            {clip.qa_status !== "pending" && (
              <><span className="opacity-30">|</span><span className={TERMINAL_STATUS_COLORS[clip.qa_status] ?? "text-[var(--color-text-muted)]"}>{clip.qa_status}</span></>
            )}
            {isPurgedClip(clip) && <><span className="opacity-30">|</span><span className="text-orange-400">purged</span></>}
            {!isPurgedClip(clip) && isEmptyClip(clip) && <><span className="opacity-30">|</span><span className="text-orange-400">empty</span></>}
            {clip.annotation_count > 0 && <><span className="opacity-30">|</span><span className="text-orange-400">{clip.annotation_count} annotated</span></>}
            <span className="opacity-30">|</span>
            <span>{clip.file_size_bytes != null ? formatBytes(clip.file_size_bytes) : "\u2014"}</span>
            <span className="opacity-30">|</span>
            <span>{clip.duration_secs != null ? formatDuration(clip.duration_secs) : "\u2014"}</span>
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
            className={`p-1 rounded transition-colors ${clip.qa_status === "approved" ? "text-green-400" : "text-[var(--color-text-muted)] hover:text-green-400"}`}
            title={clip.qa_status === "approved" ? "Approved" : "Approve"}
          >
            <CheckCircle size={16} />
          </button>
          <button
            type="button"
            onClick={onReject}
            className={`p-1 rounded transition-colors ${clip.qa_status === "rejected" ? "text-red-400" : "text-[var(--color-text-muted)] hover:text-red-400"}`}
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
   Grid clip card
   -------------------------------------------------------------------------- */

function BrowseClipCard({
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
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoSrc = getStreamUrl("version", clip.id, "proxy");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Preload video offscreen once visible.
  useEffect(() => {
    if (!isVisible || isPurgedClip(clip)) return;
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = videoSrc;
    v.onloadeddata = () => setVideoReady(true);
    return () => { v.src = ""; v.onloadeddata = null; };
  }, [isVisible, videoSrc, clip]);

  return (
    <div
      ref={ref}
      className={`relative rounded-[var(--radius-lg)] border overflow-hidden transition-colors bg-[#0d1117] hover:bg-[#161b22] ${
        selected ? "ring-2 ring-blue-500/50" : ""
      } ${
        clip.qa_status === "approved"
          ? "border-green-500"
          : clip.qa_status === "rejected"
            ? "border-red-500"
            : "border-[var(--color-border-default)]"
      } ${!clip.avatar_is_enabled ? "opacity-70 grayscale" : ""}`}
    >
      {/* Selection checkbox overlay */}
      <div
        className="absolute top-1 left-1 z-10 rounded bg-black/50 p-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox checked={selected} onChange={onToggleSelect} size="sm" />
      </div>

      {/* Video preview */}
      {isPurgedClip(clip) ? (
        <div className="flex aspect-video items-center justify-center bg-[#161b22]">
          <Ban size={24} className="text-[var(--color-text-muted)]" />
        </div>
      ) : (
        <button
          type="button"
          onClick={onPlay}
          className="group/play relative aspect-video w-full cursor-pointer bg-[#161b22]"
        >
          {videoReady ? (
            <video
              src={videoSrc}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
          ) : isVisible ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <ContextLoader size={20} />
            </div>
          ) : null}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/play:opacity-100 transition-opacity">
            <Play size={24} className="text-white drop-shadow-lg" />
          </div>
        </button>
      )}

      {/* Metadata + actions */}
      <div className="flex items-center gap-1 p-2">
        <button
          type="button"
          onClick={onNavigate}
          className="min-w-0 flex-1 text-left cursor-pointer"
        >
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="truncate font-medium text-[var(--color-text-primary)]">{clip.avatar_name}</span>
            <span className="shrink-0 text-[var(--color-text-muted)] uppercase text-[10px]">{clip.scene_type_name}</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-text-muted)] mt-0.5">
            <span className="text-cyan-400 font-semibold">v{clip.version_number}</span>
            <span className={TRACK_TEXT_COLORS[clip.track_name.toLowerCase()] ?? "text-[var(--color-text-muted)]"}>{clip.track_name}</span>
            {clip.qa_status !== "pending" && (
              <span className={TERMINAL_STATUS_COLORS[clip.qa_status] ?? "text-[var(--color-text-muted)]"}>{clip.qa_status}</span>
            )}
            {clip.duration_secs != null && <span>{formatDuration(clip.duration_secs)}</span>}
          </div>
        </button>
        <div className="flex flex-col gap-0.5 shrink-0">
          <button type="button" onClick={onApprove} className={`p-0.5 rounded transition-colors ${clip.qa_status === "approved" ? "text-green-400" : "text-[var(--color-text-muted)] hover:text-green-400"}`} title="Approve">
            <CheckCircle size={14} />
          </button>
          <button type="button" onClick={onReject} className={`p-0.5 rounded transition-colors ${clip.qa_status === "rejected" ? "text-red-400" : "text-[var(--color-text-muted)] hover:text-red-400"}`} title="Reject">
            <XCircle size={14} />
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
  // Absolute index across all pages (0 to total-1), not page-local
  const [playingAbsIndex, setPlayingAbsIndex] = useState<number | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  // Bulk selection — reset key serializes all filter state
  const bulkResetKey = useMemo(
    () => JSON.stringify({ projectFilter, sourceFilter, statusFilter, sceneTypeFilter, trackFilter, labelFilter, excludeLabelFilter, debouncedSearch, showDisabled }),
    [projectFilter, sourceFilter, statusFilter, sceneTypeFilter, trackFilter, labelFilter, excludeLabelFilter, debouncedSearch, showDisabled],
  );
  const bulk = useBulkSelection(bulkResetKey);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchInput); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const pipelineCtx = usePipelineContextSafe();
  const { data: projects } = useProjects(pipelineCtx?.pipelineId);
  // All filters passed server-side as comma-separated OR values
  const projectId = projectFilter.length === 1 ? Number(projectFilter[0]) : undefined;
  const { data: browseResult, isLoading } = useClipsBrowse({
    projectId,
    pipelineId: pipelineCtx?.pipelineId,
    sceneType: sceneTypeFilter.length > 0 ? sceneTypeFilter.join(",") : undefined,
    track: trackFilter.length > 0 ? trackFilter.join(",") : undefined,
    source: sourceFilter.length > 0 ? sourceFilter.join(",") : undefined,
    qaStatus: statusFilter.length > 0 ? statusFilter.join(",") : undefined,
    showDisabled,
    tagIds: labelFilter.length > 0 ? labelFilter.join(",") : undefined,
    excludeTagIds: excludeLabelFilter.length > 0 ? excludeLabelFilter.join(",") : undefined,
    search: debouncedSearch || undefined,
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
    () => (sceneTypes ?? []).map((st) => ({ value: st.name, label: st.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [sceneTypes],
  );
  const trackOptions: FilterOption[] = useMemo(
    () => (tracks ?? []).map((t) => ({ value: t.name, label: t.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [tracks],
  );

  // All filtering is server-side; clips are the final filtered list
  const filteredClips = clips ?? [];
  const pageIds = useMemo(() => filteredClips.map((c) => c.id), [filteredClips]);

  // When the modal navigates past the current page boundary, switch pages
  const pageOffset = page * pageSize;
  useEffect(() => {
    if (playingAbsIndex === null) return;
    const targetPage = Math.floor(playingAbsIndex / pageSize);
    if (targetPage !== page) setPage(targetPage);
  }, [playingAbsIndex, pageSize, page]);

  // Local index within the current page's items
  const playingLocalIndex = playingAbsIndex !== null ? playingAbsIndex - pageOffset : null;
  const playingClipData = playingLocalIndex !== null && filteredClips[playingLocalIndex]
    ? filteredClips[playingLocalIndex]
    : null;

  const approveMut = useBrowseApproveClip();
  const unapproveMut = useBrowseUnapproveClip();
  const rejectMut = useBrowseRejectClip();
  const bulkApproveMut = useBulkApproveClips();
  const bulkRejectMut = useBulkRejectClips();
  // Bulk operations (shared hook eliminates ~130 lines of duplication with MediaPage)
  const buildFilters = useCallback(() => ({
    projectId: projectFilter.length === 1 ? Number(projectFilter[0]) : undefined,
    pipelineId: pipelineCtx?.pipelineId,
    sceneType: sceneTypeFilter.length > 0 ? sceneTypeFilter.join(",") : undefined,
    track: trackFilter.length > 0 ? trackFilter.join(",") : undefined,
    source: sourceFilter.length > 0 ? sourceFilter.join(",") : undefined,
    qaStatus: statusFilter.length > 0 ? statusFilter.join(",") : undefined,
    showDisabled,
    tagIds: labelFilter.length > 0 ? labelFilter.join(",") : undefined,
    excludeTagIds: excludeLabelFilter.length > 0 ? excludeLabelFilter.join(",") : undefined,
    search: debouncedSearch || undefined,
  }), [projectFilter, pipelineCtx?.pipelineId, sceneTypeFilter, trackFilter, sourceFilter, statusFilter, showDisabled, labelFilter, excludeLabelFilter, debouncedSearch]);

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

  const filters: FilterConfig[] = useMemo(() => [
    { key: "project", label: "Project", options: projectOptions, selected: projectFilter, onChange: (v: string[]) => { setProjectFilter(v); setPage(0); }, width: "w-44" },
    { key: "source", label: "Source", options: SOURCE_OPTIONS, selected: sourceFilter, onChange: (v: string[]) => { setSourceFilter(v); setPage(0); } },
    { key: "status", label: "Status", options: STATUS_OPTIONS, selected: statusFilter, onChange: (v: string[]) => { setStatusFilter(v); setPage(0); } },
    { key: "sceneType", label: "Scene Type", options: sceneTypeOptions, selected: sceneTypeFilter, onChange: (v: string[]) => { setSceneTypeFilter(v); setPage(0); }, width: "w-44" },
    { key: "track", label: "Track", options: trackOptions, selected: trackFilter, onChange: (v: string[]) => { setTrackFilter(v); setPage(0); } },
  ], [projectOptions, projectFilter, sourceFilter, statusFilter, sceneTypeOptions, sceneTypeFilter, trackOptions, trackFilter]);

  const toPlayable = useCallback((clip: ClipBrowseItem): SceneVideoVersion => ({
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
  }), []);

  return (
    <Stack gap={6}>
      <PageHeader
        title="Scenes"
        description="Browse all generated scene clips, most recent first."
      />

      {/* Search */}
      <SearchInput
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search by avatar, scene type, track, project..."
        size="sm"
      />

      {/* Filter bar */}
      <MultiFilterBar filters={filters}>
        <div className="flex items-center gap-3">
          <Checkbox
            checked={bulk.isAllPageSelected(pageIds)}
            indeterminate={bulk.isIndeterminate(pageIds)}
            onChange={(checked) => checked ? bulk.selectPage(pageIds) : bulk.deselectPage(pageIds)}
            label="Select all"
            size="sm"
          />
          <Toggle
            checked={showDisabled}
            onChange={setShowDisabled}
            label="Show disabled"
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
            {filteredClips.length}{clips && filteredClips.length !== clips.length ? ` of ${clips.length}` : ""} clip{filteredClips.length !== 1 ? "s" : ""}
          </span>
        </div>
      </MultiFilterBar>

      {/* Label filter */}
      <TagFilter
        selectedTagIds={labelFilter}
        onSelectionChange={(ids) => { setLabelFilter(ids); setPage(0); }}
        excludedTagIds={excludeLabelFilter}
        onExclusionChange={(ids) => { setExcludeLabelFilter(ids); setPage(0); }}
        pipelineId={pipelineCtx?.pipelineId}
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
          {filteredClips.map((clip, i) => (
            <BrowseClipItem
              key={clip.id}
              clip={clip}
              selected={bulk.isSelected(clip.id)}
              onToggleSelect={() => bulk.toggle(clip.id)}
              onPlay={() => setPlayingAbsIndex(pageOffset + i)}
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
              onApprove={() => clip.qa_status === "approved" ? unapproveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id }) : approveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id })}
              onReject={() => clip.qa_status === "rejected" ? unapproveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id }) : rejectMut.mutate({ sceneId: clip.scene_id, versionId: clip.id, input: { reason: "Rejected from browse" } })}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 min-[1500px]:grid-cols-6 gap-3">
          {filteredClips.map((clip, i) => (
            <BrowseClipCard
              key={clip.id}
              clip={clip}
              selected={bulk.isSelected(clip.id)}
              onToggleSelect={() => bulk.toggle(clip.id)}
              onPlay={() => setPlayingAbsIndex(pageOffset + i)}
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
              onApprove={() => clip.qa_status === "approved" ? unapproveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id }) : approveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id })}
              onReject={() => clip.qa_status === "rejected" ? unapproveMut.mutate({ sceneId: clip.scene_id, versionId: clip.id }) : rejectMut.mutate({ sceneId: clip.scene_id, versionId: clip.id, input: { reason: "Rejected from browse" } })}
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
        onClose={() => setPlayingAbsIndex(null)}
        onPrev={playingAbsIndex !== null && playingAbsIndex > 0 ? () => setPlayingAbsIndex(playingAbsIndex - 1) : undefined}
        onNext={playingAbsIndex !== null && playingAbsIndex < total - 1 ? () => setPlayingAbsIndex(playingAbsIndex + 1) : undefined}
        onApprove={playingClipData ? () => playingClipData.qa_status === "approved" ? unapproveMut.mutate({ sceneId: playingClipData.scene_id, versionId: playingClipData.id }) : approveMut.mutate({ sceneId: playingClipData.scene_id, versionId: playingClipData.id }) : undefined}
        onReject={playingClipData ? () => playingClipData.qa_status === "rejected" ? unapproveMut.mutate({ sceneId: playingClipData.scene_id, versionId: playingClipData.id }) : rejectMut.mutate({ sceneId: playingClipData.scene_id, versionId: playingClipData.id, input: { reason: "Rejected from browse" } }) : undefined}
        pipelineId={pipelineCtx?.pipelineId}
        meta={playingClipData ? {
          projectName: playingClipData.project_name,
          avatarName: playingClipData.avatar_name,
          sceneTypeName: playingClipData.scene_type_name,
          trackName: playingClipData.track_name,
        } : undefined}
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

    </Stack>
  );
}

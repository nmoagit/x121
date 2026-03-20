/**
 * Scenes content page — browse all generated clips across characters,
 * most recent first. Read-only clip list items with video playback
 * and navigation to character scene detail.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { PageHeader, Stack } from "@/components/layout";
import { MultiFilterBar, Toggle ,  WireframeLoader } from "@/components/primitives";
import type { FilterConfig, FilterOption  } from "@/components/primitives";
import { useClipsBrowse } from "@/features/scenes/hooks/useClipManagement";
import type { ClipBrowseItem } from "@/features/scenes/hooks/useClipManagement";
import { ClipPlaybackModal } from "@/features/scenes/ClipPlaybackModal";
import { isEmptyClip, isPurgedClip, type SceneVideoVersion } from "@/features/scenes/types";
import { getStreamUrl } from "@/features/video-player";
import { formatDuration } from "@/features/video-player/frame-utils";
import { formatBytes, formatDateTime } from "@/lib/format";
import { TERMINAL_STATUS_COLORS, TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { toSelectOptions } from "@/lib/select-utils";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { Ban, Layers, Play } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Read-only clip list item
   -------------------------------------------------------------------------- */

function BrowseClipItem({
  clip,
  onPlay,
  onNavigate,
}: {
  clip: ClipBrowseItem;
  onPlay: () => void;
  onNavigate: () => void;
}) {
  const sourceLabel = clip.source === "imported" ? "imported" : "generated";

  // Lazy-load video: only mount when the card enters the viewport
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
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

  return (
    <div
      ref={ref}
      className={`rounded-[var(--radius-lg)] border transition-colors bg-[#0d1117] hover:bg-[#161b22] ${
        clip.qa_status === "approved"
          ? "border-green-500"
          : clip.qa_status === "rejected"
            ? "border-red-500"
            : "border-[var(--color-border-default)]"
      } ${!clip.character_is_enabled ? "opacity-70 grayscale" : ""}`}
    >
      <div className="flex items-center gap-3 p-3">
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
            {isVisible && (
              <video
                src={getStreamUrl("version", clip.id, "proxy")}
                className="absolute inset-0 w-full h-full object-cover"
                preload="metadata"
                muted
              />
            )}
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
              {clip.character_name}
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

function buildUniqueOptions(items: ClipBrowseItem[] | undefined, key: keyof ClipBrowseItem): FilterOption[] {
  if (!items) return [];
  const values = [...new Set(items.map((c) => c[key] as string).filter(Boolean))].sort();
  return values.map((v) => ({ value: v, label: v }));
}

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
  const [playingClip, setPlayingClip] = useState<SceneVideoVersion | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);

  const { data: projects } = useProjects();
  // When a single project is selected, pass it to the API for server-side filtering
  const projectId = projectFilter.length === 1 ? Number(projectFilter[0]) : undefined;
  const { data: clips, isLoading } = useClipsBrowse(projectId);

  const projectOptions: FilterOption[] = useMemo(
    () => toSelectOptions(projects).map((o) => ({ value: o.value, label: o.label })),
    [projects],
  );
  const sceneTypeOptions = useMemo(() => buildUniqueOptions(clips, "scene_type_name"), [clips]);
  const trackOptions = useMemo(() => buildUniqueOptions(clips, "track_name"), [clips]);

  const filteredClips = useMemo(() => {
    if (!clips) return [];
    return clips.filter((c) => {
      if (!showDisabled && !c.character_is_enabled) return false;
      if (projectFilter.length > 0 && !projectFilter.includes(String(c.project_id))) return false;
      if (sourceFilter.length > 0 && !sourceFilter.includes(c.source)) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(c.qa_status)) return false;
      if (sceneTypeFilter.length > 0 && !sceneTypeFilter.includes(c.scene_type_name)) return false;
      if (trackFilter.length > 0 && !trackFilter.includes(c.track_name)) return false;
      return true;
    });
  }, [clips, showDisabled, projectFilter, sourceFilter, statusFilter, sceneTypeFilter, trackFilter]);

  const filters: FilterConfig[] = useMemo(() => [
    { key: "project", label: "Project", options: projectOptions, selected: projectFilter, onChange: setProjectFilter, width: "w-44" },
    { key: "source", label: "Source", options: SOURCE_OPTIONS, selected: sourceFilter, onChange: setSourceFilter },
    { key: "status", label: "Status", options: STATUS_OPTIONS, selected: statusFilter, onChange: setStatusFilter },
    { key: "sceneType", label: "Scene Type", options: sceneTypeOptions, selected: sceneTypeFilter, onChange: setSceneTypeFilter, width: "w-44" },
    { key: "track", label: "Track", options: trackOptions, selected: trackFilter, onChange: setTrackFilter },
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
    notes: null,
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

      {/* Filter bar */}
      <MultiFilterBar filters={filters}>
        <div className="flex items-center gap-3">
          <Toggle
            checked={showDisabled}
            onChange={setShowDisabled}
            label="Show disabled"
            size="sm"
          />
          <span className="text-xs text-[var(--color-text-muted)]">
            {filteredClips.length}{clips && filteredClips.length !== clips.length ? ` of ${clips.length}` : ""} clip{filteredClips.length !== 1 ? "s" : ""}
          </span>
        </div>
      </MultiFilterBar>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <WireframeLoader size={48} />
        </div>
      ) : !filteredClips.length ? (
        <EmptyState
          icon={<Layers size={32} />}
          title="No clips found"
          description="No scene video clips match the current filters."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filteredClips.map((clip) => (
            <BrowseClipItem
              key={clip.id}
              clip={clip}
              onPlay={() => setPlayingClip(toPlayable(clip))}
              onNavigate={() =>
                navigate({
                  to: "/projects/$projectId/models/$characterId",
                  params: {
                    projectId: String(clip.project_id),
                    characterId: String(clip.character_id),
                  },
                  search: { tab: "scenes", scene: String(clip.scene_id) },
                })
              }
            />
          ))}
        </div>
      )}

      {/* Video playback modal */}
      <ClipPlaybackModal
        clip={playingClip}
        onClose={() => setPlayingClip(null)}
      />
    </Stack>
  );
}

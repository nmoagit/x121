/**
 * Scenes content page — browse all generated clips across characters,
 * most recent first. Read-only clip list items with video playback
 * and navigation to character scene detail.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { PageHeader, Stack } from "@/components/layout";
import { Badge, Button, Select, Spinner } from "@/components/primitives";
import { useClipsBrowse } from "@/features/scenes/hooks/useClipManagement";
import type { ClipBrowseItem } from "@/features/scenes/hooks/useClipManagement";
import { ClipPlaybackModal } from "@/features/scenes/ClipPlaybackModal";
import { isEmptyClip, isPurgedClip, type SceneVideoVersion } from "@/features/scenes/types";
import { getStreamUrl } from "@/features/video-player";
import { formatDuration } from "@/features/video-player/frame-utils";
import { formatBytes, formatDateTime } from "@/lib/format";
import { toSelectOptions } from "@/lib/select-utils";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { Ban, Clapperboard, Edit3, Eye, EyeOff, Layers, Play, Star, Upload } from "@/tokens/icons";

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
  const sourceIcon = clip.source === "imported" ? <Upload size={14} /> : <Clapperboard size={14} />;
  const sourceLabel = clip.source === "imported" ? "Imported" : "Generated";

  return (
    <div
      className={`rounded-[var(--radius-lg)] border transition-colors bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-secondary)] ${
        clip.qa_status === "approved"
          ? "border-[var(--color-action-success)]"
          : clip.qa_status === "rejected"
            ? "border-[var(--color-action-danger)]"
            : "border-[var(--color-border-default)]"
      } ${!clip.character_is_enabled ? "opacity-70 grayscale" : ""}`}
    >
      <div className="flex items-center gap-4 p-4">
        {/* Clickable video thumbnail */}
        {isPurgedClip(clip) ? (
          <div className="relative flex h-16 w-24 shrink-0 items-center justify-center rounded bg-[var(--color-surface-tertiary)]">
            <Ban size={20} className="text-[var(--color-text-muted)]" />
          </div>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            className="group/play relative h-16 w-24 shrink-0 rounded overflow-hidden
              bg-[var(--color-surface-tertiary)] cursor-pointer"
          >
            <video
              src={getStreamUrl("version", clip.id, "proxy")}
              className="absolute inset-0 w-full h-full object-cover"
              preload="none"
              muted
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/play:opacity-100 transition-opacity">
              <Play size={20} className="text-white" />
            </div>
          </button>
        )}

        {/* Clickable metadata area — navigates to character scene detail */}
        <button
          type="button"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 flex-col gap-1 text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              {clip.character_name}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {clip.scene_type_name} &middot; {clip.track_name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              v{clip.version_number}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs
                bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]"
            >
              {sourceIcon} {sourceLabel}
            </span>
            {clip.is_final && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium
                  bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
              >
                <Star size={12} /> Final
              </span>
            )}
            {clip.qa_status !== "pending" && (
              <Badge
                variant={clip.qa_status === "approved" ? "success" : "danger"}
                size="sm"
              >
                {clip.qa_status === "approved" ? "Approved" : "Rejected"}
              </Badge>
            )}
            {isPurgedClip(clip) && (
              <Badge variant="warning" size="sm">Purged</Badge>
            )}
            {!isPurgedClip(clip) && isEmptyClip(clip) && (
              <Badge variant="warning" size="sm">Empty file</Badge>
            )}
            {clip.annotation_count > 0 && (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-[var(--color-action-warning)] text-[var(--color-text-inverse)]">
                <Edit3 size={10} /> {clip.annotation_count}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span>{clip.project_name}</span>
            <span>{clip.file_size_bytes != null ? formatBytes(clip.file_size_bytes) : "\u2014"}</span>
            <span>{clip.duration_secs != null ? formatDuration(clip.duration_secs) : "\u2014"}</span>
            <span>{formatDateTime(clip.created_at)}</span>
          </div>
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Filter options derived from data
   -------------------------------------------------------------------------- */

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "generated", label: "Generated" },
  { value: "imported", label: "Imported" },
];

const QA_STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

/** Build unique sorted scene type options from clip data. */
function buildSceneTypeOptions(clips: ClipBrowseItem[] | undefined) {
  if (!clips) return [{ value: "", label: "All Scene Types" }];
  const names = [...new Set(clips.map((c) => c.scene_type_name).filter(Boolean))].sort();
  return [
    { value: "", label: "All Scene Types" },
    ...names.map((n) => ({ value: n, label: n })),
  ];
}

/** Build unique sorted track options from clip data. */
function buildTrackOptions(clips: ClipBrowseItem[] | undefined) {
  if (!clips) return [{ value: "", label: "All Tracks" }];
  const names = [...new Set(clips.map((c) => c.track_name).filter(Boolean))].sort();
  return [
    { value: "", label: "All Tracks" },
    ...names.map((n) => ({ value: n, label: n })),
  ];
}

/* --------------------------------------------------------------------------
   Page
   -------------------------------------------------------------------------- */

export function ScenesPage() {
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [qaStatusFilter, setQaStatusFilter] = useState<string>("");
  const [sceneTypeFilter, setSceneTypeFilter] = useState<string>("");
  const [trackFilter, setTrackFilter] = useState<string>("");
  const [playingClip, setPlayingClip] = useState<SceneVideoVersion | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);

  const { data: projects } = useProjects();
  const projectId = projectFilter ? Number(projectFilter) : undefined;
  const { data: clips, isLoading } = useClipsBrowse(projectId);

  const projectOptions = useMemo(
    () => [{ value: "", label: "All Projects" }, ...toSelectOptions(projects)],
    [projects],
  );

  const sceneTypeOptions = useMemo(() => buildSceneTypeOptions(clips), [clips]);
  const trackOptions = useMemo(() => buildTrackOptions(clips), [clips]);

  const filteredClips = useMemo(() => {
    if (!clips) return [];
    return clips.filter((c) => {
      if (!showDisabled && !c.character_is_enabled) return false;
      if (sourceFilter && c.source !== sourceFilter) return false;
      if (qaStatusFilter && c.qa_status !== qaStatusFilter) return false;
      if (sceneTypeFilter && c.scene_type_name !== sceneTypeFilter) return false;
      if (trackFilter && c.track_name !== trackFilter) return false;
      return true;
    });
  }, [clips, showDisabled, sourceFilter, qaStatusFilter, sceneTypeFilter, trackFilter]);

  /** Convert a browse item to SceneVideoVersion for the playback modal. */
  const toPlayable = (clip: ClipBrowseItem): SceneVideoVersion => ({
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
  });

  return (
    <Stack gap={6}>
      <PageHeader
        title="Scenes"
        description="Browse all generated scene clips, most recent first."
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Select
            label="Project"
            size="sm"
            options={projectOptions}
            value={projectFilter}
            onChange={setProjectFilter}
          />
        </div>
        <div className="w-40">
          <Select
            label="Source"
            size="sm"
            options={SOURCE_OPTIONS}
            value={sourceFilter}
            onChange={setSourceFilter}
          />
        </div>
        <div className="w-36">
          <Select
            label="QA Status"
            size="sm"
            options={QA_STATUS_OPTIONS}
            value={qaStatusFilter}
            onChange={setQaStatusFilter}
          />
        </div>
        <div className="w-44">
          <Select
            label="Scene Type"
            size="sm"
            options={sceneTypeOptions}
            value={sceneTypeFilter}
            onChange={setSceneTypeFilter}
          />
        </div>
        <div className="w-36">
          <Select
            label="Track"
            size="sm"
            options={trackOptions}
            value={trackFilter}
            onChange={setTrackFilter}
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={showDisabled ? <EyeOff size={14} /> : <Eye size={14} />}
          onClick={() => setShowDisabled((p) => !p)}
        >
          {showDisabled ? "Hide Disabled" : "Show Disabled"}
        </Button>
        <span className="text-xs text-[var(--color-text-muted)] pb-2">
          {filteredClips.length}{clips && filteredClips.length !== clips.length ? ` of ${clips.length}` : ""} clip{filteredClips.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
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
                  to: "/projects/$projectId/characters/$characterId",
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

/**
 * Annotations Browse Page — browse all annotated frames across projects.
 *
 * Grid of annotation cards. Clicking a card opens the shared ClipPlaybackModal
 * showing the video with annotation overlay and editing tools.
 */

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/domain";
import { ConfirmModal } from "@/components/composite";
import { PageHeader, Stack } from "@/components/layout";
import { Button, FilterSelect, SearchInput, Toggle, ContextLoader } from "@/components/primitives";
import { useAnnotationsBrowse, useDeleteBrowseAnnotation } from "@/features/annotations";
import type { AnnotatedItem } from "@/features/annotations";
import { getStreamUrl } from "@/features/video-player/hooks/use-video-metadata";
import { ClipPlaybackModal } from "@/features/scenes/ClipPlaybackModal";
import type { SceneVideoVersion } from "@/features/scenes/types";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { formatRelative } from "@/lib/format";
import { toSelectOptions } from "@/lib/select-utils";
import { ArrowDown, Edit3, Trash2 } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/**
 * Build a minimal SceneVideoVersion shim from an AnnotatedItem so the shared
 * ClipPlaybackModal can render the clip. Fields not available from the browse
 * endpoint are filled with safe defaults.
 */
function toClipShim(item: AnnotatedItem): SceneVideoVersion {
  return {
    id: item.version_id ?? 0,
    scene_id: item.scene_id,
    version_number: 1,
    source: "generated",
    file_path: item.file_path ?? "",
    file_size_bytes: 1, // non-null so isPurgedClip() returns false
    duration_secs: null,
    width: null,
    height: null,
    frame_rate: null,
    preview_path: item.preview_path,
    video_codec: null,
    is_final: false,
    notes: null,
    qa_status: "pending",
    qa_reviewed_by: null,
    qa_reviewed_at: null,
    qa_rejection_reason: null,
    qa_notes: null,
    generation_snapshot: null,
    file_purged: false,
    deleted_at: null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    annotation_count: item.annotation_count,
    parent_version_id: null,
    clip_index: null,
  };
}

/* --------------------------------------------------------------------------
   Annotation Card
   -------------------------------------------------------------------------- */

function AnnotationCard({
  item,
  onClick,
  onDelete,
}: {
  item: AnnotatedItem;
  onClick: () => void;
  onDelete: () => void;
}) {
  const streamUrl = item.version_id
    ? getStreamUrl("version", item.version_id, "proxy")
    : null;

  return (
    <div className="group relative flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden transition-shadow hover:shadow-[var(--shadow-md)]">
      {/* Delete button */}
      <button
        type="button"
        title="Delete annotation"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-1.5 left-1.5 z-10 rounded-[2px] bg-red-600/80 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 cursor-pointer"
      >
        <Trash2 size={10} />
      </button>

      {/* Clickable card body */}
      <button
        type="button"
        onClick={onClick}
        className="flex flex-col text-left w-full focus:outline-none"
      >
        {/* Thumbnail */}
        <div className="relative aspect-video w-full bg-[var(--color-surface-secondary)] flex items-center justify-center overflow-hidden">
          {streamUrl ? (
            <video
              src={streamUrl}
              className="h-full w-full object-cover"
              preload="metadata"
              muted
            />
          ) : (
            <Edit3 size={24} className="text-[var(--color-text-muted)] opacity-30" />
          )}
          {/* Overlays */}
          <div className="absolute top-1.5 right-1.5 flex gap-1">
            <span className="font-mono text-[10px] text-[var(--color-text-primary)] bg-[var(--color-surface-badge-overlay)] px-1 py-px rounded-[2px]">
              f{item.frame_number}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-data-cyan)] bg-[var(--color-surface-badge-overlay)] px-1 py-px rounded-[2px]">
              {item.annotation_count}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-col gap-0.5 px-2 py-1.5 font-mono">
          <span className="text-xs text-[var(--color-text-primary)] truncate">
            {item.avatar_name}
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)] truncate">
            {item.scene_type_name}
          </span>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-text-muted)] truncate">
              {item.project_name}
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">
              {formatRelative(item.created_at)}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Sort options
   -------------------------------------------------------------------------- */

const SORT_OPTIONS = [
  { value: "created_at", label: "Most Recent" },
  { value: "avatar_name", label: "Avatar Name" },
] as const;

/* --------------------------------------------------------------------------
   Annotations Page
   -------------------------------------------------------------------------- */

/** Scene status IDs that indicate the scene is "complete" (approved/delivered). */
const COMPLETED_SCENE_STATUSES = new Set([4, 6]);

export function AnnotationsPage() {
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [avatarSearch, setAvatarSearch] = useState("");
  const [sort, setSort] = useState<"created_at" | "avatar_name">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedItem, setSelectedItem] = useState<AnnotatedItem | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnnotatedItem | null>(null);

  const pipelineCtx = usePipelineContextSafe();
  const { data: projects } = useProjects(pipelineCtx?.pipelineId);
  const deleteMutation = useDeleteBrowseAnnotation();

  const projectId = projectFilter ? Number(projectFilter) : undefined;
  const { data: items, isLoading } = useAnnotationsBrowse({
    projectId,
    pipelineId: pipelineCtx?.pipelineId,
    sort,
    sortDir,
  });

  // Filter by avatar name and completed status
  const filteredItems = items?.filter((item) => {
    if (avatarSearch && !item.avatar_name.toLowerCase().includes(avatarSearch.toLowerCase())) {
      return false;
    }
    if (!showCompleted && COMPLETED_SCENE_STATUSES.has(item.scene_status_id)) {
      return false;
    }
    return true;
  });

  const completedCount = items?.filter((item) => COMPLETED_SCENE_STATUSES.has(item.scene_status_id)).length ?? 0;

  const projectOptions = [
    { value: "", label: "All Projects" },
    ...toSelectOptions(projects),
  ];

  // Build a SceneVideoVersion shim + meta for the shared ClipPlaybackModal
  const selectedClip = useMemo(
    () => (selectedItem?.version_id ? toClipShim(selectedItem) : null),
    [selectedItem],
  );

  const selectedMeta = useMemo(
    () =>
      selectedItem
        ? {
            projectName: selectedItem.project_name,
            avatarName: selectedItem.avatar_name,
            sceneTypeName: selectedItem.scene_type_name,
            trackName: "",
          }
        : undefined,
    [selectedItem],
  );

  return (
    <Stack gap={6}>
      <PageHeader
        title="Annotations"
        description="Browse all frame annotations across projects and avatars."
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          options={projectOptions}
          value={projectFilter}
          onChange={setProjectFilter}
          className="w-44"
        />
        <SearchInput
          placeholder="Search avatar..."
          value={avatarSearch}
          onChange={(e) => setAvatarSearch(e.target.value)}
          className="w-48"
        />
        <FilterSelect
          options={[...SORT_OPTIONS]}
          value={sort}
          onChange={(v) => setSort(v as "created_at" | "avatar_name")}
          className="w-40"
        />
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          icon={<ArrowDown size={12} className={`transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} />}
        >
          {sortDir === "asc" ? "Asc" : "Desc"}
        </Button>
        {completedCount > 0 && (
          <Toggle
            checked={showCompleted}
            onChange={setShowCompleted}
            label={`Completed (${completedCount})`}
            size="sm"
          />
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <ContextLoader size={48} />
        </div>
      ) : !filteredItems?.length ? (
        <EmptyState
          icon={<Edit3 size={32} />}
          title="No annotations found"
          description="No frame annotations match the current filters. Annotations are created when reviewing clips and scene versions."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 min-[1500px]:grid-cols-7 min-[1700px]:grid-cols-8 gap-4">
          {filteredItems.map((item) => (
            <AnnotationCard
              key={item.annotation_id}
              item={item}
              onClick={() => setSelectedItem(item)}
              onDelete={() => setDeleteTarget(item)}
            />
          ))}
        </div>
      )}

      {/* Shared clip playback modal — same player as scenes page */}
      <ClipPlaybackModal
        clip={selectedClip}
        onClose={() => setSelectedItem(null)}
        pipelineId={pipelineCtx?.pipelineId}
        meta={selectedMeta}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Annotation"
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.annotation_id);
          }
          setDeleteTarget(null);
        }}
      >
        {deleteTarget && (
          <p>
            Delete annotation on {deleteTarget.avatar_name} — {deleteTarget.scene_type_name}, frame {deleteTarget.frame_number}?
          </p>
        )}
      </ConfirmModal>
    </Stack>
  );
}

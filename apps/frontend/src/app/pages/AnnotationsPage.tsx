/**
 * Annotations Browse Page — browse all annotated frames across projects.
 *
 * Grid of annotation cards. Clicking a card opens a detail modal showing
 * the video with annotation overlay. From the modal you can navigate to
 * the avatar's scene detail page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useAvatarPath } from "@/hooks/usePipelinePath";
import { EmptyState } from "@/components/domain";
import { ConfirmModal, Modal } from "@/components/composite";
import { PageHeader, Stack } from "@/components/layout";
import { Button, FilterSelect, SearchInput, Toggle ,  WireframeLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { DrawingCanvas } from "@/features/annotations/DrawingCanvas";
import type { DrawingObject } from "@/features/annotations/types";
import { useAnnotationsBrowse, useDeleteBrowseAnnotation } from "@/features/annotations";
import type { AnnotatedItem } from "@/features/annotations";
import { useVersionAnnotations } from "@/features/scenes/hooks/useVersionAnnotations";
import { VideoPlayer } from "@/features/video-player/VideoPlayer";
import { getStreamUrl } from "@/features/video-player/hooks/use-video-metadata";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { formatRelative } from "@/lib/format";
import { toSelectOptions } from "@/lib/select-utils";
import { ArrowDown, ArrowRight, Edit3, Trash2 } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Annotation Detail Modal
   -------------------------------------------------------------------------- */

function AnnotationDetailModal({
  item,
  onClose,
}: {
  item: AnnotatedItem | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const avatarPath = useAvatarPath();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [annotating, setAnnotating] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);

  const sceneId = item?.scene_id ?? 0;
  const versionId = item?.version_id ?? 0;

  const { data: dbAnnotations } = useVersionAnnotations(sceneId, versionId);

  // Measure container width for canvas sizing
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [item]);

  // Reset state when item changes — default to showing annotations since
  // the user opened this from the annotations browser.
  useEffect(() => {
    setAnnotating(true);
    setCurrentFrame(item?.frame_number ?? 0);
  }, [item?.annotation_id, item?.frame_number]);

  const videoHeight = Math.round(containerWidth * (9 / 16));

  // Get annotations for the target frame
  const frameAnnotations: DrawingObject[] =
    dbAnnotations
      ?.filter((a) => a.frame_number === (item?.frame_number ?? 0))
      .flatMap((a) => (a.annotations_json as unknown as DrawingObject[]) ?? []) ?? [];

  // All annotated frames for this version
  const annotatedFrames = [
    ...new Set(dbAnnotations?.map((a) => a.frame_number) ?? []),
  ].sort((a, b) => a - b);

  const handleGoToScene = useCallback(() => {
    if (!item) return;
    navigate({
      to: avatarPath(item.project_id, item.avatar_id) as string,
      search: { tab: "scenes", scene: String(item.scene_id) },
    });
    onClose();
  }, [item, navigate, onClose]);

  // Seek video to a specific frame
  const seekToFrame = useCallback(
    (frameNumber: number) => {
      setCurrentFrame(frameNumber);
      const video = videoContainerRef.current?.querySelector("video");
      if (video) {
        video.pause();
        // Assume 24fps if unknown
        video.currentTime = frameNumber / 24;
      }
      setAnnotating(true);
    },
    [],
  );

  // Once annotations are loaded, wait for video to be ready then pause+seek.
  // Lock currentFrame so VideoPlayer's onFrameChange doesn't override it.
  const seekLockRef = useRef(false);
  const didAutoSeek = useRef(false);

  useEffect(() => {
    didAutoSeek.current = false;
    seekLockRef.current = false;
  }, [item?.annotation_id]);

  const handleVideoFrameChange = useCallback((frame: number) => {
    // Ignore frame changes from the video player while we're holding the seek lock
    if (!seekLockRef.current) {
      setCurrentFrame(frame);
    }
  }, []);

  useEffect(() => {
    if (didAutoSeek.current) return;
    if (!item || !dbAnnotations || dbAnnotations.length === 0) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout>;

    function trySeekAndPause() {
      if (cancelled || didAutoSeek.current) return;
      const video = videoContainerRef.current?.querySelector("video");
      if (!video || video.readyState < 2) {
        pollTimer = setTimeout(trySeekAndPause, 150);
        return;
      }
      didAutoSeek.current = true;
      seekLockRef.current = true;
      video.pause();
      video.currentTime = item!.frame_number / 24;
      setCurrentFrame(item!.frame_number);
      setAnnotating(true);
      // Release the lock after the video has settled
      setTimeout(() => { seekLockRef.current = false; }, 500);
    }

    pollTimer = setTimeout(trySeekAndPause, 200);
    return () => { cancelled = true; clearTimeout(pollTimer); };
  }, [item, dbAnnotations]);

  // Current frame's annotations (when viewing a different frame)
  const currentAnnotations: DrawingObject[] = annotating
    ? dbAnnotations
        ?.filter((a) => a.frame_number === currentFrame)
        .flatMap((a) => (a.annotations_json as unknown as DrawingObject[]) ?? []) ?? []
    : frameAnnotations;

  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={item ? `${item.avatar_name} — ${item.scene_type_name}` : ""}
      size="3xl"
    >
      {item && (
        <div className="flex flex-col gap-4">
          {/* Video + annotation overlay */}
          <div ref={wrapperRef} className="relative">
            {item.version_id ? (
              <>
                <div ref={videoContainerRef}>
                  <VideoPlayer
                    sourceType="version"
                    sourceId={item.version_id}
                    showControls
                    onFrameChange={handleVideoFrameChange}
                  />
                </div>
                {annotating && containerWidth > 0 && videoHeight > 0 && currentAnnotations.length > 0 && (
                  <div
                    className="absolute top-0 left-0 z-10 pointer-events-none"
                    style={{ width: containerWidth, height: videoHeight }}
                  >
                    <DrawingCanvas
                      key={`canvas-${currentFrame}-${currentAnnotations.length}`}
                      width={containerWidth}
                      height={videoHeight}
                      existingAnnotations={currentAnnotations}
                      editable={false}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center aspect-video bg-[var(--color-surface-secondary)] rounded">
                <Edit3 size={48} className="text-[var(--color-text-muted)]" />
              </div>
            )}
          </div>

          {/* Annotated frames indicator */}
          {annotatedFrames.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                frames
              </span>
              <div className="flex flex-wrap gap-1">
                {annotatedFrames.map((frame) => (
                  <button
                    key={frame}
                    type="button"
                    className={cn(
                      "rounded-[2px] px-1.5 py-0.5 font-mono text-[11px] transition-colors",
                      currentFrame === frame
                        ? "bg-cyan-400/20 text-cyan-400"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22]",
                    )}
                    onClick={() => seekToFrame(frame)}
                  >
                    {frame}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Toggle annotation overlay */}
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant={annotating ? "primary" : "secondary"}
              onClick={() => setAnnotating((v) => !v)}
              icon={<Edit3 size={12} />}
            >
              {annotating ? "Hide" : "Show"}
            </Button>
            {annotating && (
              <span className="font-mono text-xs text-cyan-400">
                frame {currentFrame} · {currentAnnotations.length} mark{currentAnnotations.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Context info + navigation */}
          <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border-default)]">
            <div className="flex flex-col gap-0.5 font-mono text-xs">
              <span className="text-[var(--color-text-primary)]">
                {item.avatar_name}
              </span>
              <span className="text-[var(--color-text-muted)]">
                {item.project_name} · {item.scene_type_name}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {formatRelative(item.created_at)}
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleGoToScene}
              icon={<ArrowRight size={12} />}
            >
              Scene
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
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
    <div className="group relative flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] overflow-hidden transition-shadow hover:shadow-[var(--shadow-md)]">
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
        <div className="relative aspect-video w-full bg-[#161b22] flex items-center justify-center overflow-hidden">
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
            <span className="font-mono text-[10px] text-[var(--color-text-primary)] bg-black/60 px-1 py-px rounded-[2px]">
              f{item.frame_number}
            </span>
            <span className="font-mono text-[10px] text-cyan-400 bg-black/60 px-1 py-px rounded-[2px]">
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
          <WireframeLoader size={48} />
        </div>
      ) : !filteredItems?.length ? (
        <EmptyState
          icon={<Edit3 size={32} />}
          title="No annotations found"
          description="No frame annotations match the current filters. Annotations are created when reviewing clips and scene versions."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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

      {/* Detail modal */}
      <AnnotationDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
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

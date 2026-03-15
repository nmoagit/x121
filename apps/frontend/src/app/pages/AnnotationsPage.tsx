/**
 * Annotations Browse Page — browse all annotated frames across projects.
 *
 * Grid of annotation cards. Clicking a card opens a detail modal showing
 * the video with annotation overlay. From the modal you can navigate to
 * the character's scene detail page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState } from "@/components/domain";
import { ConfirmModal, Modal } from "@/components/composite";
import { PageHeader, Stack } from "@/components/layout";
import { Badge, Button, Input, Select, Spinner } from "@/components/primitives";
import { DrawingCanvas } from "@/features/annotations/DrawingCanvas";
import type { DrawingObject } from "@/features/annotations/types";
import { useAnnotationsBrowse, useDeleteBrowseAnnotation } from "@/features/annotations";
import type { AnnotatedItem } from "@/features/annotations";
import { useVersionAnnotations } from "@/features/scenes/hooks/useVersionAnnotations";
import { VideoPlayer } from "@/features/video-player/VideoPlayer";
import { getStreamUrl } from "@/features/video-player/hooks/use-video-metadata";
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

  // Reset state when item changes
  useEffect(() => {
    setAnnotating(false);
    setCurrentFrame(0);
  }, [item?.annotation_id]);

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
      to: `/projects/${item.project_id}/characters/${item.character_id}`,
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

  // On open, seek to the annotated frame
  useEffect(() => {
    if (item && item.version_id && containerWidth > 0) {
      // Small delay to let the video element mount
      const timer = setTimeout(() => seekToFrame(item.frame_number), 300);
      return () => clearTimeout(timer);
    }
  }, [item, containerWidth, seekToFrame]);

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
      title={item ? `${item.character_name} — ${item.scene_type_name}` : ""}
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
                    onFrameChange={setCurrentFrame}
                  />
                </div>
                {annotating && containerWidth > 0 && videoHeight > 0 && (
                  <div
                    className="absolute top-0 left-0 z-10 pointer-events-none"
                    style={{ width: containerWidth, height: videoHeight }}
                  >
                    <DrawingCanvas
                      key={`canvas-${currentFrame}`}
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
              <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                Annotated frames:
              </span>
              <div className="flex flex-wrap gap-1">
                {annotatedFrames.map((frame) => (
                  <button
                    key={frame}
                    type="button"
                    className={`rounded px-1.5 py-0.5 text-xs font-mono transition-colors ${
                      currentFrame === frame
                        ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
                        : "bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
                    }`}
                    onClick={() => seekToFrame(frame)}
                  >
                    F{frame}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Toggle annotation overlay */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={annotating ? "primary" : "secondary"}
              onClick={() => setAnnotating((v) => !v)}
            >
              <Edit3 size={14} />
              {annotating ? "Hide Annotations" : "Show Annotations"}
            </Button>
            {annotating && (
              <Badge variant="info" size="sm">
                Frame {currentFrame} — {currentAnnotations.length} mark{currentAnnotations.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {/* Context info + navigation */}
          <div className="flex items-center justify-between border-t border-[var(--color-border-default)] pt-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                {item.character_name}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {item.project_name} — {item.scene_type_name}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {formatRelative(item.created_at)}
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleGoToScene}
            >
              <ArrowRight size={14} />
              Go to Scene
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
    <div className="group relative flex flex-col rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden transition-colors hover:border-[var(--color-action-primary)]">
      {/* Delete button */}
      <button
        type="button"
        title="Delete annotation"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2 left-2 z-10 rounded bg-red-600/80 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 cursor-pointer backdrop-blur-sm"
      >
        <Trash2 size={12} />
      </button>

      {/* Clickable card body */}
      <button
        type="button"
        onClick={onClick}
        className="flex flex-col text-left w-full focus:outline-none focus:ring-2 focus:ring-[var(--color-action-primary)]"
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
            <Edit3 size={32} className="text-[var(--color-text-muted)]" />
          )}
          {/* Badges */}
          <div className="absolute top-2 right-2 flex gap-1">
            <span className="rounded bg-[var(--color-surface-primary)]/80 px-1.5 py-0.5 text-xs font-medium text-[var(--color-text-primary)] backdrop-blur-sm">
              F{item.frame_number}
            </span>
            <span className="rounded bg-[var(--color-action-primary)]/80 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              {item.annotation_count}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1 p-3">
          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
            {item.character_name}
          </span>
          <span className="text-xs text-[var(--color-text-secondary)] truncate">
            {item.scene_type_name}
          </span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-[var(--color-text-muted)] truncate">
              {item.project_name}
            </span>
            <span className="text-xs text-[var(--color-text-muted)] shrink-0">
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
  { value: "character_name", label: "Character Name" },
] as const;

/* --------------------------------------------------------------------------
   Annotations Page
   -------------------------------------------------------------------------- */

/** Scene status IDs that indicate the scene is "complete" (approved/delivered). */
const COMPLETED_SCENE_STATUSES = new Set([4, 6]);

export function AnnotationsPage() {
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [characterSearch, setCharacterSearch] = useState("");
  const [sort, setSort] = useState<"created_at" | "character_name">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedItem, setSelectedItem] = useState<AnnotatedItem | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnnotatedItem | null>(null);

  const { data: projects } = useProjects();
  const deleteMutation = useDeleteBrowseAnnotation();

  const projectId = projectFilter ? Number(projectFilter) : undefined;
  const { data: items, isLoading } = useAnnotationsBrowse({
    projectId,
    sort,
    sortDir,
  });

  // Filter by character name and completed status
  const filteredItems = items?.filter((item) => {
    if (characterSearch && !item.character_name.toLowerCase().includes(characterSearch.toLowerCase())) {
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
        description="Browse all frame annotations across projects and characters."
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Select
            label="Project"
            options={projectOptions}
            value={projectFilter}
            onChange={setProjectFilter}
          />
        </div>
        <div className="w-56">
          <Input
            label="Character"
            placeholder="Search character name..."
            value={characterSearch}
            onChange={(e) => setCharacterSearch(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Select
            label="Sort by"
            options={[...SORT_OPTIONS]}
            value={sort}
            onChange={(v) => setSort(v as "created_at" | "character_name")}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
        >
          <ArrowDown
            size={14}
            className={`transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`}
          />
          {sortDir === "asc" ? "Asc" : "Desc"}
        </Button>
        {completedCount > 0 && (
          <Button
            variant={showCompleted ? "primary" : "secondary"}
            size="sm"
            onClick={() => setShowCompleted((v) => !v)}
          >
            {showCompleted ? "Hide Completed" : `Show Completed (${completedCount})`}
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
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
            Delete annotation on {deleteTarget.character_name} — {deleteTarget.scene_type_name}, frame {deleteTarget.frame_number}?
          </p>
        )}
      </ConfirmModal>
    </Stack>
  );
}

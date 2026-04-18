import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Modal } from "@/components/composite";
import { NotesModal } from "@/components/domain/NotesModal";
import type { TagInfo } from "@/components/domain/TagChip";
import { TagInput } from "@/components/domain/TagInput";
import { Button, Chip, Input, Tooltip } from "@/components/primitives";
import { AnnotationPresetManager } from "@/features/annotations/AnnotationPresetManager";
import { DrawingCanvas } from "@/features/annotations/DrawingCanvas";
import { useAnnotationPresets } from "@/features/annotations/hooks/use-annotation-presets";
import type { DrawingObject } from "@/features/annotations/types";
import { getStreamUrl } from "@/features/video-player";
import { TranscodeOverlay } from "@/features/video-player/TranscodeOverlay";
import { VideoPlayer } from "@/features/video-player/VideoPlayer";
import { api } from "@/lib/api";
import { slugify } from "@/lib/format";
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Maximize2,
  Minimize2,
  Settings,
  Trash2,
  X,
  XCircle,
} from "@/tokens/icons";

import {
  TYPO_DATA,
  TYPO_DATA_CYAN,
  TYPO_DATA_MUTED,
  TYPO_TIMESTAMP,
} from "@/lib/typography-tokens";
import { GenerationSnapshotPanel } from "./GenerationSnapshotPanel";
import {
  useDeleteVersionFrameAnnotation,
  useUpsertVersionAnnotation,
  useVersionAnnotations,
} from "./hooks/useVersionAnnotations";
import {
  type FrameAnnotationEntry,
  useClipAnnotationsStore,
} from "./stores/useClipAnnotationsStore";
import { type SceneVideoVersion, isPurgedClip } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ClipPlaybackModalProps {
  clip: SceneVideoVersion | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  /** Pipeline ID for pipeline-scoped labels. */
  pipelineId?: number;
  /** Extra context for the modal header and export filename. */
  meta?: {
    projectName: string;
    avatarName: string;
    sceneTypeName: string;
    trackName: string;
  };
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ClipPlaybackModal({
  clip,
  onClose,
  onPrev,
  onNext,
  onApprove,
  onReject,
  pipelineId,
  meta,
}: ClipPlaybackModalProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [clipTags, setClipTags] = useState<TagInfo[]>([]);
  const [clipNotes, setClipNotes] = useState("");
  const [clipNotesSaving, setClipNotesSaving] = useState(false);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [annotationNote, setAnnotationNote] = useState("");
  const [activeLoopRange, setActiveLoopRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  const playerControlRef = useRef<
    import("@/features/video-player/VideoPlayer").VideoPlayerControl | null
  >(null);
  const [presetManagerOpen, setPresetManagerOpen] = useState(false);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [canvasInitialTool, setCanvasInitialTool] = useState<"pen" | "text">("pen");
  /** Set of annotation frame numbers that are toggled visible. All visible by default. */
  const [hiddenAnnotationFrames, setHiddenAnnotationFrames] = useState<Set<number>>(new Set());
  /** Mark currently being hovered for deletion — highlighted on the canvas overlay. */
  const [highlightedMark, setHighlightedMark] = useState<{
    frameNumber: number;
    markIndex: number;
  } | null>(null);

  // Load existing tags + notes when clip changes
  useEffect(() => {
    if (!clip) {
      setClipTags([]);
      setClipNotes("");
      return;
    }
    setClipNotes(clip.notes ?? "");
    api
      .get<TagInfo[]>(`/entities/scene_video_version/${clip.id}/tags`)
      .then(setClipTags)
      .catch(() => setClipTags([]));
  }, [clip?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [currentFrame, setCurrentFrame] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const annotatingFrameRef = useRef(0);
  /** Tracks frames that have unsaved local changes. */
  const dirtyFramesRef = useRef(new Set<number>());
  /** Tracks how many annotations existed when annotation mode started for the current frame. */
  const existingCountRef = useRef(0);
  /** Snapshot of existing annotations when annotation mode started (prevents reactive duplication). */
  const existingSnapshotRef = useRef<DrawingObject[]>([]);

  const clipId = clip?.id ?? 0;
  const sceneId = clip?.scene_id ?? 0;

  // ---- Zustand local store (fast, real-time editing) ----
  const frameAnnotations = useClipAnnotationsStore((s) => s.getForClip(clipId));
  const setForClip = useClipAnnotationsStore((s) => s.setForClip);

  // ---- DB persistence via TanStack Query ----
  const { data: dbAnnotations } = useVersionAnnotations(sceneId, clipId);
  const upsertMutation = useUpsertVersionAnnotation(sceneId, clipId);
  const deleteMutation = useDeleteVersionFrameAnnotation(sceneId, clipId);

  // Seed Zustand store from DB when data arrives (only if store is empty for this clip).
  useEffect(() => {
    if (!dbAnnotations?.length || clipId === 0) return;
    const current = useClipAnnotationsStore.getState().getForClip(clipId);
    if (current.length > 0) return; // already have local data, don't overwrite

    const entries: FrameAnnotationEntry[] = dbAnnotations.map((a) => ({
      frameNumber: a.frame_number,
      frameEnd: a.frame_end ?? null,
      annotations: a.annotations_json as unknown as DrawingObject[],
      note: a.note ?? null,
    }));
    useClipAnnotationsStore.getState().setForClip(clipId, entries);
  }, [dbAnnotations, clipId]);

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
  }, [clip]);

  const videoHeight = Math.round(containerWidth * (9 / 16));

  // Reset UI state when clip changes
  useEffect(() => {
    setAnnotating(false);
    setCurrentFrame(0);
    setRangeEnd(null);
    setAnnotationNote("");
    annotatingFrameRef.current = 0;
    dirtyFramesRef.current = new Set();
  }, [clipId]);

  const getVideoEl = useCallback(
    () => videoContainerRef.current?.querySelector("video") ?? null,
    [],
  );

  const pauseVideo = useCallback(() => {
    const video = getVideoEl();
    if (video && !video.paused) video.pause();
  }, [getVideoEl]);

  /** Save a specific dirty frame to the DB. */
  const saveFrame = useCallback(
    (frameNumber: number, overrideFrameEnd?: number | null, overrideNote?: string) => {
      if (clipId === 0) return;
      const current = useClipAnnotationsStore.getState().getForClip(clipId);
      const entry = current.find((e) => e.frameNumber === frameNumber);
      upsertMutation.mutate({
        frameNumber,
        annotations: entry?.annotations ?? [],
        frameEnd: overrideFrameEnd !== undefined ? overrideFrameEnd : entry?.frameEnd,
        note: overrideNote !== undefined ? overrideNote : (entry?.note ?? undefined),
      });
      dirtyFramesRef.current.delete(frameNumber);
    },
    [clipId, upsertMutation],
  );

  /** Save all dirty frames to the DB. */
  const saveAllDirty = useCallback(() => {
    for (const frame of dirtyFramesRef.current) {
      saveFrame(frame);
    }
    dirtyFramesRef.current = new Set();
  }, [saveFrame]);

  const prevSpeedRef = useRef<number>(1);

  const enterAnnotation = useCallback(() => {
    pauseVideo();
    // Set playback speed to 0.5x for annotation mode
    const video = getVideoEl();
    if (video) {
      prevSpeedRef.current = video.playbackRate;
      video.playbackRate = 0.5;
    }
    annotatingFrameRef.current = currentFrame;
    const current = useClipAnnotationsStore.getState().getForClip(clipId);
    const entry = current.find((e) => e.frameNumber === currentFrame);
    const existing = entry?.annotations ?? [];
    existingCountRef.current = existing.length;
    existingSnapshotRef.current = existing;
    setRangeEnd(entry?.frameEnd ?? null);
    setAnnotationNote(entry?.note ?? "");
    setCanvasInitialTool("pen");
    setAnnotating(true);
  }, [pauseVideo, getVideoEl, currentFrame, clipId]);

  const exitAnnotation = useCallback(() => {
    setAnnotating(false);
    // Restore previous playback speed
    const video = getVideoEl();
    if (video) video.playbackRate = prevSpeedRef.current;
    const frame = annotatingFrameRef.current;
    const current = useClipAnnotationsStore.getState().getForClip(clipId);
    const idx = current.findIndex((e) => e.frameNumber === frame);
    const hasContent =
      (idx >= 0 && current[idx]!.annotations.length > 0) ||
      annotationNote.trim() ||
      rangeEnd !== null;
    if (idx >= 0) {
      const next = [...current];
      next[idx] = { ...next[idx]!, frameEnd: rangeEnd, note: annotationNote || null };
      setForClip(clipId, next);
    } else if (hasContent) {
      // Create entry for note/range-only annotations
      setForClip(clipId, [
        ...current,
        { frameNumber: frame, frameEnd: rangeEnd, annotations: [], note: annotationNote || null },
      ]);
    }
    // Save if there's any content
    if (hasContent) {
      saveFrame(frame, rangeEnd, annotationNote || undefined);
    }
  }, [saveFrame, getVideoEl, clipId, rangeEnd, annotationNote, setForClip]);

  /** Add a text annotation to the current frame and save immediately. */
  const addTextAnnotation = useCallback(
    (text: string) => {
      if (!text.trim() || clipId === 0) return;
      const frame = annotatingFrameRef.current;
      const current = useClipAnnotationsStore.getState().getForClip(clipId);
      const entry = current.find((e) => e.frameNumber === frame);

      // Position: near last annotation, or center of video (0.5, 0.5 in normalized coords)
      let posX = 0.5;
      let posY = 0.5;
      if (entry && entry.annotations.length > 0) {
        const last = entry.annotations[entry.annotations.length - 1]!;
        const d = last.data as Record<string, unknown>;
        // Offset slightly below the last annotation
        posX = (d.x as number | undefined) ?? (d.startX as number | undefined) ?? 0.5;
        posY = ((d.y as number | undefined) ?? (d.startY as number | undefined) ?? 0.5) + 0.05;
      }

      const textObj: DrawingObject = {
        tool: "text",
        data: { x: posX, y: posY, content: text.trim(), fontSize: 16 },
        color: "#FF0000",
        strokeWidth: 0,
      };

      const existingAnnotations = entry?.annotations ?? [];
      const merged = [...existingAnnotations, textObj];
      const idx = current.findIndex((e) => e.frameNumber === frame);
      if (idx >= 0) {
        const next = [...current];
        next[idx] = { ...next[idx]!, annotations: merged, note: text.trim() };
        setForClip(clipId, next);
      } else {
        setForClip(clipId, [
          ...current,
          { frameNumber: frame, frameEnd: rangeEnd, annotations: merged, note: text.trim() },
        ]);
      }
      // Update refs and force canvas remount in text mode
      existingCountRef.current = merged.length;
      existingSnapshotRef.current = merged;
      setCanvasInitialTool("text");
      setCanvasVersion((v) => v + 1);

      saveFrame(frame, rangeEnd, text.trim());
    },
    [clipId, rangeEnd, setForClip, saveFrame],
  );

  // Called by DrawingCanvas when its undoStack changes (including undo/redo).
  // `newAnnotations` contains only user-drawn items from the current session,
  // so we must merge them with the snapshot taken when annotation mode started.
  const handleAnnotationsChange = useCallback(
    (annotations: DrawingObject[]) => {
      const frame = annotatingFrameRef.current;
      dirtyFramesRef.current.add(frame);

      // Canvas sends the complete final list (existing minus moved + user-drawn).
      // Store it directly — no merge needed.
      const current = useClipAnnotationsStore.getState().getForClip(clipId);

      if (annotations.length === 0) {
        setForClip(
          clipId,
          current.filter((e) => e.frameNumber !== frame),
        );
      } else {
        const idx = current.findIndex((e) => e.frameNumber === frame);
        if (idx >= 0) {
          const next = [...current];
          next[idx] = { ...next[idx]!, frameNumber: frame, annotations };
          setForClip(clipId, next);
        } else {
          setForClip(clipId, [
            ...current,
            { frameNumber: frame, frameEnd: null, annotations, note: null },
          ]);
        }
      }
    },
    [clipId, setForClip],
  );

  const handleFrameSelect = useCallback(
    (frameNumber: number) => {
      // Save current frame before switching
      if (dirtyFramesRef.current.has(annotatingFrameRef.current)) {
        saveFrame(annotatingFrameRef.current);
      }
      // Delegate to the player so seeks use the REAL framerate from video metadata,
      // not clip.frame_rate (which is null for shims built on AnnotationsPage).
      playerControlRef.current?.pause();
      playerControlRef.current?.seekToFrame(frameNumber);
      annotatingFrameRef.current = frameNumber;
      const current = useClipAnnotationsStore.getState().getForClip(clipId);
      const entry = current.find((e) => e.frameNumber === frameNumber);
      const existing = entry?.annotations ?? [];
      existingCountRef.current = existing.length;
      existingSnapshotRef.current = existing;
      setRangeEnd(entry?.frameEnd ?? null);
      setAnnotationNote(entry?.note ?? "");
      setAnnotating(true);
    },
    [clipId, saveFrame],
  );

  /** Delete all annotations for a specific frame (local store + DB). */
  const handleDeleteFrameAnnotation = useCallback(
    (frameNumber: number) => {
      const current = useClipAnnotationsStore.getState().getForClip(clipId);
      setForClip(
        clipId,
        current.filter((e) => e.frameNumber !== frameNumber),
      );
      dirtyFramesRef.current.delete(frameNumber);
      deleteMutation.mutate(frameNumber);
      // If we're currently annotating the deleted frame, exit annotation mode
      if (annotating && annotatingFrameRef.current === frameNumber) {
        setAnnotating(false);
      }
    },
    [clipId, setForClip, deleteMutation, annotating],
  );

  /** Delete a single mark (drawing object) from a frame's annotations by index. */
  const handleDeleteMark = useCallback(
    (frameNumber: number, markIndex: number) => {
      const current = useClipAnnotationsStore.getState().getForClip(clipId);
      const updated = current
        .map((e) => {
          if (e.frameNumber !== frameNumber) return e;
          const remaining = e.annotations.filter((_, i) => i !== markIndex);
          return { ...e, annotations: remaining };
        })
        .filter((e) => e.annotations.length > 0 || e.note);

      if (updated.find((e) => e.frameNumber === frameNumber)) {
        // Still has marks or a note — update in store and save
        setForClip(clipId, updated);
        dirtyFramesRef.current.add(frameNumber);
        saveFrame(frameNumber);
      } else {
        // No marks or note left — delete the entire frame annotation
        handleDeleteFrameAnnotation(frameNumber);
      }
    },
    [clipId, setForClip, saveFrame, handleDeleteFrameAnnotation],
  );

  // Save clip notes to DB and update cache.
  const saveClipNotes = useCallback(
    (value: string) => {
      if (clipId === 0) return;
      setClipNotesSaving(true);
      api
        .put(`/scenes/${sceneId}/versions/${clipId}`, { notes: value })
        .then(() => {
          queryClient.setQueriesData({ queryKey: ["scene-versions"] }, (old: unknown) => {
            if (!old || typeof old !== "object") return old;
            const page = old as { items?: { id: number; notes?: string }[] };
            if (page.items) {
              return {
                ...page,
                items: page.items.map((item) =>
                  item.id === clipId ? { ...item, notes: value } : item,
                ),
              };
            }
            return old;
          });
        })
        .finally(() => setClipNotesSaving(false));
    },
    [clipId, sceneId, queryClient],
  );

  // Save all dirty frames on modal close
  const handleClose = useCallback(() => {
    saveAllDirty();
    onClose();
  }, [saveAllDirty, onClose]);

  // Keyboard navigation: left/right arrows for prev/next
  useEffect(() => {
    if (!clip) return;
    const handler = (e: KeyboardEvent) => {
      if (annotating) return;
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        saveAllDirty();
        onPrev();
      }
      if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        saveAllDirty();
        onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clip, annotating, onPrev, onNext, saveAllDirty]);

  // Use the snapshot taken when annotation mode started, not the reactive store value,
  // to prevent double-counting annotations that the canvas also has in its undoStack.
  const existingForFrame = existingSnapshotRef.current;

  const sortedAnnotations = [...frameAnnotations].sort((a, b) => a.frameNumber - b.frameNumber);

  const canvasKey = `canvas-${annotatingFrameRef.current}-${canvasVersion}`;

  // Compute annotation ranges for the timeline
  const annotationRanges = useMemo(
    () =>
      frameAnnotations
        .filter((e) => e.frameEnd !== null && e.frameEnd > e.frameNumber)
        .map((e) => ({ start: e.frameNumber, end: e.frameEnd as number })),
    [frameAnnotations],
  );

  // Annotation presets
  const { data: presets = [] } = useAnnotationPresets(pipelineId);

  /** Format frame label for an annotation entry. */
  const frameLabel = (entry: FrameAnnotationEntry) =>
    entry.frameEnd !== null && entry.frameEnd > entry.frameNumber
      ? `F${entry.frameNumber}-${entry.frameEnd}`
      : `F${entry.frameNumber}`;

  return (
    <Modal
      open={clip !== null}
      onClose={handleClose}
      title={
        clip
          ? meta
            ? `${meta.projectName} / ${meta.avatarName} — ${meta.sceneTypeName} — ${meta.trackName} — v${clip.version_number}`
            : `Clip v${clip.version_number}`
          : ""
      }
      size={expanded ? "full" : "3xl"}
    >
      {clip && (
        <div className="flex flex-col gap-[var(--spacing-3)]">
          {/* Derived clip context badge */}
          {clip.parent_version_id != null && (
            <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)]">
              <span className="text-[var(--color-data-cyan)]">
                derived from v{clip.parent_version_id}
              </span>
              {clip.clip_index != null && (
                <>
                  <span className="opacity-30">|</span>
                  <span>chunk {clip.clip_index}</span>
                </>
              )}
            </div>
          )}
          {/* Video + annotation overlay */}
          <div
            ref={wrapperRef}
            className="group/video relative"
            onDoubleClick={() => setExpanded((v) => !v)}
          >
            {isPurgedClip(clip) ? (
              <div className="flex h-48 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
                <div className="flex flex-col items-center gap-2 text-[var(--color-text-muted)]">
                  <X size={32} />
                  <span className={TYPO_DATA}>Video file has been purged from disk</span>
                  <span className={TYPO_DATA_MUTED}>
                    Metadata and generation parameters are still available below.
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div ref={videoContainerRef}>
                  {clip.transcode_state === "completed" ? (
                    <VideoPlayer
                      sourceType="version"
                      sourceId={clip.id}
                      quality="full"
                      autoPlay
                      showControls
                      annotationRanges={annotationRanges}
                      controlRef={playerControlRef}
                      onFrameChange={setCurrentFrame}
                    />
                  ) : (
                    <div className="relative h-96 w-full">
                      <TranscodeOverlay
                        state={clip.transcode_state}
                        error={clip.transcode_error ?? null}
                        startedAt={clip.transcode_started_at ?? null}
                        jobId={clip.transcode_job_id ?? null}
                        canRetry
                        svvId={clip.id}
                      />
                    </div>
                  )}
                </div>

                {/* Read-only annotation overlay — show annotations only for frames within their range */}
                {!annotating && containerWidth > 0 && videoHeight > 0 && (
                  <AnnotationOverlay
                    frameAnnotations={frameAnnotations}
                    hiddenFrames={hiddenAnnotationFrames}
                    currentFrame={currentFrame}
                    width={containerWidth}
                    height={videoHeight}
                    highlightedMark={highlightedMark}
                  />
                )}

                {annotating &&
                  containerWidth > 0 &&
                  videoHeight > 0 &&
                  (() => {
                    const aStart = annotatingFrameRef.current;
                    const aEnd = rangeEnd != null && rangeEnd > aStart ? rangeEnd : aStart;
                    return currentFrame >= aStart && currentFrame <= aEnd;
                  })() && (
                    <div
                      className="absolute top-0 left-0 z-10"
                      style={{ width: containerWidth, height: videoHeight }}
                    >
                      <DrawingCanvas
                        key={canvasKey}
                        width={containerWidth}
                        height={videoHeight}
                        existingAnnotations={existingForFrame}
                        onAnnotationsChange={handleAnnotationsChange}
                        initialTool={canvasInitialTool}
                        editable
                        overlay
                      />
                    </div>
                  )}
              </>
            )}
            {/* Expand toggle — overlays top-right of video, shifts down when annotation toolbar is visible */}
            <Tooltip content={expanded ? "Compact" : "Expand"}>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className={`absolute right-2 z-20 p-1.5 rounded bg-[var(--color-surface-badge-overlay)] text-white/70 hover:text-white hover:bg-[var(--color-surface-badge-overlay)] opacity-0 group-hover/video:opacity-100 transition-all ${annotating ? "top-10" : "top-2"}`}
              >
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </Tooltip>
          </div>

          {/* Annotated frames indicator — chips toggle visibility */}
          {frameAnnotations.length > 0 && !annotating && (
            <div className="flex items-center gap-[var(--spacing-2)]">
              <span className={`shrink-0 ${TYPO_TIMESTAMP}`}>Annotated:</span>
              <div className="flex flex-wrap gap-1">
                {sortedAnnotations.map((entry) => {
                  const isHidden = hiddenAnnotationFrames.has(entry.frameNumber);
                  const hasRange = entry.frameEnd !== null && entry.frameEnd > entry.frameNumber;
                  const isLooped =
                    hasRange &&
                    activeLoopRange?.start === entry.frameNumber &&
                    activeLoopRange?.end === entry.frameEnd;
                  return (
                    <Chip
                      key={entry.frameNumber}
                      size="xs"
                      active={isLooped || !isHidden}
                      onClick={() => {
                        if (hasRange) {
                          if (isLooped) {
                            // Clear loop
                            setActiveLoopRange(null);
                            playerControlRef.current?.loopRange(null);
                          } else {
                            // Set loop — call player control directly (same path as timeline click)
                            const range = {
                              start: entry.frameNumber,
                              end: entry.frameEnd as number,
                            };
                            setActiveLoopRange(range);
                            playerControlRef.current?.loopRange(range);
                          }
                        } else {
                          // Single-frame annotation: toggle visibility
                          setHiddenAnnotationFrames((prev) => {
                            const next = new Set(prev);
                            if (next.has(entry.frameNumber)) {
                              next.delete(entry.frameNumber);
                            } else {
                              next.add(entry.frameNumber);
                            }
                            return next;
                          });
                        }
                      }}
                    >
                      {frameLabel(entry)}
                      {isLooped && " ↻"}
                    </Chip>
                  );
                })}
              </div>
            </div>
          )}

          {/* Annotation & export controls */}
          {!isPurgedClip(clip) && (
            <div className="flex flex-col gap-[var(--spacing-2)]">
              <div className="flex items-center gap-[var(--spacing-2)]">
                <button
                  type="button"
                  onClick={annotating ? exitAnnotation : enterAnnotation}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-mono transition-all ${
                    annotating
                      ? "bg-[var(--color-action-primary)] text-white shadow-[0_0_12px_rgba(59,130,246,0.4)]"
                      : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] border border-[var(--color-border-default)]"
                  }`}
                >
                  {annotating ? <X size={12} /> : <Edit3 size={12} />}
                  {annotating ? "Exit" : "Annotate"}
                </button>

                {annotating ? (
                  <>
                    <span className={TYPO_DATA_CYAN}>
                      Frame {annotatingFrameRef.current}
                      {rangeEnd !== null && ` — ${rangeEnd}`}
                    </span>
                    {upsertMutation.isPending && (
                      <span className="text-xs text-[var(--color-text-muted)]">Saving…</span>
                    )}
                  </>
                ) : (
                  <>
                    <Tooltip content="Export">
                      <button
                        type="button"
                        onClick={() => {
                          const url = getStreamUrl("version", clip.id, "full");
                          const ext = clip.file_path?.split(".").pop() ?? "mp4";
                          const labelSuffix =
                            clipTags.length > 0
                              ? `_[${clipTags.map((t) => slugify(t.display_name)).join(",")}]`
                              : "";
                          const filename = meta
                            ? `${slugify(meta.projectName)}_${slugify(meta.avatarName)}_${slugify(meta.sceneTypeName)}_${slugify(meta.trackName)}_v${clip.version_number}${labelSuffix}.${ext}`
                            : `clip_v${clip.version_number}${labelSuffix}.${ext}`;
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = filename;
                          a.click();
                        }}
                        className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)] transition-colors"
                      >
                        <Download size={14} />
                      </button>
                    </Tooltip>

                    <div className="w-px h-4 bg-[var(--color-border-default)]" />

                    <Tooltip content={clip.qa_status === "approved" ? "Approved" : "Approve"}>
                      <button
                        type="button"
                        onClick={onApprove}
                        disabled={!onApprove}
                        className={`p-1 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none ${clip.qa_status === "approved" ? "text-[var(--color-data-green)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-green)] hover:bg-[var(--color-surface-secondary)]"}`}
                      >
                        <CheckCircle size={14} />
                      </button>
                    </Tooltip>
                    <Tooltip content={clip.qa_status === "rejected" ? "Rejected" : "Reject"}>
                      <button
                        type="button"
                        onClick={onReject}
                        disabled={!onReject}
                        className={`p-1 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none ${clip.qa_status === "rejected" ? "text-[var(--color-data-red)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-data-red)] hover:bg-[var(--color-surface-secondary)]"}`}
                      >
                        <XCircle size={14} />
                      </button>
                    </Tooltip>

                    {/* Spacer + Prev/Next */}
                    <div className="flex-1" />
                    <div className="flex items-center gap-1">
                      <Tooltip content="Previous clip">
                        <button
                          type="button"
                          onClick={() => {
                            saveAllDirty();
                            onPrev?.();
                          }}
                          disabled={!onPrev}
                          className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)] transition-colors disabled:opacity-20 disabled:pointer-events-none"
                        >
                          <ChevronLeft size={16} />
                        </button>
                      </Tooltip>
                      <Tooltip content="Next clip">
                        <button
                          type="button"
                          onClick={() => {
                            saveAllDirty();
                            onNext?.();
                          }}
                          disabled={!onNext}
                          className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)] transition-colors disabled:opacity-20 disabled:pointer-events-none"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </Tooltip>
                    </div>
                  </>
                )}
              </div>

              {/* Mark Start/End range controls + note input (annotation mode only) */}
              {annotating && (
                <div className="flex flex-col gap-[var(--spacing-2)]">
                  <div className="flex items-center gap-[var(--spacing-2)]">
                    <Button
                      size="xs"
                      variant="secondary"
                      className="font-mono"
                      onClick={() => {
                        pauseVideo();
                        const oldFrame = annotatingFrameRef.current;
                        const newFrame = currentFrame;
                        if (oldFrame === newFrame) return;
                        // Move the store entry from old frame to new frame
                        const cur = useClipAnnotationsStore.getState().getForClip(clipId);
                        const oldIdx = cur.findIndex((en) => en.frameNumber === oldFrame);
                        if (oldIdx >= 0) {
                          const entry = cur[oldIdx]!;
                          const next = cur.filter((_, i) => i !== oldIdx);
                          next.push({ ...entry, frameNumber: newFrame });
                          setForClip(clipId, next);
                        }
                        annotatingFrameRef.current = newFrame;
                        // Save: delete old frame, save new frame
                        saveFrame(newFrame, rangeEnd, annotationNote || undefined);
                      }}
                    >
                      Mark Start
                    </Button>
                    <Button
                      size="xs"
                      variant="secondary"
                      className="font-mono"
                      onClick={() => {
                        pauseVideo();
                        const newEnd = currentFrame;
                        setRangeEnd(newEnd);
                        // Immediately update store entry with the new range
                        const frame = annotatingFrameRef.current;
                        const cur = useClipAnnotationsStore.getState().getForClip(clipId);
                        const idx = cur.findIndex((en) => en.frameNumber === frame);
                        if (idx >= 0) {
                          const next = [...cur];
                          next[idx] = { ...next[idx]!, frameEnd: newEnd };
                          setForClip(clipId, next);
                        } else {
                          setForClip(clipId, [
                            ...cur,
                            { frameNumber: frame, frameEnd: newEnd, annotations: [], note: null },
                          ]);
                        }
                        saveFrame(frame, newEnd, annotationNote || undefined);
                      }}
                    >
                      Mark End
                    </Button>
                    {rangeEnd !== null && (
                      <>
                        <span className="font-mono text-xs text-amber-400">
                          F{annotatingFrameRef.current} — F{rangeEnd}
                        </span>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="font-mono"
                          onClick={() => {
                            setRangeEnd(null);
                            // Clear range in store too
                            const frame = annotatingFrameRef.current;
                            const cur = useClipAnnotationsStore.getState().getForClip(clipId);
                            const idx = cur.findIndex((en) => en.frameNumber === frame);
                            if (idx >= 0) {
                              const next = [...cur];
                              next[idx] = { ...next[idx]!, frameEnd: null };
                              setForClip(clipId, next);
                            }
                            saveFrame(frame, null, annotationNote || undefined);
                          }}
                        >
                          Clear Range
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Note input + preset chips */}
                  <div className="flex items-center gap-[var(--spacing-2)]">
                    <Input
                      size="sm"
                      value={annotationNote}
                      onChange={(e) => setAnnotationNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (!annotationNote.trim()) return;
                          addTextAnnotation(annotationNote);
                          setAnnotationNote("");
                        }
                      }}
                      placeholder="Annotation note..."
                      className="flex-1"
                    />
                    <Tooltip content="Manage Presets">
                      <button
                        type="button"
                        onClick={() => setPresetManagerOpen(true)}
                        className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)] transition-colors"
                      >
                        <Settings size={14} />
                      </button>
                    </Tooltip>
                  </div>

                  {/* Preset chips */}
                  {presets.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {presets.map((preset) => (
                        <Chip
                          key={preset.id}
                          size="sm"
                          color={preset.color}
                          onClick={() => addTextAnnotation(preset.label)}
                        >
                          {preset.label}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Labels — hidden in annotation mode */}
          {!annotating && (
            <TagInput
              entityType="scene_video_version"
              entityId={clip.id}
              existingTags={clipTags}
              onTagsChange={setClipTags}
              pipelineId={pipelineId}
              placeholder="Add label..."
            />
          )}

          {/* Notes */}
          <NotesModal
            value={clipNotes}
            onChange={setClipNotes}
            onSave={saveClipNotes}
            saving={clipNotesSaving}
            title={
              meta
                ? `${meta.avatarName} — ${meta.sceneTypeName} v${clip.version_number}`
                : `Clip v${clip.version_number}`
            }
          />

          {/* Generation snapshot */}
          {clip.generation_snapshot != null && Object.keys(clip.generation_snapshot).length > 0 && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-[var(--spacing-3)]">
              <GenerationSnapshotPanel snapshot={clip.generation_snapshot} />
            </div>
          )}

          {/* Annotation summary list */}
          {sortedAnnotations.length > 0 && (
            <div className="flex flex-col gap-[var(--spacing-2)]">
              <h4 className={`${TYPO_DATA} font-medium text-[var(--color-text-primary)]`}>
                Annotations
              </h4>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {sortedAnnotations.map((entry) => (
                  <div key={entry.frameNumber} className="flex items-center gap-1">
                    <div className="flex-1 rounded border border-[var(--color-border-default)] overflow-hidden">
                      {/* Frame header — click to navigate/loop */}
                      <button
                        type="button"
                        className={`flex w-full flex-col gap-0.5 px-3 py-1.5 text-left ${TYPO_DATA} hover:bg-[var(--color-surface-secondary)] transition-colors`}
                        onClick={() => {
                          handleFrameSelect(entry.frameNumber);
                          const hasRange =
                            entry.frameEnd !== null && entry.frameEnd > entry.frameNumber;
                          if (hasRange) {
                            const range = {
                              start: entry.frameNumber,
                              end: entry.frameEnd as number,
                            };
                            setActiveLoopRange(range);
                            playerControlRef.current?.loopRange(range);
                          }
                        }}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className={TYPO_DATA}>
                            {entry.frameEnd !== null && entry.frameEnd > entry.frameNumber
                              ? `Frame ${entry.frameNumber}-${entry.frameEnd}`
                              : `Frame ${entry.frameNumber}`}
                          </span>
                          <span className="text-xs text-[var(--color-text-muted)]">
                            {entry.annotations.length} mark
                            {entry.annotations.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {entry.note && (
                          <span className="text-[10px] text-[var(--color-text-muted)] truncate w-full">
                            {entry.note}
                          </span>
                        )}
                      </button>
                      {/* Individual marks */}
                      {entry.annotations.length > 0 && (
                        <div className="border-t border-[var(--color-border-default)]/30 px-3 py-1 flex flex-wrap gap-1">
                          {entry.annotations.map((mark, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] cursor-default"
                              onMouseEnter={() =>
                                setHighlightedMark({
                                  frameNumber: entry.frameNumber,
                                  markIndex: idx,
                                })
                              }
                              onMouseLeave={() => setHighlightedMark(null)}
                            >
                              <span
                                className="inline-block w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: mark.color }}
                              />
                              {mark.tool}
                              <Tooltip content={`Delete this ${mark.tool} mark`}>
                                <button
                                  type="button"
                                  className="ml-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)] transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteMark(entry.frameNumber, idx);
                                    setHighlightedMark(null);
                                  }}
                                  onMouseEnter={() =>
                                    setHighlightedMark({
                                      frameNumber: entry.frameNumber,
                                      markIndex: idx,
                                    })
                                  }
                                  onMouseLeave={() => setHighlightedMark(null)}
                                >
                                  <X size={10} />
                                </button>
                              </Tooltip>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Tooltip content={`Delete all annotations on frame ${entry.frameNumber}`}>
                      <button
                        type="button"
                        className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)] hover:bg-[var(--color-surface-secondary)] transition-colors self-start"
                        onClick={() => handleDeleteFrameAnnotation(entry.frameNumber)}
                        aria-label={`Delete frame ${entry.frameNumber} annotations`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Annotation preset manager modal */}
      <AnnotationPresetManager
        open={presetManagerOpen}
        onClose={() => setPresetManagerOpen(false)}
        pipelineId={pipelineId}
      />
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Read-only annotation overlay — renders visible annotations for current frame
   -------------------------------------------------------------------------- */

function AnnotationOverlay({
  frameAnnotations,
  hiddenFrames,
  currentFrame,
  width,
  height,
  highlightedMark,
}: {
  frameAnnotations: FrameAnnotationEntry[];
  hiddenFrames: Set<number>;
  currentFrame: number;
  width: number;
  height: number;
  highlightedMark?: { frameNumber: number; markIndex: number } | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    const visible: { obj: DrawingObject; frameNumber: number; markIndex: number }[] = [];
    for (const e of frameAnnotations) {
      if (e.annotations.length === 0) continue;
      if (hiddenFrames.has(e.frameNumber)) continue;
      const start = e.frameNumber;
      const end = e.frameEnd != null && e.frameEnd > start ? e.frameEnd : start;
      if (currentFrame < start || currentFrame > end) continue;
      for (let i = 0; i < e.annotations.length; i++) {
        visible.push({ obj: e.annotations[i]!, frameNumber: e.frameNumber, markIndex: i });
      }
    }

    if (visible.length === 0) return;

    const sx = (v: number) => (v <= 1.5 ? v * width : v);
    const sy = (v: number) => (v <= 1.5 ? v * height : v);

    for (const { obj, frameNumber, markIndex } of visible) {
      const isHighlighted =
        highlightedMark?.frameNumber === frameNumber && highlightedMark?.markIndex === markIndex;
      ctx.save();
      ctx.strokeStyle = obj.color;
      ctx.fillStyle = obj.color;
      ctx.lineWidth = obj.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (highlightedMark && !isHighlighted) {
        ctx.globalAlpha = 0.25;
      }

      if (isHighlighted) {
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 16;
        ctx.lineWidth = obj.strokeWidth + 2;
      }

      const d = obj.data as Record<string, unknown>;

      if (obj.tool === "text") {
        const fontSize = (d.fontSize as number) ?? 16;
        ctx.font = `${fontSize}px sans-serif`;
        if (isHighlighted) {
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 2;
          const tx = sx(d.x as number);
          const ty = sy(d.y as number);
          const tw = ctx.measureText((d.content as string) ?? "").width;
          ctx.strokeRect(tx - 4, ty - fontSize, tw + 8, fontSize * 1.3);
        }
        ctx.fillText((d.content as string) ?? "", sx(d.x as number), sy(d.y as number));
      } else if (obj.tool === "pen" || obj.tool === "highlight") {
        const pts = d.points as { x: number; y: number }[] | undefined;
        if (pts && pts.length >= 2) {
          if (obj.tool === "highlight") ctx.globalAlpha = Math.min(ctx.globalAlpha, 0.4);
          ctx.beginPath();
          ctx.moveTo(sx(pts[0]!.x), sy(pts[0]!.y));
          for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i]!.x), sy(pts[i]!.y));
          ctx.stroke();
        }
      } else if (obj.tool === "rectangle") {
        const x1 = sx(d.startX as number),
          y1 = sy(d.startY as number);
        const x2 = sx(d.endX as number),
          y2 = sy(d.endY as number);
        ctx.beginPath();
        ctx.rect(x1, y1, x2 - x1, y2 - y1);
        ctx.stroke();
      } else if (obj.tool === "circle") {
        const x1 = sx(d.startX as number),
          y1 = sy(d.startY as number);
        const x2 = sx(d.endX as number),
          y2 = sy(d.endY as number);
        ctx.beginPath();
        ctx.ellipse(
          (x1 + x2) / 2,
          (y1 + y2) / 2,
          Math.abs(x2 - x1) / 2,
          Math.abs(y2 - y1) / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      } else if (obj.tool === "arrow") {
        const x1 = sx(d.startX as number),
          y1 = sy(d.startY as number);
        const x2 = sx(d.endX as number),
          y2 = sy(d.endY as number);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = Math.max(10, obj.strokeWidth * 4);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLen * Math.cos(angle - Math.PI / 6),
          y2 - headLen * Math.sin(angle - Math.PI / 6),
        );
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLen * Math.cos(angle + Math.PI / 6),
          y2 - headLen * Math.sin(angle + Math.PI / 6),
        );
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [frameAnnotations, hiddenFrames, currentFrame, width, height, highlightedMark]);

  return (
    <div className="absolute top-0 left-0 z-10 pointer-events-none" style={{ width, height }}>
      <canvas ref={canvasRef} width={width} height={height} className="w-full h-full" />
    </div>
  );
}

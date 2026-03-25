import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Modal } from "@/components/composite";
import { Button, Input } from "@/components/primitives";
import { DrawingCanvas } from "@/features/annotations/DrawingCanvas";
import { AnnotationPresetManager } from "@/features/annotations/AnnotationPresetManager";
import { useAnnotationPresets } from "@/features/annotations/hooks/use-annotation-presets";
import type { DrawingObject } from "@/features/annotations/types";
import { VideoPlayer } from "@/features/video-player/VideoPlayer";
import { getStreamUrl } from "@/features/video-player";
import { api } from "@/lib/api";
import { TagInput } from "@/components/domain/TagInput";
import type { TagInfo } from "@/components/domain/TagChip";
import { CheckCircle, ChevronLeft, ChevronRight, Download, Edit3, Maximize2, Minimize2, Settings, Trash2, X, XCircle } from "@/tokens/icons";

import { GenerationSnapshotPanel } from "./GenerationSnapshotPanel";
import { useDeleteVersionFrameAnnotation, useUpsertVersionAnnotation, useVersionAnnotations } from "./hooks/useVersionAnnotations";
import { useClipAnnotationsStore, type FrameAnnotationEntry } from "./stores/useClipAnnotationsStore";
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

export function ClipPlaybackModal({ clip, onClose, onPrev, onNext, onApprove, onReject, pipelineId, meta }: ClipPlaybackModalProps) {
  const [expanded, setExpanded] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [clipTags, setClipTags] = useState<TagInfo[]>([]);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [annotationNote, setAnnotationNote] = useState("");
  const [presetManagerOpen, setPresetManagerOpen] = useState(false);

  // Load existing tags when clip changes
  useEffect(() => {
    if (!clip) { setClipTags([]); return; }
    api.get<TagInfo[]>(`/entities/scene_video_version/${clip.id}/tags`)
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
        note: overrideNote !== undefined ? overrideNote : entry?.note ?? undefined,
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

  const enterAnnotation = useCallback(() => {
    pauseVideo();
    annotatingFrameRef.current = currentFrame;
    const current = useClipAnnotationsStore.getState().getForClip(clipId);
    const entry = current.find((e) => e.frameNumber === currentFrame);
    const existing = entry?.annotations ?? [];
    existingCountRef.current = existing.length;
    existingSnapshotRef.current = existing;
    setRangeEnd(entry?.frameEnd ?? null);
    setAnnotationNote(entry?.note ?? "");
    setAnnotating(true);
  }, [pauseVideo, currentFrame, clipId]);

  const exitAnnotation = useCallback(() => {
    setAnnotating(false);
    // Update the local store entry with rangeEnd + note before saving
    const frame = annotatingFrameRef.current;
    const current = useClipAnnotationsStore.getState().getForClip(clipId);
    const idx = current.findIndex((e) => e.frameNumber === frame);
    if (idx >= 0) {
      const next = [...current];
      next[idx] = { ...next[idx]!, frameEnd: rangeEnd, note: annotationNote || null };
      setForClip(clipId, next);
    }
    // Save the frame we were annotating
    saveFrame(frame, rangeEnd, annotationNote || undefined);
  }, [saveFrame, clipId, rangeEnd, annotationNote, setForClip]);

  // Called by DrawingCanvas when its undoStack changes (including undo/redo).
  // `newAnnotations` contains only user-drawn items from the current session,
  // so we must merge them with the existing (previously saved) annotations.
  const handleAnnotationsChange = useCallback(
    (newAnnotations: DrawingObject[]) => {
      const frame = annotatingFrameRef.current;
      dirtyFramesRef.current.add(frame);
      const current = useClipAnnotationsStore.getState().getForClip(clipId);
      const existing = current.find((e) => e.frameNumber === frame)?.annotations ?? [];

      // existingAnnotations passed to DrawingCanvas are from the store at mount time.
      // newAnnotations are only the undoStack additions. Merge: keep the original
      // annotations that were loaded as "existing" and append the new ones.
      // The existing count at mount is stored in existingCountRef.
      const base = existing.slice(0, existingCountRef.current);
      const merged = [...base, ...newAnnotations];

      if (merged.length === 0) {
        setForClip(clipId, current.filter((e) => e.frameNumber !== frame));
      } else {
        const idx = current.findIndex((e) => e.frameNumber === frame);
        if (idx >= 0) {
          const next = [...current];
          next[idx] = { ...next[idx]!, frameNumber: frame, annotations: merged };
          setForClip(clipId, next);
        } else {
          setForClip(clipId, [...current, { frameNumber: frame, frameEnd: null, annotations: merged, note: null }]);
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
      const video = getVideoEl();
      if (video) {
        video.pause();
        const fps = clip?.frame_rate ?? 24;
        video.currentTime = frameNumber / fps;
      }
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
    [clip?.frame_rate, clipId, getVideoEl, saveFrame],
  );

  /** Delete all annotations for a specific frame (local store + DB). */
  const handleDeleteFrameAnnotation = useCallback(
    (frameNumber: number) => {
      const current = useClipAnnotationsStore.getState().getForClip(clipId);
      setForClip(clipId, current.filter((e) => e.frameNumber !== frameNumber));
      dirtyFramesRef.current.delete(frameNumber);
      deleteMutation.mutate(frameNumber);
      // If we're currently annotating the deleted frame, exit annotation mode
      if (annotating && annotatingFrameRef.current === frameNumber) {
        setAnnotating(false);
      }
    },
    [clipId, setForClip, deleteMutation, annotating],
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
      if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); saveAllDirty(); onPrev(); }
      if (e.key === "ArrowRight" && onNext) { e.preventDefault(); saveAllDirty(); onNext(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clip, annotating, onPrev, onNext, saveAllDirty]);

  // Use the snapshot taken when annotation mode started, not the reactive store value,
  // to prevent double-counting annotations that the canvas also has in its undoStack.
  const existingForFrame = existingSnapshotRef.current;

  const sortedAnnotations = [...frameAnnotations].sort(
    (a, b) => a.frameNumber - b.frameNumber,
  );

  const canvasKey = `canvas-${annotatingFrameRef.current}`;

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
      title={clip ? (meta ? `${meta.projectName} / ${meta.avatarName} — ${meta.sceneTypeName} — ${meta.trackName} — v${clip.version_number}` : `Clip v${clip.version_number}`) : ""}
      size={expanded ? "full" : "3xl"}
    >
      {clip && (
        <div className="relative flex flex-col gap-[var(--spacing-3)]">
          {/* Expand toggle — top right */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="absolute -top-1 right-0 z-10 p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors"
            title={expanded ? "Compact" : "Expand"}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {/* Video + annotation overlay + prev/next */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { saveAllDirty(); onPrev?.(); }}
              disabled={!onPrev}
              className="shrink-0 rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors disabled:opacity-20 disabled:pointer-events-none"
              aria-label="Previous clip"
            >
              <ChevronLeft size={20} />
            </button>
            <div ref={wrapperRef} className="relative min-w-0 flex-1">
            {isPurgedClip(clip) ? (
              <div className="flex h-48 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
                <div className="flex flex-col items-center gap-2 text-[var(--color-text-muted)]">
                  <X size={32} />
                  <span className="font-mono text-xs">Video file has been purged from disk</span>
                  <span className="font-mono text-xs text-[var(--color-text-muted)]">Metadata and generation parameters are still available below.</span>
                </div>
              </div>
            ) : (
              <>
                <div ref={videoContainerRef}>
                  <VideoPlayer
                    sourceType="version"
                    sourceId={clip.id}
                    quality="full"
                    autoPlay
                    showControls
                    annotationRanges={annotationRanges}
                    onFrameChange={setCurrentFrame}
                  />
                </div>

                {annotating && containerWidth > 0 && videoHeight > 0 && (
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
                      editable
                      overlay
                    />
                  </div>
                )}
              </>
            )}
            </div>
            <button
              type="button"
              onClick={() => { saveAllDirty(); onNext?.(); }}
              disabled={!onNext}
              className="shrink-0 rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors disabled:opacity-20 disabled:pointer-events-none"
              aria-label="Next clip"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Annotated frames indicator */}
          {frameAnnotations.length > 0 && (
            <div className="flex items-center gap-[var(--spacing-2)]">
              <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                Annotated:
              </span>
              <div className="flex flex-wrap gap-1">
                {sortedAnnotations.map((entry) => (
                  <button
                    key={entry.frameNumber}
                    type="button"
                    className={`rounded px-1.5 py-0.5 text-xs font-mono transition-colors ${
                      annotating && entry.frameNumber === annotatingFrameRef.current
                        ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
                        : "bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
                    }`}
                    onClick={() => handleFrameSelect(entry.frameNumber)}
                    title={`${entry.annotations.length} annotation${entry.annotations.length !== 1 ? "s" : ""}${entry.note ? ` — ${entry.note}` : ""}`}
                  >
                    {frameLabel(entry)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Annotation & export controls */}
          {!isPurgedClip(clip) && (
          <div className="flex flex-col gap-[var(--spacing-2)]">
            <div className="flex items-center gap-[var(--spacing-2)]">
              <Button
                size="sm"
                variant={annotating ? "primary" : "secondary"}
                icon={annotating ? <X size={14} /> : <Edit3 size={14} />}
                onClick={annotating ? exitAnnotation : enterAnnotation}
              >
                {annotating ? "Exit Annotation" : "Annotate Frame"}
              </Button>

              <button
                type="button"
                onClick={() => {
                  const url = getStreamUrl("version", clip.id, "full");
                  const ext = clip.file_path?.split(".").pop() ?? "mp4";
                  const labelSuffix = clipTags.length > 0 ? `_[${clipTags.map((t) => t.display_name).join(",")}]` : "";
                  const filename = (meta
                    ? `${meta.projectName}_${meta.avatarName}_${meta.sceneTypeName}_${meta.trackName}_v${clip.version_number}${labelSuffix}.${ext}`.replace(/\s+/g, "_")
                    : `clip_v${clip.version_number}${labelSuffix}.${ext}`).toLowerCase();
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  a.click();
                }}
                className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors"
                title="Export"
              >
                <Download size={14} />
              </button>

              <div className="w-px h-4 bg-[var(--color-border-default)]" />

              <button
                type="button"
                onClick={onApprove}
                disabled={!onApprove}
                className={`p-1 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none ${clip.qa_status === "approved" ? "text-green-400" : "text-[var(--color-text-muted)] hover:text-green-400 hover:bg-[#161b22]"}`}
                title={clip.qa_status === "approved" ? "Approved" : "Approve"}
              >
                <CheckCircle size={14} />
              </button>
              <button
                type="button"
                onClick={onReject}
                disabled={!onReject}
                className={`p-1 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none ${clip.qa_status === "rejected" ? "text-red-400" : "text-[var(--color-text-muted)] hover:text-red-400 hover:bg-[#161b22]"}`}
                title={clip.qa_status === "rejected" ? "Rejected" : "Reject"}
              >
                <XCircle size={14} />
              </button>

              {annotating && (
                <span className="font-mono text-xs text-cyan-400">
                  Frame {annotatingFrameRef.current}
                  {rangeEnd !== null && ` — ${rangeEnd}`}
                </span>
              )}

              {upsertMutation.isPending && (
                <span className="text-xs text-[var(--color-text-muted)]">Saving…</span>
              )}
            </div>

            {/* Mark Start/End range controls + note input (annotation mode only) */}
            {annotating && (
              <div className="flex flex-col gap-[var(--spacing-2)]">
                <div className="flex items-center gap-[var(--spacing-2)]">
                  <Button size="xs" variant="secondary" onClick={() => { pauseVideo(); annotatingFrameRef.current = currentFrame; }}>
                    Mark Start
                  </Button>
                  <Button size="xs" variant="secondary" onClick={() => { pauseVideo(); setRangeEnd(currentFrame); }}>
                    Mark End
                  </Button>
                  {rangeEnd !== null && (
                    <>
                      <span className="font-mono text-xs text-amber-400">
                        F{annotatingFrameRef.current} — F{rangeEnd}
                      </span>
                      <Button size="xs" variant="ghost" onClick={() => setRangeEnd(null)}>
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
                    placeholder="Annotation note..."
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setPresetManagerOpen(true)}
                    className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors"
                    title="Manage Presets"
                  >
                    <Settings size={14} />
                  </button>
                </div>

                {/* Preset chips */}
                {presets.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="rounded-full px-2 py-0.5 text-[10px] font-mono transition-colors bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
                        style={preset.color ? { borderLeft: `3px solid ${preset.color}` } : undefined}
                        onClick={() => setAnnotationNote(preset.label)}
                        title={`Fill note with "${preset.label}"`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Labels */}
          <TagInput
            entityType="scene_video_version"
            entityId={clip.id}
            existingTags={clipTags}
            onTagsChange={setClipTags}
            pipelineId={pipelineId}
            placeholder="Add label..."
          />

          {/* Generation snapshot */}
          {clip.generation_snapshot != null &&
            Object.keys(clip.generation_snapshot).length > 0 && (
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-[var(--spacing-3)]">
                <GenerationSnapshotPanel snapshot={clip.generation_snapshot} />
              </div>
            )}

          {/* Annotation summary list */}
          {sortedAnnotations.length > 0 && (
            <div className="flex flex-col gap-[var(--spacing-2)]">
              <h4 className="font-mono text-xs font-medium text-[var(--color-text-primary)]">
                Annotations
              </h4>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {sortedAnnotations.map((entry) => (
                  <div
                    key={entry.frameNumber}
                    className="flex items-center gap-1"
                  >
                    <button
                      type="button"
                      className="flex flex-1 flex-col gap-0.5 rounded border border-[var(--color-border-default)] px-3 py-1.5 text-left font-mono text-xs hover:bg-[#161b22] transition-colors"
                      onClick={() => handleFrameSelect(entry.frameNumber)}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-mono text-xs text-[var(--color-text-primary)]">
                          {entry.frameEnd !== null && entry.frameEnd > entry.frameNumber
                            ? `Frame ${entry.frameNumber}-${entry.frameEnd}`
                            : `Frame ${entry.frameNumber}`}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {entry.annotations.length} mark{entry.annotations.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {entry.note && (
                        <span className="text-[10px] text-[var(--color-text-muted)] truncate w-full">
                          {entry.note}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)] hover:bg-[#161b22] transition-colors"
                      onClick={() => handleDeleteFrameAnnotation(entry.frameNumber)}
                      title={`Delete all annotations on frame ${entry.frameNumber}`}
                      aria-label={`Delete frame ${entry.frameNumber} annotations`}
                    >
                      <Trash2 size={14} />
                    </button>
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

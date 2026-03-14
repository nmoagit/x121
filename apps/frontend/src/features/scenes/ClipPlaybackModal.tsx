import { useCallback, useEffect, useRef, useState } from "react";

import { Modal } from "@/components/composite";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { DrawingCanvas } from "@/features/annotations/DrawingCanvas";
import type { DrawingObject } from "@/features/annotations/types";
import { VideoPlayer } from "@/features/video-player/VideoPlayer";
import { Edit3, Trash2, X } from "@/tokens/icons";

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
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ClipPlaybackModal({ clip, onClose }: ClipPlaybackModalProps) {
  const [annotating, setAnnotating] = useState(false);
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
      annotations: a.annotations_json as unknown as DrawingObject[],
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
    (frameNumber: number) => {
      if (clipId === 0) return;
      const current = useClipAnnotationsStore.getState().getForClip(clipId);
      const entry = current.find((e) => e.frameNumber === frameNumber);
      upsertMutation.mutate({
        frameNumber,
        annotations: entry?.annotations ?? [],
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
    const existing = current.find((e) => e.frameNumber === currentFrame)?.annotations ?? [];
    existingCountRef.current = existing.length;
    existingSnapshotRef.current = existing;
    setAnnotating(true);
  }, [pauseVideo, currentFrame, clipId]);

  const exitAnnotation = useCallback(() => {
    setAnnotating(false);
    // Save the frame we were annotating
    saveFrame(annotatingFrameRef.current);
  }, [saveFrame]);

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
          next[idx] = { frameNumber: frame, annotations: merged };
          setForClip(clipId, next);
        } else {
          setForClip(clipId, [...current, { frameNumber: frame, annotations: merged }]);
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
      const existing = current.find((e) => e.frameNumber === frameNumber)?.annotations ?? [];
      existingCountRef.current = existing.length;
      existingSnapshotRef.current = existing;
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

  // Use the snapshot taken when annotation mode started, not the reactive store value,
  // to prevent double-counting annotations that the canvas also has in its undoStack.
  const existingForFrame = existingSnapshotRef.current;

  const sortedAnnotations = [...frameAnnotations].sort(
    (a, b) => a.frameNumber - b.frameNumber,
  );

  const canvasKey = `canvas-${annotatingFrameRef.current}`;

  return (
    <Modal
      open={clip !== null}
      onClose={handleClose}
      title={clip ? `Clip v${clip.version_number}` : ""}
      size="3xl"
    >
      {clip && (
        <div className="flex flex-col gap-[var(--spacing-3)]">
          {/* Video + annotation overlay */}
          <div ref={wrapperRef} className="relative">
            {isPurgedClip(clip) ? (
              <div className="flex h-48 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
                <div className="flex flex-col items-center gap-2 text-[var(--color-text-muted)]">
                  <X size={32} />
                  <span className="text-sm">Video file has been purged from disk</span>
                  <span className="text-xs">Metadata and generation parameters are still available below.</span>
                </div>
              </div>
            ) : (
              <>
                <div ref={videoContainerRef}>
                  <VideoPlayer
                    sourceType="version"
                    sourceId={clip.id}
                    autoPlay
                    showControls
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
                    title={`${entry.annotations.length} annotation${entry.annotations.length !== 1 ? "s" : ""}`}
                  >
                    F{entry.frameNumber}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Annotation controls */}
          {!isPurgedClip(clip) && (
          <div className="flex items-center gap-[var(--spacing-2)]">
            <Button
              size="sm"
              variant={annotating ? "primary" : "secondary"}
              icon={annotating ? <X size={14} /> : <Edit3 size={14} />}
              onClick={annotating ? exitAnnotation : enterAnnotation}
            >
              {annotating ? "Exit Annotation" : "Annotate Frame"}
            </Button>

            {annotating && (
              <Badge variant="info" size="sm">
                Frame {annotatingFrameRef.current}
              </Badge>
            )}

            {upsertMutation.isPending && (
              <span className="text-xs text-[var(--color-text-muted)]">Saving…</span>
            )}
          </div>
          )}

          {/* Generation snapshot */}
          {clip.generation_snapshot != null &&
            Object.keys(clip.generation_snapshot).length > 0 && (
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-[var(--spacing-3)]">
                <GenerationSnapshotPanel snapshot={clip.generation_snapshot} />
              </div>
            )}

          {/* Annotation summary list */}
          {sortedAnnotations.length > 0 && (
            <div className="flex flex-col gap-[var(--spacing-2)]">
              <h4 className="text-sm font-medium text-[var(--color-text-primary)]">
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
                      className="flex flex-1 items-center justify-between rounded border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface-tertiary)] transition-colors"
                      onClick={() => handleFrameSelect(entry.frameNumber)}
                    >
                      <span className="font-mono text-xs text-[var(--color-text-primary)]">
                        Frame {entry.frameNumber}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {entry.annotations.length} mark{entry.annotations.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
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
    </Modal>
  );
}

/**
 * Local cache for clip frame annotations (PRD-70).
 *
 * Provides fast in-memory access for real-time drawing while the
 * ClipPlaybackModal syncs to/from the database via TanStack Query.
 */

import { create } from "zustand";

import type { DrawingObject } from "@/features/annotations/types";

/** Stable empty array to avoid new references on every selector call. */
const EMPTY_ENTRIES: FrameAnnotationEntry[] = [];

export interface FrameAnnotationEntry {
  frameNumber: number;
  annotations: DrawingObject[];
}

interface ClipAnnotationsState {
  /** Map of clip (version) ID → annotated frames. */
  annotations: Record<number, FrameAnnotationEntry[]>;

  /** Get annotations for a clip. */
  getForClip: (clipId: number) => FrameAnnotationEntry[];

  /** Set the full annotation list for a clip. */
  setForClip: (clipId: number, entries: FrameAnnotationEntry[]) => void;

  /** Get count of annotated frames for a clip. */
  countForClip: (clipId: number) => number;
}

export const useClipAnnotationsStore = create<ClipAnnotationsState>(
  (set, get) => ({
    annotations: {},

    getForClip: (clipId) => get().annotations[clipId] ?? EMPTY_ENTRIES,

    setForClip: (clipId, entries) =>
      set((state) => ({
        annotations: {
          ...state.annotations,
          [clipId]: entries,
        },
      })),

    countForClip: (clipId) => (get().annotations[clipId] ?? []).length,
  }),
);

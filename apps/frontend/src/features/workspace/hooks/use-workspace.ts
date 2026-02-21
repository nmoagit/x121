/**
 * Workspace state management hooks (PRD-04).
 *
 * Combines a Zustand store for local workspace state with TanStack Query
 * hooks for server synchronization. The Zustand store holds the in-memory
 * working copy; TanStack Query handles server round-trips.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import { api } from "@/lib/api";

import { detectDeviceType } from "../deviceDetection";
import type {
  LayoutState,
  NavigationState,
  SaveUndoSnapshotInput,
  UndoSnapshot,
  UpdateWorkspaceInput,
  WorkspaceState,
} from "../types";
import { DEFAULT_LAYOUT_STATE, DEFAULT_NAVIGATION_STATE } from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const workspaceKeys = {
  all: ["workspace"] as const,
  state: (deviceType: string) => [...workspaceKeys.all, "state", deviceType] as const,
  undo: (entityType: string, entityId: number) =>
    [...workspaceKeys.all, "undo", entityType, entityId] as const,
};

/* --------------------------------------------------------------------------
   Zustand Store (local working copy)
   -------------------------------------------------------------------------- */

interface WorkspaceLocalState {
  layout: LayoutState;
  navigation: NavigationState;
  preferences: Record<string, unknown>;
  isLoaded: boolean;
  isDirty: boolean;
}

interface WorkspaceLocalActions {
  setLayout: (layout: Partial<LayoutState>) => void;
  setNavigation: (nav: Partial<NavigationState>) => void;
  setPreferences: (prefs: Record<string, unknown>) => void;
  hydrateFromServer: (state: WorkspaceState) => void;
  markClean: () => void;
  reset: () => void;
}

type WorkspaceLocalStore = WorkspaceLocalState & WorkspaceLocalActions;

const INITIAL_STATE: WorkspaceLocalState = {
  layout: DEFAULT_LAYOUT_STATE,
  navigation: DEFAULT_NAVIGATION_STATE,
  preferences: {},
  isLoaded: false,
  isDirty: false,
};

export const useWorkspaceStore = create<WorkspaceLocalStore>((set) => ({
  ...INITIAL_STATE,

  setLayout: (partial) =>
    set((s) => ({
      layout: { ...s.layout, ...partial },
      isDirty: true,
    })),

  setNavigation: (partial) =>
    set((s) => ({
      navigation: { ...s.navigation, ...partial },
      isDirty: true,
    })),

  setPreferences: (prefs) =>
    set((s) => ({
      preferences: { ...s.preferences, ...prefs },
      isDirty: true,
    })),

  hydrateFromServer: (ws) =>
    set({
      layout: {
        ...DEFAULT_LAYOUT_STATE,
        ...(ws.layout_state as Partial<LayoutState>),
      },
      navigation: {
        ...DEFAULT_NAVIGATION_STATE,
        ...(ws.navigation_state as Partial<NavigationState>),
      },
      preferences: (ws.preferences as Record<string, unknown>) ?? {},
      isLoaded: true,
      isDirty: false,
    }),

  markClean: () => set({ isDirty: false }),

  reset: () => set({ ...INITIAL_STATE }),
}));

/* --------------------------------------------------------------------------
   TanStack Query Hooks
   -------------------------------------------------------------------------- */

/** Fetch workspace state from the server. */
export function useWorkspaceQuery(deviceType?: string) {
  const dt = deviceType ?? detectDeviceType();

  return useQuery({
    queryKey: workspaceKeys.state(dt),
    queryFn: () => api.get<WorkspaceState>(`/workspace?device_type=${dt}`),
  });
}

/** Save workspace state to the server. */
export function useUpdateWorkspace(deviceType?: string) {
  const dt = deviceType ?? detectDeviceType();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateWorkspaceInput) =>
      api.put<WorkspaceState>(`/workspace?device_type=${dt}`, input),
    onSuccess: () => {
      useWorkspaceStore.getState().markClean();
      queryClient.invalidateQueries({ queryKey: workspaceKeys.state(dt) });
    },
  });
}

/** Reset workspace state to defaults on the server. */
export function useResetWorkspace(deviceType?: string) {
  const dt = deviceType ?? detectDeviceType();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<WorkspaceState>(`/workspace/reset?device_type=${dt}`),
    onSuccess: (data) => {
      useWorkspaceStore.getState().hydrateFromServer(data);
      queryClient.invalidateQueries({ queryKey: workspaceKeys.state(dt) });
    },
  });
}

/** Fetch an undo snapshot for a specific entity. */
export function useUndoSnapshot(entityType: string, entityId: number) {
  return useQuery({
    queryKey: workspaceKeys.undo(entityType, entityId),
    queryFn: () =>
      api.get<UndoSnapshot | null>(`/workspace/undo/${entityType}/${entityId}`),
    enabled: entityId > 0,
  });
}

/** Save an undo snapshot for a specific entity. */
export function useSaveUndoSnapshot(entityType: string, entityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveUndoSnapshotInput) =>
      api.put<UndoSnapshot>(`/workspace/undo/${entityType}/${entityId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.undo(entityType, entityId),
      });
    },
  });
}

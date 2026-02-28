/**
 * TanStack Query hooks for prompt management (PRD-115).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CharacterScenePromptOverride,
  CreatePromptFragment,
  FragmentListParams,
  PromptFragment,
  ResolvePromptRequest,
  ResolvedPromptSlot,
  SceneTypePromptDefault,
  SlotOverride,
  UpdatePromptFragment,
  UpdateWorkflowPromptSlot,
  WorkflowPromptSlot,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factories
   -------------------------------------------------------------------------- */

export const promptSlotKeys = {
  all: ["workflow-prompt-slots"] as const,
  byWorkflow: (workflowId: number) => [...promptSlotKeys.all, workflowId] as const,
};

export const promptDefaultKeys = {
  all: ["scene-type-prompt-defaults"] as const,
  bySceneType: (sceneTypeId: number) => [...promptDefaultKeys.all, sceneTypeId] as const,
};

export const promptOverrideKeys = {
  all: ["character-scene-overrides"] as const,
  byCharacterScene: (characterId: number, sceneTypeId: number) =>
    [...promptOverrideKeys.all, characterId, sceneTypeId] as const,
};

export const promptFragmentKeys = {
  all: ["prompt-fragments"] as const,
  list: (params: FragmentListParams) => [...promptFragmentKeys.all, "list", params] as const,
};

export const promptPreviewKeys = {
  all: ["prompt-preview"] as const,
  resolve: (req: ResolvePromptRequest) => [...promptPreviewKeys.all, req] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all prompt slots for a workflow. */
export function useWorkflowPromptSlots(workflowId: number) {
  return useQuery({
    queryKey: promptSlotKeys.byWorkflow(workflowId),
    queryFn: () => api.get<WorkflowPromptSlot[]>(`/workflows/${workflowId}/prompt-slots`),
    enabled: workflowId > 0,
  });
}

/** Fetch prompt defaults for a scene type. */
export function useSceneTypePromptDefaults(sceneTypeId: number) {
  return useQuery({
    queryKey: promptDefaultKeys.bySceneType(sceneTypeId),
    queryFn: () => api.get<SceneTypePromptDefault[]>(`/scene-types/${sceneTypeId}/prompt-defaults`),
    enabled: sceneTypeId > 0,
  });
}

/** Fetch character+scene prompt overrides. */
export function useCharacterSceneOverrides(characterId: number, sceneTypeId: number) {
  return useQuery({
    queryKey: promptOverrideKeys.byCharacterScene(characterId, sceneTypeId),
    queryFn: () =>
      api.get<CharacterScenePromptOverride[]>(
        `/characters/${characterId}/scenes/${sceneTypeId}/prompt-overrides`,
      ),
    enabled: characterId > 0 && sceneTypeId > 0,
  });
}

/** Fetch prompt fragments with optional search/filter params. */
export function usePromptFragments(params: FragmentListParams) {
  return useQuery({
    queryKey: promptFragmentKeys.list(params),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (params.search) searchParams.set("search", params.search);
      if (params.category) searchParams.set("category", params.category);
      if (params.scene_type_id != null) searchParams.set("scene_type_id", String(params.scene_type_id));
      if (params.limit != null) searchParams.set("limit", String(params.limit));
      if (params.offset != null) searchParams.set("offset", String(params.offset));

      const qs = searchParams.toString();
      const path = qs ? `/prompt-fragments?${qs}` : "/prompt-fragments";
      return api.get<PromptFragment[]>(path);
    },
  });
}

/** Resolve prompts for a character+scene+workflow combination. */
export function usePromptPreview(request: ResolvePromptRequest) {
  return useQuery({
    queryKey: promptPreviewKeys.resolve(request),
    queryFn: () => api.post<ResolvedPromptSlot[]>("/prompts/resolve", request),
    enabled: request.workflow_id > 0 && request.scene_type_id > 0 && request.character_id > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Update a workflow prompt slot. */
export function useUpdatePromptSlot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workflowId,
      slotId,
      data,
    }: {
      workflowId: number;
      slotId: number;
      data: UpdateWorkflowPromptSlot;
    }) => api.put<WorkflowPromptSlot>(`/workflows/${workflowId}/prompt-slots/${slotId}`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: promptSlotKeys.byWorkflow(variables.workflowId),
      });
    },
  });
}

/** Upsert a prompt default for a scene type slot. */
export function useUpsertPromptDefault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sceneTypeId,
      slotId,
      promptText,
    }: {
      sceneTypeId: number;
      slotId: number;
      promptText: string;
    }) =>
      api.put<SceneTypePromptDefault>(`/scene-types/${sceneTypeId}/prompt-defaults/${slotId}`, {
        prompt_text: promptText,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: promptDefaultKeys.bySceneType(variables.sceneTypeId),
      });
      queryClient.invalidateQueries({ queryKey: promptPreviewKeys.all });
    },
  });
}

/** Upsert all character+scene prompt overrides. */
export function useUpsertCharacterSceneOverrides() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      characterId,
      sceneTypeId,
      overrides,
    }: {
      characterId: number;
      sceneTypeId: number;
      overrides: SlotOverride[];
    }) =>
      api.put<CharacterScenePromptOverride[]>(
        `/characters/${characterId}/scenes/${sceneTypeId}/prompt-overrides`,
        { overrides },
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: promptOverrideKeys.byCharacterScene(variables.characterId, variables.sceneTypeId),
      });
      queryClient.invalidateQueries({ queryKey: promptPreviewKeys.all });
    },
  });
}

/** Create a new prompt fragment. */
export function useCreateFragment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePromptFragment) => api.post<PromptFragment>("/prompt-fragments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptFragmentKeys.all });
    },
  });
}

/** Update an existing prompt fragment. */
export function useUpdateFragment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePromptFragment }) =>
      api.put<PromptFragment>(`/prompt-fragments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptFragmentKeys.all });
    },
  });
}

/** Delete a prompt fragment. */
export function useDeleteFragment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/prompt-fragments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptFragmentKeys.all });
    },
  });
}

/** Pin a prompt fragment to a scene type. */
export function usePinFragment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fragmentId, sceneTypeId }: { fragmentId: number; sceneTypeId: number }) =>
      api.post(`/prompt-fragments/${fragmentId}/pin/${sceneTypeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptFragmentKeys.all });
    },
  });
}

/** Unpin a prompt fragment from a scene type. */
export function useUnpinFragment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fragmentId, sceneTypeId }: { fragmentId: number; sceneTypeId: number }) =>
      api.delete(`/prompt-fragments/${fragmentId}/pin/${sceneTypeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptFragmentKeys.all });
    },
  });
}

/**
 * TanStack Query hooks for API key and webhook management (PRD-12).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  ApiKeyCreatedResponse,
  ApiKeyListItem,
  ApiKeyScope,
  CreateApiKeyInput,
  CreateWebhookInput,
  UpdateApiKeyInput,
  UpdateWebhookInput,
  Webhook,
  WebhookDelivery,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factories
   -------------------------------------------------------------------------- */

export const apiKeyKeys = {
  all: ["api-keys"] as const,
  lists: () => [...apiKeyKeys.all, "list"] as const,
  list: () => [...apiKeyKeys.lists()] as const,
  scopes: () => [...apiKeyKeys.all, "scopes"] as const,
};

export const webhookKeys = {
  all: ["webhooks"] as const,
  lists: () => [...webhookKeys.all, "list"] as const,
  list: () => [...webhookKeys.lists()] as const,
  details: () => [...webhookKeys.all, "detail"] as const,
  detail: (id: number) => [...webhookKeys.details(), id] as const,
  deliveries: (webhookId: number) =>
    [...webhookKeys.all, "deliveries", webhookId] as const,
};

/* --------------------------------------------------------------------------
   API Key query hooks
   -------------------------------------------------------------------------- */

/** Fetch all API keys (admin). */
export function useApiKeys() {
  return useQuery({
    queryKey: apiKeyKeys.list(),
    queryFn: () => api.get<ApiKeyListItem[]>("/admin/api-keys"),
  });
}

/** Fetch all API key scopes. */
export function useApiKeyScopes() {
  return useQuery({
    queryKey: apiKeyKeys.scopes(),
    queryFn: () => api.get<ApiKeyScope[]>("/admin/api-keys/scopes"),
  });
}

/* --------------------------------------------------------------------------
   API Key mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new API key. Returns the plaintext key (shown once). */
export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateApiKeyInput) =>
      api.post<ApiKeyCreatedResponse>("/admin/api-keys", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all });
    },
  });
}

/** Update an API key's settings. */
export function useUpdateApiKey(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateApiKeyInput) =>
      api.put<ApiKeyListItem>(`/admin/api-keys/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all });
    },
  });
}

/** Rotate an API key. Returns the new plaintext key. */
export function useRotateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<ApiKeyCreatedResponse>(`/admin/api-keys/${id}/rotate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all });
    },
  });
}

/** Revoke an API key. */
export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<ApiKeyListItem>(`/admin/api-keys/${id}/revoke`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Webhook query hooks
   -------------------------------------------------------------------------- */

/** Fetch all webhooks (admin). */
export function useWebhooks() {
  return useQuery({
    queryKey: webhookKeys.list(),
    queryFn: () => api.get<Webhook[]>("/admin/webhooks"),
  });
}

/** Fetch delivery history for a specific webhook. */
export function useWebhookDeliveries(webhookId: number | null) {
  return useQuery({
    queryKey: webhookKeys.deliveries(webhookId ?? 0),
    queryFn: () =>
      api.get<WebhookDelivery[]>(
        `/admin/webhooks/${webhookId}/deliveries?limit=50`,
      ),
    enabled: webhookId !== null,
  });
}

/* --------------------------------------------------------------------------
   Webhook mutation hooks
   -------------------------------------------------------------------------- */

/** Create a new webhook. */
export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateWebhookInput) =>
      api.post<Webhook>("/admin/webhooks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.all });
    },
  });
}

/** Update a webhook. */
export function useUpdateWebhook(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateWebhookInput) =>
      api.put<Webhook>(`/admin/webhooks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.all });
    },
  });
}

/** Delete a webhook. */
export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.all });
    },
  });
}

/** Send a test payload to a webhook. */
export function useTestWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<WebhookDelivery>(`/admin/webhooks/${id}/test`),
    onSuccess: (_data, webhookId) => {
      queryClient.invalidateQueries({
        queryKey: webhookKeys.deliveries(webhookId),
      });
    },
  });
}

/** Replay a failed/delivered webhook delivery. */
export function useReplayDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (deliveryId: number) =>
      api.post<WebhookDelivery>(
        `/admin/webhooks/deliveries/${deliveryId}/replay`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.all });
    },
  });
}

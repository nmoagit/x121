/**
 * TanStack Query hooks for Webhook Integration Testing Console (PRD-99).
 *
 * Provides hooks for delivery log viewing, test sending, replay,
 * endpoint health monitoring, and mock endpoint management.
 *
 * Backend routes are nested under `/admin/webhook-testing` (see
 * `api/src/routes/webhook_testing.rs`).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CapturePage,
  CreateMockEndpoint,
  DeliveryLogFilters,
  DeliveryLogPage,
  EndpointHealth,
  MockEndpoint,
  MockEndpointPage,
  SamplePayload,
  TestSendRequest,
  WebhookDeliveryLog,
} from "../types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Admin prefix for all webhook testing endpoints. */
const BASE = "/admin/webhook-testing";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const webhookTestingKeys = {
  all: ["webhook-testing"] as const,
  deliveries: (filters?: DeliveryLogFilters) =>
    ["webhook-testing", "deliveries", filters ?? {}] as const,
  delivery: (id: number) =>
    ["webhook-testing", "delivery", id] as const,
  health: (endpointId: number, endpointType: string) =>
    ["webhook-testing", "health", { endpointId, endpointType }] as const,
  healthSummary: () =>
    ["webhook-testing", "health-summary"] as const,
  mocks: () =>
    ["webhook-testing", "mocks"] as const,
  mockCaptures: (mockId: number) =>
    ["webhook-testing", "mock-captures", mockId] as const,
  samplePayloads: () =>
    ["webhook-testing", "sample-payloads"] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch paginated delivery logs with optional filters. */
export function useDeliveryLogs(filters?: DeliveryLogFilters) {
  const params = new URLSearchParams();
  if (filters?.endpoint_id != null) params.set("endpoint_id", String(filters.endpoint_id));
  if (filters?.endpoint_type) params.set("endpoint_type", filters.endpoint_type);
  if (filters?.event_type) params.set("event_type", filters.event_type);
  if (filters?.success != null) params.set("success", String(filters.success));
  if (filters?.is_test != null) params.set("is_test", String(filters.is_test));
  if (filters?.is_replay != null) params.set("is_replay", String(filters.is_replay));
  if (filters?.limit != null) params.set("limit", String(filters.limit));
  if (filters?.offset != null) params.set("offset", String(filters.offset));

  const qs = params.toString();
  const url = qs ? `${BASE}/deliveries?${qs}` : `${BASE}/deliveries`;

  return useQuery({
    queryKey: webhookTestingKeys.deliveries(filters),
    queryFn: () => api.get<DeliveryLogPage>(url),
  });
}

/** Fetch a single delivery log by ID. */
export function useDeliveryDetail(id: number) {
  return useQuery({
    queryKey: webhookTestingKeys.delivery(id),
    queryFn: () => api.get<WebhookDeliveryLog>(`${BASE}/deliveries/${id}`),
    enabled: id > 0,
  });
}

/** Fetch health metrics for a specific webhook endpoint. */
export function useEndpointHealth(endpointId: number) {
  return useQuery({
    queryKey: webhookTestingKeys.health(endpointId, "webhook"),
    queryFn: () =>
      api.get<EndpointHealth>(
        `${BASE}/webhooks/${endpointId}/health`,
      ),
    enabled: endpointId > 0,
  });
}

/** Fetch fleet-wide health summary for all endpoints. */
export function useHealthSummary() {
  return useQuery({
    queryKey: webhookTestingKeys.healthSummary(),
    queryFn: () => api.get<EndpointHealth[]>(`${BASE}/health/summary`),
  });
}

/** List all mock endpoints (paginated). */
export function useMockEndpoints() {
  return useQuery({
    queryKey: webhookTestingKeys.mocks(),
    queryFn: () => api.get<MockEndpointPage>(`${BASE}/mock-endpoints`),
  });
}

/** List captures for a specific mock endpoint (paginated). */
export function useMockCaptures(mockId: number) {
  return useQuery({
    queryKey: webhookTestingKeys.mockCaptures(mockId),
    queryFn: () =>
      api.get<CapturePage>(`${BASE}/mock-endpoints/${mockId}/captures`),
    enabled: mockId > 0,
  });
}

/** Fetch available sample payloads. */
export function useSamplePayloads() {
  return useQuery({
    queryKey: webhookTestingKeys.samplePayloads(),
    queryFn: () => api.get<SamplePayload[]>(`${BASE}/sample-payloads`),
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Send a test delivery to a webhook endpoint. */
export function useTestSend(endpointId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TestSendRequest) =>
      api.post<WebhookDeliveryLog>(
        `${BASE}/webhooks/${endpointId}/test`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: webhookTestingKeys.deliveries(),
      });
    },
  });
}

/** Replay a previous delivery. */
export function useReplay(deliveryId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<WebhookDeliveryLog>(
        `${BASE}/deliveries/${deliveryId}/replay`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: webhookTestingKeys.deliveries(),
      });
    },
  });
}

/** Create a new mock endpoint. */
export function useCreateMock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMockEndpoint) =>
      api.post<MockEndpoint>(`${BASE}/mock-endpoints`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookTestingKeys.mocks() });
    },
  });
}

/** Delete a mock endpoint. */
export function useDeleteMock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`${BASE}/mock-endpoints/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookTestingKeys.mocks() });
    },
  });
}

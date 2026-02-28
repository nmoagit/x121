/**
 * Webhook Integration Testing Console types (PRD-99).
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A webhook delivery log entry from the server. */
export interface WebhookDeliveryLog {
  id: number;
  endpoint_id: number;
  endpoint_type: string;
  event_type: string;
  request_method: string;
  request_url: string;
  request_headers_json: Record<string, unknown> | null;
  request_body_json: Record<string, unknown> | null;
  response_status: number | null;
  response_headers_json: Record<string, unknown> | null;
  response_body: string | null;
  /** Non-null in backend (i32, DEFAULT 0). */
  duration_ms: number;
  success: boolean;
  error_message: string | null;
  is_test: boolean;
  is_replay: boolean;
  replay_of_id: number | null;
  retry_count: number;
  created_at: string;
}

/** Paginated delivery log response. */
export interface DeliveryLogPage {
  items: WebhookDeliveryLog[];
  total: number;
}

/** A mock endpoint for capturing webhook payloads. */
export interface MockEndpoint {
  id: number;
  name: string;
  token: string;
  webhook_endpoint_id: number | null;
  capture_enabled: boolean;
  retention_hours: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** A captured payload on a mock endpoint. */
export interface MockEndpointCapture {
  id: number;
  mock_endpoint_id: number;
  request_method: string;
  request_headers_json: Record<string, unknown> | null;
  request_body_json: Record<string, unknown> | null;
  source_ip: string | null;
  /** Backend field: `received_at` (Timestamp). */
  received_at: string;
}

/** Paginated mock endpoint response. */
export interface MockEndpointPage {
  items: MockEndpoint[];
  total: number;
}

/** Paginated capture response. */
export interface CapturePage {
  items: MockEndpointCapture[];
  total: number;
}

/** Health metrics for a webhook endpoint (nested inside HealthSummary). */
export interface EndpointHealthMetrics {
  success_rate_pct: number;
  avg_response_time_ms: number;
  recent_failure_count: number;
  status: string;
}

/** Backend HealthSummary response -- wraps EndpointHealthMetrics with endpoint context. */
export interface EndpointHealth {
  endpoint_id: number;
  endpoint_type: string;
  health: EndpointHealthMetrics;
}

/** A sample event payload template. */
export interface SamplePayload {
  event_type: string;
  payload: Record<string, unknown>;
  description: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for sending a test delivery. */
export interface TestSendRequest {
  event_type: string;
  payload?: Record<string, unknown>;
}

/** Request body for creating a mock endpoint. */
export interface CreateMockEndpoint {
  name: string;
  webhook_endpoint_id?: number;
  capture_enabled?: boolean;
  retention_hours?: number;
}

/* --------------------------------------------------------------------------
   Filter types
   -------------------------------------------------------------------------- */

/** Filters for the delivery log list query. */
export interface DeliveryLogFilters {
  endpoint_id?: number;
  endpoint_type?: string;
  event_type?: string;
  success?: boolean;
  is_test?: boolean;
  is_replay?: boolean;
  limit?: number;
  offset?: number;
}

/* --------------------------------------------------------------------------
   Display constants
   -------------------------------------------------------------------------- */

/** Human-readable labels for endpoint types. */
export const ENDPOINT_TYPE_LABEL: Record<string, string> = {
  webhook: "Webhook",
  hook: "Pipeline Hook",
};

/** Badge variant mapping for health statuses. */
export const HEALTH_STATUS_BADGE: Record<string, BadgeVariant> = {
  healthy: "success",
  degraded: "warning",
  down: "danger",
};

/** Human-readable labels for health statuses. */
export const HEALTH_STATUS_LABEL: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
};

/** Filter options for the delivery log viewer. */
export const DELIVERY_FILTER_OPTIONS = [
  { value: "", label: "All Deliveries" },
  { value: "success", label: "Successful" },
  { value: "failed", label: "Failed" },
  { value: "test", label: "Test Only" },
  { value: "replay", label: "Replays Only" },
] as const;

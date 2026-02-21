/**
 * Types for External API & Webhooks management (PRD-12).
 */

/* --------------------------------------------------------------------------
   API Key Scope
   -------------------------------------------------------------------------- */

export interface ApiKeyScope {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   API Key
   -------------------------------------------------------------------------- */

export interface ApiKeyListItem {
  id: number;
  name: string;
  description: string | null;
  key_prefix: string;
  scope_name: string;
  project_id: number | null;
  rate_limit_read_per_min: number;
  rate_limit_write_per_min: number;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ApiKeyCreatedResponse {
  id: number;
  name: string;
  key_prefix: string;
  /** The full plaintext key. Shown once only. */
  plaintext_key: string;
  scope_name: string;
  project_id: number | null;
  created_at: string;
}

export interface CreateApiKeyInput {
  name: string;
  description?: string;
  scope: string;
  project_id?: number;
  rate_limit_read_per_min?: number;
  rate_limit_write_per_min?: number;
  expires_at?: string;
}

export interface UpdateApiKeyInput {
  name?: string;
  description?: string;
  rate_limit_read_per_min?: number;
  rate_limit_write_per_min?: number;
  is_active?: boolean;
}

/* --------------------------------------------------------------------------
   Webhook
   -------------------------------------------------------------------------- */

export interface Webhook {
  id: number;
  name: string;
  url: string;
  event_types: string[];
  is_enabled: boolean;
  created_by: number;
  last_triggered_at: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  secret?: string;
  event_types: string[];
  is_enabled?: boolean;
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  secret?: string;
  event_types?: string[];
  is_enabled?: boolean;
}

/* --------------------------------------------------------------------------
   Webhook Delivery
   -------------------------------------------------------------------------- */

export interface WebhookDelivery {
  id: number;
  webhook_id: number;
  event_id: number | null;
  payload: unknown;
  status: "pending" | "retrying" | "delivered" | "failed";
  response_status_code: number | null;
  response_body: string | null;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

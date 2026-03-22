/**
 * Types for External Review / Shareable Preview Links (PRD-84).
 */

/* --------------------------------------------------------------------------
   Scope & Decision types
   -------------------------------------------------------------------------- */

export type LinkScopeType = "segment" | "scene" | "avatar" | "project";
export type ReviewDecision = "approved" | "rejected";

export const SCOPE_TYPE_LABELS: Record<LinkScopeType, string> = {
  segment: "Segment",
  scene: "Scene",
  avatar: "Model",
  project: "Project",
};

/* --------------------------------------------------------------------------
   Expiry presets
   -------------------------------------------------------------------------- */

export const EXPIRY_PRESETS = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
] as const;

/* --------------------------------------------------------------------------
   Link status (derived from data)
   -------------------------------------------------------------------------- */

export type LinkStatus =
  | "active"
  | "expiring_soon"
  | "expired"
  | "revoked"
  | "exhausted";

/** Hours remaining threshold below which a link is "expiring soon". */
const EXPIRING_SOON_HOURS = 24;

export function deriveLinkStatus(link: SharedLink): LinkStatus {
  if (link.is_revoked) return "revoked";

  const now = new Date();
  const expires = new Date(link.expires_at);

  if (now > expires) return "expired";
  if (link.max_views !== null && link.current_views >= link.max_views) {
    return "exhausted";
  }

  const hoursRemaining =
    (expires.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursRemaining < EXPIRING_SOON_HOURS) return "expiring_soon";

  return "active";
}

export const LINK_STATUS_LABELS: Record<LinkStatus, string> = {
  active: "Active",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
  revoked: "Revoked",
  exhausted: "Views Exhausted",
};

export const LINK_STATUS_BADGE_VARIANT: Record<LinkStatus, string> = {
  active: "success",
  expiring_soon: "warning",
  expired: "default",
  revoked: "danger",
  exhausted: "default",
};

/* --------------------------------------------------------------------------
   Entities
   -------------------------------------------------------------------------- */

export interface SharedLink {
  id: number;
  scope_type: LinkScopeType;
  scope_id: number;
  created_by: number;
  expires_at: string;
  max_views: number | null;
  current_views: number;
  is_revoked: boolean;
  settings_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SharedLinkDetail extends SharedLink {
  access_count: number;
  feedback_count: number;
}

/* --------------------------------------------------------------------------
   Access log
   -------------------------------------------------------------------------- */

export interface LinkAccessLogEntry {
  id: number;
  link_id: number;
  accessed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  feedback_text: string | null;
  decision: ReviewDecision | null;
  viewer_name: string | null;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Request / Response DTOs
   -------------------------------------------------------------------------- */

export interface CreateLinkInput {
  scope_type: LinkScopeType;
  scope_id: number;
  expiry_hours: number;
  max_views?: number;
  password?: string;
  settings_json?: Record<string, unknown>;
}

export interface CreateLinkResponse {
  link: SharedLink;
  plain_token: string;
  url: string;
}

export interface SubmitFeedbackInput {
  viewer_name?: string;
  decision?: ReviewDecision;
  feedback_text?: string;
}

export interface TokenValidationResponse {
  scope_type: LinkScopeType;
  scope_id: number;
  password_required: boolean;
  expires_at: string;
}

export interface BulkRevokeResponse {
  revoked_count: number;
}

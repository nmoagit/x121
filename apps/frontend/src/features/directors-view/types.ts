/**
 * TypeScript types for Director's View - Mobile/Tablet Review (PRD-55).
 *
 * These types mirror the backend API response shapes for the mobile-first
 * review interface, including swipe actions, offline sync, and activity feed.
 */

import type { BadgeVariant } from "@/components/primitives/Badge";

/* --------------------------------------------------------------------------
   Enums & constants
   -------------------------------------------------------------------------- */

export type SwipeAction = "approve" | "reject" | "flag";

export const SWIPE_ACTION_LABEL: Record<SwipeAction, string> = {
  approve: "Approve",
  reject: "Reject",
  flag: "Flag",
};

export const SWIPE_ACTION_COLOR: Record<SwipeAction, string> = {
  approve: "var(--color-action-success)",
  reject: "var(--color-action-danger)",
  flag: "var(--color-action-warning)",
};

export const SWIPE_ACTION_BADGE_VARIANT: Record<SwipeAction, BadgeVariant> = {
  approve: "success",
  reject: "danger",
  flag: "warning",
};

/* --------------------------------------------------------------------------
   Review queue
   -------------------------------------------------------------------------- */

export interface ReviewQueueItem {
  segment_id: number;
  avatar_name: string;
  scene_type: string;
  status: string;
  thumbnail_url: string | null;
  video_url: string | null;
  submitted_at: string;
  submitted_by: string;
}

export interface ReviewAction {
  action: SwipeAction;
  notes?: string;
}

/* --------------------------------------------------------------------------
   Push subscription
   -------------------------------------------------------------------------- */

export interface PushSubscription {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePushSubscriptionInput {
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  user_agent?: string;
}

/* --------------------------------------------------------------------------
   Offline sync
   -------------------------------------------------------------------------- */

export interface OfflineSyncAction {
  target_id: number;
  action_type: SwipeAction;
  client_timestamp: string;
}

export interface SyncResult {
  synced: number;
  conflicts: SyncConflict[];
}

export interface SyncConflict {
  action_id: number;
  conflict_type: string;
  local_action: string;
  remote_state: string;
}

/* --------------------------------------------------------------------------
   Activity feed
   -------------------------------------------------------------------------- */

export interface ActivityFeedItem {
  id: number;
  action_type: string;
  target_id: number;
  synced: boolean;
  client_timestamp: string;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Navigation
   -------------------------------------------------------------------------- */

export type MobileTab = "queue" | "projects" | "activity";

export const MOBILE_TAB_LABELS: Record<MobileTab, string> = {
  queue: "Review Queue",
  projects: "My Projects",
  activity: "Activity",
};

/* --------------------------------------------------------------------------
   Breakpoints
   -------------------------------------------------------------------------- */

/** Pixel thresholds for responsive layout switching. */
export const BREAKPOINT_PHONE = 640;
export const BREAKPOINT_TABLET = 1024;

/** Minimum swipe distance (px) to trigger an action. */
export const SWIPE_THRESHOLD_X = 80;
export const SWIPE_THRESHOLD_Y = 60;

/** Minimum touch target size (px) per WCAG / Apple HIG. */
export const MIN_TOUCH_TARGET = 44;

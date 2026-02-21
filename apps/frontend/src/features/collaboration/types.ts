/**
 * TypeScript types for real-time collaboration (PRD-11).
 *
 * These types mirror the backend `entity_locks` and `user_presence` table
 * schemas and the collaboration REST API request/response shapes.
 */

/* --------------------------------------------------------------------------
   Entity Lock Types
   -------------------------------------------------------------------------- */

export interface EntityLock {
  id: number;
  entity_type: string;
  entity_id: number;
  user_id: number;
  lock_type: string;
  acquired_at: string;
  expires_at: string;
  released_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcquireLockRequest {
  entity_type: string;
  entity_id: number;
}

export interface LockActionRequest {
  entity_type: string;
  entity_id: number;
}

/* --------------------------------------------------------------------------
   User Presence Types
   -------------------------------------------------------------------------- */

export interface UserPresence {
  id: number;
  user_id: number;
  entity_type: string;
  entity_id: number;
  last_seen_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Default lock duration in minutes (must match backend). */
export const DEFAULT_LOCK_DURATION_MINS = 30;

/** Lock auto-extend interval: extend at half the lock duration. */
export const LOCK_EXTEND_INTERVAL_MS = (DEFAULT_LOCK_DURATION_MINS / 2) * 60 * 1000;

/** Valid entity types for collaboration. */
export const VALID_ENTITY_TYPES = ["scene", "segment", "character", "project"] as const;

export type CollaborationEntityType = (typeof VALID_ENTITY_TYPES)[number];

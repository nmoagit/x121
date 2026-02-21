/**
 * Collaboration feature barrel export (PRD-11).
 */

// Components
export { PresenceIndicator } from "./PresenceIndicator";
export { LockStatus } from "./LockStatus";

// Hooks
export {
  collaborationKeys,
  useLockStatus,
  useAcquireLock,
  useReleaseLock,
  useExtendLock,
  useLock,
  usePresence,
} from "./hooks/use-collaboration";

// Types
export type {
  EntityLock,
  UserPresence,
  AcquireLockRequest,
  LockActionRequest,
  CollaborationEntityType,
} from "./types";

export {
  DEFAULT_LOCK_DURATION_MINS,
  LOCK_EXTEND_INTERVAL_MS,
  VALID_ENTITY_TYPES,
} from "./types";

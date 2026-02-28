/**
 * External Review / Shareable Preview Links feature barrel export (PRD-84).
 */

// Components
export { CreateLinkDialog } from "./CreateLinkDialog";
export { ExternalReviewPage } from "./ExternalReviewPage";
export { FeedbackForm } from "./FeedbackForm";
export { LinkActivityPanel } from "./LinkActivityPanel";
export { LinkError } from "./LinkError";
export { LinkStatusBadge } from "./LinkStatusBadge";
export { PasswordGate } from "./PasswordGate";
export { SharedLinksPanel } from "./SharedLinksPanel";

// Hooks
export {
  sharedLinkKeys,
  useBulkRevoke,
  useCreateLink,
  useLinkActivity,
  useRevokeLink,
  useSharedLinkDetail,
  useSharedLinks,
  useSubmitFeedback,
  useValidateToken,
  useVerifyPassword,
} from "./hooks/use-shared-links";

// Types
export type {
  BulkRevokeResponse,
  CreateLinkInput,
  CreateLinkResponse,
  LinkAccessLogEntry,
  LinkScopeType,
  LinkStatus,
  ReviewDecision,
  SharedLink,
  SharedLinkDetail,
  SubmitFeedbackInput,
  TokenValidationResponse,
} from "./types";

export {
  deriveLinkStatus,
  EXPIRY_PRESETS,
  LINK_STATUS_BADGE_VARIANT,
  LINK_STATUS_LABELS,
  SCOPE_TYPE_LABELS,
} from "./types";

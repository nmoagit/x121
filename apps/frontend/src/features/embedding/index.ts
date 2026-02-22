/**
 * Character Identity Embedding feature (PRD-76).
 *
 * Barrel export for types, hooks, and components.
 */

// Types
export {
  EMBEDDING_STATUS,
  EMBEDDING_STATUS_LABEL,
  type BoundingBox,
  type DetectedFace,
  type EmbeddingHistory,
  type EmbeddingStatusId,
  type EmbeddingStatusResponse,
  type ExtractEmbeddingRequest,
  type SelectFaceRequest,
} from "./types";

// Hooks
export {
  embeddingKeys,
  useDetectedFaces,
  useEmbeddingHistory,
  useEmbeddingStatus,
  useExtractEmbedding,
  useSelectFace,
} from "./hooks/use-embedding";

// Components
export { EmbeddingStatusBadge } from "./EmbeddingStatusBadge";
export { LowConfidenceWarning } from "./LowConfidenceWarning";
export { MultiFaceSelector } from "./MultiFaceSelector";

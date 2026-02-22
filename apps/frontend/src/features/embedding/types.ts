/**
 * Types for Character Identity Embedding (PRD-76).
 */

/* --------------------------------------------------------------------------
   Embedding status IDs (match database seed order)
   -------------------------------------------------------------------------- */

export const EMBEDDING_STATUS = {
  PENDING: 1,
  EXTRACTING: 2,
  COMPLETED: 3,
  FAILED: 4,
  LOW_CONFIDENCE: 5,
  MULTI_FACE_PENDING: 6,
} as const;

export type EmbeddingStatusId =
  (typeof EMBEDDING_STATUS)[keyof typeof EMBEDDING_STATUS];

/** Human-readable labels for embedding statuses. */
export const EMBEDDING_STATUS_LABEL: Record<EmbeddingStatusId, string> = {
  [EMBEDDING_STATUS.PENDING]: "Pending",
  [EMBEDDING_STATUS.EXTRACTING]: "Extracting",
  [EMBEDDING_STATUS.COMPLETED]: "Completed",
  [EMBEDDING_STATUS.FAILED]: "Failed",
  [EMBEDDING_STATUS.LOW_CONFIDENCE]: "Low Confidence",
  [EMBEDDING_STATUS.MULTI_FACE_PENDING]: "Multi-Face Pending",
};

/* --------------------------------------------------------------------------
   Entities
   -------------------------------------------------------------------------- */

/** Bounding box for a detected face in pixel coordinates. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A detected face from the multi-face detection results. */
export interface DetectedFace {
  id: number;
  character_id: number;
  bounding_box: BoundingBox;
  confidence: number;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

/** Current embedding status for a character. */
export interface EmbeddingStatusResponse {
  character_id: number;
  embedding_status_id: EmbeddingStatusId;
  embedding_status_label: string;
  face_detection_confidence: number | null;
  face_bounding_box: BoundingBox | null;
  embedding_extracted_at: string | null;
  has_embedding: boolean;
}

/** A historical embedding record (audit trail). */
export interface EmbeddingHistory {
  id: number;
  character_id: number;
  face_detection_confidence: number;
  face_bounding_box: BoundingBox | null;
  replaced_at: string;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Request DTOs
   -------------------------------------------------------------------------- */

export interface ExtractEmbeddingRequest {
  confidence_threshold?: number;
}

export interface SelectFaceRequest {
  face_id: number;
}

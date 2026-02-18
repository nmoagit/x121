# Task List: Character Identity Embedding

**PRD Reference:** `design/prds/076-prd-character-identity-embedding.md`
**Scope:** Automatic extraction and storage of face identity embeddings from character source images, serving as the biometric reference for quality checks, likeness anchoring, and duplicate detection.

## Overview

This feature adds automatic face detection and embedding extraction on source image upload via a Python service (InsightFace/ArcFace) orchestrated by the Rust backend. Embeddings are stored as pgvector columns on the character table, enabling efficient similarity queries for downstream features (PRD-49 Quality Gates, PRD-79 Duplicate Detection, PRD-26 Temporal Continuity). Multi-face handling, quality warnings, and re-extraction on source image replacement are included.

### What Already Exists
- PRD-000: Database conventions (BIGSERIAL, TIMESTAMPTZ, DbId, pgvector extension)
- PRD-001: Character entity in the data model
- PRD-009: Multi-runtime script orchestrator (Python runtime for InsightFace)
- PRD-020: pgvector infrastructure for similarity queries
- PRD-022: Source Image QA (image quality checks)

### What We're Building
1. Database migration adding face embedding columns to characters
2. Face detection and embedding extraction Python service
3. Rust orchestration layer that triggers extraction on upload
4. Multi-face selection API and UI
5. Embedding status and quality warning display
6. Re-extraction flow on source image replacement

### Key Design Decisions
1. **pgvector `vector(512)` column** — ArcFace produces 512-dimensional embeddings; stored directly on the characters table for single-query access.
2. **Python service via PRD-09 runtime** — InsightFace/ArcFace runs as a Python script managed by the multi-runtime orchestrator, not as a separate microservice.
3. **Async extraction** — Embedding extraction runs as a background job (PRD-07) so upload is not blocked.
4. **Confidence threshold is configurable** — Stored as a project-level setting with a sensible default (0.7).

---

## Phase 1: Database Schema

### Task 1.1: Face Embedding Migration
**File:** `migrations/YYYYMMDD_add_character_face_embedding.sql`

Add face embedding columns to the characters table and create supporting tables for multi-face detection results.

```sql
-- Add face embedding and detection metadata to characters
ALTER TABLE characters
    ADD COLUMN face_embedding vector(512),
    ADD COLUMN face_detection_confidence DOUBLE PRECISION,
    ADD COLUMN face_bounding_box JSONB,
    ADD COLUMN embedding_status_id BIGINT NOT NULL DEFAULT 1 REFERENCES embedding_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD COLUMN embedding_extracted_at TIMESTAMPTZ;

CREATE INDEX idx_characters_embedding_status_id ON characters(embedding_status_id);

-- HNSW index for nearest-neighbor queries on face embeddings
CREATE INDEX idx_characters_face_embedding_vec ON characters
    USING hnsw (face_embedding vector_cosine_ops);
```

**Acceptance Criteria:**
- [ ] `face_embedding vector(512)` column added to characters
- [ ] `face_detection_confidence` column added as `DOUBLE PRECISION`
- [ ] `face_bounding_box` column added as `JSONB` (stores {x, y, width, height})
- [ ] `embedding_status_id` FK to lookup table with index
- [ ] HNSW vector index created for cosine similarity queries
- [ ] Migration applies cleanly via `sqlx migrate run`

### Task 1.2: Embedding Status Lookup Table
**File:** `migrations/YYYYMMDD_create_embedding_statuses.sql`

Create and seed the embedding status lookup table.

```sql
CREATE TABLE embedding_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON embedding_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO embedding_statuses (name, description) VALUES
    ('pending', 'Embedding extraction has not started'),
    ('extracting', 'Face detection and embedding extraction in progress'),
    ('completed', 'Embedding extracted successfully'),
    ('failed', 'Extraction failed — image may not contain a detectable face'),
    ('low_confidence', 'Extraction succeeded but face detection confidence is below threshold'),
    ('multi_face_pending', 'Multiple faces detected — awaiting user selection');
```

**Acceptance Criteria:**
- [ ] `embedding_statuses` table created with standard conventions
- [ ] Six initial statuses seeded
- [ ] `updated_at` trigger applied
- [ ] Migration runs before the character column migration (ordering)

### Task 1.3: Detected Faces Table
**File:** `migrations/YYYYMMDD_create_detected_faces.sql`

Store all detected faces for multi-face selection.

```sql
CREATE TABLE detected_faces (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    bounding_box JSONB NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    embedding vector(512) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_detected_faces_character_id ON detected_faces(character_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON detected_faces
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `detected_faces` table stores all faces found in a source image
- [ ] `is_primary` flag marks the user-selected or auto-selected face
- [ ] FK to characters with CASCADE delete
- [ ] Index on `character_id`

---

## Phase 2: Backend Extraction Service

### Task 2.1: Embedding Extraction Python Script
**File:** `scripts/python/extract_face_embedding.py`

Python script that takes an image path and returns face detection results with embeddings.

```python
import sys
import json
from insightface.app import FaceAnalysis

def extract(image_path: str) -> dict:
    app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))

    import cv2
    img = cv2.imread(image_path)
    faces = app.get(img)

    results = []
    for face in faces:
        results.append({
            "bounding_box": {
                "x": int(face.bbox[0]),
                "y": int(face.bbox[1]),
                "width": int(face.bbox[2] - face.bbox[0]),
                "height": int(face.bbox[3] - face.bbox[1]),
            },
            "confidence": float(face.det_score),
            "embedding": face.normed_embedding.tolist(),
        })

    return {"faces": results, "count": len(results)}

if __name__ == "__main__":
    result = extract(sys.argv[1])
    print(json.dumps(result))
```

**Acceptance Criteria:**
- [ ] Script accepts image path as argument
- [ ] Returns JSON with all detected faces, bounding boxes, confidence scores, and 512-dim embeddings
- [ ] Uses InsightFace/ArcFace with CUDA support (CPU fallback)
- [ ] Completes within 5 seconds per image
- [ ] Handles missing/corrupt images gracefully with error JSON

### Task 2.2: Rust Extraction Orchestrator
**File:** `src/services/embedding_extraction.rs`

Rust service that invokes the Python script via PRD-09 runtime and processes results.

```rust
use crate::types::DbId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct DetectedFace {
    pub bounding_box: BoundingBox,
    pub confidence: f64,
    pub embedding: Vec<f32>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct BoundingBox {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Deserialize)]
pub struct ExtractionResult {
    pub faces: Vec<DetectedFace>,
    pub count: usize,
}

pub async fn extract_embedding(
    pool: &sqlx::PgPool,
    character_id: DbId,
    image_path: &str,
    confidence_threshold: f64,
) -> Result<ExtractionResult, anyhow::Error> {
    // 1. Update status to 'extracting'
    // 2. Invoke Python script via PRD-09 runtime
    // 3. Parse results
    // 4. Store all detected faces
    // 5. If single face: auto-select as primary, update character
    // 6. If multi-face: set status to 'multi_face_pending'
    // 7. If no face: set status to 'failed'
    // 8. If confidence < threshold: set status to 'low_confidence'
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Invokes Python extraction script via PRD-09 runtime
- [ ] Stores all detected faces in `detected_faces` table
- [ ] Auto-selects primary face when only one is detected
- [ ] Sets appropriate embedding status based on results
- [ ] Updates character's `face_embedding` column with primary face embedding
- [ ] Returns structured result for API response

### Task 2.3: Embedding Repository
**File:** `src/repositories/embedding_repo.rs`

Database operations for embedding management.

```rust
use crate::types::DbId;
use sqlx::PgPool;

pub async fn update_character_embedding(
    pool: &PgPool,
    character_id: DbId,
    embedding: &[f32],
    confidence: f64,
    bounding_box: &serde_json::Value,
    status_id: DbId,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        UPDATE characters
        SET face_embedding = $2::vector,
            face_detection_confidence = $3,
            face_bounding_box = $4,
            embedding_status_id = $5,
            embedding_extracted_at = NOW()
        WHERE id = $1
        "#,
        character_id,
        embedding as &[f32],
        confidence,
        bounding_box,
        status_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn store_detected_faces(
    pool: &PgPool,
    character_id: DbId,
    faces: &[DetectedFaceInsert],
) -> Result<(), sqlx::Error> {
    // Batch insert all detected faces
    todo!()
}

pub async fn select_primary_face(
    pool: &PgPool,
    character_id: DbId,
    face_id: DbId,
) -> Result<(), sqlx::Error> {
    // Clear previous primary, set new primary, update character embedding
    todo!()
}
```

**Acceptance Criteria:**
- [ ] `update_character_embedding` sets all embedding columns atomically
- [ ] `store_detected_faces` batch inserts all detected faces
- [ ] `select_primary_face` handles the multi-face selection flow
- [ ] All operations use parameterized queries (SQLx compile-time checked)

---

## Phase 3: API Endpoints

### Task 3.1: Extract Embedding Endpoint
**File:** `src/routes/embedding_routes.rs`

POST endpoint to trigger embedding extraction for a character.

```rust
use axum::{extract::Path, Json};
use crate::types::DbId;

/// POST /api/characters/:id/extract-embedding
pub async fn extract_embedding_handler(
    Path(character_id): Path<DbId>,
    // ... state, pool
) -> Result<Json<ExtractionResponse>, ApiError> {
    // 1. Verify character exists and has a source image
    // 2. Dispatch extraction as background job (PRD-07)
    // 3. Return job ID and current status
    todo!()
}

/// GET /api/characters/:id/embedding-status
pub async fn embedding_status_handler(
    Path(character_id): Path<DbId>,
) -> Result<Json<EmbeddingStatusResponse>, ApiError> {
    // Return current embedding status, confidence, and face count
    todo!()
}

/// POST /api/characters/:id/select-face
pub async fn select_face_handler(
    Path(character_id): Path<DbId>,
    Json(body): Json<SelectFaceRequest>,
) -> Result<Json<EmbeddingStatusResponse>, ApiError> {
    // Select primary face from multi-face detection results
    todo!()
}
```

**Acceptance Criteria:**
- [ ] `POST /api/characters/:id/extract-embedding` triggers extraction job
- [ ] `GET /api/characters/:id/embedding-status` returns current embedding state
- [ ] `POST /api/characters/:id/select-face` handles multi-face primary selection
- [ ] All endpoints validate character existence
- [ ] Proper error responses for missing source image, already extracting, etc.

### Task 3.2: Detected Faces Endpoint
**File:** `src/routes/embedding_routes.rs`

GET endpoint to retrieve all detected faces for multi-face selection UI.

```rust
/// GET /api/characters/:id/detected-faces
pub async fn get_detected_faces_handler(
    Path(character_id): Path<DbId>,
) -> Result<Json<Vec<DetectedFaceResponse>>, ApiError> {
    // Return all detected faces with bounding boxes and confidence
    // Embedding vectors are NOT returned (too large for API response)
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Returns all detected faces with bounding boxes and confidence scores
- [ ] Does NOT return raw embedding vectors (too large; only metadata)
- [ ] Indicates which face is currently selected as primary
- [ ] Returns empty list if no faces detected

---

## Phase 4: Re-extraction & Staleness

### Task 4.1: Re-extraction on Source Image Replacement
**File:** `src/services/embedding_extraction.rs`

When a source image is replaced (PRD-21), automatically re-extract the embedding.

```rust
pub async fn handle_source_image_replaced(
    pool: &PgPool,
    character_id: DbId,
    new_image_path: &str,
    confidence_threshold: f64,
) -> Result<(), anyhow::Error> {
    // 1. Archive current embedding as previous (for comparison)
    // 2. Clear detected faces
    // 3. Re-run extraction on new image
    // 4. Flag existing quality scores as potentially stale
    // 5. Notify downstream features via PRD-10 event bus
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Previous embedding retained in `embedding_history` or audit column
- [ ] Existing quality scores flagged as stale when embedding changes
- [ ] Downstream features notified via event bus (PRD-10)
- [ ] Re-extraction follows same flow as initial extraction

### Task 4.2: Embedding History Table
**File:** `migrations/YYYYMMDD_create_embedding_history.sql`

Track previous embeddings for comparison and audit.

```sql
CREATE TABLE embedding_history (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    face_embedding vector(512) NOT NULL,
    face_detection_confidence DOUBLE PRECISION NOT NULL,
    face_bounding_box JSONB,
    replaced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_embedding_history_character_id ON embedding_history(character_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON embedding_history
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Previous embeddings archived before replacement
- [ ] History queryable per character
- [ ] Cascade delete with character

---

## Phase 5: Frontend - Embedding Status & Multi-Face Selection

### Task 5.1: Embedding Status Indicator Component
**File:** `frontend/src/components/characters/EmbeddingStatusBadge.tsx`

Display embedding status on character cards.

```typescript
interface EmbeddingStatusBadgeProps {
  status: 'pending' | 'extracting' | 'completed' | 'failed' | 'low_confidence' | 'multi_face_pending';
  confidence?: number;
}

export function EmbeddingStatusBadge({ status, confidence }: EmbeddingStatusBadgeProps) {
  // Green badge: completed with good confidence
  // Yellow badge: low_confidence with warning message
  // Red badge: failed
  // Blue spinner: extracting
  // Orange badge: multi_face_pending (action required)
}
```

**Acceptance Criteria:**
- [ ] Color-coded badge per embedding status
- [ ] Confidence value shown when available
- [ ] Warning message for low confidence: "Face detection confidence is low ({value}) — this may cause unreliable quality checks"
- [ ] Action indicator for multi-face pending

### Task 5.2: Multi-Face Selection UI
**File:** `frontend/src/components/characters/MultiFaceSelector.tsx`

Show source image with bounding boxes for face selection.

```typescript
interface MultiFaceSelectorProps {
  characterId: number;
  imageUrl: string;
  faces: DetectedFace[];
  onSelect: (faceId: number) => void;
}

export function MultiFaceSelector({ characterId, imageUrl, faces, onSelect }: MultiFaceSelectorProps) {
  // Render source image with colored bounding boxes on each face
  // Click a bounding box to select it as primary
  // Selected face highlighted with different color/border
}
```

**Acceptance Criteria:**
- [ ] Source image displayed with colored bounding boxes on all detected faces
- [ ] Click a face to select it as primary
- [ ] Selected face visually distinguished (different color, thicker border)
- [ ] Confidence score shown next to each bounding box
- [ ] Calls `POST /api/characters/:id/select-face` on selection

### Task 5.3: Low Confidence Warning
**File:** `frontend/src/components/characters/LowConfidenceWarning.tsx`

Inline warning shown when face detection confidence is below threshold.

```typescript
export function LowConfidenceWarning({ confidence, threshold }: { confidence: number; threshold: number }) {
  // Yellow warning banner:
  // "Face detection confidence is low (0.65) — this may cause unreliable quality checks.
  //  Consider using a clearer source image."
  // Non-blocking: user can dismiss and proceed
}
```

**Acceptance Criteria:**
- [ ] Warning appears inline during upload flow when confidence < threshold
- [ ] Shows exact confidence value and threshold
- [ ] Suggests using a clearer source image
- [ ] Non-blocking — user can dismiss and proceed

---

## Phase 6: Integration & Configuration

### Task 6.1: Confidence Threshold Configuration
**File:** `src/services/embedding_config.rs`

Project-level configurable confidence threshold.

```rust
pub struct EmbeddingConfig {
    pub confidence_threshold: f64,  // default: 0.7
    pub vector_dimension: usize,    // default: 512
}

pub async fn get_embedding_config(
    pool: &PgPool,
    project_id: DbId,
) -> Result<EmbeddingConfig, sqlx::Error> {
    // Load from project settings, fallback to studio defaults
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Confidence threshold configurable per project
- [ ] Default threshold: 0.7
- [ ] Studio-level defaults with project overrides
- [ ] Config accessible by extraction service and API

### Task 6.2: Upload Hook Integration
**File:** `src/services/source_image_upload.rs`

Wire embedding extraction into the source image upload flow (PRD-21).

```rust
pub async fn on_source_image_uploaded(
    pool: &PgPool,
    character_id: DbId,
    image_path: &str,
) -> Result<(), anyhow::Error> {
    // 1. Source image stored (PRD-21)
    // 2. Trigger face embedding extraction (this PRD)
    // 3. Trigger image QA checks (PRD-22)
    // Both run as background jobs in parallel
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Embedding extraction triggered automatically on source image upload
- [ ] Runs as a background job, not blocking the upload response
- [ ] Runs in parallel with PRD-22 QA checks
- [ ] Extraction status visible on the character card immediately

---

## Phase 7: Testing

### Task 7.1: Extraction Service Unit Tests
**File:** `tests/embedding_extraction_test.rs`

```rust
#[tokio::test]
async fn test_single_face_extraction() {
    // Upload image with one face -> auto-selected, status = completed
}

#[tokio::test]
async fn test_multi_face_extraction() {
    // Upload image with multiple faces -> status = multi_face_pending
}

#[tokio::test]
async fn test_no_face_extraction() {
    // Upload image with no face -> status = failed
}

#[tokio::test]
async fn test_low_confidence_warning() {
    // Upload image with low confidence face -> status = low_confidence
}

#[tokio::test]
async fn test_re_extraction_on_replacement() {
    // Replace source image -> old embedding archived, new extraction triggered
}
```

**Acceptance Criteria:**
- [ ] Single face: auto-select, status = completed
- [ ] Multiple faces: status = multi_face_pending, faces stored
- [ ] No face: status = failed
- [ ] Low confidence: status = low_confidence with warning
- [ ] Re-extraction: previous embedding archived, new extraction triggered

### Task 7.2: API Endpoint Tests
**File:** `tests/embedding_api_test.rs`

```rust
#[tokio::test]
async fn test_extract_embedding_endpoint() {
    // POST /api/characters/:id/extract-embedding -> 202 Accepted
}

#[tokio::test]
async fn test_embedding_status_endpoint() {
    // GET /api/characters/:id/embedding-status -> current status
}

#[tokio::test]
async fn test_select_face_endpoint() {
    // POST /api/characters/:id/select-face -> updates primary, returns new status
}
```

**Acceptance Criteria:**
- [ ] All endpoints return correct status codes
- [ ] Invalid character ID returns 404
- [ ] Missing source image returns 400
- [ ] Multi-face selection updates embedding correctly

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_embedding_statuses.sql` | Embedding status lookup table |
| `migrations/YYYYMMDD_add_character_face_embedding.sql` | Face embedding columns on characters |
| `migrations/YYYYMMDD_create_detected_faces.sql` | Multi-face detection results storage |
| `migrations/YYYYMMDD_create_embedding_history.sql` | Previous embedding archive |
| `scripts/python/extract_face_embedding.py` | InsightFace/ArcFace extraction script |
| `src/services/embedding_extraction.rs` | Rust extraction orchestrator |
| `src/repositories/embedding_repo.rs` | Database operations for embeddings |
| `src/routes/embedding_routes.rs` | API endpoints for embedding management |
| `src/services/embedding_config.rs` | Confidence threshold configuration |
| `src/services/source_image_upload.rs` | Upload hook integration |
| `frontend/src/components/characters/EmbeddingStatusBadge.tsx` | Status indicator component |
| `frontend/src/components/characters/MultiFaceSelector.tsx` | Multi-face selection UI |
| `frontend/src/components/characters/LowConfidenceWarning.tsx` | Low confidence warning banner |
| `tests/embedding_extraction_test.rs` | Extraction service tests |
| `tests/embedding_api_test.rs` | API endpoint tests |

## Dependencies

### Existing Components to Reuse
- PRD-000: Database conventions, pgvector extension
- PRD-001: Characters table
- PRD-007: Background job execution for async extraction
- PRD-009: Python runtime for InsightFace invocation
- PRD-010: Event bus for downstream notifications
- PRD-020: pgvector infrastructure

### New Infrastructure Needed
- InsightFace/ArcFace Python package (buffalo_l model)
- ONNX Runtime with CUDA support for GPU acceleration

## Implementation Order

### MVP
1. Phase 1: Database Schema — Tasks 1.1-1.3
2. Phase 2: Backend Extraction Service — Tasks 2.1-2.3
3. Phase 3: API Endpoints — Tasks 3.1-3.2
4. Phase 5: Frontend — Tasks 5.1-5.3

**MVP Success Criteria:**
- Embedding extracted automatically on source image upload
- Multi-face selection works for images with multiple faces
- Embedding status visible on character cards
- Low confidence warning shown when appropriate

### Post-MVP Enhancements
1. Phase 4: Re-extraction & Staleness — Tasks 4.1-4.2
2. Phase 6: Integration & Configuration — Tasks 6.1-6.2
3. Phase 7: Testing — Tasks 7.1-7.2
4. Multi-embedding support (multiple reference angles/expressions per character)

## Notes

1. **Model choice:** InsightFace with ArcFace (buffalo_l) provides a good balance of accuracy and speed. The 512-dimensional embedding is standard for face recognition tasks.
2. **GPU vs. CPU:** Extraction runs on GPU if available (CUDA) but falls back to CPU. CPU extraction takes ~2-3 seconds per image; GPU is sub-second.
3. **Vector index type:** HNSW is chosen over IVFFlat because the expected character count is well under 1M, and HNSW provides better recall without a training step.
4. **Embedding normalization:** ArcFace embeddings are L2-normalized by default, so cosine similarity is equivalent to dot product. The pgvector `vector_cosine_ops` index is used for clarity.

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-076 v1.0

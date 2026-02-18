# Task List: Source Image Quality Assurance

**PRD Reference:** `design/prds/022-prd-source-image-quality-assurance.md`
**Scope:** Automated and manual quality checks on source and variant images before they enter the generation pipeline, catching resolution, format, face detection, sharpness, lighting, and likeness issues at the image stage.

## Overview

High-quality seed images lead to more stable video generation. This feature provides a multi-check QA pipeline that runs automatically on source image upload and variant generation, producing pass/warn/fail results per check with numeric scores. Checks include resolution/format validation, face detection/centering, sharpness/lighting quality scoring, and likeness comparison between source and variant using face embeddings. Batch validation enables project-wide quality sweeps.

### What Already Exists
- PRD-000: Database conventions
- PRD-001: Character and image data model
- PRD-009: Python runtime for OpenCV/PIL analysis
- PRD-076: Face detection and identity embeddings

### What We're Building
1. `image_quality_scores` table storing per-check results
2. Python QA analysis scripts (resolution, face, sharpness, likeness)
3. Rust QA orchestrator that runs all checks and aggregates results
4. Batch validation across all images in a project
5. QA results display on image upload flow
6. Likeness comparison view (source vs. variant)

### Key Design Decisions
1. **Per-check granularity** — Each check produces an independent pass/warn/fail result, not a single aggregate score. This lets users understand exactly what's wrong.
2. **Python for analysis, Rust for orchestration** — Image analysis uses OpenCV/PIL in Python via PRD-09 runtime; the Rust backend coordinates and stores results.
3. **Configurable thresholds per workflow** — Different workflows may have different minimum resolution requirements.
4. **Non-blocking by default** — QA warns but doesn't prevent proceeding. Hard blocks are opt-in per project.

---

## Phase 1: Database Schema

### Task 1.1: QA Check Type Lookup Table
**File:** `migrations/YYYYMMDD_create_qa_check_types.sql`

```sql
CREATE TABLE qa_check_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,  -- 'technical', 'quality', 'likeness'
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON qa_check_types
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO qa_check_types (name, category, description) VALUES
    ('resolution', 'technical', 'Minimum resolution and aspect ratio validation'),
    ('format', 'technical', 'Image format validation (PNG, JPEG, WebP)'),
    ('face_detection', 'quality', 'Face presence and detection confidence'),
    ('face_centering', 'quality', 'Face position within the center zone'),
    ('face_size', 'quality', 'Minimum face size as percentage of image'),
    ('sharpness', 'quality', 'Blur detection and sharpness score'),
    ('lighting', 'quality', 'Lighting consistency and exposure assessment'),
    ('artifacts', 'quality', 'AI artifact and compression artifact detection'),
    ('likeness', 'likeness', 'Face similarity between source and variant');
```

**Acceptance Criteria:**
- [ ] Nine QA check types seeded with categories
- [ ] Standard conventions followed

### Task 1.2: Image Quality Scores Table
**File:** `migrations/YYYYMMDD_create_image_quality_scores.sql`

```sql
CREATE TABLE image_quality_scores (
    id BIGSERIAL PRIMARY KEY,
    image_variant_id BIGINT REFERENCES image_variants(id) ON DELETE CASCADE ON UPDATE CASCADE,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    check_type_id BIGINT NOT NULL REFERENCES qa_check_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    score DOUBLE PRECISION,       -- Numeric score (0.0-1.0 normalized)
    status TEXT NOT NULL,          -- 'pass', 'warn', 'fail'
    details JSONB,                 -- Check-specific details (resolution values, face bbox, etc.)
    is_source_image BOOLEAN NOT NULL DEFAULT false,  -- true = checking source, false = checking variant
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_image_quality_scores_image_variant_id ON image_quality_scores(image_variant_id);
CREATE INDEX idx_image_quality_scores_character_id ON image_quality_scores(character_id);
CREATE INDEX idx_image_quality_scores_check_type_id ON image_quality_scores(check_type_id);
CREATE INDEX idx_image_quality_scores_status ON image_quality_scores(status);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON image_quality_scores
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Stores per-check results with numeric score and pass/warn/fail status
- [ ] `details` JSONB stores check-specific data
- [ ] Supports both source images and variant images
- [ ] FK indexes on all columns

### Task 1.3: QA Thresholds Configuration Table
**File:** `migrations/YYYYMMDD_create_image_qa_thresholds.sql`

```sql
CREATE TABLE image_qa_thresholds (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    check_type_id BIGINT NOT NULL REFERENCES qa_check_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    warn_threshold DOUBLE PRECISION NOT NULL,
    fail_threshold DOUBLE PRECISION NOT NULL,
    is_blocking BOOLEAN NOT NULL DEFAULT false,  -- If true, fail blocks proceeding
    config JSONB,  -- Check-specific config (e.g., min_resolution: 1024)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_image_qa_thresholds_project_id ON image_qa_thresholds(project_id);
CREATE INDEX idx_image_qa_thresholds_check_type_id ON image_qa_thresholds(check_type_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON image_qa_thresholds
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Per-project threshold overrides
- [ ] `NULL` project_id = studio-wide defaults
- [ ] `is_blocking` determines if fail prevents proceeding
- [ ] `config` JSONB for check-specific settings

---

## Phase 2: Python QA Analysis Scripts

### Task 2.1: Resolution & Format Validator
**File:** `scripts/python/qa_resolution_format.py`

```python
import sys, json
from PIL import Image

def check(image_path: str, config: dict) -> dict:
    img = Image.open(image_path)
    width, height = img.size
    fmt = img.format

    min_res = config.get("min_resolution", 1024)
    accepted_formats = config.get("formats", ["PNG", "JPEG", "WEBP"])
    expected_ratio = config.get("aspect_ratio", None)

    results = []
    # Resolution check
    min_dim = min(width, height)
    res_score = min(1.0, min_dim / min_res)
    results.append({
        "check": "resolution",
        "score": res_score,
        "status": "pass" if min_dim >= min_res else "fail",
        "details": {"width": width, "height": height, "min_required": min_res}
    })

    # Format check
    fmt_ok = fmt in accepted_formats
    results.append({
        "check": "format",
        "score": 1.0 if fmt_ok else 0.0,
        "status": "pass" if fmt_ok else "fail",
        "details": {"format": fmt, "accepted": accepted_formats}
    })

    return {"results": results}

if __name__ == "__main__":
    config = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    print(json.dumps(check(sys.argv[1], config)))
```

**Acceptance Criteria:**
- [ ] Checks minimum resolution against configurable threshold
- [ ] Validates format is PNG, JPEG, or WebP
- [ ] Returns structured JSON with score and status per check
- [ ] Aspect ratio validation when configured

### Task 2.2: Face Detection & Centering Analyzer
**File:** `scripts/python/qa_face_detection.py`

```python
def check(image_path: str, config: dict) -> dict:
    # Uses InsightFace (same as PRD-076) for face detection
    # Checks: face present, face centered, face size adequate
    # Returns: detection confidence, bounding box, centering offset, face percentage
    pass
```

**Acceptance Criteria:**
- [ ] Confirms at least one face is present
- [ ] Checks face is within center zone (configurable percentage)
- [ ] Checks face occupies sufficient image area (configurable minimum %)
- [ ] Returns auto-crop suggestion if face is off-center

### Task 2.3: Quality Scoring (Sharpness, Lighting, Artifacts)
**File:** `scripts/python/qa_image_quality.py`

```python
import cv2
import numpy as np

def check_sharpness(image_path: str) -> dict:
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    laplacian_var = cv2.Laplacian(img, cv2.CV_64F).var()
    # Normalize to 0-1 range based on empirical thresholds
    score = min(1.0, laplacian_var / 500.0)
    return {"check": "sharpness", "score": score, "details": {"laplacian_variance": laplacian_var}}

def check_lighting(image_path: str) -> dict:
    img = cv2.imread(image_path)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    brightness = hsv[:,:,2].mean() / 255.0
    # Score penalizes too dark or too bright
    score = 1.0 - abs(brightness - 0.5) * 2
    return {"check": "lighting", "score": max(0, score), "details": {"mean_brightness": brightness}}
```

**Acceptance Criteria:**
- [ ] Sharpness scored via Laplacian variance (blur detection)
- [ ] Lighting assessed via HSV brightness distribution
- [ ] Artifact detection for common AI generation artifacts
- [ ] Overall quality score: composite of individual metrics

### Task 2.4: Likeness Comparison
**File:** `scripts/python/qa_likeness.py`

```python
def compare_likeness(source_embedding: list, variant_image_path: str) -> dict:
    # Extract face embedding from variant
    # Compute cosine similarity with source embedding
    # Return similarity score and pass/warn/fail
    pass
```

**Acceptance Criteria:**
- [ ] Compares variant face embedding against source (PRD-076)
- [ ] Cosine similarity score normalized to 0-1
- [ ] Configurable threshold for likeness pass/fail
- [ ] Flags variants that deviate significantly from source

---

## Phase 3: Rust QA Orchestrator

### Task 3.1: QA Runner Service
**File:** `src/services/image_qa_service.rs`

```rust
use crate::types::DbId;

pub struct QaRunResult {
    pub scores: Vec<QaScore>,
    pub overall_status: String,  // "pass", "warn", "fail"
}

pub async fn run_image_qa(
    pool: &sqlx::PgPool,
    character_id: DbId,
    image_path: &str,
    variant_id: Option<DbId>,
    is_source: bool,
) -> Result<QaRunResult, anyhow::Error> {
    // 1. Load thresholds for the character's project
    // 2. Run each check via Python scripts (PRD-09 runtime)
    // 3. Compare scores against thresholds
    // 4. Store results in image_quality_scores
    // 5. Return aggregate result
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Runs all applicable checks for the image
- [ ] Uses project-specific thresholds (fallback to studio defaults)
- [ ] Stores all results in `image_quality_scores` table
- [ ] Returns overall pass/warn/fail status

### Task 3.2: Batch Validation Service
**File:** `src/services/image_qa_batch_service.rs`

```rust
pub async fn batch_validate_project(
    pool: &sqlx::PgPool,
    project_id: DbId,
) -> Result<BatchQaReport, anyhow::Error> {
    // 1. Find all source/variant images in the project
    // 2. Run QA on each
    // 3. Aggregate into report: pass/warn/fail per image per check
    // 4. Sort by quality score (worst first)
    todo!()
}
```

**Acceptance Criteria:**
- [ ] One-click validation of all images in a project
- [ ] Report with pass/warn/fail per image per check
- [ ] Sorted by quality score (worst first)
- [ ] Supports CSV export

---

## Phase 4: API Endpoints

### Task 4.1: Image QA Endpoints
**File:** `src/routes/image_qa_routes.rs`

```rust
/// POST /api/images/:id/qa — Run QA on a specific image
/// GET /api/images/:id/qa-results — Get QA results for an image
/// POST /api/projects/:id/batch-qa — Run batch QA for all project images
/// GET /api/projects/:id/batch-qa-report — Get batch report
/// PUT /api/projects/:id/qa-thresholds — Update project QA thresholds
```

**Acceptance Criteria:**
- [ ] Individual QA trigger and results retrieval
- [ ] Batch QA trigger and report retrieval
- [ ] Threshold configuration per project
- [ ] CSV export for batch reports

---

## Phase 5: Frontend Components

### Task 5.1: QA Results Display
**File:** `frontend/src/components/images/QaResultsCard.tsx`

```typescript
interface QaResultsCardProps {
  scores: QaScore[];
  overallStatus: 'pass' | 'warn' | 'fail';
}

export function QaResultsCard({ scores, overallStatus }: QaResultsCardProps) {
  // Traffic-light indicator per check: green/yellow/red
  // Numeric score next to each check name
  // Expandable details per check
}
```

**Acceptance Criteria:**
- [ ] Traffic-light colors for pass/warn/fail
- [ ] Per-check score and status display
- [ ] Expandable details showing check-specific information
- [ ] Appears immediately in the upload flow

### Task 5.2: Likeness Comparison View
**File:** `frontend/src/components/images/LikenessComparison.tsx`

```typescript
export function LikenessComparison({ sourceUrl, variantUrl, similarityScore }: LikenessComparisonProps) {
  // Three modes: overlay, side-by-side, slider
  // Similarity score prominently displayed
  // Pass/fail indicator based on threshold
}
```

**Acceptance Criteria:**
- [ ] Overlay mode: semi-transparent source over variant
- [ ] Side-by-side mode: source and variant next to each other
- [ ] Slider mode: swipe to transition between source and variant
- [ ] Similarity score and pass/fail threshold shown

### Task 5.3: Batch QA Report View
**File:** `frontend/src/components/images/BatchQaReport.tsx`

```typescript
export function BatchQaReport({ report }: { report: BatchQaReportData }) {
  // Table: image name, check results (traffic-light per column), overall status
  // Sorted by quality (worst first)
  // CSV export button
}
```

**Acceptance Criteria:**
- [ ] Table with all images and check results as traffic-light indicators
- [ ] Sortable by any column
- [ ] Worst-quality images at the top by default
- [ ] CSV export button

---

## Phase 6: Testing

### Task 6.1: QA Check Unit Tests
**File:** `tests/image_qa_test.rs`

**Acceptance Criteria:**
- [ ] Resolution check catches undersized images
- [ ] Format check rejects unsupported formats
- [ ] Face detection catches missing/off-center faces
- [ ] Sharpness check catches blurry images
- [ ] Likeness comparison correctly measures similarity

### Task 6.2: Batch Validation Test
**File:** `tests/batch_qa_test.rs`

**Acceptance Criteria:**
- [ ] Batch validation processes all project images
- [ ] Report sorted by quality score
- [ ] CSV export matches report data

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_qa_check_types.sql` | QA check type lookup table |
| `migrations/YYYYMMDD_create_image_quality_scores.sql` | Per-check quality scores |
| `migrations/YYYYMMDD_create_image_qa_thresholds.sql` | Configurable thresholds |
| `scripts/python/qa_resolution_format.py` | Resolution and format validator |
| `scripts/python/qa_face_detection.py` | Face detection and centering |
| `scripts/python/qa_image_quality.py` | Sharpness, lighting, artifacts |
| `scripts/python/qa_likeness.py` | Source-variant likeness comparison |
| `src/services/image_qa_service.rs` | QA runner orchestrator |
| `src/services/image_qa_batch_service.rs` | Batch validation service |
| `src/routes/image_qa_routes.rs` | QA API endpoints |
| `frontend/src/components/images/QaResultsCard.tsx` | QA results display |
| `frontend/src/components/images/LikenessComparison.tsx` | Likeness comparison view |
| `frontend/src/components/images/BatchQaReport.tsx` | Batch report view |

## Dependencies

### Existing Components to Reuse
- PRD-009: Python runtime for analysis scripts
- PRD-076: Face detection and embeddings (reuse InsightFace for face checks)
- PRD-010: Event bus for QA completion notifications

### New Infrastructure Needed
- OpenCV and PIL Python packages for image analysis
- scikit-image for SSIM metrics (also used by PRD-049)

## Implementation Order

### MVP
1. Phase 1: Database Schema — Tasks 1.1-1.3
2. Phase 2: Python QA Scripts — Tasks 2.1-2.3
3. Phase 3: Rust QA Orchestrator — Task 3.1
4. Phase 4: API Endpoints — Task 4.1
5. Phase 5: Frontend — Task 5.1

**MVP Success Criteria:**
- QA checks run automatically on source image upload
- Per-check pass/warn/fail results visible immediately
- Resolution/format validation catches non-compliant images
- Face detection catches missing or poorly positioned faces

### Post-MVP Enhancements
1. Phase 2: Task 2.4 (Likeness comparison)
2. Phase 3: Task 3.2 (Batch validation)
3. Phase 5: Tasks 5.2-5.3 (Likeness view, batch report)
4. Phase 6: Testing
5. Custom quality rules via hook scripts (PRD-77)

## Notes

1. **Shared face detection:** The face detection check should reuse the same InsightFace model as PRD-076, not instantiate a separate model. The Python runtime (PRD-09) should manage model lifecycle.
2. **Threshold tuning:** Initial thresholds should be conservative (more warnings, fewer hard fails). Studios will tune based on their specific quality needs.
3. **QA timing:** QA runs as a background job after upload. Results appear within 3 seconds for most checks. Likeness comparison requires both source and variant embeddings.

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-022 v1.0

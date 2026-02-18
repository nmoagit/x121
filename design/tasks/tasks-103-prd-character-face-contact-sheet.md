# Task List: Character Face Contact Sheet

**PRD Reference:** `design/prds/103-prd-character-face-contact-sheet.md`
**Scope:** Automated face crop extraction from representative frames across all scenes, displayed as a tiled grid organized by scene type and variant, with comparison overlays, outlier highlighting, and batch PDF export.

## Overview

PRD-094 provides numerical consistency scores, but creative directors assess face consistency visually. A tiled grid of face crops from all of a character's scenes allows instant visual comparison -- spotting the "one that looks different" takes 2 seconds instead of reading a report. This feature extracts face crops from representative frames, displays them in a grid (scene types as columns, variants as rows), overlays the source image for reference, highlights outliers from PRD-094 consistency scores, and exports as single-page PNG/PDF per character or batch multi-page PDF.

### What Already Exists
- PRD-049: Quality gates (face confidence), PRD-076: Identity embedding
- PRD-094: Consistency report (numeric scores), PRD-096: Poster frames

### What We're Building
1. `contact_sheet_images` table for face crop storage
2. Face crop extraction service (Python/OpenCV)
3. Tiled grid display component
4. Source image overlay comparison
5. Outlier highlighting using PRD-094 scores
6. PDF/PNG export service

### Key Design Decisions
1. **Consistent crop padding** — All face crops use the same padding ratio (1.5x face bounding box) for uniform cell sizes.
2. **Lightweight images** — Crops stored as small JPEGs (~200x200px) for fast grid rendering.
3. **Outlier borders** — Red/orange borders on cells below consistency threshold. Border thickness proportional to severity.

---

## Phase 1: Database Schema

### Task 1.1: Contact Sheet Images Table
**File:** `migrations/YYYYMMDD_create_contact_sheet_images.sql`

```sql
CREATE TABLE contact_sheet_images (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_id BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    variant_type TEXT NOT NULL,
    crop_path TEXT NOT NULL,
    source_frame_path TEXT NOT NULL,
    face_confidence DOUBLE PRECISION,
    similarity_to_source DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_sheet_images_character_id ON contact_sheet_images(character_id);
CREATE INDEX idx_contact_sheet_images_scene_id ON contact_sheet_images(scene_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON contact_sheet_images
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

---

## Phase 2: Face Crop Extraction

### Task 2.1: Face Crop Service
**File:** `scripts/python/extract_face_crop.py`

```python
import cv2

def extract_face_crop(image_path: str, bounding_box: dict, padding_ratio: float = 1.5) -> str:
    img = cv2.imread(image_path)
    x, y, w, h = bounding_box['x'], bounding_box['y'], bounding_box['width'], bounding_box['height']
    # Apply padding
    pad_w = int(w * (padding_ratio - 1) / 2)
    pad_h = int(h * (padding_ratio - 1) / 2)
    x1 = max(0, x - pad_w)
    y1 = max(0, y - pad_h)
    x2 = min(img.shape[1], x + w + pad_w)
    y2 = min(img.shape[0], y + h + pad_h)
    crop = img[y1:y2, x1:x2]
    crop = cv2.resize(crop, (200, 200))
    output_path = image_path.replace('.', '_crop.')
    cv2.imwrite(output_path, crop)
    return output_path
```

### Task 2.2: Batch Extraction Orchestrator
**File:** `src/services/contact_sheet_service.rs`

```rust
pub async fn generate_contact_sheet(pool: &sqlx::PgPool, character_id: DbId) -> Result<Vec<DbId>, anyhow::Error> {
    // 1. Get all scenes for the character
    // 2. For each scene: get poster frame or highest face confidence frame
    // 3. Detect face and extract crop (reuse PRD-076 detection)
    // 4. Store crop with metadata
    // 5. Return crop IDs
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Extracts from poster frame (PRD-096) or best face frame (PRD-049)
- [ ] Consistent padding ratio for uniform cells
- [ ] Stored as lightweight images for fast display
- [ ] Generates in <10 seconds per character

---

## Phase 3: Export Service

### Task 3.1: Contact Sheet Export
**File:** `src/services/contact_sheet_export_service.rs`

```rust
pub async fn export_contact_sheet_png(pool: &sqlx::PgPool, character_id: DbId) -> Result<String, anyhow::Error> {
    // Compose tiled grid into a single PNG
    // Include character name, project, date
    todo!()
}

pub async fn export_batch_pdf(pool: &sqlx::PgPool, project_id: DbId) -> Result<String, anyhow::Error> {
    // Multi-page PDF, one page per character
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Single PNG/PDF per character
- [ ] Includes character name, project, generation date
- [ ] Batch PDF: multi-page, one per character
- [ ] Batch export in <2 minutes for 20 characters

---

## Phase 4: API & Frontend

### Task 4.1: Contact Sheet API
**File:** `src/routes/contact_sheet_routes.rs`

```rust
/// POST /api/characters/:id/contact-sheet — Generate contact sheet
/// GET /api/characters/:id/contact-sheet/image — Get rendered image
/// POST /api/projects/:id/batch-contact-sheets — Batch generation
```

### Task 4.2: Tiled Grid Component
**File:** `frontend/src/components/contact-sheet/ContactSheetGrid.tsx`

```typescript
export function ContactSheetGrid({ crops, outlierThreshold }: ContactSheetGridProps) {
  // Columns: scene types; Rows: variants
  // Scene type and variant labels
  // Outlier cells: colored border (red/orange)
  // Click cell: navigate to scene review
}
```

**Acceptance Criteria:**
- [ ] Grid: scene types as columns, variants as rows
- [ ] Labels for orientation
- [ ] Outlier highlighting using PRD-094 thresholds
- [ ] Click to navigate to scene review

### Task 4.3: Source Image Overlay
**File:** `frontend/src/components/contact-sheet/SourceOverlay.tsx`

**Acceptance Criteria:**
- [ ] Toggle overlay showing source face on each cell
- [ ] Semi-transparent overlay
- [ ] Deviations visible through overlay

---

## Phase 5: Testing

### Task 5.1: Contact Sheet Tests
**File:** `tests/contact_sheet_test.rs`

**Acceptance Criteria:**
- [ ] Crops extracted with consistent sizing
- [ ] Grid renders correctly
- [ ] Outlier highlighting matches PRD-094 scores
- [ ] Export produces valid PNG/PDF

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_contact_sheet_images.sql` | Crop storage |
| `scripts/python/extract_face_crop.py` | Face crop extraction |
| `src/services/contact_sheet_service.rs` | Orchestrator |
| `src/services/contact_sheet_export_service.rs` | PNG/PDF export |
| `src/routes/contact_sheet_routes.rs` | Contact sheet API |
| `frontend/src/components/contact-sheet/ContactSheetGrid.tsx` | Grid display |
| `frontend/src/components/contact-sheet/SourceOverlay.tsx` | Overlay comparison |

## Implementation Order

### MVP
1. Phase 1 — Task 1.1
2. Phase 2 — Tasks 2.1-2.2
3. Phase 4 — Tasks 4.1-4.2

### Post-MVP
1. Phase 3 — Task 3.1 (Export)
2. Phase 4 — Task 4.3 (Overlay)
3. Historical comparison (before/after contact sheets)

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-103 v1.0

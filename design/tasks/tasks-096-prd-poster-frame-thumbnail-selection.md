# Task List: Poster Frame & Thumbnail Selection

**PRD Reference:** `design/prds/096-prd-poster-frame-thumbnail-selection.md`
**Scope:** Build manual poster frame selection from the review player, character and scene-level poster management, crop/adjust tools, auto-select using face confidence, and a project-wide poster frame gallery.

## Overview

Auto-generated thumbnails (typically first frame) are often unrepresentative. A manually selected hero frame dramatically improves the visual quality of the entire platform's UI. This PRD provides: manual frame selection from the review player with a "Set as Poster Frame" button; character-level poster frames used across library, dashboard, search, and shared links; scene-level poster frames for scene lists and comparison views; a poster frame gallery for project-wide overview; light crop/adjust tools; auto-select using face confidence scores; and version persistence across regeneration cycles.

### What Already Exists
- PRD-049 Automated Quality Gates (face confidence scoring for auto-select)
- PRD-060 Character Library (poster frame display context)
- PRD-083 Video playback engine (frame selection interface)
- PRD-000 database infrastructure

### What We're Building
1. Poster frame selection UI in the review player
2. Character-level poster frame management
3. Scene-level poster frame management
4. Project-wide poster frame gallery
5. Crop and brightness/contrast adjustment tools
6. Auto-select algorithm using face confidence scores
7. Version persistence across regeneration
8. Database table and API for poster frames

### Key Design Decisions
1. **Frame extracted as static image** — Selected frame is extracted and stored as a JPEG/WebP, not just a pointer to a frame number.
2. **Two levels: character and scene** — Character poster is platform-wide; scene poster is per-scene-list.
3. **Auto-select uses face confidence** — PRD-049 face confidence score identifies the best frame.
4. **Crop/adjust is lightweight** — Not a photo editor; just enough for a good thumbnail.

---

## Phase 1: Database & API

### Task 1.1: Create Poster Frames Table
**File:** `migrations/YYYYMMDD_create_poster_frames.sql`

```sql
CREATE TABLE poster_frames (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,          -- 'character' | 'scene'
    entity_id BIGINT NOT NULL,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    frame_number INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    crop_settings_json JSONB,           -- { "x": 0, "y": 0, "width": 100, "height": 100, "aspectRatio": "1:1" }
    brightness REAL NOT NULL DEFAULT 1.0,
    contrast REAL NOT NULL DEFAULT 1.0,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_poster_frames_entity ON poster_frames(entity_type, entity_id);
CREATE INDEX idx_poster_frames_segment_id ON poster_frames(segment_id);
CREATE INDEX idx_poster_frames_created_by ON poster_frames(created_by);
CREATE UNIQUE INDEX uq_poster_frames_entity ON poster_frames(entity_type, entity_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON poster_frames
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `poster_frames` stores entity reference, frame number, image path, and crop/adjust settings
- [ ] Unique constraint on (entity_type, entity_id) — one poster per entity
- [ ] All FK columns indexed, `updated_at` trigger applied

### Task 1.2: Poster Frame Model & Repository
**File:** `src/models/poster_frame.rs`, `src/repositories/poster_frame_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PosterFrame {
    pub id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub segment_id: DbId,
    pub frame_number: i32,
    pub image_path: String,
    pub crop_settings_json: Option<serde_json::Value>,
    pub brightness: f32,
    pub contrast: f32,
    pub created_by: DbId,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] Model and repository with upsert and query operations
- [ ] `get_poster(entity_type, entity_id)` returns current poster
- [ ] `get_project_gallery(project_id)` returns all character posters for a project
- [ ] Unit tests

### Task 1.3: Poster Frame API
**File:** `src/routes/poster_frame.rs`

```rust
pub fn poster_frame_routes() -> Router<AppState> {
    Router::new()
        .route("/scenes/:id/poster-frame", post(set_scene_poster))
        .route("/characters/:id/poster-frame", post(set_character_poster))
        .route("/projects/:id/poster-gallery", get(poster_gallery))
        .route("/projects/:id/auto-select-posters", post(auto_select_posters))
}
```

**Acceptance Criteria:**
- [ ] `POST /scenes/:id/poster-frame` sets poster from frame number + segment
- [ ] `POST /characters/:id/poster-frame` sets character poster
- [ ] `GET /projects/:id/poster-gallery` returns all character poster frames
- [ ] `POST /projects/:id/auto-select-posters` auto-selects using face confidence

---

## Phase 2: Frame Selection UI

### Task 2.1: Set Poster Frame Button
**File:** `frontend/src/features/poster-frame/SetPosterButton.tsx`

**Acceptance Criteria:**
- [ ] "Set as Poster Frame" button visible in PRD-035/PRD-083 player
- [ ] Uses current frame as the scene or character thumbnail
- [ ] Selected frame extracted and stored as a static image
- [ ] Extraction completes in <1 second

### Task 2.2: Frame Extraction Service
**File:** `src/services/frame_extractor.rs`

```rust
pub struct FrameExtractor {
    // Extract a specific frame from a video file as a static image
}

impl FrameExtractor {
    pub async fn extract_frame(
        &self,
        video_path: &str,
        frame_number: i32,
        output_format: &str,  // "jpeg" | "webp"
    ) -> Result<String>;  // Returns path to extracted image
}
```

**Acceptance Criteria:**
- [ ] Extract specific frame from video as JPEG or WebP
- [ ] Extraction completes in <1 second
- [ ] Output at full video frame resolution

---

## Phase 3: Character & Scene Posters

### Task 3.1: Character Poster Management
**File:** `frontend/src/features/poster-frame/CharacterPoster.tsx`

**Acceptance Criteria:**
- [ ] Character poster appears in: library views, dashboard widgets, search results, shared links
- [ ] Defaults to keyframe from first approved scene if not manually set
- [ ] One-click override from any scene's poster frame
- [ ] Poster visible across all dependent PRDs (PRD-060, PRD-042, PRD-020, PRD-084)

### Task 3.2: Scene Poster Management
**File:** `frontend/src/features/poster-frame/ScenePoster.tsx`

**Acceptance Criteria:**
- [ ] Poster per scene used in: scene list, batch orchestrator grid, comparison views
- [ ] Defaults to first frame of first segment
- [ ] Override from any frame within the scene's segments

---

## Phase 4: Poster Frame Gallery

### Task 4.1: Project Gallery View
**File:** `frontend/src/features/poster-frame/PosterGallery.tsx`

**Acceptance Criteria:**
- [ ] Grid view of all poster frames for a project's characters
- [ ] Quickly identify characters with weak or unrepresentative thumbnails
- [ ] Click to navigate to character detail for re-selection
- [ ] Bulk "Auto-select best frame" action

---

## Phase 5: Crop & Adjust

### Task 5.1: Crop and Adjust Tool
**File:** `frontend/src/features/poster-frame/CropAdjust.tsx`

**Acceptance Criteria:**
- [ ] Crop to aspect ratio: square (1:1), 16:9, 4:3, custom
- [ ] Brightness/contrast adjustment sliders
- [ ] Preview before saving
- [ ] Lightweight — not a full image editor
- [ ] Adjustments stored as metadata (applied on render, not destructive)

---

## Phase 6: Auto-Select & Version Persistence

### Task 6.1: Auto-Select Service
**File:** `src/services/poster_auto_select.rs`

```rust
pub struct PosterAutoSelector {
    // Uses PRD-049 face confidence scores to identify best frame
}

impl PosterAutoSelector {
    pub async fn auto_select(&self, character_id: DbId) -> Result<PosterFrame> {
        // Scan all approved segments for this character
        // Find the frame with highest face confidence score
        // Extract and store as poster
    }
}
```

**Acceptance Criteria:**
- [ ] Auto-select identifies highest face-quality frame in >90% of cases
- [ ] Processes batch auto-select for entire project
- [ ] Uses PRD-049 face confidence scores

### Task 6.2: Version Persistence
**File:** `src/services/poster_version_handler.rs`

**Acceptance Criteria:**
- [ ] When scene is regenerated, poster frame persists if selected frame still exists
- [ ] If segment was regenerated, user prompted to select new poster
- [ ] Previous poster available for reference during re-selection

---

## Phase 7: Testing

### Task 7.1: Comprehensive Tests
**File:** `tests/poster_frame_test.rs`, `frontend/src/features/poster-frame/__tests__/`

**Acceptance Criteria:**
- [ ] Poster frame extraction in <1 second
- [ ] Poster frames display correctly in all dependent views
- [ ] Auto-select correctly identifies best face-quality frame in >90% of cases
- [ ] Crop/adjust previews correctly before saving
- [ ] Version persistence works across regeneration cycles

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_poster_frames.sql` | Poster frames table |
| `src/models/poster_frame.rs` | Rust model struct |
| `src/repositories/poster_frame_repo.rs` | Poster frame repository |
| `src/routes/poster_frame.rs` | Axum API endpoints |
| `src/services/frame_extractor.rs` | Frame extraction service |
| `src/services/poster_auto_select.rs` | Auto-select using face confidence |
| `frontend/src/features/poster-frame/SetPosterButton.tsx` | Selection button |
| `frontend/src/features/poster-frame/PosterGallery.tsx` | Project gallery |
| `frontend/src/features/poster-frame/CropAdjust.tsx` | Crop/adjust tool |

## Dependencies
- PRD-049: Automated Quality Gates (face confidence for auto-select)
- PRD-060: Character Library (poster display context)
- PRD-083: Video playback engine (frame selection)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — poster frame storage and endpoints
2. Phase 2 (Selection UI) — "Set as Poster" button and frame extraction
3. Phase 3 (Character & Scene) — poster management for both entity types
4. Phase 4 (Gallery) — project-wide poster overview
5. Phase 5 (Crop & Adjust) — lightweight editing tools
6. Phase 6 (Auto-Select) — face confidence-based selection

### Post-MVP Enhancements
- Animated poster frames: 1-2 second GIF/WebP clips that play on hover

## Notes
- Small feature with outsized impact on perceived production quality.
- "Set as Poster Frame" should be easily accessible during review (keyboard shortcut or floating button).
- Crop/adjust is intentionally minimal — just enough for a good thumbnail, not a photo editor.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

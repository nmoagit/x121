# Task List: Scene Assembler & Delivery Packaging

**PRD Reference:** `design/prds/039-prd-scene-assembler-delivery-packaging.md`
**Scope:** Build the automated pipeline that concatenates approved segments into final scene videos, applies naming conventions and watermarking, supports output format profiles, and packages per-character folders and project ZIP exports with delivery validation.

## Overview

This PRD bridges the gap between "all scenes approved" and "deliverable output." It replaces the manual `rename_videos.py` step with automated naming, provides configurable watermarking for review vs. final delivery, and handles the full packaging pipeline from segment concatenation through ZIP export. Every video operation is orchestrated by Rust and delegated to FFmpeg for actual media processing.

### What Already Exists
- PRD-01 data model with naming convention rules
- PRD-24 segment structure and generation metadata
- PRD-35 review interface with approval status tracking
- Status lookup tables from PRD-000 (job_statuses, scene_statuses, segment_statuses)

### What We're Building
1. Database tables for output format profiles and delivery exports
2. Rust service for FFmpeg-based segment concatenation and transcoding
3. Automatic naming engine derived from scene metadata
4. Configurable watermarking system for review cuts
5. Per-character folder packaging and project ZIP streaming export
6. Delivery validation engine (completeness, naming, approval checks)
7. Incremental re-export capability
8. React UI for export configuration, progress, and validation results

### Key Design Decisions
1. **FFmpeg orchestration from Rust** -- All video operations (concat, transcode, watermark) delegate to FFmpeg via command-line invocation, not a Rust media library. FFmpeg is battle-tested for this.
2. **Streaming ZIP** -- ZIP export streams to the client to avoid materializing the full archive in memory. Use `async-zip` or equivalent.
3. **Output format profiles are reusable** -- Profiles are project-independent; a "1080p H.264 8Mbps" profile can be shared across projects.
4. **Lossless concat when possible** -- When all segments share codec/resolution/framerate, use `ffmpeg -c copy` (stream copy). Re-encode only when there is a mismatch.

---

## Phase 1: Database Schema

### Task 1.1: Output Format Profiles Table
**File:** `migrations/YYYYMMDDHHMMSS_create_output_format_profiles.sql`

Create the table for reusable delivery format specifications.

```sql
CREATE TABLE output_format_profiles (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    resolution TEXT NOT NULL,          -- e.g., '1920x1080'
    codec TEXT NOT NULL,               -- e.g., 'h264', 'h265', 'prores'
    container TEXT NOT NULL,           -- e.g., 'mp4', 'mov'
    bitrate_kbps INTEGER,             -- NULL = auto/CRF mode
    framerate REAL,                    -- NULL = match source
    pixel_format TEXT,                 -- e.g., 'yuv420p'
    extra_ffmpeg_args TEXT,           -- additional FFmpeg flags
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_output_format_profiles_name ON output_format_profiles(name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON output_format_profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Table uses `BIGSERIAL PRIMARY KEY` and `TIMESTAMPTZ` timestamps
- [ ] Unique constraint on `name`
- [ ] `updated_at` trigger attached
- [ ] Migration applies cleanly

### Task 1.2: Delivery Export Statuses Lookup Table
**File:** `migrations/YYYYMMDDHHMMSS_create_delivery_export_statuses.sql`

```sql
CREATE TABLE delivery_export_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON delivery_export_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO delivery_export_statuses (name, description) VALUES
    ('pending', 'Export is queued'),
    ('assembling', 'Segments are being concatenated'),
    ('transcoding', 'Videos are being transcoded to output profiles'),
    ('packaging', 'Character folders and ZIP are being built'),
    ('validating', 'Delivery validation is running'),
    ('completed', 'Export finished successfully'),
    ('failed', 'Export encountered an error');
```

**Acceptance Criteria:**
- [ ] Follows status lookup table convention from PRD-000
- [ ] Seven statuses seeded covering the full export lifecycle

### Task 1.3: Delivery Exports Table
**File:** `migrations/YYYYMMDDHHMMSS_create_delivery_exports.sql`

```sql
CREATE TABLE delivery_exports (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    format_profile_id BIGINT NOT NULL REFERENCES output_format_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status_id BIGINT NOT NULL REFERENCES delivery_export_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    exported_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    characters_json JSONB,            -- array of character IDs included
    file_path TEXT,                    -- path to final ZIP or export directory
    file_size_bytes BIGINT,
    validation_results_json JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_exports_project_id ON delivery_exports(project_id);
CREATE INDEX idx_delivery_exports_format_profile_id ON delivery_exports(format_profile_id);
CREATE INDEX idx_delivery_exports_status_id ON delivery_exports(status_id);
CREATE INDEX idx_delivery_exports_exported_by ON delivery_exports(exported_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON delivery_exports
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] All FKs are `BIGINT` with explicit `ON DELETE`/`ON UPDATE` rules
- [ ] All FK columns have indexes
- [ ] JSONB used for flexible character list and validation results
- [ ] Migration applies cleanly

### Task 1.4: Watermark Settings Table
**File:** `migrations/YYYYMMDDHHMMSS_create_watermark_settings.sql`

```sql
CREATE TABLE watermark_settings (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    watermark_type TEXT NOT NULL CHECK (watermark_type IN ('text', 'image')),
    content TEXT NOT NULL,             -- text string or image file path
    position TEXT NOT NULL DEFAULT 'center' CHECK (position IN ('center', 'top_left', 'top_right', 'bottom_left', 'bottom_right')),
    opacity REAL NOT NULL DEFAULT 0.3 CHECK (opacity >= 0.0 AND opacity <= 1.0),
    include_timecode BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON watermark_settings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] CHECK constraints enforce valid watermark types and positions
- [ ] Opacity range is 0.0 to 1.0
- [ ] Table follows all schema conventions

---

## Phase 2: Rust Backend -- Models & Service Layer

### Task 2.1: Output Format Profile Model & CRUD
**File:** `src/models/output_format_profile.rs`

Define the SQLx model and implement full CRUD operations.

```rust
use crate::types::DbId;
use sqlx::FromRow;

#[derive(Debug, FromRow)]
pub struct OutputFormatProfile {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub resolution: String,
    pub codec: String,
    pub container: String,
    pub bitrate_kbps: Option<i32>,
    pub framerate: Option<f32>,
    pub pixel_format: Option<String>,
    pub extra_ffmpeg_args: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] All ID fields use `DbId` (i64)
- [ ] CRUD functions: `create`, `get_by_id`, `list_all`, `update`, `delete`
- [ ] Validation: name uniqueness checked before insert
- [ ] Unit tests for each CRUD operation

### Task 2.2: Delivery Export Model
**File:** `src/models/delivery_export.rs`

```rust
#[derive(Debug, FromRow)]
pub struct DeliveryExport {
    pub id: DbId,
    pub project_id: DbId,
    pub format_profile_id: DbId,
    pub status_id: DbId,
    pub exported_by: DbId,
    pub characters_json: Option<serde_json::Value>,
    pub file_path: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub validation_results_json: Option<serde_json::Value>,
    pub error_message: Option<String>,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] Model maps all columns from `delivery_exports` table
- [ ] Functions: `create`, `get_by_id`, `list_by_project`, `update_status`, `set_completed`
- [ ] Status transitions logged with timestamp updates

### Task 2.3: Naming Engine Service
**File:** `src/services/naming_engine.rs`

Implement the PRD-01 naming convention logic that derives filenames from scene metadata.

```rust
pub struct NamingEngine;

impl NamingEngine {
    /// Derives the filename for a scene video based on metadata.
    /// Pattern: {prefix}{content}{suffix}{index}.{ext}
    /// prefix = "topless_" if image variant is topless, else ""
    /// content = scene type name (snake_case)
    /// suffix = "_clothes_off" for transition scenes
    /// index = "_N" when multiple scenes of the same type exist
    pub fn derive_filename(scene: &SceneMetadata) -> String {
        // ...
    }
}
```

**Acceptance Criteria:**
- [ ] Derives prefix from image variant
- [ ] Derives content from scene type name
- [ ] Appends `_clothes_off` for transition scenes
- [ ] Appends `_N` index for duplicate scene types
- [ ] Unit tests cover all naming permutations

### Task 2.4: Concatenation Service
**File:** `src/services/concatenation.rs`

Orchestrate FFmpeg to join approved segments into final scene videos.

```rust
pub struct ConcatenationService {
    ffmpeg_path: String,
    temp_dir: PathBuf,
}

impl ConcatenationService {
    /// Concatenate segments into a single scene video.
    /// Uses stream copy when codecs match, re-encodes when they differ.
    pub async fn concatenate_segments(
        &self,
        segment_paths: &[PathBuf],
        output_path: &PathBuf,
        force_reencode: bool,
    ) -> Result<ConcatResult, ConcatError> {
        // 1. Probe all segments for codec/resolution/framerate
        // 2. If all match and !force_reencode: use concat demuxer with -c copy
        // 3. If mismatch: re-encode to common format
        // 4. Return result with duration, file size
    }
}
```

**Acceptance Criteria:**
- [ ] Lossless concatenation (stream copy) when all segments match
- [ ] Re-encode path for mismatched codecs/resolutions
- [ ] Segment ordering follows generation sequence
- [ ] Error handling for missing files, FFmpeg failures
- [ ] Integration test with sample video files

### Task 2.5: Watermarking Service
**File:** `src/services/watermarking.rs`

Apply configurable watermarks to review cuts using FFmpeg filters.

**Acceptance Criteria:**
- [ ] Text overlay via `drawtext` FFmpeg filter
- [ ] Image overlay via `overlay` FFmpeg filter
- [ ] Position configurable (center, four corners)
- [ ] Opacity applied correctly
- [ ] Optional timecode burn-in
- [ ] Clean (unwatermarked) output path for final delivery

### Task 2.6: Transcoding Service
**File:** `src/services/transcoding.rs`

Transcode assembled scene videos to each output format profile.

**Acceptance Criteria:**
- [ ] Takes assembled scene video and `OutputFormatProfile` as input
- [ ] Generates transcoded output matching profile specs (resolution, codec, bitrate, container)
- [ ] Progress reporting via callback
- [ ] Handles CRF mode when bitrate is NULL

---

## Phase 3: Packaging & Export

### Task 3.1: Per-Character Packaging Service
**File:** `src/services/character_packager.rs`

Assemble all approved scene videos for a character into a delivery folder.

```rust
pub struct CharacterPackager;

impl CharacterPackager {
    /// Package all approved scenes for a character into a folder structure:
    /// character_name/
    ///   metadata.json
    ///   clothed.png
    ///   topless.png
    ///   scene_video_1.mp4
    ///   scene_video_2.mp4
    pub async fn package_character(
        &self,
        character_id: DbId,
        output_dir: &Path,
        profile: &OutputFormatProfile,
    ) -> Result<PackageResult, PackageError> { ... }
}
```

**Acceptance Criteria:**
- [ ] Includes `metadata.json`, `clothed.png`, `topless.png` alongside videos
- [ ] Folder structure matches PRD-01 delivery specification
- [ ] All video filenames follow naming convention from Task 2.3
- [ ] Returns manifest of all packaged files

### Task 3.2: Project ZIP Export Service
**File:** `src/services/zip_exporter.rs`

Stream a ZIP archive containing all character folders.

**Acceptance Criteria:**
- [ ] Packages all character folders into a single ZIP
- [ ] Supports exporting per output format profile
- [ ] Streaming ZIP to avoid large memory allocation (use `async-zip` or equivalent)
- [ ] ZIP structure matches downstream delivery contract
- [ ] Progress reporting per character

### Task 3.3: Delivery Validation Service
**File:** `src/services/delivery_validator.rs`

Pre-export completeness and correctness checks.

```rust
pub struct DeliveryValidator;

#[derive(Debug)]
pub struct ValidationResult {
    pub passed: bool,
    pub issues: Vec<ValidationIssue>,
}

#[derive(Debug)]
pub struct ValidationIssue {
    pub severity: IssueSeverity,   // Error, Warning
    pub category: String,          // "missing_scene", "naming", "unapproved"
    pub message: String,
    pub entity_id: Option<DbId>,
}
```

**Acceptance Criteria:**
- [ ] Verifies all expected scenes are present and approved
- [ ] Verifies all required files exist (metadata, images, videos)
- [ ] Verifies naming follows convention
- [ ] Warns on missing scenes before allowing export
- [ ] Returns structured result with actionable issue descriptions

### Task 3.4: Incremental Re-Export Service
**File:** `src/services/incremental_export.rs`

Re-export only changed character folders when a scene is re-done.

**Acceptance Criteria:**
- [ ] Detects which characters have changed since last export
- [ ] Re-exports only affected character folders
- [ ] Updates the archive without rebuilding the entire ZIP
- [ ] Previous export record updated with diff information

---

## Phase 4: API Endpoints

### Task 4.1: Output Format Profile CRUD Routes
**File:** `src/routes/output_format_profiles.rs`

```
GET    /output-format-profiles          -- List all profiles
POST   /output-format-profiles          -- Create a new profile
GET    /output-format-profiles/:id      -- Get profile by ID
PUT    /output-format-profiles/:id      -- Update profile
DELETE /output-format-profiles/:id      -- Delete profile
```

**Acceptance Criteria:**
- [ ] All routes follow Axum patterns
- [ ] Input validation on create/update (required fields, valid codec/container)
- [ ] Prevent deletion of profiles referenced by existing exports
- [ ] JSON responses with proper error codes

### Task 4.2: Assembly & Export Routes
**File:** `src/routes/delivery.rs`

```
POST   /projects/:id/assemble          -- Start assembly pipeline
POST   /projects/:id/export-zip        -- Generate and stream ZIP
GET    /projects/:id/delivery-validation -- Run validation checks
GET    /projects/:id/exports            -- List export history
GET    /projects/:id/exports/:export_id -- Get export details
```

**Acceptance Criteria:**
- [ ] Assembly is async -- returns export ID, progress polled separately
- [ ] ZIP export streams response (chunked transfer encoding)
- [ ] Validation returns structured JSON with pass/fail per check
- [ ] Export history supports pagination

### Task 4.3: Watermark Settings Routes
**File:** `src/routes/watermark_settings.rs`

CRUD routes for watermark configurations.

**Acceptance Criteria:**
- [ ] Standard CRUD pattern
- [ ] Validation for watermark type, position, opacity range
- [ ] Preview endpoint that generates a sample watermarked frame

---

## Phase 5: React Frontend

### Task 5.1: Output Format Profile Manager
**File:** `frontend/src/pages/OutputFormatProfiles.tsx`

Admin page for managing output format profiles.

**Acceptance Criteria:**
- [ ] List all profiles with name, resolution, codec, bitrate
- [ ] Create/edit form with validation
- [ ] Delete with confirmation (blocked if in use)
- [ ] Follows design system patterns

### Task 5.2: Export Configuration & Progress Panel
**File:** `frontend/src/components/delivery/ExportPanel.tsx`

UI for configuring and monitoring exports.

**Acceptance Criteria:**
- [ ] Select characters to include (or all)
- [ ] Select output format profile
- [ ] Choose between review cut (watermarked) and final delivery (clean)
- [ ] Progress display: per-character, per-profile status
- [ ] Download button when export completes

### Task 5.3: Delivery Validation View
**File:** `frontend/src/components/delivery/ValidationReport.tsx`

Display validation results with actionable items.

**Acceptance Criteria:**
- [ ] Pass/fail summary with counts
- [ ] Per-issue detail with link to affected entity
- [ ] Clear visual distinction between errors (blocking) and warnings
- [ ] "Run Validation" button triggers check

### Task 5.4: Export History Panel
**File:** `frontend/src/components/delivery/ExportHistory.tsx`

**Acceptance Criteria:**
- [ ] List past exports with date, profile, status, size
- [ ] Download link for completed exports
- [ ] Re-export button for incremental re-export

---

## Phase 6: Integration Testing

### Task 6.1: Concatenation Integration Tests
**File:** `tests/concatenation_test.rs`

**Acceptance Criteria:**
- [ ] Test lossless concatenation with matching segments
- [ ] Test re-encode path with mismatched segments
- [ ] Test error handling for missing/corrupted segment files
- [ ] Verify output duration equals sum of segment durations

### Task 6.2: Naming Engine Tests
**File:** `tests/naming_engine_test.rs`

**Acceptance Criteria:**
- [ ] Test all naming permutations (prefix, content, suffix, index)
- [ ] Test edge cases: single scene type, many duplicate types
- [ ] Verify no manual rename would be needed for any test case

### Task 6.3: End-to-End Export Pipeline Test
**File:** `tests/export_pipeline_test.rs`

**Acceptance Criteria:**
- [ ] Test full pipeline: validation -> assembly -> transcode -> package -> ZIP
- [ ] Verify ZIP structure matches delivery specification
- [ ] Verify incremental re-export produces correct partial update
- [ ] Test export failure recovery (cleanup of partial artifacts)

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_output_format_profiles.sql` | Output format profile table |
| `migrations/YYYYMMDDHHMMSS_create_delivery_export_statuses.sql` | Delivery export status lookup |
| `migrations/YYYYMMDDHHMMSS_create_delivery_exports.sql` | Export tracking table |
| `migrations/YYYYMMDDHHMMSS_create_watermark_settings.sql` | Watermark configuration table |
| `src/models/output_format_profile.rs` | Profile SQLx model and CRUD |
| `src/models/delivery_export.rs` | Export record model |
| `src/services/naming_engine.rs` | PRD-01 naming convention logic |
| `src/services/concatenation.rs` | FFmpeg segment concatenation |
| `src/services/watermarking.rs` | FFmpeg watermark overlay |
| `src/services/transcoding.rs` | FFmpeg format transcoding |
| `src/services/character_packager.rs` | Per-character folder builder |
| `src/services/zip_exporter.rs` | Streaming ZIP export |
| `src/services/delivery_validator.rs` | Pre-export validation checks |
| `src/services/incremental_export.rs` | Partial re-export logic |
| `src/routes/output_format_profiles.rs` | Profile CRUD API |
| `src/routes/delivery.rs` | Assembly and export API |
| `src/routes/watermark_settings.rs` | Watermark config API |
| `frontend/src/pages/OutputFormatProfiles.tsx` | Profile management UI |
| `frontend/src/components/delivery/ExportPanel.tsx` | Export config and progress |
| `frontend/src/components/delivery/ValidationReport.tsx` | Validation results display |
| `frontend/src/components/delivery/ExportHistory.tsx` | Past exports list |

## Dependencies

### Upstream PRDs (must exist first)
- PRD-01: Data model with naming conventions and project/character/scene structure
- PRD-24: Segment structure and generation metadata
- PRD-35: Review interface and approval status

### Downstream PRDs (depend on this)
- PRD-57: Batch Orchestrator references delivery pipeline
- PRD-72: Project Lifecycle uses delivery state
- PRD-84: External Review Links use watermarked previews
- PRD-102: Video Compliance Checker validates against output profiles

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.4)
2. Phase 2: Rust Backend -- Models & Service Layer (Tasks 2.1-2.6)
3. Phase 3: Packaging & Export (Tasks 3.1-3.4)
4. Phase 4: API Endpoints (Tasks 4.1-4.3)

**MVP Success Criteria:**
- Segments concatenate into scene videos with correct naming
- Watermarked review cuts and clean final delivery versions produced
- Output format profiles enable multi-target transcoding
- Delivery validation catches missing/unapproved scenes
- ZIP export streams without exceeding 2x output size in memory

### Post-MVP Enhancements
1. Phase 5: React Frontend (Tasks 5.1-5.4)
2. Phase 6: Integration Testing (Tasks 6.1-6.3)
3. Delivery history tracking (PRD Requirement 2.1)

## Notes

1. **FFmpeg must be installed on the server** -- All video operations shell out to FFmpeg. Ensure it is available in PATH.
2. **Temp directory management** -- Concatenation and transcoding produce intermediate files. These must be cleaned up after export completes or fails.
3. **Large project exports** -- For projects with 50+ characters, ZIP export could be multi-GB. Streaming is essential.
4. **Incremental re-export** -- Track last-exported timestamps per character to detect changes. Compare `updated_at` on scene records.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-039

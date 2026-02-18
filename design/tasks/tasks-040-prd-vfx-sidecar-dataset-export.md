# Task List: VFX Sidecar & Dataset Export

**PRD Reference:** `design/prds/040-prd-vfx-sidecar-dataset-export.md`
**Scope:** Build automated VFX sidecar file generation (XML/CSV technical metadata alongside videos) and one-click training dataset export with structured metadata for ML pipelines.

## Overview

AI-generated video content often feeds into professional VFX pipelines or becomes training data for future models. This feature generates VFX-standard sidecar files containing technical metadata per video (resolution, framerate, codec, generation parameters, per-frame quality metrics) and packages selected segments as structured training datasets with proper metadata manifests. The sidecar generator produces files matching common VFX tool templates (Nuke, After Effects, Resolve), while the dataset exporter packages video/image data with JSON manifests compatible with standard ML training data loaders.

### What Already Exists
- PRD-39 Scene Assembler provides the export pipeline foundation
- PRD-24 generation parameters stored per segment
- PRD-49 quality scores per segment
- PRD-17 asset registry for model/LoRA tracking

### What We're Building
1. Database table for sidecar templates
2. Rust sidecar generator service (XML/CSV serialization)
3. Configurable sidecar template engine with preview
4. Training dataset packaging service with manifest builder
5. API endpoints for sidecar and dataset export
6. React UI for export configuration and template management

### Key Design Decisions
1. **Templates are JSON-defined** -- Sidecar templates define field mappings and output format, stored as JSON in the database and rendered by a template engine.
2. **XML and CSV both supported** -- XML for VFX tools expecting structured metadata; CSV for frame-level data analysis.
3. **Dataset manifests use standard format** -- JSON manifest compatible with common ML data loaders (HuggingFace datasets, PyTorch DataLoader).
4. **Sidecar naming matches video naming** -- `scene_video.mp4` produces `scene_video.xml` and `scene_video.csv`.

---

## Phase 1: Database Schema

### Task 1.1: Sidecar Templates Table
**File:** `migrations/YYYYMMDDHHMMSS_create_sidecar_templates.sql`

```sql
CREATE TABLE sidecar_templates (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    format TEXT NOT NULL CHECK (format IN ('xml', 'csv')),
    target_tool TEXT,                  -- e.g., 'nuke', 'after_effects', 'resolve', 'custom'
    template_json JSONB NOT NULL,      -- field mapping and formatting rules
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sidecar_templates_created_by ON sidecar_templates(created_by);
CREATE UNIQUE INDEX uq_sidecar_templates_name ON sidecar_templates(name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON sidecar_templates
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `BIGSERIAL PRIMARY KEY`, `TIMESTAMPTZ` timestamps, `updated_at` trigger
- [ ] CHECK constraint on `format` column
- [ ] `template_json` stores field mappings as JSONB
- [ ] `is_builtin` flag distinguishes platform-provided vs. custom templates

### Task 1.2: Seed Built-in Sidecar Templates
**File:** `migrations/YYYYMMDDHHMMSS_seed_sidecar_templates.sql`

Populate with default templates for common VFX tools.

```sql
INSERT INTO sidecar_templates (name, description, format, target_tool, template_json, is_builtin) VALUES
    ('Nuke XML', 'Foundry Nuke compatible XML sidecar', 'xml', 'nuke',
     '{"root_element": "clip", "fields": ["resolution", "framerate", "codec", "duration", "color_space", "generation_params"]}'::jsonb,
     true),
    ('After Effects CSV', 'Adobe After Effects frame-level CSV', 'csv', 'after_effects',
     '{"columns": ["frame", "face_confidence", "motion_score", "quality_metric", "boundary_ssim"]}'::jsonb,
     true),
    ('Resolve XML', 'DaVinci Resolve compatible XML sidecar', 'xml', 'resolve',
     '{"root_element": "media", "fields": ["resolution", "framerate", "codec", "duration", "pixel_format"]}'::jsonb,
     true);
```

**Acceptance Criteria:**
- [ ] Three built-in templates seeded: Nuke, After Effects, Resolve
- [ ] Templates have appropriate field definitions for each tool
- [ ] `is_builtin` set to `true` for all seeded templates

### Task 1.3: Dataset Exports Table
**File:** `migrations/YYYYMMDDHHMMSS_create_dataset_exports.sql`

```sql
CREATE TABLE dataset_exports (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT NOT NULL,
    config_json JSONB NOT NULL,        -- filters, split config, quality thresholds
    manifest_json JSONB,               -- generated manifest with sample paths
    file_path TEXT,                     -- path to exported ZIP
    file_size_bytes BIGINT,
    sample_count INTEGER,
    status_id BIGINT NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    exported_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dataset_exports_project_id ON dataset_exports(project_id);
CREATE INDEX idx_dataset_exports_status_id ON dataset_exports(status_id);
CREATE INDEX idx_dataset_exports_exported_by ON dataset_exports(exported_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON dataset_exports
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] All FK columns indexed
- [ ] Uses `job_statuses` lookup for status (reusing existing lookup table)
- [ ] `config_json` stores filters, splits, and quality thresholds

---

## Phase 2: Rust Backend -- Sidecar Generation

### Task 2.1: Sidecar Template Model & CRUD
**File:** `src/models/sidecar_template.rs`

```rust
#[derive(Debug, FromRow)]
pub struct SidecarTemplate {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub format: String,
    pub target_tool: Option<String>,
    pub template_json: serde_json::Value,
    pub is_builtin: bool,
    pub created_by: Option<DbId>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] CRUD operations: create, get_by_id, list_all, update, delete
- [ ] Prevent deletion of built-in templates
- [ ] Validate template_json structure on create/update

### Task 2.2: XML Sidecar Generator
**File:** `src/services/sidecar_xml_generator.rs`

Generate XML sidecar files based on template field definitions.

```rust
pub struct XmlSidecarGenerator;

impl XmlSidecarGenerator {
    pub fn generate(
        &self,
        template: &SidecarTemplate,
        video_metadata: &VideoMetadata,
        generation_params: &serde_json::Value,
    ) -> Result<String, SidecarError> {
        // Build XML document according to template field mappings
    }
}
```

**Acceptance Criteria:**
- [ ] Generates well-formed XML with template-defined root element
- [ ] Includes: resolution, framerate, codec, duration, color space, generation parameters
- [ ] Sidecar filename matches video filename (e.g., `video.mp4` -> `video.xml`)
- [ ] Output validates against basic XML schema
- [ ] Generation completes in <1 second per video

### Task 2.3: CSV Sidecar Generator
**File:** `src/services/sidecar_csv_generator.rs`

Generate CSV files with frame-level technical data.

**Acceptance Criteria:**
- [ ] Header row from template column definitions
- [ ] Per-frame rows: face confidence, motion scores, quality metrics, boundary SSIM
- [ ] CSV properly escaped and RFC 4180 compliant
- [ ] Filename matches video: `video.mp4` -> `video.csv`

### Task 2.4: Sidecar Export Orchestrator
**File:** `src/services/sidecar_exporter.rs`

Coordinate sidecar generation for a project or character export.

**Acceptance Criteria:**
- [ ] Takes project/character scope and selected templates
- [ ] Generates sidecars for all videos in scope
- [ ] Integrates with PRD-39 export pipeline (sidecars included in delivery)
- [ ] Progress reporting per video

---

## Phase 3: Training Dataset Export

### Task 3.1: Dataset Export Model
**File:** `src/models/dataset_export.rs`

**Acceptance Criteria:**
- [ ] Maps all `dataset_exports` table columns
- [ ] Functions: create, get_by_id, list_by_project, update_status

### Task 3.2: Dataset Packager Service
**File:** `src/services/dataset_packager.rs`

Package selected segments into a training dataset ZIP.

```rust
pub struct DatasetPackager;

pub struct DatasetConfig {
    pub quality_threshold: Option<f32>,
    pub scene_types: Option<Vec<String>>,
    pub character_ids: Option<Vec<DbId>>,
    pub train_split: f32,              // 0.0 to 1.0
    pub validation_split: f32,
    pub test_split: f32,
}
```

**Acceptance Criteria:**
- [ ] Packages video files, face crop images, and per-sample metadata JSON
- [ ] Configurable filters: quality threshold, scene types, characters
- [ ] Metadata per sample includes: prompt text, LoRA weights, quality scores, failure tags
- [ ] Split assignment (train/validation/test) by configured percentages
- [ ] Large dataset streaming to avoid memory issues

### Task 3.3: Dataset Manifest Builder
**File:** `src/services/dataset_manifest.rs`

Generate the JSON manifest listing all samples with paths and metadata.

```rust
pub struct DatasetManifest {
    pub version: String,
    pub total_samples: usize,
    pub splits: HashMap<String, Vec<DatasetSample>>,
    pub metadata: ManifestMetadata,
}

pub struct DatasetSample {
    pub path: String,
    pub prompt: Option<String>,
    pub lora_weights: Option<serde_json::Value>,
    pub quality_score: Option<f32>,
    pub scene_type: String,
    pub character_name: String,
    pub split: String,
}
```

**Acceptance Criteria:**
- [ ] JSON manifest lists all samples with relative paths
- [ ] Split configuration reflected in manifest
- [ ] Compatible with HuggingFace datasets and PyTorch DataLoader conventions
- [ ] Manifest written as `manifest.json` at dataset root

---

## Phase 4: API Endpoints

### Task 4.1: Sidecar Template CRUD Routes
**File:** `src/routes/sidecar_templates.rs`

```
GET    /sidecar-templates              -- List all templates
POST   /sidecar-templates              -- Create custom template
GET    /sidecar-templates/:id          -- Get template details
PUT    /sidecar-templates/:id          -- Update template
DELETE /sidecar-templates/:id          -- Delete (non-builtin only)
```

**Acceptance Criteria:**
- [ ] CRUD with protection for built-in templates
- [ ] Template preview endpoint returns sample output for a given template

### Task 4.2: Sidecar Export Routes
**File:** `src/routes/sidecar_export.rs`

```
POST   /projects/:id/export-sidecars   -- Generate sidecars for project
```

**Acceptance Criteria:**
- [ ] Accepts template IDs and scope (project/character)
- [ ] Async operation returning job ID for progress tracking
- [ ] Sidecars available for download when complete

### Task 4.3: Dataset Export Routes
**File:** `src/routes/dataset_export.rs`

```
POST   /projects/:id/export-dataset    -- Package training dataset
GET    /projects/:id/datasets          -- List dataset exports
GET    /projects/:id/datasets/:id      -- Get dataset details with manifest
```

**Acceptance Criteria:**
- [ ] Accepts filter configuration (quality threshold, scene types, characters, splits)
- [ ] Async operation with progress tracking
- [ ] Download link for completed dataset ZIP

---

## Phase 5: React Frontend

### Task 5.1: Sidecar Template Editor
**File:** `frontend/src/pages/SidecarTemplates.tsx`

**Acceptance Criteria:**
- [ ] List templates with format, target tool, built-in badge
- [ ] Custom template editor with field mapping configuration
- [ ] Preview panel showing sample sidecar output
- [ ] Delete blocked for built-in templates

### Task 5.2: Export Configuration Panel
**File:** `frontend/src/components/export/SidecarExportPanel.tsx`

**Acceptance Criteria:**
- [ ] Template selection with multi-select for generating multiple formats
- [ ] Scope selection (project, character)
- [ ] Progress display during generation
- [ ] Accessible from project delivery view

### Task 5.3: Dataset Export Configuration
**File:** `frontend/src/components/export/DatasetExportPanel.tsx`

**Acceptance Criteria:**
- [ ] Quality threshold slider
- [ ] Scene type filter checkboxes
- [ ] Character selection
- [ ] Train/validation/test split percentage inputs (must sum to 100%)
- [ ] Progress display for large exports

---

## Phase 6: Testing

### Task 6.1: Sidecar Generation Tests
**File:** `tests/sidecar_generation_test.rs`

**Acceptance Criteria:**
- [ ] Test XML generation validates output structure
- [ ] Test CSV generation validates header and row counts
- [ ] Test filename matching (sidecar name matches video name)
- [ ] Test template rendering with various field configurations

### Task 6.2: Dataset Packaging Tests
**File:** `tests/dataset_packaging_test.rs`

**Acceptance Criteria:**
- [ ] Test manifest structure is valid and complete
- [ ] Test split assignments respect configured percentages
- [ ] Test quality threshold filtering excludes low-quality samples
- [ ] Test ZIP structure contains all expected files

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_sidecar_templates.sql` | Sidecar template table |
| `migrations/YYYYMMDDHHMMSS_seed_sidecar_templates.sql` | Built-in template seed data |
| `migrations/YYYYMMDDHHMMSS_create_dataset_exports.sql` | Dataset export tracking table |
| `src/models/sidecar_template.rs` | Template model and CRUD |
| `src/models/dataset_export.rs` | Dataset export model |
| `src/services/sidecar_xml_generator.rs` | XML sidecar rendering |
| `src/services/sidecar_csv_generator.rs` | CSV sidecar rendering |
| `src/services/sidecar_exporter.rs` | Sidecar export orchestrator |
| `src/services/dataset_packager.rs` | Training dataset packaging |
| `src/services/dataset_manifest.rs` | ML manifest builder |
| `src/routes/sidecar_templates.rs` | Template CRUD API |
| `src/routes/sidecar_export.rs` | Sidecar export API |
| `src/routes/dataset_export.rs` | Dataset export API |
| `frontend/src/pages/SidecarTemplates.tsx` | Template management UI |
| `frontend/src/components/export/SidecarExportPanel.tsx` | Sidecar export UI |
| `frontend/src/components/export/DatasetExportPanel.tsx` | Dataset export UI |

## Dependencies

### Upstream PRDs
- PRD-10: Event Bus for export notifications
- PRD-39: Scene Assembler for export pipeline integration
- PRD-24: Generation parameters metadata
- PRD-49: Quality score data

### Downstream PRDs
- None (terminal PRD)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Rust Backend -- Sidecar Generation (Tasks 2.1-2.4)
3. Phase 3: Training Dataset Export (Tasks 3.1-3.3)
4. Phase 4: API Endpoints (Tasks 4.1-4.3)

**MVP Success Criteria:**
- XML and CSV sidecars generate in <1 second per video
- Sidecars are valid and parseable by target VFX tools
- Training datasets include proper manifests usable by standard ML loaders
- Built-in templates cover Nuke, After Effects, and Resolve

### Post-MVP Enhancements
1. Phase 5: React Frontend (Tasks 5.1-5.3)
2. Phase 6: Testing (Tasks 6.1-6.2)
3. Incremental dataset updates (PRD Requirement 2.1)

## Notes

1. **XML library choice** -- Use `quick-xml` crate for Rust XML generation. It is fast and well-maintained.
2. **CSV library choice** -- Use the `csv` crate for RFC 4180-compliant CSV output.
3. **Frame-level data** -- CSV sidecar frame data requires per-frame quality metrics to have been collected during generation (PRD-49). If data is missing, the CSV row should indicate `null` values.
4. **Dataset ZIP size** -- Training datasets with video can be very large. Consider offering image-only export (extracted frames) as a future option.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-040

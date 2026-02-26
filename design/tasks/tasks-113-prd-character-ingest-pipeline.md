# Task List: Character Ingest Pipeline

**PRD Reference:** `design/prds/113-prd-character-ingest-pipeline.md`
**Scope:** Build a character ingest pipeline for bulk-importing characters from folder structures with smart name parsing, automatic image detection, metadata generation/validation, video spec validation, and a multi-step import wizard UI.

## Overview

Studios receive character assets as folder structures (one subfolder per character) containing source images (`clothed.png`, `topless.png`), metadata files (`metadata.json`, `tov.json`, `bio.json`), and other assets. This PRD introduces a pipeline that scans these folders, parses character names from folder names (handling salutations, name particles, initials), detects and classifies images, validates metadata against a configurable master template, validates video specs, and presents a multi-step wizard UI for preview, correction, and confirmation before bulk-creating characters.

### What Already Exists
- `x121_db::models::importer` — `ImportSession`, `ImportMappingEntry`, `FolderImportPreview`, `ImportCommitResult` (PRD-016)
- `x121_db::repositories::ImportSessionRepo`, `ImportMappingEntryRepo` — session and mapping CRUD
- `x121_core::importer` — `map_files_to_entities`, `detect_uniqueness_conflicts`, `ParsedFile`, staging constants
- `x121_api::handlers::importer` — folder upload, preview, commit endpoints with multipart handling
- `x121_db::models::character` — `Character`, `CreateCharacter`, `UpdateCharacter` model triplet
- `x121_db::repositories::CharacterRepo` — CRUD with soft-delete, settings helpers
- `x121_db::models::onboarding_session` — `OnboardingSession` for PRD-67 wizard state persistence
- `x121_core::validation` — rule engine, evaluator, loader, conflict detection (PRD-014)
- `x121_db::models::validation` — `ValidationRule`, `ImportReport`, `ImportReportEntry`
- `x121_api::handlers::validation` — dry-run, commit, report endpoints
- `apps/frontend/src/features/importer/` — `FolderDropZone`, `ImportPreviewTree`, `ImportProgress`, hooks
- `apps/frontend/src/features/onboarding-wizard/` — wizard UI for PRD-67

### What We're Building
1. Database tables: `metadata_templates`, `metadata_template_fields`, `video_spec_requirements`, `character_ingest_sessions`, `character_ingest_entries`
2. Backend: Character name parser module, folder scanner for character-specific structure, metadata validator against master template, video spec validator, bulk character creation endpoint
3. Frontend: Multi-step import wizard (scan → preview → fix → confirm), name parser preview, metadata generation status, validation dashboard
4. Integration with existing PRD-014 validation engine, PRD-016 importer infrastructure, PRD-09 script orchestrator

### Key Design Decisions
1. **Reuse import session infrastructure** — Extend the existing `import_sessions` pattern from PRD-016 rather than creating a parallel system. The `character_ingest_sessions` table adds character-ingest-specific state (parsed names, image classifications, metadata status) on top of the generic import session.
2. **Name parser in `core` crate** — The name parsing logic (folder name → human name) is pure computation with zero deps, belonging in `x121_core`. It is reusable by PRD-067 CSV import and any future naming needs.
3. **Metadata template in DB** — Master metadata schemas are stored in the database (not config files) so admins can modify them without redeployment. This aligns with PRD-014's rule-driven validation approach.
4. **Wizard pattern** — The frontend follows the same wizard/stepper pattern as PRD-067 onboarding wizard, reusing design system `Stepper` and `Card` components.
5. **Video spec validation deferred to post-import** — Video spec checks run on already-generated/imported videos, not during the character folder ingest itself. The video spec tables and validator are built here but triggered separately.

---

## Phase 1: Database Migrations

### Task 1.1: Create `metadata_templates` and `metadata_template_fields` tables
**File:** `apps/db/migrations/20260225000001_create_metadata_templates.sql`

Store configurable master metadata schemas that define required/optional keys, types, and constraints for character metadata validation.

```sql
-- Master metadata template definitions (PRD-113 Req 1.5)
CREATE TABLE metadata_templates (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    project_id  BIGINT REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE,
    is_default  BOOLEAN NOT NULL DEFAULT false,
    version     INTEGER NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one default template globally (project_id IS NULL)
CREATE UNIQUE INDEX uq_metadata_templates_default
    ON metadata_templates (is_default)
    WHERE is_default = true AND project_id IS NULL;

-- At most one default template per project
CREATE UNIQUE INDEX uq_metadata_templates_project_default
    ON metadata_templates (project_id, is_default)
    WHERE is_default = true AND project_id IS NOT NULL;

CREATE INDEX idx_metadata_templates_project_id ON metadata_templates(project_id);

CREATE TRIGGER trg_metadata_templates_updated_at
    BEFORE UPDATE ON metadata_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Field definitions within a metadata template
CREATE TABLE metadata_template_fields (
    id            BIGSERIAL PRIMARY KEY,
    template_id   BIGINT NOT NULL REFERENCES metadata_templates(id) ON DELETE CASCADE ON UPDATE CASCADE,
    field_name    TEXT NOT NULL,
    field_type    TEXT NOT NULL CHECK (field_type IN ('string', 'number', 'boolean', 'array', 'object')),
    is_required   BOOLEAN NOT NULL DEFAULT false,
    constraints   JSONB NOT NULL DEFAULT '{}',  -- {"min": 0, "max": 200, "enum": [...], "pattern": "..."}
    description   TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_metadata_template_fields_name
    ON metadata_template_fields (template_id, field_name);

CREATE INDEX idx_metadata_template_fields_template_id
    ON metadata_template_fields(template_id);

CREATE TRIGGER trg_metadata_template_fields_updated_at
    BEFORE UPDATE ON metadata_template_fields
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed a default template with common character metadata fields
INSERT INTO metadata_templates (name, description, is_default) VALUES
    ('Default Character Metadata', 'Standard metadata fields for character profiles', true);

INSERT INTO metadata_template_fields (template_id, field_name, field_type, is_required, constraints, description, sort_order) VALUES
    (1, 'name',       'string',  true,  '{"min_length": 1, "max_length": 200}', 'Character display name', 1),
    (1, 'age',        'number',  false, '{"min": 0, "max": 999}', 'Character age', 2),
    (1, 'ethnicity',  'string',  false, '{}', 'Character ethnicity', 3),
    (1, 'hair_color', 'string',  false, '{}', 'Hair color', 4),
    (1, 'eye_color',  'string',  false, '{}', 'Eye color', 5),
    (1, 'gender',     'string',  false, '{}', 'Gender', 6),
    (1, 'bio',        'string',  false, '{"max_length": 5000}', 'Character biography', 7);
```

**Acceptance Criteria:**
- [ ] `metadata_templates` table with `BIGSERIAL` PK, `created_at`/`updated_at` TIMESTAMPTZ
- [ ] `project_id` nullable FK — NULL = global template, non-NULL = project-specific
- [ ] `is_default` partial unique indexes enforce at most one default globally and per project
- [ ] `metadata_template_fields` with per-field type, required flag, and JSONB constraints
- [ ] Unique constraint on `(template_id, field_name)` prevents duplicate fields
- [ ] `field_type` CHECK constraint limits to valid types
- [ ] Default template seeded with common character metadata fields
- [ ] `set_updated_at()` triggers applied to both tables
- [ ] Migration runs cleanly via `sqlx migrate run`

### Task 1.2: Create `video_spec_requirements` table
**File:** `apps/db/migrations/20260225000002_create_video_spec_requirements.sql`

Store per-project or global video specification requirements (fps, resolution, duration, codec) used to validate generated/imported videos.

```sql
-- Video specification requirements (PRD-113 Req 1.6)
CREATE TABLE video_spec_requirements (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id   BIGINT REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name            TEXT NOT NULL,
    framerate       NUMERIC(6,2),              -- e.g., 30.00, 24.00, 60.00
    min_duration_secs NUMERIC(10,3),           -- minimum video duration
    max_duration_secs NUMERIC(10,3),           -- maximum video duration
    width           INTEGER,                   -- e.g., 1920, 3840
    height          INTEGER,                   -- e.g., 1080, 2160
    codec           TEXT,                      -- e.g., 'h264', 'h265', 'vp9'
    container       TEXT,                      -- e.g., 'mp4', 'webm', 'mov'
    max_file_size_bytes BIGINT,                -- optional max file size
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_video_spec_requirements_project_id ON video_spec_requirements(project_id);
CREATE INDEX idx_video_spec_requirements_scene_type_id ON video_spec_requirements(scene_type_id);

CREATE TRIGGER trg_video_spec_requirements_updated_at
    BEFORE UPDATE ON video_spec_requirements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed global default video specs
INSERT INTO video_spec_requirements (name, framerate, min_duration_secs, max_duration_secs, width, height, codec, container) VALUES
    ('Default 1080p 30fps', 30.00, 1.000, 300.000, 1920, 1080, 'h264', 'mp4');
```

**Acceptance Criteria:**
- [ ] Table created with `BIGSERIAL` PK, `created_at`/`updated_at` TIMESTAMPTZ
- [ ] `project_id` nullable FK — NULL = global spec, non-NULL = project-specific
- [ ] `scene_type_id` nullable FK — NULL = all scene types, non-NULL = scene-type-specific
- [ ] Numeric types used for framerate and duration (not floating point)
- [ ] Default global spec seeded for 1080p 30fps H.264 MP4
- [ ] FK indexes created
- [ ] `set_updated_at()` trigger applied
- [ ] Migration runs cleanly

### Task 1.3: Create `character_ingest_sessions` and `character_ingest_entries` tables
**File:** `apps/db/migrations/20260225000003_create_character_ingest_tables.sql`

Track character-specific ingest sessions and per-character entries with parsed names, image classifications, metadata status, and validation results.

```sql
-- Character ingest session status lookup
CREATE TABLE character_ingest_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);

INSERT INTO character_ingest_statuses (name, label) VALUES
    ('scanning',          'Scanning'),
    ('preview',           'Preview'),
    ('generating_metadata', 'Generating Metadata'),
    ('ready',             'Ready'),
    ('importing',         'Importing'),
    ('completed',         'Completed'),
    ('failed',            'Failed'),
    ('cancelled',         'Cancelled');

-- Character ingest sessions (PRD-113 Req 1.7)
CREATE TABLE character_ingest_sessions (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    status_id       SMALLINT NOT NULL REFERENCES character_ingest_statuses(id) DEFAULT 1,
    source_type     TEXT NOT NULL CHECK (source_type IN ('folder', 'csv', 'text')),
    source_name     TEXT,
    target_group_id BIGINT,             -- character group to assign imported characters to
    total_entries   INTEGER NOT NULL DEFAULT 0,
    ready_count     INTEGER NOT NULL DEFAULT 0,
    error_count     INTEGER NOT NULL DEFAULT 0,
    excluded_count  INTEGER NOT NULL DEFAULT 0,
    created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_character_ingest_sessions_project_id ON character_ingest_sessions(project_id);
CREATE INDEX idx_character_ingest_sessions_status_id ON character_ingest_sessions(status_id);
CREATE INDEX idx_character_ingest_sessions_created_by ON character_ingest_sessions(created_by);

CREATE TRIGGER trg_character_ingest_sessions_updated_at
    BEFORE UPDATE ON character_ingest_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Per-character entries within an ingest session
CREATE TABLE character_ingest_entries (
    id                  BIGSERIAL PRIMARY KEY,
    session_id          BIGINT NOT NULL REFERENCES character_ingest_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    folder_name         TEXT,                         -- original folder or CSV row name
    parsed_name         TEXT NOT NULL,                -- auto-parsed character name
    confirmed_name      TEXT,                         -- user-confirmed name (NULL = use parsed_name)
    name_confidence     TEXT NOT NULL DEFAULT 'high' CHECK (name_confidence IN ('high', 'medium', 'low')),
    detected_images     JSONB NOT NULL DEFAULT '[]',  -- [{filename, classification, extension, size_bytes}]
    image_classifications JSONB NOT NULL DEFAULT '{}', -- {"clothed": "clothed.png", "topless": "topless.png"}
    metadata_status     TEXT NOT NULL DEFAULT 'none' CHECK (metadata_status IN ('none', 'found', 'generating', 'generated', 'failed')),
    metadata_json       JSONB,                        -- parsed/generated metadata.json content
    metadata_source     TEXT CHECK (metadata_source IN ('direct', 'generated', 'manual')),
    tov_json            JSONB,                        -- raw tov.json content (for generation)
    bio_json            JSONB,                        -- raw bio.json content (for generation)
    metadata_errors     JSONB NOT NULL DEFAULT '[]',  -- [{field, message, severity}]
    validation_status   TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'pass', 'warning', 'fail')),
    validation_errors   JSONB NOT NULL DEFAULT '[]',
    validation_warnings JSONB NOT NULL DEFAULT '[]',
    is_included         BOOLEAN NOT NULL DEFAULT true, -- user can exclude entries
    created_character_id BIGINT REFERENCES characters(id) ON DELETE SET NULL ON UPDATE CASCADE,
    script_execution_id BIGINT,                       -- PRD-09 script execution for metadata generation
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_character_ingest_entries_session_id ON character_ingest_entries(session_id);
CREATE INDEX idx_character_ingest_entries_validation_status ON character_ingest_entries(validation_status);
CREATE INDEX idx_character_ingest_entries_metadata_status ON character_ingest_entries(metadata_status);

CREATE TRIGGER trg_character_ingest_entries_updated_at
    BEFORE UPDATE ON character_ingest_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] `character_ingest_statuses` lookup table seeded with 8 status values
- [ ] `character_ingest_sessions` tracks per-session state with project FK, source type, counts
- [ ] `source_type` CHECK constraint limits to `folder`, `csv`, `text`
- [ ] `character_ingest_entries` tracks per-character state: names, images, metadata, validation
- [ ] `name_confidence` CHECK constraint limits to `high`, `medium`, `low`
- [ ] `metadata_status` CHECK constraint limits to `none`, `found`, `generating`, `generated`, `failed`
- [ ] `validation_status` CHECK constraint limits to `pending`, `pass`, `warning`, `fail`
- [ ] JSONB columns for detected images, classifications, metadata, and validation results
- [ ] `created_character_id` FK to `characters(id)` for post-import linking
- [ ] All FK columns indexed
- [ ] `set_updated_at()` triggers applied to all tables
- [ ] Migration runs cleanly

---

## Phase 2: Backend Models & Repositories

### Task 2.1: Create metadata template models
**File:** `apps/backend/crates/db/src/models/metadata_template.rs`

Follow the existing three-struct pattern (entity/create/update) from `models/character.rs`.

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `metadata_templates` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct MetadataTemplate {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub project_id: Option<DbId>,
    pub is_default: bool,
    pub version: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new metadata template.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateMetadataTemplate {
    pub name: String,
    pub description: Option<String>,
    pub project_id: Option<DbId>,
    pub is_default: Option<bool>,
}

/// DTO for updating a metadata template.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMetadataTemplate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_default: Option<bool>,
}

/// A row from the `metadata_template_fields` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct MetadataTemplateField {
    pub id: DbId,
    pub template_id: DbId,
    pub field_name: String,
    pub field_type: String,
    pub is_required: bool,
    pub constraints: serde_json::Value,
    pub description: Option<String>,
    pub sort_order: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a metadata template field.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateMetadataTemplateField {
    pub template_id: DbId,
    pub field_name: String,
    pub field_type: String,
    pub is_required: Option<bool>,
    pub constraints: Option<serde_json::Value>,
    pub description: Option<String>,
    pub sort_order: Option<i32>,
}
```

**Acceptance Criteria:**
- [ ] `MetadataTemplate` derives `Debug, Clone, FromRow, Serialize`
- [ ] `MetadataTemplateField` derives `Debug, Clone, FromRow, Serialize`
- [ ] Create DTOs derive `Debug, Clone, Deserialize`
- [ ] Uses `DbId` and `Timestamp` from `x121_core::types`
- [ ] Module registered in `models/mod.rs`

### Task 2.2: Create video spec requirement models
**File:** `apps/backend/crates/db/src/models/video_spec.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `video_spec_requirements` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct VideoSpecRequirement {
    pub id: DbId,
    pub project_id: Option<DbId>,
    pub scene_type_id: Option<DbId>,
    pub name: String,
    pub framerate: Option<sqlx::types::BigDecimal>,
    pub min_duration_secs: Option<sqlx::types::BigDecimal>,
    pub max_duration_secs: Option<sqlx::types::BigDecimal>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub max_file_size_bytes: Option<i64>,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a video spec requirement.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateVideoSpecRequirement {
    pub project_id: Option<DbId>,
    pub scene_type_id: Option<DbId>,
    pub name: String,
    pub framerate: Option<f64>,
    pub min_duration_secs: Option<f64>,
    pub max_duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub max_file_size_bytes: Option<i64>,
}

/// DTO for updating a video spec requirement.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateVideoSpecRequirement {
    pub name: Option<String>,
    pub framerate: Option<f64>,
    pub min_duration_secs: Option<f64>,
    pub max_duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub max_file_size_bytes: Option<i64>,
    pub is_active: Option<bool>,
}
```

**Acceptance Criteria:**
- [ ] Main struct derives `Debug, Clone, FromRow, Serialize`
- [ ] Uses `BigDecimal` for NUMERIC columns (framerate, duration)
- [ ] Create/Update DTOs use `f64` for user-facing numeric input
- [ ] Module registered in `models/mod.rs`

### Task 2.3: Create character ingest session and entry models
**File:** `apps/backend/crates/db/src/models/character_ingest.rs`

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A row from the `character_ingest_sessions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterIngestSession {
    pub id: DbId,
    pub project_id: DbId,
    pub status_id: StatusId,
    pub source_type: String,
    pub source_name: Option<String>,
    pub target_group_id: Option<DbId>,
    pub total_entries: i32,
    pub ready_count: i32,
    pub error_count: i32,
    pub excluded_count: i32,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new character ingest session.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCharacterIngestSession {
    pub project_id: DbId,
    pub source_type: String,
    pub source_name: Option<String>,
    pub target_group_id: Option<DbId>,
    pub created_by: Option<DbId>,
}

/// A row from the `character_ingest_entries` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterIngestEntry {
    pub id: DbId,
    pub session_id: DbId,
    pub folder_name: Option<String>,
    pub parsed_name: String,
    pub confirmed_name: Option<String>,
    pub name_confidence: String,
    pub detected_images: serde_json::Value,
    pub image_classifications: serde_json::Value,
    pub metadata_status: String,
    pub metadata_json: Option<serde_json::Value>,
    pub metadata_source: Option<String>,
    pub tov_json: Option<serde_json::Value>,
    pub bio_json: Option<serde_json::Value>,
    pub metadata_errors: serde_json::Value,
    pub validation_status: String,
    pub validation_errors: serde_json::Value,
    pub validation_warnings: serde_json::Value,
    pub is_included: bool,
    pub created_character_id: Option<DbId>,
    pub script_execution_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a character ingest entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCharacterIngestEntry {
    pub session_id: DbId,
    pub folder_name: Option<String>,
    pub parsed_name: String,
    pub name_confidence: String,
    pub detected_images: serde_json::Value,
    pub image_classifications: serde_json::Value,
    pub metadata_status: String,
    pub metadata_json: Option<serde_json::Value>,
    pub metadata_source: Option<String>,
    pub tov_json: Option<serde_json::Value>,
    pub bio_json: Option<serde_json::Value>,
}

/// DTO for updating a character ingest entry (user edits in preview).
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCharacterIngestEntry {
    pub confirmed_name: Option<String>,
    pub image_classifications: Option<serde_json::Value>,
    pub metadata_json: Option<serde_json::Value>,
    pub is_included: Option<bool>,
}
```

**Acceptance Criteria:**
- [ ] `CharacterIngestSession` derives `Debug, Clone, FromRow, Serialize`
- [ ] `CharacterIngestEntry` derives `Debug, Clone, FromRow, Serialize`
- [ ] Uses `StatusId` for `status_id` (consistent with existing pattern from `character.rs`)
- [ ] JSONB columns typed as `serde_json::Value`
- [ ] Module registered in `models/mod.rs`

### Task 2.4: Create metadata template repository
**File:** `apps/backend/crates/db/src/repositories/metadata_template_repo.rs`

Follow the zero-sized struct pattern from `character_repo.rs`.

```rust
pub struct MetadataTemplateRepo;

impl MetadataTemplateRepo {
    pub async fn create(pool: &PgPool, input: &CreateMetadataTemplate) -> Result<MetadataTemplate, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<MetadataTemplate>, sqlx::Error>;
    pub async fn find_default(pool: &PgPool, project_id: Option<DbId>) -> Result<Option<MetadataTemplate>, sqlx::Error>;
    pub async fn list(pool: &PgPool, project_id: Option<DbId>) -> Result<Vec<MetadataTemplate>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdateMetadataTemplate) -> Result<Option<MetadataTemplate>, sqlx::Error>;
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
}

pub struct MetadataTemplateFieldRepo;

impl MetadataTemplateFieldRepo {
    pub async fn create(pool: &PgPool, input: &CreateMetadataTemplateField) -> Result<MetadataTemplateField, sqlx::Error>;
    pub async fn list_by_template(pool: &PgPool, template_id: DbId) -> Result<Vec<MetadataTemplateField>, sqlx::Error>;
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn delete_by_template(pool: &PgPool, template_id: DbId) -> Result<u64, sqlx::Error>;
}
```

**Acceptance Criteria:**
- [ ] Zero-sized struct with `COLUMNS` const matching all table columns
- [ ] `find_default` loads the default template (global or project-specific, with project overriding global)
- [ ] `list` supports optional `project_id` filter (returns global + project-specific)
- [ ] `list_by_template` returns fields ordered by `sort_order`
- [ ] Module registered in `repositories/mod.rs` with `pub use` re-export

### Task 2.5: Create video spec requirement repository
**File:** `apps/backend/crates/db/src/repositories/video_spec_repo.rs`

```rust
pub struct VideoSpecRequirementRepo;

impl VideoSpecRequirementRepo {
    pub async fn create(pool: &PgPool, input: &CreateVideoSpecRequirement) -> Result<VideoSpecRequirement, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<VideoSpecRequirement>, sqlx::Error>;
    pub async fn list_active(pool: &PgPool, project_id: Option<DbId>, scene_type_id: Option<DbId>) -> Result<Vec<VideoSpecRequirement>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdateVideoSpecRequirement) -> Result<Option<VideoSpecRequirement>, sqlx::Error>;
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
}
```

**Acceptance Criteria:**
- [ ] Zero-sized struct with `COLUMNS` const
- [ ] `list_active` filters by `is_active = true` and optional project/scene_type scope
- [ ] Falls back to global specs when no project-specific specs match
- [ ] Module registered in `repositories/mod.rs`

### Task 2.6: Create character ingest session and entry repositories
**File:** `apps/backend/crates/db/src/repositories/character_ingest_repo.rs`

```rust
pub struct CharacterIngestSessionRepo;

impl CharacterIngestSessionRepo {
    pub async fn create(pool: &PgPool, input: &CreateCharacterIngestSession) -> Result<CharacterIngestSession, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<CharacterIngestSession>, sqlx::Error>;
    pub async fn list_by_project(pool: &PgPool, project_id: DbId) -> Result<Vec<CharacterIngestSession>, sqlx::Error>;
    pub async fn update_status(pool: &PgPool, id: DbId, status_id: StatusId) -> Result<bool, sqlx::Error>;
    pub async fn update_counts(pool: &PgPool, id: DbId, total: i32, ready: i32, errors: i32, excluded: i32) -> Result<bool, sqlx::Error>;
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
}

pub struct CharacterIngestEntryRepo;

impl CharacterIngestEntryRepo {
    pub async fn create(pool: &PgPool, input: &CreateCharacterIngestEntry) -> Result<CharacterIngestEntry, sqlx::Error>;
    pub async fn create_batch(pool: &PgPool, entries: &[CreateCharacterIngestEntry]) -> Result<Vec<CharacterIngestEntry>, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<CharacterIngestEntry>, sqlx::Error>;
    pub async fn list_by_session(pool: &PgPool, session_id: DbId) -> Result<Vec<CharacterIngestEntry>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdateCharacterIngestEntry) -> Result<Option<CharacterIngestEntry>, sqlx::Error>;
    pub async fn update_metadata_status(pool: &PgPool, id: DbId, status: &str, metadata_json: Option<&serde_json::Value>, errors: Option<&serde_json::Value>) -> Result<bool, sqlx::Error>;
    pub async fn update_validation(pool: &PgPool, id: DbId, status: &str, errors: &serde_json::Value, warnings: &serde_json::Value) -> Result<bool, sqlx::Error>;
    pub async fn set_created_character(pool: &PgPool, id: DbId, character_id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn count_by_status(pool: &PgPool, session_id: DbId) -> Result<IngestEntryCounts, sqlx::Error>;
}

/// Summary counts for entries in a session.
#[derive(Debug, Clone, Serialize)]
pub struct IngestEntryCounts {
    pub total: i64,
    pub included: i64,
    pub excluded: i64,
    pub ready: i64,       // validation_status = 'pass'
    pub warning: i64,     // validation_status = 'warning'
    pub failed: i64,      // validation_status = 'fail'
    pub pending: i64,     // validation_status = 'pending'
}
```

**Acceptance Criteria:**
- [ ] `create_batch` efficiently inserts multiple entries in a single statement or transaction
- [ ] `update_metadata_status` updates metadata_status, metadata_json, and metadata_errors atomically
- [ ] `update_validation` updates validation_status, validation_errors, and validation_warnings
- [ ] `set_created_character` links an entry to the created character post-import
- [ ] `count_by_status` returns aggregated counts grouped by validation status
- [ ] `list_by_session` returns entries ordered by `id ASC` (insertion order)
- [ ] Modules registered in `repositories/mod.rs`

---

## Phase 3: Core Domain Logic

### Task 3.1: Character name parser module
**File:** `apps/backend/crates/core/src/name_parser.rs`

Implement the name parsing logic from PRD-113 Req 1.2. Pure computation, no dependencies beyond `std`.

```rust
/// Result of parsing a folder name into a character name.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ParsedName {
    pub original: String,
    pub parsed: String,
    pub confidence: NameConfidence,
}

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NameConfidence {
    High,
    Medium,
    Low,
}

/// Known salutations to detect and preserve.
const SALUTATIONS: &[&str] = &["mr", "mrs", "ms", "dr", "prof", "sir", "dame", "rev"];

/// Name particles kept lowercase when not at the start.
const NAME_PARTICLES: &[&str] = &["von", "van", "de", "di", "la", "le", "el", "al", "du", "des"];

/// Parse a folder name into a human-readable character name.
///
/// Rules applied in order:
/// 1. Replace underscores and hyphens with spaces
/// 2. Detect and capitalize salutations
/// 3. Detect name particles (lowercase when not first word)
/// 4. Title-case remaining words; detect 2-letter all-lowercase as initials → uppercase
/// 5. Set confidence based on heuristics
pub fn parse_character_name(folder_name: &str) -> ParsedName {
    // implementation
    todo!()
}

/// Parse multiple folder names.
pub fn parse_character_names(folder_names: &[&str]) -> Vec<ParsedName> {
    folder_names.iter().map(|n| parse_character_name(n)).collect()
}
```

Expected behavior:
- `"aj_riley"` → `"AJ Riley"` (high confidence)
- `"la_perla"` → `"La Perla"` (high confidence — `la` capitalized at start)
- `"mr_simons"` → `"Mr Simons"` (high confidence)
- `"tesa_von_doom"` → `"Tesa von Doom"` (high confidence)
- `"xena"` → `"Xena"` (high confidence — single name)
- `"mary_jane_watson"` → `"Mary Jane Watson"` (high confidence)
- `"001"` → `"001"` (low confidence — purely numeric)

**Acceptance Criteria:**
- [ ] Handles underscore and hyphen replacement
- [ ] Detects and preserves salutations (`mr` → `Mr`, `dr` → `Dr`)
- [ ] Detects name particles (`von`, `de`, `la`, etc.) — lowercase when not first word, capitalized when first
- [ ] Detects 2-letter all-lowercase sequences as initials → uppercase (`aj` → `AJ`)
- [ ] Title-cases standard words
- [ ] Sets confidence: `high` for clear patterns, `medium` for ambiguous, `low` for numeric/unusual
- [ ] All test cases from PRD pass (6 examples)
- [ ] Unit tests covering edge cases: single name, all caps, mixed case, numeric, empty, special characters
- [ ] Module registered in `core/src/lib.rs`

### Task 3.2: Folder scanner for character ingest
**File:** `apps/backend/crates/core/src/character_ingest.rs`

Scan a directory structure and produce structured results for each character subfolder.

```rust
use std::path::Path;

/// A scanned character folder with detected contents.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ScannedCharacterFolder {
    pub folder_name: String,
    pub parsed_name: super::name_parser::ParsedName,
    pub images: Vec<DetectedImage>,
    pub metadata_file: Option<DetectedFile>,
    pub tov_file: Option<DetectedFile>,
    pub bio_file: Option<DetectedFile>,
    pub other_files: Vec<DetectedFile>,
    pub issues: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DetectedImage {
    pub filename: String,
    pub extension: String,
    pub classification: Option<String>,  // "clothed", "topless", or None if unrecognized
    pub size_bytes: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DetectedFile {
    pub filename: String,
    pub size_bytes: u64,
}

/// Supported image extensions (case-insensitive).
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "tiff"];

/// Scan a root directory for character subfolders.
///
/// Each top-level subdirectory is treated as a character folder.
/// Returns one `ScannedCharacterFolder` per subdirectory.
pub async fn scan_character_folders(root: &Path) -> Result<Vec<ScannedCharacterFolder>, std::io::Error> {
    todo!()
}

/// Classify an image filename into a track slug.
/// Falls back to None if filename doesn't match known patterns.
pub fn classify_image(filename: &str) -> Option<String> {
    let stem = filename.rsplit('.').nth(1).unwrap_or(filename).to_lowercase();
    match stem.as_str() {
        "clothed" => Some("clothed".to_string()),
        "topless" => Some("topless".to_string()),
        _ => None,
    }
}
```

**Acceptance Criteria:**
- [ ] Scans top-level subfolders only (one level deep)
- [ ] Detects images by extension (`.png`, `.jpg`, `.jpeg`, `.webp`, `.tiff`) — case-insensitive
- [ ] Classifies images by filename stem (`clothed.*` → clothed track, `topless.*` → topless track)
- [ ] Detects `metadata.json`, `tov.json`, `bio.json` — case-insensitive
- [ ] Flags missing expected images (no clothed image) as issues
- [ ] Flags empty folders as issues
- [ ] Logs unrecognized files in `other_files`
- [ ] Returns results sorted by folder name
- [ ] Unit tests for image classification and folder scanning (with temp dirs)
- [ ] Module registered in `core/src/lib.rs`

### Task 3.3: Metadata template validator
**File:** `apps/backend/crates/core/src/metadata_validator.rs`

Validate a `metadata.json` object against a metadata template definition. Reuses validation patterns from PRD-014 evaluator.

```rust
use serde_json::Value;

/// A field definition from the metadata template.
#[derive(Debug, Clone)]
pub struct TemplateField {
    pub field_name: String,
    pub field_type: String,      // "string", "number", "boolean", "array", "object"
    pub is_required: bool,
    pub constraints: Value,      // {"min": 0, "max": 200, "enum": [...], "pattern": "..."}
}

/// Result of validating metadata against a template.
#[derive(Debug, Clone, serde::Serialize)]
pub struct MetadataValidationResult {
    pub is_valid: bool,
    pub errors: Vec<MetadataFieldError>,
    pub warnings: Vec<MetadataFieldError>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MetadataFieldError {
    pub field: String,
    pub message: String,
    pub severity: String,  // "error" or "warning"
}

/// Validate metadata JSON against template field definitions.
pub fn validate_metadata(
    metadata: &serde_json::Map<String, Value>,
    fields: &[TemplateField],
) -> MetadataValidationResult {
    todo!()
}
```

Validation checks:
1. JSON is syntactically valid (already parsed)
2. All required fields are present
3. Field types match expected types
4. Constraints satisfied (min/max for numbers, min_length/max_length for strings, enum values, regex patterns)
5. Unknown keys produce warnings (not errors)

**Acceptance Criteria:**
- [ ] Checks all required fields are present (error if missing)
- [ ] Validates field types: string, number, boolean, array, object
- [ ] Validates constraints: `min`, `max`, `min_length`, `max_length`, `enum`, `pattern`
- [ ] Unknown keys produce warnings, not errors
- [ ] `is_valid` is false only when errors exist (warnings alone = valid)
- [ ] Unit tests for each validation check type
- [ ] Reuses validation patterns from `x121_core::validation` where possible (do NOT duplicate evaluator logic)
- [ ] Module registered in `core/src/lib.rs`

### Task 3.4: Video spec validator
**File:** `apps/backend/crates/core/src/video_spec_validator.rs`

Validate video file properties against specification requirements.

```rust
/// Properties of a video file to validate.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VideoProperties {
    pub file_path: String,
    pub framerate: Option<f64>,
    pub duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub file_size_bytes: Option<i64>,
}

/// A spec requirement to check against.
#[derive(Debug, Clone)]
pub struct VideoSpec {
    pub framerate: Option<f64>,
    pub min_duration_secs: Option<f64>,
    pub max_duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub max_file_size_bytes: Option<i64>,
}

/// Result of validating a video against specs.
#[derive(Debug, Clone, serde::Serialize)]
pub struct VideoValidationResult {
    pub is_valid: bool,
    pub violations: Vec<VideoSpecViolation>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct VideoSpecViolation {
    pub field: String,
    pub expected: String,
    pub actual: String,
    pub message: String,
}

/// Validate video properties against a spec.
pub fn validate_video(props: &VideoProperties, spec: &VideoSpec) -> VideoValidationResult {
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Checks framerate: exact match required (e.g., expected 30fps, got 24fps → violation)
- [ ] Checks duration: within min/max range
- [ ] Checks resolution: width and height match
- [ ] Checks codec: case-insensitive match
- [ ] Checks container: case-insensitive match
- [ ] Checks file size: under max
- [ ] Skips checks where spec field is None (not specified = no requirement)
- [ ] Violation messages are user-friendly (e.g., "Expected 30fps, got 24fps")
- [ ] Unit tests for each check type including boundary conditions
- [ ] Module registered in `core/src/lib.rs`

---

## Phase 4: API Handlers & Routes

### Task 4.1: Character ingest handler module
**File:** `apps/backend/crates/api/src/handlers/character_ingest.rs`

Implement handlers for the character ingest pipeline endpoints.

```rust
/// POST /api/v1/projects/{project_id}/ingest/scan
/// Accepts multipart folder upload, scans for character folders, creates ingest session.
pub async fn scan_folder(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    mut multipart: Multipart,
) -> AppResult<(StatusCode, Json<CharacterIngestSession>)>;

/// POST /api/v1/projects/{project_id}/ingest/text
/// Accepts JSON body with character names (text/CSV mode).
pub async fn ingest_from_text(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(input): Json<TextIngestRequest>,
) -> AppResult<(StatusCode, Json<CharacterIngestSession>)>;

/// GET /api/v1/projects/{project_id}/ingest/{session_id}
/// Returns session with all entries.
pub async fn get_session(
    State(state): State<AppState>,
    Path((project_id, session_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<IngestSessionDetail>>;

/// GET /api/v1/projects/{project_id}/ingest/{session_id}/entries
/// Returns all entries for a session.
pub async fn list_entries(
    State(state): State<AppState>,
    Path((project_id, session_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<Vec<CharacterIngestEntry>>>;

/// PUT /api/v1/projects/{project_id}/ingest/{session_id}/entries/{entry_id}
/// Update an entry (edit name, classifications, include/exclude).
pub async fn update_entry(
    State(state): State<AppState>,
    Path((project_id, session_id, entry_id)): Path<(DbId, DbId, DbId)>,
    Json(input): Json<UpdateCharacterIngestEntry>,
) -> AppResult<Json<CharacterIngestEntry>>;

/// POST /api/v1/projects/{project_id}/ingest/{session_id}/validate
/// Run validation on all included entries.
pub async fn validate_session(
    State(state): State<AppState>,
    Path((project_id, session_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<IngestValidationSummary>>;

/// POST /api/v1/projects/{project_id}/ingest/{session_id}/generate-metadata/{entry_id}
/// Trigger metadata generation from tov.json + bio.json for a single entry.
pub async fn generate_metadata(
    State(state): State<AppState>,
    Path((project_id, session_id, entry_id)): Path<(DbId, DbId, DbId)>,
) -> AppResult<Json<CharacterIngestEntry>>;

/// POST /api/v1/projects/{project_id}/ingest/{session_id}/confirm
/// Confirm the import: create characters from all included entries.
pub async fn confirm_import(
    State(state): State<AppState>,
    Path((project_id, session_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<IngestConfirmResult>>;

/// DELETE /api/v1/projects/{project_id}/ingest/{session_id}
/// Cancel an ingest session.
pub async fn cancel_session(
    State(state): State<AppState>,
    Path((project_id, session_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode>;
```

Request/response DTOs:

```rust
#[derive(Debug, Deserialize)]
pub struct TextIngestRequest {
    pub names: Vec<String>,       // one name per entry
    pub source_type: String,      // "text" or "csv"
    pub target_group_id: Option<DbId>,
}

#[derive(Debug, Serialize)]
pub struct IngestSessionDetail {
    pub session: CharacterIngestSession,
    pub entries: Vec<CharacterIngestEntry>,
    pub counts: IngestEntryCounts,
}

#[derive(Debug, Serialize)]
pub struct IngestValidationSummary {
    pub total: i64,
    pub pass: i64,
    pub warning: i64,
    pub fail: i64,
    pub pending: i64,
}

#[derive(Debug, Serialize)]
pub struct IngestConfirmResult {
    pub created: i64,
    pub failed: i64,
    pub skipped: i64,
    pub character_ids: Vec<DbId>,
}
```

**Acceptance Criteria:**
- [ ] `scan_folder` accepts multipart upload, scans folders, parses names, classifies images, detects metadata, creates session + entries
- [ ] `ingest_from_text` creates entries from a list of names (no images/metadata)
- [ ] `get_session` returns session + entries + counts in a single response
- [ ] `update_entry` allows editing parsed name, image classifications, and include/exclude toggle
- [ ] `validate_session` runs metadata validation against the project's metadata template for all included entries
- [ ] `generate_metadata` triggers metadata generation script via PRD-09 integration (or stubs if PRD-09 not yet implemented)
- [ ] `confirm_import` creates characters in bulk (reuses `CharacterRepo::create`), links entries to created characters
- [ ] `confirm_import` runs in a database transaction — partial failures roll back
- [ ] `cancel_session` updates session status to cancelled
- [ ] All handlers follow existing pattern: `State(state)`, `AppResult<...>`, `AppError`/`CoreError` error mapping
- [ ] Handler module registered in `handlers/mod.rs`

### Task 4.2: Metadata template handler module
**File:** `apps/backend/crates/api/src/handlers/metadata_template.rs`

CRUD handlers for metadata templates and their fields.

```rust
/// GET /api/v1/metadata-templates
pub async fn list_templates(...) -> AppResult<Json<Vec<MetadataTemplate>>>;

/// GET /api/v1/metadata-templates/{id}
pub async fn get_template(...) -> AppResult<Json<MetadataTemplateDetail>>;

/// POST /api/v1/metadata-templates
pub async fn create_template(...) -> AppResult<(StatusCode, Json<MetadataTemplate>)>;

/// PUT /api/v1/metadata-templates/{id}
pub async fn update_template(...) -> AppResult<Json<MetadataTemplate>>;

/// DELETE /api/v1/metadata-templates/{id}
pub async fn delete_template(...) -> AppResult<StatusCode>;

/// GET /api/v1/metadata-templates/{id}/fields
pub async fn list_fields(...) -> AppResult<Json<Vec<MetadataTemplateField>>>;

/// POST /api/v1/metadata-templates/{id}/fields
pub async fn create_field(...) -> AppResult<(StatusCode, Json<MetadataTemplateField>)>;

/// DELETE /api/v1/metadata-templates/{id}/fields/{field_id}
pub async fn delete_field(...) -> AppResult<StatusCode>;
```

**Acceptance Criteria:**
- [ ] Standard CRUD for templates following existing handler patterns
- [ ] `get_template` returns template + its fields (`MetadataTemplateDetail`)
- [ ] `list_templates` supports optional `?project_id=` query filter
- [ ] Field CRUD nested under template path
- [ ] Handler module registered in `handlers/mod.rs`

### Task 4.3: Video spec handler module
**File:** `apps/backend/crates/api/src/handlers/video_spec.rs`

CRUD handlers for video spec requirements.

```rust
/// GET /api/v1/video-specs
pub async fn list_specs(...) -> AppResult<Json<Vec<VideoSpecRequirement>>>;

/// GET /api/v1/video-specs/{id}
pub async fn get_spec(...) -> AppResult<Json<VideoSpecRequirement>>;

/// POST /api/v1/video-specs
pub async fn create_spec(...) -> AppResult<(StatusCode, Json<VideoSpecRequirement>)>;

/// PUT /api/v1/video-specs/{id}
pub async fn update_spec(...) -> AppResult<Json<VideoSpecRequirement>>;

/// DELETE /api/v1/video-specs/{id}
pub async fn delete_spec(...) -> AppResult<StatusCode>;
```

**Acceptance Criteria:**
- [ ] Standard CRUD following existing handler patterns
- [ ] `list_specs` supports optional `?project_id=` and `?scene_type_id=` query filters
- [ ] Returns only active specs by default, `?include_inactive=true` to show all
- [ ] Handler module registered in `handlers/mod.rs`

### Task 4.4: Validation dashboard handler
**File:** `apps/backend/crates/api/src/handlers/validation_dashboard.rs`

Project-wide validation summary endpoint (PRD-113 Req 1.9).

```rust
/// GET /api/v1/projects/{project_id}/validation-summary
/// Returns aggregated validation status across all characters.
pub async fn get_validation_summary(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<ProjectValidationSummary>>;

/// POST /api/v1/projects/{project_id}/validate
/// Re-run validation across all characters in a project.
pub async fn revalidate_project(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<ProjectValidationSummary>>;
```

```rust
#[derive(Debug, Serialize)]
pub struct ProjectValidationSummary {
    pub metadata_summary: MetadataValidationSummary,
    pub video_summary: VideoValidationSummary,
    pub asset_summary: AssetCompletenessSummary,
}

#[derive(Debug, Serialize)]
pub struct MetadataValidationSummary {
    pub valid_count: i64,
    pub invalid_count: i64,
    pub missing_count: i64,
    pub invalid_characters: Vec<CharacterValidationIssue>,
}

#[derive(Debug, Serialize)]
pub struct VideoValidationSummary {
    pub passing_count: i64,
    pub failing_count: i64,
    pub violations_by_type: Vec<(String, i64)>,
}

#[derive(Debug, Serialize)]
pub struct AssetCompletenessSummary {
    pub complete_count: i64,
    pub incomplete_count: i64,
    pub missing_assets: Vec<CharacterMissingAsset>,
}
```

**Acceptance Criteria:**
- [ ] `get_validation_summary` aggregates metadata, video, and asset status across all project characters
- [ ] `revalidate_project` re-runs metadata validation against current template for all characters
- [ ] Returns counts with drill-down lists of specific issues
- [ ] Handler module registered in `handlers/mod.rs`

### Task 4.5: Register routes
**File:** `apps/backend/crates/api/src/lib.rs` (modify existing route tree)

Register all new endpoints in the API router.

```
POST   /api/v1/projects/{id}/ingest/scan
POST   /api/v1/projects/{id}/ingest/text
GET    /api/v1/projects/{id}/ingest/{session_id}
GET    /api/v1/projects/{id}/ingest/{session_id}/entries
PUT    /api/v1/projects/{id}/ingest/{session_id}/entries/{entry_id}
POST   /api/v1/projects/{id}/ingest/{session_id}/validate
POST   /api/v1/projects/{id}/ingest/{session_id}/generate-metadata/{entry_id}
POST   /api/v1/projects/{id}/ingest/{session_id}/confirm
DELETE /api/v1/projects/{id}/ingest/{session_id}
GET    /api/v1/metadata-templates
GET    /api/v1/metadata-templates/{id}
POST   /api/v1/metadata-templates
PUT    /api/v1/metadata-templates/{id}
DELETE /api/v1/metadata-templates/{id}
GET    /api/v1/metadata-templates/{id}/fields
POST   /api/v1/metadata-templates/{id}/fields
DELETE /api/v1/metadata-templates/{id}/fields/{field_id}
GET    /api/v1/video-specs
GET    /api/v1/video-specs/{id}
POST   /api/v1/video-specs
PUT    /api/v1/video-specs/{id}
DELETE /api/v1/video-specs/{id}
GET    /api/v1/projects/{id}/validation-summary
POST   /api/v1/projects/{id}/validate
```

**Acceptance Criteria:**
- [ ] All endpoints registered under correct paths with correct HTTP methods
- [ ] Ingest routes nested under `/projects/{id}/ingest`
- [ ] Metadata template routes at `/metadata-templates`
- [ ] Video spec routes at `/video-specs`
- [ ] Validation summary routes nested under `/projects/{id}`
- [ ] Route tree comment updated in the crate's router documentation
- [ ] `DefaultBodyLimit` configured for scan endpoint (multipart file uploads)

---

## Phase 5: Frontend — Character Ingest Wizard

### Task 5.1: API hooks for character ingest
**File:** `apps/frontend/src/features/character-ingest/hooks/useCharacterIngest.ts`

TanStack Query hooks for all ingest endpoints.

```typescript
export function useScanFolder(projectId: number);
export function useIngestFromText(projectId: number);
export function useIngestSession(projectId: number, sessionId: number);
export function useIngestEntries(projectId: number, sessionId: number);
export function useUpdateIngestEntry(projectId: number, sessionId: number);
export function useValidateSession(projectId: number, sessionId: number);
export function useGenerateMetadata(projectId: number, sessionId: number);
export function useConfirmImport(projectId: number, sessionId: number);
export function useCancelSession(projectId: number, sessionId: number);
export function useMetadataTemplates(projectId?: number);
export function useVideoSpecs(projectId?: number);
export function useValidationSummary(projectId: number);
export function useRevalidateProject(projectId: number);
```

**Acceptance Criteria:**
- [ ] All hooks use TanStack Query (`useQuery` for reads, `useMutation` for writes)
- [ ] Query keys follow existing pattern: `['ingest', { projectId, sessionId }]`
- [ ] Mutations invalidate relevant queries on success
- [ ] Uses shared `api` client from `@/lib/api`
- [ ] TypeScript types for all request/response DTOs

### Task 5.2: Folder import wizard component
**File:** `apps/frontend/src/features/character-ingest/FolderImportWizard.tsx`

Multi-step wizard: Scan → Preview → Fix → Confirm.

```typescript
interface FolderImportWizardProps {
  projectId: number;
  onComplete: (characterIds: number[]) => void;
  onCancel: () => void;
}

export function FolderImportWizard({ projectId, onComplete, onCancel }: FolderImportWizardProps) {
  // Step 1: Upload folder / paste names
  // Step 2: Preview parsed characters with name/image/metadata status
  // Step 3: Fix issues (edit names, resolve validation errors)
  // Step 4: Confirm import
}
```

Reuse design system components: `Stepper` (or similar wizard component), `Card`, `Badge`, `Table`, `Modal`.

**Acceptance Criteria:**
- [ ] 4-step wizard with clear step indicators
- [ ] Step 1: Folder drag-and-drop (reuse `FolderDropZone` from `features/importer`) OR text/CSV paste
- [ ] Step 2: Preview table with one row per detected character
- [ ] Step 3: Issue resolution panel for entries with warnings/failures
- [ ] Step 4: Confirmation dialog with final counts and "Confirm Import" button
- [ ] Progress indicator during import (character-by-character)
- [ ] Post-import summary with links to created characters
- [ ] Named export, no default export

### Task 5.3: Import preview table component
**File:** `apps/frontend/src/features/character-ingest/ImportPreviewTable.tsx`

Dense, scannable table showing all detected characters with inline editing.

```typescript
interface ImportPreviewTableProps {
  entries: CharacterIngestEntry[];
  onUpdateEntry: (entryId: number, updates: Partial<IngestEntryUpdate>) => void;
  onToggleInclude: (entryId: number) => void;
}
```

Columns:
- Include/exclude checkbox
- Original folder name
- Parsed name (editable inline)
- Detected images (thumbnails with track classification badges)
- Metadata status badge (found/generating/generated/failed/missing)
- Validation status badge (pass/warning/fail)
- Target group selector

**Acceptance Criteria:**
- [ ] One row per character entry
- [ ] Inline name editing with original folder name shown alongside
- [ ] Image thumbnails with track classification labels
- [ ] Color-coded badges: green=pass, yellow=warning, red=fail
- [ ] Include/exclude toggle per row
- [ ] Bulk selection for group assignment
- [ ] Summary bar: "X ready, Y need attention, Z excluded"
- [ ] Expandable row detail for viewing issues

### Task 5.4: Name parser preview component
**File:** `apps/frontend/src/features/character-ingest/NameParserPreview.tsx`

Shows original folder name alongside parsed name with confidence indicator.

```typescript
interface NameParserPreviewProps {
  original: string;
  parsed: string;
  confidence: 'high' | 'medium' | 'low';
  onEdit: (newName: string) => void;
}
```

**Acceptance Criteria:**
- [ ] Shows original → parsed name mapping with arrow indicator
- [ ] Confidence badge: green=high, yellow=medium, red=low
- [ ] Low confidence entries highlighted for manual review
- [ ] Inline editing of parsed name

### Task 5.5: Validation dashboard page
**File:** `apps/frontend/src/features/character-ingest/ValidationDashboard.tsx`

Project-wide validation overview (PRD-113 Req 1.9).

```typescript
interface ValidationDashboardProps {
  projectId: number;
}

export function ValidationDashboard({ projectId }: ValidationDashboardProps) {
  // Metadata validation summary
  // Video validation summary
  // Asset completeness summary
  // Re-validate All button
  // Export as CSV/JSON
}
```

**Acceptance Criteria:**
- [ ] Three summary sections: metadata, video, asset completeness
- [ ] Each section shows pass/fail counts with drill-down to specific characters
- [ ] "Re-validate All" button triggers project-wide re-validation
- [ ] Export buttons for CSV and JSON
- [ ] Clickable character names link to character detail page
- [ ] Named export, no default export

### Task 5.6: Feature module index
**File:** `apps/frontend/src/features/character-ingest/index.ts`

Export all public components and hooks.

**Acceptance Criteria:**
- [ ] Re-exports all components and hooks
- [ ] Follows existing feature module index patterns

---

## Phase 6: Integration Tests

### Task 6.1: Name parser unit tests
**File:** `apps/backend/crates/core/src/name_parser.rs` (inline `#[cfg(test)]` module)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_underscore_name() {
        let result = parse_character_name("aj_riley");
        assert_eq!(result.parsed, "AJ Riley");
        assert_eq!(result.confidence, NameConfidence::High);
    }

    #[test]
    fn test_parse_name_particle_at_start() {
        let result = parse_character_name("la_perla");
        assert_eq!(result.parsed, "La Perla");
    }

    #[test]
    fn test_parse_salutation() {
        let result = parse_character_name("mr_simons");
        assert_eq!(result.parsed, "Mr Simons");
    }

    #[test]
    fn test_parse_name_particle_middle() {
        let result = parse_character_name("tesa_von_doom");
        assert_eq!(result.parsed, "Tesa von Doom");
    }

    #[test]
    fn test_parse_single_name() {
        let result = parse_character_name("xena");
        assert_eq!(result.parsed, "Xena");
    }

    #[test]
    fn test_parse_multi_word_name() {
        let result = parse_character_name("mary_jane_watson");
        assert_eq!(result.parsed, "Mary Jane Watson");
    }

    #[test]
    fn test_parse_numeric_low_confidence() {
        let result = parse_character_name("001");
        assert_eq!(result.confidence, NameConfidence::Low);
    }
}
```

**Acceptance Criteria:**
- [ ] All 7 test cases from PRD pass
- [ ] Additional edge cases: empty string, hyphens, mixed case input, all-caps input
- [ ] Tests are deterministic and do not depend on external state

### Task 6.2: Metadata validator unit tests
**File:** `apps/backend/crates/core/src/metadata_validator.rs` (inline `#[cfg(test)]` module)

**Acceptance Criteria:**
- [ ] Test required field missing → error
- [ ] Test wrong type → error (e.g., string where number expected)
- [ ] Test constraint violation → error (e.g., age < 0)
- [ ] Test unknown field → warning (not error)
- [ ] Test valid metadata → pass
- [ ] Test empty metadata against template with no required fields → pass

### Task 6.3: Video spec validator unit tests
**File:** `apps/backend/crates/core/src/video_spec_validator.rs` (inline `#[cfg(test)]` module)

**Acceptance Criteria:**
- [ ] Test framerate mismatch → violation
- [ ] Test duration out of range → violation
- [ ] Test resolution mismatch → violation
- [ ] Test codec mismatch → violation
- [ ] Test all specs met → pass
- [ ] Test spec with all None fields → pass (no requirements = no violations)

### Task 6.4: DB-level ingest session and entry CRUD tests
**File:** `apps/backend/crates/db/tests/character_ingest.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_ingest_session(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_ingest_entries_batch(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_entry_metadata_status(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_entry_validation(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_count_entries_by_status(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_metadata_template_crud(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_video_spec_requirement_crud(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Session CRUD: create, find_by_id, update_status, update_counts
- [ ] Entry CRUD: create, create_batch, find_by_id, list_by_session
- [ ] Entry updates: metadata_status, validation, confirmed_name
- [ ] Count aggregation returns correct numbers by validation status
- [ ] Metadata template: create, find_default, list, field management
- [ ] Video spec: create, list_active with filters
- [ ] All tests pass with `sqlx::test` and real migrations

### Task 6.5: API-level ingest endpoint tests
**File:** `apps/backend/crates/api/tests/character_ingest_api.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_ingest_from_text(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_ingest_session(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_ingest_entry(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_validate_ingest_session(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_confirm_import_creates_characters(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_cancel_ingest_session(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_confirm_import_skips_excluded_entries(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Text ingest creates session + entries with parsed names
- [ ] Get session returns session detail with entries and counts
- [ ] Entry update persists name/classification/include changes
- [ ] Validate runs metadata validation and updates entry statuses
- [ ] Confirm creates characters in the project, links entries to characters
- [ ] Confirm skips excluded entries (is_included = false)
- [ ] Cancel updates session status to cancelled
- [ ] Uses `common::build_test_app` and shared HTTP helpers

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260225000001_create_metadata_templates.sql` | Metadata template tables |
| `apps/db/migrations/20260225000002_create_video_spec_requirements.sql` | Video spec requirements table |
| `apps/db/migrations/20260225000003_create_character_ingest_tables.sql` | Ingest session and entry tables |
| `apps/backend/crates/core/src/name_parser.rs` | Character name parser (pure logic) |
| `apps/backend/crates/core/src/character_ingest.rs` | Folder scanner and image classifier |
| `apps/backend/crates/core/src/metadata_validator.rs` | Metadata template validation engine |
| `apps/backend/crates/core/src/video_spec_validator.rs` | Video spec validation engine |
| `apps/backend/crates/core/src/lib.rs` | Register new core modules |
| `apps/backend/crates/db/src/models/metadata_template.rs` | Metadata template model structs |
| `apps/backend/crates/db/src/models/video_spec.rs` | Video spec requirement model structs |
| `apps/backend/crates/db/src/models/character_ingest.rs` | Ingest session and entry model structs |
| `apps/backend/crates/db/src/models/mod.rs` | Register new model modules |
| `apps/backend/crates/db/src/repositories/metadata_template_repo.rs` | Metadata template CRUD |
| `apps/backend/crates/db/src/repositories/video_spec_repo.rs` | Video spec CRUD |
| `apps/backend/crates/db/src/repositories/character_ingest_repo.rs` | Ingest session and entry CRUD |
| `apps/backend/crates/db/src/repositories/mod.rs` | Register new repo modules |
| `apps/backend/crates/api/src/handlers/character_ingest.rs` | Ingest pipeline API handlers |
| `apps/backend/crates/api/src/handlers/metadata_template.rs` | Metadata template CRUD handlers |
| `apps/backend/crates/api/src/handlers/video_spec.rs` | Video spec CRUD handlers |
| `apps/backend/crates/api/src/handlers/validation_dashboard.rs` | Project validation summary handler |
| `apps/backend/crates/api/src/handlers/mod.rs` | Register new handler modules |
| `apps/backend/crates/api/src/lib.rs` | Register new routes |
| `apps/backend/crates/db/tests/character_ingest.rs` | DB-level integration tests |
| `apps/backend/crates/api/tests/character_ingest_api.rs` | API-level integration tests |
| `apps/frontend/src/features/character-ingest/hooks/useCharacterIngest.ts` | TanStack Query hooks |
| `apps/frontend/src/features/character-ingest/FolderImportWizard.tsx` | Import wizard component |
| `apps/frontend/src/features/character-ingest/ImportPreviewTable.tsx` | Preview table component |
| `apps/frontend/src/features/character-ingest/NameParserPreview.tsx` | Name parser preview component |
| `apps/frontend/src/features/character-ingest/ValidationDashboard.tsx` | Validation dashboard component |
| `apps/frontend/src/features/character-ingest/index.ts` | Feature module exports |

---

## Dependencies

### Existing Components to Reuse
- `x121_core::types::{DbId, Timestamp}` — Shared type aliases
- `x121_core::error::CoreError` — Domain error variants
- `x121_core::importer` — `ParsedFile`, `is_hidden_or_system`, staging utilities (PRD-016)
- `x121_core::validation` — Rule evaluator patterns (PRD-014)
- `x121_db::models::character::{Character, CreateCharacter}` — Character creation
- `x121_db::repositories::CharacterRepo` — `create` method for bulk character creation
- `x121_api::error::{AppError, AppResult}` — HTTP error mapping
- `x121_api::state::AppState` — Shared app state
- `x121_api::handlers::importer` — Multipart upload patterns
- `apps/frontend/src/features/importer/FolderDropZone.tsx` — Drag-and-drop folder upload component
- `apps/frontend/src/features/importer/ImportProgress.tsx` — Progress indicator component
- `apps/frontend/src/lib/api.ts` — Shared API client
- `tests/common/mod.rs` — `build_test_app`, `body_json`, `post_json`, `get`, `delete` helpers

### New Infrastructure Needed
- `regex` crate (if not already present) for metadata template pattern validation
- No new external dependencies beyond what the workspace already includes

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migrations — Tasks 1.1-1.3
2. Phase 2: Backend Models & Repositories — Tasks 2.1-2.6
3. Phase 3: Core Domain Logic — Tasks 3.1-3.4
4. Phase 4: API Handlers & Routes — Tasks 4.1-4.5
5. Phase 5: Frontend — Tasks 5.1-5.6
6. Phase 6: Integration Tests — Tasks 6.1-6.5

**MVP Success Criteria:**
- Character name parser correctly handles all PRD test cases (6/6)
- Folder scanner detects images, metadata files, and classifies correctly
- Metadata validation catches missing required fields, wrong types, constraint violations
- Video spec validation catches framerate, duration, resolution mismatches
- Bulk import from folder creates characters with images and metadata
- Text/CSV import creates characters from name lists
- Import preview shows parsed names, status badges, inline editing
- Confirm import creates characters in a single transaction
- Validation dashboard shows project-wide metadata, video, and asset status
- All integration tests pass (DB and API)

### Post-MVP Enhancements
- Watch folder (PRD-113 Req 2.1) — filesystem monitoring for auto-scan
- Custom name parsing rules (PRD-113 Req 2.2) — admin-configurable parser rules
- Metadata template editor UI (PRD-113 Req 2.3) — admin UI for editing templates
- ZIP file upload support — extract and scan
- Auto-import mode — skip preview for trusted folders

---

## Notes

1. **Reuse PRD-016 importer patterns:** The folder upload and multipart handling in `handlers/importer.rs` provides a proven pattern for receiving folder uploads. The character ingest handler should follow the same staging directory approach.
2. **Reuse PRD-014 validation patterns:** The metadata template validator (`metadata_validator.rs`) should reuse the field-level validation patterns from `core/validation/evaluator.rs` rather than reimplementing type checking, range checks, etc. Import the shared logic.
3. **Name parser is zero-dep:** The name parser module in `core` depends only on `std` and `serde` (for serializing results). It should NOT depend on `sqlx`, `tokio`, or any I/O crate.
4. **Transaction for confirm:** The `confirm_import` handler must wrap all character creations in a single database transaction. If any creation fails, the entire batch rolls back to prevent partial imports.
5. **Metadata generation is async:** The `generate_metadata` endpoint triggers a script via PRD-09's script orchestrator and returns immediately. The entry's `metadata_status` transitions from `none` → `generating` → `generated`/`failed`. The frontend polls or uses WebSocket to track progress.
6. **Video spec validation is separate from ingest:** Video specs validate generated/imported videos, not the character ingest itself. The tables and validator are built here because the PRD defines them, but they are triggered by post-generation hooks, not the ingest wizard.

---

## Version History

- **v1.0** (2026-02-25): Initial task list creation from PRD-113

# Task List: Dual-Metadata System (JSON)

**PRD Reference:** `design/prds/013-prd-dual-metadata-system.md`
**Scope:** Automated generation of `character_metadata.json` and `video_metadata.json` files from database records, with synchronization, staleness detection, batch regeneration, and delivery integration.

## Overview

This PRD builds a metadata generation service in Rust that reads from the existing character and scene tables (PRD-001) and produces structured, schema-validated JSON files. The system uses serde for serialization and integrates with PRD-014's validation layer for schema enforcement. Metadata files are regenerated on data changes (via event hooks) and included in delivery packages (PRD-039).

### What Already Exists
- PRD-000: Database conventions, migration framework, `DbId` type alias
- PRD-001: Core entity tables (`characters`, `scenes`, `segments`, `scene_types`, etc.)
- PRD-014: Data validation / schema enforcement layer (will be used for JSON schema validation)

### What We're Building
1. JSON schema definitions for `character_metadata` and `video_metadata`
2. Metadata generation service (Rust/serde) that reads DB records and produces JSON
3. Staleness detection — comparing DB `updated_at` against generated file timestamps
4. Batch regeneration API for all characters in a project
5. API endpoints for preview and manual regeneration
6. Delivery integration hooks ensuring metadata is present in packages

### Key Design Decisions
1. **serde_json with pretty-print** — Human-readable output with 2-space indentation for debugging and manual inspection.
2. **Schema-first approach** — JSON schemas are defined as Rust structs with serde, ensuring compile-time field presence. Runtime validation via PRD-014 is a second gate.
3. **Event-driven regeneration** — Metadata regeneration is triggered by database writes (character update, scene completion), not periodic polling.
4. **No new tables** — This PRD reads from existing tables. Metadata sync state is tracked via a lightweight `metadata_generations` table recording last generation timestamps.

---

## Phase 1: Schema Definitions & Rust Types

### Task 1.1: Character Metadata JSON Schema
**File:** `src/metadata/character_schema.rs`

Define the Rust struct that serializes to `character_metadata.json`. All fields map to existing character table columns plus joined data.

```rust
use serde::{Deserialize, Serialize};
use crate::types::DbId;

#[derive(Debug, Serialize, Deserialize)]
pub struct CharacterMetadata {
    pub schema_version: String,
    pub character_id: DbId,
    pub name: String,
    pub project_id: DbId,
    pub project_name: String,

    // Biographical data
    pub biographical: BiographicalData,

    // Physical attributes
    pub physical_attributes: PhysicalAttributes,

    // Image references
    pub source_image: ImageReference,
    pub derived_images: Vec<ImageReference>,
    pub image_variants: Vec<ImageVariantInfo>,

    // Custom metadata (extensible key-value pairs)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_fields: Option<serde_json::Value>,

    // Generation info
    pub generated_at: String, // ISO 8601
    pub source_updated_at: String, // ISO 8601 — last DB update
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BiographicalData {
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PhysicalAttributes {
    pub height: Option<String>,
    pub build: Option<String>,
    pub hair_color: Option<String>,
    pub eye_color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageReference {
    pub image_id: DbId,
    pub filename: String,
    pub path: String,
    pub image_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageVariantInfo {
    pub variant_id: DbId,
    pub variant_type: String,
    pub status: String,
    pub image: ImageReference,
}
```

**Acceptance Criteria:**
- [ ] `CharacterMetadata` struct serializes to valid JSON via serde
- [ ] All required fields from PRD are present: name, biographical, physical attributes, custom metadata
- [ ] `schema_version` field enables future schema evolution
- [ ] `generated_at` and `source_updated_at` enable staleness detection
- [ ] Unit test serializes a sample struct and verifies JSON structure

### Task 1.2: Video Metadata JSON Schema
**File:** `src/metadata/video_schema.rs`

Define the Rust struct for `video_metadata.json`. Contains technical video information per scene.

```rust
use serde::{Deserialize, Serialize};
use crate::types::DbId;

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub schema_version: String,
    pub scene_id: DbId,
    pub character_id: DbId,
    pub character_name: String,
    pub scene_type: String,

    // Technical details
    pub technical: VideoTechnicalInfo,

    // Segments
    pub segments: Vec<SegmentInfo>,

    // Provenance
    pub provenance: ProvenanceInfo,

    // Quality scores (from PRD-049 auto-QA, nullable until available)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quality_scores: Option<QualityScores>,

    pub generated_at: String,
    pub source_updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoTechnicalInfo {
    pub duration_seconds: f64,
    pub resolution: String,
    pub codec: String,
    pub fps: f64,
    pub segment_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SegmentInfo {
    pub segment_id: DbId,
    pub sequence_index: i32,
    pub seed_frame_path: String,
    pub output_video_path: String,
    pub last_frame_path: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProvenanceInfo {
    pub workflow_name: String,
    pub model_version: Option<String>,
    pub lora_versions: Vec<String>,
    pub generation_parameters: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QualityScores {
    pub overall_score: f64,
    pub per_segment_scores: Vec<f64>,
}
```

**Acceptance Criteria:**
- [ ] `VideoMetadata` struct includes scene type, duration, resolution, codec, segment count
- [ ] `ProvenanceInfo` captures workflow, model, and LoRA versions
- [ ] `QualityScores` is optional (populated when PRD-049 data is available)
- [ ] Unit test serializes a sample struct and verifies JSON structure

### Task 1.3: Module Registration
**File:** `src/metadata/mod.rs`

Create the metadata module that exports all schema types and the generation service.

```rust
pub mod character_schema;
pub mod video_schema;
pub mod generator;
pub mod sync;
```

**Acceptance Criteria:**
- [ ] Module compiles and all sub-modules are accessible
- [ ] `src/main.rs` or `src/lib.rs` registers the `metadata` module

---

## Phase 2: Metadata Generation Service

### Task 2.1: Database Migration — Metadata Generation Tracking
**File:** `migrations/{timestamp}_create_metadata_generations.sql`

Track when metadata was last generated per entity, enabling staleness detection.

```sql
CREATE TABLE metadata_generations (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,           -- 'character' or 'scene'
    entity_id BIGINT NOT NULL,
    file_type TEXT NOT NULL,             -- 'character_metadata' or 'video_metadata'
    file_path TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_updated_at TIMESTAMPTZ NOT NULL,  -- snapshot of entity's updated_at at generation time
    schema_version TEXT NOT NULL,
    file_hash TEXT NOT NULL,             -- SHA-256 of generated file for integrity
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metadata_generations_entity
    ON metadata_generations(entity_type, entity_id);
CREATE INDEX idx_metadata_generations_file_type
    ON metadata_generations(file_type);
CREATE UNIQUE INDEX uq_metadata_generations_entity_file
    ON metadata_generations(entity_type, entity_id, file_type);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON metadata_generations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Table uses `BIGSERIAL PRIMARY KEY` and `BIGINT` for `entity_id`
- [ ] Unique constraint prevents duplicate entries per entity+file_type
- [ ] `source_updated_at` captures the entity's `updated_at` at generation time
- [ ] `file_hash` enables integrity verification
- [ ] Migration applies cleanly via `sqlx migrate run`

### Task 2.2: Character Metadata Generator
**File:** `src/metadata/generator.rs`

Service that queries the database and produces a `CharacterMetadata` struct, then serializes to JSON.

```rust
use sqlx::PgPool;
use crate::types::DbId;
use super::character_schema::CharacterMetadata;

pub async fn generate_character_metadata(
    pool: &PgPool,
    character_id: DbId,
) -> Result<CharacterMetadata, MetadataError> {
    // Query character + joined project, images, variants
    let character = sqlx::query_as!(
        CharacterRow,
        r#"
        SELECT c.id, c.name, c.updated_at,
               p.id as project_id, p.name as project_name
        FROM characters c
        JOIN projects p ON p.id = c.project_id
        WHERE c.id = $1
        "#,
        character_id
    )
    .fetch_one(pool)
    .await?;

    // Build CharacterMetadata from queried data
    // ...serialize with serde_json::to_string_pretty()
    todo!()
}

pub fn serialize_metadata<T: serde::Serialize>(metadata: &T) -> Result<String, MetadataError> {
    serde_json::to_string_pretty(metadata).map_err(MetadataError::Serialization)
}
```

**Acceptance Criteria:**
- [ ] Queries character, project, images, and variants from DB
- [ ] Produces a complete `CharacterMetadata` struct
- [ ] Serializes to pretty-printed JSON (2-space indent)
- [ ] Returns descriptive error if character not found
- [ ] Generation completes in <1 second per character (per success metric)

### Task 2.3: Video Metadata Generator
**File:** `src/metadata/generator.rs`

Extend the generator to produce `VideoMetadata` for a scene.

```rust
pub async fn generate_video_metadata(
    pool: &PgPool,
    scene_id: DbId,
) -> Result<VideoMetadata, MetadataError> {
    // Query scene + character + scene_type + segments
    // Include provenance (workflow, model, LoRA versions)
    // Include quality scores if available
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Queries scene, character, scene_type, and all segments
- [ ] Includes provenance data (workflow name, model version, LoRA versions)
- [ ] Includes quality scores when available (null-safe)
- [ ] Produces valid `VideoMetadata` struct
- [ ] Serializes to pretty-printed JSON

### Task 2.4: Metadata File Writer
**File:** `src/metadata/generator.rs`

Write generated JSON to disk and record the generation in `metadata_generations`.

```rust
pub async fn write_metadata_file(
    pool: &PgPool,
    entity_type: &str,
    entity_id: DbId,
    file_type: &str,
    content: &str,
    output_dir: &std::path::Path,
    source_updated_at: chrono::DateTime<chrono::Utc>,
) -> Result<std::path::PathBuf, MetadataError> {
    let filename = format!("{}.json", file_type);
    let file_path = output_dir.join(&filename);

    // Write file
    tokio::fs::write(&file_path, content).await?;

    // Compute hash
    let hash = sha256_hex(content.as_bytes());

    // Upsert metadata_generations record
    sqlx::query!(
        r#"
        INSERT INTO metadata_generations (entity_type, entity_id, file_type, file_path, source_updated_at, schema_version, file_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (entity_type, entity_id, file_type)
        DO UPDATE SET file_path = $4, generated_at = NOW(), source_updated_at = $5,
                      schema_version = $6, file_hash = $7
        "#,
        entity_type, entity_id, file_type,
        file_path.to_string_lossy().as_ref(),
        source_updated_at, "1.0", hash
    )
    .execute(pool)
    .await?;

    Ok(file_path)
}
```

**Acceptance Criteria:**
- [ ] Writes JSON file to the specified output directory
- [ ] Records generation in `metadata_generations` table (upsert)
- [ ] Computes and stores SHA-256 hash of file content
- [ ] File path is recorded for downstream retrieval
- [ ] Handles directory creation if output path doesn't exist

---

## Phase 3: Staleness Detection & Synchronization

### Task 3.1: Staleness Checker
**File:** `src/metadata/sync.rs`

Detect metadata files that are out of sync with their source database records.

```rust
use sqlx::PgPool;
use crate::types::DbId;

pub struct StaleMetadata {
    pub entity_type: String,
    pub entity_id: DbId,
    pub file_type: String,
    pub generated_at: chrono::DateTime<chrono::Utc>,
    pub source_updated_at: chrono::DateTime<chrono::Utc>,
    pub current_entity_updated_at: chrono::DateTime<chrono::Utc>,
}

pub async fn find_stale_character_metadata(
    pool: &PgPool,
) -> Result<Vec<StaleMetadata>, sqlx::Error> {
    sqlx::query_as!(
        StaleMetadata,
        r#"
        SELECT mg.entity_type, mg.entity_id, mg.file_type,
               mg.generated_at, mg.source_updated_at,
               c.updated_at as current_entity_updated_at
        FROM metadata_generations mg
        JOIN characters c ON c.id = mg.entity_id
        WHERE mg.entity_type = 'character'
          AND mg.source_updated_at < c.updated_at
        "#
    )
    .fetch_all(pool)
    .await
}

pub async fn find_stale_video_metadata(
    pool: &PgPool,
) -> Result<Vec<StaleMetadata>, sqlx::Error> {
    sqlx::query_as!(
        StaleMetadata,
        r#"
        SELECT mg.entity_type, mg.entity_id, mg.file_type,
               mg.generated_at, mg.source_updated_at,
               s.updated_at as current_entity_updated_at
        FROM metadata_generations mg
        JOIN scenes s ON s.id = mg.entity_id
        WHERE mg.entity_type = 'scene'
          AND mg.source_updated_at < s.updated_at
        "#
    )
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] Detects character metadata where `source_updated_at < character.updated_at`
- [ ] Detects video metadata where `source_updated_at < scene.updated_at`
- [ ] Returns list of stale entries with both timestamps for reporting
- [ ] Detects staleness within 1 minute of source data change (per success metric)

### Task 3.2: Batch Regeneration Service
**File:** `src/metadata/sync.rs`

Regenerate all metadata files for a project, or only stale ones.

```rust
pub async fn regenerate_project_metadata(
    pool: &PgPool,
    project_id: DbId,
    stale_only: bool,
    output_base_dir: &std::path::Path,
) -> Result<RegenerationReport, MetadataError> {
    let mut report = RegenerationReport::default();

    // Get all characters in project
    let characters = sqlx::query_scalar!(
        "SELECT id FROM characters WHERE project_id = $1",
        project_id
    )
    .fetch_all(pool)
    .await?;

    for char_id in characters {
        if stale_only && !is_stale(pool, "character", char_id).await? {
            report.skipped += 1;
            continue;
        }
        // Generate and write
        let meta = generate_character_metadata(pool, char_id).await?;
        let json = serialize_metadata(&meta)?;
        let output_dir = output_base_dir.join(format!("character_{}", char_id));
        write_metadata_file(pool, "character", char_id, "character_metadata", &json, &output_dir, meta.source_updated_at).await?;
        report.regenerated += 1;
    }

    Ok(report)
}
```

**Acceptance Criteria:**
- [ ] Regenerates metadata for all characters in a project
- [ ] `stale_only` flag skips up-to-date files
- [ ] Returns a report with counts: regenerated, skipped, failed
- [ ] Handles individual failures gracefully (continue to next character)
- [ ] Batch regeneration is available via API (PRD requirement)

---

## Phase 4: API Endpoints

### Task 4.1: Metadata Preview Endpoint
**File:** `src/routes/metadata.rs`

GET endpoint that returns the current metadata JSON for a character without writing to disk.

```rust
use axum::{extract::{Path, State}, Json, response::IntoResponse};
use crate::types::DbId;

pub async fn preview_character_metadata(
    State(pool): State<sqlx::PgPool>,
    Path(character_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    let metadata = crate::metadata::generator::generate_character_metadata(&pool, character_id).await?;
    Ok(Json(metadata))
}

pub async fn preview_video_metadata(
    State(pool): State<sqlx::PgPool>,
    Path(scene_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    let metadata = crate::metadata::generator::generate_video_metadata(&pool, scene_id).await?;
    Ok(Json(metadata))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/characters/:id/metadata/preview` returns character metadata JSON
- [ ] `GET /api/scenes/:id/metadata/preview` returns video metadata JSON
- [ ] Response is pretty-printed JSON
- [ ] Returns 404 if entity not found
- [ ] Response includes `Content-Type: application/json`

### Task 4.2: Metadata Regeneration Endpoint
**File:** `src/routes/metadata.rs`

POST endpoint to trigger metadata regeneration for a character or project.

```rust
pub async fn regenerate_character_metadata(
    State(pool): State<sqlx::PgPool>,
    Path(character_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    let metadata = crate::metadata::generator::generate_character_metadata(&pool, character_id).await?;
    let json = crate::metadata::generator::serialize_metadata(&metadata)?;
    // Determine output directory from configuration
    let output_dir = get_character_output_dir(character_id);
    crate::metadata::generator::write_metadata_file(
        &pool, "character", character_id, "character_metadata",
        &json, &output_dir, metadata.source_updated_at.parse().unwrap(),
    ).await?;
    Ok(Json(serde_json::json!({ "status": "regenerated", "character_id": character_id })))
}

pub async fn regenerate_project_metadata(
    State(pool): State<sqlx::PgPool>,
    Path(project_id): Path<DbId>,
    Json(body): Json<RegenerateProjectRequest>,
) -> Result<impl IntoResponse, AppError> {
    let output_dir = get_project_output_dir(project_id);
    let report = crate::metadata::sync::regenerate_project_metadata(
        &pool, project_id, body.stale_only.unwrap_or(false), &output_dir,
    ).await?;
    Ok(Json(report))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/characters/:id/metadata/regenerate` regenerates and writes metadata
- [ ] `POST /api/projects/:id/metadata/regenerate` batch-regenerates for all characters
- [ ] Batch endpoint accepts `stale_only` flag in request body
- [ ] Returns regeneration report with counts
- [ ] Returns 404 if entity not found

### Task 4.3: Staleness Check Endpoint
**File:** `src/routes/metadata.rs`

GET endpoint to retrieve all stale metadata for a project.

```rust
pub async fn get_stale_metadata(
    State(pool): State<sqlx::PgPool>,
    Path(project_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    let stale_characters = crate::metadata::sync::find_stale_character_metadata(&pool).await?;
    let stale_videos = crate::metadata::sync::find_stale_video_metadata(&pool).await?;
    // Filter to project's entities
    Ok(Json(serde_json::json!({
        "stale_character_metadata": stale_characters,
        "stale_video_metadata": stale_videos,
    })))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/projects/:id/metadata/stale` returns all stale metadata entries
- [ ] Response grouped by character_metadata and video_metadata
- [ ] Each entry includes entity_id, generated_at, and current entity updated_at

### Task 4.4: Route Registration
**File:** `src/routes/mod.rs`

Register all metadata routes with the Axum router.

```rust
use axum::{routing::{get, post}, Router};

pub fn metadata_routes() -> Router<AppState> {
    Router::new()
        .route("/api/characters/:id/metadata/preview", get(metadata::preview_character_metadata))
        .route("/api/scenes/:id/metadata/preview", get(metadata::preview_video_metadata))
        .route("/api/characters/:id/metadata/regenerate", post(metadata::regenerate_character_metadata))
        .route("/api/projects/:id/metadata/regenerate", post(metadata::regenerate_project_metadata))
        .route("/api/projects/:id/metadata/stale", get(metadata::get_stale_metadata))
}
```

**Acceptance Criteria:**
- [ ] All 5 metadata endpoints are registered
- [ ] Routes use correct HTTP methods (GET for read, POST for write)
- [ ] Router integrates with the main application router

---

## Phase 5: Delivery Integration

### Task 5.1: Delivery Metadata Validator
**File:** `src/metadata/delivery.rs`

Validate that all characters in a project have up-to-date metadata before delivery packaging.

```rust
pub struct DeliveryMetadataCheck {
    pub character_id: DbId,
    pub character_name: String,
    pub has_character_metadata: bool,
    pub has_video_metadata: bool,
    pub is_stale: bool,
}

pub async fn validate_delivery_metadata(
    pool: &PgPool,
    project_id: DbId,
) -> Result<Vec<DeliveryMetadataCheck>, MetadataError> {
    // Check every character has metadata_generations entries
    // Check none are stale
    // Return per-character status
    todo!()
}

pub async fn block_delivery_if_metadata_missing(
    pool: &PgPool,
    project_id: DbId,
) -> Result<(), MetadataError> {
    let checks = validate_delivery_metadata(pool, project_id).await?;
    let missing: Vec<_> = checks.iter().filter(|c| !c.has_character_metadata).collect();
    if !missing.is_empty() {
        return Err(MetadataError::MissingMetadata {
            character_ids: missing.iter().map(|c| c.character_id).collect(),
        });
    }
    Ok(())
}
```

**Acceptance Criteria:**
- [ ] Validates every character in the project has character_metadata generated
- [ ] Flags stale metadata (out of sync with DB)
- [ ] Blocks delivery packaging if any metadata is missing
- [ ] Returns clear error listing which characters are missing metadata
- [ ] Integrates with PRD-039 delivery packaging workflow

### Task 5.2: Metadata File Collector for Delivery
**File:** `src/metadata/delivery.rs`

Collect metadata JSON files into the delivery package directory structure.

```rust
pub async fn collect_metadata_for_delivery(
    pool: &PgPool,
    project_id: DbId,
    delivery_dir: &std::path::Path,
) -> Result<Vec<std::path::PathBuf>, MetadataError> {
    // For each character, copy character_metadata.json into delivery folder
    // Naming: {delivery_dir}/{character_name}/metadata.json
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Copies `character_metadata.json` to `{character_name}/metadata.json` in delivery folder
- [ ] File naming matches PRD-001 delivery ZIP structure
- [ ] Returns list of collected file paths for packaging
- [ ] Handles characters with special characters in names (filesystem-safe)

---

## Phase 6: Frontend — Metadata Preview Panel

### Task 6.1: Metadata Preview Component
**File:** `frontend/src/components/metadata/MetadataPreview.tsx`

React component that displays the metadata JSON for a character in a formatted, read-only view.

```typescript
import React, { useEffect, useState } from 'react';

interface MetadataPreviewProps {
  characterId: number;
}

export const MetadataPreview: React.FC<MetadataPreviewProps> = ({ characterId }) => {
  const [metadata, setMetadata] = useState<object | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/characters/${characterId}/metadata/preview`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load metadata: ${res.status}`);
        return res.json();
      })
      .then(data => { setMetadata(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [characterId]);

  if (loading) return <div>Loading metadata...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="metadata-preview">
      <h3>Character Metadata</h3>
      <pre className="json-display">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] Fetches and displays character metadata JSON
- [ ] JSON is formatted with indentation for readability
- [ ] Loading and error states are handled
- [ ] Component is reusable for both character and video metadata

### Task 6.2: Staleness Indicator Component
**File:** `frontend/src/components/metadata/StalenessIndicator.tsx`

Visual indicator showing whether a character's metadata is up-to-date or stale.

```typescript
interface StalenessIndicatorProps {
  isStale: boolean;
  generatedAt: string;
  sourceUpdatedAt: string;
}

export const StalenessIndicator: React.FC<StalenessIndicatorProps> = ({
  isStale,
  generatedAt,
  sourceUpdatedAt,
}) => (
  <div className={`staleness-indicator ${isStale ? 'stale' : 'current'}`}>
    <span className="status-dot" />
    <span>{isStale ? 'Out of date' : 'Up to date'}</span>
    <span className="timestamp">Generated: {new Date(generatedAt).toLocaleString()}</span>
  </div>
);
```

**Acceptance Criteria:**
- [ ] Shows green/current when metadata matches DB
- [ ] Shows red/stale when metadata is outdated
- [ ] Displays generation timestamp
- [ ] Provides a "Regenerate" button when stale

### Task 6.3: Regeneration Controls
**File:** `frontend/src/components/metadata/RegenerationControls.tsx`

UI controls for triggering single-character or project-wide metadata regeneration.

```typescript
interface RegenerationControlsProps {
  characterId?: number;
  projectId?: number;
  onRegenerated: () => void;
}

export const RegenerationControls: React.FC<RegenerationControlsProps> = ({
  characterId,
  projectId,
  onRegenerated,
}) => {
  const [regenerating, setRegenerating] = useState(false);

  const handleRegenerate = async () => {
    setRegenerating(true);
    const url = characterId
      ? `/api/characters/${characterId}/metadata/regenerate`
      : `/api/projects/${projectId}/metadata/regenerate`;
    await fetch(url, { method: 'POST' });
    setRegenerating(false);
    onRegenerated();
  };

  return (
    <button onClick={handleRegenerate} disabled={regenerating}>
      {regenerating ? 'Regenerating...' : 'Regenerate Metadata'}
    </button>
  );
};
```

**Acceptance Criteria:**
- [ ] Triggers regeneration for a single character or entire project
- [ ] Shows loading state during regeneration
- [ ] Calls `onRegenerated` callback to refresh parent data
- [ ] Disabled during regeneration to prevent double-submit

---

## Phase 7: Testing

### Task 7.1: Unit Tests — Schema Serialization
**File:** `tests/metadata_schema_tests.rs`

Test that metadata structs serialize and deserialize correctly.

```rust
#[test]
fn test_character_metadata_round_trip() {
    let meta = CharacterMetadata {
        schema_version: "1.0".to_string(),
        character_id: 42,
        name: "Test Character".to_string(),
        // ... fill all fields
    };
    let json = serde_json::to_string_pretty(&meta).unwrap();
    let deserialized: CharacterMetadata = serde_json::from_str(&json).unwrap();
    assert_eq!(meta.character_id, deserialized.character_id);
}
```

**Acceptance Criteria:**
- [ ] Round-trip serialization/deserialization tests for CharacterMetadata
- [ ] Round-trip serialization/deserialization tests for VideoMetadata
- [ ] Optional fields are correctly omitted when None
- [ ] Schema version is always present

### Task 7.2: Integration Tests — Generation & Staleness
**File:** `tests/metadata_integration_tests.rs`

Test full generation pipeline: generate, detect staleness after update, regenerate.

**Acceptance Criteria:**
- [ ] Test generates character metadata from DB, verifies JSON content
- [ ] Test updates character record, verifies staleness is detected
- [ ] Test regenerates metadata, verifies staleness clears
- [ ] Test batch regeneration for a project
- [ ] Tests run against a test database

### Task 7.3: API Endpoint Tests
**File:** `tests/metadata_api_tests.rs`

Test API endpoints return correct responses.

**Acceptance Criteria:**
- [ ] Preview endpoint returns valid JSON with correct content-type
- [ ] Regeneration endpoint returns success report
- [ ] Staleness endpoint returns stale entries
- [ ] 404 returned for nonexistent entities
- [ ] Tests use Axum test utilities

---

## Relevant Files

| File | Description |
|------|-------------|
| `src/metadata/mod.rs` | Module root — exports schemas, generator, sync |
| `src/metadata/character_schema.rs` | `CharacterMetadata` Rust struct (serde) |
| `src/metadata/video_schema.rs` | `VideoMetadata` Rust struct (serde) |
| `src/metadata/generator.rs` | Metadata generation service — DB queries + JSON output |
| `src/metadata/sync.rs` | Staleness detection and batch regeneration |
| `src/metadata/delivery.rs` | Delivery validation and file collection |
| `src/routes/metadata.rs` | API endpoints — preview, regenerate, stale check |
| `migrations/{timestamp}_create_metadata_generations.sql` | Tracking table for generation state |
| `frontend/src/components/metadata/MetadataPreview.tsx` | JSON preview panel |
| `frontend/src/components/metadata/StalenessIndicator.tsx` | Stale/current indicator |
| `frontend/src/components/metadata/RegenerationControls.tsx` | Regeneration trigger UI |
| `tests/metadata_schema_tests.rs` | Unit tests for serialization |
| `tests/metadata_integration_tests.rs` | Integration tests for generation pipeline |
| `tests/metadata_api_tests.rs` | API endpoint tests |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId` type alias, migration framework, `trigger_set_updated_at()`
- PRD-001: `characters`, `projects`, `scenes`, `segments`, `scene_types` tables
- PRD-014: Schema validation layer (for JSON schema enforcement)

### New Infrastructure Needed
- `serde` / `serde_json` crate (likely already a dependency)
- `sha2` crate for SHA-256 hashing
- `chrono` crate for timestamp handling (with serde feature)

## Implementation Order

### MVP
1. Phase 1: Schema Definitions (Tasks 1.1-1.3)
2. Phase 2: Generation Service (Tasks 2.1-2.4)
3. Phase 3: Staleness Detection (Tasks 3.1-3.2)
4. Phase 4: API Endpoints (Tasks 4.1-4.4)

**MVP Success Criteria:**
- Character metadata JSON is generated from DB records
- Video metadata JSON is generated from DB records
- Staleness detection flags out-of-date files
- Preview and regeneration endpoints work

### Post-MVP Enhancements
1. Phase 5: Delivery Integration (Tasks 5.1-5.2)
2. Phase 6: Frontend Preview Panel (Tasks 6.1-6.3)
3. Phase 7: Testing (Tasks 7.1-7.3)

---

## Notes

1. **Custom metadata extensions (PRD Phase 2):** The `custom_fields: Option<serde_json::Value>` field in `CharacterMetadata` provides the foundation for admin-defined custom fields. The custom field schema management (PRD Phase 2) would add a `metadata_custom_field_schemas` table and validation logic.
2. **Event-driven regeneration:** The current design uses explicit API calls for regeneration. A future enhancement could use PostgreSQL LISTEN/NOTIFY or a message queue to automatically trigger regeneration on entity updates.
3. **Schema versioning:** The `schema_version` field in both metadata types enables backward-compatible evolution. Consumers should check this field before parsing.
4. **File storage strategy:** Metadata files are written to disk alongside the entity's output directory. The exact path convention should be coordinated with PRD-039 (delivery packaging).

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

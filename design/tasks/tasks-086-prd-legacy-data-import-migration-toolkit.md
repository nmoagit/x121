# Task List: Legacy Data Import & Migration Toolkit

**PRD Reference:** `design/prds/086-prd-legacy-data-import-migration-toolkit.md`
**Scope:** Build tools for importing existing completed work (videos, images, metadata) from legacy folder structures and spreadsheets into the platform's data model, with folder-structure inference, CSV metadata import, video/image registration as pre-approved assets, gap analysis, and incremental import support.

## Overview

This PRD solves the cold-start adoption problem by enabling studios to import months or years of existing work without re-doing it through the platform. It provides a multi-step migration wizard: (1) scan an existing folder tree and infer entities from path conventions, (2) import character metadata from CSV/spreadsheets with column mapping, (3) register existing final videos as pre-approved scenes (no re-generation), (4) register source/variant images with automatic embedding extraction and duplicate detection, and (5) run gap analysis to identify what data is still missing after import.

### What Already Exists
- PRD-000: Database conventions, migration framework
- PRD-001: Entity tables (projects, characters, scenes, segments, etc.)
- PRD-014: Validation layer for import validation
- PRD-016: Folder-to-entity bulk importer (for new content — this PRD is for legacy/completed content)
- PRD-076: Face embedding extraction
- PRD-079: Duplicate detection

### What We're Building
1. Legacy folder scanner with configurable path-to-entity mapping rules
2. CSV/spreadsheet metadata importer with column mapping UI
3. Video registration service (import existing videos as pre-approved scenes)
4. Image registration service with automatic embedding and duplicate detection
5. Gap analysis engine (find missing data after import)
6. Incremental import support (repeated imports without duplication)
7. Migration wizard UI

### Key Design Decisions
1. **Files are not moved** — Legacy import references files in-place. The platform stores the path to the existing file, not a copy. This avoids doubling storage usage.
2. **Pre-approved status** — Imported videos are marked as "pre-approved" since they represent completed work. They skip the generation and review pipelines.
3. **Reuse PRD-016 infrastructure** — The folder parser, entity mapper, and import session management from PRD-016 are reused. This PRD adds legacy-specific logic (video registration, pre-approval, CSV metadata, gap analysis).
4. **Incremental by default** — Every import run matches against existing entities by name or configurable key. Duplicates are updated, not recreated.

---

## Phase 1: Database Schema

### Task 1.1: Import Runs Table
**File:** `migrations/{timestamp}_create_legacy_import_runs.sql`

Track legacy import operations.

```sql
CREATE TABLE legacy_import_run_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON legacy_import_run_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO legacy_import_run_statuses (name, description) VALUES
    ('scanning', 'Scanning folder structure'),
    ('mapping', 'Mapping paths to entities'),
    ('preview', 'Preview ready for review'),
    ('importing', 'Import in progress'),
    ('completed', 'Import completed successfully'),
    ('partial', 'Import completed with some skips/errors'),
    ('failed', 'Import failed'),
    ('cancelled', 'Import cancelled');

CREATE TABLE legacy_import_runs (
    id BIGSERIAL PRIMARY KEY,
    status_id BIGINT NOT NULL REFERENCES legacy_import_run_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    source_path TEXT NOT NULL,
    project_id BIGINT NOT NULL,
    mapping_config JSONB NOT NULL DEFAULT '{}',  -- path-to-entity mapping rules
    match_key TEXT NOT NULL DEFAULT 'name',       -- how to match existing entities: 'name', 'path', 'id'
    total_files INTEGER NOT NULL DEFAULT 0,
    characters_created INTEGER NOT NULL DEFAULT 0,
    characters_updated INTEGER NOT NULL DEFAULT 0,
    scenes_registered INTEGER NOT NULL DEFAULT 0,
    images_registered INTEGER NOT NULL DEFAULT 0,
    duplicates_found INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    gap_report JSONB NOT NULL DEFAULT '{}',
    initiated_by BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legacy_import_runs_status_id ON legacy_import_runs(status_id);
CREATE INDEX idx_legacy_import_runs_project_id ON legacy_import_runs(project_id);
CREATE INDEX idx_legacy_import_runs_created_at ON legacy_import_runs(created_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON legacy_import_runs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Run statuses cover full lifecycle
- [ ] `mapping_config` stores configurable path rules
- [ ] `match_key` determines how to match existing entities
- [ ] Counts track characters, scenes, images, duplicates, errors
- [ ] `gap_report` stores analysis results
- [ ] Migration applies cleanly

### Task 1.2: Import Entity Log Table
**File:** `migrations/{timestamp}_create_legacy_import_entity_log.sql`

Per-entity log of what was imported.

```sql
CREATE TABLE legacy_import_entity_log (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES legacy_import_runs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NULL,               -- set after creation
    source_path TEXT NOT NULL,
    action TEXT NOT NULL,                 -- 'created', 'updated', 'skipped', 'failed', 'duplicate'
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legacy_import_entity_log_run_id ON legacy_import_entity_log(run_id);
CREATE INDEX idx_legacy_import_entity_log_entity ON legacy_import_entity_log(entity_type, entity_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON legacy_import_entity_log
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Per-entity record of import action and result
- [ ] Links to run and to created/updated entity
- [ ] Migration applies cleanly

---

## Phase 2: Folder Scanner & Path Mapper

### Task 2.1: Legacy Folder Scanner
**File:** `src/legacy_import/scanner.rs`

Scan a folder tree and infer entities using configurable path patterns.

```rust
use crate::types::DbId;

#[derive(Debug, Clone, Deserialize)]
pub struct PathMappingRule {
    pub pattern: String,        // e.g., "{character_name}/{scene_type}.mp4"
    pub entity_type: String,    // 'character', 'scene_video', 'source_image', 'variant_image'
    pub captures: Vec<String>,  // named captures: ["character_name", "scene_type"]
}

pub fn default_mapping_rules() -> Vec<PathMappingRule> {
    vec![
        PathMappingRule {
            pattern: "{character_name}/{scene_type}.mp4".to_string(),
            entity_type: "scene_video".to_string(),
            captures: vec!["character_name".to_string(), "scene_type".to_string()],
        },
        PathMappingRule {
            pattern: "{character_name}/source.{ext}".to_string(),
            entity_type: "source_image".to_string(),
            captures: vec!["character_name".to_string()],
        },
        PathMappingRule {
            pattern: "{character_name}/clothed.{ext}".to_string(),
            entity_type: "variant_image".to_string(),
            captures: vec!["character_name".to_string()],
        },
        PathMappingRule {
            pattern: "{character_name}/metadata.json".to_string(),
            entity_type: "metadata".to_string(),
            captures: vec!["character_name".to_string()],
        },
    ]
}

pub async fn scan_legacy_folder(
    root: &std::path::Path,
    rules: &[PathMappingRule],
) -> Result<Vec<InferredEntity>, ImportError> {
    let files = crate::import::folder_parser::parse_folder_tree(root).await?;
    let mut entities = Vec::new();

    for file in &files {
        for rule in rules {
            if let Some(captures) = match_pattern(&file.relative_path, &rule.pattern) {
                entities.push(InferredEntity {
                    source_path: file.relative_path.clone(),
                    entity_type: rule.entity_type.clone(),
                    character_name: captures.get("character_name").cloned(),
                    scene_type_name: captures.get("scene_type").cloned(),
                    file_size_bytes: file.file_size_bytes,
                });
                break; // first matching rule wins
            }
        }
    }

    Ok(entities)
}
```

**Acceptance Criteria:**
- [ ] Reuses PRD-016 folder parser for tree traversal
- [ ] Configurable pattern matching with named captures
- [ ] Default rules handle common folder conventions
- [ ] Unmatched files are reported for user review
- [ ] Correctly infers >90% of common patterns (per success metric)

### Task 2.2: Existing Entity Matcher
**File:** `src/legacy_import/matcher.rs`

Match inferred entities against existing database records.

```rust
pub async fn match_existing_entities(
    pool: &PgPool,
    entities: &[InferredEntity],
    project_id: DbId,
    match_key: &str,
) -> Result<Vec<MatchResult>, ImportError> {
    let mut results = Vec::new();

    for entity in entities {
        let existing = match match_key {
            "name" => {
                find_character_by_name(pool, &entity.character_name.as_deref().unwrap_or(""), project_id).await?
            }
            "path" => {
                find_by_source_path(pool, &entity.source_path).await?
            }
            _ => None,
        };

        results.push(MatchResult {
            entity: entity.clone(),
            existing_id: existing.map(|e| e.id),
            action: if existing.is_some() { "update" } else { "create" },
        });
    }

    Ok(results)
}
```

**Acceptance Criteria:**
- [ ] Matches by name (case-insensitive) or path
- [ ] Returns existing entity ID if found (update), None if new (create)
- [ ] Handles missing character names gracefully
- [ ] Previously imported entities matched and updated, not duplicated (per incremental requirement)

---

## Phase 3: Video & Image Registration

### Task 3.1: Video Registration Service
**File:** `src/legacy_import/video_registration.rs`

Register existing videos as pre-approved scenes.

```rust
pub async fn register_legacy_video(
    pool: &PgPool,
    character_id: DbId,
    scene_type_name: &str,
    video_path: &str,
    project_id: DbId,
) -> Result<RegisteredScene, ImportError> {
    // Extract technical metadata from video file
    let tech_meta = extract_video_metadata(video_path).await?;

    // Find or create scene type
    let scene_type_id = find_or_create_scene_type(pool, scene_type_name, project_id).await?;

    // Create scene record (pre-approved)
    let scene_id = sqlx::query_scalar!(
        r#"
        INSERT INTO scenes (character_id, scene_type_id, status_id)
        VALUES ($1, $2, (SELECT id FROM scene_statuses WHERE name = 'approved'))
        RETURNING id
        "#,
        character_id, scene_type_id
    )
    .fetch_one(pool)
    .await?;

    // Create segment record pointing to existing file
    let segment_id = sqlx::query_scalar!(
        r#"
        INSERT INTO segments (scene_id, sequence_index, output_video_path, status_id)
        VALUES ($1, 1, $2, (SELECT id FROM segment_statuses WHERE name = 'approved'))
        RETURNING id
        "#,
        scene_id, video_path
    )
    .fetch_one(pool)
    .await?;

    Ok(RegisteredScene {
        scene_id,
        segment_id,
        scene_type: scene_type_name.to_string(),
        duration: tech_meta.duration,
        resolution: tech_meta.resolution,
    })
}

async fn extract_video_metadata(path: &str) -> Result<VideoTechMeta, ImportError> {
    // Use ffprobe or similar to extract duration, resolution, codec
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Creates character, scene, and segment records pointing to existing files
- [ ] Scenes marked as 'approved' (pre-approved, no re-generation)
- [ ] Technical metadata extracted automatically (duration, resolution, codec)
- [ ] Files not moved or copied — referenced in-place
- [ ] Scene type created if it doesn't exist

### Task 3.2: Image Registration Service
**File:** `src/legacy_import/image_registration.rs`

Register source and variant images with embedding and duplicate detection.

```rust
pub async fn register_legacy_image(
    pool: &PgPool,
    character_id: DbId,
    image_path: &str,
    image_type: &str,  // 'source', 'clothed', 'topless'
) -> Result<ImageRegistrationResult, ImportError> {
    match image_type {
        "source" => {
            // Create source_images record
            let image_id = create_source_image(pool, character_id, image_path).await?;

            // Trigger face embedding extraction (PRD-076)
            trigger_embedding_extraction(character_id, image_path).await?;

            // Run duplicate detection (PRD-079)
            // (handled asynchronously after embedding is ready)

            Ok(ImageRegistrationResult { image_id, image_type: image_type.to_string() })
        }
        "clothed" | "topless" => {
            // Create image variant record
            let variant_id = create_image_variant(pool, character_id, image_path, image_type).await?;
            Ok(ImageRegistrationResult { image_id: variant_id, image_type: image_type.to_string() })
        }
        _ => Err(ImportError::UnknownImageType(image_type.to_string())),
    }
}
```

**Acceptance Criteria:**
- [ ] Source images trigger face embedding extraction (PRD-076)
- [ ] Duplicate detection runs against existing and other imported characters (PRD-079)
- [ ] Variant images registered with correct type
- [ ] Files referenced in-place (not copied)

---

## Phase 4: CSV Metadata Import

### Task 4.1: CSV Column Mapper
**File:** `src/legacy_import/csv_import.rs`

Import character metadata from CSV with user-defined column mapping.

```rust
#[derive(Debug, Deserialize)]
pub struct ColumnMapping {
    pub csv_column: String,
    pub platform_field: String,
}

pub async fn import_metadata_csv(
    pool: &PgPool,
    csv_data: &[u8],
    column_mappings: &[ColumnMapping],
    project_id: DbId,
    match_key: &str,
) -> Result<CsvImportPreview, ImportError> {
    let mut reader = csv::Reader::from_reader(csv_data);
    let headers = reader.headers()?.clone();

    let mut preview = CsvImportPreview::default();

    for (index, result) in reader.records().enumerate() {
        let record = result?;
        let mut entity_data = serde_json::Map::new();

        for mapping in column_mappings {
            if let Some(col_idx) = headers.iter().position(|h| h == mapping.csv_column) {
                if let Some(value) = record.get(col_idx) {
                    entity_data.insert(mapping.platform_field.clone(), serde_json::Value::String(value.to_string()));
                }
            }
        }

        // Match to existing character
        let existing = match_character(pool, &entity_data, project_id, match_key).await?;

        // Validate via PRD-014
        let validation = validate_entity(pool, "character", &entity_data, Some(project_id)).await?;

        preview.entries.push(CsvImportEntry {
            row_index: index,
            data: entity_data,
            existing_id: existing,
            action: if existing.is_some() { "update" } else { "create" },
            validation_result: validation,
        });
    }

    Ok(preview)
}
```

**Acceptance Criteria:**
- [ ] Parses CSV with user-mapped columns
- [ ] Matches rows to existing characters by configurable key (name, ID)
- [ ] Validates via PRD-014 before committing
- [ ] Returns preview with diffs for updates
- [ ] Creates new characters for unmatched rows

---

## Phase 5: Gap Analysis

### Task 5.1: Gap Analysis Engine
**File:** `src/legacy_import/gap_analysis.rs`

Identify missing data after import.

```rust
#[derive(Debug, Serialize)]
pub struct GapReport {
    pub characters_missing_metadata: Vec<CharacterGap>,
    pub characters_missing_source_image: Vec<CharacterGap>,
    pub expected_scenes_missing: Vec<SceneGap>,
    pub total_gaps: usize,
    pub completeness_percentage: f64,
}

pub async fn analyze_gaps(
    pool: &PgPool,
    project_id: DbId,
) -> Result<GapReport, ImportError> {
    // Characters missing required metadata fields
    let missing_metadata = find_incomplete_metadata(pool, project_id).await?;

    // Characters without source images
    let missing_source = find_characters_without_source(pool, project_id).await?;

    // Expected scene types without videos
    let missing_scenes = find_missing_scenes(pool, project_id).await?;

    let total_gaps = missing_metadata.len() + missing_source.len() + missing_scenes.len();
    let total_entities = count_total_entities(pool, project_id).await?;
    let completeness = if total_entities > 0 {
        ((total_entities - total_gaps) as f64 / total_entities as f64) * 100.0
    } else {
        100.0
    };

    Ok(GapReport {
        characters_missing_metadata: missing_metadata,
        characters_missing_source_image: missing_source,
        expected_scenes_missing: missing_scenes,
        total_gaps,
        completeness_percentage: completeness,
    })
}
```

**Acceptance Criteria:**
- [ ] Identifies characters with missing required metadata fields
- [ ] Identifies characters without source images
- [ ] Identifies expected scene types without videos
- [ ] Checklist format for completing migration
- [ ] Re-runnable to verify progress
- [ ] Identifies 100% of missing data points (per success metric)

---

## Phase 6: Import Orchestrator

### Task 6.1: Legacy Import Orchestrator
**File:** `src/legacy_import/orchestrator.rs`

High-level orchestrator for the full import pipeline.

```rust
pub async fn run_legacy_import(
    pool: &PgPool,
    run_id: DbId,
) -> Result<ImportResult, ImportError> {
    let run = load_run(pool, run_id).await?;
    let mapping_rules: Vec<PathMappingRule> = serde_json::from_value(run.mapping_config)?;

    // Step 1: Scan folder
    update_run_status(pool, run_id, "scanning").await?;
    let entities = scan_legacy_folder(std::path::Path::new(&run.source_path), &mapping_rules).await?;

    // Step 2: Match existing
    update_run_status(pool, run_id, "mapping").await?;
    let matches = match_existing_entities(pool, &entities, run.project_id, &run.match_key).await?;

    // Step 3: Import entities
    update_run_status(pool, run_id, "importing").await?;
    let mut result = ImportResult::default();

    for m in &matches {
        match import_entity(pool, &m, run.project_id, run_id).await {
            Ok(action) => {
                match action.as_str() {
                    "created" => result.created += 1,
                    "updated" => result.updated += 1,
                    "skipped" => result.skipped += 1,
                    _ => {}
                }
            }
            Err(e) => {
                log_entity(pool, run_id, &m.entity, "failed", &e.to_string()).await?;
                result.errors += 1;
            }
        }
    }

    // Step 4: Gap analysis
    let gap_report = analyze_gaps(pool, run.project_id).await?;
    update_run_gap_report(pool, run_id, &gap_report).await?;

    // Step 5: Complete
    let status = if result.errors > 0 { "partial" } else { "completed" };
    update_run_status(pool, run_id, status).await?;

    Ok(result)
}
```

**Acceptance Criteria:**
- [ ] Full pipeline: scan -> match -> import -> gap analysis
- [ ] Status updates at each step
- [ ] Per-entity logging in entity_log table
- [ ] Gap report stored on run record
- [ ] Partial success allowed (some errors, rest succeeds)

---

## Phase 7: API Endpoints

### Task 7.1: Import Wizard Endpoints
**File:** `src/routes/legacy_import.rs`

**Acceptance Criteria:**
- [ ] `POST /api/admin/import/scan` scans folder and returns inferred structure
- [ ] `POST /api/admin/import/preview` generates full preview with matching
- [ ] `POST /api/admin/import/commit` executes the import
- [ ] `GET /api/admin/import/:id/report` returns run report with gap analysis
- [ ] `GET /api/admin/import/:id/gaps` returns gap report only
- [ ] `POST /api/admin/import/csv` imports metadata from CSV

### Task 7.2: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All legacy import endpoints registered

---

## Phase 8: Frontend — Migration Wizard

### Task 8.1: Wizard Step 1 — Source Selection
**File:** `frontend/src/components/legacy_import/SourceSelection.tsx`

**Acceptance Criteria:**
- [ ] Input for folder path on server
- [ ] Select target project
- [ ] Configure matching key (name, path, ID)
- [ ] Scan button triggers folder analysis

### Task 8.2: Wizard Step 2 — Mapping Configuration
**File:** `frontend/src/components/legacy_import/MappingConfig.tsx`

**Acceptance Criteria:**
- [ ] Shows default path-to-entity mapping rules
- [ ] Rules are editable (add, remove, reorder)
- [ ] Preview of inferred entities updates live
- [ ] Unmatched files highlighted for attention

### Task 8.3: Wizard Step 3 — Preview & Confirm
**File:** `frontend/src/components/legacy_import/ImportPreview.tsx`

**Acceptance Criteria:**
- [ ] Shows: characters to create, update, skip
- [ ] Videos to register as scenes
- [ ] Images to register
- [ ] Duplicates flagged
- [ ] Validation errors shown
- [ ] Commit or cancel buttons

### Task 8.4: Wizard Step 4 — Progress & Report
**File:** `frontend/src/components/legacy_import/ImportProgress.tsx`

**Acceptance Criteria:**
- [ ] Real-time progress during import
- [ ] Per-entity status updates
- [ ] Final report with counts and gap analysis
- [ ] Gap analysis items are clickable (navigate to entity)

### Task 8.5: CSV Import Dialog
**File:** `frontend/src/components/legacy_import/CsvImportDialog.tsx`

**Acceptance Criteria:**
- [ ] File upload for CSV
- [ ] Column mapping UI: drag CSV headers to platform fields
- [ ] Preview of mapped data
- [ ] Validation results per row

---

## Phase 9: Testing

### Task 9.1: Scanner Tests
**File:** `tests/legacy_import_scanner_tests.rs`

**Acceptance Criteria:**
- [ ] Default patterns match common folder structures
- [ ] Custom patterns work with named captures
- [ ] Unmatched files reported correctly

### Task 9.2: Registration Tests
**File:** `tests/legacy_import_registration_tests.rs`

**Acceptance Criteria:**
- [ ] Video registration creates approved scene and segment
- [ ] Image registration triggers embedding extraction
- [ ] Files referenced in-place (not copied)
- [ ] Incremental import updates existing, creates new

### Task 9.3: Gap Analysis Tests
**File:** `tests/legacy_import_gap_tests.rs`

**Acceptance Criteria:**
- [ ] Missing metadata detected
- [ ] Missing source images detected
- [ ] Missing expected scenes detected
- [ ] Completeness percentage accurate

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_legacy_import_runs.sql` | Run tracking table |
| `migrations/{timestamp}_create_legacy_import_entity_log.sql` | Per-entity log |
| `src/legacy_import/mod.rs` | Module root |
| `src/legacy_import/scanner.rs` | Folder scanner with path patterns |
| `src/legacy_import/matcher.rs` | Existing entity matcher |
| `src/legacy_import/video_registration.rs` | Video import as pre-approved scenes |
| `src/legacy_import/image_registration.rs` | Image import with embedding |
| `src/legacy_import/csv_import.rs` | CSV metadata import |
| `src/legacy_import/gap_analysis.rs` | Post-import gap analysis |
| `src/legacy_import/orchestrator.rs` | Full import pipeline |
| `src/routes/legacy_import.rs` | API endpoints |
| `frontend/src/components/legacy_import/*.tsx` | Migration wizard steps |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId`, migration framework
- PRD-001: Entity tables for creating records
- PRD-014: Validation service for import validation
- PRD-016: `folder_parser` for tree traversal
- PRD-076: Face embedding extraction (triggered for source images)
- PRD-079: Duplicate detection (triggered for source images)

### New Infrastructure Needed
- `ffprobe` or `ffmpeg` CLI for video metadata extraction
- `csv` crate for CSV parsing

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.2)
2. Phase 2: Folder Scanner & Matcher (Tasks 2.1-2.2)
3. Phase 3: Video & Image Registration (Tasks 3.1-3.2)
4. Phase 4: CSV Import (Task 4.1)
5. Phase 5: Gap Analysis (Task 5.1)
6. Phase 6: Orchestrator (Task 6.1)
7. Phase 7: API Endpoints (Tasks 7.1-7.2)

**MVP Success Criteria:**
- Folder inference maps >90% of common patterns
- CSV import validates all rows correctly
- Zero data loss during import
- Gap analysis identifies 100% of missing data

### Post-MVP Enhancements
1. Phase 8: Frontend Wizard (Tasks 8.1-8.5)
2. Phase 9: Testing (Tasks 9.1-9.3)

---

## Notes

1. **PRD-016 vs. PRD-086:** PRD-016 is for importing new content that will go through the generation pipeline. PRD-086 is for importing completed legacy work that bypasses generation. They share the folder parser but differ in entity creation (PRD-086 creates pre-approved entities).
2. **Video metadata extraction:** Consider using `ffprobe` as a subprocess for video metadata. It provides duration, resolution, codec, bitrate, and frame count.
3. **Large imports:** For studios with thousands of files, the import should be chunked and progress-tracked. Consider background job processing with status polling.
4. **Incremental safety:** Incremental imports should never silently overwrite data. When a match is found and the existing data differs from the import, the user should see a diff and choose.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

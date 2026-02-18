# Task List: Folder-to-Entity Bulk Importer

**PRD Reference:** `design/prds/016-prd-folder-to-entity-bulk-importer.md`
**Scope:** Build a drag-and-drop folder import system that maps folder structures to platform entities (characters, images, metadata), validates via PRD-014, previews the mapping for user confirmation, and commits the import with a full report.

## Overview

This PRD creates an import pipeline that accepts a folder structure (via upload or server path), parses the tree to derive entity names and types from folder/file paths, validates everything through PRD-014, presents a preview for user review and conflict resolution, and then persists the entities and files. The folder-to-entity mapper is configurable, supporting the default convention (top folder = character name, subfolders = categories, file extensions = types) with overridable rules.

### What Already Exists
- PRD-000: Database conventions, migration framework
- PRD-001: Entity tables (characters, source_images, derived_images, image_variants)
- PRD-014: Validation engine, import preview, conflict detection, reports

### What We're Building
1. Folder tree parser that reads a directory structure and produces a file manifest
2. Path-to-entity mapper that derives entity names and types from folder paths
3. Path uniqueness detector to prevent accidental merging
4. Import orchestrator that feeds mapped entities through PRD-014 validation
5. File ingestion service that copies/moves files into the platform storage
6. Frontend drag-and-drop import UI with tree preview and progress tracking

### Key Design Decisions
1. **Reuse PRD-014 entirely** — The import orchestrator transforms folder data into entity records, then delegates all validation, preview, conflict detection, and reporting to PRD-014. No duplicate validation logic.
2. **Server-side processing** — Files are uploaded to a staging area first, then the server parses the folder structure. This avoids browser memory limits for large imports.
3. **Two-phase import** — Phase 1: upload + parse + preview. Phase 2: user confirms + commit. The preview step is mandatory.
4. **No new entity tables** — This PRD creates records in existing PRD-001 tables. The only new tables are for import session tracking and mapping configuration.

---

## Phase 1: Database Schema

### Task 1.1: Import Sessions Table
**File:** `migrations/{timestamp}_create_import_sessions.sql`

Track in-progress and completed import sessions.

```sql
CREATE TABLE import_session_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON import_session_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO import_session_statuses (name, description) VALUES
    ('uploading', 'Files are being uploaded to staging'),
    ('parsing', 'Folder structure is being analyzed'),
    ('preview', 'Preview ready for user review'),
    ('committing', 'Import is being committed'),
    ('committed', 'Import completed successfully'),
    ('partial', 'Import committed with some skipped records'),
    ('cancelled', 'Import cancelled by user'),
    ('failed', 'Import failed with errors');

CREATE TABLE import_sessions (
    id BIGSERIAL PRIMARY KEY,
    status_id BIGINT NOT NULL REFERENCES import_session_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    project_id BIGINT NOT NULL,
    staging_path TEXT NOT NULL,           -- server-side staging directory
    source_name TEXT NOT NULL,            -- original folder/archive name
    total_files INTEGER NOT NULL DEFAULT 0,
    total_size_bytes BIGINT NOT NULL DEFAULT 0,
    mapped_entities INTEGER NOT NULL DEFAULT 0,
    validation_report_id BIGINT NULL,     -- FK to import_reports (PRD-014) when available
    created_by BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_sessions_status_id ON import_sessions(status_id);
CREATE INDEX idx_import_sessions_project_id ON import_sessions(project_id);
CREATE INDEX idx_import_sessions_created_at ON import_sessions(created_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON import_sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Session statuses track the full import lifecycle
- [ ] Session links to project and staging directory
- [ ] `validation_report_id` links to PRD-014 import report
- [ ] All FK columns indexed
- [ ] Migration applies cleanly

### Task 1.2: Import Mapping Entries Table
**File:** `migrations/{timestamp}_create_import_mapping_entries.sql`

Store the parsed folder-to-entity mapping for preview and commit.

```sql
CREATE TABLE import_mapping_entries (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    source_path TEXT NOT NULL,            -- relative path within staging
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    file_extension TEXT NOT NULL,
    derived_entity_type TEXT NOT NULL,    -- 'character', 'source_image', 'derived_image', 'metadata', etc.
    derived_entity_name TEXT NOT NULL,    -- extracted name from path
    derived_category TEXT,               -- subcategory from subfolder
    target_entity_id BIGINT NULL,         -- set if mapping to existing entity (update)
    action TEXT NOT NULL DEFAULT 'create', -- 'create', 'update', 'skip', 'conflict'
    conflict_details JSONB NULL,
    validation_errors JSONB NOT NULL DEFAULT '[]',
    validation_warnings JSONB NOT NULL DEFAULT '[]',
    is_selected BOOLEAN NOT NULL DEFAULT true, -- user can deselect in preview
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_mapping_entries_session_id ON import_mapping_entries(session_id);
CREATE INDEX idx_import_mapping_entries_entity_type ON import_mapping_entries(derived_entity_type);
CREATE INDEX idx_import_mapping_entries_entity_name ON import_mapping_entries(derived_entity_name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON import_mapping_entries
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Entries link to an import session
- [ ] Each entry captures: source path, derived entity type/name/category
- [ ] `target_entity_id` set when matching an existing entity (update vs. create)
- [ ] `action` classifies the entry: create, update, skip, or conflict
- [ ] `is_selected` allows user to deselect entries in preview
- [ ] Migration applies cleanly

---

## Phase 2: Folder Parser & Mapper

### Task 2.1: Folder Tree Parser
**File:** `src/import/folder_parser.rs`

Parse a directory tree into a flat file manifest.

```rust
use std::path::{Path, PathBuf};

#[derive(Debug)]
pub struct ParsedFile {
    pub relative_path: String,
    pub file_name: String,
    pub file_extension: String,
    pub file_size_bytes: u64,
    pub depth: usize,
    pub parent_folders: Vec<String>,
}

pub async fn parse_folder_tree(
    root: &Path,
) -> Result<Vec<ParsedFile>, ImportError> {
    let mut files = Vec::new();
    let mut entries = tokio::fs::read_dir(root).await?;

    // Recursive traversal
    parse_recursive(root, root, &mut files, 0).await?;

    Ok(files)
}

async fn parse_recursive(
    root: &Path,
    current: &Path,
    files: &mut Vec<ParsedFile>,
    depth: usize,
) -> Result<(), ImportError> {
    let mut entries = tokio::fs::read_dir(current).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.is_dir() {
            parse_recursive(root, &path, files, depth + 1).await?;
        } else {
            let relative = path.strip_prefix(root).unwrap();
            let parent_folders: Vec<String> = relative
                .parent()
                .map(|p| p.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect())
                .unwrap_or_default();

            files.push(ParsedFile {
                relative_path: relative.to_string_lossy().to_string(),
                file_name: path.file_name().unwrap().to_string_lossy().to_string(),
                file_extension: path.extension().unwrap_or_default().to_string_lossy().to_string(),
                file_size_bytes: entry.metadata().await?.len(),
                depth,
                parent_folders,
            });
        }
    }
    Ok(())
}
```

**Acceptance Criteria:**
- [ ] Recursively traverses the folder tree
- [ ] Records relative path, filename, extension, size for each file
- [ ] Tracks parent folder hierarchy for entity derivation
- [ ] Skips hidden files (`.` prefix) and system files
- [ ] Handles deeply nested structures (configurable max depth)

### Task 2.2: Path-to-Entity Mapper
**File:** `src/import/entity_mapper.rs`

Map parsed files to platform entity types and names using folder path conventions.

```rust
#[derive(Debug, Clone)]
pub struct MappingRule {
    pub depth: usize,           // 0 = top-level folder, 1 = subfolder, etc.
    pub entity_type: String,    // what this level maps to
    pub name_source: NameSource,
}

#[derive(Debug, Clone)]
pub enum NameSource {
    FolderName,
    FileName,
    Custom(String),
}

/// Default mapping: top folder = character, subfolder = category, files = assets
pub fn default_mapping_rules() -> Vec<MappingRule> {
    vec![
        MappingRule { depth: 0, entity_type: "character".to_string(), name_source: NameSource::FolderName },
        MappingRule { depth: 1, entity_type: "category".to_string(), name_source: NameSource::FolderName },
    ]
}

pub fn map_files_to_entities(
    files: &[ParsedFile],
    rules: &[MappingRule],
) -> Vec<MappedEntity> {
    files.iter().map(|file| {
        let entity_name = file.parent_folders.first().cloned().unwrap_or_default();
        let category = file.parent_folders.get(1).cloned();
        let entity_type = derive_entity_type(&file.file_extension);

        MappedEntity {
            source_path: file.relative_path.clone(),
            file_name: file.file_name.clone(),
            file_size_bytes: file.file_size_bytes,
            entity_type,
            entity_name,
            category,
        }
    }).collect()
}

fn derive_entity_type(extension: &str) -> String {
    match extension.to_lowercase().as_str() {
        "png" | "jpg" | "jpeg" | "webp" => "image".to_string(),
        "json" => "metadata".to_string(),
        "mp4" | "mov" | "webm" => "video".to_string(),
        _ => "unknown".to_string(),
    }
}
```

**Acceptance Criteria:**
- [ ] Top-level folders derive character names
- [ ] Subfolders derive categories (images, metadata, etc.)
- [ ] File extensions determine entity type (image, metadata, video)
- [ ] Mapping rules are configurable per import
- [ ] Unknown file types are flagged for user review

### Task 2.3: Path Uniqueness Detector
**File:** `src/import/uniqueness.rs`

Detect when different folder paths would create entities with the same name.

```rust
pub struct UniquenessConflict {
    pub entity_name: String,
    pub paths: Vec<String>,
    pub suggested_action: UniquenessAction,
}

pub enum UniquenessAction {
    Merge,
    RenameWithPath,
    Skip,
}

pub fn detect_uniqueness_conflicts(
    mapped_entities: &[MappedEntity],
) -> Vec<UniquenessConflict> {
    let mut name_to_paths: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    for entity in mapped_entities {
        name_to_paths
            .entry(entity.entity_name.clone())
            .or_default()
            .push(entity.source_path.clone());
    }

    name_to_paths.into_iter()
        .filter(|(_, paths)| paths.len() > 1)
        .map(|(name, paths)| UniquenessConflict {
            entity_name: name,
            paths,
            suggested_action: UniquenessAction::RenameWithPath,
        })
        .collect()
}
```

**Acceptance Criteria:**
- [ ] Detects when multiple paths would create entities with the same name
- [ ] Reports all conflicting paths per entity name
- [ ] Suggests resolution: merge, rename with path prefix, or skip
- [ ] Uniqueness check uses full path, not just final folder name
- [ ] Zero false negatives (all potential merges detected)

---

## Phase 3: Import Orchestrator

### Task 3.1: Import Session Manager
**File:** `src/import/session.rs`

Manage the lifecycle of an import session.

```rust
pub async fn create_import_session(
    pool: &PgPool,
    project_id: DbId,
    staging_path: &str,
    source_name: &str,
    created_by: Option<DbId>,
) -> Result<DbId, ImportError> {
    let id = sqlx::query_scalar!(
        r#"
        INSERT INTO import_sessions (status_id, project_id, staging_path, source_name, created_by)
        VALUES ((SELECT id FROM import_session_statuses WHERE name = 'uploading'), $1, $2, $3, $4)
        RETURNING id
        "#,
        project_id, staging_path, source_name, created_by
    )
    .fetch_one(pool)
    .await?;
    Ok(id)
}

pub async fn update_session_status(
    pool: &PgPool,
    session_id: DbId,
    status: &str,
) -> Result<(), ImportError> {
    sqlx::query!(
        r#"
        UPDATE import_sessions
        SET status_id = (SELECT id FROM import_session_statuses WHERE name = $2)
        WHERE id = $1
        "#,
        session_id, status
    )
    .execute(pool)
    .await?;
    Ok(())
}
```

**Acceptance Criteria:**
- [ ] Creates session in 'uploading' status
- [ ] Status transitions: uploading -> parsing -> preview -> committing -> committed
- [ ] Session tracks total files, size, mapped entities
- [ ] Session links to project and creating user

### Task 3.2: Import Preview Generator
**File:** `src/import/preview.rs`

Parse folder, map entities, detect conflicts, validate via PRD-014, and produce a preview.

```rust
pub async fn generate_import_preview(
    pool: &PgPool,
    session_id: DbId,
) -> Result<FolderImportPreview, ImportError> {
    let session = load_session(pool, session_id).await?;
    let staging_path = std::path::Path::new(&session.staging_path);

    // Step 1: Parse folder tree
    let files = folder_parser::parse_folder_tree(staging_path).await?;

    // Step 2: Map to entities
    let mapped = entity_mapper::map_files_to_entities(&files, &default_mapping_rules());

    // Step 3: Detect uniqueness conflicts
    let conflicts = uniqueness::detect_uniqueness_conflicts(&mapped);

    // Step 4: Check against existing entities in DB
    let existing_matches = find_existing_entities(pool, &mapped, session.project_id).await?;

    // Step 5: Validate via PRD-014
    let validation_service = ValidationService::new(pool.clone());
    // Convert mapped entities to validation records and validate

    // Step 6: Store mapping entries
    store_mapping_entries(pool, session_id, &mapped, &existing_matches, &conflicts).await?;

    // Step 7: Update session status to 'preview'
    update_session_status(pool, session_id, "preview").await?;

    Ok(FolderImportPreview {
        session_id,
        total_files: files.len(),
        total_size_bytes: files.iter().map(|f| f.file_size_bytes).sum(),
        entities_to_create: mapped.iter().filter(|m| !existing_matches.contains_key(&m.entity_name)).count(),
        entities_to_update: existing_matches.len(),
        uniqueness_conflicts: conflicts,
        // ... validation results
    })
}
```

**Acceptance Criteria:**
- [ ] Full pipeline: parse -> map -> uniqueness -> existing check -> validate -> preview
- [ ] Mapping entries stored in DB for preview display and commit
- [ ] Uniqueness conflicts surfaced with resolution options
- [ ] PRD-014 validation errors and warnings included
- [ ] Session status updated to 'preview' when ready

### Task 3.3: Import Committer
**File:** `src/import/commit.rs`

Commit the import: create/update entities and ingest files.

```rust
pub async fn commit_import(
    pool: &PgPool,
    session_id: DbId,
    user_selections: &ImportSelections,
) -> Result<ImportCommitResult, ImportError> {
    let session = load_session(pool, session_id).await?;
    let entries = load_selected_entries(pool, session_id).await?;

    // Begin transaction
    let mut tx = pool.begin().await?;

    let mut result = ImportCommitResult::default();

    for entry in &entries {
        if !entry.is_selected { continue; }

        match entry.action.as_str() {
            "create" => {
                let entity_id = create_entity(&mut tx, &session, entry).await?;
                ingest_file(&session.staging_path, entry, entity_id).await?;
                result.created += 1;
            }
            "update" => {
                update_entity(&mut tx, entry).await?;
                ingest_file(&session.staging_path, entry, entry.target_entity_id.unwrap()).await?;
                result.updated += 1;
            }
            "skip" => { result.skipped += 1; }
            _ => {}
        }
    }

    tx.commit().await?;
    update_session_status(pool, session_id, "committed").await?;

    Ok(result)
}
```

**Acceptance Criteria:**
- [ ] Only processes selected entries (user can deselect in preview)
- [ ] Creates new entities and ingests files for 'create' actions
- [ ] Updates existing entities and replaces files for 'update' actions
- [ ] All DB operations in a single transaction (atomic commit)
- [ ] Generates PRD-014 import report
- [ ] Updates session status to 'committed'

### Task 3.4: File Ingestion Service
**File:** `src/import/file_ingestion.rs`

Move files from staging to permanent storage with proper naming.

```rust
pub async fn ingest_file(
    staging_base: &str,
    entry: &ImportMappingEntry,
    entity_id: DbId,
) -> Result<String, ImportError> {
    let source = std::path::Path::new(staging_base).join(&entry.source_path);
    let dest_dir = compute_destination_dir(entry.derived_entity_type.as_str(), entity_id);
    tokio::fs::create_dir_all(&dest_dir).await?;

    let dest = dest_dir.join(&entry.file_name);
    tokio::fs::copy(&source, &dest).await?;

    Ok(dest.to_string_lossy().to_string())
}
```

**Acceptance Criteria:**
- [ ] Copies files from staging to permanent storage
- [ ] Destination path follows platform conventions
- [ ] Creates destination directories as needed
- [ ] Records the permanent file path on the entity record
- [ ] Handles filename collisions (append suffix if needed)

---

## Phase 4: API Endpoints

### Task 4.1: Folder Upload Endpoint
**File:** `src/routes/import.rs`

Accept folder upload (multipart) or server-side path reference.

```rust
pub async fn upload_folder(
    State(pool): State<PgPool>,
    multipart: axum::extract::Multipart,
    Query(params): Query<UploadParams>,
) -> Result<impl IntoResponse, AppError> {
    // Create staging directory
    let staging_dir = create_staging_dir().await?;

    // Save uploaded files to staging
    save_multipart_to_staging(multipart, &staging_dir).await?;

    // Create import session
    let session_id = create_import_session(
        &pool, params.project_id, &staging_dir.to_string_lossy(),
        &params.source_name, None,
    ).await?;

    Ok(Json(serde_json::json!({
        "session_id": session_id,
        "staging_path": staging_dir.to_string_lossy(),
    })))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/import/folder` accepts multipart upload
- [ ] Creates a staging directory for the upload
- [ ] Preserves folder structure in staging
- [ ] Returns session_id for subsequent preview/commit calls
- [ ] Supports both multipart upload and server path reference

### Task 4.2: Import Preview Endpoint
**File:** `src/routes/import.rs`

```rust
pub async fn preview_import(
    State(pool): State<PgPool>,
    Path(session_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    let preview = crate::import::preview::generate_import_preview(&pool, session_id).await?;
    Ok(Json(preview))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/import/:id/preview` returns the import preview
- [ ] Includes entity mapping, uniqueness conflicts, validation results
- [ ] Returns 404 if session not found
- [ ] Returns error if session is not in a previewable state

### Task 4.3: Import Commit Endpoint
**File:** `src/routes/import.rs`

```rust
pub async fn commit_import(
    State(pool): State<PgPool>,
    Path(session_id): Path<DbId>,
    Json(body): Json<CommitRequest>,
) -> Result<impl IntoResponse, AppError> {
    let result = crate::import::commit::commit_import(&pool, session_id, &body.selections).await?;
    Ok(Json(result))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/import/:id/commit` commits the import
- [ ] Accepts user selections (which entries to include, conflict resolutions)
- [ ] Returns commit result with counts
- [ ] Only works if session is in 'preview' status

### Task 4.4: Import Cancel Endpoint
**File:** `src/routes/import.rs`

**Acceptance Criteria:**
- [ ] `POST /api/import/:id/cancel` cancels the import
- [ ] Cleans up staging directory
- [ ] Updates session status to 'cancelled'

### Task 4.5: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All import endpoints registered
- [ ] Routes use correct HTTP methods

---

## Phase 5: Frontend — Import UI

### Task 5.1: Drag-and-Drop Upload Zone
**File:** `frontend/src/components/import/FolderDropZone.tsx`

Prominent drag-and-drop area for folder import.

```typescript
import React, { useCallback } from 'react';

interface FolderDropZoneProps {
  projectId: number;
  onUploadComplete: (sessionId: number) => void;
}

export const FolderDropZone: React.FC<FolderDropZoneProps> = ({
  projectId,
  onUploadComplete,
}) => {
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const items = e.dataTransfer.items;
    // Use webkitGetAsEntry for folder support
    const formData = new FormData();
    // Recursively read folder entries and append to FormData
    // Preserve relative paths

    const response = await fetch(`/api/import/folder?project_id=${projectId}&source_name=upload`, {
      method: 'POST',
      body: formData,
    });
    const { session_id } = await response.json();
    onUploadComplete(session_id);
  }, [projectId, onUploadComplete]);

  return (
    <div
      className="folder-drop-zone"
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      <p>Drag a folder here to import characters</p>
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] Drop zone accepts folder drag-and-drop
- [ ] Folder structure preserved during upload
- [ ] Upload progress indicator
- [ ] Calls onUploadComplete with session ID when done

### Task 5.2: Import Preview Tree View
**File:** `frontend/src/components/import/ImportPreviewTree.tsx`

Tree view showing folder structure with entity mapping annotations.

```typescript
interface ImportPreviewTreeProps {
  sessionId: number;
  preview: FolderImportPreview;
  onSelectionChange: (entries: ImportMappingEntry[]) => void;
}

export const ImportPreviewTree: React.FC<ImportPreviewTreeProps> = ({
  sessionId,
  preview,
  onSelectionChange,
}) => {
  // Render tree with:
  // - Folder nodes annotated with entity type/name
  // - File nodes with validation status
  // - Checkboxes for selection
  // - Color coding: green=create, blue=update, yellow=conflict, red=invalid
};
```

**Acceptance Criteria:**
- [ ] Tree view mirrors original folder structure
- [ ] Each node annotated with derived entity type and name
- [ ] Color coding: green (create), blue (update), yellow (conflict), red (invalid)
- [ ] Checkboxes to select/deselect entries
- [ ] Validation errors shown inline per file

### Task 5.3: Uniqueness Conflict Resolver
**File:** `frontend/src/components/import/UniquenessResolver.tsx`

UI for resolving path uniqueness conflicts.

**Acceptance Criteria:**
- [ ] Shows conflicting paths side by side
- [ ] Options: merge, rename with path prefix, skip
- [ ] Batch resolution for similar conflicts
- [ ] All conflicts must be resolved before commit

### Task 5.4: Import Progress Tracker
**File:** `frontend/src/components/import/ImportProgress.tsx`

Real-time progress during import commit.

**Acceptance Criteria:**
- [ ] Shows per-file progress during commit
- [ ] Overall progress bar
- [ ] File-level status: processing, created, updated, skipped, failed
- [ ] Final summary when complete

---

## Phase 6: Testing

### Task 6.1: Folder Parser Tests
**File:** `tests/import_folder_parser_tests.rs`

**Acceptance Criteria:**
- [ ] Parses a simple 2-level folder correctly
- [ ] Parses deeply nested folders
- [ ] Skips hidden files and system files
- [ ] Records correct file sizes and extensions
- [ ] Handles empty folders

### Task 6.2: Entity Mapper Tests
**File:** `tests/import_mapper_tests.rs`

**Acceptance Criteria:**
- [ ] Top folders map to character names
- [ ] Image files mapped to 'image' entity type
- [ ] JSON files mapped to 'metadata' entity type
- [ ] Video files mapped to 'video' entity type
- [ ] Unknown extensions flagged

### Task 6.3: Uniqueness Tests
**File:** `tests/import_uniqueness_tests.rs`

**Acceptance Criteria:**
- [ ] Detects duplicate character names from different paths
- [ ] No false positives for legitimately different entities
- [ ] Suggests appropriate resolution

### Task 6.4: Integration Tests
**File:** `tests/import_integration_tests.rs`

**Acceptance Criteria:**
- [ ] Full cycle: upload -> preview -> commit with test folder structure
- [ ] Entities created correctly in database
- [ ] Files copied to permanent storage
- [ ] Import report generated via PRD-014
- [ ] Cancelled imports clean up staging

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_import_sessions.sql` | Import session tracking |
| `migrations/{timestamp}_create_import_mapping_entries.sql` | Per-file mapping entries |
| `src/import/mod.rs` | Module root |
| `src/import/folder_parser.rs` | Folder tree parser |
| `src/import/entity_mapper.rs` | Path-to-entity mapper |
| `src/import/uniqueness.rs` | Path uniqueness detection |
| `src/import/session.rs` | Import session lifecycle |
| `src/import/preview.rs` | Import preview generator |
| `src/import/commit.rs` | Import commit executor |
| `src/import/file_ingestion.rs` | File copy to permanent storage |
| `src/routes/import.rs` | API endpoints |
| `frontend/src/components/import/FolderDropZone.tsx` | Drag-and-drop upload |
| `frontend/src/components/import/ImportPreviewTree.tsx` | Tree preview view |
| `frontend/src/components/import/UniquenessResolver.tsx` | Conflict resolution |
| `frontend/src/components/import/ImportProgress.tsx` | Progress tracker |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId`, migration framework, `trigger_set_updated_at()`
- PRD-001: Entity tables for creating characters, images, etc.
- PRD-014: `ValidationService`, `ImportPreview`, conflict detection, report generation

### New Infrastructure Needed
- Staging directory for uploaded files (configurable path, e.g., `/tmp/trulience/staging/`)
- `tokio::fs` for async filesystem operations
- `axum::extract::Multipart` for file upload handling

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.2)
2. Phase 2: Folder Parser & Mapper (Tasks 2.1-2.3)
3. Phase 3: Import Orchestrator (Tasks 3.1-3.4)
4. Phase 4: API Endpoints (Tasks 4.1-4.5)

**MVP Success Criteria:**
- 100-file import completes in <30 seconds
- Path uniqueness detects all merge conflicts
- All imports pass through PRD-014 validation
- Preview accurately shows what will be created/updated

### Post-MVP Enhancements
1. Phase 5: Frontend UI (Tasks 5.1-5.4)
2. Phase 6: Testing (Tasks 6.1-6.4)
3. Custom path mapping rules (PRD Phase 2)

---

## Notes

1. **Large imports:** For folders with thousands of files, the preview generation should be paginated and the commit should use batch inserts rather than row-by-row.
2. **Staging cleanup:** A background job should clean up staging directories for cancelled or expired sessions (e.g., sessions older than 24 hours in 'uploading' or 'preview' state).
3. **Archive support:** A future enhancement could accept ZIP/TAR archives in addition to folder uploads, extracting to staging before processing.
4. **Special characters:** Folder names with special characters should be sanitized for entity names while preserving the original name for reference.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

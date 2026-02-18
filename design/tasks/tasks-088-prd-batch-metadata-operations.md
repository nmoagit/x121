# Task List: Batch Metadata Operations

**PRD Reference:** `design/prds/088-prd-batch-metadata-operations.md`
**Scope:** Extend PRD-066 (Character Metadata Editor) with multi-character batch operations: multi-select edit, search-and-replace with regex and preview, CSV export/re-import round-trip, field operations (clear, set default, copy, concatenate), and atomic undo integrated with PRD-051. All batch operations are logged via PRD-045.

## Overview

PRD-066 handles single-character metadata editing. This PRD makes metadata maintenance O(1) instead of O(N) for common bulk operations across dozens or hundreds of characters. Every batch operation is wrapped in a PostgreSQL transaction, captures before/after state for atomic undo, and emits an audit log entry.

### What Already Exists
- PRD-000: Database conventions, migration framework, `DbId` type
- PRD-001: Entity tables (projects, characters with JSONB metadata)
- PRD-014: Validation service for metadata validation
- PRD-045: Audit logging infrastructure
- PRD-051: Undo/redo architecture
- PRD-060: Character library (selection context)
- PRD-066: Metadata editor API, form view, spreadsheet view

### What We're Building
1. Batch operation tracking table with JSONB undo snapshots
2. Multi-select edit engine (set a field across N characters)
3. Search-and-replace engine with regex support and preview
4. CSV export/re-import round-trip with diff preview
5. Field operations (clear, set default, copy from field, concatenate)
6. Atomic undo integration with PRD-051
7. Audit trail integration with PRD-045
8. Frontend batch toolbar and dialogs

### Key Design Decisions
1. **JSONB snapshots for undo** — Each batch operation stores the complete before-state of all affected fields as a JSONB snapshot. This avoids a separate undo stack table and makes reversal a simple overwrite from the snapshot.
2. **Preview before apply** — All batch operations generate a preview (dry run) showing which characters will be affected and what the changes look like. The user must confirm before execution.
3. **Single transaction per batch** — The entire batch (even 100+ characters) is applied in a single PostgreSQL transaction. If any row fails validation, the whole batch rolls back.
4. **Reuse PRD-066 endpoints** — The existing metadata read/write APIs from PRD-066 are reused for individual character updates within the batch. The batch engine orchestrates multiple calls within a transaction.

---

## Phase 1: Database Schema

### Task 1.1: Batch Operations Table
**File:** `migrations/{timestamp}_create_batch_metadata_operations.sql`

Track batch metadata operations for undo and audit.

```sql
CREATE TABLE batch_metadata_op_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON batch_metadata_op_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO batch_metadata_op_statuses (name, description) VALUES
    ('preview', 'Preview generated, awaiting confirmation'),
    ('applying', 'Batch operation in progress'),
    ('completed', 'Batch operation applied successfully'),
    ('undone', 'Batch operation has been undone'),
    ('failed', 'Batch operation failed');

CREATE TABLE batch_metadata_operations (
    id BIGSERIAL PRIMARY KEY,
    status_id BIGINT NOT NULL REFERENCES batch_metadata_op_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    operation_type TEXT NOT NULL,       -- 'multi_select_edit', 'search_replace', 'csv_import', 'field_operation'
    project_id BIGINT NOT NULL,
    character_ids BIGINT[] NOT NULL,    -- affected character IDs
    character_count INTEGER NOT NULL DEFAULT 0,
    parameters JSONB NOT NULL DEFAULT '{}',   -- operation-specific config
    before_snapshot JSONB NOT NULL DEFAULT '{}',  -- full before-state for undo
    after_snapshot JSONB NOT NULL DEFAULT '{}',   -- computed result for preview
    summary TEXT NOT NULL DEFAULT '',   -- human-readable: "Set agency to 'XYZ' for 42 characters"
    initiated_by BIGINT NULL,
    applied_at TIMESTAMPTZ NULL,
    undone_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_batch_metadata_operations_status_id ON batch_metadata_operations(status_id);
CREATE INDEX idx_batch_metadata_operations_project_id ON batch_metadata_operations(project_id);
CREATE INDEX idx_batch_metadata_operations_operation_type ON batch_metadata_operations(operation_type);
CREATE INDEX idx_batch_metadata_operations_created_at ON batch_metadata_operations(created_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON batch_metadata_operations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Status lookup table with full lifecycle
- [ ] `operation_type` distinguishes between batch operation types
- [ ] `character_ids` array stores all affected character IDs
- [ ] `before_snapshot` captures full pre-operation state for undo
- [ ] `after_snapshot` captures computed result for preview
- [ ] `parameters` stores operation-specific configuration
- [ ] FK indexes on all foreign keys
- [ ] Migration applies cleanly

---

## Phase 2: Batch Engine Core

### Task 2.1: Snapshot Capture Service
**File:** `src/batch_metadata/snapshot.rs`

Capture and restore character metadata snapshots for undo.

```rust
use crate::types::DbId;
use sqlx::PgPool;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

/// Per-character metadata snapshot: character_id -> { field_name -> old_value }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataSnapshot {
    pub characters: HashMap<DbId, serde_json::Value>,
}

/// Capture the current metadata state for a set of characters.
pub async fn capture_snapshot(
    pool: &PgPool,
    character_ids: &[DbId],
) -> Result<MetadataSnapshot, BatchError> {
    let mut characters = HashMap::new();

    let rows = sqlx::query!(
        r#"
        SELECT id, metadata
        FROM characters
        WHERE id = ANY($1)
        "#,
        character_ids
    )
    .fetch_all(pool)
    .await?;

    for row in rows {
        characters.insert(row.id, row.metadata.unwrap_or(serde_json::Value::Null));
    }

    Ok(MetadataSnapshot { characters })
}

/// Restore character metadata from a snapshot (undo).
pub async fn restore_snapshot(
    pool: &PgPool,
    snapshot: &MetadataSnapshot,
) -> Result<usize, BatchError> {
    let mut restored = 0;

    for (character_id, metadata) in &snapshot.characters {
        sqlx::query!(
            r#"
            UPDATE characters SET metadata = $1 WHERE id = $2
            "#,
            metadata,
            character_id
        )
        .execute(pool)
        .await?;
        restored += 1;
    }

    Ok(restored)
}
```

**Acceptance Criteria:**
- [ ] Captures full JSONB metadata for each affected character
- [ ] Restores metadata exactly from snapshot (undo)
- [ ] Handles characters with NULL metadata gracefully
- [ ] Works with any number of characters

### Task 2.2: Multi-Select Edit Engine
**File:** `src/batch_metadata/multi_select_edit.rs`

Set a field to a given value across multiple characters.

```rust
use crate::types::DbId;
use crate::batch_metadata::snapshot::{capture_snapshot, MetadataSnapshot};

#[derive(Debug, Clone, Deserialize)]
pub struct MultiSelectEditParams {
    pub field_name: String,
    pub new_value: serde_json::Value,
    pub character_ids: Vec<DbId>,
    pub project_id: DbId,
}

#[derive(Debug, Serialize)]
pub struct MultiSelectPreview {
    pub affected_count: usize,
    pub changes: Vec<CharacterChange>,
}

#[derive(Debug, Serialize)]
pub struct CharacterChange {
    pub character_id: DbId,
    pub character_name: String,
    pub old_value: serde_json::Value,
    pub new_value: serde_json::Value,
}

/// Generate a preview of the multi-select edit without applying.
pub async fn preview_multi_select_edit(
    pool: &PgPool,
    params: &MultiSelectEditParams,
) -> Result<MultiSelectPreview, BatchError> {
    let snapshot = capture_snapshot(pool, &params.character_ids).await?;
    let mut changes = Vec::new();

    for (character_id, metadata) in &snapshot.characters {
        let old_value = metadata
            .get(&params.field_name)
            .cloned()
            .unwrap_or(serde_json::Value::Null);

        let name = fetch_character_name(pool, *character_id).await?;

        changes.push(CharacterChange {
            character_id: *character_id,
            character_name: name,
            old_value,
            new_value: params.new_value.clone(),
        });
    }

    Ok(MultiSelectPreview {
        affected_count: changes.len(),
        changes,
    })
}

/// Apply the multi-select edit within a transaction.
pub async fn apply_multi_select_edit(
    pool: &PgPool,
    params: &MultiSelectEditParams,
    initiated_by: Option<DbId>,
) -> Result<DbId, BatchError> {
    let before_snapshot = capture_snapshot(pool, &params.character_ids).await?;

    let mut tx = pool.begin().await?;

    for character_id in &params.character_ids {
        sqlx::query!(
            r#"
            UPDATE characters
            SET metadata = jsonb_set(
                COALESCE(metadata, '{}'),
                $1::text[],
                $2
            )
            WHERE id = $3
            "#,
            &[&params.field_name] as &[&str],
            &params.new_value,
            character_id
        )
        .execute(&mut *tx)
        .await?;
    }

    // Record the batch operation
    let op_id = sqlx::query_scalar!(
        r#"
        INSERT INTO batch_metadata_operations
            (status_id, operation_type, project_id, character_ids, character_count,
             parameters, before_snapshot, summary, initiated_by, applied_at)
        VALUES (
            (SELECT id FROM batch_metadata_op_statuses WHERE name = 'completed'),
            'multi_select_edit', $1, $2, $3, $4, $5, $6, $7, NOW()
        )
        RETURNING id
        "#,
        params.project_id,
        &params.character_ids,
        params.character_ids.len() as i32,
        serde_json::to_value(params)?,
        serde_json::to_value(&before_snapshot)?,
        format!("Set {} to '{}' for {} characters",
            params.field_name,
            params.new_value,
            params.character_ids.len()
        ),
        initiated_by
    )
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(op_id)
}
```

**Acceptance Criteria:**
- [ ] Preview shows each character's old value vs. new value
- [ ] Apply runs in a single transaction
- [ ] Before-snapshot captured before any changes
- [ ] Operation recorded with full undo data
- [ ] Works with nested JSONB paths (e.g., `hair_color` within metadata)

### Task 2.3: Search & Replace Engine
**File:** `src/batch_metadata/search_replace.rs`

Find and replace values across metadata fields with regex support.

```rust
use regex::Regex;

#[derive(Debug, Clone, Deserialize)]
pub struct SearchReplaceParams {
    pub project_id: DbId,
    pub field_name: Option<String>,   // None = search all fields
    pub search_pattern: String,
    pub replacement: String,
    pub is_regex: bool,
    pub character_ids: Option<Vec<DbId>>,  // None = all in project
}

#[derive(Debug, Serialize)]
pub struct SearchReplacePreview {
    pub match_count: usize,
    pub affected_characters: usize,
    pub matches: Vec<SearchMatch>,
}

#[derive(Debug, Serialize)]
pub struct SearchMatch {
    pub character_id: DbId,
    pub character_name: String,
    pub field_name: String,
    pub original_value: String,
    pub replaced_value: String,
    pub match_positions: Vec<(usize, usize)>,  // (start, end) for highlighting
}

/// Generate a preview of search/replace matches.
pub async fn preview_search_replace(
    pool: &PgPool,
    params: &SearchReplaceParams,
) -> Result<SearchReplacePreview, BatchError> {
    let character_ids = resolve_character_ids(pool, params).await?;
    let snapshot = capture_snapshot(pool, &character_ids).await?;

    let pattern = if params.is_regex {
        Regex::new(&params.search_pattern)?
    } else {
        Regex::new(&regex::escape(&params.search_pattern))?
    };

    let mut matches = Vec::new();

    for (character_id, metadata) in &snapshot.characters {
        let fields = match &params.field_name {
            Some(field) => vec![field.clone()],
            None => extract_string_field_names(metadata),
        };

        for field in &fields {
            if let Some(value) = metadata.get(field).and_then(|v| v.as_str()) {
                let match_positions: Vec<(usize, usize)> = pattern
                    .find_iter(value)
                    .map(|m| (m.start(), m.end()))
                    .collect();

                if !match_positions.is_empty() {
                    let replaced = pattern.replace_all(value, params.replacement.as_str()).to_string();
                    let name = fetch_character_name(pool, *character_id).await?;

                    matches.push(SearchMatch {
                        character_id: *character_id,
                        character_name: name,
                        field_name: field.clone(),
                        original_value: value.to_string(),
                        replaced_value: replaced,
                        match_positions,
                    });
                }
            }
        }
    }

    let affected_chars: std::collections::HashSet<DbId> =
        matches.iter().map(|m| m.character_id).collect();

    Ok(SearchReplacePreview {
        match_count: matches.len(),
        affected_characters: affected_chars.len(),
        matches,
    })
}

/// Apply search/replace within a transaction.
pub async fn apply_search_replace(
    pool: &PgPool,
    params: &SearchReplaceParams,
    initiated_by: Option<DbId>,
) -> Result<DbId, BatchError> {
    let preview = preview_search_replace(pool, params).await?;
    let character_ids: Vec<DbId> = preview.matches.iter().map(|m| m.character_id).collect();
    let before_snapshot = capture_snapshot(pool, &character_ids).await?;

    let pattern = if params.is_regex {
        Regex::new(&params.search_pattern)?
    } else {
        Regex::new(&regex::escape(&params.search_pattern))?
    };

    let mut tx = pool.begin().await?;

    for m in &preview.matches {
        sqlx::query!(
            r#"
            UPDATE characters
            SET metadata = jsonb_set(
                COALESCE(metadata, '{}'),
                $1::text[],
                to_jsonb($2::text)
            )
            WHERE id = $3
            "#,
            &[&m.field_name] as &[&str],
            &m.replaced_value,
            &m.character_id
        )
        .execute(&mut *tx)
        .await?;
    }

    let op_id = sqlx::query_scalar!(
        r#"
        INSERT INTO batch_metadata_operations
            (status_id, operation_type, project_id, character_ids, character_count,
             parameters, before_snapshot, summary, initiated_by, applied_at)
        VALUES (
            (SELECT id FROM batch_metadata_op_statuses WHERE name = 'completed'),
            'search_replace', $1, $2, $3, $4, $5, $6, $7, NOW()
        )
        RETURNING id
        "#,
        params.project_id,
        &character_ids,
        preview.affected_characters as i32,
        serde_json::to_value(params)?,
        serde_json::to_value(&before_snapshot)?,
        format!("Replace '{}' with '{}' — {} matches in {} characters",
            params.search_pattern, params.replacement,
            preview.match_count, preview.affected_characters
        ),
        initiated_by
    )
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(op_id)
}
```

**Acceptance Criteria:**
- [ ] Exact match and regex patterns both supported
- [ ] Single-field or all-fields search scope
- [ ] Preview shows match positions for UI highlighting
- [ ] Apply runs in single transaction with full undo data
- [ ] Regex patterns validated before execution
- [ ] Match count and affected character count accurate

### Task 2.4: Field Operations Engine
**File:** `src/batch_metadata/field_operations.rs`

Bulk field-level operations: clear, set default, copy from field, concatenate.

```rust
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "operation")]
pub enum FieldOperationParams {
    #[serde(rename = "clear")]
    Clear {
        project_id: DbId,
        character_ids: Vec<DbId>,
        field_name: String,
    },
    #[serde(rename = "set_default")]
    SetDefault {
        project_id: DbId,
        character_ids: Vec<DbId>,
        field_name: String,
        default_value: serde_json::Value,
    },
    #[serde(rename = "copy_field")]
    CopyField {
        project_id: DbId,
        character_ids: Vec<DbId>,
        source_field: String,
        target_field: String,
    },
    #[serde(rename = "concatenate")]
    Concatenate {
        project_id: DbId,
        character_ids: Vec<DbId>,
        source_fields: Vec<String>,
        target_field: String,
        separator: String,
    },
}

impl FieldOperationParams {
    pub fn project_id(&self) -> DbId {
        match self {
            Self::Clear { project_id, .. } => *project_id,
            Self::SetDefault { project_id, .. } => *project_id,
            Self::CopyField { project_id, .. } => *project_id,
            Self::Concatenate { project_id, .. } => *project_id,
        }
    }

    pub fn character_ids(&self) -> &[DbId] {
        match self {
            Self::Clear { character_ids, .. } => character_ids,
            Self::SetDefault { character_ids, .. } => character_ids,
            Self::CopyField { character_ids, .. } => character_ids,
            Self::Concatenate { character_ids, .. } => character_ids,
        }
    }
}

/// Apply a field operation with undo support.
pub async fn apply_field_operation(
    pool: &PgPool,
    params: &FieldOperationParams,
    initiated_by: Option<DbId>,
) -> Result<DbId, BatchError> {
    let character_ids = params.character_ids();
    let before_snapshot = capture_snapshot(pool, character_ids).await?;

    let mut tx = pool.begin().await?;

    let summary = match params {
        FieldOperationParams::Clear { field_name, character_ids, .. } => {
            for cid in character_ids {
                sqlx::query!(
                    r#"
                    UPDATE characters
                    SET metadata = metadata - $1
                    WHERE id = $2
                    "#,
                    field_name,
                    cid
                )
                .execute(&mut *tx)
                .await?;
            }
            format!("Cleared '{}' for {} characters", field_name, character_ids.len())
        }
        FieldOperationParams::SetDefault { field_name, default_value, character_ids, .. } => {
            let mut affected = 0;
            for cid in character_ids {
                // Only set where field is missing or null
                let result = sqlx::query!(
                    r#"
                    UPDATE characters
                    SET metadata = jsonb_set(
                        COALESCE(metadata, '{}'),
                        $1::text[],
                        $2
                    )
                    WHERE id = $3
                      AND (metadata IS NULL OR NOT metadata ? $4 OR metadata->>$4 IS NULL)
                    "#,
                    &[field_name.as_str()] as &[&str],
                    default_value,
                    cid,
                    field_name
                )
                .execute(&mut *tx)
                .await?;
                affected += result.rows_affected();
            }
            format!("Set default '{}' for {} of {} characters",
                field_name, affected, character_ids.len())
        }
        FieldOperationParams::CopyField { source_field, target_field, character_ids, .. } => {
            for cid in character_ids {
                sqlx::query!(
                    r#"
                    UPDATE characters
                    SET metadata = jsonb_set(
                        COALESCE(metadata, '{}'),
                        $1::text[],
                        COALESCE(metadata->$3, 'null')
                    )
                    WHERE id = $2
                    "#,
                    &[target_field.as_str()] as &[&str],
                    cid,
                    source_field
                )
                .execute(&mut *tx)
                .await?;
            }
            format!("Copied '{}' to '{}' for {} characters",
                source_field, target_field, character_ids.len())
        }
        FieldOperationParams::Concatenate { source_fields, target_field, separator, character_ids, .. } => {
            for cid in character_ids {
                // Build concatenated value in Rust from snapshot
                let meta = &before_snapshot.characters.get(cid);
                if let Some(meta) = meta {
                    let parts: Vec<String> = source_fields.iter()
                        .filter_map(|f| meta.get(f).and_then(|v| v.as_str()).map(|s| s.to_string()))
                        .collect();
                    let concatenated = parts.join(separator);

                    sqlx::query!(
                        r#"
                        UPDATE characters
                        SET metadata = jsonb_set(
                            COALESCE(metadata, '{}'),
                            $1::text[],
                            to_jsonb($2::text)
                        )
                        WHERE id = $3
                        "#,
                        &[target_field.as_str()] as &[&str],
                        &concatenated,
                        cid
                    )
                    .execute(&mut *tx)
                    .await?;
                }
            }
            format!("Concatenated {} fields into '{}' for {} characters",
                source_fields.len(), target_field, character_ids.len())
        }
    };

    let op_id = sqlx::query_scalar!(
        r#"
        INSERT INTO batch_metadata_operations
            (status_id, operation_type, project_id, character_ids, character_count,
             parameters, before_snapshot, summary, initiated_by, applied_at)
        VALUES (
            (SELECT id FROM batch_metadata_op_statuses WHERE name = 'completed'),
            'field_operation', $1, $2, $3, $4, $5, $6, $7, NOW()
        )
        RETURNING id
        "#,
        params.project_id(),
        character_ids,
        character_ids.len() as i32,
        serde_json::to_value(params)?,
        serde_json::to_value(&before_snapshot)?,
        &summary,
        initiated_by
    )
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(op_id)
}
```

**Acceptance Criteria:**
- [ ] Clear removes the field entirely from JSONB
- [ ] Set default only sets where value is missing or null
- [ ] Copy field transfers value between field names
- [ ] Concatenate joins multiple fields with separator
- [ ] All operations capture before-snapshot for undo
- [ ] All operations run in a single transaction

---

## Phase 3: CSV Export / Re-Import

### Task 3.1: CSV Export Service
**File:** `src/batch_metadata/csv_export.rs`

Export character metadata as CSV.

```rust
use csv::Writer;

#[derive(Debug, Deserialize)]
pub struct CsvExportParams {
    pub project_id: DbId,
    pub character_ids: Option<Vec<DbId>>,  // None = all in project
    pub fields: Option<Vec<String>>,        // None = all fields
}

pub async fn export_metadata_csv(
    pool: &PgPool,
    params: &CsvExportParams,
) -> Result<Vec<u8>, BatchError> {
    let characters = fetch_characters_for_export(pool, params).await?;

    // Collect all unique field names across all characters
    let all_fields = match &params.fields {
        Some(fields) => fields.clone(),
        None => collect_all_field_names(&characters),
    };

    let mut writer = Writer::from_writer(Vec::new());

    // Write header: character_id, character_name, field1, field2, ...
    let mut header = vec!["character_id".to_string(), "character_name".to_string()];
    header.extend(all_fields.clone());
    writer.write_record(&header)?;

    for character in &characters {
        let mut row = vec![
            character.id.to_string(),
            character.name.clone(),
        ];
        for field in &all_fields {
            let value = character.metadata
                .as_ref()
                .and_then(|m| m.get(field))
                .map(|v| match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
                .unwrap_or_default();
            row.push(value);
        }
        writer.write_record(&row)?;
    }

    Ok(writer.into_inner()?)
}
```

**Acceptance Criteria:**
- [ ] One row per character, one column per metadata field
- [ ] `character_id` column included for re-import matching
- [ ] Optional field filtering (export specific fields only)
- [ ] All data types serialized correctly (strings, numbers, booleans)
- [ ] Empty/null fields exported as empty strings

### Task 3.2: CSV Re-Import Service
**File:** `src/batch_metadata/csv_import.rs`

Re-import metadata from CSV with diff preview.

```rust
#[derive(Debug, Serialize)]
pub struct CsvImportPreview {
    pub characters_updated: usize,
    pub new_fields_added: usize,
    pub conflicts: usize,
    pub diffs: Vec<CsvCharacterDiff>,
}

#[derive(Debug, Serialize)]
pub struct CsvCharacterDiff {
    pub character_id: DbId,
    pub character_name: String,
    pub field_changes: Vec<FieldChange>,
}

#[derive(Debug, Serialize)]
pub struct FieldChange {
    pub field_name: String,
    pub current_value: serde_json::Value,
    pub incoming_value: serde_json::Value,
    pub is_new_field: bool,
}

/// Parse CSV and generate a diff preview without applying changes.
pub async fn preview_csv_import(
    pool: &PgPool,
    csv_data: &[u8],
    project_id: DbId,
) -> Result<CsvImportPreview, BatchError> {
    let mut reader = csv::Reader::from_reader(csv_data);
    let headers = reader.headers()?.clone();

    // Identify character_id column (required)
    let id_col = headers.iter().position(|h| h == "character_id")
        .ok_or(BatchError::MissingColumn("character_id".to_string()))?;

    let mut preview = CsvImportPreview::default();

    for result in reader.records() {
        let record = result?;
        let character_id: DbId = record.get(id_col)
            .ok_or(BatchError::MissingValue("character_id".to_string()))?
            .parse()
            .map_err(|_| BatchError::InvalidCharacterId)?;

        // Fetch current metadata
        let current_meta = fetch_character_metadata(pool, character_id).await?;
        let character_name = fetch_character_name(pool, character_id).await?;

        let mut field_changes = Vec::new();
        for (col_idx, header) in headers.iter().enumerate() {
            if header == "character_id" || header == "character_name" {
                continue;
            }
            let incoming = record.get(col_idx).unwrap_or("");
            if incoming.is_empty() {
                continue; // skip empty values
            }
            let incoming_value = serde_json::Value::String(incoming.to_string());
            let current_value = current_meta
                .as_ref()
                .and_then(|m| m.get(header))
                .cloned()
                .unwrap_or(serde_json::Value::Null);

            let is_new_field = current_meta
                .as_ref()
                .map(|m| !m.as_object().map_or(false, |o| o.contains_key(header)))
                .unwrap_or(true);

            if current_value != incoming_value {
                field_changes.push(FieldChange {
                    field_name: header.to_string(),
                    current_value,
                    incoming_value,
                    is_new_field,
                });
            }
        }

        if !field_changes.is_empty() {
            let new_fields = field_changes.iter().filter(|c| c.is_new_field).count();
            preview.new_fields_added += new_fields;
            preview.characters_updated += 1;
            preview.diffs.push(CsvCharacterDiff {
                character_id,
                character_name,
                field_changes,
            });
        }
    }

    Ok(preview)
}

/// Apply CSV import within a transaction.
pub async fn apply_csv_import(
    pool: &PgPool,
    csv_data: &[u8],
    project_id: DbId,
    initiated_by: Option<DbId>,
) -> Result<DbId, BatchError> {
    let preview = preview_csv_import(pool, csv_data, project_id).await?;
    let character_ids: Vec<DbId> = preview.diffs.iter().map(|d| d.character_id).collect();
    let before_snapshot = capture_snapshot(pool, &character_ids).await?;

    let mut tx = pool.begin().await?;

    for diff in &preview.diffs {
        for change in &diff.field_changes {
            sqlx::query!(
                r#"
                UPDATE characters
                SET metadata = jsonb_set(
                    COALESCE(metadata, '{}'),
                    $1::text[],
                    $2
                )
                WHERE id = $3
                "#,
                &[&change.field_name] as &[&str],
                &change.incoming_value,
                &diff.character_id
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    let op_id = sqlx::query_scalar!(
        r#"
        INSERT INTO batch_metadata_operations
            (status_id, operation_type, project_id, character_ids, character_count,
             parameters, before_snapshot, summary, initiated_by, applied_at)
        VALUES (
            (SELECT id FROM batch_metadata_op_statuses WHERE name = 'completed'),
            'csv_import', $1, $2, $3, $4, $5, $6, $7, NOW()
        )
        RETURNING id
        "#,
        project_id,
        &character_ids,
        preview.characters_updated as i32,
        serde_json::json!({ "source": "csv_import" }),
        serde_json::to_value(&before_snapshot)?,
        format!("{} characters updated, {} new fields added, {} conflicts",
            preview.characters_updated, preview.new_fields_added, preview.conflicts
        ),
        initiated_by
    )
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(op_id)
}
```

**Acceptance Criteria:**
- [ ] Matches rows to characters by `character_id` column
- [ ] Diff preview shows current vs. incoming values
- [ ] Identifies new fields not currently in metadata
- [ ] Empty CSV cells are skipped (not written as empty strings)
- [ ] Apply runs in single transaction with undo data
- [ ] Summary format: "42 characters updated, 3 new fields added, 0 conflicts"

---

## Phase 4: Atomic Undo

### Task 4.1: Batch Undo Service
**File:** `src/batch_metadata/undo.rs`

Undo a batch operation by restoring the before-snapshot.

```rust
/// Undo a batch metadata operation.
pub async fn undo_batch_operation(
    pool: &PgPool,
    operation_id: DbId,
    initiated_by: Option<DbId>,
) -> Result<UndoResult, BatchError> {
    // Load the operation
    let op = sqlx::query!(
        r#"
        SELECT id, status_id, before_snapshot, character_count, summary,
               (SELECT name FROM batch_metadata_op_statuses WHERE id = status_id) as "status_name!"
        FROM batch_metadata_operations
        WHERE id = $1
        "#,
        operation_id
    )
    .fetch_optional(pool)
    .await?
    .ok_or(BatchError::NotFound)?;

    // Only completed operations can be undone
    if op.status_name != "completed" {
        return Err(BatchError::InvalidUndoState(op.status_name));
    }

    let snapshot: MetadataSnapshot = serde_json::from_value(op.before_snapshot)?;

    let mut tx = pool.begin().await?;

    let restored = restore_snapshot_in_tx(&mut tx, &snapshot).await?;

    // Update operation status to undone
    sqlx::query!(
        r#"
        UPDATE batch_metadata_operations
        SET status_id = (SELECT id FROM batch_metadata_op_statuses WHERE name = 'undone'),
            undone_at = NOW()
        WHERE id = $1
        "#,
        operation_id
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    // Emit PRD-045 audit log entry
    emit_audit_log(
        pool,
        "batch_metadata_undo",
        operation_id,
        initiated_by,
        &format!("Undone: {}", op.summary),
    ).await?;

    Ok(UndoResult {
        operation_id,
        characters_restored: restored,
        original_summary: op.summary,
    })
}

#[derive(Debug, Serialize)]
pub struct UndoResult {
    pub operation_id: DbId,
    pub characters_restored: usize,
    pub original_summary: String,
}
```

**Acceptance Criteria:**
- [ ] Only completed operations can be undone
- [ ] Restores full before-snapshot for all affected characters
- [ ] Operation status set to 'undone' with timestamp
- [ ] Undo runs in a single transaction
- [ ] Audit log emitted for undo action
- [ ] Human-readable result: "Undo batch edit: 42 characters affected"

### Task 4.2: PRD-051 Undo/Redo Integration
**File:** `src/batch_metadata/undo_redo_integration.rs`

Register batch operations with the PRD-051 undo/redo stack.

```rust
use crate::undo_redo::{UndoAction, UndoRegistry};

pub struct BatchMetadataUndoAction {
    pub operation_id: DbId,
}

impl UndoAction for BatchMetadataUndoAction {
    fn description(&self) -> String {
        format!("Undo batch metadata operation #{}", self.operation_id)
    }

    async fn undo(&self, pool: &PgPool) -> Result<(), UndoError> {
        undo_batch_operation(pool, self.operation_id, None).await?;
        Ok(())
    }

    async fn redo(&self, pool: &PgPool) -> Result<(), UndoError> {
        // Re-apply from parameters stored on the operation record
        redo_batch_operation(pool, self.operation_id).await?;
        Ok(())
    }
}

/// After applying any batch operation, register it with the undo stack.
pub fn register_with_undo_stack(
    registry: &UndoRegistry,
    operation_id: DbId,
    session_id: &str,
) {
    registry.push(session_id, Box::new(BatchMetadataUndoAction { operation_id }));
}
```

**Acceptance Criteria:**
- [ ] Batch operations registered with PRD-051 undo stack
- [ ] Ctrl+Z in the UI triggers batch undo through the standard undo system
- [ ] Redo support via re-applying from stored parameters
- [ ] Session-scoped undo (each user has their own stack)

---

## Phase 5: Audit Trail Integration

### Task 5.1: Audit Log Emitter
**File:** `src/batch_metadata/audit.rs`

Emit audit log entries for all batch operations via PRD-045.

```rust
use crate::audit::{AuditLogger, AuditEvent};

/// Emit an audit log entry for a batch metadata operation.
pub async fn emit_batch_audit_log(
    pool: &PgPool,
    operation_id: DbId,
    operation_type: &str,
    project_id: DbId,
    character_ids: &[DbId],
    summary: &str,
    initiated_by: Option<DbId>,
) -> Result<(), BatchError> {
    let event = AuditEvent {
        event_type: format!("batch_metadata.{}", operation_type),
        entity_type: "batch_metadata_operation".to_string(),
        entity_id: operation_id,
        project_id: Some(project_id),
        user_id: initiated_by,
        details: serde_json::json!({
            "operation_type": operation_type,
            "character_ids": character_ids,
            "character_count": character_ids.len(),
            "summary": summary,
        }),
    };

    AuditLogger::log(pool, &event).await?;

    Ok(())
}
```

**Acceptance Criteria:**
- [ ] Every batch apply emits an audit log entry
- [ ] Every batch undo emits an audit log entry
- [ ] Log includes: who, when, which characters, what changed (old -> new via summary)
- [ ] Queryable via PRD-045 audit system
- [ ] Exportable for compliance

---

## Phase 6: API Endpoints

### Task 6.1: Batch Edit Endpoints
**File:** `src/routes/batch_metadata.rs`

```rust
use axum::{Router, routing::{post, get}, extract::{State, Json, Path}, response::IntoResponse};

pub fn router() -> Router<AppState> {
    Router::new()
        // Multi-select edit
        .route("/api/characters/batch-edit/preview", post(preview_batch_edit))
        .route("/api/characters/batch-edit", post(apply_batch_edit))
        // Search & replace
        .route("/api/characters/search-replace/preview", post(preview_search_replace_handler))
        .route("/api/characters/search-replace", post(apply_search_replace_handler))
        // CSV round-trip
        .route("/api/characters/metadata/csv/export", post(export_csv))
        .route("/api/characters/metadata/csv/import/preview", post(preview_csv_import_handler))
        .route("/api/characters/metadata/csv/import", post(apply_csv_import_handler))
        // Field operations
        .route("/api/characters/field-operation/preview", post(preview_field_op))
        .route("/api/characters/field-operation", post(apply_field_op))
        // Undo
        .route("/api/characters/batch-operation/:id/undo", post(undo_operation))
        // History
        .route("/api/characters/batch-operations", get(list_operations))
        .route("/api/characters/batch-operations/:id", get(get_operation))
}

async fn preview_batch_edit(
    State(state): State<AppState>,
    Json(params): Json<MultiSelectEditParams>,
) -> impl IntoResponse {
    let preview = preview_multi_select_edit(&state.pool, &params).await?;
    Ok(Json(preview))
}

async fn apply_batch_edit(
    State(state): State<AppState>,
    Json(params): Json<MultiSelectEditParams>,
) -> impl IntoResponse {
    let op_id = apply_multi_select_edit(&state.pool, &params, None).await?;

    // Emit audit log
    emit_batch_audit_log(
        &state.pool, op_id, "multi_select_edit",
        params.project_id, &params.character_ids,
        &format!("Set {} for {} characters", params.field_name, params.character_ids.len()),
        None,
    ).await?;

    // Register with undo stack
    register_with_undo_stack(&state.undo_registry, op_id, &session_id);

    Ok(Json(serde_json::json!({ "operation_id": op_id })))
}

async fn undo_operation(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> impl IntoResponse {
    let result = undo_batch_operation(&state.pool, id, None).await?;
    Ok(Json(result))
}

async fn export_csv(
    State(state): State<AppState>,
    Json(params): Json<CsvExportParams>,
) -> impl IntoResponse {
    let csv_bytes = export_metadata_csv(&state.pool, &params).await?;
    Ok((
        [("content-type", "text/csv"), ("content-disposition", "attachment; filename=metadata.csv")],
        csv_bytes,
    ))
}

async fn list_operations(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let ops = sqlx::query!(
        r#"
        SELECT o.id, o.operation_type, o.character_count, o.summary, o.applied_at, o.undone_at,
               s.name as "status_name!"
        FROM batch_metadata_operations o
        JOIN batch_metadata_op_statuses s ON o.status_id = s.id
        ORDER BY o.created_at DESC
        LIMIT 100
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(ops))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/characters/batch-edit/preview` returns preview of multi-select edit
- [ ] `POST /api/characters/batch-edit` applies multi-select edit
- [ ] `POST /api/characters/search-replace/preview` returns match preview with positions
- [ ] `POST /api/characters/search-replace` applies search & replace
- [ ] `POST /api/characters/metadata/csv/export` returns CSV download
- [ ] `POST /api/characters/metadata/csv/import/preview` returns diff preview
- [ ] `POST /api/characters/metadata/csv/import` applies CSV import
- [ ] `POST /api/characters/field-operation/preview` returns field operation preview
- [ ] `POST /api/characters/field-operation` applies field operation
- [ ] `POST /api/characters/batch-operation/:id/undo` undoes a batch operation
- [ ] `GET /api/characters/batch-operations` lists recent batch operations
- [ ] `GET /api/characters/batch-operations/:id` returns single operation detail

### Task 6.2: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All batch metadata endpoints registered under the main router

---

## Phase 7: Frontend

### Task 7.1: Batch Toolbar Component
**File:** `frontend/src/components/batch_metadata/BatchToolbar.tsx`

Toolbar that appears when multiple characters are selected.

```tsx
import React from 'react';

interface BatchToolbarProps {
  selectedIds: number[];
  projectId: number;
  onOperationComplete: () => void;
}

export const BatchToolbar: React.FC<BatchToolbarProps> = ({
  selectedIds,
  projectId,
  onOperationComplete,
}) => {
  const [showEditDialog, setShowEditDialog] = React.useState(false);
  const [showSearchReplace, setShowSearchReplace] = React.useState(false);
  const [showFieldOps, setShowFieldOps] = React.useState(false);

  if (selectedIds.length < 2) return null;

  return (
    <div className="batch-toolbar">
      <span className="batch-count">{selectedIds.length} characters selected</span>
      <button onClick={() => setShowEditDialog(true)}>Edit Field</button>
      <button onClick={() => setShowSearchReplace(true)}>Search & Replace</button>
      <button onClick={() => setShowFieldOps(true)}>Field Operations</button>
      <button onClick={handleCsvExport}>Export CSV</button>
      <button onClick={handleCsvImport}>Import CSV</button>

      {showEditDialog && (
        <MultiSelectEditDialog
          characterIds={selectedIds}
          projectId={projectId}
          onClose={() => setShowEditDialog(false)}
          onApply={onOperationComplete}
        />
      )}
      {showSearchReplace && (
        <SearchReplaceDialog
          characterIds={selectedIds}
          projectId={projectId}
          onClose={() => setShowSearchReplace(false)}
          onApply={onOperationComplete}
        />
      )}
      {showFieldOps && (
        <FieldOperationsDialog
          characterIds={selectedIds}
          projectId={projectId}
          onClose={() => setShowFieldOps(false)}
          onApply={onOperationComplete}
        />
      )}
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] Appears when 2+ characters are selected
- [ ] Shows count of selected characters
- [ ] Buttons for each batch operation type
- [ ] CSV export/import accessible
- [ ] Disappears when selection is cleared

### Task 7.2: Multi-Select Edit Dialog
**File:** `frontend/src/components/batch_metadata/MultiSelectEditDialog.tsx`

**Acceptance Criteria:**
- [ ] Field picker dropdown (all metadata fields)
- [ ] Value input with appropriate input type
- [ ] Preview table: character name, old value, new value
- [ ] Confirm / Cancel buttons
- [ ] Loading state during apply

### Task 7.3: Search & Replace Dialog
**File:** `frontend/src/components/batch_metadata/SearchReplaceDialog.tsx`

**Acceptance Criteria:**
- [ ] Search input with regex toggle
- [ ] Replacement input
- [ ] Field scope selector (specific field or all fields)
- [ ] Preview with highlighted matches (match positions from API)
- [ ] Match count and affected character count
- [ ] Apply / Cancel buttons

### Task 7.4: CSV Import Preview Dialog
**File:** `frontend/src/components/batch_metadata/CsvImportPreviewDialog.tsx`

**Acceptance Criteria:**
- [ ] File upload input for CSV
- [ ] Diff table: character name, field, current value, incoming value
- [ ] Summary: "42 characters updated, 3 new fields added, 0 conflicts"
- [ ] Apply / Cancel buttons
- [ ] Validation warnings per row

### Task 7.5: Batch Operation History Panel
**File:** `frontend/src/components/batch_metadata/BatchHistoryPanel.tsx`

**Acceptance Criteria:**
- [ ] List of recent batch operations with type, summary, timestamp
- [ ] Status indicator (completed, undone, failed)
- [ ] Undo button for completed operations
- [ ] Click to view operation details

---

## Phase 8: Testing

### Task 8.1: Multi-Select Edit Tests
**File:** `tests/batch_metadata_multi_select_tests.rs`

**Acceptance Criteria:**
- [ ] Preview returns correct old/new values for each character
- [ ] Apply updates all characters in one transaction
- [ ] Undo restores all characters to pre-operation state
- [ ] Handles NULL metadata gracefully
- [ ] Batch of 100+ characters completes in <5 seconds (per success metric)

### Task 8.2: Search & Replace Tests
**File:** `tests/batch_metadata_search_replace_tests.rs`

**Acceptance Criteria:**
- [ ] Exact match works correctly
- [ ] Regex patterns work correctly (e.g., `bl(ond|onde)` -> `light_blonde`)
- [ ] Single-field scope limits matches to specified field
- [ ] All-fields scope searches every string field
- [ ] Invalid regex returns clear error, not panic
- [ ] Undo restores original values

### Task 8.3: CSV Round-Trip Tests
**File:** `tests/batch_metadata_csv_tests.rs`

**Acceptance Criteria:**
- [ ] Export -> re-import produces identical metadata (round-trip fidelity)
- [ ] Diff preview correctly identifies changed vs. unchanged fields
- [ ] New fields flagged as `is_new_field: true`
- [ ] Empty CSV cells are skipped (not overwriting existing data)
- [ ] Missing `character_id` column returns clear error

### Task 8.4: Field Operations Tests
**File:** `tests/batch_metadata_field_ops_tests.rs`

**Acceptance Criteria:**
- [ ] Clear removes field from all selected characters
- [ ] Set default only fills where null/missing
- [ ] Copy field transfers value correctly
- [ ] Concatenate joins with separator correctly
- [ ] All operations are undoable

### Task 8.5: Audit Integration Tests
**File:** `tests/batch_metadata_audit_tests.rs`

**Acceptance Criteria:**
- [ ] Every batch apply produces an audit log entry
- [ ] Every batch undo produces an audit log entry
- [ ] Audit entries are queryable via PRD-045 audit API
- [ ] 100% of batch operations appear in audit log (per success metric)

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_batch_metadata_operations.sql` | Batch operation tracking with undo snapshots |
| `src/batch_metadata/mod.rs` | Module root |
| `src/batch_metadata/snapshot.rs` | Snapshot capture and restore for undo |
| `src/batch_metadata/multi_select_edit.rs` | Multi-select field edit engine |
| `src/batch_metadata/search_replace.rs` | Search & replace with regex |
| `src/batch_metadata/field_operations.rs` | Clear, set default, copy, concatenate |
| `src/batch_metadata/csv_export.rs` | CSV export service |
| `src/batch_metadata/csv_import.rs` | CSV re-import with diff preview |
| `src/batch_metadata/undo.rs` | Atomic undo from before-snapshot |
| `src/batch_metadata/undo_redo_integration.rs` | PRD-051 undo/redo stack integration |
| `src/batch_metadata/audit.rs` | PRD-045 audit log emitter |
| `src/routes/batch_metadata.rs` | API endpoints |
| `frontend/src/components/batch_metadata/BatchToolbar.tsx` | Selection-aware toolbar |
| `frontend/src/components/batch_metadata/MultiSelectEditDialog.tsx` | Multi-select edit dialog |
| `frontend/src/components/batch_metadata/SearchReplaceDialog.tsx` | Search & replace dialog |
| `frontend/src/components/batch_metadata/CsvImportPreviewDialog.tsx` | CSV import preview |
| `frontend/src/components/batch_metadata/BatchHistoryPanel.tsx` | Operation history |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId`, migration framework, `trigger_set_updated_at()`
- PRD-001: `characters` table with JSONB `metadata` column
- PRD-014: Validation service (validate metadata changes before commit)
- PRD-045: `AuditLogger` for audit log entries
- PRD-051: `UndoRegistry` for undo/redo stack registration
- PRD-060: Character library selection context (character_ids)
- PRD-066: Metadata editor API (single-character read/write)

### New Infrastructure Needed
- `regex` crate for search & replace patterns
- `csv` crate for CSV export/import

## Implementation Order

### MVP
1. Phase 1: Database Schema (Task 1.1)
2. Phase 2: Batch Engine Core (Tasks 2.1-2.4)
3. Phase 3: CSV Export / Re-Import (Tasks 3.1-3.2)
4. Phase 4: Atomic Undo (Tasks 4.1-4.2)
5. Phase 5: Audit Trail Integration (Task 5.1)
6. Phase 6: API Endpoints (Tasks 6.1-6.2)

**MVP Success Criteria:**
- Batch operations on 100 characters complete in <5 seconds
- CSV round-trip preserves all data types and values correctly
- Undo correctly restores all affected records to pre-operation state
- 100% of batch operations appear in the audit log

### Post-MVP Enhancements
1. Phase 7: Frontend (Tasks 7.1-7.5)
2. Phase 8: Testing (Tasks 8.1-8.5)

---

## Notes

1. **Relationship to PRD-018 (Bulk Data Maintenance):** PRD-018 handles file path re-pathing and bulk structural operations. PRD-088 focuses exclusively on character metadata field values. They share the concept of batch undo via JSONB snapshots but operate on different data.
2. **Transaction size:** For very large batches (1000+ characters), consider chunking the transaction to avoid long lock contention. For MVP, single-transaction is acceptable per the 100-character performance target.
3. **CSV encoding:** Use UTF-8 with BOM for Excel compatibility. Excel expects BOM to correctly detect UTF-8.
4. **Regex safety:** The `regex` crate in Rust is safe against ReDoS by design (linear-time matching). No additional protection needed.
5. **Open questions from PRD:** Conditional batch operations ("set X only where Y = Z") are deferred to post-MVP. Maximum batch size should be tested empirically but 1000 characters is a reasonable initial limit. CSV import adding new metadata fields is supported (flagged as `is_new_field` in preview).

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

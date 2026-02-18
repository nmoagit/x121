# Task List: Bulk Data Maintenance (Search/Replace/Re-path)

**PRD Reference:** `design/prds/018-prd-bulk-data-maintenance.md`
**Scope:** Build global find/replace across metadata fields and bulk re-pathing for file references, with preview, atomic execution, and one-level undo support for all bulk operations.

## Overview

This PRD creates an admin-oriented bulk operations system for two core scenarios: (1) global find/replace on metadata text fields (e.g., fixing a studio name across all characters), and (2) bulk re-pathing to update file path references when asset libraries move to a new drive or directory. Every operation goes through a mandatory preview step, executes atomically in a database transaction, stores undo data for rollback, and validates post-operation integrity via PRD-014.

### What Already Exists
- PRD-000: Database conventions, transaction support
- PRD-001: Entity tables with metadata and file path fields
- PRD-014: Validation layer for post-operation integrity checks

### What We're Building
1. Bulk operations tracking table with undo data storage
2. Find/replace engine with exact match and regex support
3. Bulk re-pathing engine with path prefix substitution
4. Preview service showing all affected records before commit
5. Atomic execution with transaction rollback on failure
6. One-level undo that restores all affected records
7. Admin API endpoints and frontend UI

### Key Design Decisions
1. **Single transaction for all changes** — The entire bulk operation runs in one PostgreSQL transaction. If any record fails, everything rolls back.
2. **Undo data stored as JSONB** — Previous values for all affected records are stored in the `bulk_operations` table, enabling complete rollback.
3. **Concurrency lock** — Only one bulk operation can run at a time (advisory lock) to prevent conflicting changes.
4. **Post-operation validation** — After applying changes, PRD-014 validation runs on affected records to catch any integrity issues.

---

## Phase 1: Database Schema

### Task 1.1: Bulk Operations Table
**File:** `migrations/{timestamp}_create_bulk_operations.sql`

Track bulk operations with parameters, results, and undo data.

```sql
CREATE TABLE bulk_operation_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bulk_operation_types
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO bulk_operation_types (name, description) VALUES
    ('find_replace', 'Global find and replace across metadata fields'),
    ('repath', 'Bulk update of file path references'),
    ('batch_update', 'Batch field update across entities');

CREATE TABLE bulk_operation_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bulk_operation_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO bulk_operation_statuses (name, description) VALUES
    ('preview', 'Preview generated, awaiting confirmation'),
    ('executing', 'Operation in progress'),
    ('completed', 'Operation completed successfully'),
    ('failed', 'Operation failed and was rolled back'),
    ('undone', 'Operation was undone by admin');

CREATE TABLE bulk_operations (
    id BIGSERIAL PRIMARY KEY,
    operation_type_id BIGINT NOT NULL REFERENCES bulk_operation_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status_id BIGINT NOT NULL REFERENCES bulk_operation_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    parameters JSONB NOT NULL,           -- operation-specific config (search term, replacement, paths, etc.)
    scope_project_id BIGINT NULL,        -- NULL = studio-wide
    affected_entity_type TEXT,
    affected_field TEXT,
    preview_count INTEGER NOT NULL DEFAULT 0,
    affected_count INTEGER NOT NULL DEFAULT 0,
    undo_data JSONB NOT NULL DEFAULT '[]', -- [{entity_type, entity_id, field, old_value}]
    error_message TEXT,
    executed_by BIGINT NULL,             -- FK to users when available
    executed_at TIMESTAMPTZ NULL,
    undone_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bulk_operations_type_id ON bulk_operations(operation_type_id);
CREATE INDEX idx_bulk_operations_status_id ON bulk_operations(status_id);
CREATE INDEX idx_bulk_operations_project_id ON bulk_operations(scope_project_id);
CREATE INDEX idx_bulk_operations_created_at ON bulk_operations(created_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON bulk_operations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Operation types seeded: find_replace, repath, batch_update
- [ ] Statuses seeded: preview, executing, completed, failed, undone
- [ ] `parameters` JSONB stores operation-specific configuration
- [ ] `undo_data` JSONB stores all previous values for rollback
- [ ] All FK columns indexed
- [ ] Migration applies cleanly

---

## Phase 2: Find/Replace Engine

### Task 2.1: Find/Replace Types
**File:** `src/maintenance/find_replace.rs`

Define types for find/replace operations.

```rust
use crate::types::DbId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct FindReplaceRequest {
    pub search_term: String,
    pub replace_with: String,
    pub use_regex: bool,
    pub entity_type: Option<String>,     // filter to specific entity type
    pub field_name: Option<String>,       // filter to specific field
    pub project_id: Option<DbId>,        // NULL = studio-wide
    pub case_sensitive: bool,
}

#[derive(Debug, Serialize)]
pub struct FindReplaceMatch {
    pub entity_type: String,
    pub entity_id: DbId,
    pub field_name: String,
    pub current_value: String,
    pub new_value: String,
    pub match_positions: Vec<(usize, usize)>, // start, end within value
}

#[derive(Debug, Serialize)]
pub struct FindReplacePreview {
    pub operation_id: DbId,
    pub total_matches: usize,
    pub matches: Vec<FindReplaceMatch>,
    pub entity_types_affected: Vec<String>,
    pub fields_affected: Vec<String>,
}
```

**Acceptance Criteria:**
- [ ] Supports exact match and regex search
- [ ] Case-sensitive and case-insensitive modes
- [ ] Filterable by entity type and field name
- [ ] Match positions tracked for UI highlighting
- [ ] Scopeable to a project or studio-wide

### Task 2.2: Find/Replace Preview
**File:** `src/maintenance/find_replace.rs`

Search for matches without applying changes.

```rust
pub async fn preview_find_replace(
    pool: &PgPool,
    req: &FindReplaceRequest,
) -> Result<FindReplacePreview, MaintenanceError> {
    let mut matches = Vec::new();

    // Search across relevant tables/columns
    // For each entity type: characters.name, characters.description, etc.
    let searchable_fields = get_searchable_fields(req.entity_type.as_deref());

    for (entity_type, table, field) in &searchable_fields {
        let query = format!(
            "SELECT id, {} FROM {} WHERE {} {} $1",
            field, table, field,
            if req.use_regex { "~" } else if req.case_sensitive { "LIKE" } else { "ILIKE" }
        );
        // Build search pattern
        let pattern = if req.use_regex {
            req.search_term.clone()
        } else {
            format!("%{}%", req.search_term)
        };

        // Execute query and collect matches
        // Compute new_value by applying replacement
    }

    // Create bulk_operations record in 'preview' status
    let op_id = create_operation_record(pool, "find_replace", req, matches.len()).await?;

    Ok(FindReplacePreview {
        operation_id: op_id,
        total_matches: matches.len(),
        matches,
        entity_types_affected: collect_entity_types(&matches),
        fields_affected: collect_fields(&matches),
    })
}
```

**Acceptance Criteria:**
- [ ] Searches across all text fields of relevant entity types
- [ ] Regex search uses PostgreSQL `~` operator
- [ ] ILIKE search for case-insensitive exact match
- [ ] Computes the replacement value for each match
- [ ] Creates operation record in 'preview' status
- [ ] Preview returns 100% of affected records (per success metric)

### Task 2.3: Find/Replace Executor
**File:** `src/maintenance/find_replace.rs`

Apply find/replace changes atomically with undo data capture.

```rust
pub async fn execute_find_replace(
    pool: &PgPool,
    operation_id: DbId,
) -> Result<ExecutionResult, MaintenanceError> {
    // Acquire advisory lock to prevent concurrent operations
    acquire_maintenance_lock(pool).await?;

    let operation = load_operation(pool, operation_id).await?;
    let req: FindReplaceRequest = serde_json::from_value(operation.parameters)?;

    let mut tx = pool.begin().await?;
    let mut undo_entries = Vec::new();
    let mut affected = 0;

    let searchable_fields = get_searchable_fields(req.entity_type.as_deref());

    for (entity_type, table, field) in &searchable_fields {
        // Find and update in a single pass
        // Store old values in undo_entries
        // Apply replacement

        let rows = execute_replacement(&mut tx, table, field, &req).await?;
        for row in &rows {
            undo_entries.push(serde_json::json!({
                "entity_type": entity_type,
                "entity_id": row.id,
                "field": field,
                "old_value": row.old_value,
            }));
        }
        affected += rows.len();
    }

    // Store undo data
    update_operation_undo_data(&mut tx, operation_id, &undo_entries, affected).await?;

    tx.commit().await?;
    release_maintenance_lock(pool).await?;

    Ok(ExecutionResult {
        operation_id,
        affected_count: affected,
    })
}
```

**Acceptance Criteria:**
- [ ] Acquires advisory lock before execution
- [ ] All changes in a single transaction
- [ ] Stores old values as undo data before modifying
- [ ] Updates operation status to 'completed'
- [ ] Processes 10,000 records in <30 seconds (per success metric)
- [ ] Rolls back and sets 'failed' status on any error

---

## Phase 3: Bulk Re-Pathing Engine

### Task 3.1: Re-Pathing Types
**File:** `src/maintenance/repath.rs`

```rust
#[derive(Debug, Deserialize)]
pub struct RepathRequest {
    pub old_prefix: String,
    pub new_prefix: String,
    pub entity_type: Option<String>,
    pub project_id: Option<DbId>,
    pub validate_new_paths: bool,
}

#[derive(Debug, Serialize)]
pub struct RepathMatch {
    pub entity_type: String,
    pub entity_id: DbId,
    pub field_name: String,
    pub current_path: String,
    pub new_path: String,
    pub new_path_exists: Option<bool>,   // populated if validate_new_paths is true
}
```

**Acceptance Criteria:**
- [ ] Supports old prefix -> new prefix substitution
- [ ] Optional filesystem validation of new paths
- [ ] Filterable by entity type and project

### Task 3.2: Re-Pathing Preview
**File:** `src/maintenance/repath.rs`

```rust
pub async fn preview_repath(
    pool: &PgPool,
    req: &RepathRequest,
) -> Result<RepathPreview, MaintenanceError> {
    let mut matches = Vec::new();

    // Search all file path columns for old_prefix
    let path_fields = get_path_fields(req.entity_type.as_deref());

    for (entity_type, table, field) in &path_fields {
        let rows = sqlx::query(&format!(
            "SELECT id, {} FROM {} WHERE {} LIKE $1",
            field, table, field
        ))
        .bind(format!("{}%", req.old_prefix))
        .fetch_all(pool)
        .await?;

        for row in &rows {
            let current: String = row.get(field);
            let new_path = current.replacen(&req.old_prefix, &req.new_prefix, 1);

            let exists = if req.validate_new_paths {
                Some(tokio::fs::metadata(&new_path).await.is_ok())
            } else {
                None
            };

            matches.push(RepathMatch {
                entity_type: entity_type.to_string(),
                entity_id: row.get("id"),
                field_name: field.to_string(),
                current_path: current,
                new_path,
                new_path_exists: exists,
            });
        }
    }

    let op_id = create_operation_record(pool, "repath", req, matches.len()).await?;

    Ok(RepathPreview {
        operation_id: op_id,
        total_matches: matches.len(),
        matches,
        broken_references: matches.iter().filter(|m| m.new_path_exists == Some(false)).count(),
    })
}
```

**Acceptance Criteria:**
- [ ] Finds all file path fields with the old prefix
- [ ] Computes new path by prefix substitution
- [ ] Optionally validates that new paths exist on disk
- [ ] Reports count of broken references (new path does not exist)
- [ ] Creates operation record in 'preview' status

### Task 3.3: Re-Pathing Executor
**File:** `src/maintenance/repath.rs`

Apply re-pathing atomically.

```rust
pub async fn execute_repath(
    pool: &PgPool,
    operation_id: DbId,
) -> Result<ExecutionResult, MaintenanceError> {
    acquire_maintenance_lock(pool).await?;

    let operation = load_operation(pool, operation_id).await?;
    let req: RepathRequest = serde_json::from_value(operation.parameters)?;

    let mut tx = pool.begin().await?;
    let mut undo_entries = Vec::new();
    let mut affected = 0;

    let path_fields = get_path_fields(req.entity_type.as_deref());

    for (entity_type, table, field) in &path_fields {
        // Update paths with old prefix to new prefix
        // Store old values for undo
        let query = format!(
            "UPDATE {} SET {} = REPLACE({}, $1, $2) WHERE {} LIKE $3 RETURNING id, {} as new_val",
            table, field, field, field, field
        );
        // ... execute and collect undo data
    }

    update_operation_undo_data(&mut tx, operation_id, &undo_entries, affected).await?;
    tx.commit().await?;
    release_maintenance_lock(pool).await?;

    Ok(ExecutionResult { operation_id, affected_count: affected })
}
```

**Acceptance Criteria:**
- [ ] Replaces old prefix with new prefix in all matching path fields
- [ ] Stores old paths as undo data
- [ ] Single transaction for all changes
- [ ] Reports broken references after re-pathing
- [ ] Advisory lock prevents concurrent operations

---

## Phase 4: Undo Service

### Task 4.1: Undo Executor
**File:** `src/maintenance/undo.rs`

Restore all affected records to their pre-operation state.

```rust
pub async fn undo_operation(
    pool: &PgPool,
    operation_id: DbId,
) -> Result<UndoResult, MaintenanceError> {
    acquire_maintenance_lock(pool).await?;

    let operation = load_operation(pool, operation_id).await?;

    // Verify operation is in 'completed' status (can only undo completed ops)
    if operation.status != "completed" {
        return Err(MaintenanceError::CannotUndo {
            reason: format!("Operation is in '{}' status, not 'completed'", operation.status),
        });
    }

    let undo_data: Vec<UndoEntry> = serde_json::from_value(operation.undo_data)?;
    let mut tx = pool.begin().await?;
    let mut restored = 0;

    for entry in &undo_data {
        // Restore the old value for each affected record
        let query = format!(
            "UPDATE {} SET {} = $1 WHERE id = $2",
            get_table_for_entity_type(&entry.entity_type),
            entry.field
        );
        sqlx::query(&query)
            .bind(&entry.old_value)
            .bind(entry.entity_id)
            .execute(&mut *tx)
            .await?;
        restored += 1;
    }

    // Update operation status to 'undone'
    update_operation_status(&mut tx, operation_id, "undone").await?;

    tx.commit().await?;
    release_maintenance_lock(pool).await?;

    Ok(UndoResult {
        operation_id,
        records_restored: restored,
    })
}
```

**Acceptance Criteria:**
- [ ] Only completed operations can be undone
- [ ] Restores all affected records to their exact previous values
- [ ] All restores in a single transaction
- [ ] Updates operation status to 'undone'
- [ ] Undo is one-level (can undo the most recent completed operation)

---

## Phase 5: Common Utilities

### Task 5.1: Advisory Lock Manager
**File:** `src/maintenance/lock.rs`

Prevent concurrent bulk operations.

```rust
const MAINTENANCE_LOCK_ID: i64 = 12345; // unique advisory lock ID

pub async fn acquire_maintenance_lock(pool: &PgPool) -> Result<(), MaintenanceError> {
    let acquired: (bool,) = sqlx::query_as(
        "SELECT pg_try_advisory_lock($1)"
    )
    .bind(MAINTENANCE_LOCK_ID)
    .fetch_one(pool)
    .await?;

    if !acquired.0 {
        return Err(MaintenanceError::ConcurrentOperation);
    }
    Ok(())
}

pub async fn release_maintenance_lock(pool: &PgPool) -> Result<(), MaintenanceError> {
    sqlx::query("SELECT pg_advisory_unlock($1)")
        .bind(MAINTENANCE_LOCK_ID)
        .execute(pool)
        .await?;
    Ok(())
}
```

**Acceptance Criteria:**
- [ ] Uses PostgreSQL advisory lock for non-blocking attempt
- [ ] Returns clear error if another operation is running
- [ ] Lock is released after operation completes or fails
- [ ] Lock ID is unique to maintenance operations

### Task 5.2: Searchable/Path Field Registry
**File:** `src/maintenance/field_registry.rs`

Registry of which entity tables and columns are searchable or contain file paths.

```rust
pub fn get_searchable_fields(entity_type: Option<&str>) -> Vec<(&str, &str, &str)> {
    // (entity_type, table_name, column_name)
    let mut fields = vec![
        ("character", "characters", "name"),
        ("character", "characters", "description"),
        ("scene_type", "scene_types", "name"),
        ("scene_type", "scene_types", "prompt_template"),
        // ... more fields
    ];

    if let Some(et) = entity_type {
        fields.retain(|(t, _, _)| *t == et);
    }
    fields
}

pub fn get_path_fields(entity_type: Option<&str>) -> Vec<(&str, &str, &str)> {
    let mut fields = vec![
        ("source_image", "source_images", "file_path"),
        ("derived_image", "derived_images", "file_path"),
        ("segment", "segments", "output_video_path"),
        ("segment", "segments", "seed_frame_path"),
        ("segment", "segments", "last_frame_path"),
        ("asset", "assets", "file_path"),
        // ... more fields
    ];

    if let Some(et) = entity_type {
        fields.retain(|(t, _, _)| *t == et);
    }
    fields
}
```

**Acceptance Criteria:**
- [ ] All text fields are registered for find/replace
- [ ] All file path fields are registered for re-pathing
- [ ] Filterable by entity type
- [ ] New fields are easily added as the schema grows

---

## Phase 6: API Endpoints

### Task 6.1: Find/Replace Endpoints
**File:** `src/routes/maintenance.rs`

```rust
pub async fn preview_find_replace(
    State(pool): State<PgPool>,
    Json(body): Json<FindReplaceRequest>,
) -> Result<impl IntoResponse, AppError> {
    let preview = crate::maintenance::find_replace::preview_find_replace(&pool, &body).await?;
    Ok(Json(preview))
}

pub async fn execute_find_replace(
    State(pool): State<PgPool>,
    Path(operation_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    let result = crate::maintenance::find_replace::execute_find_replace(&pool, operation_id).await?;
    Ok(Json(result))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/admin/maintenance/find-replace/preview` returns preview
- [ ] `POST /api/admin/maintenance/find-replace/:id/execute` commits the operation
- [ ] Requires admin authorization

### Task 6.2: Re-Pathing Endpoints
**File:** `src/routes/maintenance.rs`

**Acceptance Criteria:**
- [ ] `POST /api/admin/maintenance/repath/preview` returns re-path preview
- [ ] `POST /api/admin/maintenance/repath/:id/execute` commits the re-pathing
- [ ] Preview includes broken reference count when validation enabled

### Task 6.3: Undo Endpoint
**File:** `src/routes/maintenance.rs`

**Acceptance Criteria:**
- [ ] `POST /api/admin/maintenance/:id/undo` undoes a completed operation
- [ ] Returns count of restored records
- [ ] Returns error if operation cannot be undone

### Task 6.4: Operations History Endpoint
**File:** `src/routes/maintenance.rs`

**Acceptance Criteria:**
- [ ] `GET /api/admin/maintenance/history` lists past bulk operations
- [ ] Filterable by type, status, date range
- [ ] Shows affected count and status per operation

### Task 6.5: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All maintenance endpoints registered under `/api/admin/maintenance/`
- [ ] Routes use correct HTTP methods

---

## Phase 7: Frontend — Maintenance UI

### Task 7.1: Find/Replace Panel
**File:** `frontend/src/components/maintenance/FindReplace.tsx`

Familiar find/replace interface with preview.

```typescript
export const FindReplace: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [preview, setPreview] = useState<FindReplacePreview | null>(null);

  const handlePreview = async () => {
    const res = await fetch('/api/admin/maintenance/find-replace/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search_term: searchTerm, replace_with: replaceWith, use_regex: useRegex, case_sensitive: caseSensitive }),
    });
    setPreview(await res.json());
  };

  return (
    <div className="find-replace">
      <input placeholder="Find..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      <input placeholder="Replace with..." value={replaceWith} onChange={e => setReplaceWith(e.target.value)} />
      <label><input type="checkbox" checked={useRegex} onChange={e => setUseRegex(e.target.checked)} /> Regex</label>
      <label><input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} /> Case sensitive</label>
      <button onClick={handlePreview}>Preview</button>
      {preview && <FindReplacePreviewView preview={preview} />}
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] Search and replace input fields
- [ ] Regex and case-sensitive toggles
- [ ] Preview button shows affected records
- [ ] Color-coded diff (old value strikethrough, new value highlighted)
- [ ] Execute button with confirmation dialog

### Task 7.2: Re-Pathing Panel
**File:** `frontend/src/components/maintenance/RePathPanel.tsx`

**Acceptance Criteria:**
- [ ] Old prefix and new prefix input fields
- [ ] "Validate paths" checkbox
- [ ] Preview shows affected path references
- [ ] Broken references highlighted in red
- [ ] Execute button with confirmation

### Task 7.3: Operations History
**File:** `frontend/src/components/maintenance/OperationsHistory.tsx`

**Acceptance Criteria:**
- [ ] Table of past operations: type, status, affected count, date
- [ ] "Undo" button for completed operations
- [ ] Expandable details showing parameters and sample changes

---

## Phase 8: Testing

### Task 8.1: Find/Replace Tests
**File:** `tests/maintenance_find_replace_tests.rs`

**Acceptance Criteria:**
- [ ] Exact match find works correctly
- [ ] Regex find works with capture groups
- [ ] Case-insensitive search matches correctly
- [ ] Preview returns all affected records
- [ ] Execute modifies all matched records
- [ ] Undo restores original values exactly

### Task 8.2: Re-Pathing Tests
**File:** `tests/maintenance_repath_tests.rs`

**Acceptance Criteria:**
- [ ] Prefix substitution works correctly
- [ ] Only path fields are modified (non-path fields untouched)
- [ ] Path validation detects missing files
- [ ] Undo restores original paths

### Task 8.3: Concurrency Tests
**File:** `tests/maintenance_concurrency_tests.rs`

**Acceptance Criteria:**
- [ ] Advisory lock prevents concurrent operations
- [ ] Second operation returns clear error message
- [ ] Lock is released after operation completes
- [ ] Lock is released after operation fails

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_bulk_operations.sql` | Operation tracking table |
| `src/maintenance/mod.rs` | Module root |
| `src/maintenance/find_replace.rs` | Find/replace engine |
| `src/maintenance/repath.rs` | Bulk re-pathing engine |
| `src/maintenance/undo.rs` | Undo executor |
| `src/maintenance/lock.rs` | Advisory lock manager |
| `src/maintenance/field_registry.rs` | Searchable/path field registry |
| `src/routes/maintenance.rs` | API endpoints |
| `frontend/src/components/maintenance/FindReplace.tsx` | Find/replace UI |
| `frontend/src/components/maintenance/RePathPanel.tsx` | Re-pathing UI |
| `frontend/src/components/maintenance/OperationsHistory.tsx` | History view |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId`, migration framework, `trigger_set_updated_at()`
- PRD-001: Entity tables being searched/modified
- PRD-014: Validation layer for post-operation integrity checks

### New Infrastructure Needed
- `regex` crate for regex-based search
- PostgreSQL advisory locks (built-in, no extensions needed)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Task 1.1)
2. Phase 2: Find/Replace Engine (Tasks 2.1-2.3)
3. Phase 3: Re-Pathing Engine (Tasks 3.1-3.3)
4. Phase 4: Undo Service (Task 4.1)
5. Phase 5: Common Utilities (Tasks 5.1-5.2)
6. Phase 6: API Endpoints (Tasks 6.1-6.5)

**MVP Success Criteria:**
- Bulk operations process 10,000 records in <30 seconds
- Preview accurately shows 100% of affected records
- Undo restores all records to exact previous state
- Zero data corruption from bulk operations

### Post-MVP Enhancements
1. Phase 7: Frontend UI (Tasks 7.1-7.3)
2. Phase 8: Testing (Tasks 8.1-8.3)
3. Scheduled maintenance (PRD Phase 2)

---

## Notes

1. **Dynamic SQL safety:** The field registry approach uses known table/column names from a static list, avoiding SQL injection. Never accept table or column names from user input.
2. **Large operations:** For operations affecting >10,000 records, consider chunked execution within the transaction to avoid long-running locks and memory pressure.
3. **Undo limitations:** Undo is one-level only. If another operation runs after the first, the first operation's undo data is still available but may conflict with the second operation's changes. The UI should warn about this.
4. **Integration with PRD-088:** Batch metadata operations (PRD-088) can reuse the bulk operations infrastructure (table, undo, lock) for its own batch updates.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

# Task List: Intelligent & Deferred Disk Reclamation

**PRD Reference:** `design/prds/015-prd-intelligent-deferred-disk-reclamation.md`
**Scope:** Build a disk reclamation system with protected asset rules, configurable cleanup policies, deferred deletion with grace periods, trash/restore functionality, and an admin reclamation dashboard.

## Overview

This PRD creates a cleanup subsystem that automatically identifies reclaimable files (failed renders, cancelled job artifacts, old intermediate files) while permanently protecting essential assets (source images, approved outputs, final deliverables). Files are not deleted immediately — they enter a "trash" state with a configurable grace period, during which they can be restored. The system provides admin visibility into reclaimable space and a preview of cleanup effects before execution.

### What Already Exists
- PRD-000: Database conventions, migration framework
- PRD-001: Core entity tables defining asset relationships (characters, scenes, segments)

### What We're Building
1. Asset protection rules engine (permanent protection for source images, approved outputs)
2. Reclamation policy tables and configurable rules (age-based, status-based)
3. Trash queue with deferred deletion and grace periods
4. Reclamation preview service (what-if analysis)
5. Cleanup execution engine with filesystem operations
6. Admin dashboard for reclamation visibility and control
7. Restore-from-trash capability

### Key Design Decisions
1. **Protection is absolute** — Protected assets cannot be deleted by any policy. Protection is checked before every deletion.
2. **Most permissive policy wins** — When multiple policies apply to a file, the one that keeps the file longest takes precedence. This errs on the side of preservation.
3. **Deferred by default** — All policy-driven deletions go through the trash queue with a grace period. Only explicit admin "force delete" bypasses this.
4. **File size tracking** — Every file in the system has its size recorded for accurate space reclamation estimates.

---

## Phase 1: Database Schema

### Task 1.1: Asset Protection Rules Table
**File:** `migrations/{timestamp}_create_asset_protection_rules.sql`

Define which asset categories are permanently protected from reclamation.

```sql
CREATE TABLE asset_protection_rules (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    entity_type TEXT NOT NULL,           -- 'source_image', 'derived_image', 'segment', 'scene', etc.
    condition_field TEXT NOT NULL,        -- DB column to check (e.g., 'status_id', 'is_approved')
    condition_operator TEXT NOT NULL,     -- 'eq', 'neq', 'in', 'is_null', 'is_not_null'
    condition_value TEXT NOT NULL,        -- value to compare against (e.g., status name or boolean)
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON asset_protection_rules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Seed default protection rules
INSERT INTO asset_protection_rules (name, description, entity_type, condition_field, condition_operator, condition_value) VALUES
    ('protect_source_images', 'Source images (Seed A) are permanently protected', 'source_image', 'id', 'is_not_null', 'true'),
    ('protect_approved_variants', 'Approved image variants are permanently protected', 'image_variant', 'status', 'eq', 'approved'),
    ('protect_delivered_scenes', 'Delivered scene outputs are permanently protected', 'scene', 'status', 'eq', 'delivered'),
    ('protect_approved_segments', 'Approved segments are permanently protected', 'segment', 'status', 'eq', 'approved');
```

**Acceptance Criteria:**
- [ ] Protection rules table created with `BIGSERIAL PRIMARY KEY`
- [ ] Default rules protect: source images, approved variants, delivered scenes, approved segments
- [ ] Rules use entity_type + condition to determine protection
- [ ] `is_active` allows disabling rules without deleting them
- [ ] Migration applies cleanly

### Task 1.2: Reclamation Policies Table
**File:** `migrations/{timestamp}_create_reclamation_policies.sql`

Configurable rules for when files become eligible for cleanup.

```sql
CREATE TABLE reclamation_policy_scopes (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON reclamation_policy_scopes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO reclamation_policy_scopes (name, description) VALUES
    ('studio', 'Applies to all projects in the studio'),
    ('project', 'Applies to a specific project');

CREATE TABLE reclamation_policies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    scope_id BIGINT NOT NULL REFERENCES reclamation_policy_scopes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    project_id BIGINT NULL,              -- NULL for studio-wide, set for project-specific
    entity_type TEXT NOT NULL,            -- 'segment', 'scene', 'derived_image', etc.
    condition_field TEXT NOT NULL,         -- e.g., 'status', 'job_status'
    condition_operator TEXT NOT NULL,      -- 'eq', 'in'
    condition_value TEXT NOT NULL,         -- e.g., 'failed', 'cancelled'
    age_threshold_days INTEGER NOT NULL,  -- files older than N days are eligible
    grace_period_days INTEGER NOT NULL DEFAULT 7,
    is_active BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 0,  -- higher = more important
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reclamation_policies_scope_id ON reclamation_policies(scope_id);
CREATE INDEX idx_reclamation_policies_project_id ON reclamation_policies(project_id);
CREATE INDEX idx_reclamation_policies_entity_type ON reclamation_policies(entity_type);
CREATE INDEX idx_reclamation_policies_active ON reclamation_policies(is_active) WHERE is_active = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON reclamation_policies
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Seed default policies
INSERT INTO reclamation_policies (name, description, scope_id, entity_type, condition_field, condition_operator, condition_value, age_threshold_days, grace_period_days) VALUES
    ('failed_outputs_30d', 'Delete failed generation outputs after 30 days',
     (SELECT id FROM reclamation_policy_scopes WHERE name = 'studio'),
     'segment', 'status', 'eq', 'failed', 30, 7),
    ('cancelled_artifacts_7d', 'Delete cancelled job artifacts after 7 days',
     (SELECT id FROM reclamation_policy_scopes WHERE name = 'studio'),
     'segment', 'status', 'eq', 'cancelled', 7, 7);
```

**Acceptance Criteria:**
- [ ] Policies configurable at studio and project level
- [ ] Default policies seeded: failed outputs after 30 days, cancelled artifacts after 7 days
- [ ] `age_threshold_days` determines eligibility window
- [ ] `grace_period_days` controls deferred deletion window
- [ ] All FK columns indexed
- [ ] Migration applies cleanly

### Task 1.3: Trash Queue Table
**File:** `migrations/{timestamp}_create_trash_queue.sql`

Track files marked for deferred deletion.

```sql
CREATE TABLE trash_queue_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON trash_queue_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO trash_queue_statuses (name, description) VALUES
    ('pending', 'Marked for deletion, within grace period'),
    ('expired', 'Grace period expired, eligible for permanent deletion'),
    ('deleted', 'File permanently deleted from disk'),
    ('restored', 'Restored from trash by admin');

CREATE TABLE trash_queue (
    id BIGSERIAL PRIMARY KEY,
    status_id BIGINT NOT NULL REFERENCES trash_queue_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    policy_id BIGINT NULL REFERENCES reclamation_policies(id) ON DELETE SET NULL ON UPDATE CASCADE,
    marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delete_after TIMESTAMPTZ NOT NULL,   -- marked_at + grace_period
    deleted_at TIMESTAMPTZ NULL,
    restored_at TIMESTAMPTZ NULL,
    restored_by BIGINT NULL,             -- user who restored (FK to users when available)
    project_id BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trash_queue_status_id ON trash_queue(status_id);
CREATE INDEX idx_trash_queue_policy_id ON trash_queue(policy_id);
CREATE INDEX idx_trash_queue_entity ON trash_queue(entity_type, entity_id);
CREATE INDEX idx_trash_queue_delete_after ON trash_queue(delete_after)
    WHERE status_id = (SELECT id FROM trash_queue_statuses WHERE name = 'pending');
CREATE INDEX idx_trash_queue_project_id ON trash_queue(project_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON trash_queue
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Trash queue tracks file_path, file_size, marked_at, delete_after
- [ ] Status lifecycle: pending -> expired -> deleted (or pending -> restored)
- [ ] `delete_after` is computed as `marked_at + grace_period`
- [ ] Partial index on `delete_after` for efficient expired-item queries
- [ ] `project_id` enables per-project reclamation reporting
- [ ] Migration applies cleanly

### Task 1.4: Reclamation Run History Table
**File:** `migrations/{timestamp}_create_reclamation_runs.sql`

Track cleanup execution history.

```sql
CREATE TABLE reclamation_runs (
    id BIGSERIAL PRIMARY KEY,
    run_type TEXT NOT NULL,              -- 'policy_scan', 'manual_cleanup', 'trash_purge'
    policy_id BIGINT NULL REFERENCES reclamation_policies(id) ON DELETE SET NULL ON UPDATE CASCADE,
    project_id BIGINT NULL,
    files_scanned INTEGER NOT NULL DEFAULT 0,
    files_marked INTEGER NOT NULL DEFAULT 0,
    files_deleted INTEGER NOT NULL DEFAULT 0,
    bytes_reclaimed BIGINT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reclamation_runs_policy_id ON reclamation_runs(policy_id);
CREATE INDEX idx_reclamation_runs_project_id ON reclamation_runs(project_id);
CREATE INDEX idx_reclamation_runs_started_at ON reclamation_runs(started_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON reclamation_runs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Tracks files scanned, marked, deleted, and bytes reclaimed per run
- [ ] `run_type` distinguishes policy scans from manual cleanups from trash purges
- [ ] `started_at` / `completed_at` track run duration
- [ ] Migration applies cleanly

---

## Phase 2: Protection & Policy Engine

### Task 2.1: Protection Checker
**File:** `src/reclamation/protection.rs`

Evaluate whether an asset is protected from reclamation.

```rust
use sqlx::PgPool;
use crate::types::DbId;

pub async fn is_asset_protected(
    pool: &PgPool,
    entity_type: &str,
    entity_id: DbId,
) -> Result<bool, sqlx::Error> {
    // Load active protection rules for this entity type
    let rules = sqlx::query!(
        r#"
        SELECT condition_field, condition_operator, condition_value
        FROM asset_protection_rules
        WHERE entity_type = $1 AND is_active = true
        "#,
        entity_type
    )
    .fetch_all(pool)
    .await?;

    // Evaluate each rule against the entity's current state
    for rule in &rules {
        if evaluate_protection_rule(pool, entity_type, entity_id, rule).await? {
            return Ok(true); // Protected by this rule
        }
    }

    Ok(false)
}
```

**Acceptance Criteria:**
- [ ] Returns `true` if any active protection rule matches the asset
- [ ] Source images are always protected
- [ ] Approved variants are always protected
- [ ] Delivered scenes are always protected
- [ ] Protection check is called before every deletion operation

### Task 2.2: Policy Evaluator
**File:** `src/reclamation/policy.rs`

Evaluate reclamation policies to find eligible files.

```rust
use sqlx::PgPool;
use crate::types::DbId;

#[derive(Debug)]
pub struct ReclaimableFile {
    pub entity_type: String,
    pub entity_id: DbId,
    pub file_path: String,
    pub file_size_bytes: i64,
    pub age_days: i32,
    pub matched_policy_id: DbId,
    pub grace_period_days: i32,
}

pub async fn find_reclaimable_files(
    pool: &PgPool,
    project_id: Option<DbId>,
) -> Result<Vec<ReclaimableFile>, ReclamationError> {
    // Load active policies (filtered by project if specified)
    // For each policy, query entities matching the condition and age threshold
    // Filter out protected assets
    // Return list sorted by file size (largest first)
    todo!()
}
```

**Acceptance Criteria:**
- [ ] Evaluates all active policies for the given scope
- [ ] Filters by age threshold (files older than N days)
- [ ] Excludes protected assets (calls protection checker)
- [ ] When multiple policies match, most permissive (longest retention) wins
- [ ] Results sorted by file size descending for impact visibility

### Task 2.3: Reclamation Preview Service
**File:** `src/reclamation/preview.rs`

Generate a preview of what a cleanup run would affect without executing.

```rust
#[derive(Debug, Serialize)]
pub struct ReclamationPreview {
    pub total_files: usize,
    pub total_bytes: i64,
    pub per_project: Vec<ProjectReclamation>,
    pub per_policy: Vec<PolicyReclamation>,
    pub files: Vec<ReclaimableFile>,
}

#[derive(Debug, Serialize)]
pub struct ProjectReclamation {
    pub project_id: DbId,
    pub project_name: String,
    pub file_count: usize,
    pub bytes: i64,
}

pub async fn preview_reclamation(
    pool: &PgPool,
    project_id: Option<DbId>,
) -> Result<ReclamationPreview, ReclamationError> {
    let files = find_reclaimable_files(pool, project_id).await?;

    let total_bytes = files.iter().map(|f| f.file_size_bytes).sum();

    Ok(ReclamationPreview {
        total_files: files.len(),
        total_bytes,
        per_project: aggregate_by_project(&files),
        per_policy: aggregate_by_policy(&files),
        files,
    })
}
```

**Acceptance Criteria:**
- [ ] Shows total reclaimable space (files and bytes)
- [ ] Breaks down by project and by policy
- [ ] Individual file list sorted by size (largest first)
- [ ] Does not modify any data or files
- [ ] Preview matches actual cleanup within 5% (per success metric)

---

## Phase 3: Trash Queue & Deferred Deletion

### Task 3.1: Trash Queue Service
**File:** `src/reclamation/trash.rs`

Mark files for deferred deletion with a grace period.

```rust
pub async fn mark_for_deletion(
    pool: &PgPool,
    entity_type: &str,
    entity_id: DbId,
    file_path: &str,
    file_size_bytes: i64,
    policy_id: Option<DbId>,
    grace_period_days: i32,
    project_id: Option<DbId>,
) -> Result<DbId, ReclamationError> {
    // Verify asset is not protected
    if is_asset_protected(pool, entity_type, entity_id).await? {
        return Err(ReclamationError::AssetProtected { entity_type: entity_type.to_string(), entity_id });
    }

    let delete_after = chrono::Utc::now() + chrono::Duration::days(grace_period_days as i64);

    let id = sqlx::query_scalar!(
        r#"
        INSERT INTO trash_queue (status_id, entity_type, entity_id, file_path, file_size_bytes,
                                  policy_id, delete_after, project_id)
        VALUES ((SELECT id FROM trash_queue_statuses WHERE name = 'pending'),
                $1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        "#,
        entity_type, entity_id, file_path, file_size_bytes,
        policy_id, delete_after, project_id
    )
    .fetch_one(pool)
    .await?;

    Ok(id)
}
```

**Acceptance Criteria:**
- [ ] Checks protection before marking (refuses protected assets)
- [ ] Computes `delete_after` from current time + grace period
- [ ] Records file path and size for reporting
- [ ] Links to the policy that triggered the marking (if applicable)
- [ ] Returns trash queue entry ID

### Task 3.2: Restore from Trash
**File:** `src/reclamation/trash.rs`

Restore a file from the trash queue before the grace period expires.

```rust
pub async fn restore_from_trash(
    pool: &PgPool,
    trash_id: DbId,
    restored_by: Option<DbId>,
) -> Result<(), ReclamationError> {
    let entry = sqlx::query!(
        "SELECT status_id, file_path FROM trash_queue WHERE id = $1",
        trash_id
    )
    .fetch_optional(pool)
    .await?
    .ok_or(ReclamationError::NotFound)?;

    // Verify it's still in 'pending' status
    let pending_status_id = get_status_id(pool, "trash_queue_statuses", "pending").await?;
    if entry.status_id != pending_status_id {
        return Err(ReclamationError::CannotRestore {
            reason: "File is no longer in pending state".to_string(),
        });
    }

    sqlx::query!(
        r#"
        UPDATE trash_queue
        SET status_id = (SELECT id FROM trash_queue_statuses WHERE name = 'restored'),
            restored_at = NOW(),
            restored_by = $2
        WHERE id = $1
        "#,
        trash_id, restored_by
    )
    .execute(pool)
    .await?;

    Ok(())
}
```

**Acceptance Criteria:**
- [ ] Only pending (within grace period) items can be restored
- [ ] Updates status to 'restored' with timestamp and user
- [ ] Returns error if item is already deleted or restored
- [ ] File remains on disk (no filesystem operation needed for restore)

### Task 3.3: Trash Purge Executor
**File:** `src/reclamation/executor.rs`

Permanently delete files whose grace period has expired.

```rust
pub async fn purge_expired_trash(
    pool: &PgPool,
) -> Result<PurgeReport, ReclamationError> {
    let mut report = PurgeReport::default();

    // Find all expired items
    let expired = sqlx::query!(
        r#"
        SELECT tq.id, tq.file_path, tq.file_size_bytes
        FROM trash_queue tq
        JOIN trash_queue_statuses tqs ON tqs.id = tq.status_id
        WHERE tqs.name = 'pending'
          AND tq.delete_after < NOW()
        "#
    )
    .fetch_all(pool)
    .await?;

    for item in &expired {
        // Delete file from disk
        match tokio::fs::remove_file(&item.file_path).await {
            Ok(()) => {
                // Update status to 'deleted'
                sqlx::query!(
                    r#"
                    UPDATE trash_queue
                    SET status_id = (SELECT id FROM trash_queue_statuses WHERE name = 'deleted'),
                        deleted_at = NOW()
                    WHERE id = $1
                    "#,
                    item.id
                )
                .execute(pool)
                .await?;
                report.files_deleted += 1;
                report.bytes_reclaimed += item.file_size_bytes;
            }
            Err(e) => {
                tracing::error!("Failed to delete file {}: {}", item.file_path, e);
                report.errors += 1;
            }
        }
    }

    Ok(report)
}
```

**Acceptance Criteria:**
- [ ] Only deletes files past their grace period (`delete_after < NOW()`)
- [ ] Deletes the actual file from disk
- [ ] Updates trash_queue status to 'deleted' with timestamp
- [ ] Handles missing files gracefully (already deleted externally)
- [ ] Returns report with files deleted and bytes reclaimed

---

## Phase 4: Cleanup Orchestrator

### Task 4.1: Policy Scanner
**File:** `src/reclamation/scanner.rs`

Scan the system for reclaimable files based on active policies and mark them for trash.

```rust
pub async fn run_policy_scan(
    pool: &PgPool,
    project_id: Option<DbId>,
) -> Result<ScanReport, ReclamationError> {
    // Record run start
    let run_id = create_reclamation_run(pool, "policy_scan", project_id).await?;
    let mut report = ScanReport::default();

    // Find reclaimable files
    let files = find_reclaimable_files(pool, project_id).await?;
    report.files_scanned = files.len();

    // Mark each for trash
    for file in &files {
        match mark_for_deletion(
            pool, &file.entity_type, file.entity_id, &file.file_path,
            file.file_size_bytes, Some(file.matched_policy_id), file.grace_period_days, project_id,
        ).await {
            Ok(_) => report.files_marked += 1,
            Err(e) => {
                tracing::warn!("Failed to mark file for deletion: {}", e);
                report.errors += 1;
            }
        }
    }

    // Complete run record
    complete_reclamation_run(pool, run_id, &report).await?;
    Ok(report)
}
```

**Acceptance Criteria:**
- [ ] Scans all active policies for eligible files
- [ ] Marks eligible files for trash with policy-defined grace period
- [ ] Skips files already in the trash queue
- [ ] Records run history in `reclamation_runs` table
- [ ] Returns scan report with counts

### Task 4.2: Full Cleanup Orchestrator
**File:** `src/reclamation/orchestrator.rs`

High-level orchestrator that runs the full cleanup cycle: scan + purge.

```rust
pub async fn run_full_cleanup(
    pool: &PgPool,
    project_id: Option<DbId>,
) -> Result<CleanupReport, ReclamationError> {
    // Step 1: Scan for new reclaimable files and mark them
    let scan_report = run_policy_scan(pool, project_id).await?;

    // Step 2: Purge expired trash
    let purge_report = purge_expired_trash(pool).await?;

    Ok(CleanupReport {
        scan: scan_report,
        purge: purge_report,
    })
}
```

**Acceptance Criteria:**
- [ ] Runs policy scan first (mark new eligible files)
- [ ] Runs trash purge second (delete expired files)
- [ ] Returns combined report
- [ ] Can be triggered manually or by scheduler

---

## Phase 5: API Endpoints

### Task 5.1: Reclamation Preview Endpoint
**File:** `src/routes/reclamation.rs`

```rust
pub async fn preview_reclamation(
    State(pool): State<PgPool>,
    Query(params): Query<ReclamationQueryParams>,
) -> Result<impl IntoResponse, AppError> {
    let preview = crate::reclamation::preview::preview_reclamation(
        &pool, params.project_id,
    ).await?;
    Ok(Json(preview))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/admin/reclamation/preview` returns reclaimable files summary
- [ ] Optional `project_id` query param to filter by project
- [ ] Response includes total files, total bytes, per-project breakdown
- [ ] File list sorted by size descending

### Task 5.2: Cleanup Execution Endpoint
**File:** `src/routes/reclamation.rs`

```rust
pub async fn run_cleanup(
    State(pool): State<PgPool>,
    Json(body): Json<CleanupRequest>,
) -> Result<impl IntoResponse, AppError> {
    let report = crate::reclamation::orchestrator::run_full_cleanup(
        &pool, body.project_id,
    ).await?;
    Ok(Json(report))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/admin/reclamation/run` triggers cleanup
- [ ] Returns cleanup report with files marked and bytes reclaimed
- [ ] Requires admin authorization

### Task 5.3: Trash Restore Endpoint
**File:** `src/routes/reclamation.rs`

```rust
pub async fn restore_trash_item(
    State(pool): State<PgPool>,
    Path(trash_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    crate::reclamation::trash::restore_from_trash(&pool, trash_id, None).await?;
    Ok(Json(serde_json::json!({ "status": "restored", "id": trash_id })))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/admin/trash/:id/restore` restores a file from trash
- [ ] Returns 404 if trash entry not found
- [ ] Returns error if file is already deleted or restored
- [ ] Records who restored the file

### Task 5.4: Trash Queue List Endpoint
**File:** `src/routes/reclamation.rs`

```rust
pub async fn list_trash_queue(
    State(pool): State<PgPool>,
    Query(params): Query<TrashQueueParams>,
) -> Result<impl IntoResponse, AppError> {
    // List pending trash items, optionally filtered by project
    todo!()
}
```

**Acceptance Criteria:**
- [ ] `GET /api/admin/trash` lists pending trash items
- [ ] Filterable by project, entity_type, status
- [ ] Includes file size, marked_at, delete_after for each item
- [ ] Paginated response

### Task 5.5: Reclamation History Endpoint
**File:** `src/routes/reclamation.rs`

**Acceptance Criteria:**
- [ ] `GET /api/admin/reclamation/history` lists past cleanup runs
- [ ] Shows files scanned, marked, deleted, bytes reclaimed per run
- [ ] Filterable by date range and project

### Task 5.6: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All reclamation endpoints registered under `/api/admin/` prefix
- [ ] Routes use correct HTTP methods

---

## Phase 6: Frontend — Reclamation Dashboard

### Task 6.1: Reclamation Overview Panel
**File:** `frontend/src/components/reclamation/ReclamationDashboard.tsx`

Admin dashboard showing reclaimable space and cleanup controls.

```typescript
export const ReclamationDashboard: React.FC = () => {
  const [preview, setPreview] = useState<ReclamationPreview | null>(null);

  useEffect(() => {
    fetch('/api/admin/reclamation/preview')
      .then(res => res.json())
      .then(setPreview);
  }, []);

  return (
    <div className="reclamation-dashboard">
      <h2>Disk Reclamation</h2>
      {preview && (
        <>
          <div className="summary">
            <span>Reclaimable: {formatBytes(preview.total_bytes)} across {preview.total_files} files</span>
          </div>
          <div className="per-project">
            {preview.per_project.map(p => (
              <div key={p.project_id}>
                {p.project_name}: {formatBytes(p.bytes)} ({p.file_count} files)
              </div>
            ))}
          </div>
        </>
      )}
      <button onClick={handleRunCleanup}>Run Cleanup</button>
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] Shows total reclaimable space in human-readable format
- [ ] Per-project breakdown of reclaimable space
- [ ] "Run Cleanup" button triggers cleanup with confirmation dialog
- [ ] Refreshes after cleanup completes

### Task 6.2: Trash Queue Browser
**File:** `frontend/src/components/reclamation/TrashBrowser.tsx`

Browse and manage files in the trash queue.

**Acceptance Criteria:**
- [ ] Lists pending trash items with file path, size, delete_after date
- [ ] "Restore" button per item to recover from trash
- [ ] Visual countdown showing time until permanent deletion
- [ ] Filterable by project and entity type

### Task 6.3: Cleanup History View
**File:** `frontend/src/components/reclamation/CleanupHistory.tsx`

View history of past cleanup runs.

**Acceptance Criteria:**
- [ ] Table of past runs: date, type, files deleted, bytes reclaimed
- [ ] Expandable details per run
- [ ] Chart showing space recovered over time

### Task 6.4: Protected Asset Indicator
**File:** `frontend/src/components/reclamation/ProtectedBadge.tsx`

Visual indicator showing an asset's protection status.

```typescript
export const ProtectedBadge: React.FC<{ isProtected: boolean }> = ({ isProtected }) => (
  isProtected ? (
    <span className="protected-badge" title="This asset is permanently protected from cleanup">
      Protected
    </span>
  ) : null
);
```

**Acceptance Criteria:**
- [ ] Shows lock/shield icon for protected assets
- [ ] Tooltip explains protection reason
- [ ] Visible in file browser and asset detail views

---

## Phase 7: Testing

### Task 7.1: Protection Rule Tests
**File:** `tests/reclamation_protection_tests.rs`

**Acceptance Criteria:**
- [ ] Source images always return protected = true
- [ ] Approved variants return protected = true
- [ ] Failed segments return protected = false
- [ ] Disabled rules are not evaluated

### Task 7.2: Policy Evaluation Tests
**File:** `tests/reclamation_policy_tests.rs`

**Acceptance Criteria:**
- [ ] Files older than threshold are identified as reclaimable
- [ ] Files younger than threshold are not reclaimable
- [ ] Protected assets are excluded even if they match policy conditions
- [ ] Most permissive policy wins when multiple apply
- [ ] Project-specific policies are evaluated correctly

### Task 7.3: Trash Queue Tests
**File:** `tests/reclamation_trash_tests.rs`

**Acceptance Criteria:**
- [ ] Mark for deletion creates a pending trash entry with correct delete_after
- [ ] Restore changes status to 'restored' and records timestamp
- [ ] Purge only deletes items past grace period
- [ ] Protected assets cannot be marked for deletion
- [ ] Already-deleted items cannot be restored

### Task 7.4: Integration Tests
**File:** `tests/reclamation_integration_tests.rs`

**Acceptance Criteria:**
- [ ] Full cycle: create entity -> fail -> policy scan -> mark -> grace period -> purge
- [ ] Full cycle: mark -> restore before expiry
- [ ] Reclamation preview matches actual cleanup results
- [ ] Run history records are created correctly

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_asset_protection_rules.sql` | Protection rules table |
| `migrations/{timestamp}_create_reclamation_policies.sql` | Policy configuration table |
| `migrations/{timestamp}_create_trash_queue.sql` | Deferred deletion queue |
| `migrations/{timestamp}_create_reclamation_runs.sql` | Cleanup run history |
| `src/reclamation/mod.rs` | Module root |
| `src/reclamation/protection.rs` | Asset protection checker |
| `src/reclamation/policy.rs` | Policy evaluator |
| `src/reclamation/preview.rs` | Reclamation preview (what-if) |
| `src/reclamation/trash.rs` | Trash queue operations |
| `src/reclamation/executor.rs` | File deletion executor |
| `src/reclamation/scanner.rs` | Policy scan runner |
| `src/reclamation/orchestrator.rs` | Full cleanup orchestrator |
| `src/routes/reclamation.rs` | API endpoints |
| `frontend/src/components/reclamation/ReclamationDashboard.tsx` | Admin dashboard |
| `frontend/src/components/reclamation/TrashBrowser.tsx` | Trash queue browser |
| `frontend/src/components/reclamation/CleanupHistory.tsx` | Run history view |
| `frontend/src/components/reclamation/ProtectedBadge.tsx` | Protection indicator |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId`, migration framework, `trigger_set_updated_at()`
- PRD-001: Entity tables (characters, scenes, segments) for relationship-based protection

### New Infrastructure Needed
- `tokio::fs` for async filesystem operations
- `sha2` or similar for file integrity checks (optional)
- Scheduled task runner for automated cleanup (Post-MVP)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.4)
2. Phase 2: Protection & Policy Engine (Tasks 2.1-2.3)
3. Phase 3: Trash Queue & Deferred Deletion (Tasks 3.1-3.3)
4. Phase 4: Cleanup Orchestrator (Tasks 4.1-4.2)
5. Phase 5: API Endpoints (Tasks 5.1-5.6)

**MVP Success Criteria:**
- Zero accidental deletions of protected assets
- Policies correctly identify eligible files
- Grace period prevents premature deletion
- Admin can preview, run cleanup, and restore from trash

### Post-MVP Enhancements
1. Phase 6: Frontend Dashboard (Tasks 6.1-6.4)
2. Phase 7: Testing (Tasks 7.1-7.4)
3. Scheduled cleanup runs (PRD Phase 2)

---

## Notes

1. **File size tracking:** Accurate byte-level tracking depends on recording file sizes when files are created. This should be coordinated with the segment generation and image variant creation code.
2. **Multi-entity references:** If a file is referenced by multiple entities, all references must be in a reclaimable state before the file can be marked for trash. This requires join queries across entity tables.
3. **Filesystem vs. database consistency:** If a file is deleted externally (outside the system), the trash purge should handle "file not found" gracefully and still update the database status.
4. **Integration with PRD-019:** The disk space visualizer will query the trash_queue and reclamation_runs tables for reporting.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

# Task List: System Integrity & Repair Tools

**PRD Reference:** `design/prds/043-prd-system-integrity-repair-tools.md`
**Scope:** Build a model integrity scanner, missing ComfyUI node auto-installer, per-worker health reports, and one-click repair tools to maintain consistent, healthy runtime environments across all GPU workers.

## Overview

Setting up new workers and maintaining a healthy asset library requires automated verification and repair. This feature scans all registered workers for expected model files (checking checksums against the asset registry), detects missing ComfyUI custom nodes required by workflows, provides per-worker health reports with traffic-light status indicators, and offers one-click repair actions (sync models, install missing nodes, full verify-and-repair). All operations are orchestrated from the central Rust backend and executed on workers via the PRD-05 WebSocket bridge or SSH/API calls.

### What Already Exists
- PRD-05 ComfyUI WebSocket Bridge for communication with workers
- PRD-17 Asset Registry with model checksums
- PRD-46 Worker Pool for worker management and enumeration

### What We're Building
1. Database tables for integrity scans and model checksums
2. Rust scanner orchestration service
3. Missing node auto-installer integration
4. Per-worker health report generator
5. One-click repair engine (model sync, node install, full verify)
6. API endpoints for scan, report, and repair operations
7. React health report dashboard

### Key Design Decisions
1. **Central orchestration, worker execution** -- The backend orchestrates scans but actual file checks and installations happen on workers via remote commands.
2. **Checksums are the source of truth** -- Model integrity is verified by comparing file checksums on workers against known-good hashes in the asset registry (PRD-17).
3. **Version pinning for nodes** -- Custom nodes are installed at the exact version required by the workflow, not the latest version.
4. **Repair actions are audited** -- All repair operations are logged in the PRD-45 audit trail.

---

## Phase 1: Database Schema

### Task 1.1: Integrity Scans Table
**File:** `migrations/YYYYMMDDHHMMSS_create_integrity_scans.sql`

```sql
CREATE TABLE integrity_scans (
    id BIGSERIAL PRIMARY KEY,
    worker_id BIGINT NOT NULL REFERENCES workers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scan_type TEXT NOT NULL CHECK (scan_type IN ('models', 'nodes', 'full')),
    status_id BIGINT NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    results_json JSONB,
    models_found INTEGER,
    models_missing INTEGER,
    models_corrupted INTEGER,
    nodes_found INTEGER,
    nodes_missing INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    triggered_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integrity_scans_worker_id ON integrity_scans(worker_id);
CREATE INDEX idx_integrity_scans_status_id ON integrity_scans(status_id);
CREATE INDEX idx_integrity_scans_triggered_by ON integrity_scans(triggered_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON integrity_scans
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Tracks scans per worker with summary counts
- [ ] `results_json` contains detailed per-model/node results
- [ ] Uses `job_statuses` lookup for scan status
- [ ] All FK columns indexed

### Task 1.2: Model Checksums Table
**File:** `migrations/YYYYMMDDHHMMSS_create_model_checksums.sql`

```sql
CREATE TABLE model_checksums (
    id BIGSERIAL PRIMARY KEY,
    model_name TEXT NOT NULL,
    file_path TEXT NOT NULL,           -- expected relative path on workers
    expected_hash TEXT NOT NULL,        -- SHA-256 hash
    file_size_bytes BIGINT,
    model_type TEXT,                   -- 'checkpoint', 'lora', 'controlnet', 'vae', etc.
    source_url TEXT,                   -- download URL for sync
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_model_checksums_model_name ON model_checksums(model_name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON model_checksums
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] One row per expected model with known-good hash
- [ ] `source_url` enables automatic download during repair
- [ ] `model_type` categorizes models for filtering

---

## Phase 2: Rust Backend -- Scanner & Repair

### Task 2.1: Model Integrity Scanner
**File:** `src/services/model_scanner.rs`

```rust
pub struct ModelScanResult {
    pub worker_id: DbId,
    pub models_found: Vec<ModelStatus>,
    pub models_missing: Vec<String>,
    pub models_corrupted: Vec<ModelMismatch>,
    pub extra_models: Vec<String>,
}

pub struct ModelMismatch {
    pub model_name: String,
    pub expected_hash: String,
    pub actual_hash: String,
}
```

**Acceptance Criteria:**
- [ ] Scans all registered workers for expected model files
- [ ] Verifies checksums against `model_checksums` table
- [ ] Reports: missing models, corrupted (hash mismatch), extra/unknown models
- [ ] Scan completes in <60 seconds per worker
- [ ] Schedulable: on demand or configurable interval

### Task 2.2: Missing Node Detector
**File:** `src/services/node_detector.rs`

Detect missing ComfyUI custom nodes by comparing workflow requirements against installed nodes.

**Acceptance Criteria:**
- [ ] Queries each worker's ComfyUI instance for installed node list (via PRD-05 bridge)
- [ ] Compares against nodes required by all registered workflows
- [ ] Reports missing nodes with version requirements
- [ ] Identifies version mismatches (installed but wrong version)

### Task 2.3: Node Auto-Installer
**File:** `src/services/node_installer.rs`

Auto-install missing custom nodes on workers.

**Acceptance Criteria:**
- [ ] Installs from configured sources (git repos, pip packages)
- [ ] Version pinning: installs the exact version required
- [ ] Reports installation success/failure per node per worker
- [ ] Triggers ComfyUI restart if required after installation
- [ ] Installation logged in audit trail (PRD-45)

### Task 2.4: Worker Health Report Generator
**File:** `src/services/worker_health_report.rs`

Comprehensive per-worker health assessment.

```rust
pub struct WorkerHealthReport {
    pub worker_id: DbId,
    pub worker_name: String,
    pub overall_status: HealthStatus,  // Healthy, Warning, Critical
    pub categories: Vec<HealthCategory>,
}

pub struct HealthCategory {
    pub name: String,                  // "Models", "Nodes", "Disk", "Runtime"
    pub status: HealthStatus,
    pub details: Vec<HealthDetail>,
}
```

**Acceptance Criteria:**
- [ ] Per-worker report: installed models, installed nodes, disk space, Python/CUDA version, GPU driver version
- [ ] Green/yellow/red status per category
- [ ] Comparison view: highlight differences between workers

### Task 2.5: Repair Engine
**File:** `src/services/repair_engine.rs`

One-click repair actions.

**Acceptance Criteria:**
- [ ] "Sync Models": copies missing models from reference source or URL
- [ ] "Install Missing Nodes": auto-installs all detected missing nodes
- [ ] "Verify & Repair": full scan followed by auto-fix for all resolvable issues
- [ ] Each repair action returns progress and success/failure per item
- [ ] Repair actions logged in PRD-45 audit trail

---

## Phase 3: API Endpoints

### Task 3.1: Integrity Scan Routes
**File:** `src/routes/integrity.rs`

```
POST /admin/integrity-scan             -- Trigger scan for all workers or specific worker
POST /admin/integrity-scan/:worker_id  -- Trigger scan for a specific worker
GET  /admin/integrity-report/:worker_id -- Get latest health report
GET  /admin/integrity-scans            -- List scan history
```

**Acceptance Criteria:**
- [ ] Scan is async: returns scan ID for polling
- [ ] Supports scan type: models, nodes, or full
- [ ] Report returns structured health data
- [ ] Admin-only access

### Task 3.2: Repair Routes
**File:** `src/routes/integrity.rs`

```
POST /admin/repair/:worker_id          -- One-click full repair
POST /admin/sync-models/:worker_id     -- Sync missing models
POST /admin/install-nodes/:worker_id   -- Install missing nodes
```

**Acceptance Criteria:**
- [ ] Each repair action is async with progress tracking
- [ ] Returns job ID for polling completion
- [ ] Requires confirmation for destructive actions

### Task 3.3: Model Checksums CRUD
**File:** `src/routes/model_checksums.rs`

```
GET    /admin/model-checksums          -- List all known models
POST   /admin/model-checksums          -- Register a model checksum
PUT    /admin/model-checksums/:id      -- Update checksum
DELETE /admin/model-checksums/:id      -- Remove model from tracking
```

**Acceptance Criteria:**
- [ ] CRUD for model checksum registry
- [ ] Bulk import from asset registry (PRD-17)

---

## Phase 4: React Frontend

### Task 4.1: Worker Health Dashboard
**File:** `frontend/src/pages/SystemIntegrity.tsx`

**Acceptance Criteria:**
- [ ] Grid of worker cards with traffic-light status indicators
- [ ] Per-category status breakdown on each card
- [ ] Click to expand detailed health report
- [ ] Comparison view showing differences between workers

### Task 4.2: Scan & Repair Controls
**File:** `frontend/src/components/integrity/ScanControls.tsx`

**Acceptance Criteria:**
- [ ] "Scan All Workers" and "Scan Worker" buttons
- [ ] Scan type selector (models, nodes, full)
- [ ] Progress display during scan
- [ ] Repair buttons with confirmation dialogs
- [ ] Repair progress with per-item status

### Task 4.3: Scan History View
**File:** `frontend/src/components/integrity/ScanHistory.tsx`

**Acceptance Criteria:**
- [ ] Chronological list of past scans
- [ ] Summary per scan: found, missing, corrupted counts
- [ ] Click to view detailed results

---

## Phase 5: Testing

### Task 5.1: Scanner Tests
**File:** `tests/model_scanner_test.rs`

**Acceptance Criteria:**
- [ ] Test checksum verification detects corrupted models
- [ ] Test missing model detection
- [ ] Test extra model reporting
- [ ] Test scan result persistence

### Task 5.2: Repair Engine Tests
**File:** `tests/repair_engine_test.rs`

**Acceptance Criteria:**
- [ ] Test model sync downloads missing models
- [ ] Test node installer handles version pinning
- [ ] Test full verify-and-repair sequence
- [ ] Test audit logging for repair actions

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_integrity_scans.sql` | Scan results table |
| `migrations/YYYYMMDDHHMMSS_create_model_checksums.sql` | Model checksum registry |
| `src/services/model_scanner.rs` | Model file integrity scanner |
| `src/services/node_detector.rs` | Missing node detection |
| `src/services/node_installer.rs` | Auto-installation service |
| `src/services/worker_health_report.rs` | Health report generator |
| `src/services/repair_engine.rs` | One-click repair actions |
| `src/routes/integrity.rs` | Scan and repair API |
| `src/routes/model_checksums.rs` | Checksum CRUD API |
| `frontend/src/pages/SystemIntegrity.tsx` | Health dashboard |
| `frontend/src/components/integrity/ScanControls.tsx` | Scan and repair UI |
| `frontend/src/components/integrity/ScanHistory.tsx` | Scan history |

## Dependencies

### Upstream PRDs
- PRD-05: ComfyUI WebSocket Bridge
- PRD-17: Asset Registry for checksums
- PRD-46: Worker Pool for worker management

### Downstream PRDs
- PRD-75: Workflow Import Validation
- PRD-105: Platform Setup Wizard

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.2)
2. Phase 2: Rust Backend (Tasks 2.1-2.5)
3. Phase 3: API Endpoints (Tasks 3.1-3.3)

**MVP Success Criteria:**
- Integrity scan completes in <60 seconds per worker
- Auto-installer resolves >90% of missing node issues
- Model sync copies all missing models without corruption
- All repair actions logged in audit trail

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.3)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. Dependency graph visualization (PRD Requirement 2.1)

## Notes

1. **Worker access** -- Scanner needs SSH or API access to workers for file system checks. The PRD-46 worker pool should provide connection credentials.
2. **Large model files** -- Model files can be 2-8 GB. Sync operations should show transfer progress and support resume-on-failure.
3. **ComfyUI restart** -- Installing custom nodes may require a ComfyUI restart. The auto-installer should coordinate this with the PRD-05 bridge.
4. **Scheduled scans** -- Consider running nightly integrity scans as a background job to catch drift early.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-043

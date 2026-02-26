# Task List: Backup & Disaster Recovery

**PRD Reference:** `design/prds/081-prd-backup-disaster-recovery.md`
**Scope:** Implement automated database backup scheduling, point-in-time recovery via WAL archiving, configuration backup, backup verification through automated test restores, recovery runbooks, and retention management.

## Overview

A platform managing hundreds of characters with thousands of approved video segments cannot afford data loss. This feature provides automated PostgreSQL backup scheduling (full and incremental), continuous point-in-time recovery via WAL archiving, configuration backup (extending PRD-44), automated backup verification through test restores, static recovery runbooks accessible during outages, and retention management. All backup operations are orchestrated by a Rust service and monitored through the PRD-80 System Health page.

### What Already Exists
- PRD-00 database schema
- PRD-44 App Config Export for configuration backup
- PRD-74 Project Templates as critical configuration
- PRD-77 Pipeline Hooks as critical configuration
- PRD-80 System Health for backup status monitoring

### What We're Building
1. Database tables for backup records and schedules
2. Rust backup orchestration service (pg_dump wrapper)
3. WAL archiving configuration for PITR
4. Configuration backup automation (extends PRD-44)
5. Automated test restore verification
6. Static HTML recovery runbook generator
7. Retention enforcement with automatic cleanup
8. API endpoints for backup management
9. React backup dashboard

### Key Design Decisions
1. **pg_dump for full backups** -- Proven, reliable PostgreSQL backup tool. Custom format for compression and selective restore.
2. **WAL-G or pgBackRest for PITR** -- WAL archiving provides continuous backup between full snapshots.
3. **Test restore to temp database** -- Automated weekly test restore to a temporary database confirms backups are usable.
4. **Static HTML runbook** -- Recovery instructions exported as a self-contained HTML file that works even when the platform is down.

---

## Phase 1: Database Schema

### Task 1.1: Backups Table
**File:** `migrations/YYYYMMDDHHMMSS_create_backups.sql`

```sql
CREATE TABLE backups (
    id BIGSERIAL PRIMARY KEY,
    backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental', 'config', 'wal')),
    destination TEXT NOT NULL,         -- file path, S3 URL, etc.
    file_path TEXT,
    size_bytes BIGINT,
    status_id BIGINT NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    verification_result_json JSONB,
    error_message TEXT,
    triggered_by TEXT NOT NULL DEFAULT 'schedule' CHECK (triggered_by IN ('schedule', 'manual', 'system')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_backups_status_id ON backups(status_id);
CREATE INDEX idx_backups_backup_type ON backups(backup_type);
CREATE INDEX idx_backups_completed_at ON backups(completed_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON backups
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Tracks all backup types: full, incremental, config, WAL
- [ ] Verification status and results stored alongside backup record
- [ ] `triggered_by` distinguishes scheduled, manual, and system-initiated backups

### Task 1.2: Backup Schedules Table
**File:** `migrations/YYYYMMDDHHMMSS_create_backup_schedules.sql`

```sql
CREATE TABLE backup_schedules (
    id BIGSERIAL PRIMARY KEY,
    backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental', 'config')),
    schedule TEXT NOT NULL,            -- cron expression
    destination TEXT NOT NULL,
    retention_policy_json JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_backup_schedules_next_run_at ON backup_schedules(next_run_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON backup_schedules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Schedule supports cron expressions
- [ ] Retention policy stored as JSON (hourly for 24h, daily for 30d, etc.)
- [ ] `next_run_at` indexed for efficient scheduler queries

---

## Phase 2: Rust Backend

### Task 2.1: Backup Scheduler Service
**File:** `src/services/backup_scheduler.rs`

Background service that triggers backups on schedule.

**Acceptance Criteria:**
- [ ] Polls `backup_schedules` for due backups
- [ ] Executes pg_dump for full backups
- [ ] Executes config export (PRD-44) for config backups
- [ ] Updates schedule timestamps after completion
- [ ] Sends notification via PRD-10 on completion/failure

### Task 2.2: Database Backup Executor
**File:** `src/services/backup_executor.rs`

Wraps pg_dump with proper options and error handling.

```rust
pub struct BackupExecutor {
    pg_dump_path: String,
    default_destination: String,
}

impl BackupExecutor {
    pub async fn execute_full_backup(
        &self,
        destination: &str,
    ) -> Result<BackupResult, BackupError> {
        // pg_dump --format=custom --compress=9 --file={dest} {db}
    }
}
```

**Acceptance Criteria:**
- [ ] Full backup via `pg_dump --format=custom`
- [ ] Compression enabled by default
- [ ] Backups written to configurable destination (local path, network mount)
- [ ] Error handling for pg_dump failures
- [ ] Backup size and duration recorded

### Task 2.3: WAL Archiving Configuration
**File:** `src/services/wal_manager.rs`

Manage PostgreSQL WAL archiving for PITR.

**Acceptance Criteria:**
- [ ] Configures `archive_command` for WAL file shipping
- [ ] Supports local storage and S3-compatible destinations
- [ ] Provides restore point timeline for the UI
- [ ] WAL retention follows configurable window

### Task 2.4: Configuration Backup Service
**File:** `src/services/config_backup.rs`

Extends PRD-44 config export with automated scheduling.

**Acceptance Criteria:**
- [ ] Exports: workflow JSONs, scene type definitions, hook scripts, templates, RBAC settings
- [ ] Runs alongside database backup automatically
- [ ] Stored as versioned archive alongside database backup
- [ ] Reuses PRD-44 config exporter service

### Task 2.5: Backup Verification Service
**File:** `src/services/backup_verifier.rs`

Automated test restore to verify backup integrity.

```rust
pub struct VerificationResult {
    pub backup_id: DbId,
    pub success: bool,
    pub restore_duration_seconds: i64,
    pub validation_queries_passed: i32,
    pub validation_queries_total: i32,
    pub errors: Vec<String>,
}
```

**Acceptance Criteria:**
- [ ] Restores latest backup to a temporary database
- [ ] Runs validation queries: table counts, FK integrity, sample data verification
- [ ] Drops temporary database after verification
- [ ] Reports success/failure to admins
- [ ] Runs on configurable schedule (default: weekly)

### Task 2.6: Recovery Runbook Generator
**File:** `src/services/recovery_runbook.rs`

Generate a static HTML recovery guide.

**Acceptance Criteria:**
- [ ] Self-contained HTML file (no external dependencies)
- [ ] Step-by-step instructions for: database restore, config restore, asset verification
- [ ] Includes: latest backup location, restore commands, verification steps
- [ ] Exportable and accessible even when platform is down
- [ ] Auto-generated on every successful backup

### Task 2.7: Retention Enforcer
**File:** `src/services/backup_retention.rs`

Cleanup expired backups based on retention policies.

**Acceptance Criteria:**
- [ ] Parses retention policy JSON: hourly for 24h, daily for 30d, weekly for 6 months
- [ ] Deletes backup files and database records for expired backups
- [ ] Tracks disk space used by backups
- [ ] Alerts when backup storage approaches capacity
- [ ] Runs daily as a background job

---

## Phase 3: API Endpoints

### Task 3.1: Backup Management Routes
**File:** `src/routes/backups.rs`

```
GET  /admin/backups                    -- List all backups
POST /admin/backups/trigger            -- Trigger manual backup
POST /admin/backups/:id/verify         -- Trigger verification of a specific backup
POST /admin/backups/:id/restore        -- Initiate restore from backup
GET  /admin/backups/recovery-runbook   -- Download recovery runbook HTML
```

**Acceptance Criteria:**
- [ ] List supports filtering by type, date, verified status
- [ ] Manual trigger accepts backup type and destination
- [ ] Restore requires confirmation and records in audit trail
- [ ] Runbook returns static HTML download

### Task 3.2: Backup Schedule CRUD Routes
**File:** `src/routes/backups.rs`

```
GET    /admin/backup-schedules
POST   /admin/backup-schedules
PUT    /admin/backup-schedules/:id
DELETE /admin/backup-schedules/:id
```

**Acceptance Criteria:**
- [ ] Standard CRUD for backup schedules
- [ ] Validation: valid cron expression, valid destination
- [ ] Enable/disable toggle

---

## Phase 4: React Frontend

### Task 4.1: Backup Dashboard
**File:** `frontend/src/pages/BackupDashboard.tsx`

**Acceptance Criteria:**
- [ ] List of recent backups with type, size, date, status, verified
- [ ] Visual indicator: last backup age (green <6h, yellow <24h, red >24h)
- [ ] "Trigger Backup" button with type and destination selection
- [ ] Disk usage for backup storage

### Task 4.2: PITR Timeline
**File:** `frontend/src/components/backup/PITRTimeline.tsx`

**Acceptance Criteria:**
- [ ] Interactive timeline showing available restore points
- [ ] Annotations showing what was happening at each point
- [ ] Click to select a restore point
- [ ] Restore preview: show what will change

### Task 4.3: Backup Schedule Manager
**File:** `frontend/src/components/backup/ScheduleManager.tsx`

**Acceptance Criteria:**
- [ ] List active schedules with cron expression, next run, last run
- [ ] Create/edit form with cron builder
- [ ] Retention policy editor
- [ ] Enable/disable toggle

### Task 4.4: Recovery Runbook Download
**File:** `frontend/src/components/backup/RunbookDownload.tsx`

**Acceptance Criteria:**
- [ ] Download button for latest recovery runbook
- [ ] Shows runbook generation date
- [ ] Warning if runbook is older than latest backup

---

## Phase 5: Testing

### Task 5.1: Backup Execution Tests
**File:** `tests/backup_test.rs`

**Acceptance Criteria:**
- [ ] Test full backup creates valid pg_dump file
- [ ] Test config backup includes all configuration sections
- [ ] Test backup record created in database
- [ ] Test notification fires on completion

### Task 5.2: Verification Tests
**File:** `tests/backup_verification_test.rs`

**Acceptance Criteria:**
- [ ] Test restore to temp database succeeds
- [ ] Test validation queries pass on restored data
- [ ] Test temp database is cleaned up after verification
- [ ] Test verification result is recorded

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_backups.sql` | Backup records table |
| `migrations/YYYYMMDDHHMMSS_create_backup_schedules.sql` | Backup schedule table |
| `src/services/backup_scheduler.rs` | Background backup scheduler |
| `src/services/backup_executor.rs` | pg_dump wrapper |
| `src/services/wal_manager.rs` | WAL archiving for PITR |
| `src/services/config_backup.rs` | Configuration backup |
| `src/services/backup_verifier.rs` | Automated test restore |
| `src/services/recovery_runbook.rs` | Static HTML runbook |
| `src/services/backup_retention.rs` | Expired backup cleanup |
| `src/routes/backups.rs` | Backup API endpoints |
| `frontend/src/pages/BackupDashboard.tsx` | Backup management UI |
| `frontend/src/components/backup/PITRTimeline.tsx` | PITR timeline |
| `frontend/src/components/backup/ScheduleManager.tsx` | Schedule management |

## Dependencies

### Upstream PRDs
- PRD-00: Database schema
- PRD-44: App Config Export
- PRD-80: System Health for status display

### Downstream PRDs
- None (terminal PRD)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.2)
2. Phase 2: Rust Backend (Tasks 2.1-2.7)
3. Phase 3: API Endpoints (Tasks 3.1-3.2)

**MVP Success Criteria:**
- Backups complete within configured windows without impacting performance
- Verification succeeds >99% of the time
- PITR restores to within 1 minute of requested point
- Recovery runbook enables restore in <2 hours

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.4)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. Cross-region backup (PRD Requirement 2.1)

## Notes

1. **pg_dump vs. pg_basebackup** -- Use `pg_dump --format=custom` for full backups (portable, selective restore). Use `pg_basebackup` for base backups when PITR is configured.
2. **WAL archiving performance** -- WAL archiving adds continuous I/O. Monitor write latency impact on the production database.
3. **Backup encryption** -- The open question about encryption can be addressed by piping pg_dump output through `gpg` or using S3 server-side encryption.
4. **Test restore database name** -- Use `x121_verify_{timestamp}` for temporary restore databases to avoid conflicts.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-081

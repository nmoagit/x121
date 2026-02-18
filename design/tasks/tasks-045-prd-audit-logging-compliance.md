# Task List: Audit Logging & Compliance

**PRD Reference:** `design/prds/045-prd-audit-logging-compliance.md`
**Scope:** Implement a comprehensive, immutable operational audit trail for all user and system actions with structured queryable storage, configurable retention policies, and integrity verification.

## Overview

Multi-user studio environments need operational accountability. This audit logging system captures every user action (login, job submissions, approvals, config changes) and system event (service restarts, reclamation runs, auto-healing) in an append-only, tamper-resistant log store. Unlike PRD-13 (field-level metadata timeline), this system tracks operational actions at the request/event level. Logs are queryable by user, action type, entity, and time range, with configurable retention policies and automatic archival.

### What Already Exists
- PRD-01 entity model for references
- PRD-03 RBAC for user identity

### What We're Building
1. Append-only `audit_logs` table with immutability constraints
2. Rust audit log ingestion service with async batching
3. Structured query engine with filtering and pagination
4. Log integrity verification (tamper detection)
5. Configurable retention policies with automatic archival
6. API endpoints for log querying and export
7. React audit log viewer for administrators

### Key Design Decisions
1. **Append-only table** -- The `audit_logs` table has no UPDATE or DELETE grants. An application-level trigger prevents modification.
2. **Async ingestion** -- Audit log writes are batched asynchronously to add <100ms overhead per request.
3. **Integrity via hash chain** -- Each log entry includes a hash of the previous entry, forming a chain. Tampering breaks the chain.
4. **Retention tiers** -- Active logs in PostgreSQL, archived logs moved to cold storage (still queryable with higher latency).

---

## Phase 1: Database Schema

### Task 1.1: Audit Logs Table
**File:** `migrations/YYYYMMDDHHMMSS_create_audit_logs.sql`

```sql
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    session_id TEXT,
    action_type TEXT NOT NULL,         -- 'login', 'logout', 'job_submit', 'approve', 'config_change', etc.
    entity_type TEXT,                  -- 'project', 'scene', 'segment', 'workflow', etc.
    entity_id BIGINT,
    details_json JSONB,               -- action-specific details
    ip_address TEXT,
    user_agent TEXT,
    integrity_hash TEXT,              -- SHA-256 chain hash
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_session_id ON audit_logs(session_id);

-- Full-text search index on details
CREATE INDEX idx_audit_logs_details_gin ON audit_logs USING gin(details_json);

-- NO updated_at column -- audit logs are immutable
-- NO update trigger -- audit logs must never be modified

-- Prevent updates and deletes at the database level
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_audit_logs
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER no_delete_audit_logs
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```

**Acceptance Criteria:**
- [ ] No `updated_at` column -- immutable records
- [ ] UPDATE and DELETE triggers prevent modification
- [ ] Indexes on timestamp, user_id, action_type, entity for fast queries
- [ ] GIN index on details_json for JSON content search
- [ ] `integrity_hash` for tamper detection chain

### Task 1.2: Audit Log Retention Policies Table
**File:** `migrations/YYYYMMDDHHMMSS_create_audit_retention_policies.sql`

```sql
CREATE TABLE audit_retention_policies (
    id BIGSERIAL PRIMARY KEY,
    log_category TEXT NOT NULL UNIQUE,  -- 'authentication', 'operations', 'configuration', 'system'
    active_retention_days INTEGER NOT NULL DEFAULT 90,
    archive_retention_days INTEGER NOT NULL DEFAULT 365,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON audit_retention_policies
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO audit_retention_policies (log_category, active_retention_days, archive_retention_days) VALUES
    ('authentication', 90, 365),
    ('operations', 90, 365),
    ('configuration', 180, 730),
    ('system', 90, 365);
```

**Acceptance Criteria:**
- [ ] Per-category retention configuration
- [ ] Active and archive retention separate
- [ ] Four categories seeded with defaults

---

## Phase 2: Rust Backend -- Ingestion & Querying

### Task 2.1: Audit Log Ingestion Service
**File:** `src/services/audit_logger.rs`

Async, batched audit log writer.

```rust
pub struct AuditLogger {
    pool: PgPool,
    buffer: Arc<Mutex<Vec<AuditLogEntry>>>,
    flush_interval: Duration,
}

pub struct AuditLogEntry {
    pub user_id: Option<DbId>,
    pub session_id: Option<String>,
    pub action_type: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub details: serde_json::Value,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

impl AuditLogger {
    pub fn log(&self, entry: AuditLogEntry) {
        // Add to buffer, flush periodically or when buffer is full
    }

    async fn flush(&self) -> Result<(), AuditError> {
        // Batch insert all buffered entries
        // Compute integrity hash chain for each entry
    }
}
```

**Acceptance Criteria:**
- [ ] Async batched writes to minimize overhead (<100ms per request)
- [ ] Buffer flushes every 1 second or when buffer reaches 100 entries
- [ ] Computes integrity hash chain during flush
- [ ] Handles flush failures with retry and alerting

### Task 2.2: Audit Middleware
**File:** `src/middleware/audit.rs`

Axum middleware that automatically logs all API requests.

```rust
pub async fn audit_middleware(
    State(logger): State<Arc<AuditLogger>>,
    req: Request,
    next: Next,
) -> Response {
    // Extract: user_id from auth, IP, user agent, path, method
    // Execute handler
    // Log the action with request and response context
}
```

**Acceptance Criteria:**
- [ ] Automatically logs all user actions without per-route configuration
- [ ] Extracts user identity from authentication context (PRD-03)
- [ ] Logs: action type (derived from route), entity type/id (from path), IP, user agent
- [ ] Captures request body for write operations (POST, PUT, DELETE)
- [ ] Does not log sensitive fields (passwords, tokens)

### Task 2.3: System Event Logger
**File:** `src/services/system_audit_logger.rs`

Logs system-initiated events.

**Acceptance Criteria:**
- [ ] Service restarts and crashes
- [ ] Disk reclamation runs (PRD-15) with details of what was reclaimed
- [ ] Auto-healing events (PRD-71 auto-retry actions)
- [ ] Failed authentication attempts
- [ ] Scheduled task executions
- [ ] No user_id for system events (logged as system actor)

### Task 2.4: Audit Query Engine
**File:** `src/services/audit_query.rs`

Structured query service for log retrieval.

```rust
pub struct AuditQuery {
    pub user_id: Option<DbId>,
    pub action_type: Option<String>,
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub from: Option<chrono::DateTime<chrono::Utc>>,
    pub to: Option<chrono::DateTime<chrono::Utc>>,
    pub search_text: Option<String>,   // full-text search in details
    pub page: i64,
    pub page_size: i64,
}
```

**Acceptance Criteria:**
- [ ] Filter by: user, action type, entity type, entity ID, time range
- [ ] Full-text search within log details_json
- [ ] Pagination for large result sets
- [ ] Queries return in <2 seconds for 30-day ranges
- [ ] Returns total count for pagination

### Task 2.5: Integrity Verification Service
**File:** `src/services/audit_integrity.rs`

Verify the audit log hash chain has not been tampered with.

```rust
pub struct IntegrityCheckResult {
    pub verified_entries: i64,
    pub chain_valid: bool,
    pub first_break: Option<DbId>,     // ID of first entry where chain breaks
}
```

**Acceptance Criteria:**
- [ ] Recomputes hash chain from entry N to entry M
- [ ] Detects any insertion, modification, or deletion of entries
- [ ] Returns the specific entry where integrity breaks
- [ ] Can verify entire log or a time range

### Task 2.6: Retention Manager
**File:** `src/services/audit_retention.rs`

Manage log lifecycle based on retention policies.

**Acceptance Criteria:**
- [ ] Moves entries older than active_retention_days to archive storage
- [ ] Deletes entries older than archive_retention_days (only via the retention process, bypassing the trigger)
- [ ] Runs on a schedule (daily)
- [ ] Logs retention actions in a separate system log
- [ ] Archived logs remain queryable (with higher latency note in API response)

---

## Phase 3: API Endpoints

### Task 3.1: Audit Log Query Routes
**File:** `src/routes/audit_logs.rs`

```
GET /admin/audit-logs                  -- Query logs with filters
GET /admin/audit-logs/export           -- Export logs as CSV/JSON
GET /admin/audit-logs/integrity-check  -- Run integrity verification
```

**Acceptance Criteria:**
- [ ] Query supports all filter parameters from Task 2.4
- [ ] Export supports CSV and JSON formats with date range
- [ ] Integrity check returns verification result
- [ ] Admin-only access

### Task 3.2: Retention Policy Routes
**File:** `src/routes/audit_logs.rs`

```
GET /admin/audit-logs/retention        -- List retention policies
PUT /admin/audit-logs/retention/:category -- Update retention policy
```

**Acceptance Criteria:**
- [ ] List all category retention policies
- [ ] Update active and archive retention days per category

---

## Phase 4: React Frontend

### Task 4.1: Audit Log Viewer
**File:** `frontend/src/pages/AuditLogs.tsx`

**Acceptance Criteria:**
- [ ] Searchable, filterable log table
- [ ] Filters: user, action type, entity type, date range
- [ ] Full-text search bar
- [ ] Expandable row details showing full context JSON
- [ ] Pagination with page size control
- [ ] Export buttons (CSV, JSON)

### Task 4.2: Audit Log Entry Detail
**File:** `frontend/src/components/audit/AuditEntryDetail.tsx`

**Acceptance Criteria:**
- [ ] Full detail view for a single log entry
- [ ] Human-readable action description
- [ ] Entity link (click to navigate to the referenced entity)
- [ ] Timestamp with timezone conversion
- [ ] IP address and device information

### Task 4.3: Integrity Check Panel
**File:** `frontend/src/components/audit/IntegrityCheck.tsx`

**Acceptance Criteria:**
- [ ] "Run Integrity Check" button
- [ ] Progress indicator during verification
- [ ] Pass/fail result with details on any chain break

### Task 4.4: Retention Policy Settings
**File:** `frontend/src/components/audit/RetentionSettings.tsx`

**Acceptance Criteria:**
- [ ] List of categories with current retention periods
- [ ] Edit form for adjusting retention days
- [ ] Warning when reducing retention period

---

## Phase 5: Testing

### Task 5.1: Audit Ingestion Tests
**File:** `tests/audit_ingestion_test.rs`

**Acceptance Criteria:**
- [ ] Test log entry creation with all fields
- [ ] Test batch flush writes all buffered entries
- [ ] Test overhead is <100ms per logged action
- [ ] Test UPDATE/DELETE are blocked by triggers

### Task 5.2: Integrity Verification Tests
**File:** `tests/audit_integrity_test.rs`

**Acceptance Criteria:**
- [ ] Test valid chain passes verification
- [ ] Test chain break is detected after simulated tampering
- [ ] Test verification performance on large log sets

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_audit_logs.sql` | Append-only audit log table |
| `migrations/YYYYMMDDHHMMSS_create_audit_retention_policies.sql` | Retention configuration |
| `src/services/audit_logger.rs` | Async batched log writer |
| `src/middleware/audit.rs` | Automatic request auditing |
| `src/services/system_audit_logger.rs` | System event logging |
| `src/services/audit_query.rs` | Query engine |
| `src/services/audit_integrity.rs` | Hash chain verification |
| `src/services/audit_retention.rs` | Retention lifecycle manager |
| `src/routes/audit_logs.rs` | Audit log API |
| `frontend/src/pages/AuditLogs.tsx` | Log viewer page |
| `frontend/src/components/audit/AuditEntryDetail.tsx` | Entry detail view |
| `frontend/src/components/audit/IntegrityCheck.tsx` | Integrity check UI |
| `frontend/src/components/audit/RetentionSettings.tsx` | Retention config UI |

## Dependencies

### Upstream PRDs
- PRD-01: Entity model for references
- PRD-03: RBAC for user identity

### Downstream PRDs
- PRD-72: Project Lifecycle transition tracking
- PRD-97: Trigger audit trail
- PRD-98: Session Management
- PRD-106: API Observability

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.2)
2. Phase 2: Rust Backend (Tasks 2.1-2.6)
3. Phase 3: API Endpoints (Tasks 3.1-3.2)

**MVP Success Criteria:**
- All auditable actions logged with <100ms overhead
- Log queries return in <2 seconds for 30-day ranges
- Integrity verification detects 100% of tampering attempts
- Retention policies correctly archive and purge on schedule

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.4)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. Compliance reports (PRD Requirement 2.1)

## Notes

1. **Hash chain computation** -- Each entry's `integrity_hash = SHA256(previous_entry_hash + entry_data)`. The first entry uses a known seed value.
2. **Retention bypass** -- The retention manager needs to bypass the DELETE trigger. Use a database role with elevated privileges specifically for the retention process, or temporarily disable the trigger within the retention function.
3. **Log volume** -- A busy studio may generate thousands of audit entries per day. Consider partitioning the `audit_logs` table by month for query performance.
4. **Sensitive data masking** -- The audit middleware should redact password fields, tokens, and other sensitive data from `details_json` before logging.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-045

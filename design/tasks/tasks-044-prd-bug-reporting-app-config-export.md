# Task List: Bug Reporting & App Config Export

**PRD Reference:** `design/prds/044-prd-bug-reporting-app-config-export.md`
**Scope:** Build one-click bug report capture with session recording, plus portable app-config export/import for studio backup and migration.

## Overview

This PRD serves two distinct purposes: (1) streamlining bug reporting by capturing browser state, console logs, user action history, and optional session recording in a single click, and (2) enabling studio configuration backup/migration by exporting the entire platform configuration as a portable archive. Bug reports feed into the development workflow; config export/import enables disaster recovery and multi-instance deployment.

### What Already Exists
- PRD-10 Event Bus for action history logging

### What We're Building
1. Database table for bug reports
2. Browser-side session recording (rrweb or similar)
3. One-click bug report packager (browser state, console errors, action log)
4. Configuration serializer/exporter (all studio settings as JSON+ZIP)
5. Configuration validator and importer with selective import
6. API endpoints for bug reports and config export/import
7. React UI for bug report capture and config management

### Key Design Decisions
1. **rrweb for session recording** -- rrweb is a proven DOM recording library that captures user interactions as events, enabling replay without screenshots.
2. **Trailing buffer** -- Session recording captures the last 5 minutes in a ring buffer. When the user clicks "Report Bug," the buffer is saved.
3. **PII stripping** -- Session recordings mask password fields and configurable sensitive elements.
4. **Config export is versioned** -- Each export includes the platform version, enabling compatibility checking on import.

---

## Phase 1: Database Schema

### Task 1.1: Bug Reports Table
**File:** `migrations/YYYYMMDDHHMMSS_create_bug_reports.sql`

```sql
CREATE TABLE bug_reports (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    description TEXT,
    url TEXT,
    browser_info TEXT,
    console_errors_json JSONB,
    action_history_json JSONB,
    context_json JSONB,                -- visible panels, active project, etc.
    recording_path TEXT,               -- path to rrweb recording file
    screenshot_path TEXT,              -- optional screenshot
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'resolved', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bug_reports_user_id ON bug_reports(user_id);
CREATE INDEX idx_bug_reports_status ON bug_reports(status);
CREATE INDEX idx_bug_reports_created_at ON bug_reports(created_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON bug_reports
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Stores all bug report context as structured JSON
- [ ] Recording and screenshot paths for file attachments
- [ ] Status tracking for triaging workflow
- [ ] All FK columns indexed

---

## Phase 2: Rust Backend

### Task 2.1: Bug Report Model & CRUD
**File:** `src/models/bug_report.rs`

**Acceptance Criteria:**
- [ ] Create with all context fields
- [ ] List by user, by status, by date range
- [ ] Update status (triage workflow)
- [ ] Get by ID with all details

### Task 2.2: Bug Report Storage Service
**File:** `src/services/bug_report_storage.rs`

Handle file storage for recordings and screenshots.

**Acceptance Criteria:**
- [ ] Save rrweb recording JSON to a configured storage path
- [ ] Save screenshot image to a configured storage path
- [ ] Cleanup old reports based on retention policy
- [ ] File paths stored in the bug_reports table

### Task 2.3: Config Export Service
**File:** `src/services/config_exporter.rs`

Serialize all platform configuration into a portable archive.

```rust
pub struct ConfigExport {
    pub version: String,               // platform version
    pub exported_at: chrono::DateTime<chrono::Utc>,
    pub exported_by: String,
    pub sections: HashMap<String, serde_json::Value>,
}
```

**Acceptance Criteria:**
- [ ] Exports: workflow JSONs, scene type definitions, QA profiles, templates, notification settings, RBAC configuration, theme settings
- [ ] Packaged as versioned JSON + related files in a ZIP
- [ ] Export metadata: platform version, export date, exporter identity
- [ ] Sensitive data (passwords, API keys) excluded or masked

### Task 2.4: Config Import Validator
**File:** `src/services/config_import_validator.rs`

Validate a configuration archive before import.

**Acceptance Criteria:**
- [ ] Checks platform version compatibility
- [ ] Validates archive structure and required files
- [ ] Reports what will change (additions, modifications, deletions)
- [ ] Returns structured validation result with warnings

### Task 2.5: Config Import Service
**File:** `src/services/config_importer.rs`

Apply a configuration archive to the platform.

**Acceptance Criteria:**
- [ ] Selective import: choose which sections to import
- [ ] Preview of what will change before applying
- [ ] Transaction-based: all or nothing per section
- [ ] Rollback capability on failure
- [ ] Import logged in audit trail (PRD-45)

---

## Phase 3: API Endpoints

### Task 3.1: Bug Report Routes
**File:** `src/routes/bug_reports.rs`

```
POST /bug-reports                      -- Submit a bug report
GET  /bug-reports                      -- List reports (admin: all; user: own)
GET  /bug-reports/:id                  -- Get report details
PUT  /bug-reports/:id/status           -- Update triage status
GET  /bug-reports/:id/recording        -- Download recording file
```

**Acceptance Criteria:**
- [ ] POST accepts multipart form with context JSON, recording file, screenshot
- [ ] List supports filtering by status and date range
- [ ] Recording download streams the file

### Task 3.2: Config Export/Import Routes
**File:** `src/routes/config.rs`

```
POST /admin/config/export              -- Generate config archive
POST /admin/config/validate            -- Validate an archive before import
POST /admin/config/import              -- Import config archive
```

**Acceptance Criteria:**
- [ ] Export returns a ZIP file download
- [ ] Validate accepts ZIP upload and returns validation report
- [ ] Import accepts ZIP upload with section selection
- [ ] All routes admin-only

---

## Phase 4: React Frontend

### Task 4.1: Bug Report Capture Button
**File:** `frontend/src/components/bug-report/BugReportButton.tsx`

Floating or help-menu accessible bug report trigger.

**Acceptance Criteria:**
- [ ] Accessible via help menu or keyboard shortcut
- [ ] Single click captures: current URL, visible panels, browser info, console errors
- [ ] Includes last N user actions from PRD-10 event log
- [ ] Optional screenshot with user confirmation
- [ ] Capture completes in <5 seconds

### Task 4.2: Session Recorder Integration
**File:** `frontend/src/services/sessionRecorder.ts`

rrweb-based session recording with trailing buffer.

```typescript
import * as rrweb from 'rrweb';

class SessionRecorder {
    private events: rrweb.eventWithTime[] = [];
    private maxBufferMinutes = 5;

    start() {
        rrweb.record({
            emit: (event) => {
                this.events.push(event);
                this.trimBuffer();
            },
            maskAllInputs: true,
        });
    }

    getRecording(): rrweb.eventWithTime[] {
        return [...this.events];
    }
}
```

**Acceptance Criteria:**
- [ ] Records DOM events in a 5-minute trailing buffer
- [ ] Masks password fields and configurable sensitive elements
- [ ] Recording starts automatically on app load
- [ ] Buffer trims to stay within 5 minutes of events
- [ ] Minimal performance impact (<1% CPU overhead)

### Task 4.3: Bug Report Form
**File:** `frontend/src/components/bug-report/BugReportForm.tsx`

**Acceptance Criteria:**
- [ ] Pre-filled context (URL, browser, panels)
- [ ] Text description field for user input
- [ ] Checkbox to include session recording
- [ ] Checkbox to include screenshot
- [ ] Submit button with success confirmation

### Task 4.4: Config Export/Import Page
**File:** `frontend/src/pages/ConfigManagement.tsx`

Admin-only page for configuration backup/restore.

**Acceptance Criteria:**
- [ ] "Export Configuration" button downloads ZIP
- [ ] "Import Configuration" file upload area
- [ ] Validation results display before import
- [ ] Section selector for partial import (workflows only, scene types only, etc.)
- [ ] Preview of changes before applying
- [ ] Success/failure message after import

---

## Phase 5: Testing

### Task 5.1: Config Export/Import Tests
**File:** `tests/config_export_import_test.rs`

**Acceptance Criteria:**
- [ ] Test export includes all configuration sections
- [ ] Test import restores all settings with zero data loss
- [ ] Test selective import applies only chosen sections
- [ ] Test version incompatibility is detected and rejected
- [ ] Test round-trip: export -> import produces identical config

### Task 5.2: Bug Report Tests
**File:** `tests/bug_report_test.rs`

**Acceptance Criteria:**
- [ ] Test report creation stores all context fields
- [ ] Test recording file is saved and retrievable
- [ ] Test status workflow transitions

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_bug_reports.sql` | Bug report storage table |
| `src/models/bug_report.rs` | Bug report model and CRUD |
| `src/services/bug_report_storage.rs` | File storage for recordings |
| `src/services/config_exporter.rs` | Config serialization service |
| `src/services/config_import_validator.rs` | Import validation |
| `src/services/config_importer.rs` | Config import service |
| `src/routes/bug_reports.rs` | Bug report API |
| `src/routes/config.rs` | Config export/import API |
| `frontend/src/components/bug-report/BugReportButton.tsx` | One-click capture |
| `frontend/src/services/sessionRecorder.ts` | rrweb session recording |
| `frontend/src/components/bug-report/BugReportForm.tsx` | Report submission form |
| `frontend/src/pages/ConfigManagement.tsx` | Config backup/restore UI |

## Dependencies

### Upstream PRDs
- PRD-10: Event Bus for action history

### Downstream PRDs
- PRD-81: Backup & Disaster Recovery uses config export

## Implementation Order

### MVP
1. Phase 1: Database Schema (Task 1.1)
2. Phase 2: Rust Backend (Tasks 2.1-2.5)
3. Phase 3: API Endpoints (Tasks 3.1-3.2)
4. Phase 4: React Frontend (Tasks 4.1-4.4)

**MVP Success Criteria:**
- Bug report capture completes in <5 seconds
- Config export includes 100% of configurable settings
- Config import correctly restores all settings
- Session recordings are replayable for bug reproduction

### Post-MVP Enhancements
1. Phase 5: Testing (Tasks 5.1-5.2)
2. Config diff tool (PRD Requirement 2.1)

## Notes

1. **rrweb bundle size** -- rrweb adds approximately 50KB to the frontend bundle. Recording is event-based, not video, so storage is compact.
2. **Config export secrets** -- Sensitive data (API keys, passwords) must be excluded or replaced with placeholder tokens in exports. Importing a config that references secrets should prompt the admin to provide fresh values.
3. **Bug report storage** -- Consider a configurable retention policy for bug reports (e.g., 90 days). Old recordings can be large.
4. **External issue tracker** -- The open question about Jira integration can be addressed post-MVP. For now, bug reports are stored internally.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-044

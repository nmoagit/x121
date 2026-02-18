# Task List: Video Compliance Checker

**PRD Reference:** `design/prds/102-prd-video-compliance-checker.md`
**Scope:** Build automated pre-delivery verification that checks video files against target specifications (resolution, codec, bitrate, duration, integrity), validates naming conventions, and generates pass/fail compliance reports with optional export blocking.

## Overview

PRD-39's delivery validation checks that files exist and are approved. This PRD goes deeper into technical correctness -- a file can exist and be approved but have the wrong bitrate, be slightly corrupted, or fail to match its output format profile. The compliance checker uses FFprobe to analyze every video file, compares the results against the expected specifications from output format profiles and scene type configurations, and produces a structured compliance report with pass/fail per file and actionable fix suggestions.

### What Already Exists
- PRD-01 data model with naming conventions
- PRD-23 scene type configuration with duration targets
- PRD-39 Scene Assembler with output format profiles
- PRD-59 Multi-Resolution Pipeline for resolution specs

### What We're Building
1. Database tables for compliance checks and compliance rules
2. Rust video file analyzer service (FFprobe-based)
3. Compliance rule engine comparing actual vs. expected specs
4. Naming convention validator
5. File integrity checker (truncation, corruption detection)
6. Compliance report generator with PDF/JSON export
7. Pre-export gate middleware
8. React compliance report UI

### Key Design Decisions
1. **FFprobe for analysis** -- FFprobe extracts video metadata reliably. No need for a separate media analysis library.
2. **Rules are per-profile** -- Compliance rules are attached to output format profiles. Each rule specifies an expected value and tolerance.
3. **Tolerances are configurable** -- Bitrate, duration, and resolution all have configurable tolerance ranges.
4. **Pre-export gate is optional** -- Studios can choose strict (block on failure), lenient (warn), or disabled.

---

## Phase 1: Database Schema

### Task 1.1: Compliance Rules Table
**File:** `migrations/YYYYMMDDHHMMSS_create_compliance_rules.sql`

```sql
CREATE TABLE compliance_rules (
    id BIGSERIAL PRIMARY KEY,
    profile_id BIGINT NOT NULL REFERENCES output_format_profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('resolution', 'codec', 'container', 'bitrate', 'framerate', 'duration', 'pixel_format', 'audio_codec', 'audio_sample_rate', 'audio_channels')),
    expected_value TEXT NOT NULL,
    tolerance REAL,                    -- NULL = exact match required; e.g., 0.1 = 10% tolerance
    severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('error', 'warning')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_rules_profile_id ON compliance_rules(profile_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON compliance_rules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Rules linked to output format profiles
- [ ] Rule types cover all PRD requirements (resolution, codec, bitrate, etc.)
- [ ] Tolerance supports percentage-based comparison
- [ ] Severity distinguishes blocking errors from warnings

### Task 1.2: Compliance Checks Table
**File:** `migrations/YYYYMMDDHHMMSS_create_compliance_checks.sql`

```sql
CREATE TABLE compliance_checks (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    profile_id BIGINT REFERENCES output_format_profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    results_json JSONB NOT NULL,       -- detailed per-file results
    total_files INTEGER NOT NULL,
    passed_files INTEGER NOT NULL,
    failed_files INTEGER NOT NULL,
    warning_files INTEGER NOT NULL,
    passed BOOLEAN NOT NULL,
    checked_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_checks_project_id ON compliance_checks(project_id);
CREATE INDEX idx_compliance_checks_profile_id ON compliance_checks(profile_id);
CREATE INDEX idx_compliance_checks_checked_by ON compliance_checks(checked_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON compliance_checks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Summary counts for quick pass/fail overview
- [ ] Detailed `results_json` contains per-file compliance data
- [ ] `passed` boolean for simple gate checks

### Task 1.3: Pre-Export Gate Configuration
**File:** `migrations/YYYYMMDDHHMMSS_add_compliance_gate_to_projects.sql`

```sql
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS compliance_gate_mode TEXT NOT NULL DEFAULT 'warn'
        CHECK (compliance_gate_mode IN ('strict', 'warn', 'disabled'));
```

**Acceptance Criteria:**
- [ ] Per-project configurable gate mode
- [ ] Default is `warn` (show issues but allow export)
- [ ] `strict` blocks export on any compliance failure

---

## Phase 2: Rust Backend -- Analysis & Validation

### Task 2.1: Video File Analyzer
**File:** `src/services/video_analyzer.rs`

Use FFprobe to extract technical metadata from video files.

```rust
pub struct VideoFileInfo {
    pub path: PathBuf,
    pub resolution: String,            // "1920x1080"
    pub codec: String,                 // "h264"
    pub container: String,             // "mp4"
    pub bitrate_kbps: i32,
    pub framerate: f32,
    pub duration_seconds: f64,
    pub pixel_format: String,
    pub has_audio: bool,
    pub audio_codec: Option<String>,
    pub audio_sample_rate: Option<i32>,
    pub audio_channels: Option<i32>,
    pub file_size_bytes: i64,
    pub is_truncated: bool,
    pub is_playable: bool,
}

impl VideoFileAnalyzer {
    pub async fn analyze(&self, path: &Path) -> Result<VideoFileInfo, AnalyzerError> {
        // Run ffprobe -v quiet -print_format json -show_streams -show_format {path}
        // Parse JSON output into VideoFileInfo
        // Verify playability by seeking to last frame
    }
}
```

**Acceptance Criteria:**
- [ ] Extracts: resolution, codec, container, bitrate, framerate, duration, pixel format
- [ ] Detects audio track presence and properties
- [ ] Detects truncated files (incomplete moov atom, missing EOF marker)
- [ ] Detects corrupted headers
- [ ] Analysis completes in <2 seconds per file

### Task 2.2: Compliance Rule Engine
**File:** `src/services/compliance_rule_engine.rs`

Compare actual video properties against expected specs.

```rust
pub struct ComplianceResult {
    pub file_path: String,
    pub passed: bool,
    pub checks: Vec<ComplianceCheck>,
}

pub struct ComplianceCheck {
    pub rule_type: String,
    pub expected: String,
    pub actual: String,
    pub passed: bool,
    pub severity: String,
    pub message: String,
}
```

**Acceptance Criteria:**
- [ ] Checks each rule against actual video metadata
- [ ] Tolerance-based comparison for bitrate and duration
- [ ] Exact match for codec, container, pixel format
- [ ] Resolution comparison with tolerance (within 1% for scaling artifacts)
- [ ] Returns structured result with specific deviation details

### Task 2.3: File Integrity Checker
**File:** `src/services/file_integrity_checker.rs`

Detect corrupted or incomplete video files.

**Acceptance Criteria:**
- [ ] Verify every video is playable to its last frame
- [ ] Detect truncated files (common after interrupted generation)
- [ ] Detect corrupted headers
- [ ] Detect files claiming a duration longer than actual content
- [ ] Uses FFprobe error output to detect issues

### Task 2.4: Naming Convention Validator
**File:** `src/services/naming_validator.rs`

Verify all filenames follow the PRD-01 naming convention.

**Acceptance Criteria:**
- [ ] Parse filename and verify prefix, content, suffix, index components
- [ ] Flag misnamed files with suggested corrections
- [ ] Check for missing prefix, incorrect scene type names, wrong index numbers
- [ ] Returns specific correction suggestions

### Task 2.5: Completeness Checker
**File:** `src/services/completeness_checker.rs`

Cross-reference delivery manifest against actual files.

**Acceptance Criteria:**
- [ ] Verifies all expected scenes present for each character
- [ ] Verifies all required files (metadata.json, clothed.png, topless.png)
- [ ] Reports missing files with expected paths
- [ ] Integrates with PRD-39 delivery validation

### Task 2.6: Compliance Report Generator
**File:** `src/services/compliance_report.rs`

Generate the compliance report from check results.

```rust
pub struct ComplianceReport {
    pub project_id: DbId,
    pub total_files: i32,
    pub passed: i32,
    pub failed: i32,
    pub warnings: i32,
    pub overall_passed: bool,
    pub per_character: Vec<CharacterComplianceResult>,
    pub issues: Vec<ComplianceIssue>,
}

pub struct ComplianceIssue {
    pub severity: String,
    pub file_path: String,
    pub check_type: String,
    pub message: String,
    pub fix_suggestion: Option<String>,
}
```

**Acceptance Criteria:**
- [ ] Pass/fail per character and per file
- [ ] Summary: "42 of 44 files pass. 2 issues: [specific problems]"
- [ ] Fix suggestions where possible (re-transcode, re-name)
- [ ] Exportable as PDF/JSON

### Task 2.7: Pre-Export Gate Service
**File:** `src/services/compliance_gate.rs`

Optionally block export on compliance failure.

**Acceptance Criteria:**
- [ ] Reads `compliance_gate_mode` from project settings
- [ ] `strict`: block export and return compliance report
- [ ] `warn`: allow export but include warnings in response
- [ ] `disabled`: skip compliance check entirely
- [ ] Admin override with audit log entry

---

## Phase 3: API Endpoints

### Task 3.1: Compliance Check Route
**File:** `src/routes/compliance.rs`

```
POST /projects/:id/compliance-check
```

**Acceptance Criteria:**
- [ ] Triggers full compliance analysis of project deliverables
- [ ] Async operation: returns check ID for polling
- [ ] Accepts optional profile_id to check against specific profile
- [ ] Stores results in `compliance_checks` table

### Task 3.2: Compliance Report Route
**File:** `src/routes/compliance.rs`

```
GET /projects/:id/compliance-report
GET /projects/:id/compliance-report/pdf
GET /projects/:id/compliance-report/json
```

**Acceptance Criteria:**
- [ ] Returns latest compliance check results
- [ ] PDF export with formatted pass/fail indicators
- [ ] JSON export for programmatic consumption

### Task 3.3: Compliance Fix Route
**File:** `src/routes/compliance.rs`

```
POST /projects/:id/compliance-fix/:file_id
```

**Acceptance Criteria:**
- [ ] Triggers auto-fix for a specific file (re-transcode, re-name)
- [ ] Only available for fixable issues
- [ ] Returns job ID for tracking the fix operation

### Task 3.4: Compliance Rules CRUD
**File:** `src/routes/compliance.rs`

```
GET    /compliance-rules?profile_id=X
POST   /compliance-rules
PUT    /compliance-rules/:id
DELETE /compliance-rules/:id
```

**Acceptance Criteria:**
- [ ] CRUD for compliance rules linked to output format profiles
- [ ] Auto-populate default rules when a profile is created

---

## Phase 4: React Frontend

### Task 4.1: Compliance Report View
**File:** `frontend/src/components/compliance/ComplianceReport.tsx`

**Acceptance Criteria:**
- [ ] Per-character accordion with per-file pass/fail indicators
- [ ] Green/red icons for quick scanning
- [ ] Expandable details per file showing specific deviations
- [ ] Fix suggestions with action buttons (re-transcode, view file)
- [ ] Summary banner: "42/44 pass" with overall status

### Task 4.2: Compliance Check Trigger
**File:** `frontend/src/components/compliance/ComplianceCheck.tsx`

**Acceptance Criteria:**
- [ ] "Run Compliance Check" button on project delivery page
- [ ] Progress indicator during analysis
- [ ] Results displayed inline when complete
- [ ] Export buttons for PDF/JSON

### Task 4.3: Compliance Gate Settings
**File:** `frontend/src/components/compliance/GateSettings.tsx`

**Acceptance Criteria:**
- [ ] Toggle between strict, warn, and disabled modes
- [ ] Clear explanation of each mode's behavior
- [ ] Admin-only for changing the gate mode

### Task 4.4: Compliance Rules Editor
**File:** `frontend/src/components/compliance/RulesEditor.tsx`

**Acceptance Criteria:**
- [ ] List rules for a selected output format profile
- [ ] Add/edit/delete rules with severity and tolerance
- [ ] Preview: shows what the rule would check

---

## Phase 5: Testing

### Task 5.1: Video Analyzer Tests
**File:** `tests/video_analyzer_test.rs`

**Acceptance Criteria:**
- [ ] Test metadata extraction from valid video files
- [ ] Test truncated file detection
- [ ] Test corrupted header detection
- [ ] Test duration mismatch detection

### Task 5.2: Rule Engine Tests
**File:** `tests/compliance_rule_engine_test.rs`

**Acceptance Criteria:**
- [ ] Test exact match rules (codec, container)
- [ ] Test tolerance-based rules (bitrate within 10%)
- [ ] Test resolution tolerance
- [ ] Test duration range compliance
- [ ] Test audio presence/absence validation

### Task 5.3: End-to-End Compliance Tests
**File:** `tests/compliance_e2e_test.rs`

**Acceptance Criteria:**
- [ ] Test full compliance check on a project with known issues
- [ ] Test pre-export gate blocks export in strict mode
- [ ] Test pre-export gate allows export in warn mode
- [ ] Test compliance report generation (PDF and JSON)

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_compliance_rules.sql` | Compliance rules table |
| `migrations/YYYYMMDDHHMMSS_create_compliance_checks.sql` | Compliance check results |
| `migrations/YYYYMMDDHHMMSS_add_compliance_gate_to_projects.sql` | Gate mode column |
| `src/services/video_analyzer.rs` | FFprobe-based video analysis |
| `src/services/compliance_rule_engine.rs` | Rule matching engine |
| `src/services/file_integrity_checker.rs` | Truncation/corruption detection |
| `src/services/naming_validator.rs` | Naming convention checker |
| `src/services/completeness_checker.rs` | Manifest vs. actual files |
| `src/services/compliance_report.rs` | Report generator |
| `src/services/compliance_gate.rs` | Pre-export gate logic |
| `src/routes/compliance.rs` | Compliance API endpoints |
| `frontend/src/components/compliance/ComplianceReport.tsx` | Report display |
| `frontend/src/components/compliance/ComplianceCheck.tsx` | Check trigger |
| `frontend/src/components/compliance/GateSettings.tsx` | Gate mode config |
| `frontend/src/components/compliance/RulesEditor.tsx` | Rule management |

## Dependencies

### Upstream PRDs
- PRD-01: Naming convention rules
- PRD-23: Scene type duration targets
- PRD-39: Output format profiles
- PRD-59: Multi-Resolution Pipeline

### Downstream PRDs
- PRD-72: Project Lifecycle uses compliance as pre-delivery gate

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Rust Backend (Tasks 2.1-2.7)
3. Phase 3: API Endpoints (Tasks 3.1-3.4)

**MVP Success Criteria:**
- Compliance check completes in <60 seconds for a full project (50+ files)
- File integrity check detects 100% of truncated/corrupted files
- Zero downstream rejections after compliance check passes
- Pre-export gate correctly blocks/warns based on configuration

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.4)
2. Phase 5: Testing (Tasks 5.1-5.3)
3. Auto-fix pipeline (PRD Requirement 2.1)

## Notes

1. **FFprobe must be installed** -- Both FFprobe and FFmpeg must be available in PATH on the server.
2. **Playability verification** -- To verify a file is playable to the last frame, use `ffprobe -v error -show_entries format=duration -of csv=p=0 {file}` and compare against the reported duration from the container metadata.
3. **Auto-populate rules** -- When an output format profile is created, automatically generate default compliance rules matching the profile's specs. This saves admins from manual rule creation.
4. **Borderline values** -- The open question about borderline metrics (99% of max) should be handled by the tolerance system. Admins set tolerance to define what is "acceptable."

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-102

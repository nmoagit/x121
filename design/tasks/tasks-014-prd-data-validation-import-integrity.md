# Task List: Data Validation & Import Integrity

**PRD Reference:** `design/prds/014-prd-data-validation-import-integrity.md`
**Scope:** Build a validation layer that sits at the ingestion boundary — validating data from imports, API calls, and manual edits against defined schema rules before it reaches the database, with dry-run previews, conflict detection, and validation reporting.

## Overview

This PRD creates a reusable validation engine in Rust that enforces field-level rules (required, type, range, enum, custom) per entity type. The engine is invoked by import pipelines, API handlers, and metadata editors. It provides a dry-run mode that previews import effects without committing, detects conflicts between incoming and existing data, and produces structured validation reports stored for audit. This is the "gatekeeper" layer that translates raw database constraint errors into user-friendly feedback.

### What Already Exists
- PRD-000: Database-level constraints (FK, NOT NULL, CHECK) as the final safety net
- PRD-001: Core entity tables defining the schema that validation rules enforce

### What We're Building
1. Validation rule engine with per-entity, per-field rules
2. Database tables for rule definitions and import reports
3. Dry-run import preview service with field-level diffs
4. Conflict detection and resolution service
5. Validation report generation and storage
6. API endpoints for validation and report retrieval

### Key Design Decisions
1. **Rule-driven, not hard-coded** — Validation rules are stored in a database table, not scattered through code. This allows admin modification without redeployment.
2. **Two-layer validation** — The validation engine runs first (user-friendly errors), database constraints run second (safety net). Never rely on DB errors for user feedback.
3. **Dry-run is the default** — Every import goes through preview first. The commit step is separate and explicit.
4. **Reports are persistent** — Validation reports are stored in the DB, not just returned ephemerally. They serve as audit records.

---

## Phase 1: Database Schema

### Task 1.1: Validation Rules Table
**File:** `migrations/{timestamp}_create_validation_rules.sql`

Store per-entity, per-field validation rules that the engine evaluates.

```sql
CREATE TABLE validation_rule_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON validation_rule_types
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO validation_rule_types (name, description) VALUES
    ('required', 'Field must be present and non-null'),
    ('type_check', 'Field must match expected data type'),
    ('min_length', 'String field minimum length'),
    ('max_length', 'String field maximum length'),
    ('min_value', 'Numeric field minimum value'),
    ('max_value', 'Numeric field maximum value'),
    ('enum_values', 'Field must be one of allowed values'),
    ('regex_pattern', 'Field must match regex pattern'),
    ('unique_in_scope', 'Field must be unique within a scope (e.g., project)'),
    ('custom', 'Custom validation logic reference');

CREATE TABLE validation_rules (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,           -- 'character', 'scene', 'segment', etc.
    field_name TEXT NOT NULL,
    rule_type_id BIGINT NOT NULL REFERENCES validation_rule_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    config JSONB NOT NULL DEFAULT '{}',  -- rule-specific parameters (e.g., {"max": 255})
    error_message TEXT NOT NULL,         -- user-friendly error template
    severity TEXT NOT NULL DEFAULT 'error', -- 'error', 'warning'
    is_active BOOLEAN NOT NULL DEFAULT true,
    project_id BIGINT NULL,              -- NULL = global rule, set = project-specific
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_validation_rules_entity_type ON validation_rules(entity_type);
CREATE INDEX idx_validation_rules_rule_type_id ON validation_rules(rule_type_id);
CREATE INDEX idx_validation_rules_project_id ON validation_rules(project_id);
CREATE INDEX idx_validation_rules_active ON validation_rules(entity_type, is_active)
    WHERE is_active = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON validation_rules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `validation_rule_types` lookup table seeded with built-in rule types
- [ ] `validation_rules` stores per-entity, per-field rules with JSONB config
- [ ] `project_id` is nullable — NULL means global rule, non-NULL is project-specific
- [ ] `severity` supports 'error' (blocks import) and 'warning' (informational)
- [ ] All FK columns are indexed
- [ ] Migration applies cleanly

### Task 1.2: Import Reports Table
**File:** `migrations/{timestamp}_create_import_reports.sql`

Store validation/import reports for audit.

```sql
CREATE TABLE import_report_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON import_report_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO import_report_statuses (name, description) VALUES
    ('preview', 'Dry-run preview completed'),
    ('committed', 'Import committed successfully'),
    ('partial', 'Import partially committed with some rejections'),
    ('failed', 'Import failed entirely'),
    ('cancelled', 'Import cancelled by user after preview');

CREATE TABLE import_reports (
    id BIGSERIAL PRIMARY KEY,
    status_id BIGINT NOT NULL REFERENCES import_report_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    source_type TEXT NOT NULL,           -- 'file_import', 'api', 'manual_edit', 'bulk_import'
    source_reference TEXT,               -- filename, API endpoint, etc.
    entity_type TEXT NOT NULL,
    project_id BIGINT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    accepted INTEGER NOT NULL DEFAULT 0,
    rejected INTEGER NOT NULL DEFAULT 0,
    auto_corrected INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    report_data JSONB NOT NULL DEFAULT '{}', -- full detailed report
    created_by BIGINT NULL,              -- user who initiated (FK to users table when available)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_reports_status_id ON import_reports(status_id);
CREATE INDEX idx_import_reports_project_id ON import_reports(project_id);
CREATE INDEX idx_import_reports_entity_type ON import_reports(entity_type);
CREATE INDEX idx_import_reports_created_at ON import_reports(created_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON import_reports
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE import_report_entries (
    id BIGSERIAL PRIMARY KEY,
    report_id BIGINT NOT NULL REFERENCES import_reports(id) ON DELETE CASCADE ON UPDATE CASCADE,
    record_index INTEGER NOT NULL,       -- position in the import batch
    entity_id BIGINT NULL,               -- NULL if creation was rejected
    action TEXT NOT NULL,                 -- 'create', 'update', 'skip', 'reject'
    field_errors JSONB NOT NULL DEFAULT '[]',   -- [{field, rule, message, value}]
    field_warnings JSONB NOT NULL DEFAULT '[]', -- [{field, rule, message, value}]
    field_diffs JSONB NOT NULL DEFAULT '[]',    -- [{field, old_value, new_value}]
    conflict_resolutions JSONB NOT NULL DEFAULT '[]', -- [{field, resolution, chosen_value}]
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_report_entries_report_id ON import_report_entries(report_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON import_report_entries
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `import_report_statuses` seeded with preview, committed, partial, failed, cancelled
- [ ] `import_reports` tracks summary counts (total, accepted, rejected, auto-corrected, skipped)
- [ ] `import_report_entries` stores per-record details including errors, warnings, diffs, conflicts
- [ ] `report_data` JSONB stores full machine-readable report
- [ ] All FK columns indexed, all tables have updated_at trigger
- [ ] Migration applies cleanly

### Task 1.3: Seed Default Validation Rules
**File:** `migrations/{timestamp}_seed_default_validation_rules.sql`

Seed validation rules for core entity types.

```sql
-- Character validation rules
INSERT INTO validation_rules (entity_type, field_name, rule_type_id, config, error_message) VALUES
    ('character', 'name', (SELECT id FROM validation_rule_types WHERE name = 'required'), '{}', 'Character name is required'),
    ('character', 'name', (SELECT id FROM validation_rule_types WHERE name = 'max_length'), '{"max": 200}', 'Character name must be 200 characters or fewer'),
    ('character', 'name', (SELECT id FROM validation_rule_types WHERE name = 'regex_pattern'), '{"pattern": "^[a-zA-Z0-9_\\- ]+$"}', 'Character name may only contain letters, numbers, spaces, hyphens, and underscores'),
    ('character', 'project_id', (SELECT id FROM validation_rule_types WHERE name = 'required'), '{}', 'Project is required');

-- Scene validation rules
INSERT INTO validation_rules (entity_type, field_name, rule_type_id, config, error_message) VALUES
    ('scene', 'character_id', (SELECT id FROM validation_rule_types WHERE name = 'required'), '{}', 'Character is required for a scene'),
    ('scene', 'scene_type_id', (SELECT id FROM validation_rule_types WHERE name = 'required'), '{}', 'Scene type is required');

-- Segment validation rules
INSERT INTO validation_rules (entity_type, field_name, rule_type_id, config, error_message) VALUES
    ('segment', 'scene_id', (SELECT id FROM validation_rule_types WHERE name = 'required'), '{}', 'Scene is required for a segment'),
    ('segment', 'sequence_index', (SELECT id FROM validation_rule_types WHERE name = 'min_value'), '{"min": 1}', 'Sequence index must be at least 1');
```

**Acceptance Criteria:**
- [ ] Default rules seeded for characters, scenes, and segments
- [ ] Rules reference `validation_rule_types` by name (subquery)
- [ ] Error messages are user-friendly, not technical
- [ ] Migration applies cleanly

---

## Phase 2: Validation Engine (Core)

### Task 2.1: Validation Rule Types
**File:** `src/validation/rules.rs`

Define Rust types for validation rules and results.

```rust
use serde::{Deserialize, Serialize};
use crate::types::DbId;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRule {
    pub id: DbId,
    pub entity_type: String,
    pub field_name: String,
    pub rule_type: String,
    pub config: serde_json::Value,
    pub error_message: String,
    pub severity: ValidationSeverity,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ValidationSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<FieldViolation>,
    pub warnings: Vec<FieldViolation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldViolation {
    pub field: String,
    pub rule_type: String,
    pub message: String,
    pub value: Option<serde_json::Value>,
}
```

**Acceptance Criteria:**
- [ ] `ValidationRule` represents a rule loaded from the DB
- [ ] `ValidationResult` aggregates errors and warnings with `is_valid` flag
- [ ] `FieldViolation` includes field name, rule type, message, and offending value
- [ ] Types are serializable for API responses

### Task 2.2: Rule Loader
**File:** `src/validation/loader.rs`

Load active validation rules for an entity type from the database.

```rust
pub async fn load_rules(
    pool: &PgPool,
    entity_type: &str,
    project_id: Option<DbId>,
) -> Result<Vec<ValidationRule>, sqlx::Error> {
    // Load global rules (project_id IS NULL) + project-specific rules
    sqlx::query_as!(
        ValidationRule,
        r#"
        SELECT vr.id, vr.entity_type, vr.field_name,
               vrt.name as rule_type, vr.config, vr.error_message,
               vr.severity
        FROM validation_rules vr
        JOIN validation_rule_types vrt ON vrt.id = vr.rule_type_id
        WHERE vr.entity_type = $1
          AND vr.is_active = true
          AND (vr.project_id IS NULL OR vr.project_id = $2)
        ORDER BY vr.sort_order
        "#,
        entity_type, project_id
    )
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] Loads global rules (project_id IS NULL) for the entity type
- [ ] Loads project-specific rules when project_id is provided
- [ ] Only loads active rules (`is_active = true`)
- [ ] Rules are ordered by `sort_order`

### Task 2.3: Rule Evaluator
**File:** `src/validation/evaluator.rs`

Core validation engine that evaluates rules against a data record.

```rust
use serde_json::Value;

pub fn evaluate_rules(
    rules: &[ValidationRule],
    data: &serde_json::Map<String, Value>,
) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for rule in rules {
        if let Some(violation) = evaluate_single_rule(rule, data) {
            match rule.severity {
                ValidationSeverity::Error => errors.push(violation),
                ValidationSeverity::Warning => warnings.push(violation),
            }
        }
    }

    ValidationResult {
        is_valid: errors.is_empty(),
        errors,
        warnings,
    }
}

fn evaluate_single_rule(
    rule: &ValidationRule,
    data: &serde_json::Map<String, Value>,
) -> Option<FieldViolation> {
    let field_value = data.get(&rule.field_name);

    match rule.rule_type.as_str() {
        "required" => evaluate_required(rule, field_value),
        "type_check" => evaluate_type_check(rule, field_value),
        "min_length" => evaluate_min_length(rule, field_value),
        "max_length" => evaluate_max_length(rule, field_value),
        "min_value" => evaluate_min_value(rule, field_value),
        "max_value" => evaluate_max_value(rule, field_value),
        "enum_values" => evaluate_enum_values(rule, field_value),
        "regex_pattern" => evaluate_regex_pattern(rule, field_value),
        _ => None, // Unknown rule types are silently skipped
    }
}
```

**Acceptance Criteria:**
- [ ] Evaluates all built-in rule types: required, type_check, min/max_length, min/max_value, enum_values, regex_pattern
- [ ] Returns aggregated `ValidationResult` with errors and warnings separated
- [ ] `is_valid` is false if any error-severity violations exist
- [ ] Warnings do not block validation
- [ ] Validation adds <500ms per 100 records (per success metric)
- [ ] Unit tests for each rule type

### Task 2.4: Validation Service
**File:** `src/validation/service.rs`

High-level service that loads rules and validates entity data.

```rust
pub struct ValidationService {
    pool: PgPool,
}

impl ValidationService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn validate_entity(
        &self,
        entity_type: &str,
        data: &serde_json::Map<String, serde_json::Value>,
        project_id: Option<DbId>,
    ) -> Result<ValidationResult, ValidationError> {
        let rules = loader::load_rules(&self.pool, entity_type, project_id).await?;
        Ok(evaluator::evaluate_rules(&rules, data))
    }

    pub async fn validate_batch(
        &self,
        entity_type: &str,
        records: &[serde_json::Map<String, serde_json::Value>],
        project_id: Option<DbId>,
    ) -> Result<Vec<ValidationResult>, ValidationError> {
        let rules = loader::load_rules(&self.pool, entity_type, project_id).await?;
        Ok(records.iter().map(|data| evaluator::evaluate_rules(&rules, data)).collect())
    }
}
```

**Acceptance Criteria:**
- [ ] `validate_entity` loads rules and validates a single record
- [ ] `validate_batch` loads rules once and validates multiple records efficiently
- [ ] Rules are loaded from DB, not hardcoded
- [ ] Project-specific rules override/extend global rules

---

## Phase 3: Import Preview & Conflict Detection

### Task 3.1: Import Preview Service
**File:** `src/validation/import_preview.rs`

Dry-run analysis that shows what an import will do without committing.

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct ImportPreview {
    pub total_records: usize,
    pub to_create: Vec<ImportPreviewEntry>,
    pub to_update: Vec<ImportPreviewEntry>,
    pub to_skip: Vec<ImportPreviewEntry>,
    pub invalid: Vec<ImportPreviewEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportPreviewEntry {
    pub record_index: usize,
    pub action: ImportAction,
    pub entity_id: Option<DbId>,
    pub validation_result: ValidationResult,
    pub field_diffs: Vec<FieldDiff>,
    pub conflicts: Vec<FieldConflict>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FieldDiff {
    pub field: String,
    pub current_value: Option<serde_json::Value>,
    pub incoming_value: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FieldConflict {
    pub field: String,
    pub db_value: serde_json::Value,
    pub file_value: serde_json::Value,
    pub suggested_resolution: ConflictResolution,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ConflictResolution {
    KeepDb,
    KeepFile,
    Merge,
}

pub async fn generate_import_preview(
    pool: &PgPool,
    entity_type: &str,
    records: &[serde_json::Map<String, serde_json::Value>],
    project_id: Option<DbId>,
) -> Result<ImportPreview, ImportError> {
    let validation_service = ValidationService::new(pool.clone());
    let mut preview = ImportPreview {
        total_records: records.len(),
        to_create: vec![],
        to_update: vec![],
        to_skip: vec![],
        invalid: vec![],
    };

    for (index, record) in records.iter().enumerate() {
        let result = validation_service.validate_entity(entity_type, record, project_id).await?;
        // Check if entity exists (by matching key fields)
        // Compute diffs for existing entities
        // Detect conflicts
        // Categorize: create, update, skip, or invalid
        todo!()
    }

    Ok(preview)
}
```

**Acceptance Criteria:**
- [ ] Preview classifies each record as create, update, skip, or invalid
- [ ] Updates include field-level diffs (current value vs. incoming value)
- [ ] Invalid records include specific validation errors
- [ ] Preview does not modify the database
- [ ] Preview accurately predicts import outcome (per success metric)

### Task 3.2: Conflict Detection
**File:** `src/validation/conflict.rs`

Detect and surface mismatches between imported data and existing records.

```rust
pub fn detect_conflicts(
    existing: &serde_json::Map<String, serde_json::Value>,
    incoming: &serde_json::Map<String, serde_json::Value>,
    ignore_fields: &[&str],
) -> Vec<FieldConflict> {
    let mut conflicts = Vec::new();
    for (key, incoming_val) in incoming {
        if ignore_fields.contains(&key.as_str()) {
            continue;
        }
        if let Some(existing_val) = existing.get(key) {
            if existing_val != incoming_val {
                conflicts.push(FieldConflict {
                    field: key.clone(),
                    db_value: existing_val.clone(),
                    file_value: incoming_val.clone(),
                    suggested_resolution: suggest_resolution(key, existing_val, incoming_val),
                });
            }
        }
    }
    conflicts
}

fn suggest_resolution(
    field: &str,
    _db_value: &serde_json::Value,
    _file_value: &serde_json::Value,
) -> ConflictResolution {
    // Heuristic: timestamps keep DB, content fields keep file
    if field.ends_with("_at") {
        ConflictResolution::KeepDb
    } else {
        ConflictResolution::KeepFile
    }
}
```

**Acceptance Criteria:**
- [ ] Detects field-level conflicts between existing DB record and incoming data
- [ ] Provides resolution options: KeepDb, KeepFile, Merge
- [ ] Suggests default resolution based on field type heuristics
- [ ] Ignores specified fields (e.g., `id`, `created_at`, `updated_at`)
- [ ] Conflicts are included in the import preview

### Task 3.3: Conflict Resolution Applier
**File:** `src/validation/conflict.rs`

Apply user-chosen conflict resolutions to produce the final record for insertion/update.

```rust
#[derive(Debug, Deserialize)]
pub struct ConflictResolutionChoice {
    pub field: String,
    pub resolution: ConflictResolution,
    pub custom_value: Option<serde_json::Value>, // for Merge
}

pub fn apply_resolutions(
    existing: &serde_json::Map<String, serde_json::Value>,
    incoming: &serde_json::Map<String, serde_json::Value>,
    resolutions: &[ConflictResolutionChoice],
) -> serde_json::Map<String, serde_json::Value> {
    let mut result = incoming.clone();

    for resolution in resolutions {
        match resolution.resolution {
            ConflictResolution::KeepDb => {
                if let Some(val) = existing.get(&resolution.field) {
                    result.insert(resolution.field.clone(), val.clone());
                }
            }
            ConflictResolution::KeepFile => { /* already in result */ }
            ConflictResolution::Merge => {
                if let Some(custom) = &resolution.custom_value {
                    result.insert(resolution.field.clone(), custom.clone());
                }
            }
        }
    }

    result
}
```

**Acceptance Criteria:**
- [ ] Applies KeepDb resolution by restoring DB value
- [ ] Applies KeepFile resolution by keeping incoming value
- [ ] Applies Merge resolution with a custom value
- [ ] Produces a clean final record ready for insertion/update
- [ ] Resolution choices are recorded in the import report

---

## Phase 4: Validation Reports

### Task 4.1: Report Generator
**File:** `src/validation/report.rs`

Generate and persist validation reports for each import operation.

```rust
pub async fn create_import_report(
    pool: &PgPool,
    preview: &ImportPreview,
    source_type: &str,
    source_reference: Option<&str>,
    entity_type: &str,
    project_id: Option<DbId>,
    status: &str,
) -> Result<DbId, sqlx::Error> {
    let report_id = sqlx::query_scalar!(
        r#"
        INSERT INTO import_reports (status_id, source_type, source_reference, entity_type,
                                    project_id, total_records, accepted, rejected,
                                    auto_corrected, skipped, report_data)
        VALUES (
            (SELECT id FROM import_report_statuses WHERE name = $1),
            $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
        RETURNING id
        "#,
        status, source_type, source_reference, entity_type, project_id,
        preview.total_records as i32,
        (preview.to_create.len() + preview.to_update.len()) as i32,
        preview.invalid.len() as i32,
        0i32, // auto_corrected
        preview.to_skip.len() as i32,
        serde_json::to_value(preview).unwrap()
    )
    .fetch_one(pool)
    .await?;

    // Insert per-record entries
    for entry in preview.to_create.iter()
        .chain(preview.to_update.iter())
        .chain(preview.to_skip.iter())
        .chain(preview.invalid.iter())
    {
        sqlx::query!(
            r#"
            INSERT INTO import_report_entries (report_id, record_index, entity_id, action,
                                               field_errors, field_warnings, field_diffs, conflict_resolutions)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
            report_id, entry.record_index as i32, entry.entity_id,
            serde_json::to_string(&entry.action).unwrap(),
            serde_json::to_value(&entry.validation_result.errors).unwrap(),
            serde_json::to_value(&entry.validation_result.warnings).unwrap(),
            serde_json::to_value(&entry.field_diffs).unwrap(),
            serde_json::to_value(&entry.conflicts).unwrap()
        )
        .execute(pool)
        .await?;
    }

    Ok(report_id)
}
```

**Acceptance Criteria:**
- [ ] Creates a report record with summary counts
- [ ] Creates per-record entries with errors, warnings, diffs, conflicts
- [ ] Report status matches the import stage (preview, committed, etc.)
- [ ] Full report data stored as JSONB for detailed queries
- [ ] Returns the report ID for retrieval

### Task 4.2: Report Export Service
**File:** `src/validation/report.rs`

Export reports as JSON or CSV.

```rust
pub async fn export_report_json(
    pool: &PgPool,
    report_id: DbId,
) -> Result<serde_json::Value, sqlx::Error> {
    let report = sqlx::query_as!(
        ImportReportRow,
        "SELECT * FROM import_reports WHERE id = $1",
        report_id
    )
    .fetch_one(pool)
    .await?;

    let entries = sqlx::query_as!(
        ImportReportEntryRow,
        "SELECT * FROM import_report_entries WHERE report_id = $1 ORDER BY record_index",
        report_id
    )
    .fetch_all(pool)
    .await?;

    Ok(serde_json::json!({
        "report": report,
        "entries": entries,
    }))
}

pub async fn export_report_csv(
    pool: &PgPool,
    report_id: DbId,
) -> Result<String, ExportError> {
    // Build CSV with columns: record_index, action, errors, warnings
    todo!()
}
```

**Acceptance Criteria:**
- [ ] JSON export includes full report with all entries
- [ ] CSV export includes one row per record with key fields
- [ ] Exported data is complete and auditable
- [ ] Report retrieval is efficient (indexed by report_id)

---

## Phase 5: API Endpoints

### Task 5.1: Validation Endpoint (Dry-Run)
**File:** `src/routes/validation.rs`

POST endpoint for dry-run validation/import preview.

```rust
use axum::{extract::State, Json, response::IntoResponse};

#[derive(Deserialize)]
pub struct ValidateRequest {
    pub entity_type: String,
    pub records: Vec<serde_json::Map<String, serde_json::Value>>,
    pub project_id: Option<DbId>,
}

pub async fn validate_import(
    State(pool): State<PgPool>,
    Json(body): Json<ValidateRequest>,
) -> Result<impl IntoResponse, AppError> {
    let preview = crate::validation::import_preview::generate_import_preview(
        &pool, &body.entity_type, &body.records, body.project_id,
    ).await?;

    // Create a preview report
    let report_id = crate::validation::report::create_import_report(
        &pool, &preview, "api", None, &body.entity_type, body.project_id, "preview",
    ).await?;

    Ok(Json(serde_json::json!({
        "report_id": report_id,
        "preview": preview,
    })))
}
```

**Acceptance Criteria:**
- [ ] `POST /api/validate` accepts entity_type, records array, and optional project_id
- [ ] Returns import preview with create/update/skip/invalid categorization
- [ ] Creates a persistent preview report
- [ ] Returns report_id for later retrieval
- [ ] No database modifications to entity tables

### Task 5.2: Import Commit Endpoint
**File:** `src/routes/validation.rs`

POST endpoint to commit a previewed import with conflict resolutions.

```rust
#[derive(Deserialize)]
pub struct CommitImportRequest {
    pub report_id: DbId,
    pub conflict_resolutions: Vec<ConflictResolutionChoice>,
}

pub async fn commit_import(
    State(pool): State<PgPool>,
    Json(body): Json<CommitImportRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Load preview report
    // Apply conflict resolutions
    // Execute inserts/updates in a transaction
    // Update report status to 'committed'
    todo!()
}
```

**Acceptance Criteria:**
- [ ] `POST /api/imports/:id/commit` commits a previewed import
- [ ] Accepts conflict resolutions for each conflicting field
- [ ] Executes all changes in a single database transaction
- [ ] Updates the import report status to 'committed'
- [ ] Returns the final report with actual outcomes

### Task 5.3: Report Retrieval Endpoint
**File:** `src/routes/validation.rs`

GET endpoint to retrieve validation/import reports.

```rust
pub async fn get_report(
    State(pool): State<PgPool>,
    Path(report_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    let report = crate::validation::report::export_report_json(&pool, report_id).await?;
    Ok(Json(report))
}

pub async fn export_report_csv_endpoint(
    State(pool): State<PgPool>,
    Path(report_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    let csv = crate::validation::report::export_report_csv(&pool, report_id).await?;
    Ok((
        [(axum::http::header::CONTENT_TYPE, "text/csv")],
        csv,
    ))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/imports/:id/report` returns full report as JSON
- [ ] `GET /api/imports/:id/report/csv` returns report as CSV download
- [ ] Returns 404 for nonexistent report IDs
- [ ] CSV has proper headers and encoding

### Task 5.4: Route Registration
**File:** `src/routes/mod.rs`

Register validation routes.

**Acceptance Criteria:**
- [ ] All validation/import endpoints are registered
- [ ] Routes use correct HTTP methods
- [ ] Router integrates with the main application router

---

## Phase 6: Frontend — Import Preview UI

### Task 6.1: Import Preview Component
**File:** `frontend/src/components/validation/ImportPreview.tsx`

Display dry-run import results with diff view.

```typescript
interface ImportPreviewProps {
  preview: ImportPreviewData;
  onCommit: (resolutions: ConflictResolution[]) => void;
  onCancel: () => void;
}

export const ImportPreview: React.FC<ImportPreviewProps> = ({
  preview,
  onCommit,
  onCancel,
}) => {
  return (
    <div className="import-preview">
      <div className="summary">
        <span className="create">{preview.to_create.length} to create</span>
        <span className="update">{preview.to_update.length} to update</span>
        <span className="skip">{preview.to_skip.length} to skip</span>
        <span className="invalid">{preview.invalid.length} invalid</span>
      </div>
      {/* Per-record entries with diff view */}
      {/* Conflict resolution controls */}
      <div className="actions">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={() => onCommit(resolvedConflicts)} disabled={preview.invalid.length > 0}>
          Commit Import
        </button>
      </div>
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] Summary bar shows create/update/skip/invalid counts
- [ ] Each record expandable to show field-level details
- [ ] Updates show diff view (current vs. incoming, color-coded)
- [ ] Invalid records show inline validation errors
- [ ] Commit button disabled if there are unresolved errors

### Task 6.2: Conflict Resolution UI
**File:** `frontend/src/components/validation/ConflictResolver.tsx`

Per-field conflict resolution interface.

```typescript
interface ConflictResolverProps {
  conflicts: FieldConflict[];
  onResolve: (resolutions: ConflictResolutionChoice[]) => void;
}

export const ConflictResolver: React.FC<ConflictResolverProps> = ({
  conflicts,
  onResolve,
}) => {
  // Per-field radio: Keep DB | Keep File | Custom merge
  // Batch resolution for identical conflicts
};
```

**Acceptance Criteria:**
- [ ] Per-field radio selection: Keep DB, Keep File, Merge
- [ ] Merge option allows custom value entry
- [ ] Batch resolution for repeated conflict patterns
- [ ] All conflicts must be resolved before commit

### Task 6.3: Validation Report Viewer
**File:** `frontend/src/components/validation/ReportViewer.tsx`

Display stored validation reports with export options.

**Acceptance Criteria:**
- [ ] Shows report summary (total, accepted, rejected, auto-corrected)
- [ ] Expandable per-record details with errors and warnings
- [ ] Export buttons for JSON and CSV
- [ ] Reports filterable by date, entity type, status

---

## Phase 7: Testing

### Task 7.1: Rule Evaluator Unit Tests
**File:** `tests/validation_evaluator_tests.rs`

Test each built-in rule type.

**Acceptance Criteria:**
- [ ] Test required rule: passes with value, fails without
- [ ] Test max_length rule: passes within limit, fails over
- [ ] Test min_value/max_value rules: boundary conditions
- [ ] Test enum_values rule: passes for valid, fails for invalid
- [ ] Test regex_pattern rule: matches and non-matches
- [ ] Test combined rules on a single entity

### Task 7.2: Import Preview Integration Tests
**File:** `tests/validation_import_tests.rs`

Test full import preview flow against test database.

**Acceptance Criteria:**
- [ ] Preview correctly identifies records to create (no existing match)
- [ ] Preview correctly identifies records to update (existing match with changes)
- [ ] Preview correctly identifies records to skip (no changes)
- [ ] Preview correctly flags invalid records with specific errors
- [ ] Conflict detection works for differing field values

### Task 7.3: Report Persistence Tests
**File:** `tests/validation_report_tests.rs`

Test report creation, storage, and export.

**Acceptance Criteria:**
- [ ] Report created with correct summary counts
- [ ] Per-record entries stored with errors, warnings, diffs
- [ ] JSON export matches stored data
- [ ] CSV export is well-formed

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_validation_rules.sql` | Validation rules and rule types tables |
| `migrations/{timestamp}_create_import_reports.sql` | Import reports and entries tables |
| `migrations/{timestamp}_seed_default_validation_rules.sql` | Default rules for core entities |
| `src/validation/mod.rs` | Module root |
| `src/validation/rules.rs` | Rule and result types |
| `src/validation/loader.rs` | Rule loader from database |
| `src/validation/evaluator.rs` | Core rule evaluation engine |
| `src/validation/service.rs` | High-level validation service |
| `src/validation/import_preview.rs` | Dry-run import analysis |
| `src/validation/conflict.rs` | Conflict detection and resolution |
| `src/validation/report.rs` | Report generation and export |
| `src/routes/validation.rs` | API endpoints |
| `frontend/src/components/validation/ImportPreview.tsx` | Import preview UI |
| `frontend/src/components/validation/ConflictResolver.tsx` | Conflict resolution UI |
| `frontend/src/components/validation/ReportViewer.tsx` | Report viewer UI |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId` type alias, migration framework, `trigger_set_updated_at()`
- PRD-001: Entity table schemas that validation rules enforce

### New Infrastructure Needed
- `regex` crate for regex_pattern rule type
- `csv` crate for CSV export

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Validation Engine (Tasks 2.1-2.4)
3. Phase 3: Import Preview & Conflict Detection (Tasks 3.1-3.3)
4. Phase 4: Validation Reports (Tasks 4.1-4.2)
5. Phase 5: API Endpoints (Tasks 5.1-5.4)

**MVP Success Criteria:**
- Validation catches 100% of schema violations before DB insertion
- Import preview accurately classifies records
- Conflict detection surfaces all field-level mismatches
- Reports are persisted and retrievable

### Post-MVP Enhancements
1. Phase 6: Frontend UI (Tasks 6.1-6.3)
2. Phase 7: Testing (Tasks 7.1-7.3)
3. Custom validation hooks (PRD Phase 2)

---

## Notes

1. **Auto-correction:** The current design flags issues but does not auto-correct. Auto-correction (e.g., trimming whitespace, normalizing case) can be added as a `correction` rule type that transforms the value and logs the correction.
2. **Performance:** For large imports, the rule loader should cache rules per entity type to avoid repeated DB queries. The batch validation method loads rules once.
3. **Custom hooks (Post-MVP):** Studio-defined validation scripts (PRD Phase 2) would add a `custom_validation_scripts` table and a sandboxed execution environment (e.g., WASM or Lua).
4. **Integration with other PRDs:** PRD-013 (metadata), PRD-016 (bulk import), and PRD-066 (metadata editor) all call the validation service before writing data.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

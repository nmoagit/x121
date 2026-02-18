# Task List: Character Metadata Editor

**PRD Reference:** `design/prds/066-prd-character-metadata-editor.md`
**Scope:** Build a dedicated metadata editing UI with form view, spreadsheet view, bulk editing, CSV/JSON import/export, real-time validation, and completeness tracking for character metadata.

## Overview

This PRD creates the primary interface for viewing and editing character metadata. It provides two modes: a form view for detailed per-character editing with grouped fields and inline validation, and a spreadsheet view for efficient cross-character bulk editing using a data grid. The editor integrates with PRD-014 for real-time schema validation, PRD-013 for metadata JSON generation, and supports CSV/JSON round-trip for external editing workflows. Completeness tracking ensures all required fields are filled before delivery.

### What Already Exists
- PRD-000: Database conventions
- PRD-001: Character entity tables with metadata fields
- PRD-013: Metadata JSON generation from DB records
- PRD-014: Validation rules engine for schema enforcement

### What We're Building
1. Backend metadata read/write API with validation integration
2. Form view component with grouped, typed fields and inline validation
3. Spreadsheet view component with inline editing (AG Grid or similar)
4. Bulk edit dialog for multi-character field updates
5. CSV/JSON export and import with diff preview
6. Completeness tracking service and UI indicators

### Key Design Decisions
1. **No new tables** — This PRD reads and writes existing character metadata fields. No schema changes needed.
2. **Reuse PRD-014 validation** — Every save (form or spreadsheet) runs through the validation service. Errors shown inline.
3. **AG Grid for spreadsheet** — A mature data grid library that handles virtual scrolling, inline editing, sorting, and filtering for 200+ rows.
4. **Completeness is computed, not stored** — Required field completeness is calculated on the fly from PRD-014 rules, not stored as a separate field.

---

## Phase 1: Backend API

### Task 1.1: Character Metadata Read Endpoint
**File:** `src/routes/character_metadata.rs`

Return structured metadata for a single character.

```rust
pub async fn get_character_metadata(
    State(pool): State<PgPool>,
    Path(character_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    let character = sqlx::query!(
        "SELECT * FROM characters WHERE id = $1",
        character_id
    )
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    // Build structured metadata response
    Ok(Json(build_metadata_response(&character)))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/characters/:id/metadata` returns all metadata fields
- [ ] Fields grouped by category (biographical, physical, preferences)
- [ ] Includes field type info for the form view
- [ ] Returns 404 for nonexistent character

### Task 1.2: Character Metadata Update Endpoint
**File:** `src/routes/character_metadata.rs`

Update metadata fields with validation.

```rust
pub async fn update_character_metadata(
    State(pool): State<PgPool>,
    Path(character_id): Path<DbId>,
    Json(body): Json<serde_json::Map<String, serde_json::Value>>,
) -> Result<impl IntoResponse, AppError> {
    // Validate through PRD-014
    let validation_service = ValidationService::new(pool.clone());
    let result = validation_service.validate_entity("character", &body, None).await?;

    if !result.is_valid {
        return Ok(Json(serde_json::json!({
            "status": "validation_failed",
            "errors": result.errors,
        })).into_response());
    }

    // Apply updates
    update_character_fields(&pool, character_id, &body).await?;

    Ok(Json(serde_json::json!({ "status": "updated" })).into_response())
}
```

**Acceptance Criteria:**
- [ ] `PUT /api/characters/:id/metadata` updates metadata fields
- [ ] Runs PRD-014 validation before saving
- [ ] Returns validation errors if invalid (does not save)
- [ ] Returns success with updated metadata if valid

### Task 1.3: Batch Metadata Read Endpoint
**File:** `src/routes/character_metadata.rs`

Return metadata for all characters in a project (for spreadsheet view).

```rust
pub async fn list_project_metadata(
    State(pool): State<PgPool>,
    Path(project_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    let characters = sqlx::query!(
        "SELECT * FROM characters WHERE project_id = $1 ORDER BY name",
        project_id
    )
    .fetch_all(&pool)
    .await?;

    let metadata: Vec<_> = characters.iter().map(|c| build_metadata_response(c)).collect();
    Ok(Json(metadata))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/projects/:id/characters/metadata` returns all characters' metadata
- [ ] Handles 200+ characters without timeout
- [ ] Supports pagination for very large projects

### Task 1.4: Completeness Calculation Service
**File:** `src/metadata/completeness.rs`

Calculate required field completeness per character and per project.

```rust
pub async fn calculate_completeness(
    pool: &PgPool,
    character_id: DbId,
) -> Result<CompletenessResult, MetadataError> {
    let rules = load_rules(pool, "character", None).await?;
    let required_rules: Vec<_> = rules.iter()
        .filter(|r| r.rule_type == "required")
        .collect();

    let character = get_character(pool, character_id).await?;
    let data = character_to_map(&character);

    let total_required = required_rules.len();
    let filled = required_rules.iter()
        .filter(|r| data.get(&r.field_name).map(|v| !v.is_null()).unwrap_or(false))
        .count();

    Ok(CompletenessResult {
        character_id,
        total_required,
        filled,
        missing_fields: required_rules.iter()
            .filter(|r| !data.get(&r.field_name).map(|v| !v.is_null()).unwrap_or(false))
            .map(|r| r.field_name.clone())
            .collect(),
        percentage: if total_required > 0 { (filled as f64 / total_required as f64) * 100.0 } else { 100.0 },
    })
}

pub async fn calculate_project_completeness(
    pool: &PgPool,
    project_id: DbId,
) -> Result<ProjectCompleteness, MetadataError> {
    let characters = get_project_characters(pool, project_id).await?;
    let mut complete = 0;
    let mut results = Vec::new();

    for ch in &characters {
        let result = calculate_completeness(pool, ch.id).await?;
        if result.percentage >= 100.0 { complete += 1; }
        results.push(result);
    }

    Ok(ProjectCompleteness {
        total_characters: characters.len(),
        complete_characters: complete,
        per_character: results,
    })
}
```

**Acceptance Criteria:**
- [ ] Calculates percentage of required fields filled per character
- [ ] Lists missing required fields by name
- [ ] Project-level summary: N of M characters complete
- [ ] Computed from PRD-014 rules (not hardcoded)

### Task 1.5: CSV Export/Import Endpoints
**File:** `src/routes/character_metadata.rs`

```rust
pub async fn export_metadata_csv(
    State(pool): State<PgPool>,
    Path(project_id): Path<DbId>,
) -> Result<impl IntoResponse, AppError> {
    let characters = get_project_characters(&pool, project_id).await?;
    let csv = build_csv_from_characters(&characters)?;
    Ok((
        [(axum::http::header::CONTENT_TYPE, "text/csv"),
         (axum::http::header::CONTENT_DISPOSITION, "attachment; filename=\"metadata.csv\"")],
        csv,
    ))
}

pub async fn import_metadata_csv(
    State(pool): State<PgPool>,
    Path(project_id): Path<DbId>,
    body: axum::body::Bytes,
) -> Result<impl IntoResponse, AppError> {
    let records = parse_csv(&body)?;
    // Match to existing characters by ID
    // Validate via PRD-014
    // Return diff preview
    todo!()
}
```

**Acceptance Criteria:**
- [ ] `GET /api/projects/:id/characters/metadata/csv` exports CSV
- [ ] `POST /api/projects/:id/characters/metadata/csv` imports CSV with preview
- [ ] CSV includes character ID for matching on re-import
- [ ] One row per character, one column per metadata field
- [ ] Import returns diff preview before committing

---

## Phase 2: Frontend — Form View

### Task 2.1: Metadata Form Component
**File:** `frontend/src/components/metadata/MetadataForm.tsx`

Per-character detail editing form with grouped fields.

```typescript
interface MetadataFormProps {
  characterId: number;
  metadata: CharacterMetadata;
  onSave: (updates: Partial<CharacterMetadata>) => Promise<void>;
}

export const MetadataForm: React.FC<MetadataFormProps> = ({ characterId, metadata, onSave }) => {
  const [formData, setFormData] = useState(metadata);
  const [errors, setErrors] = useState<FieldViolation[]>([]);
  const [saving, setSaving] = useState(false);

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Real-time validation debounced
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(formData);
    } catch (e) {
      // Handle validation errors
    }
    setSaving(false);
  };

  return (
    <form className="metadata-form">
      <FieldGroup title="Biographical">
        <TextField field="name" value={formData.name} onChange={handleFieldChange} required error={getError('name')} />
        <TextAreaField field="description" value={formData.description} onChange={handleFieldChange} />
      </FieldGroup>
      <FieldGroup title="Physical Attributes">
        <TextField field="height" value={formData.height} onChange={handleFieldChange} />
        <SelectField field="hair_color" value={formData.hair_color} options={hairColorOptions} onChange={handleFieldChange} />
      </FieldGroup>
      <button onClick={handleSave} disabled={saving}>Save</button>
    </form>
  );
};
```

**Acceptance Criteria:**
- [ ] Fields grouped by category (biographical, physical, preferences)
- [ ] Field types: text, number, date, select, multi-select
- [ ] Required fields clearly marked with visual indicator
- [ ] Inline validation errors within 200ms of field change (per success metric)
- [ ] Save button triggers PRD-014 validation

### Task 2.2: Completeness Progress Bar
**File:** `frontend/src/components/metadata/CompletenessBar.tsx`

```typescript
interface CompletenessBarProps {
  percentage: number;
  filled: number;
  total: number;
  missingFields: string[];
}

export const CompletenessBar: React.FC<CompletenessBarProps> = ({
  percentage, filled, total, missingFields,
}) => (
  <div className="completeness-bar">
    <div className="progress" style={{ width: `${percentage}%` }} />
    <span>{filled} / {total} required fields</span>
    {missingFields.length > 0 && (
      <div className="missing">Missing: {missingFields.join(', ')}</div>
    )}
  </div>
);
```

**Acceptance Criteria:**
- [ ] Visual progress bar showing percentage
- [ ] Shows "N of M required fields" text
- [ ] Lists missing fields on hover or expand
- [ ] Red/incomplete vs. green/complete color states

---

## Phase 3: Frontend — Spreadsheet View

### Task 3.1: Spreadsheet Grid Component
**File:** `frontend/src/components/metadata/MetadataSpreadsheet.tsx`

Data grid with inline editing for all characters in a project.

```typescript
import { AgGridReact } from 'ag-grid-react';

interface MetadataSpreadsheetProps {
  projectId: number;
}

export const MetadataSpreadsheet: React.FC<MetadataSpreadsheetProps> = ({ projectId }) => {
  const [rowData, setRowData] = useState<CharacterMetadata[]>([]);
  const [columnDefs] = useState([
    { field: 'name', headerName: 'Name', editable: true, pinned: 'left' },
    { field: 'description', headerName: 'Description', editable: true },
    { field: 'height', headerName: 'Height', editable: true },
    { field: 'hair_color', headerName: 'Hair Color', editable: true, cellEditor: 'agSelectCellEditor' },
    // ... more fields
    { field: 'completeness', headerName: 'Complete', cellRenderer: CompletenessRenderer },
  ]);

  const onCellValueChanged = async (params: CellValueChangedEvent) => {
    // Save single cell change via API
    // Validate and show error if invalid
  };

  return (
    <div className="metadata-spreadsheet">
      <AgGridReact
        rowData={rowData}
        columnDefs={columnDefs}
        onCellValueChanged={onCellValueChanged}
        defaultColDef={{ sortable: true, filter: true, resizable: true }}
      />
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] Characters as rows, metadata fields as columns
- [ ] Inline editing directly in cells
- [ ] Sorting by any column
- [ ] Filtering by field values
- [ ] Column resizing and reordering
- [ ] Completeness column with visual indicator
- [ ] Handles 200+ characters without performance degradation (per success metric)
- [ ] Keyboard navigation (Tab, Enter, Escape)

### Task 3.2: Bulk Edit Dialog
**File:** `frontend/src/components/metadata/BulkEditDialog.tsx`

Edit a field across multiple selected characters.

```typescript
interface BulkEditDialogProps {
  selectedCharacterIds: number[];
  onApply: (field: string, value: any) => Promise<void>;
  onClose: () => void;
}

export const BulkEditDialog: React.FC<BulkEditDialogProps> = ({
  selectedCharacterIds, onApply, onClose,
}) => {
  const [field, setField] = useState('');
  const [value, setValue] = useState('');

  return (
    <div className="bulk-edit-dialog">
      <h3>Edit {selectedCharacterIds.length} characters</h3>
      <select value={field} onChange={e => setField(e.target.value)}>
        {metadataFields.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
      <input value={value} onChange={e => setValue(e.target.value)} />
      <p>This will update {selectedCharacterIds.length} characters.</p>
      <button onClick={() => onApply(field, value)}>Apply</button>
      <button onClick={onClose}>Cancel</button>
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] Select field to edit from dropdown
- [ ] Enter new value
- [ ] Confirmation showing character count
- [ ] Applies to all selected characters on confirm

---

## Phase 4: Import/Export

### Task 4.1: CSV Export Component
**File:** `frontend/src/components/metadata/CsvExport.tsx`

**Acceptance Criteria:**
- [ ] Button to export all metadata as CSV
- [ ] Download triggers browser file save
- [ ] CSV includes character ID for re-import matching

### Task 4.2: CSV Import Component
**File:** `frontend/src/components/metadata/CsvImport.tsx`

**Acceptance Criteria:**
- [ ] File upload for CSV
- [ ] Diff preview showing current vs. incoming values
- [ ] Validation errors shown per row
- [ ] Commit or cancel buttons
- [ ] Round-trip preserves all data types (per success metric)

---

## Phase 5: Testing

### Task 5.1: Validation Integration Tests
**File:** `tests/metadata_editor_tests.rs`

**Acceptance Criteria:**
- [ ] Save with valid data succeeds
- [ ] Save with invalid data returns validation errors
- [ ] Required field missing is flagged correctly
- [ ] Validation runs within 200ms

### Task 5.2: Completeness Tests
**File:** `tests/metadata_completeness_tests.rs`

**Acceptance Criteria:**
- [ ] Empty character shows 0% completeness
- [ ] All required fields filled shows 100%
- [ ] Missing fields listed correctly
- [ ] Project-level completeness aggregates correctly

### Task 5.3: CSV Round-Trip Tests
**File:** `tests/metadata_csv_tests.rs`

**Acceptance Criteria:**
- [ ] Export produces valid CSV with correct headers
- [ ] Import matches characters by ID
- [ ] Re-import of exported data produces zero diffs
- [ ] Data types preserved through round-trip

---

## Relevant Files

| File | Description |
|------|-------------|
| `src/routes/character_metadata.rs` | API endpoints for metadata CRUD |
| `src/metadata/completeness.rs` | Completeness calculation service |
| `frontend/src/components/metadata/MetadataForm.tsx` | Form view for per-character editing |
| `frontend/src/components/metadata/CompletenessBar.tsx` | Completeness progress indicator |
| `frontend/src/components/metadata/MetadataSpreadsheet.tsx` | Spreadsheet view (AG Grid) |
| `frontend/src/components/metadata/BulkEditDialog.tsx` | Bulk edit dialog |
| `frontend/src/components/metadata/CsvExport.tsx` | CSV export button |
| `frontend/src/components/metadata/CsvImport.tsx` | CSV import with preview |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId`, migration framework
- PRD-001: Character entity tables
- PRD-013: Metadata JSON generation (regenerate after edits)
- PRD-014: `ValidationService` for real-time validation

### New Infrastructure Needed
- `ag-grid-react` npm package for spreadsheet view
- `csv` crate (Rust) for CSV generation/parsing

## Implementation Order

### MVP
1. Phase 1: Backend API (Tasks 1.1-1.5)
2. Phase 2: Form View (Tasks 2.1-2.2)
3. Phase 3: Spreadsheet View (Tasks 3.1-3.2)
4. Phase 4: Import/Export (Tasks 4.1-4.2)

**MVP Success Criteria:**
- Form validation within 200ms
- Spreadsheet handles 200+ characters
- CSV round-trip preserves all data
- Completeness tracking accurate

### Post-MVP Enhancements
1. Phase 5: Testing (Tasks 5.1-5.3)
2. Diff view on import (PRD Phase 2)

---

## Notes

1. **View switching:** Switching between form and spreadsheet view should preserve the selected character and scroll position.
2. **Metadata regeneration:** After any metadata edit, trigger PRD-013 metadata JSON regeneration (or mark as stale for deferred regeneration).
3. **Concurrent editing:** For MVP, last-write-wins. A future enhancement could use optimistic locking (version column) to detect conflicts.
4. **AG Grid license:** AG Grid Community Edition is MIT-licensed and sufficient for basic inline editing. Enterprise features (clipboard, pivot) require a commercial license.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

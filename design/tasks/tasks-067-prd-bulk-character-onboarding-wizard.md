# Task List: Bulk Character Onboarding Wizard

**PRD Reference:** `design/prds/067-prd-bulk-character-onboarding-wizard.md`
**Scope:** Guided step-by-step wizard for onboarding multiple characters simultaneously with batch operations at each step: upload, variant generation, review, metadata, scene type selection, and submission.

## Overview

Onboarding 10 characters individually means navigating to the character page 10 times, uploading 10 times, etc. This wizard consolidates the entire onboarding flow into 6 guided steps with batch operations: (1) upload all source images, (2) batch variant generation, (3) variant review gallery, (4) bulk metadata entry, (5) scene type selection, (6) summary and submission. The wizard saves state after each step for resume capability.

### What Already Exists
- PRD-021: Source images, PRD-022: QA, PRD-023: Scene types
- PRD-046: Worker pool, PRD-057: Batch orchestrator
- PRD-060: Character library, PRD-061: Cost estimation, PRD-066: Metadata editor

### What We're Building
1. `onboarding_sessions` table for wizard state persistence
2. Wizard orchestrator coordinating all steps
3. 6-step wizard UI with progress tracking
4. Resume capability (save and continue later)

### Key Design Decisions
1. **State persistence** — Wizard state saved to database after each step. Users can close the browser and resume later.
2. **Reuse existing services** — Each wizard step delegates to existing PRD services (PRD-021 for upload, PRD-022 for QA, etc.). No duplicate logic.
3. **Step validation** — Cannot advance past a step until its requirements are met (e.g., cannot do variant generation without source images).

---

## Phase 1: Database Schema

### Task 1.1: Onboarding Sessions Table
**File:** `migrations/YYYYMMDD_create_onboarding_sessions.sql`

```sql
CREATE TABLE onboarding_sessions (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_by_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    current_step INTEGER NOT NULL DEFAULT 1,
    step_data JSONB NOT NULL DEFAULT '{}',  -- Per-step state
    character_ids BIGINT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'in_progress',  -- 'in_progress', 'completed', 'abandoned'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_sessions_project_id ON onboarding_sessions(project_id);
CREATE INDEX idx_onboarding_sessions_created_by_id ON onboarding_sessions(created_by_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON onboarding_sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

---

## Phase 2: Wizard Orchestrator

### Task 2.1: Wizard Service
**File:** `src/services/onboarding_wizard_service.rs`

```rust
pub async fn advance_step(pool: &sqlx::PgPool, session_id: DbId, step_data: serde_json::Value) -> Result<OnboardingSession, anyhow::Error> {
    // 1. Validate current step is complete
    // 2. Save step data
    // 3. Advance to next step
    // 4. Return updated session
    todo!()
}

pub async fn step1_upload(pool: &sqlx::PgPool, session_id: DbId, files: Vec<UploadedFile>) -> Result<Vec<DbId>, anyhow::Error> {
    // Create one character per image via PRD-021
    // Run duplicate detection via PRD-079
    // Use filename as initial character name
    todo!()
}

pub async fn step1_csv_upload(pool: &sqlx::PgPool, session_id: DbId, csv_file: UploadedFile) -> Result<Vec<DbId>, anyhow::Error> {
    // 1. Parse CSV/text file (detect format: CSV with headers vs. plain text one-name-per-line)
    // 2. Map CSV columns to character fields (name, metadata, settings from PRD-01 v1.1)
    // 3. Preview parsed characters before creation
    // 4. Create characters in database and add to library (PRD-60)
    // 5. Run duplicate detection via PRD-079
    // 6. Return created character IDs
    todo!()
}

pub async fn step2_generate_variants(pool: &sqlx::PgPool, session_id: DbId) -> Result<(), anyhow::Error> {
    // Dispatch batch variant generation via PRD-021 + PRD-046
    todo!()
}

// ... step3 through step6
```

**Acceptance Criteria:**
- [ ] Each step delegates to existing PRD services
- [ ] State saved after each step
- [ ] Cannot advance without completing current step
- [ ] Resume: reload last saved state

---

## Phase 3: API & Frontend

### Task 3.1: Wizard API
**File:** `src/routes/onboarding_routes.rs`

```rust
/// POST /api/onboarding-sessions — Start new wizard
/// GET /api/onboarding-sessions/:id — Get current state
/// POST /api/onboarding-sessions/:id/advance — Advance step
/// POST /api/onboarding-sessions/:id/step/:n — Execute step action
```

### Task 3.2: Wizard UI Component
**File:** `frontend/src/components/onboarding/OnboardingWizard.tsx`

```typescript
export function OnboardingWizard({ sessionId }: { sessionId: number }) {
  // Step indicators (1 of 6, with completed steps checked)
  // Current step content
  // Back/Next navigation
  // "Save & Close" button for resume later
}
```

**Acceptance Criteria:**
- [ ] Clear step indicators with progress
- [ ] Back navigation without losing progress
- [ ] Save & Close for later resume
- [ ] Step content renders appropriate component per step

### Task 3.3: Step Components
**Files:**
- `frontend/src/components/onboarding/Step1Upload.tsx`
- `frontend/src/components/onboarding/Step2VariantGeneration.tsx`
- `frontend/src/components/onboarding/Step3VariantReview.tsx`
- `frontend/src/components/onboarding/Step4Metadata.tsx`
- `frontend/src/components/onboarding/Step5SceneTypes.tsx`
- `frontend/src/components/onboarding/Step6Summary.tsx`

**Acceptance Criteria:**
- [ ] Step 1: Multi-file upload OR CSV/text upload, character preview list
- [ ] Step 1 (CSV mode): CSV column mapping, text file one-name-per-line support, preview table of parsed characters
- [ ] Step 2: One-click batch variant generation with progress
- [ ] Step 3: Grid review with bulk-approve
- [ ] Step 4: Spreadsheet-style metadata entry (reuse PRD-066)
- [ ] Step 5: Scene type selection with matrix preview (PRD-057)
- [ ] Step 6: Summary with cost estimate (PRD-061), submit button, and selective batch video generation (all/some/one characters submitted to PRD-057 Batch Production Orchestrator)

---

## Phase 4: Testing

### Task 4.1: Wizard Tests
**File:** `tests/onboarding_wizard_test.rs`

**Acceptance Criteria:**
- [ ] Full 6-step flow completes successfully
- [ ] State persists across browser sessions
- [ ] Step validation prevents skipping

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_onboarding_sessions.sql` | Session persistence |
| `src/services/onboarding_wizard_service.rs` | Wizard orchestrator |
| `src/routes/onboarding_routes.rs` | Wizard API |
| `frontend/src/components/onboarding/OnboardingWizard.tsx` | Wizard shell |
| `frontend/src/components/onboarding/Step1Upload.tsx` - `Step6Summary.tsx` | Step components |

## Implementation Order

### MVP
1. Phase 1 — Task 1.1
2. Phase 2 — Task 2.1
3. Phase 3 — Tasks 3.1-3.3

### Post-MVP
1. Template-based onboarding (pre-select from saved config)

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-067 v1.0
- **v1.1** (2026-02-19): Added CSV/text file upload as alternative onboarding path (Task 2.1, 3.3 Step 1) and selective batch video generation in Step 6

# Task List: LLM-Driven Metadata Refinement Pipeline

**PRD Reference:** `design/prds/125-prd-llm-metadata-refinement-pipeline.md`
**Scope:** Build an LLM-driven pipeline for formatting, enriching, and quality-checking character metadata, with diff-based human approval, outdated dependency chain tracking, and source file protection.

## Overview

Character metadata is generated from Bio and ToV source files through `fix_metadata.py`. This PRD adds an LLM layer that formats and enriches the data before/after script execution, iteratively checks quality, and presents results for human approval via a diff view. It also introduces an "Outdated" flag system for metadata dependency tracking and enforces source file (bio.json/tov.json) protection during metadata imports.

### What Already Exists
- `x121_core::metadata_transform` -- Rust metadata transformation engine (emoji removal, key normalization, category extraction)
- `x121_db::models::character_metadata_version` -- `CharacterMetadataVersion` with `source_bio`, `source_tov`, `generation_report`, `is_active`, versioning
- `x121_db::repositories::CharacterMetadataVersionRepo` -- CRUD, activation, rejection, soft-delete
- `x121_api::handlers::character_metadata_version` -- generate, create manual, activate, reject, delete endpoints
- `apps/frontend/src/features/characters/hooks/use-metadata-versions.ts` -- TanStack Query hooks for version CRUD
- `apps/frontend/src/features/characters/tabs/CharacterMetadataTab.tsx` -- metadata tab with version management UI
- `x121_core::script_orchestrator` -- script execution with venv isolation, timeout, capture (PRD-009)
- `x121_db::repositories::PlatformSettingRepo` -- platform settings storage (PRD-110)
- `crates/cloud::crypto` -- AES-256-GCM encryption (PRD-114)
- `apps/backend/scripts/fix_metadata.py` -- the Python metadata fixing script

### What We're Building
1. **Database:** `refinement_jobs` table, `outdated_at`/`outdated_reason` columns on `character_metadata_versions`, category values for job statuses
2. **Backend:** LLM client service, refinement orchestrator (LLM + script execution loop), outdated flag management, source file protection enforcement, refinement job CRUD
3. **Frontend:** Diff view component, refinement trigger UI, job progress tracker, outdated badge, cherry-pick approval, source file protection notice

### Key Design Decisions
1. **LLM client in `core` crate** -- The LLM HTTP client is a thin wrapper in `core` (zero internal deps except `reqwest`). It handles JSON Mode / Function Calling for structured output.
2. **Refinement orchestrator in `core` crate** -- The multi-step loop (LLM format -> script run -> LLM check -> repeat) is pure business logic in `core`, orchestrated by an API handler that manages async state.
3. **Outdated flag via application logic** -- Not a DB trigger. The `activate` handler checks if the newly activated version's source differs from the metadata's source, and sets the flag. Clearer, more testable.
4. **Diff computation on frontend** -- JSON deep-diff runs client-side for responsive cherry-pick interaction. The backend provides the two metadata objects; the frontend computes and renders the diff.
5. **Reuse metadata version infrastructure** -- Approved refinements create standard `character_metadata_versions` rows. No parallel versioning system.

---

## Phase 1: Database Migrations

### Task 1.1: Add outdated columns to `character_metadata_versions`
**File:** `apps/db/migrations/YYYYMMDD000001_add_outdated_to_metadata_versions.sql`

Add columns to track when and why a metadata version was flagged as outdated.

```sql
ALTER TABLE character_metadata_versions
    ADD COLUMN outdated_at TIMESTAMPTZ,
    ADD COLUMN outdated_reason TEXT;

CREATE INDEX idx_cmv_outdated ON character_metadata_versions(character_id)
    WHERE outdated_at IS NOT NULL AND is_active = true AND deleted_at IS NULL;

COMMENT ON COLUMN character_metadata_versions.outdated_at IS 'Set when source Bio/ToV changes after this version was generated';
COMMENT ON COLUMN character_metadata_versions.outdated_reason IS 'Human-readable reason: which source changed and when';
```

**Acceptance Criteria:**
- [ ] Migration runs successfully on existing database with data
- [ ] Existing rows have `outdated_at = NULL` (not outdated by default)
- [ ] Index covers the common query: "find active outdated versions for a character"

### Task 1.2: Create `refinement_jobs` table
**File:** `apps/db/migrations/YYYYMMDD000002_create_refinement_jobs.sql`

Track LLM refinement jobs with status, iterations, and results.

```sql
-- Category group for refinement job statuses
INSERT INTO category_groups (name, description)
VALUES ('refinement_job_statuses', 'Status values for LLM metadata refinement jobs');

INSERT INTO category_values (group_id, value, sort_order)
SELECT id, unnest(ARRAY['queued', 'running', 'completed', 'failed']),
       unnest(ARRAY[1, 2, 3, 4])
FROM category_groups WHERE name = 'refinement_job_statuses';

CREATE TABLE refinement_jobs (
    id                  BIGSERIAL PRIMARY KEY,
    uuid                UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    character_id        BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    status_id           BIGINT NOT NULL REFERENCES category_values(id) ON UPDATE CASCADE,
    source_bio          JSONB,
    source_tov          JSONB,
    enrich              BOOLEAN NOT NULL DEFAULT true,
    llm_provider        TEXT NOT NULL,
    llm_model           TEXT NOT NULL,
    iterations          JSONB NOT NULL DEFAULT '[]'::jsonb,
    final_metadata      JSONB,
    final_report        JSONB,
    error               TEXT,
    metadata_version_id BIGINT REFERENCES character_metadata_versions(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_refinement_jobs_character ON refinement_jobs(character_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_refinement_jobs_status ON refinement_jobs(status_id) WHERE deleted_at IS NULL;
-- Only one active job per character
CREATE UNIQUE INDEX uq_refinement_jobs_active_per_character
    ON refinement_jobs(character_id)
    WHERE status_id IN (SELECT id FROM category_values WHERE group_id = (SELECT id FROM category_groups WHERE name = 'refinement_job_statuses') AND value IN ('queued', 'running'))
    AND deleted_at IS NULL;

CREATE TRIGGER trg_refinement_jobs_updated_at
    BEFORE UPDATE ON refinement_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Table created with all columns and constraints
- [ ] Category values seeded for job statuses
- [ ] Unique index enforces one active job per character
- [ ] Trigger updates `updated_at` on row changes
- [ ] `uuid` column for external API references

---

## Phase 2: Backend Models & Repository

### Task 2.1: Refinement job model and DTOs
**File:** `apps/backend/crates/db/src/models/refinement_job.rs`

Create the Rust model and DTOs for the `refinement_jobs` table.

```rust
// RefinementJob -- FromRow, Serialize
// CreateRefinementJob -- Deserialize
// UpdateRefinementJob -- Deserialize (status_id, iterations, final_metadata, final_report, error, metadata_version_id)
```

**Acceptance Criteria:**
- [ ] `RefinementJob` struct maps all columns from the table
- [ ] `CreateRefinementJob` DTO for inserts (character_id, status_id, source_bio, source_tov, enrich, llm_provider, llm_model)
- [ ] `UpdateRefinementJob` DTO for updates (status_id, iterations, final_metadata, final_report, error, metadata_version_id)
- [ ] Register module in `models/mod.rs`

### Task 2.2: Refinement job repository
**File:** `apps/backend/crates/db/src/repositories/refinement_job_repo.rs`

CRUD operations for refinement jobs.

**Methods:**
- `create(pool, dto) -> RefinementJob`
- `find_by_id(pool, id) -> Option<RefinementJob>`
- `find_by_uuid(pool, uuid) -> Option<RefinementJob>`
- `find_by_character(pool, character_id) -> Vec<RefinementJob>`
- `find_active_for_character(pool, character_id) -> Option<RefinementJob>` (queued or running)
- `update(pool, id, dto) -> RefinementJob`
- `soft_delete(pool, id)`

**Acceptance Criteria:**
- [ ] All methods implemented with proper SQL queries
- [ ] Soft delete filters applied on all read queries
- [ ] `find_active_for_character` returns at most one job (queued or running status)
- [ ] Register in `repositories/mod.rs`

### Task 2.3: Update CharacterMetadataVersion model for outdated columns
**File:** `apps/backend/crates/db/src/models/character_metadata_version.rs`

Add `outdated_at` and `outdated_reason` fields to the existing model.

**Acceptance Criteria:**
- [ ] `CharacterMetadataVersion` struct includes `outdated_at: Option<Timestamp>` and `outdated_reason: Option<String>`
- [ ] `UpdateCharacterMetadataVersion` DTO includes optional `outdated_at` and `outdated_reason` fields
- [ ] Existing queries updated to select the new columns

### Task 2.4: Add outdated management methods to CharacterMetadataVersionRepo
**File:** `apps/backend/crates/db/src/repositories/character_metadata_version_repo.rs`

Add methods for setting and clearing the outdated flag.

**Methods:**
- `set_outdated(pool, id, reason) -> Result` -- sets `outdated_at = NOW()`, `outdated_reason`
- `clear_outdated(pool, id) -> Result` -- sets `outdated_at = NULL`, `outdated_reason = NULL`
- `find_active_outdated_for_character(pool, character_id) -> Option<CharacterMetadataVersion>`

**Acceptance Criteria:**
- [ ] `set_outdated` sets timestamp and reason
- [ ] `clear_outdated` nulls both columns
- [ ] `find_active_outdated_for_character` returns the active version only if `outdated_at IS NOT NULL`

---

## Phase 3: LLM Client & Refinement Engine (Core)

### Task 3.1: LLM client module
**File:** `apps/backend/crates/core/src/llm_client.rs`

HTTP client for LLM API calls with JSON Mode / Function Calling support.

**Implementation:**
- `LlmConfig` struct: provider, model, api_key, base_url, max_tokens, temperature
- `LlmClient::new(config) -> Self`
- `LlmClient::chat_json(system_prompt, user_prompt, schema) -> Result<Value>` -- sends chat completion with JSON Mode, returns parsed JSON
- Supports OpenAI-compatible API format (covers OpenAI, local LLMs, compatible proxies)
- Timeout: 60 seconds per request
- Retry: up to 2 retries on transient errors (5xx, timeout)

**Acceptance Criteria:**
- [ ] `LlmConfig` holds all configuration fields
- [ ] `chat_json` sends a properly formatted request with `response_format: { type: "json_object" }`
- [ ] Response parsing extracts the JSON content from the LLM response
- [ ] Timeout and retry logic works correctly
- [ ] Errors are mapped to `CoreError` variants
- [ ] Unit tests with mock HTTP responses (use `wiremock` or similar)
- [ ] Register module in `core/src/lib.rs`

### Task 3.2: Refinement orchestrator
**File:** `apps/backend/crates/core/src/llm_refinement.rs`

The multi-step refinement pipeline: LLM format -> script run -> LLM quality check -> iterate.

**Implementation:**
- `RefinementConfig` struct: llm_config, script_path, max_iterations (default 3), metadata_schema (from template)
- `RefinementOrchestrator::new(config) -> Self`
- `RefinementOrchestrator::refine(input: MetadataInput, enrich: bool) -> Result<RefinementResult>`
  - Step 1: Build system prompt with canonical schema, send Bio/ToV to LLM for formatting
  - Step 2: Prepare input files, execute `fix_metadata.py` via ScriptOrchestrator
  - Step 3: Parse script output, send to LLM for quality check
  - Step 4: If quality issues found and iterations < max, adjust input and go to Step 2
  - Step 5: Return final result with iteration history
- `RefinementResult` struct: metadata (Value), report (GenerationReport), iterations (Vec<IterationLog>), warnings (Vec<String>)
- `IterationLog` struct: input_delta, script_output, issues_detected, resolution

**Acceptance Criteria:**
- [ ] Full pipeline executes: LLM format -> script -> LLM check -> iterate
- [ ] Enrichment mode activates additional LLM instructions for sparse profiles
- [ ] Iteration cap prevents infinite loops (max 3 by default)
- [ ] Each iteration is logged with full context
- [ ] Final result includes the best metadata and complete iteration history
- [ ] Errors at any step are captured and returned, not swallowed
- [ ] Unit tests for the orchestration logic (mock LLM client and script executor)

### Task 3.3: Outdated dependency chain logic
**File:** `apps/backend/crates/core/src/llm_refinement.rs` (or separate `metadata_dependency.rs`)

Business logic for detecting and flagging outdated metadata.

**Implementation:**
- `check_and_flag_outdated(pool, character_id, changed_source: "bio"|"tov") -> Result<bool>`
  - Find active metadata version for character
  - If exists and was generated from a different Bio/ToV than the newly activated version, set outdated flag
  - Return whether the flag was set
- `clear_outdated_flag(pool, version_id) -> Result<()>`

**Acceptance Criteria:**
- [ ] Correctly identifies when active metadata is derived from stale Bio/ToV
- [ ] Sets `outdated_at` and `outdated_reason` with descriptive message
- [ ] `clear_outdated_flag` nulls the columns
- [ ] Does nothing if no active metadata exists
- [ ] Unit tests for all scenarios: no active metadata, metadata from current source, metadata from stale source

---

## Phase 4: API Handlers & Routes

### Task 4.1: Refinement job handlers
**File:** `apps/backend/crates/api/src/handlers/refinement.rs`

API handlers for triggering and managing refinement jobs.

**Endpoints:**
- `POST /characters/{id}/refinement` -- trigger refinement (creates job, starts async processing)
- `GET /characters/{id}/refinement-jobs` -- list jobs for character
- `GET /refinement-jobs/{job_id}` -- get job detail by UUID
- `POST /characters/{id}/refinement-jobs/{job_id}/approve` -- approve result, create metadata version
- `POST /characters/{id}/refinement-jobs/{job_id}/reject` -- reject result with reason

**Acceptance Criteria:**
- [ ] Trigger endpoint checks for existing active job (409 Conflict if one exists)
- [ ] Trigger endpoint reads LLM config from platform settings
- [ ] Async processing spawns a tokio task for the refinement pipeline
- [ ] Job status is updated as pipeline progresses (queued -> running -> completed/failed)
- [ ] Approve handler creates a new `character_metadata_version` with the refinement result and activates it
- [ ] Reject handler updates the job with rejection reason
- [ ] All responses use the standard `DataResponse` envelope
- [ ] Register handlers in `handlers/mod.rs`

### Task 4.2: Outdated flag handlers
**File:** `apps/backend/crates/api/src/handlers/character_metadata_version.rs` (extend existing)

Add endpoint for clearing the outdated flag and modify the activate handler.

**Changes:**
- New endpoint: `POST /characters/{id}/metadata/versions/{version_id}/clear-outdated`
- Modify `activate` handler: after activating a new Bio/ToV version, call `check_and_flag_outdated`

**Acceptance Criteria:**
- [ ] `clear-outdated` endpoint nulls `outdated_at` and `outdated_reason`
- [ ] `clear-outdated` returns 404 if version not found, 400 if version is not outdated
- [ ] Bio/ToV activation triggers outdated check on related metadata
- [ ] Confirmation is not required at the API level (frontend handles the confirmation dialog)

### Task 4.3: Source file protection enforcement
**File:** `apps/backend/crates/api/src/handlers/character_metadata_version.rs` (extend existing)

Ensure the `create_manual_version` handler (used for metadata import) cannot modify Bio/ToV data.

**Changes:**
- If the request body contains `bio` or `tov` fields at the top level, log a warning and ignore them
- Return a `warnings` array in the response if fields were ignored

**Acceptance Criteria:**
- [ ] `CreateManualVersionRequest` does not accept `bio_json` or `tov_json` fields (or silently drops them)
- [ ] Integration test: POST a metadata version with bio/tov fields, verify they are not stored or propagated
- [ ] Response includes a warning message when fields are ignored

### Task 4.4: Refinement routes
**File:** `apps/backend/crates/api/src/routes/refinement.rs`

Register refinement routes with the router.

**Acceptance Criteria:**
- [ ] All refinement endpoints registered under appropriate paths
- [ ] Auth middleware applied (creator or admin role)
- [ ] Routes registered in `routes/mod.rs` and wired into the app router

---

## Phase 5: Frontend - Diff View Component

### Task 5.1: JSON diff utility
**File:** `apps/frontend/src/features/characters/lib/metadata-diff.ts`

Utility for computing field-level diffs between two metadata JSON objects.

**Implementation:**
- `computeMetadataDiff(current: Record, proposed: Record) -> DiffResult`
- `DiffResult`: array of `DiffEntry` items
- `DiffEntry`: `{ field: string, category: string, oldValue: any, newValue: any, changeType: 'added' | 'modified' | 'removed' | 'enriched' | 'unchanged' }`
- Category grouping based on field prefixes (physical_, biographical_, favorite_, etc.)

**Acceptance Criteria:**
- [ ] Correctly identifies added, modified, removed, and unchanged fields
- [ ] "enriched" type detected via the refinement report's `source` tag per field
- [ ] Handles nested objects (flatten to dot-notation keys for comparison)
- [ ] Handles arrays (order-insensitive comparison)
- [ ] Unit tests for all change types

### Task 5.2: MetadataDiffView component
**File:** `apps/frontend/src/features/characters/tabs/MetadataDiffView.tsx`

Side-by-side diff view for metadata comparison with cherry-pick approval.

**Props:**
- `currentMetadata: Record<string, unknown>`
- `proposedMetadata: Record<string, unknown>`
- `report?: RefinementReport` (for enrichment source tagging)
- `onApprove: (selected: Record<string, unknown>) => void`
- `onReject: (reason: string) => void`
- `mode: 'full' | 'cherry-pick'`

**Implementation:**
- Two-column layout: current (left) vs. proposed (right)
- Fields grouped by category with collapsible sections
- Color coding: green (added), amber (modified), red (removed), purple (enriched)
- Cherry-pick mode: checkbox per field group, "Accept Selected" button
- Full mode: "Approve All" and "Reject" buttons
- Reject opens a modal for reason input

**Acceptance Criteria:**
- [ ] Renders diff correctly for all change types
- [ ] Cherry-pick produces correct merged metadata (selected new + unchanged old)
- [ ] Enriched fields are visually distinct from formatted/normalized fields
- [ ] Responsive layout, synchronized scrolling between columns
- [ ] Uses design system components (Card, Badge, Button, Modal, Checkbox)
- [ ] Unit tests for cherry-pick merge logic
- [ ] Component tests for rendering all change types

---

## Phase 6: Frontend - Refinement UI

### Task 6.1: Refinement job hooks
**File:** `apps/frontend/src/features/characters/hooks/use-refinement.ts`

TanStack Query hooks for refinement job management.

**Hooks:**
- `useStartRefinement(characterId)` -- mutation to trigger refinement
- `useRefinementJobs(characterId)` -- query to list jobs
- `useRefinementJob(jobId)` -- query for single job detail (polls while running)
- `useApproveRefinement(characterId)` -- mutation to approve
- `useRejectRefinement(characterId)` -- mutation to reject

**Acceptance Criteria:**
- [ ] `useRefinementJob` polls every 3 seconds while status is `queued` or `running`
- [ ] Polling stops when status is `completed` or `failed`
- [ ] Mutations invalidate relevant query keys
- [ ] Error handling for 409 Conflict (active job exists)

### Task 6.2: RefinementPanel component
**File:** `apps/frontend/src/features/characters/tabs/RefinementPanel.tsx`

UI for triggering refinement and viewing job progress/results.

**Implementation:**
- "Refine with AI" button (disabled if active job exists)
- Options: enrich toggle (default on)
- Progress display: current iteration, step description, spinner
- On completion: link to diff view for approval
- On failure: error display with retry button
- Job history list (collapsible)

**Acceptance Criteria:**
- [ ] Button triggers refinement and shows progress
- [ ] Progress updates via polling hook
- [ ] Completed jobs show "Review Changes" button linking to diff view
- [ ] Failed jobs show error and "Retry" button
- [ ] Uses design system components

### Task 6.3: Outdated badge and clear action
**File:** `apps/frontend/src/features/characters/tabs/CharacterMetadataTab.tsx` (extend existing)

Add outdated badge to the metadata tab and character dashboard.

**Implementation:**
- When active metadata version has `outdated_at` set, show amber "Outdated" badge
- Badge tooltip: reason text (e.g., "Bio updated on 2026-03-05 after this metadata was generated from Bio v2")
- "Mark as Current" button next to badge, opens confirmation dialog
- On confirm, calls `clear-outdated` endpoint

**Acceptance Criteria:**
- [ ] Badge visible when `outdated_at` is not null on the active version
- [ ] Tooltip shows the reason
- [ ] Confirmation dialog explains the implications
- [ ] Badge disappears after clearing
- [ ] Badge reappears if Bio/ToV changes again

### Task 6.4: Source file protection notice
**File:** `apps/frontend/src/features/characters/tabs/CharacterMetadataTab.tsx` (extend existing)

Add a persistent notice when importing metadata.

**Implementation:**
- In the metadata import flow (JSON drop zone / file upload), display an info banner:
  "Importing metadata will create a new metadata version. Your Bio and ToV source files will not be affected."
- Banner uses `Card` component with info/blue styling
- Banner is not dismissible

**Acceptance Criteria:**
- [ ] Notice visible during metadata import flow
- [ ] Notice is persistent (not dismissible)
- [ ] Uses design system Card with info variant

---

## Phase 7: Integration & Testing

### Task 7.1: Integration tests -- refinement pipeline
**File:** `apps/backend/tests/refinement_pipeline.rs`

End-to-end tests for the refinement pipeline.

**Tests:**
- Submit refinement job, verify it transitions through queued -> running -> completed
- Approve completed job, verify metadata version is created and activated
- Reject completed job, verify reason is stored
- Submit second job while first is active, verify 409 Conflict
- Refinement with empty Bio/ToV, verify error

**Acceptance Criteria:**
- [ ] All tests pass with mocked LLM responses
- [ ] Tests cover the full lifecycle: submit -> poll -> approve/reject

### Task 7.2: Integration tests -- outdated dependency chain
**File:** `apps/backend/tests/metadata_outdated.rs`

Tests for the outdated flag lifecycle.

**Tests:**
- Generate metadata from Bio v1, activate Bio v2, verify metadata flagged as outdated
- Clear outdated flag, verify it's cleared
- Update Bio again, verify flag re-set
- Character with no active metadata, update Bio, verify no error

**Acceptance Criteria:**
- [ ] All scenarios covered
- [ ] Tests use the actual repository methods (not mocks)

### Task 7.3: Integration tests -- source file protection
**File:** `apps/backend/tests/metadata_import_protection.rs`

Tests verifying Bio/ToV cannot be modified through metadata import.

**Tests:**
- Import metadata JSON with `bio` field in payload, verify Bio unchanged
- Import metadata JSON with `tov` field in payload, verify ToV unchanged
- Verify warning returned in response when fields are ignored

**Acceptance Criteria:**
- [ ] All tests pass
- [ ] Tests verify at the database level that source data is untouched

### Task 7.4: Frontend tests
**File:** `apps/frontend/src/features/characters/__tests__/refinement.test.tsx`

Component and hook tests for the refinement UI.

**Tests:**
- MetadataDiffView renders all change types correctly
- Cherry-pick selection produces correct merged output
- RefinementPanel shows progress during active job
- Outdated badge appears/disappears based on version data
- Source file protection notice is visible during import

**Acceptance Criteria:**
- [ ] All component tests pass
- [ ] Tests use Testing Library patterns consistent with existing tests

---

## Phase 8: Admin Configuration

### Task 8.1: LLM settings in admin panel
**File:** `apps/frontend/src/features/admin-settings/` (extend existing)

Add "Metadata Refinement" section to the admin settings panel.

**Fields:**
- LLM Provider (select: openai / anthropic / custom)
- Model name (text input)
- API Key (password input, encrypted on save)
- Base URL (text input, optional for custom providers)
- Max Tokens (number input, default 4096)
- Temperature (number input, default 0.2)
- "Test Connection" button

**Acceptance Criteria:**
- [ ] All fields editable and saved to platform settings
- [ ] API key encrypted before storage
- [ ] Test Connection verifies the endpoint responds
- [ ] Default values pre-populated
- [ ] Settings take effect immediately without restart

### Task 8.2: Seed default LLM settings
**File:** `apps/db/migrations/YYYYMMDD000003_seed_llm_refinement_settings.sql`

Seed default platform settings for LLM refinement.

```sql
INSERT INTO platform_settings (key, value, description, category)
VALUES
    ('llm_refinement_provider', '"openai"', 'LLM provider for metadata refinement', 'metadata'),
    ('llm_refinement_model', '"gpt-4o"', 'LLM model for metadata refinement', 'metadata'),
    ('llm_refinement_api_key', '""', 'Encrypted API key for LLM provider', 'metadata'),
    ('llm_refinement_base_url', '"https://api.openai.com/v1"', 'Base URL for LLM API', 'metadata'),
    ('llm_refinement_max_tokens', '4096', 'Max tokens for LLM response', 'metadata'),
    ('llm_refinement_temperature', '0.2', 'Temperature for LLM generation', 'metadata')
ON CONFLICT (key) DO NOTHING;
```

**Acceptance Criteria:**
- [ ] Defaults seeded without overwriting existing values
- [ ] All settings queryable via PlatformSettingRepo

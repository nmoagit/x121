# PRD-125: LLM-Driven Metadata Refinement Pipeline

**Document ID:** 125-prd-llm-metadata-refinement-pipeline
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-03-06
**Last Updated:** 2026-03-06

---

## 1. Introduction/Overview

Character metadata (the structured JSON profile accompanying each character) is currently generated through a deterministic Python script (`fix_metadata.py`) that normalizes, cleans, and reshapes raw Bio and ToV data into the canonical metadata schema. While this works for mechanical transformations (emoji removal, key normalization, category extraction), it cannot reason about missing data, detect semantic inconsistencies, or enrich sparse profiles with publicly available information. The result is metadata that is structurally correct but often incomplete or shallow.

This PRD introduces an **LLM-driven refinement layer** that sits between the raw Bio/ToV source files and the final metadata output. The LLM formats and enriches Bio and ToV data, proactively searches for additional information when profiles are sparse, executes the existing `fix_metadata.py` script, examines its output for quality and errors, and iteratively updates the script input or re-runs it until the output meets quality standards. All AI-produced changes are presented in a diff view for human approval before being committed. The system also introduces a dependency chain where changes to Bio or ToV automatically flag downstream metadata as "Outdated," with a manual override for the PM to clear the flag.

A critical safeguard ensures that importing a new metadata JSON file **never** deletes or overwrites the existing `tov.json` or `bio.json` source files. These are treated as immutable source documents; only new versions can be created.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-013:** Dual-Metadata System (JSON) -- metadata generation and schema definitions
- **PRD-066:** Character Metadata Editor -- metadata editing UI, form/spreadsheet views
- **PRD-009:** Multi-Runtime Script Orchestrator -- script execution infrastructure for `fix_metadata.py`
- **PRD-113:** Character Ingest Pipeline -- metadata generation from bio/tov, metadata templates, validation
- **PRD-014:** Data Validation & Import Integrity -- schema validation engine
- **PRD-029:** Design System & Shared Component Library -- diff view components, modals, badges

### Extends
- **PRD-113:** Adds LLM enrichment step before/alongside the `fix_metadata.py` execution
- **PRD-066:** Adds "Outdated" dependency chain flagging and diff approval view to the metadata editor

### Integrates With
- **PRD-010:** Event Bus -- emits events when Bio/ToV changes trigger "Outdated" flags
- **PRD-045:** Audit Logging -- logs all LLM refinement actions and human approval/rejection decisions
- **PRD-088:** Batch Metadata Operations -- batch LLM refinement across multiple characters

## 3. Goals

### Primary Goals
1. Use an LLM (via Function Calling or JSON Mode) to format, normalize, and enrich Bio and ToV data into the canonical metadata schema.
2. Enable the LLM to proactively search for and incorporate additional public information when source data is insufficient.
3. Have the LLM execute `fix_metadata.py`, examine its output for quality/errors, and iteratively adjust inputs or re-run until quality standards are met.
4. Present all AI-generated changes in a diff view for mandatory human approval before activation.
5. Implement an "Outdated" dependency chain: changes to Active Bio or ToV automatically flag Active Metadata as outdated.
6. Protect Bio and ToV source files from being overwritten or deleted during metadata import operations.

### Secondary Goals
1. Reduce metadata completion time per character from minutes to seconds.
2. Improve metadata completeness (fewer missing fields) through LLM enrichment.
3. Provide a clear audit trail of what the LLM changed and why.
4. Support batch refinement across multiple characters in a single operation.

## 4. User Stories

- As a **PM**, I want the system to use an LLM to format and enrich Bio and ToV data into structured metadata so that I don't have to manually massage raw text into the correct schema.
- As a **PM**, I want the LLM to find additional information about a character when the Bio is sparse so that the metadata profile is more complete without me having to research manually.
- As a **PM**, I want to see a side-by-side diff of what the LLM changed before I approve it so that I maintain control over the final metadata.
- As a **PM**, I want the system to automatically flag metadata as "Outdated" when I update the Bio so that I know which characters need metadata re-generation.
- As a **PM**, I want to manually clear the "Outdated" flag if I determine the metadata is still accurate despite a Bio change so that I'm not forced into unnecessary re-generation.
- As a **PM**, I want to be certain that importing a new metadata JSON file will never delete or overwrite my bio.json or tov.json files so that my source data is always safe.
- As an **Admin**, I want to configure which LLM provider and model are used for metadata refinement so that I can control costs and quality.
- As a **Creator**, I want to trigger LLM refinement on multiple characters at once so that bulk onboarding is faster.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: LLM Refinement Service
**Description:** A backend service that takes Bio and ToV data as input, sends it to an LLM with structured output enforcement, and returns formatted metadata conforming to the canonical schema.

**Acceptance Criteria:**
- [ ] Service accepts `bio_json`, `tov_json`, and `character_name` as input
- [ ] LLM call uses JSON Mode or Function Calling to enforce the canonical metadata schema (defined by `metadata_templates` from PRD-113)
- [ ] The system prompt instructs the LLM to: (a) map raw fields to canonical keys, (b) normalize values (capitalization, formatting), (c) identify and fill gaps where possible
- [ ] LLM response is validated against the metadata template before returning
- [ ] Service returns both the refined metadata and a structured change report (fields added, fields modified, fields enriched, confidence per field)
- [ ] Timeout and retry logic: LLM calls timeout after 60 seconds with up to 2 retries
- [ ] Errors (LLM unavailable, invalid response, schema mismatch) are captured and returned as structured error objects, not swallowed

**Technical Notes:**
- Use `reqwest` for LLM API calls from the Rust backend
- LLM provider configuration stored in `platform_settings` (PRD-110): `llm_provider` (openai/anthropic/local), `llm_model`, `llm_api_key`, `llm_base_url`
- MVP supports OpenAI-compatible APIs (covers OpenAI, local LLMs via llama.cpp/vLLM, any OpenAI-compatible proxy)
- The canonical schema is derived from the active `metadata_template` (PRD-113)

#### Requirement 1.2: LLM Data Enrichment
**Description:** When the provided Bio/ToV data is insufficient (too many empty or sparse fields), the LLM proactively searches for and incorporates additional information.

**Acceptance Criteria:**
- [ ] The service detects "sparse" profiles: fewer than 60% of required metadata fields can be populated from Bio/ToV alone
- [ ] For sparse profiles, the LLM system prompt includes an instruction to use its training knowledge to fill gaps (e.g., if the character is a known public figure, use publicly available biographical data)
- [ ] Every enriched field is tagged with `source: "llm_enriched"` in the change report so the human reviewer knows it was not from the original Bio/ToV
- [ ] The enrichment step is optional and configurable per request (`enrich: true/false`, default `true`)
- [ ] Enriched data is clearly distinguished in the diff view (highlighted differently from formatted/normalized data)

**Technical Notes:**
- MVP does not include real-time web search. Enrichment relies on the LLM's training data. Post-MVP can add search tool use.
- The `enrich` flag is passed in the API request body

#### Requirement 1.3: Script Execution & Iterative Quality Loop
**Description:** After LLM formatting, execute `fix_metadata.py` on the refined data, examine output quality, and iteratively adjust if issues are found.

**Acceptance Criteria:**
- [ ] After LLM refinement, the service prepares input files and invokes `fix_metadata.py` via the Script Orchestrator (PRD-009)
- [ ] Script output (the generated `metadata.json`) is captured and parsed
- [ ] The LLM examines the script output for: (a) missing required fields, (b) malformed values, (c) semantic inconsistencies (e.g., age doesn't match birth year), (d) truncated or garbled text
- [ ] If quality issues are detected, the LLM adjusts the input data and re-runs the script (max 3 iterations)
- [ ] Each iteration is logged with: input delta, script output, issues detected, resolution attempted
- [ ] Final output includes the iteration history for transparency
- [ ] If max iterations are exhausted without clean output, the best result is returned with a warning listing unresolved issues

**Technical Notes:**
- Script execution reuses `ScriptOrchestrator` from PRD-009 (shell/python execution with venv, timeout, stdout/stderr capture)
- The LLM-to-script loop runs server-side as a single async operation; the frontend polls for status
- Iteration state is stored in a `refinement_jobs` table (see Requirement 1.8)

#### Requirement 1.4: Diff View for Human Approval
**Description:** All LLM-generated changes are presented in a side-by-side diff view for the PM to review and approve or reject before the metadata is activated.

**Acceptance Criteria:**
- [ ] Diff view shows: current active metadata (left) vs. LLM-refined metadata (right)
- [ ] Field-level diff highlighting: added fields (green), modified fields (yellow), removed fields (red), enriched fields (blue/purple)
- [ ] Each changed field shows: old value, new value, change source (formatted, normalized, enriched, script-corrected)
- [ ] PM can accept all changes, reject all changes, or cherry-pick individual field changes
- [ ] Accepted changes create a new metadata version (using existing `character_metadata_versions` infrastructure)
- [ ] Rejected refinements are logged with the PM's reason
- [ ] The diff view is accessible from: the character metadata tab, the refinement job detail, and batch refinement results

**Technical Notes:**
- Reuse the diff view pattern from PRD-066 Requirement 2.1 (import diff view)
- The diff computation happens on the frontend (JSON deep-diff library or custom field-by-field comparison)
- Cherry-picked changes produce a merged metadata object combining selected new fields with existing unchanged fields

#### Requirement 1.5: "Outdated" Dependency Chain
**Description:** Metadata is derived from Bio and ToV. When the Active Bio or Active ToV changes, the current Active Metadata is automatically flagged as "Outdated."

**Acceptance Criteria:**
- [ ] When a new Bio version is activated (or Bio content is updated), the system checks if an Active Metadata version exists for that character
- [ ] If Active Metadata exists and was derived from a previous Bio/ToV version, it is flagged as `outdated = true`
- [ ] The "Outdated" flag is a column on `character_metadata_versions` (or a separate status)
- [ ] The metadata tab and character dashboard display a visible "Outdated" badge when the active metadata is flagged
- [ ] The PM can manually clear the "Outdated" flag via a "Mark as Current" action (with confirmation dialog: "The Bio has changed since this metadata was generated. Are you sure the metadata is still accurate?")
- [ ] Clearing the flag does NOT re-generate metadata; it simply acknowledges the PM's decision
- [ ] The "Outdated" badge includes a tooltip showing: which source changed (Bio/ToV), when it changed, and what version the metadata was generated from
- [ ] An event is emitted via EventBus (PRD-010) when metadata is flagged as outdated

**Technical Notes:**
- Implementation: add `outdated_at TIMESTAMPTZ NULL` and `outdated_reason TEXT NULL` columns to `character_metadata_versions`
- The trigger can be a Postgres trigger on bio/tov update, or application-level logic in the activate-version handler
- Application-level is preferred for flexibility and testability

#### Requirement 1.6: Metadata Import Source File Protection
**Description:** Importing a new metadata JSON file must NEVER delete or overwrite existing `tov.json` or `bio.json` files. These are source files and must be protected.

**Acceptance Criteria:**
- [ ] The metadata import endpoint (existing `POST /characters/{id}/metadata/versions` from the metadata version system) does not touch Bio or ToV files/data
- [ ] The metadata import UI shows a clear notice: "Importing metadata will create a new metadata version. Your Bio and ToV files will not be affected."
- [ ] If an import payload contains `bio` or `tov` fields, they are ignored (not written) with a warning returned in the response
- [ ] Backend enforces this at the repository level: the `create` method for metadata versions never writes to bio/tov columns of other tables
- [ ] Integration test verifies: importing metadata does not modify `source_bio` or `source_tov` on the character record or any related table
- [ ] The source files (bio.json, tov.json) can only be updated through their own dedicated endpoints, never as a side effect of metadata operations

**Technical Notes:**
- This is primarily an enforcement/documentation concern. The existing `character_metadata_versions` table already stores `source_bio` and `source_tov` as snapshot copies (read-only context), not as writeable references. This requirement codifies that guarantee.

#### Requirement 1.7: LLM Provider Configuration
**Description:** Admin-configurable LLM provider settings for the refinement pipeline.

**Acceptance Criteria:**
- [ ] Settings stored in `platform_settings` (PRD-110): `llm_refinement_provider`, `llm_refinement_model`, `llm_refinement_api_key` (encrypted), `llm_refinement_base_url`, `llm_refinement_max_tokens`, `llm_refinement_temperature`
- [ ] Admin settings panel (PRD-110) includes a "Metadata Refinement" section with these fields
- [ ] API key is stored encrypted (AES-256-GCM, reusing `crates/cloud` crypto from PRD-114)
- [ ] A "Test Connection" button verifies the LLM endpoint is reachable and responds correctly
- [ ] Default values: provider=openai, model=gpt-4o, temperature=0.2, max_tokens=4096
- [ ] Settings changes take effect immediately (no restart required)

**Technical Notes:**
- Reuse `PlatformSettingRepo` from PRD-110 for storage
- Reuse AES-256-GCM encryption from `crates/cloud::crypto` for API key encryption

#### Requirement 1.8: Refinement Job Tracking
**Description:** Track LLM refinement jobs with status, progress, and results.

**Acceptance Criteria:**
- [ ] New `refinement_jobs` table tracks each refinement request: character_id, status (queued/running/completed/failed), iterations, final_result, error, timestamps
- [ ] Job status is queryable via API: `GET /characters/{id}/refinement-jobs`
- [ ] Frontend polls job status and displays progress (iteration count, current step)
- [ ] Completed jobs link to the diff view for approval
- [ ] Failed jobs display the error and allow retry
- [ ] Job history is retained for audit purposes (soft delete only)

**Technical Notes:**
- DB table follows standard conventions: `id BIGSERIAL`, `uuid UUID`, `deleted_at TIMESTAMPTZ NULL`
- Status values stored in `category_values` lookup table

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Batch LLM Refinement
**Description:** Trigger LLM refinement across multiple characters in a single operation.
**Acceptance Criteria:**
- [ ] Batch endpoint: `POST /projects/{id}/refinement/batch` with array of character IDs
- [ ] Jobs are queued and processed sequentially (to manage LLM API rate limits)
- [ ] Batch progress view shows per-character status
- [ ] Batch results can be approved individually or in bulk

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Web Search Enrichment
**Description:** Enable the LLM to use web search tools for real-time data enrichment.
**Acceptance Criteria:**
- [ ] Configurable search provider (Google, Bing, SearXNG)
- [ ] LLM uses function calling to invoke search when training data is insufficient
- [ ] Search results are cited in the change report

#### **[OPTIONAL - Post-MVP]** Requirement 2.3: Custom Refinement Prompts
**Description:** Admin-editable system prompts for the LLM refinement pipeline.
**Acceptance Criteria:**
- [ ] Default system prompt is provided and works out of the box
- [ ] Admin can customize the prompt via the settings panel
- [ ] Prompt versioning (can revert to previous prompt versions)

#### **[OPTIONAL - Post-MVP]** Requirement 2.4: Refinement Quality Scoring
**Description:** Automated quality scoring of refinement results.
**Acceptance Criteria:**
- [ ] Score based on: field completeness, schema compliance, enrichment confidence
- [ ] Low-scoring refinements are auto-flagged for priority review
- [ ] Score trends tracked over time per LLM model

## 6. Non-Functional Requirements

### Performance
- LLM refinement for a single character completes within 90 seconds (including up to 3 script iterations)
- Diff computation renders within 500ms for metadata with up to 200 fields
- "Outdated" flag propagation occurs within 1 second of Bio/ToV activation

### Security
- LLM API keys are encrypted at rest (AES-256-GCM)
- Character data sent to external LLM APIs is logged for audit compliance
- No PII is sent to external LLMs without explicit admin opt-in configuration
- LLM responses are sanitized before storage (prevent prompt injection into stored metadata)

## 7. Non-Goals (Out of Scope)

- **Metadata schema design** -- the canonical schema is defined by `metadata_templates` (PRD-113); this PRD consumes it
- **Bio/ToV editing UI** -- Bio and ToV files are edited through existing character detail tabs; this PRD only reads them
- **Automated metadata activation** -- all LLM results require human approval; no auto-commit
- **LLM fine-tuning** -- uses off-the-shelf models via API; no model training
- **Real-time streaming of LLM output** -- MVP uses polling for job status, not SSE/WebSocket streaming of tokens
- **Porting fix_metadata.py to Rust** -- the existing Python script is executed as-is via the Script Orchestrator; the Rust port is tracked separately in the Deferred Work Queue

## 8. Design Considerations

- The diff view should be the **central approval interface** -- it must be clear, scannable, and fast. Consider a two-column layout with synchronized scrolling.
- "Outdated" badges should be **prominent but not alarming** -- use an amber/warning color, not red. The PM should feel informed, not pressured.
- The refinement job status should feel like a **progress tracker** -- show which iteration the system is on, what it's doing (formatting, running script, checking quality).
- Cherry-pick approval should be **intuitive** -- checkboxes per field group (Physical, Biographical, Preferences, etc.), not per individual field (too granular for 100+ fields).
- The metadata import warning about source file protection should be a **persistent notice**, not a dismissible toast -- it's too important to miss.

## 9. Technical Considerations

### Existing Code to Reuse
- `x121_core::metadata_transform` -- existing Rust metadata transformation engine (emoji removal, key normalization, category extraction); the LLM layer wraps around this
- `x121_db::models::character_metadata_version` / `CharacterMetadataVersionRepo` -- versioned metadata storage with activate/reject/soft-delete
- `x121_core::script_orchestrator` -- Python script execution with venv isolation, timeout, stdout/stderr capture (PRD-009)
- `x121_db::repositories::PlatformSettingRepo` -- platform settings storage (PRD-110)
- `crates/cloud::crypto` -- AES-256-GCM encryption for API keys (PRD-114)
- `apps/frontend/src/features/characters/hooks/use-metadata-versions.ts` -- existing metadata version hooks (generate, activate, reject, delete)
- `apps/frontend/src/features/characters/tabs/CharacterMetadataTab.tsx` -- existing metadata tab to extend with outdated badge and refinement trigger
- Design system: `Badge`, `Modal`, `Button`, `Card`, `Tabs`, `Table` components

### Database Changes

#### New table: `refinement_jobs`
```sql
CREATE TABLE refinement_jobs (
    id              BIGSERIAL PRIMARY KEY,
    uuid            UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    character_id    BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    status_id       BIGINT NOT NULL REFERENCES category_values(id),
    source_bio      JSONB,
    source_tov      JSONB,
    llm_provider    TEXT NOT NULL,
    llm_model       TEXT NOT NULL,
    iterations      JSONB NOT NULL DEFAULT '[]',
    final_metadata  JSONB,
    final_report    JSONB,
    error           TEXT,
    metadata_version_id BIGINT REFERENCES character_metadata_versions(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
```

#### Alter table: `character_metadata_versions`
```sql
ALTER TABLE character_metadata_versions
    ADD COLUMN outdated_at TIMESTAMPTZ,
    ADD COLUMN outdated_reason TEXT;
```

#### Seed data: `category_values` for refinement job statuses
```sql
-- category_group: refinement_job_statuses
INSERT INTO category_groups (name, description) VALUES ('refinement_job_statuses', 'Status values for LLM refinement jobs');
INSERT INTO category_values (group_id, value, sort_order) VALUES
    (currval('category_groups_id_seq'), 'queued', 1),
    (currval('category_groups_id_seq'), 'running', 2),
    (currval('category_groups_id_seq'), 'completed', 3),
    (currval('category_groups_id_seq'), 'failed', 4);
```

### API Changes

#### New endpoints
- `POST /api/v1/characters/{id}/refinement` -- trigger LLM refinement for a character
- `GET /api/v1/characters/{id}/refinement-jobs` -- list refinement jobs for a character
- `GET /api/v1/refinement-jobs/{job_id}` -- get refinement job detail
- `POST /api/v1/characters/{id}/metadata/versions/{version_id}/clear-outdated` -- clear the outdated flag
- `POST /api/v1/characters/{id}/refinement-jobs/{job_id}/approve` -- approve refinement result (creates metadata version)
- `POST /api/v1/characters/{id}/refinement-jobs/{job_id}/reject` -- reject refinement result

#### Modified endpoints
- `PUT /api/v1/characters/{id}/metadata/versions/{version_id}/activate` -- now also checks and sets outdated flags on related versions

## 10. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| LLM API unavailable | Return structured error with retry suggestion; job status = `failed` |
| LLM returns invalid JSON | Retry with stricter prompt (up to 2 retries); if still invalid, fail with raw response in error field |
| LLM returns metadata that doesn't match schema | Validate against template; return validation errors in report; do not auto-activate |
| `fix_metadata.py` script crashes | Capture stderr, log iteration, mark quality issue; LLM can adjust input and retry |
| `fix_metadata.py` produces empty output | Treat as quality failure; retry with adjusted input |
| Bio/ToV both empty | Return error: "Cannot refine metadata without source data" |
| Character has no active metadata (first generation) | Diff view shows left side as empty; all fields are "added" |
| PM updates Bio while refinement job is running | Job uses the Bio snapshot captured at job start; outdated flag applies after job completes |
| Concurrent refinement jobs for same character | Only one active (queued/running) job per character; subsequent requests return 409 Conflict |
| Metadata import attempts to write Bio/ToV | Bio/ToV fields in payload are silently ignored; warning returned in response envelope |
| PM clears outdated flag, then Bio changes again | Flag is re-set; clearing is not permanent |

## 11. Success Metrics

- LLM refinement produces metadata with 90%+ field completeness (vs. 70% from script-only generation)
- 80% of refinement results are approved on first review (without cherry-picking)
- "Outdated" flags are resolved within 24 hours of being set (PM reviews promptly)
- Zero instances of Bio/ToV data loss during metadata import operations
- Refinement job completes within 90 seconds for 95% of characters
- Audit log captures 100% of LLM interactions and approval decisions

## 12. Testing Requirements

### Unit Tests
- LLM response parsing and schema validation
- Outdated flag logic: set on Bio/ToV change, clear on manual action, re-set on subsequent change
- Diff computation: added/modified/removed/enriched field detection
- Source file protection: metadata import cannot modify Bio/ToV

### Integration Tests
- Full refinement pipeline: submit job, poll status, approve result, verify metadata version created
- Script execution loop: LLM detects quality issue, adjusts input, re-runs script
- Outdated dependency chain: activate new Bio version, verify metadata flagged as outdated
- Metadata import safeguard: import metadata JSON, verify Bio/ToV unchanged
- Concurrent job prevention: submit two jobs for same character, verify 409 on second

### Frontend Tests
- Diff view renders correctly for added/modified/removed/enriched fields
- Cherry-pick selection produces correct merged metadata
- Outdated badge appears when flag is set, disappears when cleared
- Refinement job progress displays correctly across status transitions

## 13. Open Questions

1. Should the LLM enrichment include a disclaimer/watermark in the metadata (e.g., `_enrichment_source: "llm"`) for fields it fabricated?
2. What is the acceptable cost budget per LLM refinement call? Should there be a per-character or per-project spending limit?
3. Should the "Outdated" flag cascade to delivery packages (i.e., block delivery if metadata is outdated)?
4. Should there be an option to auto-run refinement when Bio/ToV changes (instead of just flagging as outdated)?
5. For batch refinement, should there be a concurrency limit (e.g., max 5 parallel LLM calls) to manage API costs?

## 14. Version History

- **v1.0** (2026-03-06): Initial PRD creation

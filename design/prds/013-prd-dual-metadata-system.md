# PRD-013: Dual-Metadata System (JSON)

## 1. Introduction/Overview
The platform must generate structured JSON metadata files (`character_metadata` and `video_metadata`) that accompany every character in the delivery package. These files are required for downstream registration and consumption by future VFX/3D pipelines. This PRD defines the automated generation, schema, and lifecycle of these metadata JSON files.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-14 (Data Validation for schema enforcement), PRD-00 (Database integrity), PRD-01 (Data model)
- **Depended on by:** None directly (consumed by delivery packaging PRD-39)
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Automatically generate `character_metadata.json` and `video_metadata.json` for each character.
- Define the schema for both metadata types with required and optional fields.
- Keep metadata files synchronized with database records.
- Ensure metadata files are included in every delivery package.

## 4. User Stories
- As a Creator, I want character metadata to be automatically generated from the database so that I don't need to manually create JSON files.
- As an Admin, I want a defined schema for metadata files so that downstream consumers can rely on a consistent structure.
- As a Creator, I want metadata files to update when I edit character data so that the delivery package always reflects the latest information.
- As a Reviewer, I want to preview the metadata JSON before delivery so that I can verify its accuracy.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Character Metadata Generation
**Description:** Automated generation of character_metadata.json from database records.
**Acceptance Criteria:**
- [ ] Character metadata JSON is generated from the character's database record
- [ ] Includes: name, biographical data, physical attributes, and custom metadata fields
- [ ] Schema validation (PRD-14) ensures all required fields are present
- [ ] Regenerated when character metadata is edited

#### Requirement 1.2: Video Metadata Generation
**Description:** Automated generation of video_metadata.json with technical video information.
**Acceptance Criteria:**
- [ ] Video metadata includes: scene type, duration, resolution, codec, segment count, generation parameters
- [ ] Metadata is generated after scene assembly (PRD-39)
- [ ] Includes quality scores from auto-QA (PRD-49) when available
- [ ] Tracks provenance (which workflow, model, LoRA versions were used)

#### Requirement 1.3: Metadata Synchronization
**Description:** Keep metadata files in sync with database records.
**Acceptance Criteria:**
- [ ] Metadata files are regenerated when source data changes
- [ ] Stale metadata detection: flag files that are out of sync with the database
- [ ] Batch regeneration available for all characters in a project

#### Requirement 1.4: Delivery Integration
**Description:** Metadata files are included in every delivery package.
**Acceptance Criteria:**
- [ ] `metadata.json` is included in each character's delivery folder
- [ ] Delivery validation (PRD-39) checks metadata file presence and schema compliance
- [ ] Missing metadata blocks delivery with a clear error

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Custom Metadata Extensions
**Description:** Support studio-defined custom fields in the metadata schema.
**Acceptance Criteria:**
- [ ] Admin can add custom fields to the metadata schema
- [ ] Custom fields are included in generated JSON files

## 6. Non-Goals (Out of Scope)
- Metadata editing UI (covered by PRD-66)
- Schema validation logic (covered by PRD-14)
- Delivery packaging (covered by PRD-39)

## 7. Design Considerations
- Metadata JSON should be human-readable (pretty-printed with indentation).
- A preview panel should show the current metadata JSON for a character.

## 8. Technical Considerations
- **Stack:** Rust for JSON generation, serde for serialization, JSONSchema for validation
- **Existing Code to Reuse:** PRD-14 validation layer
- **New Infrastructure Needed:** Metadata generation service, schema definition files
- **Database Changes:** None (reads from existing character and scene tables)
- **API Changes:** GET /characters/:id/metadata/preview, POST /characters/:id/metadata/regenerate

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- 100% of delivered characters include valid metadata.json files
- Metadata regeneration completes in <1 second per character
- Zero schema violations in generated metadata files
- Metadata sync detects all out-of-date files within 1 minute of source data change

## 11. Open Questions
- Should metadata files be versioned alongside the character data?
- What is the canonical schema for video_metadata.json?
- Should metadata include references to related characters (e.g., for multi-character scenes)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
- **v1.1** (2026-03-06): Amendment — Requirements gap fill (Reqs A.1-A.4).

---

## Amendment (2026-03-06): Requirements Gap Fill

The following requirements were identified during a stakeholder requirements review and address gaps in the original PRD. They do not modify any existing requirements.

### Requirement A.1: Outdated Dependency Chain

**Description:** If a PM updates the Active Bio or Active ToV (Tone of Voice), the system must automatically flag the current Active Metadata version as "Outdated". The PM can manually clear this flag if they determine the metadata is still accurate despite the source file change. This ensures metadata stays in sync with its upstream dependencies.

**Acceptance Criteria:**
- [ ] When the Active Bio file (`bio.json`) is updated (new content saved or new file uploaded), all Active Metadata versions that were generated from or depend on that Bio are flagged with status "Outdated"
- [ ] When the Active ToV file (`tov.json`) is updated, the same flagging logic applies
- [ ] The "Outdated" flag is a new status value or boolean column on the metadata version record (e.g., `is_outdated BOOLEAN DEFAULT false` on `metadata_generations` or equivalent table)
- [ ] The flag is set automatically by the system — no manual intervention required to flag
- [ ] The PM can manually clear the "Outdated" flag via a UI action (e.g., "Mark as Current" button) if they determine the metadata remains valid
- [ ] The Metadata tab on the character detail page (PRD-112 Req 1.18) displays a prominent "Outdated" warning badge when the flag is set
- [ ] Delivery validation (PRD-039) warns (but does not block) when delivering a character with outdated metadata
- [ ] The staleness check endpoint (Phase 4, Task 4.3) includes outdated-flagged versions in its report

**Technical Notes:**
- Requires event hooks or triggers when Bio/ToV files are saved
- The `metadata_generations` table (Task 2.1) may need an `is_outdated` column or a separate `metadata_dependency_status` tracking mechanism
- Bio and ToV are considered upstream dependencies of the metadata generation pipeline

### Requirement A.2: Metadata Import Safeguard

**Description:** Importing a new Metadata JSON file must NEVER delete or overwrite the existing `tov.json` or `bio.json` files. These are source files and must be protected. Only new metadata versions can be created from imports.

**Acceptance Criteria:**
- [ ] The metadata import/upload flow (character metadata tab, JSON drop zone) only creates new metadata version records — it does not touch `tov.json` or `bio.json` on disk
- [ ] If an import payload contains fields that overlap with Bio or ToV data, the system stores them in the metadata version only — the original Bio/ToV files remain unmodified
- [ ] The API endpoint for metadata import explicitly excludes any file deletion or overwrite operations on Bio/ToV paths
- [ ] A confirmation or informational message is shown to the user: "Importing metadata will create a new version. Your Bio and ToV files will not be affected."
- [ ] Automated tests verify that importing metadata does not alter Bio/ToV file contents or timestamps

**Technical Notes:**
- This is a defensive safeguard — Bio and ToV files are the single source of truth for their respective data
- The metadata generation pipeline reads from Bio/ToV but never writes back to them
- File path protection should be enforced at the service layer, not just the UI

### Requirement A.3: Age Field as Text

**Description:** The age field in character metadata must be a Text field (not numeric) to accept descriptive strings like "20s", "Mature", "Early 30s".

**Acceptance Criteria:**
- [ ] The `age` field in `CharacterMetadata` (Task 1.1) is typed as `String` (Rust) / `string` (TypeScript), not as a numeric type
- [ ] The character metadata form (PRD-112 Req 1.18, pretty view) renders the age field as a text input, not a number input
- [ ] Valid values include but are not limited to: "20s", "25", "Mature", "Early 30s", "Late teens", "Middle-aged"
- [ ] No numeric validation is applied to the age field — any non-empty string is accepted
- [ ] The JSON schema definition for `character_metadata.json` specifies `age` as `type: "string"`
- [ ] Existing numeric age values (if any) continue to work when stored as strings (e.g., `"25"` is valid)

**Technical Notes:**
- If the `BiographicalData` struct currently defines `age` as a numeric type, change it to `Option<String>`
- Update any frontend form validation that enforces numeric input on the age field

### Requirement A.4: VoiceID Approval Gate

**Description:** A character cannot be marked as "Final/Approved" without a valid VoiceID configured. This ensures no character reaches the delivery stage without voice configuration.

**Acceptance Criteria:**
- [ ] The character readiness checklist (PRD-107) includes "VoiceID configured" as a required criterion
- [ ] A character's status cannot be changed to "Final" or "Approved" if the `voice_id` field (stored in character settings JSONB or a dedicated column) is null or empty
- [ ] The API endpoint for status change (`PUT /api/v1/projects/{project_id}/characters/{id}`) returns a `422 Unprocessable Entity` error with message "VoiceID is required for Final/Approved status" if the gate is not met
- [ ] The frontend status change dropdown/button is disabled or shows a tooltip explaining the requirement when VoiceID is missing
- [ ] The readiness checklist on the character Overview tab (PRD-112 Req 1.14) shows VoiceID status with a link to the Settings tab where it can be configured
- [ ] Delivery validation (PRD-039) also checks VoiceID presence for all characters in the delivery package

**Technical Notes:**
- VoiceID is typically stored in the character's `settings` JSONB under a key like `elevenlabs_voice_id` or `voice_id`
- The approval gate should be enforced at the backend service layer, not just the frontend
- Integrates with PRD-107 readiness criteria evaluation

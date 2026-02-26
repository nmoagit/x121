# PRD-113: Character Ingest Pipeline

## 1. Introduction/Overview

Getting characters into the platform is currently manual — you create them one by one, upload images, paste metadata. When onboarding a batch of 20+ characters from a delivery folder, this is slow and error-prone. Studios receive character assets as folder structures like:

```
delivery/
  aj_riley/
    clothed.png
    topless.png
    metadata.json
  la_perla/
    clothed.png
    topless.png
    tov.json
    bio.json
  mr_simons/
    clothed.png
    topless.png
    metadata.json
```

This PRD introduces a **character ingest pipeline** — a system for bulk-importing characters from folder structures, with smart name parsing, automatic image detection, metadata generation (from `tov.json` + `bio.json` when `metadata.json` is missing), and validation against master templates. The pipeline handles the messy reality of varied folder structures and naming conventions, turning raw delivery folders into fully configured characters ready for generation.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-00 (Database), PRD-01 (Data Model), PRD-02 (Backend Foundation), PRD-29 (Design System), PRD-112 (Project Hub — character groups, character detail page)
- **Extends:** PRD-67 (Bulk Character Onboarding) — adds folder-based import as an additional ingest method
- **Integrates with:**
  - PRD-14 (Data Validation) — validates metadata against schema
  - PRD-22 (Source Image QA) — runs QA on imported images
  - PRD-112 (Project Hub) — import triggered from Characters tab, characters assigned to groups
  - PRD-09 (Script Orchestrator) — runs metadata generation scripts
- **Depended on by:** PRD-112 (references "Import from Folders" action)

## 3. Goals
- Enable bulk character creation from folder structures with minimal manual intervention.
- Automatically detect and parse character names from folder names, handling varied naming conventions (salutations, multi-word names, underscores, special cases).
- Automatically detect source images (clothed, topless, etc.) by filename convention.
- Automatically detect metadata files (`metadata.json`) or generate metadata from alternative sources (`tov.json` + `bio.json`).
- Validate all imported data against master templates and platform requirements.
- Provide clear, actionable feedback on the import process — what succeeded, what failed, what needs manual attention.
- Support multiple ingest methods: folder drag-and-drop, folder selection, CSV/text name lists.

## 4. User Stories
- As a Creator, I want to drag a folder of 20 character subfolders onto the import area and have the platform create all 20 characters with their images and metadata automatically.
- As a Creator, I want the platform to figure out character names from folder names like `aj_riley`, `la_perla`, `mr_simons`, and `tesa_von_doom` without me having to manually rename anything.
- As a Creator, I want the platform to automatically detect which images are clothed and which are topless based on filename.
- As a Creator, I want the platform to generate `metadata.json` from `tov.json` + `bio.json` when the metadata file is missing, and show me if the generation script fails.
- As a Creator, I want to see a validation summary after import — which characters passed, which have issues (missing images, invalid metadata, wrong video specs).
- As a Creator, I want to assign all imported characters to a specific group within my project.
- As a Creator, I want to review and correct auto-detected names before confirming the import.
- As a Creator, I want to paste a list of character names (one per line or CSV) to create characters in bulk, then upload their assets later.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Folder Scanner
**Description:** Scan a directory (uploaded or selected) and detect character folders, their contents, and structure.

**Acceptance Criteria:**
- [ ] Accepts: drag-and-drop of a folder onto the import area, or a file/folder picker dialog
- [ ] Scans the top-level folder for subfolders — each subfolder represents one character
- [ ] For each character folder, detects:
  - Image files: matches by filename pattern (e.g., `clothed.png`, `topless.png`, `clothed.jpg`, `topless.jpg`, etc.)
  - Metadata file: `metadata.json` (primary)
  - Alternative metadata sources: `tov.json` and/or `bio.json`
  - Any other files present (logged but not processed)
- [ ] Returns a structured scan result: list of detected characters with their assets and any issues
- [ ] Handles nested structures: if subfolders contain further subfolders, scan only one level deep (character folders)
- [ ] Handles empty folders gracefully (flagged as "no assets detected")
- [ ] File detection is case-insensitive (handles `Clothed.PNG`, `TOPLESS.jpg`, etc.)

#### Requirement 1.2: Character Name Parser
**Description:** Parse human-readable character names from folder names, handling diverse naming conventions.

**Acceptance Criteria:**
- [ ] Parsing rules (applied in order):
  1. Replace underscores and hyphens with spaces: `aj_riley` → `aj riley`
  2. Detect and preserve salutations: `mr`, `mrs`, `ms`, `dr`, `prof`, etc. → `Mr`, `Mrs`, etc.
  3. Detect multi-word name patterns:
     - `von`, `van`, `de`, `di`, `la`, `le`, `el`, `al` → kept lowercase as name particles
     - e.g., `tesa_von_doom` → `Tesa von Doom`
     - e.g., `la_perla` → `La Perla` (when `la` is the first word, capitalize as it's likely part of the name, not a particle)
  4. Title-case remaining words: `aj riley` → `AJ Riley` (detect all-lowercase 2-letter sequences as potential initials → uppercase)
  5. Handle edge cases:
     - `aj_riley` → `AJ Riley`
     - `la_perla` → `La Perla`
     - `mr_simons` → `Mr Simons`
     - `tesa_von_doom` → `Tesa von Doom`
     - `xena` → `Xena` (single name)
     - `mary_jane_watson` → `Mary Jane Watson`
- [ ] Parser returns both the auto-detected name and a confidence indicator (high/medium/low)
- [ ] Low confidence names are flagged for manual review
- [ ] All parsed names are editable by the user before confirming import

#### Requirement 1.3: Image Auto-Detection
**Description:** Automatically detect and classify source images within character folders.

**Acceptance Criteria:**
- [ ] Detects images by extension: `.png`, `.jpg`, `.jpeg`, `.webp`, `.tiff`
- [ ] Classifies images by filename pattern:
  - `clothed.*` → clothed track source image
  - `topless.*` → topless track source image
  - Extensible: track slugs from PRD-111 are used as filename matchers
- [ ] Falls back to detection by position/count if filenames don't match known patterns (e.g., two images → assume first is clothed, second is topless — with manual confirmation)
- [ ] Flags: missing expected images (e.g., no clothed image), unexpected extra images, unrecognized filenames
- [ ] Image classification is editable by the user before confirming import

#### Requirement 1.4: Metadata Detection & Generation
**Description:** Detect metadata files and, when `metadata.json` is missing, generate it from alternative sources using an external script.

**Acceptance Criteria:**
- [ ] **Direct metadata**: if `metadata.json` exists in the character folder, parse and validate it
- [ ] **Alternative sources**: if no `metadata.json` but `tov.json` and/or `bio.json` exist:
  - Display `tov.json` and `bio.json` contents in the preview (read-only, formatted)
  - Show "Metadata generation required" status
  - Trigger metadata generator script: takes `tov.json` + `bio.json` as input → produces `metadata.json`
  - Script execution via PRD-09 (Script Orchestrator)
  - Track script status: queued, running, completed, failed
  - On success: use generated `metadata.json` for the character
  - On failure: display error output, flag character as "metadata generation failed", allow retry or manual entry
- [ ] **No metadata at all**: flag character as "no metadata" — allow import without metadata (can be added later)
- [ ] All detected/generated metadata is viewable and editable before confirming import

#### Requirement 1.5: Metadata Validation
**Description:** Validate `metadata.json` against the platform's master metadata template to ensure all required keys are present and values are valid.

**Acceptance Criteria:**
- [ ] **Master template**: a defined schema specifying required keys, optional keys, value types, and constraints
  - Template is configurable (stored in DB or config file, editable by admins)
  - Example required keys: `name`, `age`, `ethnicity`, `hair_color`, `eye_color`, etc.
  - Example constraints: `age` must be integer > 0, `name` must match character name
- [ ] **Validation checks:**
  - JSON is syntactically valid
  - All required keys are present
  - Value types match expected types (string, number, boolean, array)
  - Value constraints are satisfied (min/max, enum values, regex patterns)
  - No unknown keys (warning, not error — allows extensibility)
- [ ] **Validation result per character:**
  - Pass: all checks green
  - Warning: valid but has unknown keys or optional fields missing
  - Fail: missing required keys or invalid values — lists specific failures
- [ ] Validation runs automatically on detected/generated metadata
- [ ] Validation results shown in the import preview

#### Requirement 1.6: Video/Asset Validation
**Description:** Validate generated videos and asset clips against platform specifications.

**Acceptance Criteria:**
- [ ] **Video technical requirements** (configurable per project or globally):
  - Framerate (e.g., 30fps)
  - Duration range (min/max per scene type)
  - Resolution (e.g., 1080p, 4K — per resolution tier from PRD-59)
  - Codec (e.g., H.264, H.265)
  - Container format (e.g., .mp4)
- [ ] **Validation runs on:**
  - Imported videos (PRD-109 external import)
  - Generated scene videos (post-generation check)
  - External asset clips (txrs_refined, mesh_refined, etc.)
- [ ] **Validation result per file:**
  - Pass: all specs met
  - Fail: lists specific mismatches (e.g., "Expected 30fps, got 24fps", "Duration 4.2s below minimum 5s")
- [ ] Results surfaced on:
  - Character detail Scenes tab (per-scene video validation badge)
  - Character detail Assets tab (per-clip validation badge)
  - Project Production tab (matrix cells show validation status)
- [ ] Integrates with PRD-49 (Automated Quality Gates) for automated pass/fail decisions

#### Requirement 1.7: Import Preview & Confirmation
**Description:** Before committing the import, show a detailed preview of what will be created, with the ability to review, edit, and fix issues.

**Acceptance Criteria:**
- [ ] **Preview table**: one row per detected character showing:
  - Parsed name (editable)
  - Detected images (thumbnails with track classification)
  - Metadata status: found / generating / generated / failed / missing
  - Validation status: pass / warning / fail
  - Target group (selectable — dropdown of project groups, or "create new group")
  - Include/exclude toggle per character (exclude to skip problematic ones)
- [ ] **Summary bar**: "X characters ready, Y need attention, Z excluded"
- [ ] **Bulk edit**: select multiple characters to:
  - Assign to a group
  - Re-run metadata generation
  - Re-run validation
- [ ] **"Fix Issues" panel**: for characters with warnings/failures, expand to show specific issues with resolution options
- [ ] **"Confirm Import" button**: creates all included characters with their images and metadata
  - Disabled until at least one character is ready
  - Shows confirmation dialog with final count
- [ ] Progress indicator during import (character-by-character)
- [ ] Post-import summary: what was created, what failed, links to created characters

#### Requirement 1.8: Text/CSV Character Name Import
**Description:** Create characters in bulk from a text list or CSV file containing character names.

**Acceptance Criteria:**
- [ ] **Text input mode**: paste character names, one per line
  - Names parsed using the same name parser (Req 1.2) — but input is already human-readable so parsing is lighter
  - Preview shows parsed names with edit capability
- [ ] **CSV upload mode**: upload a CSV file with columns:
  - Required: `name` (or `folder_name` for name parsing)
  - Optional: `group`, `metadata_json` (inline or path), `notes`
  - Preview shows parsed data before import
- [ ] Characters created with names only — images and metadata can be added later via the character detail page
- [ ] Assignable to a group during import
- [ ] Duplicate detection: warn if a character name already exists in the project

#### Requirement 1.9: Validation Dashboard
**Description:** A summary view showing validation status across all characters in a project — metadata validity, video specs, asset completeness.

**Acceptance Criteria:**
- [ ] Accessible from the project Overview tab or as a dedicated sub-view
- [ ] **Metadata validation summary**:
  - Characters with valid metadata: count + list
  - Characters with invalid metadata: count + list with specific failures
  - Characters with missing metadata: count + list
- [ ] **Video validation summary** (for characters with generated scenes):
  - Videos passing all spec checks: count
  - Videos with spec violations: count + breakdown by violation type
- [ ] **Asset completeness summary**:
  - Characters with all expected asset clips: count
  - Characters missing asset clips: count + which clips are missing
- [ ] **Drill-down**: click any summary item to see the specific characters and issues
- [ ] **Re-validate All** button: re-runs validation across all characters
- [ ] Exportable as CSV/JSON for external tracking

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Watch Folder
**Description:** Automatically detect new character folders added to a watched directory.
**Acceptance Criteria:**
- [ ] Configure a watch folder path per project
- [ ] New subfolders trigger automatic scan and preview notification
- [ ] Auto-import mode: skip preview and create characters automatically (opt-in)

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Custom Name Parsing Rules
**Description:** Admin-configurable name parsing rules for studio-specific conventions.
**Acceptance Criteria:**
- [ ] Rule editor for adding custom salutations, name particles, abbreviation patterns
- [ ] Per-project override of global parsing rules
- [ ] Test parser with sample folder names before saving rules

#### **[OPTIONAL - Post-MVP]** Requirement 2.3: Metadata Template Editor
**Description:** Admin UI for editing the master metadata template schema.
**Acceptance Criteria:**
- [ ] Define required/optional fields with types and constraints
- [ ] Version the template — changes don't invalidate existing characters retroactively
- [ ] Export/import template as JSON

## 6. Non-Goals (Out of Scope)
- Character creation UI (handled by PRD-112 — this PRD provides the ingest pipeline that PRD-112's "Import from Folders" button triggers)
- Source image QA algorithms (handled by PRD-22 — this PRD triggers QA after import)
- Video generation (handled by PRD-24 — this PRD validates generated video specs post-generation)
- Script orchestration infrastructure (handled by PRD-09 — this PRD defines a specific script for metadata generation)
- Character metadata schema design (defined by the studio — this PRD validates against a configurable template)

## 7. Design Considerations
- The import flow should feel like a **wizard** — step by step: scan → preview → fix issues → confirm. Not a single overwhelming form.
- The preview table should be **dense but scannable** — many characters, clear status indicators, expandable details.
- Validation badges should use consistent colors: green=pass, yellow=warning, red=fail.
- The name parser preview should show the **original folder name alongside the parsed name** so the user can verify the parsing.
- Metadata generation script status should update in real-time (via WebSocket or polling) — the user shouldn't have to refresh.
- Reuse design system components: `Table`, `Badge`, `Stepper/Wizard`, `FileUpload`, `Card`, `Modal`.

## 8. Technical Considerations

### Existing Code to Reuse
- PRD-09 (Script Orchestrator) for running the metadata generation script
- PRD-14 (Data Validation) patterns for schema validation
- PRD-22 (Source Image QA) for post-import image quality checks
- PRD-49 (Automated Quality Gates) for video spec validation
- PRD-67 (Bulk Onboarding) — existing CSV parsing logic
- PRD-112 character groups for assigning imported characters
- API client, TanStack Query patterns, design system components

### New Infrastructure Needed
- **Backend:**
  - Folder scan endpoint: accepts uploaded folder structure (or path reference), returns scan results
  - Name parser module: configurable rules engine for folder name → character name
  - Metadata generator script integration: specific script registered with PRD-09 orchestrator
  - Metadata schema validator: validates JSON against configurable master template
  - Video spec validator: checks framerate, duration, resolution, codec against project/global settings
  - Bulk import endpoint: creates multiple characters with images/metadata in a single transaction
- **Frontend:**
  - `FolderImportWizard` — multi-step import flow
  - `ImportPreviewTable` — character preview with inline editing
  - `NameParserPreview` — shows original → parsed name mapping
  - `MetadataGenerationStatus` — real-time script status display
  - `ValidationSummaryPanel` — per-character validation results
  - `ValidationDashboard` — project-wide validation overview
  - Hooks: `useFolderScan()`, `useImportPreview()`, `useConfirmImport()`, `useMetadataGeneration()`, `useValidationSummary()`

### Database Changes
- **Metadata master template** table (or config): stores the schema definition for metadata validation
- **Video spec requirements** table: stores per-project or global video specifications (fps, resolution, duration ranges)
- **Import history** table: tracks past imports (who, when, how many characters, from where)

### API Changes
- `POST /api/v1/projects/{id}/import/scan` — scan uploaded folder structure
- `POST /api/v1/projects/{id}/import/preview` — parse names, detect assets, run validation
- `POST /api/v1/projects/{id}/import/confirm` — execute the import (create characters + upload assets)
- `POST /api/v1/characters/{id}/generate-metadata` — trigger metadata generation from tov.json + bio.json
- `GET /api/v1/projects/{id}/validation-summary` — project-wide validation status
- `POST /api/v1/projects/{id}/validate` — re-run validation across all characters
- `GET /api/v1/metadata-template` — get current master metadata template
- `GET /api/v1/video-specs` — get video specification requirements

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Importing 20 characters from a folder takes <60 seconds (scan + preview + confirm)
- Name parser correctly handles 90%+ of common naming patterns without manual correction
- Metadata generation from tov.json + bio.json succeeds with clear error reporting on failure
- Validation catches 100% of invalid metadata (missing required keys, wrong types)
- Video spec validation catches all framerate/duration/resolution mismatches
- Zero data loss during import — partial failures don't corrupt successfully imported characters

## 11. Open Questions
- Should the metadata generation script be a built-in platform feature or a user-configurable script?
- What is the exact master metadata template schema? (Needs to be defined by the studio)
- Should video spec validation run automatically post-generation, or only on demand?
- Should the folder scanner support ZIP file uploads (upload a ZIP, extract, scan)?
- How should the platform handle folder names that are completely numeric (e.g., `001`, `002`)?
- Should there be a "template character" concept — import creates characters pre-configured with a specific character's settings?

## 12. Version History
- **v1.0** (2026-02-24): Initial PRD creation

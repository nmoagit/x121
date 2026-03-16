# PRD-135: Character Creator

## 1. Introduction / Overview

The platform currently requires characters to be created within a project context, with full video import as part of the workflow. There is no dedicated page for provisioning characters with just seed images and metadata — the foundational data needed before any video generation can happen.

This PRD adds a **Character Creator** page at `/content/characters` that focuses on the seed-data workflow: uploading seed images (clothed.png, topless.png), providing metadata (bio.json, tov.json), organising characters into groups, and assigning them to projects. It supports bulk import via folder drop with intelligent file matching, including a fallback assignment grid when files aren't named according to convention.

The page shares its core layout and components with the existing project characters tab (groups, cards, filters, drop zone) via extracted shared modules, but excludes video-related functionality.

## 2. Related PRDs & Dependencies

**Depends on:**
- **PRD-112** — Project Hub & Management (character groups, project detail page)
- **PRD-113** — Character Ingest Pipeline (folder import, name parsing, metadata generation)
- **PRD-066** — Character Metadata Editor (metadata schema, templates)

**Extends:**
- **PRD-112** — Extracts shared character group/card components for reuse
- **PRD-113** — Adds unmatched file assignment grid to the import flow

**Related:**
- **PRD-124** — Character Speech Types (future speech text integration)
- **PRD-076** — Character Identity Embedding (face detection from seed images)
- **PRD-128** — Character Readiness Indicators (completeness tracking)

## 3. Goals

1. Provide a dedicated page for provisioning characters with seed images and metadata, independent of video workflows.
2. Support bulk character creation via folder drop with automatic file matching and a fallback assignment grid for unrecognised filenames.
3. Share character group/card/filter components between the Creator page and the existing project characters tab to avoid duplication.
4. Support admin-level project creation from folder structure (with confirmation) and project-scoped import for non-admin users.
5. Enforce that both bio.json and tov.json are required for metadata, while allowing character creation without images or JSON (incomplete state).
6. Guard against selecting the same image or JSON file for multiple categories.
7. Lay groundwork for future speech text integration.

## 4. User Stories

- **As a producer**, I want a dedicated page to create characters with their seed images and metadata so I can prepare characters before starting any video generation.
- **As an admin**, I want to drop a folder structured as `project/group/character` and have the system auto-detect the structure, confirm project creation, and import everything.
- **As a project user**, I want to drop a folder structured as `group/character` and have characters created within my assigned project.
- **As a producer**, I want the system to find `clothed.png`, `topless.png`, `bio.json`, and `tov.json` by name, and when files don't match, show me a grid where I can assign each file to the correct category.
- **As a producer**, I want to see image thumbnails in the assignment grid so I can visually identify which image is clothed vs topless.
- **As a producer**, I want to be prevented from assigning the same file to multiple categories or characters.
- **As a producer**, I want to update existing characters by re-dropping their folder, with the option to overwrite or skip.
- **As a producer**, I want to select a metadata template before import so the correct fields are mapped from my JSON files.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Character Creator Page

**Description:** A new page at `/content/characters` that displays all characters across projects (for admins) or within the user's assigned project (for project users). Uses the same group-based card layout, search, filters, and toggles as the project characters tab.

**Acceptance Criteria:**
- [ ] Page accessible at `/content/characters` in the Content nav section
- [ ] Admin users see characters across all projects with a Project filter
- [ ] Project users see only characters in their assigned project
- [ ] Characters displayed in collapsible group sections with cards (same as project characters tab)
- [ ] Search, group filter, show disabled toggle, and audit view toggle present
- [ ] "New Group", "Add Character" actions available
- [ ] Character cards show seed image thumbnails, name, metadata completeness status
- [ ] No video-related UI elements (no scene cards, no generation buttons)

#### Requirement 1.2: Shared Character Group/Card Module

**Description:** Extract the character group sections, character cards, filter bar, and related logic from `ProjectCharactersTab` into a shared module that both the project tab and the Creator page consume.

**Acceptance Criteria:**
- [ ] Shared components extracted (e.g., `CharacterGroupView`, `CharacterCardGrid`, `CharacterFilterBar`)
- [ ] Project characters tab uses the shared module with video features enabled
- [ ] Character Creator page uses the shared module with video features disabled
- [ ] No duplication of group/card/filter rendering logic between the two pages
- [ ] Both pages remain functionally identical to their pre-refactor behaviour

#### Requirement 1.3: Seed Image Drop Zone

**Description:** The Creator page includes a drop zone that accepts folders containing character seed images and metadata files.

**Acceptance Criteria:**
- [ ] Drop zone accepts folder drops and file browsing
- [ ] Detects folder structure depth:
  - Admin: `project/group/character` (3 levels) or `group/character` (2 levels) or flat
  - Project user: `group/character` (2 levels) or flat; ignores project-level depth
- [ ] For each character folder, looks for recognised filenames first:
  - `clothed.png` (case-insensitive, any image extension)
  - `topless.png` (case-insensitive, any image extension)
  - `bio.json` (case-insensitive)
  - `tov.json` (case-insensitive)
- [ ] When files don't match recognised names, falls through to the File Assignment Modal (Req 1.5)
- [ ] SHA-256 hash deduplication against existing content

#### Requirement 1.4: Admin Project Auto-Creation (with Confirmation)

**Description:** When an admin drops a folder with project-level depth (`project/group/character`), the system detects projects to create and shows a confirmation step.

**Acceptance Criteria:**
- [ ] System detects project names from top-level folder names
- [ ] Confirmation modal shows: projects to create, groups per project, character count per group
- [ ] Existing projects are matched by name (not duplicated)
- [ ] User can deselect specific projects before confirming
- [ ] After confirmation, projects and groups are created, then characters are imported
- [ ] Project-level users skip this step entirely (project-level folders are treated as groups)

#### Requirement 1.5: File Assignment Modal (Unmatched Files)

**Description:** When dropped files don't match recognised filenames, a modal shows a per-character assignment grid where users can map each file to a category.

**Acceptance Criteria:**
- [ ] Modal displays one row per character
- [ ] Columns: Character Name, Clothed Image, Topless Image, Bio JSON, ToV JSON
- [ ] Each cell shows a dropdown of available unmatched files for that character's folder
- [ ] Image files show thumbnail previews in the dropdown and in the selected state
- [ ] JSON files show the filename
- [ ] A file can only be assigned to one category across all characters (guard against duplicates)
- [ ] Already-matched files (from recognised names) are pre-filled and shown as locked
- [ ] "Skip" option available for each cell (field left empty)
- [ ] Validation: warns if bio.json or tov.json is not assigned (both are required for metadata)
- [ ] Character creation is NOT blocked by missing images or JSON — partial state is allowed
- [ ] Confirm button proceeds with import using the assignments

#### Requirement 1.6: Metadata Template Selection

**Description:** Before import confirmation, users can select which metadata template to use for mapping fields from bio.json and tov.json.

**Acceptance Criteria:**
- [ ] Template selector dropdown in the import confirmation flow
- [ ] Defaults to the active/default template
- [ ] Selected template determines which fields are extracted from JSON files
- [ ] Template selection applies to all characters in the batch

#### Requirement 1.7: Re-Import / Update Mode

**Description:** When dropping a folder with characters that already exist, offer update options consistent with the existing project import flow.

**Acceptance Criteria:**
- [ ] Existing characters detected by name match within the target project
- [ ] Toggles available: "Import missing" (add assets to existing), "Overwrite existing" (replace assets), "New content only" (skip identical files via hash)
- [ ] Duplicate characters shown with indicator in the import preview
- [ ] Same toggle behaviour as existing `ImportConfirmModal`

#### Requirement 1.8: Backport File Assignment Modal to Project Import

**Description:** The unmatched file assignment grid (Req 1.5) is also available in the main project drop zone import flow (the one that includes videos).

**Acceptance Criteria:**
- [ ] When the project drop zone encounters unrecognised image/JSON filenames, the File Assignment Modal opens
- [ ] Same assignment grid UX as the Creator page
- [ ] Video files continue to use the existing scene-type matching logic (unchanged)
- [ ] File Assignment Modal is a shared component used by both import flows

#### Requirement 1.9: Character Completeness Indicators

**Description:** Character cards show visual indicators for seed data completeness.

**Acceptance Criteria:**
- [ ] Card shows indicators for: clothed image, topless image, bio.json, tov.json
- [ ] Complete items shown with a check; missing items shown with a dash or empty state
- [ ] Overall completeness status: "Complete" (all 4), "Partial" (some), "Empty" (none)
- [ ] Completeness does not block character creation or display

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Speech Text Integration

**[OPTIONAL — Post-MVP]** Add speech text fields to the character creator.

- Character folders may contain speech text files (e.g., `greeting.txt`, `farewell.txt`)
- Speech text is stored via the PRD-124 speech types system
- File Assignment Modal gains additional columns for speech categories
- Speech text preview in the import confirmation

#### Requirement 2.2: Inline Metadata Editing

**[OPTIONAL — Post-MVP]** Allow editing bio and ToV fields directly on the Creator page without navigating to the character detail page.

#### Requirement 2.3: Batch Metadata Generation

**[OPTIONAL — Post-MVP]** After import, offer to auto-generate metadata for all characters that have bio.json + tov.json using the existing LLM refinement pipeline.

## 6. Non-Goals (Out of Scope)

- **Video import** — The Creator page does not handle video files. Video import stays in the project characters tab.
- **Scene creation** — No scene or generation workflow on this page.
- **Character detail editing** — Full character editing (metadata tab, images tab, scenes tab) remains on the existing character detail page. The Creator is for initial provisioning only.
- **Drag-and-drop reordering** — Characters within groups are sorted alphabetically, not manually ordered.
- **Multi-project assignment** — A character belongs to one project. No multi-project linking.

## 7. Design Considerations

### Page Layout
Matches the project characters tab: collapsible group sections containing character cards in a responsive grid. Filter bar at the top with search, group filter (MultiSelect), project filter (admin only), show disabled toggle.

### File Assignment Grid
- Table layout with character rows and category columns
- Image cells show thumbnail previews (64×64) with the filename below
- JSON cells show filename with a document icon
- Dropdown menus anchored to each cell for file selection
- Selected files highlighted; already-assigned files greyed out in other dropdowns
- Validation errors shown inline (e.g., "Same file assigned to Clothed and Topless")

### Character Cards (Creator Mode)
Similar to existing `CharacterCard` but with seed data focus:
- Avatar thumbnail (clothed image if available, placeholder if not)
- Character name
- Seed data completeness indicators (4 small icons/dots)
- Group badge
- Project badge (admin view)

## 8. Technical Considerations

### Existing Code to Reuse
- `ProjectCharactersTab` group/card/filter logic → extract to shared module
- `ImportConfirmModal` toggles (import missing, overwrite, new content only)
- `FileDropZone` component for drag-and-drop handling
- `useCharacterImport` hook phases 0-3.5 (groups, characters, images, metadata)
- `flattenMetadata()` / `unflattenMetadata()` / `generateMetadata()`
- `normalizeCharacterName()` for folder-name cleanup
- `postImageVariantUpload()` for image uploads
- SHA-256 content hash deduplication

### New Infrastructure Needed
- `FileAssignmentModal` component (per-character assignment grid)
- Shared character group/card module (extracted from `ProjectCharactersTab`)
- Character Creator page component
- Route and navigation entry for `/content/characters`

### Database Changes
- None — uses existing tables (characters, character_groups, image_variants, character_metadata_versions)

### API Changes
- None — uses existing endpoints for character CRUD, image upload, metadata update, group management

## 9. Success Metrics

- Users can create characters with seed images and metadata from a dedicated page
- Folder drop with auto-detection works for both admin (3-level) and project user (2-level) structures
- Unmatched files are handled via the assignment grid without blocking the workflow
- No code duplication between Creator page and project characters tab
- Existing project import flow gains the file assignment grid for unmatched files

## 10. Open Questions

- None remaining — all clarified during PRD creation.

## 11. Version History

- **v1.0** (2026-03-16): Initial PRD creation

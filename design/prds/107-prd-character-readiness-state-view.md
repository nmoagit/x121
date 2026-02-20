# PRD-107: Character Readiness & State View

## 1. Introduction/Overview
When managing a large character library, creators need to quickly see which characters are ready for production and which need additional setup. Currently, determining a character's readiness requires navigating to multiple screens (source images, variants, metadata, settings). This PRD provides a centralized state view within the character library that displays the readiness status of each character at a glance — showing what has been completed, what is pending, and what specific items are missing (e.g., "seed image required", "missing voice setting", "metadata incomplete").

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model — character entity and settings), PRD-13 (Dual Metadata System), PRD-14 (Data Validation), PRD-21 (Source Image Management), PRD-60 (Character Library), PRD-66 (Metadata Editor — completeness indicator)
- **Depended on by:** PRD-108 (Character Settings Dashboard)
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Display the readiness state of every character in the library in a single list/grid view.
- Define readiness criteria as a configurable checklist per project or studio.
- Show actionable status indicators (what is missing and what action to take).
- Surface per-character settings alongside readiness state (which seeds are needed, model-specific prompts).
- Enable filtering and sorting by readiness state to prioritize setup work.

## 4. User Stories
- As a Creator, I want to see a list of all characters with their readiness state so that I know which ones still need setup before I can start generation.
- As a Creator, I want to see "seed image required" or "missing ElevenLabs voice" next to a character so that I know exactly what action to take.
- As a Creator, I want to see per-character settings (which seeds are configured, which model-specific prompts are set) alongside their state so that I can make informed decisions.
- As an Admin, I want to filter the library to show only characters that are not ready so that I can assign setup work efficiently.
- As a Creator, I want the readiness criteria to be configurable so that different projects can require different fields before marking a character as "ready".

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Readiness State Computation
**Description:** Compute and display the readiness state for each character based on configurable criteria.
**Acceptance Criteria:**
- [ ] Readiness state computed from: source image presence, approved variant availability, metadata completeness (PRD-66 Req 1.5), settings completeness (PRD-01 v1.1)
- [ ] Each readiness criterion is individually tracked (e.g., "source image: done", "voice setting: missing")
- [ ] Overall state is one of: Ready, Partially Ready, Not Started
- [ ] State updates in real-time when character data changes
- [ ] State computation is efficient for libraries with 200+ characters

#### Requirement 1.2: Library State List View
**Description:** Table/grid view in the character library showing readiness state per character.
**Acceptance Criteria:**
- [ ] Each character row shows: name, thumbnail, overall readiness state, list of missing items
- [ ] Missing items displayed as compact tags/badges (e.g., "seed image", "a2c4 model", "avatar JSON", "metadata.json")
- [ ] Color-coded readiness: green (ready), yellow (partially ready), red (not started)
- [ ] Expandable row to show detailed readiness breakdown
- [ ] Integrated into the existing character library view (PRD-60)

#### Requirement 1.3: Character Settings Summary
**Description:** Show per-character settings alongside the readiness state.
**Acceptance Criteria:**
- [ ] Display which pipeline settings are configured (from PRD-01 settings JSONB): a2c4 model, ElevenLabs voice, avatar JSON, and any custom keys
- [ ] Show which seed images are available and their approval status
- [ ] Show model-specific prompt overrides if any
- [ ] Settings are viewable inline without navigating to another page

#### Requirement 1.4: Filtering & Sorting
**Description:** Filter and sort the library by readiness criteria.
**Acceptance Criteria:**
- [ ] Filter by readiness state: Ready, Partially Ready, Not Started
- [ ] Filter by specific missing item (e.g., "show all characters missing voice setting")
- [ ] Sort by readiness percentage (most complete first or least complete first)
- [ ] Sort by character name, creation date, or last updated date
- [ ] Filters persist across navigation within the session

#### Requirement 1.5: Configurable Readiness Criteria
**Description:** Allow admins to configure which fields are required for a character to be considered "ready".
**Acceptance Criteria:**
- [ ] Default readiness checklist: source image, at least one approved variant, metadata.json complete, settings fields (configurable list)
- [ ] Project-level override: each project can add or remove required fields
- [ ] Studio-level default: applies to all projects unless overridden
- [ ] Changes to criteria recalculate readiness states for affected characters

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Readiness Progress Dashboard
**Description:** Aggregate readiness statistics for a project or the entire studio.
**Acceptance Criteria:**
- [ ] Summary: "42 of 60 characters ready, 12 partially ready, 6 not started"
- [ ] Breakdown by missing item: "18 characters missing voice setting, 6 missing seed image"
- [ ] Progress tracking over time

## 6. Non-Goals (Out of Scope)
- Individual character metadata editing (covered by PRD-66)
- Character settings editing (covered by PRD-108 Character Settings Dashboard)
- Source image upload and variant generation (covered by PRD-21)
- Character library management and cross-project sharing (covered by PRD-60)

## 7. Design Considerations
- The state view should be a mode/tab within the existing character library (PRD-60), not a separate page.
- Missing item badges should use consistent iconography that matches the platform's design system (PRD-29).
- Clicking a missing item badge should navigate to the relevant setup screen (e.g., clicking "seed image" navigates to PRD-21 source image upload).
- The view should support both compact (table) and expanded (card grid) layouts.

## 8. Technical Considerations
- **Stack:** React for UI components, Rust for readiness computation service
- **Existing Code to Reuse:** PRD-60 character library browser, PRD-66 completeness indicator logic, PRD-29 design system components
- **New Infrastructure Needed:** Readiness computation engine, readiness criteria configuration store, state cache
- **Database Changes:** `readiness_criteria` table (id, scope_type [studio|project], scope_id, criteria_json), `character_readiness_cache` table (character_id, state, missing_items_json, computed_at) for performance
- **API Changes:** GET /characters/:id/readiness, GET /library/characters/readiness-summary, CRUD /readiness-criteria, GET /library/characters?readiness_state=not_ready (filter parameter)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Readiness state view loads in <2 seconds for a 200-character library
- Readiness computation updates within 5 seconds of a character data change
- Creators report reduced time finding characters that need setup work (validated by user feedback)
- Zero false "Ready" states (no character marked ready when required items are missing)

## 11. Open Questions
- Should readiness state be cached and invalidated on change, or computed on demand?
- Should there be notifications when a character transitions from "not ready" to "ready"?
- Should the readiness view show estimated effort to complete setup for each character?

## 12. Version History
- **v1.0** (2026-02-19): Initial PRD creation — character library readiness and state view

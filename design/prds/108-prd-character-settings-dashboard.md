# PRD-108: Character Settings Dashboard

## 1. Introduction/Overview
Each character in the platform accumulates configuration across multiple domains: source images, approved variants, biographical metadata, pipeline settings (a2c4 model, ElevenLabs voice, avatar JSON), scene type assignments, and generation history. Currently, this information is scattered across different screens and PRDs. The Character Settings Dashboard provides a single unified view per character that aggregates ALL settings, shows what is configured, and prominently highlights what is **missing** — acting as the definitive "control panel" for a character's production readiness.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model — character entity and settings), PRD-13 (Dual Metadata System), PRD-21 (Source Image Management), PRD-23 (Scene Type Configuration), PRD-60 (Character Library), PRD-66 (Character Metadata Editor), PRD-107 (Character Readiness & State View)
- **Depended on by:** None
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Provide a single-page dashboard for each character showing ALL configuration and settings.
- Prominently display missing or incomplete items with clear calls to action.
- Enable inline editing of settings without navigating away from the dashboard.
- Serve as the go-to page for understanding a character's complete production state.

## 4. User Stories
- As a Creator, I want a single dashboard for each character showing all its settings so that I don't need to navigate to 5 different screens to understand the character's state.
- As a Creator, I want to see what is missing (e.g., "missing voice", "no avatar JSON", "metadata.json incomplete") prominently at the top so that I can fix it quickly.
- As a Creator, I want to edit settings inline on the dashboard so that I can fix missing items without leaving the page.
- As an Admin, I want to see a character's full configuration at a glance so that I can verify it before approving for production.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Dashboard Layout
**Description:** Single-page dashboard with organized sections for all character configuration.
**Acceptance Criteria:**
- [ ] Dashboard accessible from character library, character detail, or direct URL
- [ ] Organized into sections: Identity, Source Images, Variants, Metadata, Pipeline Settings, Scene Assignments, Generation History
- [ ] Responsive layout: sections stack on narrow screens, side-by-side on wide screens
- [ ] Breadcrumb navigation back to project/library

#### Requirement 1.2: Missing Items Section
**Description:** Prominent section at the top of the dashboard highlighting what is missing or incomplete.
**Acceptance Criteria:**
- [ ] Missing items displayed as a checklist at the top of the dashboard
- [ ] Each missing item shows: what is missing, why it matters, and a direct action button to fix it
- [ ] Examples of missing items: "Missing ElevenLabs voice setting", "No approved seed image", "Avatar JSON not uploaded", "metadata.json incomplete (3 required fields missing)", "No a2c4 model assigned"
- [ ] When all items are complete, the section shows a green "All settings configured" indicator
- [ ] Missing items list is driven by the readiness criteria from PRD-107

#### Requirement 1.3: Identity & Images Section
**Description:** Character identity, source images, and variant status overview.
**Acceptance Criteria:**
- [ ] Character name, creation date, project membership
- [ ] Source image thumbnail with upload/replace action
- [ ] Approved variants displayed as a thumbnail gallery with status badges
- [ ] Link to full variant management (PRD-21)

#### Requirement 1.4: Pipeline Settings Section
**Description:** Display and edit all pipeline/operational settings from the character's settings JSONB.
**Acceptance Criteria:**
- [ ] Display all configured settings: a2c4 model, ElevenLabs voice, avatar JSON, and any dynamic keys
- [ ] Inline editing for each setting field (text input, file upload for avatar JSON, dropdowns for known enums)
- [ ] "Add Setting" button to add new arbitrary key-value pairs
- [ ] Settings changes saved via PATCH /characters/:id/settings (PRD-01)
- [ ] Visual distinction between configured settings (filled) and missing settings (empty/placeholder)

#### Requirement 1.5: Metadata Section
**Description:** Summary of biographical metadata with completeness indicator.
**Acceptance Criteria:**
- [ ] Metadata completeness progress bar (reuses PRD-66 Req 1.5 indicator)
- [ ] List of required fields with filled/missing status
- [ ] Inline editing for simple fields; "Open in Metadata Editor" button for complex editing
- [ ] Preview of the generated metadata.json (from PRD-13)

#### Requirement 1.6: Scene Assignments Section
**Description:** Which scene types are assigned to this character and their generation status.
**Acceptance Criteria:**
- [ ] List of assigned scene types with status per variant (not started, generating, approved, etc.)
- [ ] Prompt overrides per scene type shown if any
- [ ] Link to scene type configuration (PRD-23)
- [ ] Link to batch orchestrator view for this character (PRD-57)

#### Requirement 1.7: Generation History Section
**Description:** Summary of generation activity for this character.
**Acceptance Criteria:**
- [ ] Total segments generated, approved, rejected, pending
- [ ] Last generation date and duration
- [ ] Quality summary: average QA scores, consistency score (from PRD-94 if available)
- [ ] Link to full generation history

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Settings Comparison
**Description:** Compare settings between two characters side-by-side.
**Acceptance Criteria:**
- [ ] Select two characters for side-by-side settings comparison
- [ ] Differences highlighted per field
- [ ] "Copy settings from" action to clone settings between characters

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Settings Templates
**Description:** Save and apply settings templates across characters.
**Acceptance Criteria:**
- [ ] Save current character's settings as a named template
- [ ] Apply a template to one or more characters
- [ ] Template shows which fields will be overwritten

## 6. Non-Goals (Out of Scope)
- Character library browsing and cross-project management (covered by PRD-60)
- Metadata schema definition and validation rules (covered by PRD-14)
- Full metadata editing experience (covered by PRD-66)
- Source image upload and variant generation workflow (covered by PRD-21)
- Readiness computation logic (covered by PRD-107)

## 7. Design Considerations
- The dashboard should feel like a "profile page" for a character — everything in one place.
- Missing items section should be visually prominent (e.g., warning banner at the top) but collapsible once all items are resolved.
- Each section should be collapsible to let users focus on what they need.
- Inline editing should use the same form components from PRD-29 design system.
- The dashboard should load progressively — show identity and missing items first, then lazy-load heavier sections (generation history, scene assignments).

## 8. Technical Considerations
- **Stack:** React for dashboard UI, Rust for aggregated data API
- **Existing Code to Reuse:** PRD-29 design system components, PRD-66 metadata editor forms, PRD-107 readiness computation, PRD-60 character library navigation
- **New Infrastructure Needed:** Character dashboard data aggregation service, inline settings editor component
- **Database Changes:** None (reads from existing tables: characters, source_images, image_variants, scenes, segments, and character settings JSONB)
- **API Changes:** GET /characters/:id/dashboard (aggregated endpoint returning all dashboard data in one call), PATCH /characters/:id/settings (partial settings update — may already exist from PRD-01)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Dashboard loads in <3 seconds with all sections populated
- Creators report needing fewer navigation steps to understand a character's state (validated by user feedback)
- Missing items section correctly identifies 100% of incomplete configuration
- Inline settings edits save successfully within 1 second

## 11. Open Questions
- Should the dashboard support a "quick setup" mode that walks through missing items one by one?
- Should settings changes on the dashboard trigger the same audit logging as PRD-45?
- Should the dashboard show a diff when settings change (before/after)?
- How should the dashboard handle characters that exist in multiple projects (PRD-60) — show combined or per-project view?

## 12. Version History
- **v1.0** (2026-02-19): Initial PRD creation — unified character settings dashboard with missing items section

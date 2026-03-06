# PRD-060: Character Library (Cross-Project)

## 1. Introduction/Overview
Characters are the most expensive asset to prepare — source image QA, variant generation, external editing, and metadata population. Re-doing this work for every project that features the same character is pure waste. This PRD provides a studio-level shared character registry that spans projects, allowing approved characters to be reused without re-generation, with linked metadata and cross-project visibility.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model), PRD-03 (RBAC), PRD-20 (Search), PRD-21 (Source Images)
- **Depended on by:** PRD-67 (Bulk Onboarding)
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Maintain a studio-level character registry independent of individual projects.
- Enable project import of characters with their approved variants and metadata.
- Provide linked metadata model (sync vs. copy per field).
- Show cross-project usage of each character.

## 4. User Stories
- As a Creator, I want to import an existing character from the studio library so that I skip variant generation for a character we've already prepared.
- As a Creator, I want library-level variants shared across projects so that Project B doesn't re-generate Jane's clothed variant that was already approved in Project A.
- As an Admin, I want to see all projects using a specific character so that I understand the impact of updating that character.
- As a Creator, I want per-field choice between linked and copied metadata so that some fields stay in sync while others diverge per project.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Studio Character Registry
**Description:** Studio-level character storage independent of projects.
**Acceptance Criteria:**
- [ ] Characters can be registered at the studio level
- [ ] Registry stores source image, all approved variants, and master metadata
- [ ] Library browsable by name, tags, and visual similarity

#### Requirement 1.2: Project Import
**Description:** Import characters from library into projects.
**Acceptance Criteria:**
- [ ] Import creates references to approved images (not copies)
- [ ] Metadata is copied (and optionally linked) to the project
- [ ] Import is non-destructive to the library record

#### Requirement 1.3: Variant Sharing
**Description:** Approved variants available across projects.
**Acceptance Criteria:**
- [ ] Approved variants from any project are available in the library
- [ ] New projects don't need to re-generate already-approved variants
- [ ] Variant updates in the library notify projects using that character

#### Requirement 1.4: Linked Metadata Model
**Description:** Per-field linking vs. copying of metadata.
**Acceptance Criteria:**
- [ ] Per-field choice: link (auto-sync with library) or copy (diverge independently)
- [ ] Linked fields update automatically when library record changes
- [ ] Visual indicator for linked vs. copied fields in the metadata editor

#### Requirement 1.5: Cross-Project Visibility
**Description:** See all projects using a character from the library view.
**Acceptance Criteria:**
- [ ] Library profile shows all projects using the character
- [ ] Per-project scene status visible (approved, pending, setup)
- [ ] Navigation from library to project views

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Library Access Control
**Description:** Separate permissions for library management.
**Acceptance Criteria:**
- [ ] Who can add/edit characters in the library is configurable separately from project permissions

## 6. Non-Goals (Out of Scope)
- Source image management workflow (covered by PRD-21)
- Search infrastructure (covered by PRD-20)
- Metadata editing UI (covered by PRD-66)

## 7. Design Considerations
- Library should be accessible as a top-level navigation item alongside projects.
- Import from library should feel like "adding to cart" — select, confirm, done.

## 8. Technical Considerations
- **Stack:** React for library browser, Rust for registry service
- **Existing Code to Reuse:** PRD-20 search, PRD-21 variant management
- **New Infrastructure Needed:** Library registry, import service, metadata link tracker
- **Database Changes:** `library_characters` table, `project_character_links` table, metadata field link tracking
- **API Changes:** CRUD /library/characters, POST /projects/:id/import-character, GET /library/characters/:id/usage

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Character import from library takes <5 seconds
- Variant sharing eliminates 100% of redundant variant generation
- Linked metadata fields sync within 1 minute of library update

## 11. Open Questions
- Should library characters have a separate approval workflow from project characters?
- How should conflicts be resolved when a project has modified a linked field?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
- **v1.1** (2026-03-06): Amendment — Requirements gap fill (Reqs A.1-A.2).

---

## Amendment (2026-03-06): Requirements Gap Fill

The following requirements were identified during a stakeholder requirements review and address gaps in the original PRD. They do not modify any existing requirements.

### Requirement A.1: Scene Type & Track Filtering

**Description:** The global library must support filtering by Scene Type and Track in addition to the existing name, tags, and visual similarity browsing capabilities.

**Acceptance Criteria:**
- [ ] The library browser UI (Task 3.2) includes filter controls for Scene Type and Track
- [ ] Scene Type filter shows all scene types from the scene catalog (PRD-111) as a multi-select dropdown or checkbox list
- [ ] Track filter shows all tracks (from PRD-111 track system) as a multi-select dropdown or checkbox list
- [ ] Filters are additive — selecting Scene Type "Greeting" and Track "Standard" returns characters that have approved content for a Greeting scene in the Standard track
- [ ] Filtering queries the cross-project scene data: a character matches if any of its project instances have an approved final version for the selected scene type/track combination
- [ ] Filters can be combined with the existing name and tag search (AND logic between filter types)
- [ ] Clear all filters action resets to unfiltered view
- [ ] Filter selections are reflected in the URL query string for shareability

**Technical Notes:**
- Requires a backend query that joins `library_characters` -> `project_character_links` -> `characters` -> `scenes` -> `scene_types` and optionally `scene_video_versions` (for approved status)
- API: `GET /api/v1/library/characters?scene_type_ids=1,2&track_ids=3` with comma-separated ID lists
- Consider caching or materialized views for performance if the join chain is expensive

### Requirement A.2: Read-Only Gallery Mode

**Description:** The global library is a read-only gallery by default. Users can browse and filter assets but cannot edit them directly. A "Go to Character" button on each asset card provides quick navigation to the character's edit page.

**Acceptance Criteria:**
- [ ] The library browser (Task 3.2) displays character assets in a gallery/grid layout without inline edit controls
- [ ] No edit, delete, rename, or metadata modification actions are available directly in the library view
- [ ] Each character card in the library includes a "Go to Character" button (or link icon) that navigates to the character's detail page in its source project (`/projects/:projectId/characters/:characterId`)
- [ ] If a character exists in multiple projects, the "Go to Character" action shows a dropdown or popover listing all projects with a link to each
- [ ] The library profile/detail view (Req 1.5 cross-project visibility) is also read-only — displays metadata, variants, and project usage but no edit controls
- [ ] The only write action available from the library is "Import to Project" (Req 1.2) which creates a new project-level copy, not an in-place edit
- [ ] Admin users with library management permissions (PRD-060 Req 2.1, post-MVP) will get edit controls in a future phase — the gallery mode is the default for all users in MVP

**Technical Notes:**
- This simplifies the MVP library UI — no need for inline editing, validation, or save flows
- The "Go to Character" navigation uses the `project_character_links` table to resolve which project(s) contain the character
- Reuse the existing `CharacterCard` component from PRD-112 in read-only mode (no action buttons except "Go to Character" and "Import")

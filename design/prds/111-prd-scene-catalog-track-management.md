# PRD-111: Scene Catalog & Track Management

## 1. Introduction/Overview

The platform generates video content across a defined set of scene types (dance, sex, kiss, etc.), each of which may exist in multiple "tracks" (clothed, topless — extensible to future tracks). Currently, scene types are configured per-project with a simple `variant_applicability` string field that doesn't scale: it can't represent arbitrary track combinations, doesn't provide a browsable catalog, and has no UI for managing the scene inventory.

This PRD introduces a proper **scene catalog** — a studio-level registry of scene definitions — and a **track system** that replaces `variant_applicability` with a normalized, extensible many-to-many relationship. Beyond the global catalog, projects and characters need to control which scenes are enabled for generation — not every character needs every scene. The Scenes page becomes the central place to view, add, and configure which scenes exist and which tracks each scene supports, while project and character views get scene enablement controls.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-00 (Database Normalization), PRD-01 (Data Model), PRD-02 (Backend Foundation), PRD-23 (Scene Type Configuration), PRD-29 (Design System)
- **Modifies:** PRD-23 — replaces `variant_applicability` with track assignments; existing scene type config UI updated to use track selector
- **Depended on by:** PRD-57 (Batch Orchestrator), PRD-62 (Storyboard View), PRD-68 (Cross-Character Comparison), PRD-109 (Scene Video Versioning)

## 3. Goals
- Provide a browsable, searchable catalog of all scene definitions in the platform.
- Replace the rigid `variant_applicability` string with a normalized tracks system that supports an arbitrary number of tracks.
- Allow admins to add, rename, reorder, and deactivate scenes and tracks without schema migrations.
- Seed the catalog with the ~28 initial scene concepts and 2 tracks (clothed, topless).
- Provide a clear UI that shows which tracks each scene supports, with easy toggle controls.
- Support the `clothes_off` transition as a per-scene flag (not a track).
- Allow projects to select which catalog scenes are enabled for generation.
- Allow per-character overrides to disable specific scenes (inheriting from project defaults).

## 4. User Stories
- As an Admin, I want to see a complete list of all scene definitions so that I know exactly what content the platform produces.
- As an Admin, I want to add a new scene definition (e.g., "lapdance") and assign it to one or more tracks so that it becomes available for generation.
- As an Admin, I want to add a new track (e.g., "lingerie") so that existing scenes can optionally be generated in that variant.
- As an Admin, I want to toggle which tracks a scene supports so that I control the generation matrix precisely.
- As an Admin, I want to mark certain scenes as having a `clothes_off` transition variant so that the pipeline knows to generate a transition video.
- As a Creator, I want to browse the scene catalog and see at a glance which tracks each scene has so that I understand the full content inventory.
- As a Creator, I want to enable or disable specific scenes for a project so that only the relevant scenes are generated.
- As a Creator, I want to override scene enablement per character so that I can exclude scenes that don't suit a specific character (e.g., no gloryhole for a particular character).
- As a Creator, I want to see which scenes are enabled for a character, with clear indication of whether the setting comes from the project default or a character-level override.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Tracks Table
**Description:** A new `tracks` table to define variant categories. Replaces the hardcoded `variant_applicability` strings.

**Acceptance Criteria:**
- [ ] `tracks` table with: `id`, `name` (unique), `slug` (unique, used in file naming), `sort_order`, `is_active`, `created_at`, `updated_at`
- [ ] Seeded with two initial tracks: `clothed` (slug: `clothed`) and `topless` (slug: `topless`)
- [ ] Tracks can be added, renamed, reordered, and deactivated (soft-disable, not deleted)
- [ ] Track `slug` is immutable after creation (used in file naming convention)
- [ ] Track `name` is the display label; `slug` is the system identifier

#### Requirement 1.2: Scene Catalog Table
**Description:** A new `scene_catalog` table that stores the master list of scene definitions as content concepts (not per-character instances).

**Acceptance Criteria:**
- [ ] `scene_catalog` table with: `id`, `name` (unique), `slug` (unique, used in file naming), `description`, `has_clothes_off_transition` (boolean, default false), `sort_order`, `is_active`, `created_at`, `updated_at`
- [ ] Each row represents one content concept (e.g., "sex" — not "sex" and "topless_sex" separately)
- [ ] The `slug` determines the base filename component (e.g., `sex` → `sex.mp4`, with track prefix applied automatically)
- [ ] `has_clothes_off_transition` flag indicates this scene can generate a transition variant
- [ ] Seeded with the initial ~28 scene concepts (see Section 8)

#### Requirement 1.3: Scene-Track Junction Table
**Description:** A many-to-many relationship between scene catalog entries and tracks.

**Acceptance Criteria:**
- [ ] `scene_catalog_tracks` table with: `scene_catalog_id`, `track_id`, `created_at`
- [ ] Composite primary key on `(scene_catalog_id, track_id)`
- [ ] Foreign keys to `scene_catalog` and `tracks` with CASCADE delete
- [ ] Seeded with the correct track assignments for all initial scenes
- [ ] A scene can belong to zero or more tracks
- [ ] Removing a track assignment does not delete generated scene instances — only prevents future generation

#### Requirement 1.4: Scene Catalog API
**Description:** CRUD endpoints for managing the scene catalog and track assignments.

**Acceptance Criteria:**
- [ ] `GET /api/v1/scene-catalog` — List all scene definitions with their track assignments (joined)
- [ ] `POST /api/v1/scene-catalog` — Create a new scene definition with track IDs
- [ ] `GET /api/v1/scene-catalog/{id}` — Get single scene definition with tracks
- [ ] `PUT /api/v1/scene-catalog/{id}` — Update scene definition (name, description, transition flag, track assignments)
- [ ] `DELETE /api/v1/scene-catalog/{id}` — Soft-deactivate (set `is_active = false`)
- [ ] `POST /api/v1/scene-catalog/{id}/tracks` — Add track(s) to a scene
- [ ] `DELETE /api/v1/scene-catalog/{id}/tracks/{track_id}` — Remove track from a scene
- [ ] `GET /api/v1/tracks` — List all tracks
- [ ] `POST /api/v1/tracks` — Create a new track
- [ ] `PUT /api/v1/tracks/{id}` — Update track (name, sort_order, is_active)
- [ ] All list endpoints support `?include_inactive=true` query param
- [ ] Responses use the standard `{ data }` / `{ data, meta }` envelope

#### Requirement 1.5: Migrate variant_applicability
**Description:** Migrate existing scene_types data from `variant_applicability` string to the new tracks system.

**Acceptance Criteria:**
- [ ] Migration creates `tracks` and `scene_catalog` tables with seed data
- [ ] Existing `scene_types` rows with `variant_applicability` are linked to appropriate tracks via a new `scene_type_tracks` junction table (or scene_types gain a FK to `scene_catalog`)
- [ ] The `variant_applicability` column is dropped after migration
- [ ] Existing core functions (`expand_variants`, etc.) updated to query tracks table
- [ ] Frontend `VARIANT_OPTIONS` constant replaced with API-driven track list
- [ ] Backward compatibility: existing scenes continue to work

#### Requirement 1.6: Scene Catalog UI — List View
**Description:** The `/content/scenes` page displays the full scene catalog in a table/grid.

**Acceptance Criteria:**
- [ ] Table columns: Name, Description, Tracks (as pills/badges), Clothes-Off Transition (icon/badge), Status (active/inactive), Sort Order
- [ ] Track badges are color-coded per track
- [ ] Rows are sortable by name, sort_order
- [ ] Filter by: track, active/inactive, has transition
- [ ] Search by scene name
- [ ] Inline toggle for active/inactive status
- [ ] "Add Scene" button opens a creation form

#### Requirement 1.7: Scene Catalog UI — Create/Edit Form
**Description:** A form for creating and editing scene catalog entries.

**Acceptance Criteria:**
- [ ] Fields: Name, Slug (auto-generated from name, editable on create, read-only after), Description, Tracks (multi-select checkboxes), Has Clothes-Off Transition (toggle), Sort Order, Active (toggle)
- [ ] Slug auto-generation: lowercases, replaces spaces with underscores, strips special characters
- [ ] Validation: name required, slug unique, at least one track selected
- [ ] Edit mode pre-fills all fields
- [ ] Save triggers API call and refreshes the list

#### Requirement 1.8: Track Management UI
**Description:** An inline or separate section for managing tracks.

**Acceptance Criteria:**
- [ ] Accessible from the Scenes page (e.g., a "Manage Tracks" button or settings gear)
- [ ] List of tracks with: Name, Slug, Sort Order, Active toggle
- [ ] Add new track with name and slug
- [ ] Edit track name and sort order (slug immutable)
- [ ] Deactivate track (cannot delete — slug may be referenced in file paths)
- [ ] Warning when deactivating a track that has scene assignments

#### Requirement 1.9: Project Scene Settings
**Description:** Projects select which scenes from the catalog are enabled for generation. By default, all active catalog scenes are enabled for a new project.

**Acceptance Criteria:**
- [ ] `project_scene_settings` table with: `project_id` (FK), `scene_catalog_id` (FK), `is_enabled` (boolean, default true), `created_at`, `updated_at`
- [ ] Composite unique constraint on `(project_id, scene_catalog_id)`
- [ ] When a new project is created, no rows are inserted — absence means "use catalog default" (enabled if `scene_catalog.is_active = true`)
- [ ] A row with `is_enabled = false` explicitly disables that scene for the project
- [ ] A row with `is_enabled = true` explicitly enables it (useful if the catalog entry is deactivated globally but the project still wants it)
- [ ] `GET /api/v1/projects/{id}/scene-settings` — List all catalog scenes with their project-level enabled status (merged view: catalog + overrides)
- [ ] `PUT /api/v1/projects/{id}/scene-settings` — Bulk update enabled/disabled for multiple scenes in one call
- [ ] `PUT /api/v1/projects/{id}/scene-settings/{scene_catalog_id}` — Toggle a single scene
- [ ] Responses include the effective state: `{ scene_catalog_id, name, slug, is_enabled, source: "catalog_default" | "project_override" }`

#### Requirement 1.10: Character Scene Overrides
**Description:** Characters can override project-level scene settings. By default, characters inherit from the project. Overrides allow disabling (or re-enabling) specific scenes per character.

**Acceptance Criteria:**
- [ ] `character_scene_overrides` table with: `character_id` (FK), `scene_catalog_id` (FK), `is_enabled` (boolean), `created_at`, `updated_at`
- [ ] Composite unique constraint on `(character_id, scene_catalog_id)`
- [ ] When no override row exists, the character inherits the project-level setting
- [ ] An override row explicitly sets enabled/disabled for that character, regardless of project setting
- [ ] `GET /api/v1/characters/{id}/scene-settings` — List all catalog scenes with effective enabled state (three-level merge: catalog → project → character)
- [ ] `PUT /api/v1/characters/{id}/scene-settings` — Bulk update overrides
- [ ] `PUT /api/v1/characters/{id}/scene-settings/{scene_catalog_id}` — Toggle a single scene override
- [ ] `DELETE /api/v1/characters/{id}/scene-settings/{scene_catalog_id}` — Remove override (revert to project default)
- [ ] Responses include: `{ scene_catalog_id, name, slug, is_enabled, source: "catalog_default" | "project_override" | "character_override" }`

#### Requirement 1.11: Project Scene Settings UI
**Description:** A scene enablement panel accessible from the project settings or project detail page.

**Acceptance Criteria:**
- [ ] Displays all catalog scenes as a checklist/toggle grid grouped by track
- [ ] Each row shows: scene name, track badges, enabled toggle
- [ ] Bulk actions: "Enable All", "Disable All", "Reset to Catalog Defaults"
- [ ] Visual indicator when a scene deviates from catalog default
- [ ] Summary bar: "X of Y scenes enabled"
- [ ] Changes saved via bulk PUT endpoint

#### Requirement 1.12: Character Scene Overrides UI
**Description:** A scene override panel accessible from the character detail page.

**Acceptance Criteria:**
- [ ] Displays all catalog scenes with their effective enabled state
- [ ] Each row shows: scene name, track badges, effective state, source indicator (project / character override)
- [ ] Toggle to override: clicking flips from "inherited" to "character override"
- [ ] "Reset" button per scene to remove the override and revert to project default
- [ ] Bulk action: "Reset All to Project Defaults"
- [ ] Visual distinction between inherited settings and character-level overrides (e.g., inherited rows are dimmed, overrides are bold)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Scene Catalog Bulk Import
**Description:** Import scene definitions from CSV/JSON for large-scale setup.
**Acceptance Criteria:**
- [ ] Upload CSV with columns: name, slug, tracks (comma-separated), has_transition
- [ ] Preview before committing
- [ ] Merge mode: skip existing slugs, update, or error

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Track-Based File Naming
**Description:** Integrate tracks into the delivery naming convention from PRD-01.
**Acceptance Criteria:**
- [ ] Track slug used as filename prefix (e.g., `topless_sex.mp4` for track=topless, scene=sex)
- [ ] Default track (clothed) uses no prefix
- [ ] Configurable per track whether a prefix is applied

#### **[OPTIONAL - Post-MVP]** Requirement 2.3: Scene Type Linking
**Description:** Link scene catalog entries to scene type configurations from PRD-23.
**Acceptance Criteria:**
- [ ] Scene types can reference a scene catalog entry (optional FK)
- [ ] When linked, the scene type inherits the catalog entry's track assignments
- [ ] One scene catalog entry can have multiple scene type configurations (different workflows for same scene concept)

## 6. Non-Goals (Out of Scope)
- Per-character scene instance CRUD (creating/editing individual scene records — handled by existing scene CRUD under `/characters/{id}/scenes`). This PRD handles scene *enablement* (on/off), not scene instance data.
- Workflow/LoRA/prompt configuration (handled by PRD-23 Scene Type Configuration)
- Batch generation orchestration (handled by PRD-57)
- Scene video playback or review (handled by PRD-35, PRD-36, PRD-83)
- Scene type inheritance (handled by PRD-100)

## 7. Design Considerations
- The scene catalog table should feel like a **content inventory** — clean, scannable, dense.
- Track badges should use distinct colors (e.g., blue for clothed, pink for topless) that are consistent throughout the app.
- The Clothes-Off transition indicator should be visually distinct (e.g., a small icon or badge) but not dominant.
- The form should be a slide-out panel or modal, not a full page navigation — fast in/out for catalog management.
- Track management should be accessible but not prominent — it's a setup-once concern.
- Reuse existing design system components: `Card`, `Table`, `Badge`, `Toggle`, `Input`, `Select`, `Drawer` or `Modal`.

## 8. Technical Considerations

### Existing Code to Reuse
- Design system components from PRD-29 (Card, Table, Badge, Toggle, Input, Modal, Drawer)
- API client (`@/lib/api.ts`) for data fetching
- TanStack Query patterns from existing hooks (e.g., `use-scene-types.ts`)
- Standard Rust repository pattern (`SceneTypeRepo`, `SceneRepo`)
- Migration patterns from existing PRD-00/PRD-01 migrations

### New Infrastructure Needed
- `tracks` table + Rust model + repository + API handlers
- `scene_catalog` table + Rust model + repository + API handlers
- `scene_catalog_tracks` junction table + repository methods
- `project_scene_settings` table + Rust model + repository + API handlers
- `character_scene_overrides` table + Rust model + repository + API handlers
- Effective scene resolution logic: catalog → project → character (three-level merge)
- Migration to drop `variant_applicability` and populate new tables
- Frontend hooks: `use-scene-catalog.ts`, `use-tracks.ts`, `use-project-scene-settings.ts`, `use-character-scene-overrides.ts`
- Frontend components: `SceneCatalogList`, `SceneCatalogForm`, `TrackManager`, `TrackBadge`, `ProjectSceneSettings`, `CharacterSceneOverrides`

### Database Changes

**New tables:**
```sql
CREATE TABLE tracks (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE scene_catalog (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    has_clothes_off_transition BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE scene_catalog_tracks (
    scene_catalog_id BIGINT NOT NULL REFERENCES scene_catalog(id) ON DELETE CASCADE,
    track_id BIGINT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scene_catalog_id, track_id)
);

CREATE TABLE project_scene_settings (
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_catalog_id BIGINT NOT NULL REFERENCES scene_catalog(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, scene_catalog_id)
);

CREATE TABLE character_scene_overrides (
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    scene_catalog_id BIGINT NOT NULL REFERENCES scene_catalog(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (character_id, scene_catalog_id)
);
```

**Seed data (tracks):**
| name | slug | sort_order |
|------|------|------------|
| Clothed | clothed | 1 |
| Topless | topless | 2 |

**Seed data (scene_catalog) — 28 unique concepts:**
| name | slug | tracks | has_clothes_off_transition |
|------|------|--------|---------------------------|
| Intro | intro | clothed | false |
| Idle | idle | clothed, topless | false |
| Boobs Fondle | boobs_fondle | clothed | true |
| BJ | bj | clothed, topless | false |
| Boobs Jumping | boobs_jumping | clothed | true |
| Bottom | bottom | clothed, topless | false |
| Cowgirl | cowgirl | clothed | false |
| Cumshot | cumshot | clothed, topless | false |
| Dance | dance | clothed, topless | false |
| Deal | deal | clothed, topless | false |
| Doggy | doggy | clothed | false |
| Feet | feet | clothed, topless | false |
| From Behind | from_behind | clothed, topless | false |
| Gloryhole Blowjob | gloryhole_blowjob | clothed | false |
| Handjob | handjob | clothed, topless | false |
| Kiss | kiss | clothed, topless | false |
| Masturbation | masturbation | clothed | false |
| Missionary | missionary | clothed | false |
| Orgasm | orgasm | clothed, topless | false |
| Pussy | pussy | clothed, topless | false |
| Pussy Finger | pussy_finger | clothed | false |
| Reverse Cowgirl | reverse_cowgirl | clothed | false |
| Sex | sex | clothed, topless | false |
| Side Fuck | side_fuck | clothed | false |
| Titwank | titwank | clothed, topless | false |
| Twerking | twerking | clothed | false |

**Migration changes:**
- Drop `variant_applicability` column from `scene_types` table
- Update `VARIANT_CLOTHED`, `VARIANT_TOPLESS` constants to reference tracks table
- Update `expand_variants()` to query tracks

### API Changes
- New resource: `GET/POST /api/v1/scene-catalog`, `GET/PUT/DELETE /api/v1/scene-catalog/{id}`
- New resource: `GET/POST /api/v1/tracks`, `PUT /api/v1/tracks/{id}`
- Junction management: `POST/DELETE /api/v1/scene-catalog/{id}/tracks/{track_id}`
- Project scene settings: `GET/PUT /api/v1/projects/{id}/scene-settings`, `PUT /api/v1/projects/{id}/scene-settings/{scene_catalog_id}`
- Character scene overrides: `GET/PUT /api/v1/characters/{id}/scene-settings`, `PUT/DELETE /api/v1/characters/{id}/scene-settings/{scene_catalog_id}`
- Existing: `scene_types` API may need update if `variant_applicability` is removed

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Scene catalog page loads with all ~28 scenes in <500ms
- Adding a new scene with track assignments takes <30 seconds
- Adding a new track takes <15 seconds
- Track toggle on an existing scene is a single click
- Zero data loss during `variant_applicability` migration
- Frontend renders correct track badges for all scenes
- Project scene settings load with correct effective state in <500ms
- Toggling a scene for a character correctly shows source (project default vs character override)
- Bulk enable/disable across 28 scenes completes in a single API call

## 11. Open Questions
- Should tracks have a `prefix` field (e.g., "topless_") or should the naming convention be derived from slug? A prefix field is more flexible for future tracks.
- Should there be a "default track" concept where no prefix is applied (currently clothed)?
- Should the scene catalog support grouping/categories (e.g., "solo", "duo", "transition")?
- Should deactivating a scene in the catalog prevent new generation but preserve existing scenes, or should it cascade?
- How should existing `scene_types.variant_applicability` data map when a scene type references variants not in the new tracks table?

## 12. Version History
- **v1.0** (2026-02-24): Initial PRD creation
- **v1.1** (2026-02-24): Added per-project scene settings and per-character scene overrides (Req 1.9–1.12). Three-level enablement: catalog → project → character.

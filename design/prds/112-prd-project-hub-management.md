# PRD-112: Project Hub & Management

## 1. Introduction/Overview

A project is the top-level container in the platform — a group of characters with a shared set of scene requirements, generation settings, and delivery targets. Despite PRD-01 establishing the backend (projects table, CRUD API, characters nested under projects), the platform has **no project management UI**: no project list, no project detail page, no way to create or browse projects, and no concept of "current project" in the frontend.

This is a critical gap. Almost every other feature — scene enablement (PRD-111), batch production (PRD-57), delivery (PRD-39), lifecycle management (PRD-72) — assumes the user is working within a project context. Without a Project Hub, users cannot:
- See what projects exist
- Create new projects or configure existing ones
- Navigate to a project's characters
- Manage project-level settings (scene selection, config templates)

This PRD introduces the **Project Hub** — a project list page and a project detail page that serves as the central hub for character work. The project detail page displays the project's characters as its primary view, with access to project-level scene settings, configuration, and delivery status. Critically, the **character detail page** is a full workstation — the entire character workflow from image upload through generation to review/approval is achievable without navigating away.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-00 (Database Normalization), PRD-01 (Data Model — projects + characters tables), PRD-02 (Backend Foundation), PRD-29 (Design System)
- **Extends:** PRD-01 — adds frontend UI for the existing project/character backend
- **Integrates with:**
  - PRD-111 (Scene Catalog) — project scene settings UI lives on the project detail page
  - PRD-72 (Project Lifecycle) — lifecycle states displayed on project cards and detail header
  - PRD-74 (Config Templates) — "Start from Template" option during project creation
  - PRD-57 (Batch Orchestrator) — production runs scoped to projects
  - PRD-39 (Delivery) — delivery packaging scoped to projects
  - PRD-60 (Character Library) — import characters from library into a project
  - PRD-107 (Character Readiness) — readiness badges shown on character cards
  - PRD-108 (Character Dashboard) — linked from character cards
- **Depended on by:** Any feature that requires a project context in the UI

## 3. Goals
- Provide a browsable, searchable list of all projects with key metrics at a glance.
- Provide a project detail page that serves as the hub for all character work within that project.
- Allow creating, editing, and archiving projects from the UI.
- Display project characters as the primary view on the project detail page, with character cards showing key status info.
- Provide access to project-level settings: scene enablement (PRD-111), configuration, and metadata.
- Provide a character detail page that is a complete workstation: setup (images, settings), generation (trigger, test shots), and review (approve, reject, regenerate) — all without navigating away.
- Surface readiness state, face embedding, and generation progress directly on the character page.
- Keep the sidebar static — the project hub is a page you navigate to, not a dynamic sidebar scope change. The sidebar groups (Projects, Content, Production) are always visible.

## 4. User Stories
- As a Creator, I want to see a list of all my projects so that I can quickly find and navigate to the one I'm working on.
- As a Creator, I want to create a new project with a name and description so that I can start adding characters and configuring scenes.
- As a Creator, I want to optionally start a new project from a configuration template so that I don't have to reconfigure scene types and settings from scratch.
- As a Creator, I want to click into a project and see all its characters at a glance — with status indicators, scene progress, and readiness badges — so that I know what needs attention.
- As a Creator, I want to add new characters to a project (or import from the character library) directly from the project detail page.
- As a Creator, I want to access project-level scene settings (which scenes are enabled) from the project detail page so that I can configure the generation matrix for this project.
- As a Creator, I want to edit a project's name, description, and settings without leaving the project context.
- As an Admin, I want to see project-level stats (character count, scene progress, generation status) so that I can monitor production across projects.
- As a Creator, I want to navigate from a character card to the character's detail page so that I can manage the entire character workflow from one place.
- As a Creator, I want to upload and manage source images for a character directly from the character detail page so that I don't have to navigate to a separate images section.
- As a Creator, I want to set a hero image for a character and see QA status on each image so that I know which images are ready for generation.
- As a Creator, I want to see a readiness checklist on the character overview so that I know exactly what's missing before I can start generation.
- As a Creator, I want to extract face embeddings for a character from the overview tab so that identity consistency is set up before generation.
- As a Creator, I want to see all generated scene videos for a character on the Scenes tab so that I can review, approve, or reject them without leaving the character page.
- As a Creator, I want to trigger scene generation for a character directly from the character page — either all scenes or individual scenes.
- As a Creator, I want to run a test shot for a specific scene to preview the output before committing to full generation.
- As a Creator, I want to approve or reject generated scenes inline, with the option to regenerate rejected scenes immediately.
- As a Creator, I want to view version history for a scene video and import externally produced videos, all from within the character's Scenes tab.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Project List Page
**Description:** A `/projects` page that displays all projects in a browsable list or grid.

**Acceptance Criteria:**
- [ ] Route: `/projects` accessible from sidebar navigation
- [ ] Displays all projects as cards or table rows
- [ ] Each project entry shows: name, description (truncated), status badge, character count, created date
- [ ] Sortable by: name, created date, status, character count
- [ ] Searchable by project name
- [ ] Filter by status (draft, active, paused, completed, archived)
- [ ] "New Project" button opens the creation form
- [ ] Click on a project navigates to `/projects/:id`
- [ ] Empty state when no projects exist with a clear call-to-action to create one

#### Requirement 1.2: Project Detail Page — Header & Tabs
**Description:** The `/projects/:id` page displays project information and serves as both the setup hub and the output/delivery hub for the project.

**Acceptance Criteria:**
- [ ] Route: `/projects/:id`
- [ ] Header section shows: project name, description, status badge, created/updated dates
- [ ] Inline edit for project name and description (click to edit, or edit button)
- [ ] Status badge reflects current project status from the `project_statuses` lookup table
- [ ] Summary stats bar: total characters, scenes in progress, scenes completed, scenes approved, delivery readiness percentage
- [ ] Breadcrumb navigation: Projects > {Project Name}
- [ ] Tab navigation for sub-views:
  - **Overview** (default) — project dashboard (Req 1.3)
  - **Characters** — character grid (Req 1.4)
  - **Scene Settings** — which scenes are enabled (Req 1.5)
  - **Production** — project-wide output matrix (Req 1.6)
  - **Delivery** — packaging, validation, export (Req 1.7)
  - **Configuration** — templates, project settings (Req 1.8)
- [ ] Character detail page has its own tabs: Overview (1.14), Images (1.15), Scenes (1.16), Assets (1.17), Metadata (1.18), Settings (1.19)

#### Requirement 1.3: Project Detail — Overview Tab
**Description:** The default tab — a project-wide dashboard showing overall progress, character readiness, and recent activity. Answers the question: "How is this project doing?"

**Acceptance Criteria:**
- [ ] **Progress Summary Cards**:
  - Total characters (with breakdown: ready / not ready / in progress)
  - Total scenes enabled across all characters
  - Scenes generated / approved / rejected / pending (with percentages)
  - Delivery readiness: "X of Y characters fully approved"
- [ ] **Character Readiness Grid**: compact grid showing all characters with color-coded status indicators (see Req 1.4 for color scheme). At a glance: who's ready, who's generating, who's done.
- [ ] **Recent Activity Feed**: last 10-20 events scoped to this project (scenes approved, generation completed, images uploaded, etc.)
- [ ] **Quick Actions**:
  - "Generate All" — trigger batch generation for all ready characters with ungenerated scenes
  - "View Delivery" — jump to Delivery tab
  - "Add Character" — jump to Characters tab with creation form open

#### Requirement 1.4: Project Detail — Characters Tab
**Description:** Character grid showing all characters in this project, organized by groups (batches). Character cards use color-coded borders/backgrounds to communicate status at a glance.

**Acceptance Criteria:**
- [ ] **Character Groups**: characters are organized into collapsible groups within a project
  - Each group has: name, sort order, character count, group-level progress summary
  - Groups displayed as collapsible sections, each containing a character card grid
  - "All Characters" flat view available (toggle to ignore grouping)
  - "Add Group" button to create a new group (name required)
  - Rename, reorder, and delete groups (deleting a group moves characters to "Ungrouped", does not delete characters)
  - Drag-and-drop characters between groups
  - Default group: "Ungrouped" for characters not assigned to any group
  - Group-level bulk actions: generate all characters in group, approve all in group
- [ ] Displays characters as a responsive card grid (default) or list view (toggle)
- [ ] Each character card shows: name, thumbnail/avatar (if available), status badge, scene progress bar (e.g., "12/28 scenes approved"), readiness indicator, group label
- [ ] **Status-driven card colors** — the card border or background tint changes based on the character's workflow state:
  - **Gray** — Draft / not started (no images, no scenes configured)
  - **Yellow/Amber** — Setup in progress (has images but not ready — missing embedding, scenes, or settings)
  - **Blue** — Ready for generation (readiness checklist complete, awaiting generation)
  - **Purple/Indigo** — Generating (scenes currently being generated)
  - **Orange** — Needs review (has generated scenes awaiting approval)
  - **Green** — Complete (all enabled scenes approved)
  - **Red accent** — Has failures (generation failures or rejected scenes needing attention)
- [ ] Color coding uses the design system's semantic color tokens, not hardcoded values
- [ ] Cards are clickable — navigate to character detail page (`/projects/:id/characters/:characterId`)
- [ ] **Character creation actions**:
  - "Add Character" — manual creation form (name, optional group, optional metadata)
  - "Import from Library" — character library browser (PRD-60) scoped to import
  - "Import from CSV/Text" — bulk name entry via text list or CSV upload (PRD-67)
  - "Import from Folders" — drag-and-drop folder import with auto-detection (PRD-113)
- [ ] Sortable by: name, status, scene progress, created date, group
- [ ] Searchable by character name
- [ ] Filter by: group, status, readiness state, workflow state (not started, in progress, generating, needs review, complete)
- [ ] Bulk actions: select multiple characters for bulk status change, bulk generation, move to group, or deletion
- [ ] Empty state when no characters exist with call-to-action

#### Requirement 1.5: Project Detail — Scene Settings Tab
**Description:** The scene settings tab shows which catalog scenes are enabled for this project (integrates with PRD-111 Requirement 1.9/1.11).

**Acceptance Criteria:**
- [ ] Displays all scene catalog entries as a toggle grid
- [ ] Each row: scene name, track badges (from PRD-111), enabled/disabled toggle, source indicator (catalog default vs project override)
- [ ] Bulk actions: "Enable All", "Disable All", "Reset to Catalog Defaults"
- [ ] Summary: "X of Y scenes enabled"
- [ ] Changes saved via the `PUT /api/v1/projects/{id}/scene-settings` endpoint (PRD-111)
- [ ] This tab reuses the `ProjectSceneSettings` component defined in PRD-111 Req 1.11

#### Requirement 1.6: Project Detail — Production Tab
**Description:** A project-wide production matrix showing every character × every enabled scene with generation and approval status. This is the "war room" view — at a glance you see the full state of the project's output.

**Acceptance Criteria:**
- [ ] **Matrix View**: rows = characters, columns = enabled scenes. Each cell shows generation status:
  - Empty/gray — not generated
  - Spinner/blue — generating
  - Yellow — generated, awaiting review
  - Green — approved
  - Red — rejected or failed
  - Cells are clickable — opens the scene video preview or navigates to the character's scene detail
- [ ] **Summary Row**: column totals showing how many characters have each scene approved/generated/pending
- [ ] **Summary Column**: row totals showing each character's overall progress (e.g., "22/28 approved")
- [ ] **Batch Runs** section: list of batch production runs (PRD-57) for this project
  - Run ID, started at, progress, status
  - Click to view batch details
  - "New Batch Run" button to trigger a new batch
- [ ] **Filters**: show only scenes with failures, show only incomplete characters, show specific tracks
- [ ] **Compact mode**: toggle between full matrix and condensed progress bars per character
- [ ] Matrix updates in real-time via WebSocket events when generation completes or status changes

#### Requirement 1.7: Project Detail — Delivery Tab
**Description:** Delivery packaging and export for the project. Shows what's ready, what's missing, and allows triggering delivery package generation.

**Acceptance Criteria:**
- [ ] **Delivery Readiness Summary**:
  - Characters fully approved: X of Y
  - Scenes approved: X of Y (with breakdown by track)
  - Missing items list: which characters/scenes are not yet approved
  - Overall readiness percentage with visual progress ring
- [ ] **Validation Results** (PRD-39):
  - Run delivery validation: checks all required scenes exist, naming conventions correct, files present
  - Display validation pass/fail per character with details on failures
  - "Re-validate" button to re-run checks
- [ ] **Package Actions**:
  - "Generate Delivery Package" button — triggers ZIP assembly (PRD-39), disabled if validation fails
  - Package generation progress indicator
  - Download link when package is ready
  - Package history: previous exports with timestamps and download links
- [ ] **Partial Delivery**: option to export only approved characters (skip incomplete ones)
- [ ] **External Handoff**: after generating the delivery ZIP, option to pass it to an external tool for final processing
  - "Hand Off" button available on completed packages
  - Configurable external tool endpoint/script (set in project or platform settings)
  - Handoff status tracking: pending, in progress, completed, failed
  - Handoff history with timestamps
- [ ] Uses existing endpoints: `POST /api/v1/projects/{id}/assemble`, `GET /api/v1/projects/{id}/delivery-validation`, `GET /api/v1/projects/{id}/exports`

#### Requirement 1.8: Project Detail — Configuration Tab
**Description:** The configuration tab shows project-level settings and provides access to config template operations.

**Acceptance Criteria:**
- [ ] Displays current project configuration summary (scene types configured, workflow assignments)
- [ ] "Export Configuration" button — exports current project config as a template (PRD-74)
- [ ] "Import Configuration" button — imports a saved config template into this project (PRD-74)
- [ ] Project metadata fields: retention days, description, custom fields
- [ ] Edit form for project-level settings with save/cancel

#### Requirement 1.9: Create Project Form
**Description:** A form for creating new projects, accessible from the project list page.

**Acceptance Criteria:**
- [ ] Slide-out drawer or modal form
- [ ] Fields: Name (required, unique), Description (optional)
- [ ] Optional: "Start from Template" toggle — when enabled, shows a template picker that lists available project configs (PRD-74)
- [ ] Validation: name required, name unique (server-side validation with user-friendly error)
- [ ] On submit: calls `POST /api/v1/projects`, navigates to the new project's detail page
- [ ] Cancel returns to project list without changes

#### Requirement 1.10: Edit Project
**Description:** Editing project name, description, and settings.

**Acceptance Criteria:**
- [ ] Inline editing on the project detail header (name, description)
- [ ] Full edit form accessible via a settings/gear icon
- [ ] Fields: Name, Description, Retention Days, Status
- [ ] Status changes require confirmation when moving to restrictive states (archived, completed)
- [ ] Save triggers `PUT /api/v1/projects/{id}`

#### Requirement 1.11: Delete/Archive Project
**Description:** Soft-deleting or archiving a project.

**Acceptance Criteria:**
- [ ] "Archive" action available from project detail page and project list (context menu)
- [ ] Archive sets status to "archived" — project remains visible with archive indicator
- [ ] "Delete" action available for draft/empty projects only
- [ ] Delete triggers soft delete (`DELETE /api/v1/projects/{id}`)
- [ ] Confirmation dialog for both actions warning about the number of characters affected
- [ ] Archived projects shown with visual distinction in the project list (greyed out, archive badge)
- [ ] Filter to show/hide archived projects (hidden by default)

#### Requirement 1.12: Sidebar Navigation Restructure
**Description:** Add a new **Projects** nav group to the sidebar, positioned as the primary work section. The existing Content group becomes a studio-wide asset catalog. Production remains studio-wide.

**Acceptance Criteria:**
- [ ] New **"Projects"** nav group added to the sidebar, positioned second (after Dashboard, before Content)
- [ ] Projects group contains:
  - "All Projects" — path: `/projects`, icon: `FolderKanban`
- [ ] Active state highlights "All Projects" when on any `/projects/*` route
- [ ] Existing **"Content"** group remains but is reframed as studio-wide asset browsing:
  - Scene Catalog (PRD-111) — browse/manage all scene definitions and tracks
  - Characters Library (PRD-60) — browse characters across all projects
  - Scene Types — studio-level scene type configurations
  - Images — studio-wide image browser
  - Storyboard — studio-wide storyboard view
  - Character Dashboard — studio-wide character metrics
- [ ] Existing **"Production"** group remains unchanged — studio-wide queue, generation, batch, delivery
- [ ] Clear conceptual distinction:
  - **Projects** = where you do the work (project-scoped, character setup, generation, review)
  - **Content** = where you browse and manage studio-wide assets (catalogs, libraries, types)
  - **Production** = where you monitor studio-wide production (queues, batches, delivery)

#### Requirement 1.13: Character Detail Page
**Description:** A tabbed detail page for viewing and managing an individual character within a project context. This is the **complete character workstation** — the entire workflow from setup to generation to review is achievable without leaving this page.

**Acceptance Criteria:**
- [ ] Route: `/projects/:id/characters/:characterId`
- [ ] Breadcrumb: Projects > {Project Name} > {Character Name}
- [ ] Header section:
  - Character name (editable inline)
  - Status badge (draft, active, etc.)
  - Readiness indicator — green/yellow/red badge summarizing readiness (PRD-107)
  - Face embedding status — small indicator showing extracted/pending/failed (PRD-76)
  - "Generate Scenes" action button (disabled until character is ready)
- [ ] Tab navigation with the following tabs:
  - **Overview** — Readiness checklist, summary stats, face embedding (see Req 1.14)
  - **Images** — Source image management (see Req 1.15)
  - **Scenes** — Scene enablement + generated scene videos (see Req 1.16)
  - **Assets** — External tool clips: txrs_refined, mesh_refined, etc. (see Req 1.17)
  - **Metadata** — Character metadata in JSON and pretty-printed format (see Req 1.18)
  - **Settings** — Character attributes + pipeline config (see Req 1.19)
- [ ] Active tab persisted in URL query param (e.g., `?tab=images`)
- [ ] Back navigation returns to the project detail page, Characters tab

#### Requirement 1.14: Character Detail — Overview Tab
**Description:** The overview tab provides a dashboard view of the character's current state — what's ready, what's missing, and what's been generated. This is the first thing a user sees when opening a character.

**Acceptance Criteria:**
- [ ] **Readiness Checklist** (PRD-107): visual checklist showing completion status of each criterion
  - Source images uploaded (count, hero set?)
  - Face embedding extracted?
  - Scenes enabled (count)?
  - Character attributes assigned (x121 status, a2c4 model, ElevenLabs voice)?
  - Pipeline settings configured (model, LoRA, etc.)?
  - External asset clips generated (txrs_refined, mesh_refined, etc.)?
  - Each item links to the relevant tab for quick navigation
  - Overall readiness score/percentage
- [ ] **Face Embedding Card** (PRD-76):
  - Current status: not extracted / extracting / extracted / failed
  - Confidence score (when extracted)
  - "Extract Embedding" button (or "Re-extract" if already done)
  - Bounding box preview overlaid on hero image thumbnail
  - Uses existing endpoints: `POST /api/v1/characters/{id}/extract-embedding`, `GET /api/v1/characters/{id}` (embedding fields)
- [ ] **Generation Summary Stats**:
  - Total scenes enabled, scenes generated, scenes approved, scenes pending
  - Progress bar: scenes approved / scenes enabled
  - Last generation timestamp
- [ ] **Quick Actions**:
  - "Generate All Scenes" — triggers batch generation for all enabled, ungenerated scenes
  - "Run Test Shot" — triggers a test shot for a selected scene (PRD-58)
  - "Upload Images" — navigates to Images tab

#### Requirement 1.15: Character Detail — Images Tab
**Description:** Source image management directly on the character detail page, so users can upload and manage seed images without leaving the character context.

**Acceptance Criteria:**
- [ ] Displays all source images for this character as a thumbnail grid
- [ ] Each image shows: thumbnail, filename, dimensions, QA status badge (PRD-22), hero indicator
- [ ] Upload area: drag-and-drop zone + file picker button, supports multiple files
- [ ] Set/unset hero image (the primary image used for generation) — click star/crown icon
- [ ] View image variants for each source image (expandable panel or click-through)
- [ ] Generate variants button per source image (PRD-21)
- [ ] Delete source image (with confirmation if it has variants or is used in scenes)
- [ ] QA status indicator per image: passed, failed, pending (PRD-22)
- [ ] Re-run QA button per image
- [ ] Empty state with upload call-to-action when no images exist
- [ ] Uses existing backend endpoints: `GET/POST /api/v1/characters/{id}/source-images`, `DELETE /api/v1/characters/{id}/source-images/{imageId}`

#### Requirement 1.16: Character Detail — Scenes Tab
**Description:** The scenes tab combines scene enablement configuration (which scenes this character should have) and the generated scene video output. This is where setup meets production — you can see what's enabled, what's been generated, and review/approve the results.

**Acceptance Criteria:**
- [ ] **Scene List**: displays all catalog scenes with their effective enabled state for this character
  - Each row shows: scene name, track badges, enabled toggle, generation status, video thumbnail (if generated)
  - Source indicator for enablement: catalog default / project override / character override (PRD-111 Req 1.12)
  - Toggle to override enablement per character
  - "Reset to Project Defaults" bulk action
- [ ] **Generation Status per Scene**: for each enabled scene:
  - Status badge: not generated, generating (with progress), generated, approved, rejected
  - Segment progress: "4/6 segments" with progress bar (PRD-24)
  - Duration: actual vs target
  - Last generated timestamp
- [ ] **Video Preview**: clicking a generated scene opens inline video playback
  - Video player for the assembled scene video (PRD-83)
  - Segment-by-segment scrubber showing individual segments
  - Frame-level navigation
- [ ] **Scene Actions** per generated scene:
  - "Approve" / "Reject" with optional rejection reason (PRD-35)
  - "Regenerate" — re-queue this scene for generation
  - "Test Shot" — quick preview generation (PRD-58)
  - "View Versions" — show version history for this scene video (PRD-109)
  - "Import Video" — upload an externally produced video for this scene (PRD-109)
- [ ] **Bulk Actions**:
  - "Generate All" — generate all enabled, ungenerated scenes
  - "Approve All Generated" — batch approve all scenes in "generated" status
  - "Regenerate Failed" — re-queue all failed scenes
- [ ] **Filters**: by status (all, not generated, generating, generated, approved, rejected), by track
- [ ] **Sort**: by scene name, sort order, status, last generated

#### Requirement 1.17: Character Detail — Assets Tab
**Description:** External tool-generated clips and assets for this character. These are produced by external tools (not the scene generation pipeline) and need to be tracked, viewed, and managed alongside scene videos.

**Acceptance Criteria:**
- [ ] **Asset Clip List**: displays all external asset clips for this character
  - Known clip types (seeded, extensible):
    - `txrs_refined` — texture refinement clip
    - `mesh_refined` — mesh refinement clip
    - `mouth_refined` — mouth refinement clip
    - `smiles_refined` — smiles refinement clip
  - Each clip shows: type label, status (not generated / generated / imported), thumbnail, file path, generated/imported date
- [ ] **Upload/Import**: upload an externally produced clip for any asset type
  - Drag-and-drop or file picker
  - Select asset type from dropdown
  - Replace existing clip with confirmation
- [ ] **Trigger External Tool**: button to trigger external tool generation for a specific asset type (or all)
  - Calls the appropriate external tool endpoint/script
  - Shows progress/status while generating
- [ ] **Preview**: click to play/preview a generated clip inline
- [ ] **Extensible**: new asset types can be added without code changes — the asset type list is data-driven (from a DB table or config), not hardcoded
- [ ] **Status Summary**: at the top, show "X of Y asset clips ready" with per-type status indicators

#### Requirement 1.18: Character Detail — Metadata Tab
**Description:** A dedicated tab for viewing and editing the character's metadata (biographical, descriptive, and custom fields). Supports both a structured pretty-printed form view and a raw JSON editor.

**Acceptance Criteria:**
- [ ] **Two view modes** with a toggle:
  - **Pretty View** (default): renders metadata fields as a structured form
    - Known fields displayed with labels, appropriate input types (text, number, select, boolean toggle)
    - Grouped by category if metadata has nested structure
    - Field-level editing with inline save
  - **JSON View**: raw JSON editor with syntax highlighting
    - Full metadata JSONB displayed as formatted JSON
    - Editable with JSON validation on save
    - Copy-to-clipboard button
- [ ] Changes in either view are synced — editing in pretty view updates the JSON and vice versa
- [ ] Save triggers `PUT /api/v1/projects/{project_id}/characters/{id}` (metadata field)
- [ ] Validation: JSON must be valid before saving; known fields validated by type
- [ ] Diff indicator: highlight fields that have changed since last save
- [ ] Uses the existing `metadata` JSONB column on the `characters` table (PRD-13)

#### Requirement 1.19: Character Detail — Settings Tab
**Description:** Character attributes and pipeline configuration. Attributes are named, typed fields stored in the `settings` JSONB column. The known attributes have dedicated form fields; unknown/future attributes are accessible via a raw editor.

**Acceptance Criteria:**
- [ ] **Character Attributes** section — dedicated form fields for known attributes:
  - **X121 Status** — dropdown/select with defined status values
  - **A2C4 Model** — text field or select (model identifier)
  - **ElevenLabs Voice** — text field or select (voice identifier)
  - Additional attributes can be added in the future without schema migration (stored in `settings` JSONB)
  - Each field has a label, help text, and appropriate input type
  - Changes saved via `PATCH /api/v1/projects/{project_id}/characters/{id}/settings` (shallow merge)
- [ ] **Pipeline Settings** section (PRD-108): remaining key-value settings not covered by named attributes
  - Displays as a key-value editor for less common settings
  - "Add Setting" button to add new key-value pairs
  - Edit/delete individual settings
- [ ] **Raw JSON View** toggle: view/edit the full `settings` JSONB as raw JSON (similar to Metadata tab JSON view)
- [ ] **Character Info** section: name, description, status, created/updated dates
  - Edit name and description inline
  - Status change dropdown with confirmation

#### Requirement 1.20: Frontend Hooks
**Description:** TanStack Query hooks for project and character data fetching and mutations.

**Acceptance Criteria:**
- [ ] **Project hooks:**
  - `useProjects(params?)` — list projects with optional filters (status, search)
  - `useProject(id)` — fetch single project by ID
  - `useCreateProject()` — mutation to create a project
  - `useUpdateProject()` — mutation to update a project
  - `useDeleteProject()` — mutation to soft-delete a project
  - `useProjectCharacters(projectId, params?)` — list characters for a project with filters
  - `useProjectStats(projectId)` — fetch character count, scene progress, generation status
- [ ] **Character group hooks:**
  - `useCharacterGroups(projectId)` — list groups for a project
  - `useCreateGroup()` — mutation to create a group
  - `useUpdateGroup()` — mutation to rename/reorder a group
  - `useDeleteGroup()` — mutation to delete a group
  - `useMoveCharacterToGroup()` — mutation to assign a character to a group
- [ ] **Character image hooks:**
  - `useCharacterSourceImages(characterId)` — list source images for a character
  - `useUploadSourceImage()` — mutation to upload a source image
  - `useDeleteSourceImage()` — mutation to delete a source image
  - `useSetHeroImage()` — mutation to set the hero image
- [ ] **Character scene hooks:**
  - `useCharacterScenes(characterId)` — list scenes for a character with generation status
  - `useApproveScene()` / `useRejectScene()` — mutation for scene approval
  - `useRegenerateScene()` — mutation to re-queue a scene
  - `useGenerateCharacterScenes(characterId)` — mutation to trigger batch generation
- [ ] **Character detail hooks:**
  - `useCharacterReadiness(characterId)` — fetch readiness criteria status (PRD-107)
  - `useExtractEmbedding(characterId)` — mutation to trigger face embedding (PRD-76)
  - `useCharacterSettings(characterId)` — fetch/update pipeline settings
  - `useCharacterMetadata(characterId)` — fetch/update metadata JSONB
- [ ] **Character asset hooks:**
  - `useCharacterAssets(characterId)` — list external asset clips with status
  - `useUploadAssetClip(characterId)` — mutation to upload/import an asset clip
  - `useTriggerAssetGeneration(characterId)` — mutation to trigger external tool generation
- [ ] **Project production hooks:**
  - `useProjectProductionMatrix(projectId)` — fetch character × scene matrix with statuses
  - `useProjectBatchRuns(projectId)` — list batch production runs (PRD-57)
  - `useTriggerBatchRun(projectId)` — mutation to start a new batch run
- [ ] **Project delivery hooks:**
  - `useDeliveryValidation(projectId)` — fetch/trigger delivery validation (PRD-39)
  - `useDeliveryExports(projectId)` — list previous delivery exports
  - `useTriggerDeliveryPackage(projectId)` — mutation to generate delivery ZIP
  - `useHandOffDelivery(projectId)` — mutation to pass delivery to external tool
- [ ] Query key factory pattern consistent with existing hooks
- [ ] Automatic cache invalidation on mutations

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Project Duplication
**Description:** Clone an existing project with its configuration.
**Acceptance Criteria:**
- [ ] "Duplicate" action on project list or detail page
- [ ] Copies: name (appended with "Copy"), description, scene settings, configuration
- [ ] Does NOT copy: characters, generated content, delivery packages
- [ ] Option to include/exclude specific settings during duplication

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Project Quick Switcher
**Description:** Quick project switching from any page.
**Acceptance Criteria:**
- [ ] Project selector in the app header (dropdown or Command Palette integration via PRD-31)
- [ ] Shows recent projects and allows search
- [ ] Switching navigates to that project's detail page
- [ ] Most recently accessed project remembered

## 6. Non-Goals (Out of Scope)
- Project lifecycle state machine with transition rules (handled by PRD-72)
- Configuration template CRUD and import/export logic (handled by PRD-74 — this PRD only provides UI access points)
- Scene catalog management (handled by PRD-111 — this PRD embeds the project scene settings component)
- Character CRUD backend (already exists in PRD-01 — this PRD adds the frontend)
- Batch production orchestration (handled by PRD-57)
- Delivery packaging (handled by PRD-39)
- Cross-project character sharing logic (handled by PRD-60)
- Per-character scene override logic (handled by PRD-111 — this PRD provides the route/page where it lives)
- Source image QA logic and variant generation logic (handled by PRD-21/PRD-22 — this PRD provides the UI to trigger and display results)
- Image editing, cropping, or external edit loop (handled by PRD-21)
- Video generation pipeline logic (handled by PRD-24 — this PRD provides the UI to trigger and monitor)
- Scene assembly and stitching logic (handled by PRD-25/PRD-39 — this PRD shows results)
- Video playback engine internals (handled by PRD-83 — this PRD embeds the player component)
- Readiness criteria definition and evaluation logic (handled by PRD-107 — this PRD displays the results)
- Face embedding extraction logic (handled by PRD-76 — this PRD provides the trigger button and status display)

## 7. Design Considerations
- The project list should feel like a **workspace selector** — clean cards with enough info to identify the project at a glance without being overwhelming.
- Project cards should use the platform's status color conventions: draft=gray, active=blue, paused=yellow, completed=green, archived=muted.
- The character grid on the project detail page should feel like a **visual roster** — emphasize thumbnails and status rather than dense data tables.
- Character cards should provide enough info to assess progress (scene count, readiness) without requiring click-through.
- Tab navigation on the project detail page should be persistent (not reset when navigating back from a character).
- The create form should be lightweight — a drawer, not a full page. Getting into a project should be fast.
- The character detail page should feel like a **workstation** — everything needed to set up and manage a character is accessible from tabs without navigating away. Images tab should support drag-and-drop upload with immediate feedback.
- Source image thumbnails should be large enough to assess quality at a glance. Hero image should be visually prominent (border, crown icon, or size difference).
- Reuse existing design system components: `Card`, `Badge`, `Toggle`, `Input`, `Drawer`, `Table`, `Tabs`, `Breadcrumb`, `EmptyState`.

## 8. Technical Considerations

### Existing Code to Reuse
- **Backend**: All project CRUD endpoints already exist (`handlers/project.rs`, `ProjectRepo`). Character endpoints exist nested under projects. No backend work needed for basic CRUD.
- **Frontend**: API client (`@/lib/api.ts`), TanStack Query patterns from existing hooks (e.g., `use-scene-types.ts`), auth store, router patterns.
- **Design System**: Card, Badge, Table, Toggle, Input, Drawer, Tabs, Breadcrumb components from PRD-29.
- **Character Library**: PRD-60 browser component can be reused for "Import from Library" flow.
- **Config Templates**: PRD-74 import/export components can be embedded in the Configuration tab.
- **Scene Settings**: PRD-111 Req 1.11 `ProjectSceneSettings` component embedded in Scene Settings tab.
- **Source Images**: PRD-21 backend endpoints for source image CRUD, variant generation. PRD-22 QA check endpoints.
- **Face Embedding**: PRD-76 extraction endpoint and embedding fields on character model.
- **Readiness**: PRD-107 readiness criteria evaluation endpoints.
- **Scene Generation**: PRD-24 generation endpoints, PRD-57 batch orchestration.
- **Scene Approval**: PRD-35 approval/rejection endpoints.
- **Test Shots**: PRD-58 test shot generation and gallery endpoints.
- **Video Versions**: PRD-109 version history and import endpoints.
- **Video Playback**: PRD-83 player component for inline scene video playback.

### New Infrastructure Needed
- Frontend hooks: `use-projects.ts` (query key factory + CRUD hooks)
- Frontend pages: `ProjectListPage`, `ProjectDetailPage`, `CharacterDetailPage`
- Frontend components: `ProjectCard`, `ProjectForm`, `CharacterCard` (with status-driven colors), `CharacterGrid`, `ProjectHeader`, `ProjectTabs`, `ProjectOverviewTab`, `ProductionMatrix`, `DeliveryPanel`, `CharacterDetailPage`, `CharacterOverviewTab`, `SourceImageGrid`, `ImageUploader`, `HeroImageSelector`, `CharacterScenesTab`, `SceneVideoCard`, `SceneApprovalActions`, `ReadinessChecklist`, `FaceEmbeddingCard`, `CharacterAssetsTab`, `AssetClipCard`, `CharacterMetadataTab`, `JsonEditor`, `PrettyMetadataForm`, `CharacterSettingsTab`, `CharacterAttributeForm`
- May need new `character_asset_clips` table (or use existing asset registry from PRD-17) to track external tool clips per character
- May need `delivery_handoffs` table to track external handoff status per delivery export
- Route additions in `router.tsx`: `/projects`, `/projects/:id`, `/projects/:id/characters/:characterId`
- Navigation update: add "Projects" to sidebar `navigation.ts`

### Database Changes

**New table — character groups:**
```sql
CREATE TABLE character_groups (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);
```

**Modified table — characters:**
- Add `group_id BIGINT REFERENCES character_groups(id) ON SET NULL` — nullable, characters can be ungrouped

**Existing tables used as-is:**
- `projects`, `characters` (PRD-01)
- `project_scene_settings` (PRD-111)
- `character_asset_clips` — may need new table for external tool clips (or use PRD-17 asset registry)
- `delivery_handoffs` — may need new table for external handoff tracking

### API Changes

**Existing endpoints (no changes needed):**
- `GET/POST /api/v1/projects` — list and create
- `GET/PUT/DELETE /api/v1/projects/{id}` — get, update, delete
- `GET/POST /api/v1/projects/{project_id}/characters` — list and create characters
- `GET/PUT/DELETE /api/v1/projects/{project_id}/characters/{id}` — character CRUD

**New endpoints:**
- `GET/POST /api/v1/projects/{id}/groups` — list and create character groups
- `PUT/DELETE /api/v1/projects/{id}/groups/{groupId}` — update and delete groups
- `PUT /api/v1/projects/{project_id}/characters/{id}/group` — assign character to a group
- `GET /api/v1/projects/{id}/stats` — aggregate character count, scene progress, generation status
- `POST /api/v1/projects/{id}/handoff` — trigger external delivery handoff

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Project list page loads all projects in <500ms
- Creating a new project takes <10 seconds (form to landing on detail page)
- Character grid for a project with 50 characters renders in <500ms
- Navigating from project list → project detail → character detail has clear breadcrumb trail
- Scene settings tab correctly shows inherited catalog defaults vs project overrides
- All existing project CRUD endpoints are exercised by the frontend (no unused backend)
- Complete character workflow (upload images → configure scenes → generate → review → approve) achievable without leaving the character detail page
- Readiness checklist correctly reflects actual character state (images, embedding, scenes, settings)
- Scene generation can be triggered and monitored from the character page
- Scene approval/rejection updates status immediately with optimistic UI

## 11. Open Questions
- Should the project detail page persist the active tab in the URL (e.g., `/projects/:id?tab=scenes`) or in local state?
- Should character cards show a thumbnail/avatar image? If so, where does it come from (first source image, hero image, or a dedicated avatar field)?
- Should the project stats endpoint be a dedicated backend endpoint or computed from existing character/scene list responses?
- Should there be a "recent projects" section on the main dashboard (home page)?

## 12. Version History
- **v1.0** (2026-02-24): Initial PRD creation
- **v1.1** (2026-02-24): Expanded character detail page with tabbed layout: Overview, Images, Scenes, Settings. Added source image management tab.
- **v1.2** (2026-02-24): Full character workstation — complete workflow from setup to review. Added: Overview tab with readiness checklist + face embedding (Req 1.11), expanded Scenes tab with generation status + video preview + approval actions (Req 1.13), Settings tab (Req 1.14), comprehensive hooks (Req 1.15). Character page is now self-contained — no need to navigate away for any step in the workflow.
- **v1.3** (2026-02-24): Sidebar navigation restructure (Req 1.12). New "Projects" nav group as primary work section. Content reframed as studio-wide asset catalog. Three-way split: Projects (work) / Content (browse) / Production (monitor).
- **v1.4** (2026-02-24): Project as output hub. Added: Overview tab with project dashboard (Req 1.3), Production tab with character × scene matrix (Req 1.6), Delivery tab with packaging and validation (Req 1.7). Character cards now use status-driven color coding (Req 1.4). Added production/delivery hooks.
- **v1.5** (2026-02-24): Complete character workstation. Added: Assets tab for external tool clips — txrs_refined, mesh_refined, mouth_refined, smiles_refined (Req 1.17). Dedicated Metadata tab with JSON + pretty-printed dual view (Req 1.18). Settings tab expanded with named character attributes — x121 status, a2c4 model, ElevenLabs voice — extensible via JSONB (Req 1.19). Delivery tab gains external handoff to final processing tool (Req 1.7). Total: 20 MVP requirements + 2 post-MVP.
- **v1.6** (2026-02-24): Character groups. Characters organized into collapsible groups within a project (replacing ad-hoc batch numbering). New `character_groups` table. Expanded character creation actions: manual, CSV/text, library import, folder import (PRD-113). New group API endpoints and hooks. Folder import and metadata generation pipeline split to PRD-113.

# Task List: Project Hub & Management

**PRD Reference:** `design/prds/112-prd-project-hub-management.md`
**Scope:** Build the Project Hub UI — project list page, project detail page with tabbed sub-views (Overview, Characters, Scene Settings, Production, Delivery, Configuration), character detail workstation with full workflow tabs (Overview, Images, Scenes, Assets, Metadata, Settings), sidebar navigation restructure, character groups, and all supporting TanStack Query hooks.

## Overview

The platform has project/character CRUD on the backend (PRD-01) but **no frontend UI** for it. This PRD fills that gap with a complete project management experience: browse projects, drill into a project's characters, and manage each character's entire lifecycle from image upload through generation to approval — all without leaving the character detail page.

This is primarily a **frontend PRD** — the backend already has project and character CRUD. The new backend work is limited to: (1) a `character_groups` table for organizing characters within a project, (2) a `group_id` FK on `characters`, (3) group CRUD endpoints, and (4) a project stats aggregation endpoint.

### What Already Exists
- **Backend**: `ProjectRepo` with full CRUD + soft delete (`apps/backend/crates/db/src/repositories/project_repo.rs`)
- **Backend**: `CharacterRepo` with full CRUD + soft delete + settings helpers (`apps/backend/crates/db/src/repositories/character_repo.rs`)
- **Backend**: `handlers/project.rs` — create, list, get_by_id, update, delete
- **Backend**: `handlers/character.rs` — create, list_by_project, get_by_id, update, delete, get/update/patch settings
- **Backend**: Source image, embedding, scene video version, approval, test shot, delivery, and readiness endpoints from other PRDs
- **Frontend**: `api.ts` client with get/post/put/patch/delete helpers (`apps/frontend/src/lib/api.ts`)
- **Frontend**: TanStack Router setup with layout routes, lazy loading, `AppShell` (`apps/frontend/src/app/router.tsx`)
- **Frontend**: Sidebar navigation config (`apps/frontend/src/app/navigation.ts`)
- **Frontend**: Design system primitives: Card, Badge, Toggle, Input, Drawer, Table, Tabs, Breadcrumb, EmptyState

### What We're Building
1. **Database**: `character_groups` table + `group_id` FK on `characters`
2. **Backend**: Group model, repository, handlers, and routes
3. **Backend**: Project stats aggregation endpoint
4. **Frontend**: Project list page (`/projects`)
5. **Frontend**: Project detail page with 6 tabs (`/projects/:id`)
6. **Frontend**: Character detail workstation with 6 tabs (`/projects/:id/characters/:characterId`)
7. **Frontend**: Sidebar navigation restructure (new "Projects" group)
8. **Frontend**: TanStack Query hooks for all data fetching
9. **Frontend**: Routes for all new pages

### Key Design Decisions
1. **Frontend-heavy** — Backend CRUD already exists. Only new backend work is character groups and project stats.
2. **Sidebar stays static** — "Projects" is a nav group, not a context switcher. No dynamic sidebar scope changes.
3. **Character detail is a workstation** — All workflow steps (images, scenes, generation, review) accessible from tabs without navigating away.
4. **Character groups** — Replace ad-hoc batch numbering. Characters organized into collapsible groups within a project.
5. **Lazy-loaded pages** — All new pages use `lazyRouteComponent` matching existing router patterns.
6. **Query key factory** — Consistent with existing TanStack Query patterns for cache invalidation.

---

## Phase 1: Database — Character Groups

### Task 1.1: Create `character_groups` table migration
**File:** `apps/db/migrations/20260225000001_create_character_groups.sql`

Create the character groups table for organizing characters within a project.

```sql
-- Character groups within a project (PRD-112 Req 1.4)
CREATE TABLE character_groups (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER trg_character_groups_updated_at
    BEFORE UPDATE ON character_groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- FK index
CREATE INDEX idx_character_groups_project_id ON character_groups(project_id);

-- Unique group name per project (among non-deleted)
CREATE UNIQUE INDEX uq_character_groups_project_name
    ON character_groups (project_id, name)
    WHERE deleted_at IS NULL;

-- Soft-delete filter index
CREATE INDEX idx_character_groups_deleted_at
    ON character_groups (deleted_at)
    WHERE deleted_at IS NOT NULL;
```

**Acceptance Criteria:**
- [ ] Table created with `BIGSERIAL` PK, `created_at`/`updated_at` `TIMESTAMPTZ`, `deleted_at` nullable
- [ ] FK to `projects(id)` with `ON DELETE CASCADE ON UPDATE CASCADE`
- [ ] Unique constraint on `(project_id, name)` among non-deleted rows
- [ ] `set_updated_at()` trigger applied
- [ ] FK index on `project_id`
- [ ] Migration runs cleanly via `sqlx migrate run`

### Task 1.2: Add `group_id` FK column to `characters` table
**File:** `apps/db/migrations/20260225000002_add_group_id_to_characters.sql`

Add a nullable `group_id` column to the `characters` table referencing `character_groups(id)`.

```sql
-- Add group_id to characters (PRD-112 Req 1.4)
ALTER TABLE characters
    ADD COLUMN group_id BIGINT REFERENCES character_groups(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- FK index for group_id lookups
CREATE INDEX idx_characters_group_id ON characters(group_id);
```

**Acceptance Criteria:**
- [ ] `group_id BIGINT` nullable column added to `characters`
- [ ] FK to `character_groups(id)` with `ON DELETE SET NULL` (deleting a group un-groups characters, does not delete them)
- [ ] FK index on `group_id`
- [ ] Existing character rows remain unaffected (`group_id` is NULL)
- [ ] Migration runs cleanly on an already-populated database

---

## Phase 2: Backend — Group Model, Repository & Handlers

### Task 2.1: Create `CharacterGroup` model structs
**File:** `apps/backend/crates/db/src/models/character_group.rs`

Follow the existing three-struct pattern (entity/create/update) from `models/project.rs`.

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `character_groups` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterGroup {
    pub id: DbId,
    pub project_id: DbId,
    pub name: String,
    pub sort_order: i32,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new character group.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCharacterGroup {
    pub project_id: DbId,
    pub name: String,
    pub sort_order: Option<i32>,
}

/// DTO for updating an existing character group.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCharacterGroup {
    pub name: Option<String>,
    pub sort_order: Option<i32>,
}
```

**Acceptance Criteria:**
- [ ] Main struct derives `Debug, Clone, FromRow, Serialize`
- [ ] Create DTO derives `Debug, Clone, Deserialize`
- [ ] Update DTO derives `Debug, Clone, Deserialize`
- [ ] Uses `DbId` (`i64`) and `Timestamp` from `x121_core::types`
- [ ] `deleted_at: Option<Timestamp>` included in main struct
- [ ] Module registered in `models/mod.rs`

### Task 2.2: Add `group_id` field to `Character` model and DTOs
**Files:** `apps/backend/crates/db/src/models/character.rs`, `apps/backend/crates/db/src/repositories/character_repo.rs`

Add `group_id: Option<DbId>` to the `Character` struct and update the `COLUMNS` const in `CharacterRepo`.

**Acceptance Criteria:**
- [ ] `pub group_id: Option<DbId>` added to `Character` struct
- [ ] `pub group_id: Option<Option<DbId>>` added to `CreateCharacter` and `UpdateCharacter` (outer Option = not provided, inner = nullable)
- [ ] `COLUMNS` const in `CharacterRepo` updated to include `group_id`
- [ ] `create` query updated to include `group_id` bind
- [ ] `update` query updated with `COALESCE` pattern for `group_id`
- [ ] All existing code compiles

### Task 2.3: Create `CharacterGroupRepo` with CRUD operations
**File:** `apps/backend/crates/db/src/repositories/character_group_repo.rs`

Follow the zero-sized struct pattern from existing repos (e.g., `project_repo.rs`).

```rust
pub struct CharacterGroupRepo;

impl CharacterGroupRepo {
    pub async fn create(pool: &PgPool, input: &CreateCharacterGroup) -> Result<CharacterGroup, sqlx::Error>;
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<CharacterGroup>, sqlx::Error>;
    pub async fn list_by_project(pool: &PgPool, project_id: DbId) -> Result<Vec<CharacterGroup>, sqlx::Error>;
    pub async fn update(pool: &PgPool, id: DbId, input: &UpdateCharacterGroup) -> Result<Option<CharacterGroup>, sqlx::Error>;
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error>;
}
```

Key query details:
- `list_by_project`: `ORDER BY sort_order ASC, name ASC`, filter `deleted_at IS NULL`
- `create`: override `project_id` from path param, default `sort_order` to 0

**Acceptance Criteria:**
- [ ] Zero-sized struct with `COLUMNS` const matching all `character_groups` columns
- [ ] `create` inserts with correct defaults
- [ ] `find_by_id` filters `deleted_at IS NULL`
- [ ] `list_by_project` returns non-deleted groups ordered by `sort_order ASC, name ASC`
- [ ] `soft_delete`, `restore`, `hard_delete` follow same pattern as `ProjectRepo`
- [ ] Module registered in `repositories/mod.rs` with `pub use` re-export

### Task 2.4: Create character group handler module
**File:** `apps/backend/crates/api/src/handlers/character_group.rs`

Follow the existing handler pattern from `handlers/character.rs`.

```rust
/// POST /api/v1/projects/{project_id}/groups
pub async fn create(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(mut input): Json<CreateCharacterGroup>,
) -> AppResult<(StatusCode, Json<CharacterGroup>)>;

/// GET /api/v1/projects/{project_id}/groups
pub async fn list_by_project(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<Vec<CharacterGroup>>>;

/// PUT /api/v1/projects/{project_id}/groups/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateCharacterGroup>,
) -> AppResult<Json<CharacterGroup>>;

/// DELETE /api/v1/projects/{project_id}/groups/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode>;

/// PUT /api/v1/projects/{project_id}/characters/{id}/group
pub async fn assign_character_to_group(
    State(state): State<AppState>,
    Path((_project_id, character_id)): Path<(DbId, DbId)>,
    Json(body): Json<AssignGroupBody>,
) -> AppResult<Json<Character>>;
```

**Acceptance Criteria:**
- [ ] `create` overrides `input.project_id` from URL path, returns 201
- [ ] `list_by_project` returns all groups for the project
- [ ] `update` returns updated group or 404
- [ ] `delete` soft-deletes group, returns 204 or 404
- [ ] `assign_character_to_group` updates character's `group_id`, returns updated character
- [ ] Handler module registered in `handlers/mod.rs`

### Task 2.5: Create project stats handler
**File:** `apps/backend/crates/api/src/handlers/project.rs` (extend existing)

Add a stats endpoint that aggregates character count, scene progress, and generation status for a project.

```rust
/// GET /api/v1/projects/{id}/stats
pub async fn get_stats(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<ProjectStats>>;
```

The `ProjectStats` struct:
```rust
#[derive(Debug, Clone, Serialize)]
pub struct ProjectStats {
    pub character_count: i64,
    pub characters_ready: i64,
    pub characters_generating: i64,
    pub characters_complete: i64,
    pub scenes_enabled: i64,
    pub scenes_generated: i64,
    pub scenes_approved: i64,
    pub scenes_rejected: i64,
    pub scenes_pending: i64,
    pub delivery_readiness_pct: f64,
}
```

**Acceptance Criteria:**
- [ ] Returns aggregate stats scoped to the given project
- [ ] Queries character count breakdown by workflow state
- [ ] Queries scene video version counts by approval status
- [ ] Returns 404 if project not found
- [ ] Stats struct defined in a shared location (handler file or separate types module)

### Task 2.6: Register group routes
**File:** `apps/backend/crates/api/src/routes/` (modify existing route registration)

Add group sub-routes nested under `/projects/{project_id}/groups` and the stats endpoint under `/projects/{id}/stats`.

```
GET    /api/v1/projects/{project_id}/groups                   → character_group::list_by_project
POST   /api/v1/projects/{project_id}/groups                   → character_group::create
PUT    /api/v1/projects/{project_id}/groups/{id}               → character_group::update
DELETE /api/v1/projects/{project_id}/groups/{id}               → character_group::delete
PUT    /api/v1/projects/{project_id}/characters/{id}/group     → character_group::assign_character_to_group
GET    /api/v1/projects/{id}/stats                             → project::get_stats
```

**Acceptance Criteria:**
- [ ] All group routes registered under `/projects/{project_id}/groups` prefix
- [ ] Character group assignment route registered under characters sub-path
- [ ] Stats route registered under `/projects/{id}/stats`
- [ ] Route tree comment updated with new endpoints
- [ ] All routes compile and are reachable

---

## Phase 3: Backend — Integration Tests

### Task 3.1: Character group DB-level tests
**File:** `apps/backend/crates/db/tests/character_group.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_character_group(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_groups_by_project(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_character_group(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_soft_delete_group(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_unique_group_name_per_project(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_assign_character_to_group(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_group_nullifies_character_group_id(pool: PgPool);
```

**Acceptance Criteria:**
- [ ] Creating a group returns correct fields (id, project_id, name, sort_order)
- [ ] Listing groups for a project returns ordered results
- [ ] Updating a group changes name and/or sort_order
- [ ] Soft-deleted group is not returned by `find_by_id` or `list_by_project`
- [ ] Duplicate `(project_id, name)` among non-deleted groups violates unique constraint
- [ ] Assigning a character to a group sets `group_id` correctly
- [ ] Hard-deleting a group sets characters' `group_id` to NULL (ON DELETE SET NULL)
- [ ] All tests pass

### Task 3.2: Character group API-level tests
**File:** `apps/backend/crates/api/tests/character_group_api.rs`

```rust
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_group_201(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_groups(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_group(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_delete_group_204(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_assign_character_to_group(pool: PgPool);

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_project_stats(pool: PgPool);
```

Each test uses `common::build_test_app` and the shared HTTP helpers.

**Acceptance Criteria:**
- [ ] `POST /projects/{id}/groups` returns 201 with created group
- [ ] `GET /projects/{id}/groups` returns list of groups
- [ ] `PUT /projects/{id}/groups/{gid}` returns updated group
- [ ] `DELETE /projects/{id}/groups/{gid}` returns 204
- [ ] `PUT /projects/{id}/characters/{cid}/group` assigns character to group
- [ ] `GET /projects/{id}/stats` returns aggregate stats
- [ ] All tests pass

---

## Phase 4: Frontend — Routing, Navigation & Hooks

### Task 4.1: Add project routes to router
**File:** `apps/frontend/src/app/router.tsx`

Add routes for project list, project detail, and character detail pages using the existing pattern with `lazyRouteComponent`.

```typescript
// Projects layout
const projectsLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "projects",
  component: Outlet,
});

// /projects — Project list
const projectListRoute = createRoute({
  getParentRoute: () => projectsLayoutRoute,
  path: "/projects",
  component: lazyRouteComponent(() =>
    import("@/features/projects/ProjectListPage").then((m) => ({
      default: m.ProjectListPage,
    })),
  ),
});

// /projects/$projectId — Project detail
const projectDetailRoute = createRoute({
  getParentRoute: () => projectsLayoutRoute,
  path: "/projects/$projectId",
  component: lazyRouteComponent(() =>
    import("@/features/projects/ProjectDetailPage").then((m) => ({
      default: m.ProjectDetailPage,
    })),
  ),
});

// /projects/$projectId/characters/$characterId — Character detail
const characterDetailRoute = createRoute({
  getParentRoute: () => projectsLayoutRoute,
  path: "/projects/$projectId/characters/$characterId",
  component: lazyRouteComponent(() =>
    import("@/features/characters/CharacterDetailPage").then((m) => ({
      default: m.CharacterDetailPage,
    })),
  ),
});
```

Register in the route tree under `authenticatedRoute.addChildren([...])`.

**Acceptance Criteria:**
- [ ] `/projects` route renders `ProjectListPage`
- [ ] `/projects/:projectId` route renders `ProjectDetailPage`
- [ ] `/projects/:projectId/characters/:characterId` route renders `CharacterDetailPage`
- [ ] All routes use `lazyRouteComponent` for code-splitting
- [ ] Routes are children of the authenticated layout
- [ ] URL params use `$projectId` and `$characterId` per TanStack Router convention

### Task 4.2: Update sidebar navigation
**File:** `apps/frontend/src/app/navigation.ts`

Add a new "Projects" nav group positioned second (after Dashboard, before Content) per Req 1.12.

```typescript
{
  label: "Projects",
  items: [
    { label: "All Projects", path: "/projects", icon: FolderKanban },
  ],
},
```

Import `FolderKanban` from `lucide-react` / `@/tokens/icons`.

**Acceptance Criteria:**
- [ ] "Projects" group added as the second nav group (after Dashboard)
- [ ] Contains "All Projects" item with path `/projects` and `FolderKanban` icon
- [ ] Active state highlights on any `/projects/*` route
- [ ] Existing Content, Production, Review, Tools, Admin groups remain unchanged
- [ ] `FolderKanban` icon imported and registered

### Task 4.3: Create project query hooks
**File:** `apps/frontend/src/features/projects/hooks/useProjects.ts`

TanStack Query hooks for project CRUD following the existing patterns from the codebase.

```typescript
// Query key factory
export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (params?: ProjectListParams) => [...projectKeys.lists(), params] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: number) => [...projectKeys.details(), id] as const,
  stats: (id: number) => [...projectKeys.all, 'stats', id] as const,
};

export function useProjects(params?: ProjectListParams);
export function useProject(id: number);
export function useProjectStats(projectId: number);
export function useCreateProject();
export function useUpdateProject();
export function useDeleteProject();
```

**Acceptance Criteria:**
- [ ] `useProjects(params?)` fetches `GET /projects` with optional filters
- [ ] `useProject(id)` fetches `GET /projects/{id}`
- [ ] `useProjectStats(projectId)` fetches `GET /projects/{id}/stats`
- [ ] `useCreateProject()` mutation calls `POST /projects`, invalidates list cache
- [ ] `useUpdateProject()` mutation calls `PUT /projects/{id}`, invalidates detail and list caches
- [ ] `useDeleteProject()` mutation calls `DELETE /projects/{id}`, invalidates list cache
- [ ] Query key factory pattern consistent with codebase
- [ ] Uses `api` client from `@/lib/api`

### Task 4.4: Create character group query hooks
**File:** `apps/frontend/src/features/projects/hooks/useCharacterGroups.ts`

```typescript
export const groupKeys = {
  all: (projectId: number) => ['projects', projectId, 'groups'] as const,
  list: (projectId: number) => [...groupKeys.all(projectId), 'list'] as const,
};

export function useCharacterGroups(projectId: number);
export function useCreateGroup();
export function useUpdateGroup();
export function useDeleteGroup();
export function useMoveCharacterToGroup();
```

**Acceptance Criteria:**
- [ ] `useCharacterGroups(projectId)` fetches `GET /projects/{id}/groups`
- [ ] `useCreateGroup()` mutation calls `POST /projects/{id}/groups`, invalidates groups list
- [ ] `useUpdateGroup()` mutation calls `PUT /projects/{id}/groups/{gid}`
- [ ] `useDeleteGroup()` mutation calls `DELETE /projects/{id}/groups/{gid}`
- [ ] `useMoveCharacterToGroup()` mutation calls `PUT /projects/{id}/characters/{cid}/group`
- [ ] Automatic cache invalidation on mutations

### Task 4.5: Create project character query hooks
**File:** `apps/frontend/src/features/projects/hooks/useProjectCharacters.ts`

```typescript
export const characterKeys = {
  all: (projectId: number) => ['projects', projectId, 'characters'] as const,
  list: (projectId: number, params?: CharacterListParams) =>
    [...characterKeys.all(projectId), 'list', params] as const,
  detail: (projectId: number, characterId: number) =>
    [...characterKeys.all(projectId), 'detail', characterId] as const,
};

export function useProjectCharacters(projectId: number, params?: CharacterListParams);
export function useCharacter(projectId: number, characterId: number);
export function useCreateCharacter(projectId: number);
export function useUpdateCharacter(projectId: number);
export function useDeleteCharacter(projectId: number);
```

**Acceptance Criteria:**
- [ ] `useProjectCharacters(projectId, params?)` fetches `GET /projects/{id}/characters`
- [ ] `useCharacter(projectId, characterId)` fetches `GET /projects/{id}/characters/{cid}`
- [ ] `useCreateCharacter()` mutation calls `POST /projects/{id}/characters`, invalidates list
- [ ] `useUpdateCharacter()` mutation calls `PUT /projects/{id}/characters/{cid}`
- [ ] `useDeleteCharacter()` mutation calls `DELETE /projects/{id}/characters/{cid}`
- [ ] Query keys scoped by `projectId` for proper cache isolation

### Task 4.6: Create character detail query hooks
**File:** `apps/frontend/src/features/characters/hooks/useCharacterDetail.ts`

Hooks for character sub-resources: source images, scenes, settings, metadata, assets.

```typescript
// Source images
export function useCharacterSourceImages(characterId: number);
export function useUploadSourceImage();
export function useDeleteSourceImage();
export function useSetHeroImage();

// Scenes
export function useCharacterScenes(characterId: number);
export function useApproveScene();
export function useRejectScene();
export function useRegenerateScene();
export function useGenerateCharacterScenes(characterId: number);

// Readiness & embedding
export function useCharacterReadiness(characterId: number);
export function useExtractEmbedding(characterId: number);

// Settings & metadata
export function useCharacterSettings(characterId: number);
export function useUpdateCharacterSettings(characterId: number);
export function useCharacterMetadata(characterId: number);
export function useUpdateCharacterMetadata(characterId: number);

// Assets
export function useCharacterAssets(characterId: number);
export function useUploadAssetClip(characterId: number);
export function useTriggerAssetGeneration(characterId: number);
```

**Acceptance Criteria:**
- [ ] All hooks use the `api` client and TanStack Query patterns
- [ ] Source image hooks call existing backend endpoints (`GET/POST/DELETE /characters/{id}/source-images`)
- [ ] Scene hooks call existing generation, approval, and version endpoints
- [ ] Readiness hook calls `GET /characters/{id}/readiness` (PRD-107)
- [ ] Embedding hook calls `POST /characters/{id}/extract-embedding` (PRD-76)
- [ ] Settings hooks call existing settings endpoints on `CharacterRepo`
- [ ] Metadata hook updates character metadata via `PUT /projects/{pid}/characters/{cid}`
- [ ] All mutations invalidate relevant caches
- [ ] Query keys use consistent factory pattern

---

## Phase 5: Frontend — Project List Page

### Task 5.1: Create ProjectListPage
**File:** `apps/frontend/src/features/projects/ProjectListPage.tsx`

The main `/projects` page displaying all projects as cards.

**Acceptance Criteria:**
- [ ] Displays all projects as responsive card grid
- [ ] Each project card shows: name, description (truncated), status badge, character count, created date
- [ ] "New Project" button in page header opens creation form (Task 5.3)
- [ ] Click on a project card navigates to `/projects/:id`
- [ ] Loading skeleton while data is fetching
- [ ] Empty state when no projects exist with call-to-action to create one
- [ ] Uses `useProjects()` hook from Task 4.3
- [ ] Uses design system components: Card, Badge, EmptyState

### Task 5.2: Create ProjectCard component
**File:** `apps/frontend/src/features/projects/components/ProjectCard.tsx`

Reusable card component for displaying a project in the list.

```typescript
interface ProjectCardProps {
  project: Project;
  onClick: (id: number) => void;
}
```

**Acceptance Criteria:**
- [ ] Shows project name, truncated description, status badge, character count, created date
- [ ] Status badge uses platform color conventions (draft=gray, active=blue, paused=yellow, completed=green, archived=muted)
- [ ] Clickable — calls `onClick` with project ID
- [ ] Archived projects shown with visual distinction (greyed out, archive badge)
- [ ] Uses design system Card and Badge primitives

### Task 5.3: Create ProjectFormDrawer component
**File:** `apps/frontend/src/features/projects/components/ProjectFormDrawer.tsx`

Slide-out drawer for creating or editing a project.

```typescript
interface ProjectFormDrawerProps {
  open: boolean;
  onClose: () => void;
  project?: Project;  // If provided, edit mode
}
```

**Acceptance Criteria:**
- [ ] Slide-out drawer using design system Drawer component
- [ ] Fields: Name (required), Description (optional)
- [ ] Validation: name required, displays server-side unique-name error
- [ ] Create mode: calls `useCreateProject()`, navigates to new project on success
- [ ] Edit mode: pre-fills fields, calls `useUpdateProject()` on submit
- [ ] Cancel closes drawer without changes
- [ ] Uses React Hook Form + Zod for validation

### Task 5.4: Add search and filter controls
**File:** `apps/frontend/src/features/projects/components/ProjectListControls.tsx`

Search bar and filter controls for the project list.

**Acceptance Criteria:**
- [ ] Search input filters projects by name (client-side for MVP)
- [ ] Status filter dropdown: all, draft, active, paused, completed, archived
- [ ] Sort dropdown: name, created date, status, character count
- [ ] "Hide archived" toggle (archived hidden by default)
- [ ] Controls update the query params for filtering

---

## Phase 6: Frontend — Project Detail Page

### Task 6.1: Create ProjectDetailPage with tab navigation
**File:** `apps/frontend/src/features/projects/ProjectDetailPage.tsx`

The `/projects/:id` page with header and tabbed sub-views.

**Acceptance Criteria:**
- [ ] Breadcrumb: Projects > {Project Name}
- [ ] Header: project name (editable inline), description, status badge, created/updated dates
- [ ] Summary stats bar: total characters, scenes in progress, scenes completed, scenes approved
- [ ] Tab navigation: Overview, Characters, Scene Settings, Production, Delivery, Configuration
- [ ] Active tab persisted in URL search param (`?tab=characters`)
- [ ] Uses `useProject(id)` and `useProjectStats(id)` hooks
- [ ] Loading skeleton while data fetches
- [ ] 404 handling if project not found

### Task 6.2: Create ProjectOverviewTab
**File:** `apps/frontend/src/features/projects/tabs/ProjectOverviewTab.tsx`

Default tab showing project-wide dashboard (Req 1.3).

**Acceptance Criteria:**
- [ ] Progress summary cards: total characters (ready/not ready/in progress), scenes enabled, scenes generated/approved/rejected
- [ ] Character readiness grid: compact grid with color-coded status indicators
- [ ] Quick actions: "Generate All", "View Delivery", "Add Character"
- [ ] Uses `useProjectStats()` hook

### Task 6.3: Create ProjectCharactersTab
**File:** `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx`

Character grid organized by groups (Req 1.4).

**Acceptance Criteria:**
- [ ] Displays characters as responsive card grid (default) or list view (toggle)
- [ ] Characters organized into collapsible groups
- [ ] "All Characters" flat view toggle (ignore grouping)
- [ ] "Add Group" button to create a new group
- [ ] Character cards show: name, thumbnail, status badge, scene progress bar, readiness indicator, group label
- [ ] Status-driven card colors: gray (draft), yellow (setup), blue (ready), purple (generating), orange (needs review), green (complete), red (failures)
- [ ] Cards clickable — navigate to `/projects/:id/characters/:characterId`
- [ ] "Add Character" button opens creation form
- [ ] Searchable by character name, sortable by name/status/progress/created date
- [ ] Empty state when no characters exist
- [ ] Uses `useProjectCharacters()`, `useCharacterGroups()` hooks

### Task 6.4: Create CharacterCard component
**File:** `apps/frontend/src/features/projects/components/CharacterCard.tsx`

Reusable card for displaying a character in the project character grid.

```typescript
interface CharacterCardProps {
  character: Character;
  onClick: (characterId: number) => void;
}
```

**Acceptance Criteria:**
- [ ] Shows character name, thumbnail/avatar (hero image if available), status badge
- [ ] Scene progress bar (e.g., "12/28 scenes approved")
- [ ] Readiness indicator (green/yellow/red)
- [ ] Status-driven border/background color using design system semantic tokens
- [ ] Clickable — navigates to character detail page
- [ ] Uses design system Card, Badge, ProgressBar primitives

### Task 6.5: Create ProjectSceneSettingsTab (placeholder)
**File:** `apps/frontend/src/features/projects/tabs/ProjectSceneSettingsTab.tsx`

Placeholder tab that will integrate with PRD-111 `ProjectSceneSettings` component.

**Acceptance Criteria:**
- [ ] Tab renders with "Scene Settings" heading
- [ ] Displays placeholder message: "Scene settings will be available when the Scene Catalog (PRD-111) is implemented"
- [ ] Structured to accept the `ProjectSceneSettings` component when PRD-111 is built

### Task 6.6: Create ProjectProductionTab (placeholder)
**File:** `apps/frontend/src/features/projects/tabs/ProjectProductionTab.tsx`

Placeholder tab for the production matrix (Req 1.6).

**Acceptance Criteria:**
- [ ] Tab renders with "Production" heading
- [ ] Displays placeholder message noting dependency on batch orchestration (PRD-57)
- [ ] Structured to accept the production matrix component

### Task 6.7: Create ProjectDeliveryTab (placeholder)
**File:** `apps/frontend/src/features/projects/tabs/ProjectDeliveryTab.tsx`

Placeholder tab for delivery packaging (Req 1.7).

**Acceptance Criteria:**
- [ ] Tab renders with "Delivery" heading
- [ ] Displays placeholder message noting dependency on delivery packaging (PRD-39)
- [ ] Structured to accept delivery validation and packaging components

### Task 6.8: Create ProjectConfigTab (placeholder)
**File:** `apps/frontend/src/features/projects/tabs/ProjectConfigTab.tsx`

Placeholder tab for project configuration (Req 1.8).

**Acceptance Criteria:**
- [ ] Tab renders with "Configuration" heading
- [ ] Displays placeholder message noting dependency on config templates (PRD-74)
- [ ] Structured to accept config template import/export components

---

## Phase 7: Frontend — Character Detail Workstation

### Task 7.1: Create CharacterDetailPage with tab navigation
**File:** `apps/frontend/src/features/characters/CharacterDetailPage.tsx`

The `/projects/:id/characters/:characterId` page — a complete character workstation.

**Acceptance Criteria:**
- [ ] Breadcrumb: Projects > {Project Name} > {Character Name}
- [ ] Header: character name (editable inline), status badge, readiness indicator, face embedding status, "Generate Scenes" button
- [ ] Tab navigation: Overview, Images, Scenes, Assets, Metadata, Settings
- [ ] Active tab persisted in URL search param (`?tab=images`)
- [ ] Back navigation returns to project detail page, Characters tab
- [ ] Uses `useCharacter(projectId, characterId)` hook
- [ ] Loading skeleton and 404 handling

### Task 7.2: Create CharacterOverviewTab
**File:** `apps/frontend/src/features/characters/tabs/CharacterOverviewTab.tsx`

Overview tab with readiness checklist, face embedding card, and generation summary (Req 1.14).

**Acceptance Criteria:**
- [ ] Readiness checklist showing completion status of each criterion (PRD-107): source images, face embedding, scenes enabled, character attributes, pipeline settings, asset clips
- [ ] Each checklist item links to the relevant tab
- [ ] Face embedding card: current status, confidence score, "Extract Embedding" / "Re-extract" button, bounding box preview
- [ ] Generation summary stats: scenes enabled, generated, approved, pending, progress bar
- [ ] Quick actions: "Generate All Scenes", "Run Test Shot", "Upload Images"
- [ ] Uses `useCharacterReadiness()`, `useExtractEmbedding()` hooks

### Task 7.3: Create CharacterImagesTab
**File:** `apps/frontend/src/features/characters/tabs/CharacterImagesTab.tsx`

Source image management tab (Req 1.15).

**Acceptance Criteria:**
- [ ] Displays all source images as thumbnail grid
- [ ] Each image: thumbnail, filename, dimensions, QA status badge, hero indicator
- [ ] Drag-and-drop upload zone + file picker button
- [ ] Set/unset hero image via star/crown icon click
- [ ] Delete source image with confirmation dialog
- [ ] QA status indicator per image (passed/failed/pending)
- [ ] Empty state with upload call-to-action
- [ ] Uses `useCharacterSourceImages()`, `useUploadSourceImage()`, `useSetHeroImage()` hooks

### Task 7.4: Create CharacterScenesTab
**File:** `apps/frontend/src/features/characters/tabs/CharacterScenesTab.tsx`

Scenes tab combining scene enablement and generated video output (Req 1.16).

**Acceptance Criteria:**
- [ ] Scene list with: scene name, track badges, enabled toggle, generation status, video thumbnail
- [ ] Generation status per scene: not generated, generating (with progress), generated, approved, rejected
- [ ] Scene actions: Approve, Reject, Regenerate, Test Shot, View Versions, Import Video
- [ ] Bulk actions: Generate All, Approve All Generated, Regenerate Failed
- [ ] Filters by status and track
- [ ] Uses `useCharacterScenes()`, `useApproveScene()`, `useRejectScene()`, `useRegenerateScene()` hooks
- [ ] Placeholder for inline video preview (will use PRD-83 player component)

### Task 7.5: Create CharacterAssetsTab (placeholder)
**File:** `apps/frontend/src/features/characters/tabs/CharacterAssetsTab.tsx`

External tool asset clips tab (Req 1.17).

**Acceptance Criteria:**
- [ ] Tab renders with "Assets" heading
- [ ] Known clip types listed: `txrs_refined`, `mesh_refined`, `mouth_refined`, `smiles_refined`
- [ ] Status summary: "X of Y asset clips ready"
- [ ] Upload/import area for each asset type
- [ ] Structured to accept trigger buttons for external tool generation
- [ ] Uses `useCharacterAssets()` hook

### Task 7.6: Create CharacterMetadataTab
**File:** `apps/frontend/src/features/characters/tabs/CharacterMetadataTab.tsx`

Metadata tab with dual view: pretty-printed form and raw JSON editor (Req 1.18).

**Acceptance Criteria:**
- [ ] Two view modes with toggle: Pretty View (default) and JSON View
- [ ] Pretty View: renders known metadata fields as form inputs, grouped by category
- [ ] JSON View: raw JSON editor with syntax highlighting and validation
- [ ] Changes synced between views
- [ ] Save triggers character metadata update
- [ ] JSON validation on save
- [ ] Uses `useCharacterMetadata()`, `useUpdateCharacterMetadata()` hooks

### Task 7.7: Create CharacterSettingsTab
**File:** `apps/frontend/src/features/characters/tabs/CharacterSettingsTab.tsx`

Settings tab with named character attributes and pipeline config (Req 1.19).

**Acceptance Criteria:**
- [ ] Character attributes section: X121 Status (dropdown), A2C4 Model (text/select), ElevenLabs Voice (text/select)
- [ ] Pipeline settings section: key-value editor for remaining settings
- [ ] "Add Setting" button for new key-value pairs
- [ ] Raw JSON View toggle
- [ ] Character info section: name, description, status, dates
- [ ] Save triggers `PATCH /projects/{pid}/characters/{cid}/settings`
- [ ] Uses `useCharacterSettings()`, `useUpdateCharacterSettings()` hooks

---

## Phase 8: Frontend — Integration, Wiring & Testing

### Task 8.1: Create barrel exports for feature modules
**Files:**
- `apps/frontend/src/features/projects/index.ts`
- `apps/frontend/src/features/characters/index.ts`

**Acceptance Criteria:**
- [ ] `features/projects/index.ts` exports: `ProjectListPage`, `ProjectDetailPage`, all hooks
- [ ] `features/characters/index.ts` exports: `CharacterDetailPage`, all hooks
- [ ] All lazy imports in router resolve correctly

### Task 8.2: Update WIRING-STATUS.md
**File:** `design/progress/WIRING-STATUS.md`

Update the wiring status to reflect the new routes and navigation items.

**Acceptance Criteria:**
- [ ] Project list page marked as wired
- [ ] Project detail page marked as wired
- [ ] Character detail page marked as wired
- [ ] Sidebar "Projects" group marked as wired
- [ ] All route paths documented

### Task 8.3: Frontend component tests
**Files:**
- `apps/frontend/src/features/projects/__tests__/ProjectListPage.test.tsx`
- `apps/frontend/src/features/projects/__tests__/ProjectCard.test.tsx`
- `apps/frontend/src/features/characters/__tests__/CharacterDetailPage.test.tsx`

**Acceptance Criteria:**
- [ ] ProjectListPage renders loading state, empty state, and project cards
- [ ] ProjectCard renders project name, status badge, and character count
- [ ] ProjectCard click navigates to detail page
- [ ] CharacterDetailPage renders header, breadcrumb, and tab navigation
- [ ] Tab switching works correctly
- [ ] Tests use `@testing-library/react` with QueryClientProvider wrapper
- [ ] All tests pass

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260225000001_create_character_groups.sql` | New table migration |
| `apps/db/migrations/20260225000002_add_group_id_to_characters.sql` | Add group_id FK to characters |
| `apps/backend/crates/db/src/models/character_group.rs` | New model structs |
| `apps/backend/crates/db/src/models/character.rs` | Add group_id field |
| `apps/backend/crates/db/src/models/mod.rs` | Register new model module |
| `apps/backend/crates/db/src/repositories/character_group_repo.rs` | New group repository |
| `apps/backend/crates/db/src/repositories/character_repo.rs` | Update COLUMNS for group_id |
| `apps/backend/crates/db/src/repositories/mod.rs` | Register new repo module |
| `apps/backend/crates/api/src/handlers/character_group.rs` | New group handlers |
| `apps/backend/crates/api/src/handlers/project.rs` | Add get_stats handler |
| `apps/backend/crates/api/src/handlers/mod.rs` | Register new handler module |
| `apps/backend/crates/api/src/routes/` | Register group and stats routes |
| `apps/backend/crates/db/tests/character_group.rs` | DB-level group tests |
| `apps/backend/crates/api/tests/character_group_api.rs` | API-level group tests |
| `apps/frontend/src/app/router.tsx` | Add project and character detail routes |
| `apps/frontend/src/app/navigation.ts` | Add "Projects" nav group |
| `apps/frontend/src/features/projects/ProjectListPage.tsx` | Project list page |
| `apps/frontend/src/features/projects/ProjectDetailPage.tsx` | Project detail page with tabs |
| `apps/frontend/src/features/projects/components/ProjectCard.tsx` | Project card component |
| `apps/frontend/src/features/projects/components/ProjectFormDrawer.tsx` | Project create/edit form |
| `apps/frontend/src/features/projects/components/ProjectListControls.tsx` | Search/filter controls |
| `apps/frontend/src/features/projects/components/CharacterCard.tsx` | Character card with status colors |
| `apps/frontend/src/features/projects/tabs/ProjectOverviewTab.tsx` | Project overview dashboard |
| `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx` | Character grid with groups |
| `apps/frontend/src/features/projects/tabs/ProjectSceneSettingsTab.tsx` | Scene settings placeholder |
| `apps/frontend/src/features/projects/tabs/ProjectProductionTab.tsx` | Production matrix placeholder |
| `apps/frontend/src/features/projects/tabs/ProjectDeliveryTab.tsx` | Delivery placeholder |
| `apps/frontend/src/features/projects/tabs/ProjectConfigTab.tsx` | Configuration placeholder |
| `apps/frontend/src/features/projects/hooks/useProjects.ts` | Project query hooks |
| `apps/frontend/src/features/projects/hooks/useCharacterGroups.ts` | Group query hooks |
| `apps/frontend/src/features/projects/hooks/useProjectCharacters.ts` | Character list hooks |
| `apps/frontend/src/features/characters/CharacterDetailPage.tsx` | Character workstation page |
| `apps/frontend/src/features/characters/tabs/CharacterOverviewTab.tsx` | Readiness + embedding |
| `apps/frontend/src/features/characters/tabs/CharacterImagesTab.tsx` | Source image management |
| `apps/frontend/src/features/characters/tabs/CharacterScenesTab.tsx` | Scene enablement + review |
| `apps/frontend/src/features/characters/tabs/CharacterAssetsTab.tsx` | External tool assets |
| `apps/frontend/src/features/characters/tabs/CharacterMetadataTab.tsx` | Metadata JSON editor |
| `apps/frontend/src/features/characters/tabs/CharacterSettingsTab.tsx` | Attributes + pipeline config |
| `apps/frontend/src/features/characters/hooks/useCharacterDetail.ts` | Character sub-resource hooks |
| `apps/frontend/src/features/projects/index.ts` | Barrel exports |
| `apps/frontend/src/features/characters/index.ts` | Barrel exports |
| `design/progress/WIRING-STATUS.md` | Updated route wiring status |

---

## Dependencies

### Existing Components to Reuse
- `x121_db::repositories::ProjectRepo` — Full CRUD + soft delete + restore
- `x121_db::repositories::CharacterRepo` — Full CRUD + soft delete + settings helpers
- `x121_db::models::project::{Project, CreateProject, UpdateProject}` — Model structs
- `x121_db::models::character::{Character, CreateCharacter, UpdateCharacter}` — Model structs
- `x121_core::types::{DbId, Timestamp}` — Shared type aliases
- `x121_core::error::CoreError` — Domain error variants
- `x121_api::error::{AppError, AppResult}` — HTTP error mapping
- `x121_api::state::AppState` — Shared app state
- `tests/common/mod.rs` — `build_test_app`, `body_json`, `post_json`, `put_json`, `get`, `delete`
- `apps/frontend/src/lib/api.ts` — API client with auth token management
- `apps/frontend/src/app/router.tsx` — Route definitions with lazy loading pattern
- `apps/frontend/src/app/navigation.ts` — Sidebar nav group definitions
- Design system: Card, Badge, Toggle, Input, Drawer, Table, Tabs, Breadcrumb, EmptyState

### New Infrastructure Needed
- `character_groups` table and migration
- `group_id` column on `characters` and migration
- `CharacterGroupRepo` with CRUD operations
- `character_group` handler module
- Project stats aggregation endpoint
- `features/projects/` directory with pages, components, tabs, hooks
- `features/characters/` directory with detail page, tabs, hooks

---

## Implementation Order

### MVP (Minimum for Feature)
1. **Phase 1: Database** — Tasks 1.1-1.2 (character groups table + group_id FK)
2. **Phase 2: Backend** — Tasks 2.1-2.6 (group model, repo, handlers, routes, stats)
3. **Phase 3: Backend Tests** — Tasks 3.1-3.2 (DB + API integration tests)
4. **Phase 4: Frontend Routing & Hooks** — Tasks 4.1-4.6 (routes, nav, all query hooks)
5. **Phase 5: Project List** — Tasks 5.1-5.4 (project list page with search/filter)
6. **Phase 6: Project Detail** — Tasks 6.1-6.8 (project detail page with all tabs)
7. **Phase 7: Character Detail** — Tasks 7.1-7.7 (character workstation with all tabs)
8. **Phase 8: Integration** — Tasks 8.1-8.3 (barrel exports, wiring, tests)

**MVP Success Criteria:**
- Projects browsable from the project list page with search, filter, and sort
- New projects can be created from the UI via drawer form
- Project detail page shows character grid organized by groups with status-driven colors
- Character detail page provides full workstation: Overview (readiness, embedding), Images (upload, hero, QA), Scenes (enable, generate, approve/reject), Assets (placeholder), Metadata (JSON editor), Settings (attributes)
- Sidebar has "Projects" nav group with "All Projects" link
- All routes lazy-loaded and navigable with breadcrumbs
- Character groups can be created, renamed, reordered, and deleted
- Characters can be assigned to groups
- All backend endpoints covered by integration tests

### Post-MVP Enhancements
- Project duplication (PRD-112 Req 2.1)
- Project quick switcher (PRD-112 Req 2.2)
- Production matrix with live WebSocket updates (Req 1.6 — depends on PRD-57 batch orchestration)
- Delivery validation and packaging (Req 1.7 — depends on PRD-39 delivery)
- Scene settings integration (Req 1.5 — depends on PRD-111 scene catalog)
- Configuration template integration (Req 1.8 — depends on PRD-74)
- Character library import flow (Req 1.4 — depends on PRD-60)
- Inline video playback in Scenes tab (depends on PRD-83 player component)
- Drag-and-drop characters between groups
- Bulk actions: select multiple characters for bulk operations

---

## Notes

1. **Backend is mostly done** — PRD-01 already provides project and character CRUD. The only new backend work is character groups and project stats. All other backend integrations (source images, embeddings, scenes, approvals, delivery) are provided by their respective PRDs.
2. **Placeholder tabs for dependent PRDs** — Scene Settings, Production, Delivery, and Configuration tabs render placeholders until their upstream PRDs (111, 57, 39, 74) are implemented. This avoids blocking the Project Hub on those PRDs.
3. **Character detail hooks reference future endpoints** — Some hooks (scene generation, approval, test shots, asset clips) reference endpoints that may not exist yet. The hooks should be written to match the expected API contracts from their respective PRDs, and will work once those PRDs are implemented.
4. **Status-driven card colors** — Must use design system semantic color tokens, not hardcoded hex values. Define a `characterStatusColor` utility function that maps workflow state to token names.
5. **Migration ordering** — The `character_groups` table migration must run before the `add_group_id_to_characters` migration because the FK references `character_groups(id)`.
6. **Tab state in URL** — Both project detail and character detail pages persist the active tab in URL search params. This ensures tab state survives page refreshes and back/forward navigation.

---

## Version History

- **v1.0** (2026-02-25): Initial task list creation from PRD-112

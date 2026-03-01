# Task List: SVI Clip Management

**PRD Reference:** `design/prds/121-prd-svi-clip-management.md`
**Scope:** Frontend clip gallery, clip QA (approve/reject), resume-from-good-clip generation, and external clip import UI for scene video versions.

## Overview

This task list implements the full clip management experience for scene video versions (SVIs). The backend already has `scene_video_versions` CRUD, `set-final`, and `import_video` endpoints (PRD-109). This PRD extends that foundation with QA columns, approve/reject/resume-from endpoints, and a complete frontend clip gallery with QA actions, resume-from confirmation, and import UI.

The implementation follows DB-first, then backend model/repo, then API handlers/routes, then frontend types/hooks, then frontend components. Each phase is independently testable.

### What Already Exists
- `SceneVideoVersion` model (`crates/db/src/models/scene_video_version.rs`) -- CRUD fields, no QA columns yet
- `SceneVideoVersionRepo` (`crates/db/src/repositories/scene_video_version_repo.rs`) -- create, find, list, update, soft_delete, set_final, create_as_final, find_final_for_scene
- Scene version API handlers (`crates/api/src/handlers/scene_video_version.rs`) -- list_by_scene, get_by_id, delete, set_final, import_video
- Scene routes (`crates/api/src/routes/scene.rs`) -- version routes nested at `/{scene_id}/versions`
- `SegmentRepo::get_last_completed()` (`crates/db/src/repositories/segment_repo.rs`) -- returns last completed segment for a scene
- `init_scene_generation()` (`crates/api/src/handlers/generation.rs`) -- validates preconditions, estimates segments, marks scene as generating
- `SceneRepo::update_generation_state()` (`crates/db/src/repositories/scene_repo.rs`) -- updates generation fields on scene
- `AuthUser` extractor (`crates/api/src/middleware/auth.rs`) -- extracts user_id and role from JWT
- `RejectionDialog` component (`apps/frontend/src/features/review/RejectionDialog.tsx`) -- pattern for rejection category + comment UI
- Review hooks (`apps/frontend/src/features/review/hooks/use-review.ts`) -- query key factory, `useDecisionMutation` pattern
- `api` client (`apps/frontend/src/lib/api.ts`) -- get, post, put, patch, delete, raw methods with JWT auth
- `DataResponse<T>` envelope (`crates/api/src/response.rs`) -- standard `{ "data": T }` wrapper
- Approval handler pattern (`crates/api/src/handlers/approval.rs`) -- approve/reject segments with `AuthUser` and `CreateApproval`

### What We're Building
1. DB migration adding `qa_status`, `qa_reviewed_by`, `qa_reviewed_at`, `qa_rejection_reason`, `qa_notes` to `scene_video_versions`
2. Extended `SceneVideoVersion` model and `UpdateSceneVideoVersion` DTO with QA fields
3. Extended `SceneVideoVersionRepo` with QA-specific update methods and batch soft-delete
4. Three new API endpoints: approve, reject, resume-from
5. Frontend TypeScript types for clip data
6. TanStack Query hooks for all clip operations
7. Frontend components: `ClipGallery`, `ClipCard`, `ClipQAActions`, `ClipRejectionDialog`, `ResumeFromDialog`, `ImportClipDialog`

### Key Design Decisions
1. QA status uses a `TEXT CHECK` constraint (matching existing `source` column pattern) rather than a lookup table -- consistent with PRD-109's approach
2. Rejection reasons are freeform text for MVP (not from a predefined category table) -- simplifies the schema and UI
3. Resume-from operates by soft-deleting subsequent clips and segments, then calling `init_scene_generation` -- reuses existing generation infrastructure
4. Frontend clip gallery is a vertical list (not grid) to accommodate metadata and action buttons per the PRD design section
5. Import UI reuses the existing `POST /scenes/{scene_id}/versions/import` endpoint -- no backend changes needed for import

---

## Phase 1: Database Migration

### Task 1.1: Add QA columns to `scene_video_versions` table
**File:** `apps/db/migrations/20260301000029_add_qa_columns_to_scene_video_versions.sql`

Add five new columns for clip-level quality assurance tracking. Uses `ALTER TABLE ADD COLUMN` since the table already exists (created in migration `20260220000011`). Adds a partial index on `qa_status` for efficient filtering.

```sql
-- Add QA columns to scene_video_versions (PRD-121 Req 1.1)
ALTER TABLE scene_video_versions
    ADD COLUMN qa_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (qa_status IN ('pending', 'approved', 'rejected')),
    ADD COLUMN qa_reviewed_by BIGINT REFERENCES users(id),
    ADD COLUMN qa_reviewed_at TIMESTAMPTZ,
    ADD COLUMN qa_rejection_reason TEXT,
    ADD COLUMN qa_notes TEXT;

-- Partial index for filtering by QA status (only non-deleted rows)
CREATE INDEX idx_scene_video_versions_qa_status
    ON scene_video_versions (qa_status)
    WHERE deleted_at IS NULL;
```

**Acceptance Criteria:**
- [ ] Migration file exists at the specified path with the next sequential timestamp
- [ ] `qa_status` column has CHECK constraint limiting values to `'pending'`, `'approved'`, `'rejected'`
- [ ] `qa_status` defaults to `'pending'`
- [ ] `qa_reviewed_by` is nullable BIGINT with FK to `users(id)`
- [ ] `qa_reviewed_at` is nullable TIMESTAMPTZ
- [ ] `qa_rejection_reason` is nullable TEXT
- [ ] `qa_notes` is nullable TEXT
- [ ] Partial index `idx_scene_video_versions_qa_status` is created on `qa_status` WHERE `deleted_at IS NULL`
- [ ] Migration runs successfully against the existing database schema (`make migrate`)
- [ ] Existing rows get `qa_status = 'pending'` and NULL for all other new columns

---

## Phase 2: Backend Model & Repository

### Task 2.1: Extend `SceneVideoVersion` model with QA fields
**File:** `apps/backend/crates/db/src/models/scene_video_version.rs`

Add the five new QA columns to the `SceneVideoVersion` struct so sqlx can map them from query results. Update the `UpdateSceneVideoVersion` DTO to support QA field updates. Add a new `RejectClipRequest` DTO for the reject endpoint request body.

```rust
// Add to SceneVideoVersion struct (after `notes` field):
pub qa_status: String,
pub qa_reviewed_by: Option<DbId>,
pub qa_reviewed_at: Option<Timestamp>,
pub qa_rejection_reason: Option<String>,
pub qa_notes: Option<String>,

// Extend UpdateSceneVideoVersion with QA fields:
pub qa_status: Option<String>,
pub qa_reviewed_by: Option<DbId>,
pub qa_reviewed_at: Option<Timestamp>,
pub qa_rejection_reason: Option<String>,
pub qa_notes: Option<String>,

// New DTO for reject endpoint request body:
#[derive(Debug, Clone, Deserialize)]
pub struct RejectClipRequest {
    pub reason: String,
    pub notes: Option<String>,
}

// New DTO for resume-from endpoint response:
#[derive(Debug, Clone, Serialize)]
pub struct ResumeFromResponse {
    pub scene_id: DbId,
    pub resume_from_version: i32,
    pub segments_preserved: i32,
    pub segments_discarded: i32,
    pub status: String,
}
```

**Acceptance Criteria:**
- [ ] `SceneVideoVersion` struct has all five new QA fields with correct types
- [ ] `SceneVideoVersion` still derives `FromRow` and `Serialize`
- [ ] `UpdateSceneVideoVersion` has all five new QA optional fields
- [ ] `RejectClipRequest` DTO with `reason: String` (required) and `notes: Option<String>`
- [ ] `ResumeFromResponse` DTO with `scene_id`, `resume_from_version`, `segments_preserved`, `segments_discarded`, `status`
- [ ] `cargo check -p x121-db` passes

### Task 2.2: Update `SceneVideoVersionRepo` COLUMNS constant and update method
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs`

Update the shared `COLUMNS` constant to include the five new QA columns. Update the `update` method to handle the new QA fields via the COALESCE pattern. Add a `soft_delete_after_version` method for batch soft-deleting all versions after a given version number (needed by resume-from).

```rust
// Updated COLUMNS constant:
const COLUMNS: &str = "id, scene_id, version_number, source, file_path, \
    file_size_bytes, duration_secs, is_final, notes, \
    qa_status, qa_reviewed_by, qa_reviewed_at, qa_rejection_reason, qa_notes, \
    deleted_at, created_at, updated_at";

// Updated update method adds COALESCE for QA fields.

// New method:
/// Soft-delete all versions for a scene with version_number > the given threshold.
/// Returns the count of rows affected.
pub async fn soft_delete_after_version(
    pool: &PgPool,
    scene_id: DbId,
    version_number: i32,
) -> Result<u64, sqlx::Error> { ... }
```

**Acceptance Criteria:**
- [ ] `COLUMNS` constant includes `qa_status, qa_reviewed_by, qa_reviewed_at, qa_rejection_reason, qa_notes`
- [ ] `update` method binds all five new QA fields via COALESCE pattern
- [ ] `soft_delete_after_version(pool, scene_id, version_number)` soft-deletes all non-deleted versions where `version_number > $threshold AND scene_id = $scene_id`
- [ ] `soft_delete_after_version` returns the count of affected rows
- [ ] All existing methods (`create`, `find_by_id`, `list_by_scene`, `set_final`, `create_as_final`, `find_final_for_scene`, `find_scenes_missing_final`) continue to work with the expanded COLUMNS
- [ ] `cargo check -p x121-db` passes

### Task 2.3: Add `soft_delete_after_sequence` to `SegmentRepo`
**File:** `apps/backend/crates/db/src/repositories/segment_repo.rs`

Add a batch soft-delete method that deletes all segments for a scene with `sequence_index` greater than a given value. Needed by the resume-from handler to discard segments after the resume point.

```rust
/// Soft-delete all segments for a scene with sequence_index > the given threshold.
/// Returns the count of rows affected.
pub async fn soft_delete_after_sequence(
    pool: &PgPool,
    scene_id: DbId,
    sequence_index: i32,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE segments SET deleted_at = NOW() \
         WHERE scene_id = $1 AND sequence_index > $2 AND deleted_at IS NULL",
    )
    .bind(scene_id)
    .bind(sequence_index)
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}
```

**Acceptance Criteria:**
- [ ] `SegmentRepo::soft_delete_after_sequence(pool, scene_id, sequence_index)` exists
- [ ] Only soft-deletes segments where `deleted_at IS NULL` (idempotent)
- [ ] Returns the count of affected rows
- [ ] `cargo check -p x121-db` passes

---

## Phase 3: Backend API Handlers & Routes

### Task 3.1: Add `approve_clip` handler
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

Add a handler for `PUT /scenes/{scene_id}/versions/{id}/approve`. Requires authentication. Sets `qa_status = 'approved'`, records `qa_reviewed_by` (from JWT), and `qa_reviewed_at` (now). Returns the updated version. Returns 404 if not found (or soft-deleted).

Follow the pattern from `crates/api/src/handlers/approval.rs::approve_segment` for auth extraction and logging.

```rust
/// PUT /api/v1/scenes/{scene_id}/versions/{id}/approve
pub async fn approve_clip(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<SceneVideoVersion>>> {
    let version = SceneVideoVersionRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneVideoVersion",
            id,
        }))?;

    let update = UpdateSceneVideoVersion {
        is_final: None,
        notes: None,
        qa_status: Some("approved".to_string()),
        qa_reviewed_by: Some(auth.user_id),
        qa_reviewed_at: Some(chrono::Utc::now()),
        qa_rejection_reason: None,
        qa_notes: None,
    };

    let updated = SceneVideoVersionRepo::update(&state.pool, id, &update)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneVideoVersion",
            id,
        }))?;

    tracing::info!(user_id = auth.user_id, version_id = id, "Clip approved");
    Ok(Json(DataResponse { data: updated }))
}
```

**Acceptance Criteria:**
- [ ] Handler accepts `AuthUser` extractor (requires JWT)
- [ ] Returns 404 if version does not exist or is soft-deleted
- [ ] Sets `qa_status = 'approved'`, `qa_reviewed_by` = authenticated user ID, `qa_reviewed_at` = now
- [ ] Returns the updated `SceneVideoVersion` wrapped in `DataResponse`
- [ ] Logs the approval with `tracing::info!`
- [ ] Add `use crate::middleware::auth::AuthUser;` and `use crate::response::DataResponse;` imports
- [ ] `cargo check -p x121-api` passes

### Task 3.2: Add `reject_clip` handler
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

Add a handler for `PUT /scenes/{scene_id}/versions/{id}/reject`. Requires authentication. Accepts a JSON body with `reason` (required) and `notes` (optional). Sets `qa_status = 'rejected'` and records all QA fields.

```rust
/// PUT /api/v1/scenes/{scene_id}/versions/{id}/reject
pub async fn reject_clip(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_scene_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<RejectClipRequest>,
) -> AppResult<Json<DataResponse<SceneVideoVersion>>> { ... }
```

**Acceptance Criteria:**
- [ ] Handler accepts `AuthUser` extractor (requires JWT)
- [ ] Accepts `RejectClipRequest` body with required `reason` and optional `notes`
- [ ] Returns 404 if version does not exist or is soft-deleted
- [ ] Sets `qa_status = 'rejected'`, `qa_reviewed_by`, `qa_reviewed_at`, `qa_rejection_reason`, `qa_notes`
- [ ] Returns the updated `SceneVideoVersion` wrapped in `DataResponse`
- [ ] Logs the rejection with `tracing::info!`
- [ ] `cargo check -p x121-api` passes

### Task 3.3: Add `resume_from_clip` handler
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

Add a handler for `POST /scenes/{scene_id}/versions/{id}/resume-from`. Requires authentication. Validates the clip is approved, soft-deletes all subsequent clips, soft-deletes segments after the resume point, resets scene generation state, and initiates a new generation.

This handler:
1. Finds the clip by ID, verifies it exists and has `qa_status = 'approved'`
2. Calls `SceneVideoVersionRepo::soft_delete_after_version` to discard subsequent clips
3. Uses `SegmentRepo::get_last_completed` to find the resume segment
4. Calls `SegmentRepo::soft_delete_after_sequence` to discard subsequent segments
5. Resets scene generation state via `SceneRepo::update_generation_state`
6. Returns a `ResumeFromResponse`

```rust
/// POST /api/v1/scenes/{scene_id}/versions/{id}/resume-from
pub async fn resume_from_clip(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((scene_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<ResumeFromResponse>>> { ... }
```

**Acceptance Criteria:**
- [ ] Handler accepts `AuthUser` extractor (requires JWT)
- [ ] Returns 404 if clip or scene does not exist
- [ ] Returns 400 if clip's `qa_status` is not `'approved'`
- [ ] Soft-deletes all clips with `version_number` greater than the selected clip's `version_number`
- [ ] Soft-deletes all segments with `sequence_index` greater than the last completed segment at the resume point
- [ ] Resets scene `generation_completed_at` to NULL via `SceneRepo::update_generation_state`
- [ ] Returns `ResumeFromResponse` with `scene_id`, `resume_from_version`, `segments_preserved`, `segments_discarded`, `status: "generating"`
- [ ] Logs the resume action with `tracing::info!`
- [ ] Handles edge case: imported clip (no segments) -- preserves zero segments and starts fresh
- [ ] `cargo check -p x121-api` passes

### Task 3.4: Add `set_final` validation for rejected clips
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

Modify the existing `set_final` handler to reject the request if the clip has `qa_status = 'rejected'`. Returns 400 with message "Cannot mark a rejected clip as final. Approve it first."

**Acceptance Criteria:**
- [ ] `set_final` returns 400 if the version's `qa_status == "rejected"`
- [ ] Error message is: "Cannot mark a rejected clip as final. Approve it first."
- [ ] Approved and pending clips can still be set as final (no change to existing behavior)
- [ ] `cargo check -p x121-api` passes

### Task 3.5: Wire new routes in scene router
**File:** `apps/backend/crates/api/src/routes/scene.rs`

Add the three new routes to the existing `version_routes` router. Follow the existing pattern for route definition.

```rust
// Add to version_routes (after existing .route("/{id}/set-final", ...)):
.route("/{id}/approve", put(version::approve_clip))
.route("/{id}/reject", put(version::reject_clip))
.route("/{id}/resume-from", post(version::resume_from_clip))
```

**Acceptance Criteria:**
- [ ] `PUT /{scene_id}/versions/{id}/approve` routes to `version::approve_clip`
- [ ] `PUT /{scene_id}/versions/{id}/reject` routes to `version::reject_clip`
- [ ] `POST /{scene_id}/versions/{id}/resume-from` routes to `version::resume_from_clip`
- [ ] Route doc comment at top of file is updated to include the three new endpoints
- [ ] `cargo check -p x121-api` passes

---

## Phase 4: Frontend Types & Hooks

### Task 4.1: Create clip management TypeScript types
**File:** `apps/frontend/src/features/scenes/types.ts`

Define TypeScript interfaces that mirror the backend `SceneVideoVersion` model (including QA fields), request DTOs, and the `ResumeFromResponse`. Follow the pattern from `apps/frontend/src/features/review/types.ts`.

```typescript
/** A scene video version (clip) record from the server. */
export interface SceneVideoVersion {
  id: number;
  scene_id: number;
  version_number: number;
  source: "generated" | "imported";
  file_path: string;
  file_size_bytes: number | null;
  duration_secs: number | null;
  is_final: boolean;
  notes: string | null;
  qa_status: "pending" | "approved" | "rejected";
  qa_reviewed_by: number | null;
  qa_reviewed_at: string | null;
  qa_rejection_reason: string | null;
  qa_notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Request body for rejecting a clip. */
export interface RejectClipInput {
  reason: string;
  notes?: string;
}

/** Response from the resume-from endpoint. */
export interface ResumeFromResponse {
  scene_id: number;
  resume_from_version: number;
  segments_preserved: number;
  segments_discarded: number;
  status: string;
}

/** QA status constants (match backend CHECK constraint). */
export const QA_PENDING = "pending" as const;
export const QA_APPROVED = "approved" as const;
export const QA_REJECTED = "rejected" as const;

/** Map a QA status to a human-readable label. */
export function qaStatusLabel(status: string): string { ... }

/** Map a QA status to a design token color. */
export function qaStatusColor(status: string): string { ... }
```

**Acceptance Criteria:**
- [ ] `SceneVideoVersion` interface matches all backend fields including QA columns
- [ ] `RejectClipInput` has required `reason` and optional `notes`
- [ ] `ResumeFromResponse` matches backend DTO
- [ ] `qaStatusLabel` and `qaStatusColor` helper functions defined
- [ ] QA status constants exported
- [ ] All types use named exports (no default exports)
- [ ] No `.gitkeep` remains in `apps/frontend/src/features/scenes/` (remove it)

### Task 4.2: Create TanStack Query hooks for clip management
**File:** `apps/frontend/src/features/scenes/hooks/useClipManagement.ts`

Create query and mutation hooks following the key factory pattern from `apps/frontend/src/features/review/hooks/use-review.ts` and `apps/frontend/src/features/segment-comparison/hooks/use-segment-versions.ts`.

```typescript
// Query key factory
export const clipKeys = {
  all: ["scene-versions"] as const,
  list: (sceneId: number) => [...clipKeys.all, "list", sceneId] as const,
  detail: (sceneId: number, versionId: number) =>
    [...clipKeys.all, "detail", sceneId, versionId] as const,
};

// Queries
export function useSceneVersions(sceneId: number) { ... }
export function useSceneVersion(sceneId: number, versionId: number) { ... }

// Mutations
export function useApproveClip(sceneId: number) { ... }
export function useRejectClip(sceneId: number) { ... }
export function useSetFinalClip(sceneId: number) { ... }
export function useResumeFromClip(sceneId: number) { ... }
export function useImportClip(sceneId: number) { ... }
```

**Acceptance Criteria:**
- [ ] `clipKeys` factory follows the `[resource, ...params]` pattern
- [ ] `useSceneVersions(sceneId)` fetches `GET /scenes/{sceneId}/versions` with `enabled: sceneId > 0`
- [ ] `useSceneVersion(sceneId, versionId)` fetches `GET /scenes/{sceneId}/versions/{versionId}`
- [ ] `useApproveClip(sceneId)` mutation calls `PUT /scenes/{sceneId}/versions/{id}/approve`
- [ ] `useRejectClip(sceneId)` mutation calls `PUT /scenes/{sceneId}/versions/{id}/reject` with `RejectClipInput` body
- [ ] `useSetFinalClip(sceneId)` mutation calls `PUT /scenes/{sceneId}/versions/{id}/set-final`
- [ ] `useResumeFromClip(sceneId)` mutation calls `POST /scenes/{sceneId}/versions/{id}/resume-from`
- [ ] `useImportClip(sceneId)` mutation uses `api.raw` for multipart FormData upload to `POST /scenes/{sceneId}/versions/import`
- [ ] All mutations invalidate `clipKeys.list(sceneId)` on success
- [ ] Uses `@tanstack/react-query` imports (`useQuery`, `useMutation`, `useQueryClient`)
- [ ] Uses `@/lib/api` for all API calls
- [ ] Imports types from `../types`

---

## Phase 5: Frontend Clip Gallery & Card Components

### Task 5.1: Create `ClipCard` component
**File:** `apps/frontend/src/features/scenes/ClipCard.tsx`

Individual clip card component displaying version metadata and QA status. Used as a child of `ClipGallery`. Each card is a horizontal row: thumbnail/play area on the left, metadata in the center, action buttons on the right.

Follow the component structure convention from `CONVENTIONS.md` section 6: named export, props interface in same file, Tailwind classes with design tokens, no inline styles.

```typescript
interface ClipCardProps {
  clip: SceneVideoVersion;
  onPlay: (clip: SceneVideoVersion) => void;
  onApprove: (clipId: number) => void;
  onReject: (clipId: number) => void;
  onSetFinal: (clipId: number) => void;
  onResumeFrom?: (clipId: number) => void;
  showResumeButton: boolean;
}

export function ClipCard({ clip, onPlay, onApprove, onReject, onSetFinal, onResumeFrom, showResumeButton }: ClipCardProps) { ... }
```

**Acceptance Criteria:**
- [ ] Displays version number, source badge ("Generated"/"Imported"), QA status badge (color-coded), `is_final` badge (star icon)
- [ ] Displays file size (human-readable: KB/MB/GB), duration (formatted), creation date
- [ ] Clicking the card/thumbnail area calls `onPlay`
- [ ] Shows approve/reject buttons for pending clips (via `ClipQAActions` sub-component or inline)
- [ ] Shows "Resume from here" button when `showResumeButton` is true
- [ ] Approved clips show green badge, rejected show red badge with reason on hover, pending show gray badge
- [ ] Final clip shows a gold star icon
- [ ] Uses design tokens via CSS variables (`var(--color-*)`) for all colors
- [ ] Uses `StatusBadge` from design system for source and QA badges (or inline Tailwind badges if StatusBadge is not yet available)
- [ ] Named export, no default export

### Task 5.2: Create `ClipQAActions` component
**File:** `apps/frontend/src/features/scenes/ClipQAActions.tsx`

Approve/reject action buttons displayed on each clip card. For pending clips, shows both buttons. For approved/rejected clips, shows the current status badge only.

```typescript
interface ClipQAActionsProps {
  clip: SceneVideoVersion;
  onApprove: (clipId: number) => void;
  onReject: (clipId: number) => void;
  isApproving?: boolean;
  isRejecting?: boolean;
}

export function ClipQAActions({ clip, onApprove, onReject, isApproving, isRejecting }: ClipQAActionsProps) { ... }
```

**Acceptance Criteria:**
- [ ] Pending clips: shows checkmark "Approve" button (green) and X "Reject" button (red)
- [ ] Approved clips: shows "Approved" green badge, no action buttons
- [ ] Rejected clips: shows "Rejected" red badge with rejection reason visible on hover/tooltip
- [ ] Buttons show loading spinner when `isApproving` or `isRejecting` is true
- [ ] Buttons are disabled during mutation loading state
- [ ] Uses Lucide React icons for checkmark and X

### Task 5.3: Create `ClipGallery` component
**File:** `apps/frontend/src/features/scenes/ClipGallery.tsx`

Main gallery component rendering a vertical list of `ClipCard` components for a given scene. Handles data fetching, loading/error/empty states, and coordinates QA actions and dialogs.

```typescript
interface ClipGalleryProps {
  sceneId: number;
}

export function ClipGallery({ sceneId }: ClipGalleryProps) { ... }
```

**Acceptance Criteria:**
- [ ] Fetches clips via `useSceneVersions(sceneId)` hook
- [ ] Renders clips ordered by `version_number` descending (newest first) -- backend returns this order
- [ ] Loading state: shows skeleton cards (3 placeholder cards with animated shimmer)
- [ ] Error state: shows error message with "Retry" button that refetches
- [ ] Empty state: shows message "No clips for this scene" with suggestion to generate or import
- [ ] "Import Clip" button in the gallery header opens `ImportClipDialog`
- [ ] Clicking approve on a card calls `useApproveClip` mutation
- [ ] Clicking reject on a card opens `ClipRejectionDialog`
- [ ] Clicking "Resume from here" opens `ResumeFromDialog`
- [ ] Clicking a card opens video playback (uses `VideoPlayer` if available, or a `<video>` element)
- [ ] "Resume from here" button only appears on approved clips that have at least one rejected clip after them
- [ ] Uses optimistic updates for approve/reject mutations (via `onMutate`)
- [ ] Named export, no default export

---

## Phase 6: Frontend Dialogs

### Task 6.1: Create `ClipRejectionDialog` component
**File:** `apps/frontend/src/features/scenes/ClipRejectionDialog.tsx`

Dialog for entering a rejection reason and optional notes when rejecting a clip. Follows the pattern from `apps/frontend/src/features/review/RejectionDialog.tsx` but simplified: freeform text reason instead of category selection (per PRD open question #1 -- freeform for MVP).

```typescript
interface ClipRejectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string, notes: string | undefined) => void;
  isSubmitting?: boolean;
}

export function ClipRejectionDialog({ isOpen, onClose, onSubmit, isSubmitting }: ClipRejectionDialogProps) { ... }
```

**Acceptance Criteria:**
- [ ] Modal overlay with centered dialog (follows existing `RejectionDialog` visual pattern)
- [ ] "Reason" text input field (required) -- cannot submit when empty
- [ ] "Notes" textarea field (optional)
- [ ] "Cancel" button closes the dialog and resets fields
- [ ] "Reject" button calls `onSubmit` with reason and notes, then resets fields
- [ ] "Reject" button is disabled when reason is empty or `isSubmitting` is true
- [ ] Shows loading spinner on "Reject" button when `isSubmitting` is true
- [ ] Dialog returns `null` when `isOpen` is false
- [ ] Uses `role="dialog"` and `aria-label` for accessibility
- [ ] Uses design tokens for all colors

### Task 6.2: Create `ResumeFromDialog` component
**File:** `apps/frontend/src/features/scenes/ResumeFromDialog.tsx`

Confirmation dialog for the "Resume from here" action. Shows a warning about the destructive nature (soft-delete, not permanent) and exact counts of clips that will be discarded.

```typescript
interface ResumeFromDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  clip: SceneVideoVersion;
  clipsToDiscard: number;
  isSubmitting?: boolean;
}

export function ResumeFromDialog({ isOpen, onClose, onConfirm, clip, clipsToDiscard, isSubmitting }: ResumeFromDialogProps) { ... }
```

**Acceptance Criteria:**
- [ ] Modal overlay with centered dialog
- [ ] Shows warning text: "This will discard {clipsToDiscard} clip(s) after version {version_number} and restart generation from this point."
- [ ] Clarifies that clips are soft-deleted, not permanently removed
- [ ] Shows the version number and source of the clip being resumed from
- [ ] "Cancel" button closes the dialog
- [ ] "Resume Generation" button calls `onConfirm`
- [ ] "Resume Generation" button is disabled when `isSubmitting` is true
- [ ] Shows loading spinner on confirm button when `isSubmitting` is true
- [ ] Uses `role="alertdialog"` for accessibility (destructive confirmation)
- [ ] Uses warning color tokens for the caution message

### Task 6.3: Create `ImportClipDialog` component
**File:** `apps/frontend/src/features/scenes/ImportClipDialog.tsx`

Dialog for importing an external video file as a new clip. Includes drag-and-drop zone, file picker button, format validation, notes field, and upload progress.

```typescript
interface ImportClipDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sceneId: number;
  onSuccess: () => void;
}

export function ImportClipDialog({ isOpen, onClose, sceneId, onSuccess }: ImportClipDialogProps) { ... }
```

**Acceptance Criteria:**
- [ ] Modal overlay with centered dialog
- [ ] Drag-and-drop zone that accepts video files (visual feedback on drag-over)
- [ ] File picker fallback button ("Browse files")
- [ ] Accepted formats: `.mp4`, `.webm`, `.mov` -- validated client-side before upload
- [ ] Shows file size limit hint (500 MB)
- [ ] Rejects files with unsupported extensions with inline error message
- [ ] Optional "Notes" textarea for describing the imported clip
- [ ] Upload progress bar shown during multipart upload (uses `XMLHttpRequest` or fetch with progress stream for progress tracking)
- [ ] Uses `useImportClip` mutation for the actual upload
- [ ] On success: calls `onSuccess` callback (parent invalidates query cache), closes dialog
- [ ] On error: shows error message in the dialog without closing it
- [ ] "Cancel" button closes the dialog (disabled during upload)
- [ ] Uses `FormData` with `file` and `notes` fields matching the backend `import_video` handler
- [ ] Uses design tokens for all colors

---

## Phase 7: Integration & Testing

### Task 7.1: Backend integration tests for clip QA endpoints
**File:** `apps/backend/crates/api/tests/clip_qa_tests.rs` (or add to existing scene version test file if one exists)

Write integration tests following the project's `#[sqlx::test]` pattern (see `CONVENTIONS.md` section 7).

**Acceptance Criteria:**
- [ ] Test: approve a clip -- verify `qa_status = 'approved'`, `qa_reviewed_by` is set, `qa_reviewed_at` is set
- [ ] Test: reject a clip with reason and notes -- verify all five QA fields populated correctly
- [ ] Test: approve a soft-deleted clip -- returns 404
- [ ] Test: reject a clip without `reason` field -- returns 400 (deserialization error)
- [ ] Test: set-final on a rejected clip -- returns 400 with appropriate message
- [ ] Test: resume-from an approved clip -- verify subsequent clips are soft-deleted, response contains correct counts
- [ ] Test: resume-from a rejected clip -- returns 400
- [ ] Test: resume-from a non-existent clip -- returns 404
- [ ] All tests pass with `cargo test`

### Task 7.2: Frontend component tests
**Files:**
- `apps/frontend/src/features/scenes/__tests__/ClipGallery.test.tsx`
- `apps/frontend/src/features/scenes/__tests__/ClipCard.test.tsx`
- `apps/frontend/src/features/scenes/__tests__/ClipQAActions.test.tsx`
- `apps/frontend/src/features/scenes/__tests__/ClipRejectionDialog.test.tsx`
- `apps/frontend/src/features/scenes/__tests__/ResumeFromDialog.test.tsx`
- `apps/frontend/src/features/scenes/__tests__/ImportClipDialog.test.tsx`

Write component tests following the Vitest + Testing Library pattern from `CONVENTIONS.md` section 7 and existing test files like `apps/frontend/src/features/segment-comparison/__tests__/ComparisonActions.test.tsx`.

**Acceptance Criteria:**
- [ ] `ClipGallery` renders clip cards ordered by version number descending
- [ ] `ClipGallery` shows empty state when no clips exist
- [ ] `ClipGallery` shows loading skeleton while fetching
- [ ] `ClipGallery` shows error state with retry button on fetch failure
- [ ] `ClipCard` displays correct badges for each QA status (pending, approved, rejected)
- [ ] `ClipCard` displays source badge, version number, file size, duration
- [ ] `ClipQAActions` shows approve/reject buttons for pending clips
- [ ] `ClipQAActions` shows only status badge for decided clips
- [ ] `ClipRejectionDialog` requires reason field before submit
- [ ] `ClipRejectionDialog` calls onSubmit with reason and notes
- [ ] `ResumeFromDialog` shows correct discard count in confirmation text
- [ ] `ImportClipDialog` validates file format before upload
- [ ] All tests pass with `pnpm test`

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260301000029_add_qa_columns_to_scene_video_versions.sql` | Migration adding QA columns |
| `apps/backend/crates/db/src/models/scene_video_version.rs` | Extended model with QA fields and new DTOs |
| `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs` | Extended repo with QA update and batch soft-delete |
| `apps/backend/crates/db/src/repositories/segment_repo.rs` | New `soft_delete_after_sequence` method |
| `apps/backend/crates/api/src/handlers/scene_video_version.rs` | New approve, reject, resume-from handlers; modified set_final |
| `apps/backend/crates/api/src/routes/scene.rs` | Three new routes added to version router |
| `apps/frontend/src/features/scenes/types.ts` | TypeScript types for clip management |
| `apps/frontend/src/features/scenes/hooks/useClipManagement.ts` | TanStack Query hooks |
| `apps/frontend/src/features/scenes/ClipGallery.tsx` | Main gallery component |
| `apps/frontend/src/features/scenes/ClipCard.tsx` | Individual clip card |
| `apps/frontend/src/features/scenes/ClipQAActions.tsx` | Approve/reject action buttons |
| `apps/frontend/src/features/scenes/ClipRejectionDialog.tsx` | Rejection reason dialog |
| `apps/frontend/src/features/scenes/ResumeFromDialog.tsx` | Resume-from confirmation dialog |
| `apps/frontend/src/features/scenes/ImportClipDialog.tsx` | External clip import dialog |
| `apps/backend/crates/api/tests/clip_qa_tests.rs` | Backend integration tests |
| `apps/frontend/src/features/scenes/__tests__/*.test.tsx` | Frontend component tests |

---

## Dependencies

### Existing Components to Reuse
- `SceneVideoVersion` model from `crates/db/src/models/scene_video_version.rs`
- `SceneVideoVersionRepo` from `crates/db/src/repositories/scene_video_version_repo.rs`
- `SegmentRepo::get_last_completed` from `crates/db/src/repositories/segment_repo.rs`
- `SegmentRepo::soft_delete` from `crates/db/src/repositories/segment_repo.rs`
- `SceneRepo::update_generation_state` from `crates/db/src/repositories/scene_repo.rs`
- `AuthUser` extractor from `crates/api/src/middleware/auth.rs`
- `AppError`, `AppResult` from `crates/api/src/error.rs`
- `CoreError` from `crates/core/src/error.rs`
- `DataResponse` from `crates/api/src/response.rs`
- `RejectionDialog` component pattern from `apps/frontend/src/features/review/RejectionDialog.tsx`
- `useDecisionMutation` pattern from `apps/frontend/src/features/review/hooks/use-review.ts`
- `api` client from `apps/frontend/src/lib/api.ts`
- Query key factory pattern from `apps/frontend/src/features/segment-comparison/hooks/use-segment-versions.ts`

### New Infrastructure Needed
- `SegmentRepo::soft_delete_after_sequence` (batch soft-delete segments after a sequence index)
- `SceneVideoVersionRepo::soft_delete_after_version` (batch soft-delete versions after a version number)

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migration -- Task 1.1
2. Phase 2: Backend Model & Repository -- Tasks 2.1, 2.2, 2.3
3. Phase 3: Backend API Handlers & Routes -- Tasks 3.1, 3.2, 3.3, 3.4, 3.5
4. Phase 4: Frontend Types & Hooks -- Tasks 4.1, 4.2
5. Phase 5: Frontend Clip Gallery & Card -- Tasks 5.1, 5.2, 5.3
6. Phase 6: Frontend Dialogs -- Tasks 6.1, 6.2, 6.3

**MVP Success Criteria:**
- Users can view all clips for a scene in a gallery
- Users can approve or reject clips with reason
- Users can resume generation from the last approved clip
- Users can import external video files as clips
- QA status is visible at a glance via color-coded badges

### Post-MVP Enhancements
1. Phase 7: Integration & Testing -- Tasks 7.1, 7.2
2. Side-by-side clip comparison (PRD-121 Req 2.1)
3. Batch clip QA with keyboard shortcuts (PRD-121 Req 2.2)
4. Auto-extracted thumbnails (PRD-121 Req 2.3)
5. Duration auto-detection for imports (PRD-121 Req 2.4)

---

## Notes

1. **Migration ordering:** The migration timestamp `20260301000029` follows the last existing migration (`20260301000028_cloud_cost_events.sql`). Adjust if other migrations are added before this one.
2. **QA status on imports:** Per PRD open question #3, imported clips default to `qa_status = 'pending'`. The existing `import_video` handler does not need modification since the DB column defaults to `'pending'`.
3. **Resume-from and file cleanup:** Per PRD open question #4, soft-deleted clip video files are left on disk (consistent with PRD-109 soft-delete behavior). No file system cleanup in resume-from.
4. **Rejection reasons:** MVP uses freeform text. Post-MVP may introduce predefined categories (PRD open question #1).
5. **COALESCE limitation:** The repo's `update` method uses COALESCE, which means you cannot set a nullable field back to NULL via update. For QA fields this is acceptable: once reviewed, the fields stay populated. If re-review is needed, the status changes but reviewer/timestamp should still be recorded.
6. **set_final guard:** Task 3.4 adds validation to prevent marking rejected clips as final. This requires reading the version before calling `set_final` in the repo -- the handler already does a `find_by_id` check.

---

## Version History

- **v1.0** (2026-02-28): Initial task list creation from PRD-121

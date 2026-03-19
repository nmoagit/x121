# Task List: Output Format Profile Management

**PRD Reference:** `design/prds/137-prd-output-format-profile-management.md`
**Scope:** Admin page for output format profile CRUD, platform-wide default, project-level override, ExportPanel auto-selection, seed profiles.

## Overview

Output format profiles already have full CRUD (PRD-039). This PRD adds: an `is_default` flag with a unique partial index, a project-level override column, an admin page for centralized management, ExportPanel auto-selection, and seed profiles. The existing `FormatProfileManager` component is adapted for the admin page and removed from the project Delivery tab.

### What Already Exists
- `OutputFormatProfile` model, repo, and CRUD handlers (backend)
- `FormatProfileManager` component with create/edit/delete UI (frontend)
- `useOutputFormatProfiles`, `useCreateProfile`, `useUpdateProfile`, `useDeleteProfile` hooks
- `ExportPanel` component with profile dropdown
- Admin route infrastructure with `AdminGuard`
- `Project` model with `UpdateProject` DTO

### What We're Building
1. Migration: `is_default` column + seed profiles + project FK
2. Backend: `set_default` repo method + API endpoint + project model update
3. Frontend: Admin page, nav entry, ExportPanel auto-selection, project settings dropdown
4. Cleanup: Remove `FormatProfileManager` from project Delivery tab

### Key Design Decisions
1. `is_default` lives on the `output_format_profiles` table with a unique partial index — single source of truth
2. Project override via `default_format_profile_id` FK on `projects` — nullable, falls back to platform default
3. ExportPanel cascade: project default → platform default → first alphabetically

---

## Phase 1: Database Migration & Seed Data

### Task 1.1: Add `is_default` column and seed profiles
**File:** `apps/db/migrations/20260319000001_output_format_profile_defaults.sql`

Add the default flag to `output_format_profiles` and seed 3 standard profiles.

```sql
-- Add is_default column
ALTER TABLE output_format_profiles
    ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false;

-- Only one profile can be default at a time
CREATE UNIQUE INDEX uq_output_format_profiles_default
    ON output_format_profiles (is_default) WHERE is_default = true;

-- Seed standard profiles (idempotent)
INSERT INTO output_format_profiles (name, description, resolution, codec, container, bitrate_kbps, framerate, is_default)
VALUES
    ('720p H.264',  'Standard 720p delivery',  '1280x720',  'h264', 'mp4', 5000,  30, false),
    ('1080p H.264', 'Standard 1080p delivery', '1920x1080', 'h264', 'mp4', 8000,  30, true),
    ('4K H.264',    'Ultra HD delivery',       '3840x2160', 'h264', 'mp4', 20000, 30, false)
ON CONFLICT (name) DO NOTHING;
```

**Acceptance Criteria:**
- [x] Migration adds `is_default BOOLEAN NOT NULL DEFAULT false` column
- [x] Unique partial index prevents multiple defaults
- [x] 3 seed profiles created: 720p, 1080p (default), 4K
- [x] Seed is idempotent via `ON CONFLICT DO NOTHING`
- [x] `sqlx migrate run` succeeds

### Task 1.2: Add `default_format_profile_id` to projects
**File:** `apps/db/migrations/20260319000001_output_format_profile_defaults.sql` (same migration)

Add the project-level override FK.

```sql
-- Project-level default profile override (nullable = inherit platform default)
ALTER TABLE projects
    ADD COLUMN default_format_profile_id BIGINT
    REFERENCES output_format_profiles(id) ON DELETE SET NULL;
```

**Acceptance Criteria:**
- [x] `projects.default_format_profile_id` is nullable BIGINT
- [x] FK references `output_format_profiles(id)` with `ON DELETE SET NULL`
- [x] Existing projects get `NULL` (inherit platform default)

---

## Phase 2: Backend Model & API Updates

### Task 2.1: Update `OutputFormatProfile` model
**File:** `apps/backend/crates/db/src/models/output_format_profile.rs`

Add `is_default` field to the struct and update DTOs.

**Acceptance Criteria:**
- [x] `OutputFormatProfile` struct has `pub is_default: bool`
- [x] Field is positioned after `extra_ffmpeg_args`, before timestamps
- [x] `CreateOutputFormatProfile` does NOT include `is_default` (managed separately)
- [x] `UpdateOutputFormatProfile` does NOT include `is_default` (managed separately)

### Task 2.2: Update `OutputFormatProfileRepo` COLUMNS and add `set_default`
**File:** `apps/backend/crates/db/src/repositories/output_format_profile_repo.rs`

Add `is_default` to the COLUMNS constant and add a transactional `set_default` method.

```rust
pub async fn set_default(pool: &PgPool, profile_id: DbId) -> Result<OutputFormatProfile, sqlx::Error> {
    let mut tx = pool.begin().await?;
    // Clear existing default
    sqlx::query("UPDATE output_format_profiles SET is_default = false WHERE is_default = true")
        .execute(&mut *tx).await?;
    // Set new default
    let query = format!(
        "UPDATE output_format_profiles SET is_default = true, updated_at = NOW() \
         WHERE id = $1 RETURNING {COLUMNS}"
    );
    let profile = sqlx::query_as::<_, OutputFormatProfile>(&query)
        .bind(profile_id)
        .fetch_one(&mut *tx).await?;
    tx.commit().await?;
    Ok(profile)
}

pub async fn find_default(pool: &PgPool) -> Result<Option<OutputFormatProfile>, sqlx::Error> {
    let query = format!(
        "SELECT {COLUMNS} FROM output_format_profiles WHERE is_default = true"
    );
    sqlx::query_as::<_, OutputFormatProfile>(&query)
        .fetch_optional(pool).await
}
```

**Acceptance Criteria:**
- [x] `COLUMNS` constant includes `is_default`
- [x] `set_default(pool, id)` clears old default and sets new in a transaction
- [x] `find_default(pool)` returns the current default profile or `None`
- [x] `cargo check` passes

### Task 2.3: Add `set-default` API endpoint
**File:** `apps/backend/crates/api/src/handlers/delivery.rs`
**File:** `apps/backend/crates/api/src/routes/delivery.rs`

Add handler and route for `PUT /output-format-profiles/{id}/set-default`.

```rust
pub async fn set_profile_default(
    State(state): State<AppState>,
    Path(profile_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let profile = OutputFormatProfileRepo::set_default(&state.pool, profile_id).await?;
    Ok(Json(DataResponse { data: profile }))
}
```

**Acceptance Criteria:**
- [x] `PUT /output-format-profiles/{id}/set-default` endpoint exists
- [x] Returns updated profile with `is_default: true`
- [x] Previous default is cleared atomically
- [x] Returns 404 if profile ID doesn't exist
- [x] Route registered in `delivery_routes()`

### Task 2.4: Update `Project` model for `default_format_profile_id`
**File:** `apps/backend/crates/db/src/models/project.rs`
**File:** `apps/backend/crates/db/src/repositories/project_repo.rs`

Add the new column to the Project struct, COLUMNS, and UpdateProject DTO.

**Acceptance Criteria:**
- [x] `Project` struct has `pub default_format_profile_id: Option<DbId>`
- [x] `UpdateProject` DTO has `pub default_format_profile_id: Option<Option<DbId>>` (double-option for explicit null)
- [x] `COLUMNS` constant updated
- [x] `update()` repo method handles the new field via COALESCE
- [x] `cargo check` passes

---

## Phase 3: Frontend — Admin Page

### Task 3.1: Update frontend `OutputFormatProfile` type
**File:** `apps/frontend/src/features/delivery/types.ts`

Add `is_default` to the TypeScript interface.

**Acceptance Criteria:**
- [x] `OutputFormatProfile` interface has `is_default: boolean`
- [x] `CreateOutputFormatProfile` does NOT include `is_default`
- [x] `npx tsc --noEmit` passes

### Task 3.2: Add `useSetProfileDefault` hook
**File:** `apps/frontend/src/features/delivery/hooks/use-delivery.ts`
**File:** `apps/frontend/src/features/delivery/index.ts`

Add a mutation hook for the set-default endpoint.

```typescript
export function useSetProfileDefault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId: number) =>
      api.put<OutputFormatProfile>(`/output-format-profiles/${profileId}/set-default`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.profiles });
    },
  });
}
```

**Acceptance Criteria:**
- [x] `useSetProfileDefault()` hook calls `PUT /output-format-profiles/{id}/set-default`
- [x] Invalidates profiles query on success
- [x] Exported from `features/delivery/index.ts`

### Task 3.3: Create admin Output Profiles page
**File:** `apps/frontend/src/app/pages/OutputProfilesPage.tsx`

Adapt `FormatProfileManager` into a standalone admin page with default selection.

**Acceptance Criteria:**
- [x] Page component `OutputProfilesPage` exported
- [x] Displays all profiles in a table: name, resolution, codec, container, bitrate, framerate, default badge
- [x] "Default" badge (`variant="info"`, `size="sm"`) shown on the default profile
- [x] "Set as Default" button on non-default profiles
- [x] Create, edit, delete functionality (reuse existing hooks)
- [x] Uses `useSetPageTitle("Output Profiles")`
- [x] Uses `size="sm"` on all inputs/selects

### Task 3.4: Add admin route and navigation entry
**File:** `apps/frontend/src/app/router.tsx`
**File:** `apps/frontend/src/app/navigation.ts`

Register the route and add nav item.

```typescript
// router.tsx
const outputProfilesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/output-profiles",
  component: lazyRouteComponent(() =>
    import("@/app/pages/OutputProfilesPage").then((m) => ({ default: m.OutputProfilesPage })),
  ),
});
```

**Acceptance Criteria:**
- [x] Route at `/admin/output-profiles` behind `AdminGuard`
- [x] Admin navigation has "Output Profiles" entry with appropriate icon
- [x] Route added to `adminLayoutRoute.addChildren([...])`
- [x] Page loads correctly via navigation

---

## Phase 4: Frontend — Integration

### Task 4.1: Update ExportPanel auto-selection
**File:** `apps/frontend/src/features/delivery/ExportPanel.tsx`

Add `projectDefaultProfileId` prop and implement the cascade: project default → platform default → first alphabetically.

```typescript
interface ExportPanelProps {
  projectId: number;
  characters?: Array<{ id: number; name: string }>;
  activeExportStatus?: number | null;
  validationPassed?: boolean;
  /** Project-level default profile ID override. */
  projectDefaultProfileId?: number | null;
}
```

Auto-select logic in a `useEffect`:
```typescript
useEffect(() => {
  if (selectedProfileId || profiles.length === 0) return;
  const projectDefault = projectDefaultProfileId
    ? profiles.find((p) => p.id === projectDefaultProfileId)
    : null;
  const platformDefault = profiles.find((p) => p.is_default);
  const fallback = profiles[0]; // already sorted alphabetically by name
  const target = projectDefault ?? platformDefault ?? fallback;
  if (target) setSelectedProfileId(String(target.id));
}, [profiles, projectDefaultProfileId]);
```

**Acceptance Criteria:**
- [x] ExportPanel accepts optional `projectDefaultProfileId` prop
- [x] Auto-selects project default if set and profile exists
- [x] Falls back to platform default (`is_default === true`)
- [x] Falls back to first profile alphabetically
- [x] User can still manually change selection
- [x] Does not override if user already selected a profile

### Task 4.2: Add default profile dropdown to Project Settings tab
**File:** `apps/frontend/src/features/projects/tabs/ProjectConfigTab.tsx`

Add a "Default Output Profile" dropdown to the project settings.

**Acceptance Criteria:**
- [x] Dropdown shows all profiles + "Use platform default" option (value `""`)
- [x] Current value from `project.default_format_profile_id` is selected
- [x] Changing the dropdown calls `useUpdateProject` with `{ default_format_profile_id }`
- [x] Uses `size="sm"` select

### Task 4.3: Wire project default to ExportPanel in ProjectDeliveryTab
**File:** `apps/frontend/src/features/projects/tabs/ProjectDeliveryTab.tsx`

Pass the project's `default_format_profile_id` to ExportPanel.

**Acceptance Criteria:**
- [x] `ProjectDeliveryTab` reads `project.default_format_profile_id`
- [x] Passes it to `ExportPanel` as `projectDefaultProfileId`

### Task 4.4: Update frontend `Project` type
**File:** `apps/frontend/src/features/projects/types.ts`

Add `default_format_profile_id` to the Project and UpdateProject types.

**Acceptance Criteria:**
- [x] `Project` interface has `default_format_profile_id: number | null`
- [x] `UpdateProject` interface has `default_format_profile_id?: number | null`
- [x] `npx tsc --noEmit` passes

### Task 4.5: Remove FormatProfileManager from ProjectDeliveryTab
**File:** `apps/frontend/src/features/projects/tabs/ProjectDeliveryTab.tsx`

Remove the profile manager section — profiles are now managed from admin.

**Acceptance Criteria:**
- [x] `FormatProfileManager` import removed
- [x] Profile manager `<section>` removed from JSX
- [x] Delivery tab retains: ValidationReport, ExportPanel, DeliveryDestinationManager, status table, logs, export history
- [x] `npx tsc --noEmit` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260319000001_output_format_profile_defaults.sql` | Migration: is_default column, project FK, seed profiles |
| `apps/backend/crates/db/src/models/output_format_profile.rs` | Add `is_default` to Rust model |
| `apps/backend/crates/db/src/repositories/output_format_profile_repo.rs` | Add `set_default`, `find_default` methods |
| `apps/backend/crates/api/src/handlers/delivery.rs` | Add `set_profile_default` handler |
| `apps/backend/crates/api/src/routes/delivery.rs` | Register set-default route |
| `apps/backend/crates/db/src/models/project.rs` | Add `default_format_profile_id` |
| `apps/backend/crates/db/src/repositories/project_repo.rs` | Update COLUMNS and update method |
| `apps/frontend/src/features/delivery/types.ts` | Add `is_default` to TS type |
| `apps/frontend/src/features/delivery/hooks/use-delivery.ts` | Add `useSetProfileDefault` hook |
| `apps/frontend/src/features/delivery/index.ts` | Export new hook |
| `apps/frontend/src/app/pages/OutputProfilesPage.tsx` | New admin page |
| `apps/frontend/src/app/router.tsx` | Register admin route |
| `apps/frontend/src/app/navigation.ts` | Add admin nav entry |
| `apps/frontend/src/features/delivery/ExportPanel.tsx` | Auto-selection logic |
| `apps/frontend/src/features/projects/tabs/ProjectConfigTab.tsx` | Project default dropdown |
| `apps/frontend/src/features/projects/tabs/ProjectDeliveryTab.tsx` | Wire default + remove FormatProfileManager |
| `apps/frontend/src/features/projects/types.ts` | Add `default_format_profile_id` |

---

## Dependencies

### Existing Components to Reuse
- `FormatProfileManager` from `features/delivery/` — adapt for admin page
- `useOutputFormatProfiles`, `useCreateProfile`, `useUpdateProfile`, `useDeleteProfile` from `features/delivery/hooks/use-delivery.ts`
- `OutputFormatProfileRepo` from `crates/db/src/repositories/`
- CRUD handlers from `crates/api/src/handlers/delivery.rs`
- `AdminGuard` and admin route pattern from `router.tsx`
- `Badge`, `Button`, `Input`, `Select` design system components

### New Infrastructure Needed
- `set_default` / `find_default` repo methods
- `set_profile_default` API handler + route
- `OutputProfilesPage` admin page component
- `useSetProfileDefault` mutation hook

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database — Tasks 1.1-1.2
2. Phase 2: Backend — Tasks 2.1-2.4
3. Phase 3: Admin Page — Tasks 3.1-3.4
4. Phase 4: Integration — Tasks 4.1-4.5

**MVP Success Criteria:**
- Admin can manage profiles and set a default at `/admin/output-profiles`
- Projects can override the default in Settings tab
- ExportPanel auto-selects the correct default
- 3 seed profiles available out of the box
- FormatProfileManager removed from project Delivery tab

---

## Notes

1. The migration combines `is_default` column, seed data, and project FK in a single file for atomic deployment
2. `set_default` uses a transaction to clear-then-set, avoiding race conditions with the unique partial index
3. ExportPanel auto-selection runs once on mount — it does not override user's manual selection
4. `ON CONFLICT (name) DO NOTHING` on seeds means re-running migration is safe if profiles already exist

---

## Version History

- **v1.0** (2026-03-19): Initial task list creation from PRD-137

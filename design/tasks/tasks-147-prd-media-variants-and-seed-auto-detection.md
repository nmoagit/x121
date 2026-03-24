# Task List: Media Variants & Seed Auto-Detection

**PRD Reference:** `design/prds/147-prd-media-variants-and-seed-auto-detection.md`
**Scope:** Rename image_variants → media_variants across entire stack, add media_kind/duration support, replace seed drop zones with variant picker, auto-assign seeds.

## Overview

Part A (Phases 1-4) is a mechanical rename following the proven PRD-140 pattern. Part B (Phases 5-7) adds the media variant picker and auto-detection to the Seeds tab. The rename must complete first since Part B references the new type names.

### What Already Exists
- PRD-140 rename migration pattern (`20260322100001_rename_character_to_avatar.sql`)
- `image_variants` table with variants, thumbnails, approval workflow
- `features/images/` frontend directory with types, hooks, utils, components
- Seeds tab (PRD-146) with scene_type × track slots
- Pipeline `seed_slots` JSONB with `track_affinity` field
- `variantThumbnailUrl()` utility for thumbnail URLs

### What We're Building
1. Database migration renaming 4 tables + FK columns + 2 new columns
2. Backend rename across 58 files (5 file renames)
3. API path rename with media_kind filter
4. Frontend rename across 55 files (directory + type renames)
5. MediaVariantPicker component for Seeds tab
6. Auto-assign endpoint with dry-run
7. Auto-assign UI with preview modal

### Key Design Decisions
1. Follow PRD-140 pattern exactly — proven at scale (660+ references)
2. `media_kind` defaults to 'image' so all existing data works unchanged
3. Auto-detection uses `track_affinity` from pipeline seed_slots
4. Picker shows thumbnails with hero-first sorting, user makes final choice

---

## Phase 1: Database Migration

### Task 1.1: Create rename migration
**File:** `apps/db/migrations/20260325000005_rename_image_to_media.sql`

Single transactional migration renaming 4 tables, all FK columns, and adding new columns. Follow the PRD-140 migration pattern at `apps/db/migrations/20260322100001_rename_character_to_avatar.sql`.

```sql
BEGIN;

-- Phase 1: Rename tables
ALTER TABLE source_images RENAME TO source_media;
ALTER TABLE derived_images RENAME TO derived_media;
ALTER TABLE image_variants RENAME TO media_variants;
ALTER TABLE image_variant_statuses RENAME TO media_variant_statuses;

-- Phase 2: Rename FK columns
ALTER TABLE derived_media RENAME COLUMN source_image_id TO source_media_id;
ALTER TABLE media_variants RENAME COLUMN source_image_id TO source_media_id;
ALTER TABLE media_variants RENAME COLUMN derived_image_id TO derived_media_id;
ALTER TABLE avatar_media_assignments RENAME COLUMN image_variant_id TO media_variant_id;
ALTER TABLE scenes RENAME COLUMN image_variant_id TO media_variant_id;
ALTER TABLE image_quality_scores RENAME COLUMN source_image_id TO source_media_id;
ALTER TABLE detected_faces RENAME COLUMN source_image_id TO source_media_id;
ALTER TABLE embedding_history RENAME COLUMN image_variant_id TO media_variant_id;

-- Phase 3: Add new columns
ALTER TABLE source_media ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'image';
ALTER TABLE source_media ADD COLUMN duration_secs NUMERIC;
ALTER TABLE media_variants ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'image';
ALTER TABLE media_variants ADD COLUMN duration_secs NUMERIC;

ALTER TABLE source_media ADD CONSTRAINT ck_source_media_media_kind
    CHECK (media_kind IN ('image', 'video', 'audio'));
ALTER TABLE media_variants ADD CONSTRAINT ck_media_variants_media_kind
    CHECK (media_kind IN ('image', 'video', 'audio'));

COMMIT;
```

**Acceptance Criteria:**
- [ ] All 4 tables renamed
- [ ] All FK columns renamed across all referencing tables
- [ ] `media_kind` and `duration_secs` columns added to `source_media` and `media_variants`
- [ ] CHECK constraints on `media_kind`
- [ ] Migration runs successfully
- [ ] Existing data unmodified

---

## Phase 2: Backend Rename

### Task 2.1: Rename backend model and repo files
**Files to rename:**
- `crates/db/src/models/image.rs` → `crates/db/src/models/media.rs`
- `crates/db/src/repositories/source_image_repo.rs` → `crates/db/src/repositories/source_media_repo.rs`
- `crates/db/src/repositories/derived_image_repo.rs` → `crates/db/src/repositories/derived_media_repo.rs`
- `crates/db/src/repositories/image_variant_repo.rs` → `crates/db/src/repositories/media_variant_repo.rs`
- `crates/api/src/handlers/image_variant.rs` → `crates/api/src/handlers/media_variant.rs`

Update `mod.rs` files to reference new module names.

**Acceptance Criteria:**
- [ ] All 5 files renamed
- [ ] `models/mod.rs` updated
- [ ] `repositories/mod.rs` updated (declarations + pub use exports)
- [ ] `handlers/mod.rs` updated
- [ ] `routes/mod.rs` handler references updated

### Task 2.2: Rename Rust structs and types across backend
Mechanical find-replace across all 58 backend files:

| Old | New |
|-----|-----|
| `SourceImage` | `SourceMedia` |
| `CreateSourceImage` | `CreateSourceMedia` |
| `DerivedImage` | `DerivedMedia` |
| `CreateDerivedImage` | `CreateDerivedMedia` |
| `ImageVariant` | `MediaVariant` |
| `CreateImageVariant` | `CreateMediaVariant` |
| `UpdateImageVariant` | `UpdateMediaVariant` |
| `SourceImageRepo` | `SourceMediaRepo` |
| `DerivedImageRepo` | `DerivedMediaRepo` |
| `ImageVariantRepo` | `MediaVariantRepo` |
| `source_image_id` | `source_media_id` |
| `derived_image_id` | `derived_media_id` |
| `image_variant_id` | `media_variant_id` |
| `source_images` (SQL) | `source_media` |
| `derived_images` (SQL) | `derived_media` |
| `image_variants` (SQL) | `media_variants` |
| `image_variant_statuses` (SQL) | `media_variant_statuses` |

**Acceptance Criteria:**
- [ ] All struct/type renames applied
- [ ] All SQL table/column references updated
- [ ] `media_kind: String` and `duration_secs: Option<f64>` fields added to `SourceMedia` and `MediaVariant` structs
- [ ] Same fields added to Create DTOs (with Option defaults)
- [ ] COLUMNS constants in repos updated
- [ ] `cargo check` passes with zero errors
- [ ] `grep -r "ImageVariant\|SourceImage\|DerivedImage\|image_variant\|source_image\|derived_image" apps/backend/crates/ --include="*.rs"` returns zero results (excluding comments/migration refs)

---

## Phase 3: API Endpoint Rename

### Task 3.1: Rename API routes and add media_kind filter
**Files:** `crates/api/src/routes/mod.rs`, route files

Rename all API paths:
- `/image-variants` → `/media-variants`
- `/source-images` → `/source-media`
- `/derived-images` → `/derived-media`

Add `media_kind` optional query parameter to list/browse endpoints.

**Acceptance Criteria:**
- [ ] All API paths renamed in route definitions
- [ ] `media_kind` filter parameter on list and browse endpoints
- [ ] Browse endpoints filter by `media_kind` when provided
- [ ] `cargo check` passes

---

## Phase 4: Frontend Rename

### Task 4.1: Rename frontend directory and files
**Directory:** `src/features/images/` → `src/features/media/`

Rename hook files:
- `use-image-variants.ts` → `use-media-variants.ts`

**Acceptance Criteria:**
- [ ] Directory renamed
- [ ] Hook files renamed
- [ ] All imports across ~55 files updated

### Task 4.2: Rename TypeScript types and identifiers
Mechanical find-replace across all frontend files:

| Old | New |
|-----|-----|
| `ImageVariant` | `MediaVariant` |
| `ImageVariantBrowseItem` | `MediaVariantBrowseItem` |
| `ImageVariantBrowsePage` | `MediaVariantBrowsePage` |
| `ImageVariantBrowseParams` | `MediaVariantBrowseParams` |
| `ImageVariantStatusId` | `MediaVariantStatusId` |
| `IMAGE_VARIANT_STATUS_LABEL` | `MEDIA_VARIANT_STATUS_LABEL` |
| `imageVariantKeys` | `mediaVariantKeys` |
| `useImageVariants` | `useMediaVariants` |
| `useImageVariantsBrowse` | `useMediaVariantsBrowse` |
| `useBrowseApproveVariant` | `useBrowseApproveVariant` (unchanged — already generic) |
| `variantImageUrl` | `variantMediaUrl` |
| `variantThumbnailUrl` | `variantThumbnailUrl` (unchanged — already generic) |
| `/image-variants/` | `/media-variants/` (API paths in hooks) |
| `/source-images/` | `/source-media/` (API paths) |

Add `media_kind` and `duration_secs` to `MediaVariant` type.

**Acceptance Criteria:**
- [ ] All type renames applied
- [ ] API paths in hooks updated
- [ ] `MediaVariant` type has `media_kind: 'image' | 'video' | 'audio'` and `duration_secs: number | null`
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] No references to old names remain

### Task 4.3: Rename nav and page
**Files:** Navigation files, `ImagesPage.tsx` → `MediaPage.tsx`

- Nav item "Images" → "Media"
- Page component renamed
- Add `media_kind` filter dropdown to the Media page
- Router path updated

**Acceptance Criteria:**
- [ ] Nav says "Media" in both global and pipeline sidebars
- [ ] Page renamed to `MediaPage`
- [ ] Router references updated
- [ ] `media_kind` filter dropdown on Media page (All / Images / Videos / Audio)

---

## Phase 5: Media Variant Picker

### Task 5.1: MediaVariantPicker component
**File:** `apps/frontend/src/features/avatars/components/MediaVariantPicker.tsx`

Thumbnail grid of existing approved variants filtered by track affinity. Shows hero-first, most-recent sorting. Highlights auto-suggested best match.

Props:
```typescript
interface MediaVariantPickerProps {
  avatarId: number;
  trackName: string; // track affinity for filtering
  selectedVariantId: number | null;
  onSelect: (variantId: number) => void;
  onClear?: () => void;
}
```

**Acceptance Criteria:**
- [ ] Fetches variants for avatar filtered by `variant_type` matching `trackName`
- [ ] Shows thumbnail grid using `variantThumbnailUrl()`
- [ ] Hero variants shown first, then most recent approved
- [ ] First candidate auto-highlighted as suggestion
- [ ] Clicking thumbnail calls `onSelect`
- [ ] Currently selected variant has green border
- [ ] Empty state: falls back to `SeedDataDropSlot` when no variants exist
- [ ] "Upload New..." link for adding new variants

### Task 5.2: Update Seeds tab to use MediaVariantPicker
**File:** `apps/frontend/src/features/avatars/tabs/AvatarSeedsTab.tsx`

Replace drop zones in `SeedSlotCard` with `MediaVariantPicker`. Each scene_type × track slot shows a picker filtered by that track's name.

**Acceptance Criteria:**
- [ ] Each seed slot card shows `MediaVariantPicker` instead of drop zone
- [ ] Picker filtered by track name (e.g., "Clothed" slot shows clothed variants)
- [ ] Selecting a variant creates/updates the `avatar_media_assignment`
- [ ] Clearing removes the assignment
- [ ] Assigned slots show selected thumbnail with green indicator

---

## Phase 6: Server-Side Auto-Assign

### Task 6.1: Auto-assign endpoint
**File:** `apps/backend/crates/api/src/handlers/media_management.rs`

`POST /api/v1/avatars/:id/actions/auto-assign-seeds` with dry_run support.

**Acceptance Criteria:**
- [ ] Loads all seed slots for avatar's scene_type × track combos
- [ ] For each unassigned slot: finds best variant by track affinity (hero first, then most recent approved)
- [ ] Creates `avatar_media_assignments` records
- [ ] `dry_run: true` returns preview without persisting
- [ ] `overwrite_existing: true` replaces all assignments
- [ ] Response includes assigned/skipped/total counts with reasons
- [ ] Route registered

---

## Phase 7: Auto-Assign UI

### Task 7.1: Auto-assign button and preview modal
**File:** `apps/frontend/src/features/avatars/tabs/AvatarSeedsTab.tsx`

"Auto-assign all" button in Seeds tab toolbar. Calls dry-run first, shows preview modal, then persists on confirm.

**Acceptance Criteria:**
- [ ] "Auto-assign all" button in Seeds tab header
- [ ] Button disabled when all slots assigned
- [ ] Clicking calls dry-run endpoint
- [ ] Preview modal shows thumbnails of suggested assignments per slot
- [ ] Unresolved slots shown with reason
- [ ] Confirm persists assignments and refreshes tab
- [ ] Success notification shows count

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260325000005_rename_image_to_media.sql` | Table + column rename migration |
| `apps/backend/crates/db/src/models/media.rs` | Renamed from image.rs |
| `apps/backend/crates/db/src/repositories/media_variant_repo.rs` | Renamed from image_variant_repo.rs |
| `apps/backend/crates/api/src/handlers/media_variant.rs` | Renamed from image_variant.rs |
| `apps/frontend/src/features/media/` | Renamed from features/images/ |
| `apps/frontend/src/features/avatars/components/MediaVariantPicker.tsx` | New picker component |
| `apps/frontend/src/features/avatars/tabs/AvatarSeedsTab.tsx` | Updated with picker + auto-assign |
| `apps/backend/crates/api/src/handlers/media_management.rs` | Auto-assign endpoint |

---

## Dependencies

### Existing Components to Reuse
- PRD-140 rename migration pattern
- `variantThumbnailUrl()` for thumbnails
- `SeedDataDropSlot` as fallback for empty states
- `useAvatarSeedSummary` hook from PRD-146
- Pipeline `seed_slots[].track_affinity` for matching

---

## Implementation Order

### MVP
1. Phase 1: Database Migration — Task 1.1
2. Phase 2: Backend Rename — Tasks 2.1-2.2
3. Phase 3: API Rename — Task 3.1
4. Phase 4: Frontend Rename — Tasks 4.1-4.3
5. Phase 5: Media Variant Picker — Tasks 5.1-5.2
6. Phase 6: Auto-Assign Endpoint — Task 6.1
7. Phase 7: Auto-Assign UI — Task 7.1

**MVP Success Criteria:**
- Zero references to old "image_variant" names in codebase
- Media page shows all media types with kind filter
- Seeds tab shows variant picker with thumbnails per slot
- Auto-assign fills empty slots in one click

---

## Notes

1. **Phase 1-4 is mechanical** — follow PRD-140 pattern exactly, no logic changes
2. **Commit after Phase 4** (rename complete) before starting Phase 5 (new features)
3. **The rename does not modify existing data** — all rows get `media_kind = 'image'` by default
4. **Backend must be rebuilt after Phase 2** before frontend can test against new API paths

---

## Version History

- **v1.0** (2026-03-24): Initial task list creation from PRD-147

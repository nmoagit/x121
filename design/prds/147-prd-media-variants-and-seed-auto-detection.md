# PRD-147: Media Variants & Seed Auto-Detection

**Document ID:** 147-prd-media-variants-and-seed-auto-detection
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-03-24
**Last Updated:** 2026-03-24

---

## 1. Introduction/Overview

The platform's media system was built around images — `source_images`, `derived_images`, `image_variants`, and `image_variant_statuses` — reflecting the original single-pipeline, image-only world. With the multi-pipeline architecture (PRD-138) and dynamic generation seeds (PRD-146), the platform now handles video, audio, and other media types as first-class generation inputs. The "image" naming is no longer accurate and creates confusion when developers work with video seeds or audio references.

This PRD performs two related changes:

**Part A: Image-to-Media Rename.** A full rename of the three core media tables (`source_images` → `source_media`, `derived_images` → `derived_media`, `image_variants` → `media_variants`) and their status table (`image_variant_statuses` → `media_variant_statuses`), plus the corresponding directory rename in the frontend (`features/images/` → `features/media/`). This follows the proven pattern from PRD-140 (character → avatar rename): one migration for the database, then mechanical find-replace across the entire backend and frontend.

**Part B: Seed Auto-Detection.** The Seeds tab (PRD-146) currently shows drop zones for file uploads into media slots. This PRD replaces those drop zones with a **media variant picker** — a thumbnail grid of existing approved variants filtered by track affinity. Auto-detection uses the pipeline's `seed_slots[].track_affinity` field to match variant types to tracks, suggesting the best candidate (hero first, then most recent approved). Users make the final choice from the suggested candidates. Both client-side preview and server-side persistence are supported, enabling a one-click "Auto-assign all" button.

Additionally, two new columns are added to the media tables: `media_kind` (image/video/audio) for filtering in the UI, and `duration_secs` for video/audio assets.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-140** (Character to Avatar Rename) — Proven rename pattern: 1 migration + mechanical find-replace across stack
- **PRD-146** (Dynamic Generation Seeds) — Media slots, avatar media assignments, Seeds tab, seed_slots with track_affinity
- **PRD-21** (Source Image Management & Variant Generation) — Created the original image tables being renamed
- **PRD-138** (Multi-Pipeline Architecture) — Pipeline seed_slots JSONB with track_affinity field

### Extends
- **PRD-146** — Enhances the Seeds tab from drop zones to a media variant picker with auto-detection
- **PRD-21** — Generalizes image-specific tables to support all media types

### Integrates With
- **PRD-111** (Track System) — Track affinity drives auto-detection matching
- **PRD-112** (Project Hub) — Avatar detail page Seeds tab gains picker UI
- **PRD-113** (Avatar Ingest) — Import system writes to renamed tables
- **PRD-141** (Pipeline-Scoped Imports and Storage) — Storage paths reference renamed tables

## 3. Goals

### Primary Goals

1. **Accurate naming** — All table, model, type, and directory names reflect the general "media" concept rather than "image", eliminating developer confusion.
2. **Media kind filtering** — A `media_kind` column on `source_media` and `media_variants` enables filtering by image/video/audio in the UI, with the nav showing "Media" and a kind filter dropdown.
3. **Seed auto-detection** — The Seeds tab shows thumbnail grids of existing approved variants filtered by track affinity, with auto-detection suggesting the best match for each slot.
4. **One-click auto-assign** — A server-side "Auto-assign all" endpoint resolves all unassigned slots for an avatar in one operation, using track_affinity matching.

### Secondary Goals

5. **Duration metadata** — A nullable `duration_secs` column on `source_media` and `media_variants` captures video/audio duration for display and validation.
6. **Backward compatibility** — All API endpoints continue to work during the rename via URL aliases (old paths redirect to new paths for a transition period).
7. **Zero data loss** — The rename migration is purely structural (ALTER TABLE RENAME), no data is moved or modified.

## 4. User Stories

- **As a developer**, I want the code to say "media_variant" instead of "image_variant" when I work with video seeds, so the naming matches what the entity actually represents.
- **As a content creator**, I want the nav to say "Media" and let me filter by image/video/audio, so I can quickly find the assets I need.
- **As a content creator**, I want the Seeds tab to show me thumbnail options for each slot filtered by track, so I can visually pick the right seed instead of uploading files manually.
- **As a content creator**, I want auto-detection to suggest the best variant for each slot (hero first, then most recent approved), so I can review and confirm rather than searching manually.
- **As a content creator**, I want an "Auto-assign all" button that fills every unassigned slot in one click, so I can set up seeds quickly for avatars with many slots.
- **As an admin**, I want the media table to track `media_kind` and `duration_secs`, so the system can validate that video seeds meet duration requirements and the UI can show appropriate previews.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Database Table Rename Migration

**Description:** A single migration renames all four tables and updates all FK column references. This follows the proven PRD-140 pattern — PostgreSQL automatically updates FK constraint definitions when tables/columns are renamed, so no constraint recreation is needed.

**Table Renames:**

| Old Name | New Name |
|----------|----------|
| `source_images` | `source_media` |
| `derived_images` | `derived_media` |
| `image_variants` | `media_variants` |
| `image_variant_statuses` | `media_variant_statuses` |

**Column Renames (FK references):**

| Table (new name) | Old Column | New Column |
|-------------------|------------|------------|
| `derived_media` | `source_image_id` | `source_media_id` |
| `media_variants` | `source_image_id` | `source_media_id` |
| `media_variants` | `derived_image_id` | `derived_media_id` |
| `media_variants` | `parent_variant_id` | `parent_variant_id` (unchanged) |
| `avatar_media_assignments` | `image_variant_id` | `media_variant_id` |
| `scenes` | `image_variant_id` | `media_variant_id` |
| `image_quality_scores` (table name unchanged — image-specific QA) | `source_image_id` | `source_media_id` |
| `detected_faces` | `source_image_id` | `source_media_id` |
| `embedding_history` | `image_variant_id` | `media_variant_id` |
| `generation_receipts` | `image_variant_id` | `media_variant_id` |

**New Columns (added in the same migration):**

```sql
-- media_kind: what type of media this is
ALTER TABLE source_media ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'image';
ALTER TABLE media_variants ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'image';

-- duration_secs: for video and audio assets
ALTER TABLE source_media ADD COLUMN duration_secs NUMERIC;
ALTER TABLE media_variants ADD COLUMN duration_secs NUMERIC;
```

**Acceptance Criteria:**
- [ ] All four tables renamed in a single transactional migration
- [ ] All FK columns referencing `source_image_id` renamed to `source_media_id`
- [ ] All FK columns referencing `derived_image_id` renamed to `derived_media_id`
- [ ] All FK columns referencing `image_variant_id` renamed to `media_variant_id`
- [ ] `media_kind TEXT NOT NULL DEFAULT 'image'` column added to `source_media` and `media_variants`
- [ ] `duration_secs NUMERIC` nullable column added to `source_media` and `media_variants`
- [ ] Status table `image_variant_statuses` renamed to `media_variant_statuses`
- [ ] Indexes and triggers auto-renamed by PostgreSQL (verify names in migration comments)
- [ ] Migration is wrapped in `BEGIN; ... COMMIT;` for atomicity
- [ ] Existing data is unmodified (pure structural rename)

**Technical Notes:**
- PostgreSQL `ALTER TABLE ... RENAME TO` and `ALTER TABLE ... RENAME COLUMN` are metadata-only operations — they do not rewrite table data and are essentially instant regardless of table size.
- Triggers, indexes, and constraints maintain their bindings but keep their original names. Optionally rename these for consistency, though it is not strictly necessary for correctness.
- The `image_quality_scores` table keeps its name since it is genuinely image-specific (QA scoring of visual quality). Only its FK column is renamed.

---

#### Requirement 1.2: Backend Code Rename (Mechanical Find-Replace)

**Description:** Following the PRD-140 pattern, perform a mechanical find-replace across all backend Rust files. This is NOT a refactor — it is a direct string substitution with no logic changes.

**Rename Map (Rust identifiers):**

| Old | New | Context |
|-----|-----|---------|
| `SourceImage` | `SourceMedia` | Struct name |
| `CreateSourceImage` | `CreateSourceMedia` | DTO struct |
| `UpdateSourceImage` | `UpdateSourceMedia` | DTO struct |
| `DerivedImage` | `DerivedMedia` | Struct name |
| `CreateDerivedImage` | `CreateDerivedMedia` | DTO struct |
| `UpdateDerivedImage` | `UpdateDerivedMedia` | DTO struct |
| `ImageVariant` | `MediaVariant` | Struct name |
| `CreateImageVariant` | `CreateMediaVariant` | DTO struct |
| `UpdateImageVariant` | `UpdateMediaVariant` | DTO struct |
| `source_image_id` | `source_media_id` | Field name |
| `derived_image_id` | `derived_media_id` | Field name |
| `image_variant_id` | `media_variant_id` | Field name |
| `source_images` | `source_media` | SQL table reference |
| `derived_images` | `derived_media` | SQL table reference |
| `image_variants` | `media_variants` | SQL table reference |
| `image_variant_statuses` | `media_variant_statuses` | SQL table reference |
| `source_image_repo` | `source_media_repo` | Module/file name |
| `derived_image_repo` | `derived_media_repo` | Module/file name |
| `image_variant_repo` | `media_variant_repo` | Module/file name |
| `SourceImageRepo` | `SourceMediaRepo` | Repo struct |
| `DerivedImageRepo` | `DerivedMediaRepo` | Repo struct |
| `ImageVariantRepo` | `MediaVariantRepo` | Repo struct |
| `image_variant` (handler) | `media_variant` | Handler module |
| `image.rs` (model) | `media.rs` | Model file |

**File Renames (backend):**

| Old Path | New Path |
|----------|----------|
| `crates/db/src/models/image.rs` | `crates/db/src/models/media.rs` |
| `crates/db/src/repositories/source_image_repo.rs` | `crates/db/src/repositories/source_media_repo.rs` |
| `crates/db/src/repositories/derived_image_repo.rs` | `crates/db/src/repositories/derived_media_repo.rs` |
| `crates/db/src/repositories/image_variant_repo.rs` | `crates/db/src/repositories/media_variant_repo.rs` |
| `crates/api/src/handlers/image_variant.rs` | `crates/api/src/handlers/media_variant.rs` |

**Affected Files (estimated ~56 backend files):**
The grep for `source_image|derived_image|image_variant` across `apps/backend/crates/` shows 56 files. Each needs the mechanical rename applied.

**New Model Fields:**

Add to `SourceMedia` and `MediaVariant` structs:
```rust
pub media_kind: String,       // "image" | "video" | "audio"
pub duration_secs: Option<f64>,
```

Add to `CreateSourceMedia` and `CreateMediaVariant` DTOs:
```rust
pub media_kind: Option<String>,  // Defaults to "image" if omitted
pub duration_secs: Option<f64>,
```

**Acceptance Criteria:**
- [ ] All 5 backend files renamed (model, 3 repos, 1 handler)
- [ ] All ~56 backend files updated with new identifiers
- [ ] `mod.rs` files updated to reference new module names
- [ ] All SQL strings in repo methods reference new table/column names
- [ ] `media_kind` and `duration_secs` fields added to model structs and DTOs
- [ ] `cargo check` passes with zero errors
- [ ] `cargo test` passes with zero failures
- [ ] No references to old names remain (verified by grep)

---

#### Requirement 1.3: API Endpoint Rename

**Description:** Rename API endpoints from `image-variants` to `media-variants` (and similar), matching the new table names.

**Endpoint Renames:**

| Old Path | New Path | Method |
|----------|----------|--------|
| `/api/v1/avatars/:id/image-variants` | `/api/v1/avatars/:id/media-variants` | GET, POST |
| `/api/v1/avatars/:id/image-variants/:vid` | `/api/v1/avatars/:id/media-variants/:vid` | GET, PATCH, DELETE |
| `/api/v1/avatars/:id/image-variants/:vid/approve` | `/api/v1/avatars/:id/media-variants/:vid/approve` | POST |
| `/api/v1/avatars/:id/image-variants/:vid/reject` | `/api/v1/avatars/:id/media-variants/:vid/reject` | POST |
| `/api/v1/avatars/:id/image-variants/generate` | `/api/v1/avatars/:id/media-variants/generate` | POST |
| `/api/v1/avatars/:id/source-images` | `/api/v1/avatars/:id/source-media` | GET, POST |
| `/api/v1/avatars/:id/source-images/:sid` | `/api/v1/avatars/:id/source-media/:sid` | GET, PATCH, DELETE |
| `/api/v1/avatars/:id/derived-images` | `/api/v1/avatars/:id/derived-media` | GET |
| `/api/v1/browse/image-variants` | `/api/v1/browse/media-variants` | GET |

**New Query Parameter:** All list endpoints for media gain an optional `media_kind` filter:
```
GET /api/v1/avatars/:id/media-variants?media_kind=video
GET /api/v1/browse/media-variants?media_kind=image
```

**Acceptance Criteria:**
- [ ] All endpoint paths updated in route definitions
- [ ] `media_kind` query parameter supported on all list endpoints
- [ ] Old paths return 301 redirects to new paths (transition period, removable later)
- [ ] Route module file renamed to match handler rename
- [ ] OpenAPI/swagger docs (if any) updated

---

#### Requirement 1.4: Frontend Code Rename (Mechanical Find-Replace)

**Description:** Rename the frontend `features/images/` directory to `features/media/` and update all TypeScript types, hooks, and imports. Follows the PRD-140 pattern.

**Directory Rename:**

| Old Path | New Path |
|----------|----------|
| `src/features/images/` | `src/features/media/` |

**Type Renames (TypeScript):**

| Old | New |
|-----|-----|
| `ImageVariant` | `MediaVariant` |
| `CreateImageVariantInput` | `CreateMediaVariantInput` |
| `UpdateImageVariantInput` | `UpdateMediaVariantInput` |
| `GenerateVariantsInput` | `GenerateVariantsInput` (unchanged) |
| `IMAGE_VARIANT_STATUS` | `MEDIA_VARIANT_STATUS` |
| `ImageVariantStatusId` | `MediaVariantStatusId` |
| `IMAGE_VARIANT_STATUS_LABEL` | `MEDIA_VARIANT_STATUS_LABEL` |
| `canApproveVariant` | `canApproveVariant` (unchanged — generic enough) |
| `canUnapproveVariant` | `canUnapproveVariant` (unchanged) |
| `VALID_IMAGE_FORMATS` | `VALID_MEDIA_FORMATS` |
| `ValidImageFormat` | `ValidMediaFormat` |
| `IMAGE_ACCEPT_STRING` | `MEDIA_ACCEPT_STRING` |
| `imageVariantKeys` | `mediaVariantKeys` |

**New Fields on `MediaVariant` Type:**

```typescript
export interface MediaVariant {
  // ... existing fields ...
  media_kind: 'image' | 'video' | 'audio';
  duration_secs: number | null;
}
```

**Hook File Renames:**

| Old | New |
|-----|-----|
| `use-image-variants.ts` | `use-media-variants.ts` |
| `useImageVariantAnnotations.ts` | `useMediaVariantAnnotations.ts` |

**API Path Updates in Hooks:**
All `fetch`/`api.get`/`api.post` calls referencing `/image-variants` or `/source-images` updated to `/media-variants` and `/source-media`.

**Affected Files (estimated ~53 frontend files):**
The grep shows 53 frontend files referencing image variant types or the images feature directory.

**Nav Rename:** The sidebar navigation item changes from "Images" to "Media".

**Media Kind Filter:** The Media page (formerly Images page) adds a `media_kind` filter dropdown at the top:
- Default: "All" (shows all media types)
- Options: "Images", "Videos", "Audio"

**Acceptance Criteria:**
- [ ] Directory renamed from `features/images/` to `features/media/`
- [ ] All ~53 frontend files updated with new type names and imports
- [ ] `MediaVariant` type has `media_kind` and `duration_secs` fields
- [ ] Hook files renamed and query keys updated
- [ ] API paths in hooks updated to new endpoints
- [ ] Nav item says "Media" instead of "Images"
- [ ] Media page has a `media_kind` filter dropdown
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] No references to old names remain (verified by grep)

---

#### Requirement 1.5: Seed Auto-Detection — Media Variant Picker

**Description:** The Seeds tab (PRD-146 Req 1.8) currently shows drop zones for file uploads. This requirement replaces those drop zones with a **media variant picker** — a thumbnail grid showing existing approved variants filtered by track affinity. Auto-detection suggests the best match, but the user makes the final choice.

**Matching Algorithm (Client-Side for Live Preview):**

```
For each seed slot in the Seeds tab:
  1. Get the slot's seed_slot_name → look up pipeline seed_slots[].track_affinity
  2. Query media variants for this avatar where variant_type matches track_affinity
  3. Filter to approved variants only (status_id = APPROVED)
  4. Sort candidates:
     a. Hero variants first (is_hero = true)
     b. Then by created_at DESC (most recent first)
  5. Auto-select the top candidate as the "suggested" match
  6. Display all candidates as a thumbnail grid with the suggestion highlighted
```

**UI Design — Seed Slot Card (Replacing Drop Zone):**

```
┌─ Reference Image (image) ─────────────────────────────┐
│                                                         │
│  Suggested:  [highlighted thumbnail]  clothed_hero.png  │
│                                                         │
│  Other options:                                         │
│  [thumb1] [thumb2] [thumb3] [thumb4]                    │
│                                                         │
│  Assigned: clothed_hero.png ✓                           │
│  Used by: Bottom Scene, Top Scene                       │
│  [Clear] [Upload New...]                                │
└─────────────────────────────────────────────────────────┘
```

**Behavior Details:**

- When no variants match the track affinity, fall back to showing all approved variants for the avatar with a "No matching variants — showing all" message.
- When zero approved variants exist for the avatar, show the original drop zone as a fallback.
- Clicking a thumbnail selects it (client-side preview) and highlights it with a border.
- The selection is persisted when the user clicks "Save" or "Auto-assign all".
- The "Upload New..." link opens the existing source media upload flow, then auto-selects the newly created variant.

**Acceptance Criteria:**
- [ ] Seeds tab shows thumbnail grid instead of drop zones for slots with available variants
- [ ] Thumbnails filtered by track affinity from `seed_slots[].track_affinity`
- [ ] Hero variants sorted first, then by most recent approved
- [ ] Auto-suggested variant highlighted with a distinct visual indicator
- [ ] Clicking a thumbnail selects it (client-side state update)
- [ ] "Upload New..." falls back to the existing upload flow
- [ ] Empty state (no variants) shows drop zone as before
- [ ] Track affinity mismatch shows all variants with a notice

**Technical Notes:**
- Reuse the existing `useMediaVariants(avatarId, variantType)` hook (renamed from `useImageVariants`) to fetch candidates per track affinity.
- The `variantThumbnailUrl()` utility (in `features/media/utils.ts`) already generates thumbnail URLs.

---

#### Requirement 1.6: Seed Auto-Detection — Server-Side Auto-Assign

**Description:** A server-side endpoint that resolves all unassigned media slots for an avatar in one operation, creating `avatar_media_assignments` records. This powers the "Auto-assign all" button.

**API Endpoint:**

```
POST /api/v1/avatars/:avatar_id/actions/auto-assign-seeds
```

**Request Body (optional overrides):**
```json
{
  "overwrite_existing": false,
  "dry_run": false
}
```

**Server-Side Matching Algorithm:**

```
For the given avatar:
  1. Load all workflow_media_slots across all workflows for the avatar's scene types
  2. Load all existing avatar_media_assignments
  3. For each unassigned slot (or all slots if overwrite_existing = true):
     a. Get seed_slot_name → pipeline seed_slots[].track_affinity
     b. Query media_variants for this avatar WHERE variant_type = track_affinity
     c. Filter to approved variants (status_id = APPROVED)
     d. Select best: hero first, then most recent approved
     e. If match found → create avatar_media_assignment record
     f. If no match → skip (don't error, report as unresolved)
  4. Return summary: { assigned: [...], skipped: [...], errors: [...] }
```

**Response:**
```json
{
  "data": {
    "assigned": [
      {
        "slot_label": "Reference Image",
        "media_variant_id": 42,
        "variant_label": "clothed_hero",
        "file_path": "/storage/..."
      }
    ],
    "skipped": [
      {
        "slot_label": "Audio Reference",
        "reason": "no_matching_variants"
      }
    ],
    "total_slots": 5,
    "total_assigned": 3,
    "total_skipped": 2
  }
}
```

**Dry Run Mode:** When `dry_run: true`, the endpoint returns the same response shape but does not persist any assignments. This powers the client-side preview before confirmation.

**Acceptance Criteria:**
- [ ] `POST /api/v1/avatars/:id/actions/auto-assign-seeds` endpoint implemented
- [ ] Matches variants to slots using track_affinity from pipeline seed_slots
- [ ] Hero variants prioritized, then most recent approved
- [ ] Does not overwrite existing assignments by default
- [ ] `overwrite_existing: true` replaces all assignments
- [ ] `dry_run: true` returns preview without persisting
- [ ] Response includes clear summary with assigned/skipped/total counts
- [ ] Skipped slots include reason (no_matching_variants, already_assigned)
- [ ] Works correctly when avatar has variants across multiple pipelines

---

#### Requirement 1.7: Frontend "Auto-assign All" Button

**Description:** The Seeds tab gains an "Auto-assign all" button that calls the auto-assign endpoint and updates the UI with the results.

**UX Flow:**

1. User clicks "Auto-assign all" button in the Seeds tab toolbar.
2. Frontend calls the auto-assign endpoint with `dry_run: true`.
3. A confirmation modal shows the preview: "X slots will be assigned, Y slots have no match."
4. For each slot to be assigned, show the suggested variant thumbnail.
5. User can uncheck individual slots they don't want auto-assigned.
6. User clicks "Confirm" → frontend calls the endpoint with `dry_run: false` (and only the confirmed slots, if deselection is supported).
7. Seeds tab refreshes to show the new assignments.

**Acceptance Criteria:**
- [ ] "Auto-assign all" button appears in Seeds tab toolbar
- [ ] Button is disabled when all slots are already assigned
- [ ] Dry-run preview shown in a confirmation modal before persistence
- [ ] Preview shows thumbnails of suggested variants per slot
- [ ] User can confirm or cancel the auto-assignment
- [ ] After confirmation, Seeds tab updates to reflect new assignments
- [ ] Success toast shows "Assigned X of Y slots"
- [ ] Slots that could not be matched are clearly indicated in the preview

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Video/Audio Preview in Variant Picker

**Description:** For `media_kind = 'video'` variants, show a short video preview on hover instead of a static thumbnail. For `media_kind = 'audio'`, show a waveform thumbnail with a play button.

#### Requirement 2.2: Smart Matching Improvements

**Description:** Extend auto-detection beyond track_affinity string matching:
- Fuzzy matching on variant_label keywords (e.g., "clothed front" matches "clothed" track)
- Resolution/aspect ratio matching (prefer variants whose dimensions match the workflow node's expected input size)
- Embedding-based similarity matching (use PRD-20 image embeddings to find visually similar variants)

#### Requirement 2.3: Per-Scene-Type Variant Overrides in Picker

**Description:** Allow the picker to show different variant suggestions per scene type, leveraging the `scene_type_id` column on `avatar_media_assignments`. A scene-type dropdown in the Seeds tab switches context.

## 6. Non-Functional Requirements

### Performance
- The table rename migration must complete in under 1 second (metadata-only operations).
- The auto-assign endpoint must respond in under 500ms for avatars with up to 100 variants and 20 slots.
- The variant picker must load thumbnails lazily (intersection observer) to avoid loading all images at once.

### Security
- No changes to authentication or authorization — existing RBAC applies to renamed endpoints.
- The `media_kind` field is validated server-side against an allowlist (`image`, `video`, `audio`).

## 7. Non-Goals (Out of Scope)

- **Renaming `image_quality_scores` table** — This table is genuinely image-specific (visual QA). Only its FK column is renamed.
- **Renaming `detected_faces` table** — Same rationale; face detection is image-specific.
- **Renaming physical storage paths on disk** — Files on disk keep their current paths. Only database references and code identifiers change.
- **Video transcoding or audio processing** — `duration_secs` is metadata only; no media processing is added.
- **Embedding-based matching** — Deferred to Phase 2 (Req 2.2).
- **Breaking API changes** — Old endpoints get 301 redirects for a transition period.

## 8. Design Considerations

### Seeds Tab Layout (Updated from PRD-146)

The Seeds tab changes from a flat list of drop zones to a richer layout:

```
Seeds Tab
┌─────────────────────────────────────────────────────────┐
│ [Auto-assign all]                          [Filter: All]│
│                                                          │
│ Required Seeds (3)                                       │
│                                                          │
│ ┌─ Reference Image (clothed track) ─────────────────┐   │
│ │  Suggested: [*highlighted*]                        │   │
│ │  [thumb1] [thumb2] [thumb3]                        │   │
│ │  Assigned: clothed_hero.png ✓                      │   │
│ │  [Clear] [Upload New...]                           │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─ Depth Map (topless track) ────────────────────────┐   │
│ │  [drop zone — no matching variants]                │   │
│ │  [Upload New...]                                   │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ Optional Seeds (1)                                       │
│                                                          │
│ ┌─ Audio Reference (audio) ──────────────────────────┐   │
│ │  No variants found. Fallback: skip_node            │   │
│ └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Media Page (Formerly Images Page)

```
Media
┌─────────────────────────────────────────────────────────┐
│ [Kind: All ▾] [Status: All ▾] [Search...]               │
│                                                          │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐              │
│ │ 🖼️ │ │ 🖼️ │ │ 🎬 │ │ 🖼️ │ │ 🎵 │ │ 🖼️ │              │
│ │img │ │img │ │vid │ │img │ │aud│ │img │              │
│ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘              │
└─────────────────────────────────────────────────────────┘
```

## 9. Technical Considerations

### Existing Code to Reuse

| Component | Location | Reuse |
|-----------|----------|-------|
| PRD-140 rename pattern | `20260322100001_rename_character_to_avatar.sql` | Migration template |
| `variantThumbnailUrl()` | `features/images/utils.ts` → `features/media/utils.ts` | Thumbnail URL generation |
| `useImageVariants` hook | `features/images/hooks/use-image-variants.ts` | Rename to `useMediaVariants`, add `media_kind` filter param |
| `SeedDataDropSlot` | `features/avatars/components/SeedDataDropSlot.tsx` | Keep as fallback for zero-variant slots |
| `useAvatarSeedSummary` | `features/avatars/hooks/use-media-assignments.ts` | Extend to include variant candidates |
| `AvatarSeedsTab` | `features/avatars/tabs/AvatarSeedsTab.tsx` | Modify to render picker instead of drop zones |

### Database Changes

**Migration:** `YYYYMMDDHHMMSS_rename_image_to_media.sql`

Follows ID strategy: existing tables already have `id BIGSERIAL`. No new tables are created — only renames and two new columns.

**New columns:**
- `source_media.media_kind TEXT NOT NULL DEFAULT 'image'` — values: `image`, `video`, `audio`
- `source_media.duration_secs NUMERIC` — nullable, for video/audio
- `media_variants.media_kind TEXT NOT NULL DEFAULT 'image'` — same as above
- `media_variants.duration_secs NUMERIC` — nullable, for video/audio

### API Changes

**Renamed endpoints:** See Requirement 1.3.

**New endpoint:**
- `POST /api/v1/avatars/:id/actions/auto-assign-seeds` — See Requirement 1.6.

**New query parameter:**
- `media_kind` filter on all media list endpoints.

### Frontend Changes

**New component:** `MediaVariantPicker` — thumbnail grid for selecting variants in seed slots.

**Modified components:**
- `AvatarSeedsTab` — replace drop zones with picker, add Auto-assign button
- `ImagesPage` → `MediaPage` — rename, add media_kind filter

## 10. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| Avatar has zero approved variants | Seeds tab shows original drop zones (graceful fallback) |
| Track affinity field is null on seed_slot | Show all approved variants for the avatar, no filtering |
| Multiple variants are hero for same type | Both shown as suggestions; first by created_at wins auto-select |
| Auto-assign called when all slots assigned | Returns `overwrite_existing: false` → all skipped with reason `already_assigned` |
| Variant is deleted after being auto-assigned | Assignment's `media_variant_id` becomes NULL (ON DELETE SET NULL); Seeds tab shows "Media removed" with re-assign option |
| Migration conflicts with concurrent writes | Migration is DDL (metadata-only), holds brief exclusive lock; safe during low-traffic deployment |
| Old API paths hit after rename | 301 redirect to new paths; frontend updated simultaneously |
| `media_kind` filter with invalid value | Return 422 Validation Error: "media_kind must be one of: image, video, audio" |

## 11. Success Metrics

| Metric | Target |
|--------|--------|
| Zero references to old names post-rename | `grep -r "source_image\|derived_image\|image_variant" apps/` returns 0 results (excluding migration history and comments) |
| Auto-assign accuracy | >90% of auto-assigned seeds are accepted by users without manual override |
| Seed setup time reduction | Average time to assign all seeds for an avatar drops from manual (per-slot upload) to <10 seconds (one-click auto-assign) |
| Migration runtime | <1 second for the rename migration |
| Zero downtime | API redirects ensure no client errors during transition |

## 12. Testing Requirements

### Backend Tests

| Test | Type | Description |
|------|------|-------------|
| Migration test | Integration | Run migration on test DB, verify all tables/columns renamed correctly |
| Auto-assign happy path | Integration | Create avatar with approved variants + seed slots, call auto-assign, verify assignments created |
| Auto-assign dry run | Integration | Same setup, `dry_run: true`, verify no DB writes but correct response |
| Auto-assign no matches | Unit | Avatar has no approved variants for a slot's track affinity, verify `skipped` response |
| Auto-assign hero priority | Unit | Multiple approved variants, verify hero is selected over non-hero |
| media_kind filter | Integration | Create variants with different media_kinds, verify filter returns correct subset |
| 301 redirect | Integration | Hit old API path, verify 301 to new path |

### Frontend Tests

| Test | Type | Description |
|------|------|-------------|
| MediaVariantPicker renders thumbnails | Component | Mock variant data, verify thumbnails rendered |
| MediaVariantPicker highlights suggestion | Component | Pass hero variant, verify it has highlight class |
| MediaVariantPicker click selects | Component | Click non-suggested thumbnail, verify selection state updates |
| Auto-assign button disabled when full | Component | All slots assigned, verify button disabled |
| Media page kind filter | Component | Select "Video" filter, verify query param updated |
| Type rename verification | Lint | `npx tsc --noEmit` passes, no references to old type names |

## 13. Open Questions

1. **Index renaming:** Should we rename the auto-generated index names (e.g., `idx_source_images_character_id` → `idx_source_media_avatar_id`) in the migration, or leave them with their original names? PRD-140 left trigger/index names as-is. Recommendation: leave as-is for consistency with the established pattern.

2. **Transition period duration:** How long should the 301 redirects from old API paths be maintained? Recommendation: remove after the next frontend deploy (since frontend is updated simultaneously, the redirects are mainly for external API consumers if any).

3. **media_kind validation on upload:** Should the backend auto-detect `media_kind` from the uploaded file's MIME type, or trust the client-provided value? Recommendation: auto-detect from MIME type, ignore client value.

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-24 | AI Product Manager | Initial draft |

# Task List: Clip & Media Notes

**PRD Reference:** `design/prds/150-prd-clip-media-notes.md`
**Scope:** Collapsible notes section on clip and media viewer modals with auto-save.

## Overview

Add a free-text notes field to clips and media items, accessible via a collapsible section in the viewer modals. Clips already have a `notes` column; media variants need one added. A shared `CollapsibleNotes` component handles the UI to avoid duplication.

### What Already Exists
- `scene_video_versions.notes` column — already in DB and model
- `UpdateSceneVideoVersion` DTO — already includes `notes`
- `PUT /scenes/:id/versions/:vid` — already updates notes
- `MediaVariant` model — does NOT have `notes` (needs migration)

### What We're Building
1. Migration to add `notes` to `media_variants`
2. `CollapsibleNotes` shared component
3. Wire into ClipPlaybackModal
4. Wire into ImagePreviewModal

---

## Phase 1: Database & Backend

### Task 1.1: Add notes column to media_variants
**File:** `apps/db/migrations/YYYYMMDD_add_notes_to_media_variants.sql`

```sql
ALTER TABLE media_variants ADD COLUMN notes TEXT;
```

**Acceptance Criteria:**
- [ ] Migration adds nullable `notes TEXT` column
- [ ] Migration runs successfully
- [ ] Existing rows unaffected

### Task 1.2: Update MediaVariant model and DTOs
**Files:** `apps/backend/crates/db/src/models/media.rs`, `apps/backend/crates/db/src/repositories/media_variant_repo.rs`

- Add `pub notes: Option<String>` to `MediaVariant` struct
- Add `pub notes: Option<String>` to `UpdateMediaVariant` DTO
- Update COLUMNS constant and UPDATE query in repo

**Acceptance Criteria:**
- [ ] `MediaVariant` has `notes` field
- [ ] `UpdateMediaVariant` has `notes` field
- [ ] PUT endpoint accepts and persists `notes`
- [ ] `cargo check` passes

---

## Phase 2: Frontend Component

### Task 2.1: CollapsibleNotes component
**File:** `apps/frontend/src/components/domain/CollapsibleNotes.tsx` (NEW)

Shared component used by both modals.

```typescript
interface CollapsibleNotesProps {
  value: string;
  onChange: (value: string) => void;
  /** Save callback — called on blur and after debounce. */
  onSave: (value: string) => void;
  /** Whether a save is in progress. */
  saving?: boolean;
}
```

- Collapsed by default — header "Notes" with chevron toggle
- When expanded: monospace textarea, dark bg, auto-resize
- Auto-save: on blur, and after 1s debounce while typing
- Small "saving..." indicator when `saving` is true

**Acceptance Criteria:**
- [ ] Collapsed by default with "Notes" header + chevron
- [ ] Textarea with monospace font, terminal style
- [ ] Auto-save on blur
- [ ] Debounced auto-save (1s) while typing
- [ ] Shows "saving..." indicator

---

## Phase 3: Integration

### Task 3.1: Wire into ClipPlaybackModal
**File:** `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx`

- Add state for clip notes (initialized from `clip.notes`)
- Add `CollapsibleNotes` after the TagInput section
- Save via existing clip update mutation or direct API call: `PUT /scenes/:sceneId/versions/:versionId` with `{ notes }`

**Acceptance Criteria:**
- [ ] Notes section appears below labels in clip modal
- [ ] Notes load from clip data when modal opens
- [ ] Notes persist on blur/debounce via API
- [ ] Notes update when navigating prev/next clips

### Task 3.2: Wire into ImagePreviewModal
**File:** `apps/frontend/src/app/pages/MediaPage.tsx`

- Add state for variant notes (initialized from `variant.notes` — need to add to browse item type)
- Add `CollapsibleNotes` after the TagInput section
- Save via `PUT /avatars/:avatarId/media-variants/:id` with `{ notes }`

**Acceptance Criteria:**
- [ ] Notes section appears below labels in media modal
- [ ] Notes load from variant data
- [ ] Notes persist on blur/debounce via API
- [ ] Notes update when navigating prev/next

### Task 3.3: Add notes to MediaVariantBrowseItem
**File:** `apps/backend/crates/api/src/handlers/media_variant.rs`

Add `notes` to the browse query SELECT and `MediaVariantBrowseItem` struct so the frontend has notes data without an extra fetch.

**File:** `apps/frontend/src/features/media/hooks/use-media-variants.ts`

Add `notes: string | null` to `MediaVariantBrowseItem` type.

**Acceptance Criteria:**
- [ ] Browse endpoint returns `notes` field
- [ ] Frontend type includes `notes`

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/..._add_notes_to_media_variants.sql` | Migration |
| `apps/backend/crates/db/src/models/media.rs` | Add notes to MediaVariant |
| `apps/backend/crates/db/src/repositories/media_variant_repo.rs` | Update COLUMNS + UPDATE |
| `apps/backend/crates/api/src/handlers/media_variant.rs` | Add notes to browse item |
| `apps/frontend/src/components/domain/CollapsibleNotes.tsx` | NEW shared component |
| `apps/frontend/src/features/scenes/ClipPlaybackModal.tsx` | Wire notes into clip modal |
| `apps/frontend/src/app/pages/MediaPage.tsx` | Wire notes into media modal |
| `apps/frontend/src/features/media/hooks/use-media-variants.ts` | Add notes to browse type |

---

## Implementation Order

1. Task 1.1: Migration
2. Task 1.2: Backend model/repo
3. Task 3.3: Browse item includes notes
4. Task 2.1: CollapsibleNotes component
5. Task 3.1: Clip modal integration
6. Task 3.2: Media modal integration

**MVP Success Criteria:**
- Notes collapsible section visible in both modals
- Notes auto-save on blur
- Notes persist across page reloads
- Notes update when navigating between items

---

## Version History

- **v1.0** (2026-03-25): Initial task list from PRD-150

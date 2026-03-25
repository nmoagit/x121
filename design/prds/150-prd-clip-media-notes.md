# PRD-150: Clip & Media Notes

**Document ID:** 150-prd-clip-media-notes
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-03-25
**Last Updated:** 2026-03-25

---

## 1. Introduction/Overview

Users need free-text notes on clips (scene video versions) and media items (media variants) to capture observations, feedback, and context directly from the viewer modals. This PRD adds a collapsible notes section to the ClipPlaybackModal and ImagePreviewModal, wired to the existing update APIs with auto-save on blur/debounce.

## 2. Related PRDs & Dependencies

### Depends On
- PRD-01: Project, Character & Scene Data Model (scene_video_versions table)
- PRD-21: Image Management (media_variants table)

### Extends
- PRD-70: Scene Video Versions (clip viewer modal)
- PRD-109: Annotations (ClipPlaybackModal already exists)

## 3. Goals

### Primary Goals
- Allow users to add/edit free-text notes on clips and media variants from viewer modals.
- Notes persist immediately via auto-save (no explicit save button).

### Secondary Goals
- Consistent UI pattern across both modals.

## 4. User Stories

- As a reviewer, I want to add notes to a clip while reviewing it, so I can record observations without leaving the modal.
- As a creator, I want to add notes to a media variant, so I can track editing decisions or feedback.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Database — Add `notes` to `media_variants`

**Description:** The `scene_video_versions` table already has a `notes TEXT` column. Add the same to `media_variants`.

**Acceptance Criteria:**
- [ ] Migration adds `notes TEXT` column to `media_variants` (nullable, default NULL)
- [ ] `MediaVariant` Rust model includes `notes: Option<String>`
- [ ] `UpdateMediaVariant` DTO includes `notes: Option<String>`
- [ ] Existing PUT endpoint for media variants accepts and persists `notes`

**Technical Notes:**
- `SceneVideoVersion` already has `notes` and `UpdateSceneVideoVersion` already includes it -- no DB or backend changes needed for clips.
- Single migration file: `YYYYMMDDHHMMSS_add_notes_to_media_variants.sql`.

#### Requirement 1.2: Collapsible Notes Section — ClipPlaybackModal

**Description:** Add a collapsible "Notes" section below the Labels/TagInput area in `ClipPlaybackModal`.

**Acceptance Criteria:**
- [ ] Section header shows "Notes" with a chevron icon (right when collapsed, down when expanded)
- [ ] Collapsed by default; expands on click
- [ ] When expanded, shows a `<textarea>` with the clip's current notes
- [ ] Textarea uses monospace font, dark terminal styling (bg `#0d1117`, border `var(--color-border-default)`, text `var(--color-text-primary)`)
- [ ] Textarea auto-resizes to fit content (min 3 rows, max 12 rows)
- [ ] Notes auto-save on blur or after 1s debounce of typing
- [ ] Saves via PUT to the existing scene video version update endpoint
- [ ] Shows a subtle "Saving..." / "Saved" indicator near the section header

#### Requirement 1.3: Collapsible Notes Section — ImagePreviewModal

**Description:** Add the same collapsible "Notes" section to the `ImagePreviewModal` in `MediaPage.tsx`, below the Labels/TagInput area.

**Acceptance Criteria:**
- [ ] Same UI pattern as Requirement 1.2 (collapsible, auto-save, terminal styling)
- [ ] Saves via PUT to the existing media variant update endpoint
- [ ] Notes value resets when navigating between variants (prev/next)

#### Requirement 1.4: Shared CollapsibleNotes Component

**Description:** Extract the notes UI into a reusable component to avoid duplication.

**Acceptance Criteria:**
- [ ] `CollapsibleNotes` component created (props: `value`, `onSave`, `saving?`, `className?`)
- [ ] Used by both ClipPlaybackModal and ImagePreviewModal
- [ ] Handles debounce and blur save internally
- [ ] Manages its own collapsed/expanded state

## 6. Non-Functional Requirements

### Performance
- Debounce saves to avoid excessive API calls (1s delay).
- No additional queries on modal open -- notes come with the existing entity data.

### Security
- Notes are plain text, no HTML rendering (XSS safe).

## 7. Non-Goals (Out of Scope)

- Rich text / markdown formatting in notes.
- Notes history or versioning.
- Notes on source_media or derived_media (only media_variants).
- Full-text search across notes.
- Notes visible outside the viewer modals (e.g., in list/grid cards).

## 8. Design Considerations

- Terminal/hacker aesthetic: monospace font, dark background, minimal borders.
- Chevron rotation animation on collapse/expand (CSS transition).
- "Saved" indicator fades out after 2s.

## 9. Technical Considerations

### Existing Code to Reuse
- `ClipPlaybackModal` (`features/scenes/ClipPlaybackModal.tsx`) -- add section after TagInput.
- `ImagePreviewModal` (inline in `app/pages/MediaPage.tsx`) -- add section after TagInput.
- `UpdateSceneVideoVersion` DTO already has `notes` field.
- PUT `/api/v1/avatars/{avatar_id}/media-variants/{id}` already exists.
- PUT endpoint for scene video versions already handles `notes`.

### Database Changes
- **Migration:** `ALTER TABLE media_variants ADD COLUMN notes TEXT;`
- **Model update:** Add `notes: Option<String>` to `MediaVariant` and `UpdateMediaVariant`.

### API Changes
- No new endpoints. Existing PUT endpoints already accept partial updates.
- Frontend sends `{ notes: "..." }` via the existing update mutation/API call.

### Frontend Types
- Add `notes?: string` to the frontend `MediaVariantBrowseItem` type if not present.
- `SceneVideoVersion` frontend type should already have `notes`.

## 10. Edge Cases & Error Handling

- **Empty notes:** Saving an empty string clears the notes (treated as NULL on backend).
- **Rapid navigation:** Cancel pending debounce when clip/variant changes; save immediately on blur before navigating.
- **Save failure:** Show brief error toast; do not clear the textarea so user can retry.
- **Long notes:** No character limit enforced, but textarea scroll kicks in beyond max-height.

## 11. Success Metrics

- Notes field is usable from both modals with zero extra clicks beyond expanding the section.
- Auto-save works reliably without data loss.

## 12. Testing Requirements

- Backend: verify migration adds column, PUT endpoint persists and returns notes.
- Frontend: CollapsibleNotes renders collapsed by default, expands on click, calls onSave on blur, debounce fires after 1s idle.

## 13. Open Questions

None.

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-03-25 | AI PM | Initial draft |

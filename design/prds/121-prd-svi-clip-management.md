# PRD-121: Scene Video Version (SVI) Clip Management

**Document ID:** 121-prd-svi-clip-management
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-02-28
**Last Updated:** 2026-02-28

---

## 1. Introduction/Overview

Scene video versions (SVIs) represent the assembled output clips for a scene -- each time a scene is generated or an external video is imported, a new version is created. PRD-109 established the backend data model, repository, and API for these versions. However, there is currently no frontend UI for managing them, no quality-assurance workflow for individual clips, and no way to resume generation from a known-good clip when a subsequent one fails quality checks.

This PRD delivers the frontend clip management experience and the backend extensions needed to support it. It covers four capabilities:

1. **Clip Gallery** -- A UI where users can view all scene video versions (clips) for a scene, with playback, metadata, and version status at a glance.
2. **Clip QA (Approve/Reject)** -- A quality-assurance workflow where users review each clip and mark it as approved, rejected, or pending. Rejected clips include a reason and optional notes.
3. **Resume from Last Good Clip** -- When a clip is rejected, users can trigger regeneration starting from the last approved clip, discarding all subsequent clips. This avoids regenerating the entire scene from scratch.
4. **External Clip Import** -- While PRD-109 built the backend `import_video` endpoint, this PRD adds the frontend UI (drag-and-drop file picker, progress indicator, notes field) and extends the import to support optional metadata (duration detection, thumbnail extraction).

These features work together to give producers a complete clip-level review and management workflow, reducing wasted GPU time and enabling flexible external asset integration.

---

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-109** (Scene Video Versioning, External Import & Soft Delete) -- Provides the `scene_video_versions` table, `SceneVideoVersionRepo`, and API endpoints for CRUD, `set-final`, and `import_video`. This PRD builds the frontend and extends the backend.
- **PRD-24** (Recursive Video Generation Loop) -- Provides the generation pipeline, segment model, and `SegmentRepo::get_last_completed()` used for generation resumption.
- **PRD-25** (Incremental Re-stitching & Smoothing) -- Provides single-segment regeneration and stale-flagging logic reused when resuming from a good clip.
- **PRD-35** (One-Key Approval & Finalization Flow) -- Provides the `segment_approvals` table and approval/rejection pattern (decision, reason category, comment) that this PRD adapts for clip-level QA.
- **PRD-29** (Design System) -- UI components: `StatusBadge`, `Modal`, `Button`, `Card`, `DropZone`, `VideoPlayer`.
- **PRD-01** (Project, Character & Scene Data Model) -- Scene/segment entity hierarchy.
- **PRD-02** (Backend Foundation) -- Axum API, error handling, `AppState`.

### Extends
- **PRD-109** -- Adds `qa_status` column to `scene_video_versions`, frontend clip gallery, and resume-from-good-clip API.
- **PRD-35** -- Adapts the segment-level approval pattern to scene video version (clip) level.

### Related (not blocking)
- **PRD-101** (Segment Regeneration Comparison) -- Provides the `VersionFilmstrip` and `RegenerationComparison` components that could be reused for clip comparison.
- **PRD-83** (Video Playback Engine) -- Provides `VideoPlayer` component and codec detection utilities.
- **PRD-92** (Batch Review & Approval Workflows) -- Could extend to batch clip QA in post-MVP.

---

## 3. Goals

### Primary Goals
1. **Clip visibility** -- Provide a clear, browsable gallery of all scene video versions (clips) for any scene, with playback, metadata, and QA status.
2. **Quality gate** -- Enable producers and reviewers to approve or reject individual clips, creating a clear record of quality decisions.
3. **Efficient recovery** -- When a clip is rejected, allow users to resume generation from the last approved clip rather than regenerating the entire scene.
4. **External asset integration** -- Provide a polished frontend for importing externally-produced clips, completing the import flow started in PRD-109.

### Secondary Goals
5. **Reduce GPU waste** -- By resuming from the last good clip, avoid redundant regeneration of already-approved segments.
6. **Audit trail** -- Record who approved/rejected each clip, when, and why, for production accountability.

---

## 4. User Stories

1. **As a producer**, I want to see all clips (video versions) for a scene in a gallery view, so I can quickly assess the generation history and find the version I want.

2. **As a reviewer**, I want to play back any clip in the gallery and approve or reject it, so the team knows which clips passed QA.

3. **As a producer**, when I reject a clip, I want to provide a reason (from a predefined category) and optional notes, so the rejection is actionable.

4. **As a producer**, when a clip is bad, I want to regenerate the scene starting from the clip before the bad one, so I do not waste GPU time re-generating already-approved work.

5. **As a producer**, I want to import a video file from my local machine as a new clip for a scene, so I can bring in externally-produced content.

6. **As a producer**, I want to drag-and-drop a video file onto the scene's clip gallery to import it, so the workflow is fast and intuitive.

7. **As a reviewer**, I want to see which clips are approved, rejected, or pending at a glance via status badges, so I can focus my review on pending items.

8. **As a producer**, I want to mark any approved clip as the "final" version for delivery, so the delivery ZIP always reflects my best choice.

---

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Clip QA Status on Scene Video Versions

**Description:** Add a `qa_status` field to the `scene_video_versions` table to track the quality-assurance state of each clip. This field records whether a clip is pending review, approved, or rejected.

**Acceptance Criteria:**
- [ ] New migration adds `qa_status TEXT NOT NULL DEFAULT 'pending' CHECK (qa_status IN ('pending', 'approved', 'rejected'))` to `scene_video_versions`
- [ ] New migration adds `qa_reviewed_by BIGINT REFERENCES users(id)` to `scene_video_versions`
- [ ] New migration adds `qa_reviewed_at TIMESTAMPTZ` to `scene_video_versions`
- [ ] New migration adds `qa_rejection_reason TEXT` to `scene_video_versions`
- [ ] New migration adds `qa_notes TEXT` to `scene_video_versions`
- [ ] `SceneVideoVersion` model struct updated with new fields
- [ ] `UpdateSceneVideoVersion` DTO extended with `qa_status`, `qa_reviewed_by`, `qa_reviewed_at`, `qa_rejection_reason`, `qa_notes`
- [ ] `SceneVideoVersionRepo::update` handles the new QA fields via COALESCE pattern

**Technical Notes:**
- Follows the existing column-addition pattern (see PRD-109 `scene_video_versions` table)
- Uses `TEXT CHECK` constraint rather than a status lookup table, matching the `source` column pattern already on the table
- `qa_reviewed_by` is nullable (NULL for pending clips)

#### Requirement 1.2: Clip Approve/Reject API Endpoints

**Description:** Backend API endpoints for approving and rejecting clips. These update the `qa_status` and related fields on the `scene_video_versions` row.

**Acceptance Criteria:**
- [ ] `PUT /api/v1/scenes/{scene_id}/versions/{id}/approve` -- sets `qa_status = 'approved'`, records `qa_reviewed_by` and `qa_reviewed_at`
- [ ] `PUT /api/v1/scenes/{scene_id}/versions/{id}/reject` -- sets `qa_status = 'rejected'`, records `qa_reviewed_by`, `qa_reviewed_at`, `qa_rejection_reason`, and optional `qa_notes`
- [ ] Reject request body: `{ "reason": "string", "notes": "string (optional)" }`
- [ ] Approve endpoint requires authentication (extracts user ID from JWT)
- [ ] Reject endpoint requires authentication
- [ ] Returns 404 if version does not exist or is soft-deleted
- [ ] Returns 409 if attempting to approve/reject a soft-deleted version
- [ ] Returns the updated `SceneVideoVersion` record in the response

**Technical Notes:**
- Follows the pattern from `crates/api/src/handlers/approval.rs` (PRD-35 segment approvals)
- Uses `AuthUser` extractor for `qa_reviewed_by`
- Both endpoints live in `crates/api/src/handlers/scene_video_version.rs` alongside existing handlers

#### Requirement 1.3: Resume Generation from Last Good Clip

**Description:** When a clip is rejected, the user can trigger a "resume from here" action on any earlier approved clip. This marks all subsequent clips as stale, soft-deletes segments after the chosen clip's corresponding segment, and restarts generation from that point.

**Acceptance Criteria:**
- [ ] `POST /api/v1/scenes/{scene_id}/versions/{id}/resume-from` -- triggers generation resumption from the clip identified by `{id}`
- [ ] The endpoint validates that the clip specified by `{id}` exists and has `qa_status = 'approved'`
- [ ] All clips with `version_number` greater than the selected clip are soft-deleted
- [ ] All segments with `sequence_index` greater than the last segment of the selected clip are soft-deleted (uses `SegmentRepo::soft_delete`)
- [ ] Scene generation state is reset: `total_segments_completed` set to the segment count up to and including the resume point, `generation_completed_at` set to NULL
- [ ] A new generation is initiated from the last frame of the last segment corresponding to the selected clip
- [ ] Returns `{ "scene_id", "resume_from_version", "segments_preserved", "segments_discarded", "status": "generating" }`
- [ ] Returns 400 if the clip is not approved
- [ ] Returns 404 if clip or scene does not exist

**Technical Notes:**
- Reuses `SegmentRepo::get_last_completed()` to identify the resume point
- Reuses generation initialization logic from `crates/api/src/handlers/generation.rs::init_scene_generation()`
- The relationship between clips (scene video versions) and segments needs clarification: a clip is the assembled video from all segments up to that point. Resuming from clip N means preserving all segments that contributed to clip N and discarding the rest.
- This is conceptually similar to PRD-25's regeneration but operates at the clip (assembled video) level rather than individual segment level

#### Requirement 1.4: Clip Gallery Frontend Component

**Description:** A React component that displays all scene video versions (clips) for a scene in a gallery layout. Each clip card shows a thumbnail, version number, source badge, QA status badge, file size, duration, creation date, and action buttons.

**Acceptance Criteria:**
- [ ] `ClipGallery` component renders a grid/list of clip cards for a given `scene_id`
- [ ] Each clip card displays: version number, source badge ("Generated" / "Imported"), QA status badge ("Pending" / "Approved" / "Rejected"), `is_final` badge (star icon), file size (human-readable), duration, creation date
- [ ] Clicking a clip card opens the video in the `VideoPlayer` component for playback
- [ ] Gallery is ordered by `version_number` descending (newest first)
- [ ] Empty state message when no clips exist for the scene
- [ ] Loading state with skeleton cards while fetching
- [ ] Error state with retry button

**Technical Notes:**
- Component location: `apps/frontend/src/features/scenes/ClipGallery.tsx`
- Reuse `StatusBadge` from `@reesets/design-system` for source and QA badges
- Reuse `VideoPlayer` from `apps/frontend/src/features/video-player/`
- Reuse `Card` component for clip entries
- Data fetching via TanStack Query hook: `useSceneVersions(sceneId)`

#### Requirement 1.5: Clip QA Actions (Approve/Reject UI)

**Description:** UI controls on each clip card for approving or rejecting a clip. Rejection opens a dialog for entering a reason and optional notes.

**Acceptance Criteria:**
- [ ] Each pending clip card shows "Approve" (checkmark) and "Reject" (X) action buttons
- [ ] Clicking "Approve" calls the approve endpoint and optimistically updates the QA status badge to "Approved"
- [ ] Clicking "Reject" opens a `RejectionDialog` with a reason field (required) and notes field (optional)
- [ ] Submitting the rejection dialog calls the reject endpoint and updates the badge to "Rejected"
- [ ] Already-approved clips show a green "Approved" badge and no action buttons (or a "Revoke" option)
- [ ] Already-rejected clips show a red "Rejected" badge with the rejection reason visible on hover/expansion
- [ ] Mutation invalidates the `useSceneVersions` query cache on success

**Technical Notes:**
- Reuse `RejectionDialog` pattern from `apps/frontend/src/features/review/RejectionDialog.tsx` -- extract shared logic if identical
- Use TanStack Query `useMutation` for approve/reject calls
- Optimistic updates via `onMutate` callback

#### Requirement 1.6: Resume from Clip UI

**Description:** When a clip is rejected, approved clips before it show a "Resume from here" action. This triggers the resume-from API and shows progress.

**Acceptance Criteria:**
- [ ] On any approved clip that has at least one rejected clip after it, a "Resume Generation from Here" button appears
- [ ] Clicking the button opens a confirmation dialog explaining: "This will discard N clips after version X and restart generation from this point."
- [ ] The dialog shows the number of clips that will be discarded and the number of segments preserved
- [ ] On confirmation, calls `POST /scenes/{scene_id}/versions/{id}/resume-from`
- [ ] Shows a progress indicator while generation is in progress (reuse generation progress from PRD-24)
- [ ] On success, the gallery refreshes to show the preserved clips and the new generating state
- [ ] On error, shows an error toast with the failure reason

**Technical Notes:**
- Reuse generation progress components from PRD-24 (progress bar, segment count)
- The "Resume from here" button should only appear when contextually relevant (not on every approved clip at all times)

#### Requirement 1.7: External Clip Import UI

**Description:** Frontend UI for importing external video files as new clips. Includes drag-and-drop, file validation, upload progress, and notes input.

**Acceptance Criteria:**
- [ ] "Import Clip" button in the clip gallery header opens an import dialog
- [ ] Import dialog includes a drag-and-drop zone (reuse `DropZone` if available) and a file picker fallback button
- [ ] Accepted file formats: `.mp4`, `.webm`, `.mov` (validated client-side before upload)
- [ ] File size limit displayed in the dialog (matches backend limit, or a sensible default like 500 MB)
- [ ] Optional "Notes" text field for describing the imported clip
- [ ] Upload progress bar shown during multipart upload
- [ ] On success, the new clip appears in the gallery with source badge "Imported" and QA status "Pending"
- [ ] On error (bad format, server error), shows an error message in the dialog without closing it
- [ ] Mutation invalidates the `useSceneVersions` query cache on success

**Technical Notes:**
- Calls existing `POST /api/v1/scenes/{scene_id}/versions/import` endpoint (PRD-109, already implemented)
- Use `FormData` with multipart upload via `fetch` or Axios
- Component location: `apps/frontend/src/features/scenes/ImportClipDialog.tsx`

#### Requirement 1.8: TanStack Query Hooks for Clip Management

**Description:** React hooks for data fetching and mutations related to scene video version (clip) management.

**Acceptance Criteria:**
- [ ] `useSceneVersions(sceneId)` -- fetches all versions for a scene via `GET /scenes/{scene_id}/versions`
- [ ] `useSceneVersion(sceneId, versionId)` -- fetches a single version
- [ ] `useApproveClip()` -- mutation for `PUT /scenes/{scene_id}/versions/{id}/approve`
- [ ] `useRejectClip()` -- mutation for `PUT /scenes/{scene_id}/versions/{id}/reject`
- [ ] `useSetFinalClip()` -- mutation for `PUT /scenes/{scene_id}/versions/{id}/set-final`
- [ ] `useResumeFromClip()` -- mutation for `POST /scenes/{scene_id}/versions/{id}/resume-from`
- [ ] `useImportClip()` -- mutation for `POST /scenes/{scene_id}/versions/import` (multipart)
- [ ] All mutations invalidate the `['scene-versions', sceneId]` query key on success
- [ ] All hooks follow existing TanStack Query patterns in the codebase

**Technical Notes:**
- Hook location: `apps/frontend/src/features/scenes/hooks/useClipManagement.ts`
- Follow existing hook patterns (see e.g., `apps/frontend/src/features/segment-comparison/hooks/`)

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Clip Side-by-Side Comparison

**[OPTIONAL -- Post-MVP]** Side-by-side comparison of two clips with synchronized playback. Reuse `RegenerationComparison` component pattern from PRD-101.

#### Requirement 2.2: Batch Clip QA

**[OPTIONAL -- Post-MVP]** Review and approve/reject multiple clips in sequence with keyboard shortcuts (J/K to navigate, A to approve, R to reject). Extends PRD-92 batch review pattern.

#### Requirement 2.3: Clip Thumbnails

**[OPTIONAL -- Post-MVP]** Auto-extract a thumbnail from the first frame of each clip for the gallery view. Uses FFmpeg/FFprobe on the backend.

#### Requirement 2.4: Clip Duration Auto-Detection

**[OPTIONAL -- Post-MVP]** Use FFprobe on the backend to auto-detect and store `duration_secs` for imported clips (currently `None` for imports).

#### Requirement 2.5: Clip QA Dashboard

**[OPTIONAL -- Post-MVP]** Aggregate view across all scenes showing clip QA progress: how many clips are pending, approved, rejected per scene/character/project. Extends PRD-42 Studio Pulse.

---

## 6. Non-Functional Requirements

### Performance
- Clip gallery must load within 500ms for scenes with up to 50 versions
- Video playback must start within 2 seconds of clicking a clip card
- Import upload must support files up to 500 MB without timeout

### Security
- Approve/reject endpoints require authentication (`AuthUser` extractor)
- Resume-from endpoint requires authentication
- File upload validation (format, size) on both client and server
- QA status changes are logged with user ID and timestamp for audit trail

---

## 7. Non-Goals (Out of Scope)

- **Segment-level QA** -- This PRD operates at the clip (assembled scene video) level. Segment-level approval is handled by PRD-35.
- **Video transcoding** -- Imported clips are stored as-is. Transcoding is out of scope (see PRD-39).
- **Clip annotations/markup** -- Drawing on video frames is handled by PRD-70.
- **Automated quality scoring** -- AI-based quality assessment is out of scope. QA is a manual human decision.
- **Version diff/delta storage** -- Each clip is a full video file. Deduplication or delta encoding is not included.
- **Clip reordering** -- Version numbers are auto-assigned and immutable. Reordering is not supported.

---

## 8. Design Considerations

- **Gallery layout** -- Use a vertical list (not a grid) for clip cards, since video metadata and actions need horizontal space. Each card should be a single row with thumbnail on the left, metadata in the center, and action buttons on the right.
- **QA status badges** -- Use color-coded `StatusBadge` components: green for "Approved", red for "Rejected", gray for "Pending". The badge should be prominent on each clip card.
- **Final badge** -- A gold star icon on the clip card that is currently marked as final. Clicking it on a non-final approved clip triggers `set-final`.
- **Import drop zone** -- Occupies the top of the gallery when the user drags a file over the page (auto-detected via drag events). Otherwise, the "Import Clip" button is in the gallery header.
- **Resume confirmation** -- The confirmation dialog must clearly state the destructive nature of the action (clips will be soft-deleted, not permanently removed) and show exact counts.
- **Responsive** -- The clip gallery should work in the panel layout system (PRD-30) and adapt to narrow widths.

---

## 9. Technical Considerations

### Existing Code to Reuse

| Component/Module | Location | Usage |
|---|---|---|
| `SceneVideoVersion` model | `crates/db/src/models/scene_video_version.rs` | Extend with QA fields |
| `SceneVideoVersionRepo` | `crates/db/src/repositories/scene_video_version_repo.rs` | Extend with QA update methods |
| Scene version API handlers | `crates/api/src/handlers/scene_video_version.rs` | Add approve/reject/resume endpoints |
| Scene routes | `crates/api/src/routes/scene.rs` | Add new routes to existing version router |
| `SegmentRepo::get_last_completed()` | `crates/db/src/repositories/segment_repo.rs` | For generation resumption |
| Generation init logic | `crates/api/src/handlers/generation.rs` | `init_scene_generation()` for resume |
| Segment soft delete | `crates/db/src/repositories/segment_repo.rs` | `soft_delete()` for discarding segments |
| `RejectionDialog` | `apps/frontend/src/features/review/RejectionDialog.tsx` | Pattern for rejection UI |
| `VideoPlayer` | `apps/frontend/src/features/video-player/VideoPlayer.tsx` | Clip playback |
| `StatusBadge` | `@reesets/design-system` | QA status and source badges |
| `VersionFilmstrip` | `apps/frontend/src/features/segment-comparison/VersionFilmstrip.tsx` | Post-MVP comparison |
| Approval model pattern | `crates/db/src/models/approval.rs` | Pattern for QA decision records |
| `AuthUser` extractor | `crates/api/src/middleware/auth.rs` | For recording reviewer identity |

### Database Changes

**Migration: Add QA columns to `scene_video_versions`**
```sql
ALTER TABLE scene_video_versions
    ADD COLUMN qa_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (qa_status IN ('pending', 'approved', 'rejected')),
    ADD COLUMN qa_reviewed_by BIGINT REFERENCES users(id),
    ADD COLUMN qa_reviewed_at TIMESTAMPTZ,
    ADD COLUMN qa_rejection_reason TEXT,
    ADD COLUMN qa_notes TEXT;

CREATE INDEX idx_scene_video_versions_qa_status
    ON scene_video_versions (qa_status)
    WHERE deleted_at IS NULL;
```

- Follows the existing ID strategy (BIGSERIAL id, no UUID needed for this migration since the table already exists)
- `qa_reviewed_by` references `users(id)` for audit trail
- Index on `qa_status` enables efficient filtering of pending/approved/rejected clips

### API Changes

**New endpoints (added to existing scene version router):**

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| PUT | `/scenes/{scene_id}/versions/{id}/approve` | `approve_clip` | Mark clip as approved |
| PUT | `/scenes/{scene_id}/versions/{id}/reject` | `reject_clip` | Mark clip as rejected with reason |
| POST | `/scenes/{scene_id}/versions/{id}/resume-from` | `resume_from_clip` | Resume generation from this clip |

**Existing endpoints (no changes needed):**
- `GET /scenes/{scene_id}/versions` -- list all (already returns all fields; will include new QA fields)
- `GET /scenes/{scene_id}/versions/{id}` -- get single
- `DELETE /scenes/{scene_id}/versions/{id}` -- soft-delete
- `PUT /scenes/{scene_id}/versions/{id}/set-final` -- mark as final
- `POST /scenes/{scene_id}/versions/import` -- import video

### Frontend File Structure

```
apps/frontend/src/features/scenes/
  ClipGallery.tsx           -- Main gallery component
  ClipCard.tsx              -- Individual clip card with metadata and actions
  ClipQAActions.tsx         -- Approve/reject buttons and status display
  ImportClipDialog.tsx      -- Import dialog with drag-and-drop
  ResumeFromDialog.tsx      -- Confirmation dialog for resume-from action
  hooks/
    useClipManagement.ts    -- TanStack Query hooks for all clip operations
  types.ts                  -- TypeScript types for clip data
  __tests__/
    ClipGallery.test.tsx
    ClipCard.test.tsx
    ClipQAActions.test.tsx
    ImportClipDialog.test.tsx
    ResumeFromDialog.test.tsx
    useClipManagement.test.ts
```

---

## 10. Edge Cases & Error Handling

1. **Resume from the only clip** -- If there is only one clip and it is approved, "Resume from here" should not appear (there is nothing to discard).
2. **Resume from clip with no segments** -- If the clip is an imported video (not generated), it has no corresponding segments. The resume action should start a fresh generation using the scene's seed image, not the imported clip.
3. **All clips rejected** -- If every clip is rejected, the gallery should show a prominent "No approved clips" message and suggest either importing a clip or regenerating from scratch.
4. **Concurrent QA** -- If two reviewers try to approve/reject the same clip simultaneously, the last write wins (no optimistic locking needed for MVP).
5. **Import during generation** -- Importing a clip while generation is in progress should be allowed. The imported clip gets the next version number and does not interfere with the running generation.
6. **Approve a soft-deleted clip** -- Should return 404 (soft-deleted clips are filtered out by default).
7. **Set final on rejected clip** -- Should return 400 with message "Cannot mark a rejected clip as final. Approve it first."
8. **Resume from rejected clip** -- Should return 400 with message "Can only resume from an approved clip."
9. **Large file upload timeout** -- Frontend should show a progress bar. Backend should use streaming multipart parsing to avoid memory exhaustion on large files.
10. **Scene with no clips** -- Gallery shows an empty state with options to generate or import.

---

## 11. Success Metrics

1. **Clip QA adoption** -- >80% of scene video versions have a QA decision (approved or rejected) recorded within 24 hours of creation.
2. **Resume usage** -- >50% of rejected clips result in a "resume from" action rather than full scene regeneration.
3. **GPU savings** -- Measured reduction in total GPU time per scene when using resume-from vs. full regeneration.
4. **Import completion** -- >95% of started clip imports complete successfully (no abandonment due to UX friction).
5. **Reviewer efficiency** -- Average time to QA a clip is under 30 seconds.

---

## 12. Testing Requirements

### Backend Tests
- [ ] Integration test: approve a clip, verify `qa_status = 'approved'`, `qa_reviewed_by` set, `qa_reviewed_at` set
- [ ] Integration test: reject a clip with reason and notes, verify all QA fields populated
- [ ] Integration test: resume-from approved clip, verify subsequent clips are soft-deleted
- [ ] Integration test: resume-from rejected clip returns 400
- [ ] Integration test: set-final on rejected clip returns 400
- [ ] Integration test: approve a soft-deleted clip returns 404
- [ ] Unit test: QA status CHECK constraint rejects invalid values

### Frontend Tests
- [ ] `ClipGallery` renders clip cards ordered by version number descending
- [ ] `ClipGallery` shows empty state when no clips exist
- [ ] `ClipCard` displays correct badges for each QA status
- [ ] `ClipQAActions` approve button calls mutation and updates badge
- [ ] `ClipQAActions` reject button opens `RejectionDialog`
- [ ] `ImportClipDialog` validates file format before upload
- [ ] `ImportClipDialog` shows upload progress
- [ ] `ResumeFromDialog` shows correct discard count
- [ ] `useSceneVersions` hook fetches and caches correctly
- [ ] `useApproveClip` mutation invalidates cache on success

---

## 13. Open Questions

1. **Rejection reason categories** -- Should rejection reasons be freeform text or drawn from a predefined list (like PRD-35's `rejection_categories` table)? Current decision: freeform text for MVP, predefined categories in post-MVP.
2. **Clip-to-segment mapping** -- How do we map a clip (scene video version) to the segments that produced it? The current model does not store which segments contributed to each clip. Consider adding a `last_segment_id` or `segment_range` field. Current decision: derive from `version_number` ordering and segment `sequence_index` for MVP.
3. **QA status on imported clips** -- Should imported clips default to `pending` or `approved`? Current decision: `pending` (they should be reviewed like any other clip).
4. **Resume-from and file cleanup** -- When soft-deleting clips during resume-from, should the video files on disk also be moved/renamed, or left in place until purge? Current decision: leave in place (consistent with PRD-109 soft-delete behavior).

---

## 14. Version History

- **v1.0** (2026-02-28): Initial PRD creation
- **v1.1** (2026-03-14): Amendment — Newer-than-final indicator, generation snapshot display, clickable workflow link (Reqs A.1-A.3).

---

## Amendment (2026-03-14): Newer-than-Final Indicator, Generation Snapshot Display & Clickable Workflow Link

### Requirement A.1: Newer-than-Final Blue Dot Indicator

**Description:** Scene cards in the character scenes tab display a visual indicator when clips exist that were generated after the one marked as final. This helps users identify scenes where the final selection may be outdated and newer options are available.

**Acceptance Criteria:**
- [ ] A 12px blue dot with a 2px white ring appears at the bottom-right of the scene card's video thumbnail
- [ ] Indicator only shows when `has_newer_than_final` is true (see PRD-109 Amendment A.4)
- [ ] Includes a title attribute: "Newer clips exist after the final version"
- [ ] Does not interfere with existing scene card interactions (click to open, status badges)

### Requirement A.2: Generation Snapshot Panel on Clips

**Description:** A shared `GenerationSnapshotPanel` component displays the workflow, prompts, and generation parameters used to create a clip. Shown in both `ClipCard` (toggleable) and `ClipPlaybackModal` (always visible when data exists).

**Acceptance Criteria:**
- [ ] `GenerationSnapshotPanel` is a shared component at `features/scenes/GenerationSnapshotPanel.tsx`
- [ ] Displays prompts section prominently (each prompt slot with its text)
- [ ] Shows workflow name as a clickable link (see Req A.3)
- [ ] Shows metadata inline: scene type, clip position, seed image, segment index
- [ ] Generation parameters and LoRA config are shown in a collapsible section
- [ ] Renders for any clip with a non-null, non-empty `generation_snapshot` (not limited to `source === "generated"`)
- [ ] Backfilled snapshots (with `backfilled: true`) display identically to real-time snapshots

### Requirement A.3: Clickable Workflow Name with Auto-Select

**Description:** The workflow name displayed in the generation snapshot panel is a clickable link that navigates to the Workflows page and automatically selects the matching workflow.

**Acceptance Criteria:**
- [ ] Workflow name renders as a link styled with `text-[var(--color-action-primary)]`
- [ ] Clicking navigates to `/tools/workflows?name={workflowName}`
- [ ] Workflows page reads the `name` search parameter via TanStack Router's `validateSearch`
- [ ] On load, the page auto-selects the workflow whose name matches the URL parameter (case-insensitive)
- [ ] If no match is found, the page loads normally without error

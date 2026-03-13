# PRD-133: Metadata Version Approval

## 1. Introduction / Overview

Add a formal approval workflow for character metadata versions. Currently, metadata versions can be "activated" (made the live version) or "rejected" with a reason, but there is no explicit approval gate before a version qualifies for delivery. This PRD layers an approval step on top of the existing version activation system, mirroring the patterns used for image variant approval (PRD-21) and segment approval (PRD-35).

The assigned character reviewer (PRD-129) approves or rejects specific metadata versions. Only an approved metadata version can be used for final `metadata.json` delivery. Metadata approval becomes a new readiness criterion alongside `metadata_complete`, and delivery export is hard-gated on it.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-013** — Dual-Metadata System (metadata.json generation)
- **PRD-066** — Character Metadata Editor (versioning, activate/reject UI)
- **PRD-129** — Character Review Allocation (reviewer assignment)
- **PRD-107** — Character Readiness & State View (readiness computation)

### Extends
- **PRD-035** — One-Key Approval & Finalization Flow (approval pattern)
- **PRD-021** — Source Image Management & Variant Generation (approval status pattern)
- **PRD-125** — LLM Metadata Refinement Pipeline (refinement → version → approval)
- **PRD-039** — Scene Assembler & Delivery Packaging (delivery gate)
- **PRD-128** — Character Readiness Indicators (metadata section state)

### Conflicts With
- None

## 3. Goals

1. Provide a formal approve/reject workflow for character metadata versions that mirrors image and segment approval
2. Ensure only reviewer-approved metadata can be packaged into `metadata.json` for delivery
3. Integrate metadata approval status into the readiness computation so characters with unapproved metadata are flagged as incomplete
4. Maintain the existing activate/reject system — approval is a separate, additional quality gate
5. Record approval decisions with reviewer identity, timestamp, and optional rejection comments for audit trail

## 4. User Stories

- **As a reviewer**, I want to approve or reject a specific metadata version so that only quality-checked metadata makes it to delivery.
- **As a reviewer**, I want to see which metadata version is pending my approval and compare it against previous versions.
- **As a project lead**, I want character readiness to reflect whether metadata has been approved, not just whether fields are filled in.
- **As a project lead**, I want delivery export to be blocked when metadata hasn't been approved, so we never ship unreviewed content.
- **As a content creator**, I want to see the approval status of each metadata version so I know whether to keep editing or wait for review.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Metadata Version Approval Status

**Description:** Add an `approval_status` column to `character_metadata_versions` tracking whether each version has been approved, rejected, or is pending review.

**Acceptance Criteria:**
- [ ] New migration adds `approval_status` column (TEXT, default `'pending'`, NOT NULL) to `character_metadata_versions`
- [ ] Valid values: `pending`, `approved`, `rejected`
- [ ] New columns: `approved_by` (BIGINT FK → users, nullable), `approved_at` (TIMESTAMPTZ, nullable), `approval_comment` (TEXT, nullable)
- [ ] Existing versions default to `pending` status
- [ ] At most one version per character can have `approval_status = 'approved'` at any time (enforced via partial unique index or application logic — when a new version is approved, the previous approved version's status changes to `pending`)

#### Requirement 1.2: Approve / Reject Endpoints

**Description:** Add API endpoints for the assigned reviewer to approve or reject a metadata version.

**Acceptance Criteria:**
- [ ] `POST /characters/{character_id}/metadata-versions/{version_id}/approve` — Sets `approval_status` to `approved`, records `approved_by` and `approved_at`
- [ ] `POST /characters/{character_id}/metadata-versions/{version_id}/reject` — Sets `approval_status` to `rejected`, records rejection comment in `approval_comment`
- [ ] Both endpoints validate that the requesting user is the assigned reviewer for this character (via `character_review_assignments`)
- [ ] Approving a version clears any previous `approved` version for the same character (sets it back to `pending`)
- [ ] Rejection does not affect the `is_active` flag — a rejected version can still be the active version (the creator can then create a new version)
- [ ] Both endpoints return the updated `CharacterMetadataVersion` record
- [ ] Both endpoints log to `character_review_audit_log` with action `metadata_approved` or `metadata_rejected`

#### Requirement 1.3: Approval Status in Version List

**Description:** The metadata version list response must include approval status fields so the frontend can display them.

**Acceptance Criteria:**
- [ ] `CharacterMetadataVersion` model includes `approval_status`, `approved_by`, `approved_at`, `approval_comment`
- [ ] `GET /characters/{id}/metadata-versions` returns these fields for each version
- [ ] `GET /characters/{id}/metadata` response includes `approval_status` of the active version

#### Requirement 1.4: Approval UI in Metadata Tab

**Description:** Add approve/reject controls to the character metadata tab for the assigned reviewer.

**Acceptance Criteria:**
- [ ] Each metadata version in the version history shows an approval badge: `Pending` (default), `Approved` (green), `Rejected` (red)
- [ ] The assigned reviewer sees Approve and Reject buttons next to the active metadata version
- [ ] Reject opens a modal/popover for an optional comment explaining the rejection
- [ ] After approval, the badge updates immediately (optimistic or invalidation)
- [ ] Non-reviewers see the approval status badge but not the action buttons
- [ ] The approved version is visually distinguished in the version list (e.g., green border or check icon)

#### Requirement 1.5: Readiness Integration

**Description:** Add `metadata_approved` as a readiness criterion. Characters with unapproved metadata are not fully ready.

**Acceptance Criteria:**
- [ ] `evaluate_readiness()` in `core/src/readiness.rs` checks for an approved metadata version
- [ ] Missing item type `metadata_approved` is added alongside existing `metadata_complete`
- [ ] A character with complete but unapproved metadata shows `readiness_pct` reduced accordingly
- [ ] Character readiness indicators (PRD-128) reflect the new criterion in the metadata section
- [ ] `CharacterDeliverableRow` includes metadata approval status

#### Requirement 1.6: Delivery Export Gate

**Description:** Block delivery export for characters that don't have approved metadata.

**Acceptance Criteria:**
- [ ] `POST /projects/{id}/delivery/validate` reports `metadata_not_approved` as a blocking error for any character missing an approved metadata version
- [ ] `POST /projects/{id}/delivery/start-assembly` rejects the request if any included character lacks approved metadata
- [ ] Error message clearly identifies which characters are blocking: "Characters with unapproved metadata: {names}"
- [ ] The deliverables tab shows a warning badge on the metadata section when not approved

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: **[OPTIONAL — Post-MVP]** Bulk Metadata Approval

**Description:** Allow reviewers to approve metadata for multiple characters at once from the project review queue.

**Acceptance Criteria:**
- [ ] Batch approve endpoint accepts an array of `(character_id, version_id)` pairs
- [ ] Review queue UI supports multi-select and bulk approve action

#### Requirement 2.2: **[OPTIONAL — Post-MVP]** Approval Diff View

**Description:** Show a diff between the previously approved version and the version under review, highlighting field-level changes.

**Acceptance Criteria:**
- [ ] Side-by-side or inline diff view showing changed, added, and removed fields
- [ ] Unchanged fields are collapsed by default

#### Requirement 2.3: **[OPTIONAL — Post-MVP]** Approval Notifications

**Description:** Notify the reviewer when a new metadata version is ready for review, and notify the creator when their version is approved or rejected.

**Acceptance Criteria:**
- [ ] Event bus emits `metadata_version_submitted`, `metadata_version_approved`, `metadata_version_rejected` events
- [ ] In-app notifications delivered to relevant users

## 6. Non-Goals (Out of Scope)

- **Per-field approval** — This PRD approves entire metadata versions, not individual fields
- **Separate metadata reviewer role** — Reuses the existing character reviewer from PRD-129
- **Automatic approval** — No auto-approve based on source (e.g., LLM-refined); all versions require explicit reviewer action
- **Replacing activate/reject** — The existing `is_active` and `rejection_reason` system remains; approval is an additional layer
- **Approval for character settings** — Only metadata (the content fields) is covered, not pipeline settings like `elevenlabs_voice`

## 7. Design Considerations

### Approval Badge Placement
- In the version history list: inline badge next to each version's source badge and date
- On the active version: prominent badge in the metadata header area
- On the deliverables tab: metadata section shows approved/pending/rejected state

### Approve/Reject Controls
- Follow the same pattern as image variant approval: icon buttons with tooltips
- Approve: green check icon, primary variant
- Reject: red X icon, opens comment modal before confirming
- Only visible to the assigned reviewer

### Status Color Mapping
- `pending` → default/neutral badge
- `approved` → success/green badge
- `rejected` → danger/red badge

## 8. Technical Considerations

### Existing Code to Reuse
- **`character_metadata_versions` table** — Add columns to existing table
- **`character_review_assignments` table** — Query to verify reviewer authorization
- **`character_review_audit_log` table** — Log approval/rejection decisions
- **`statusBadgeVariant()` pattern** — From `features/images/types.ts` for badge rendering
- **`useActivateVersion()` / `useRejectVersion()` hooks** — Pattern for new `useApproveMetadataVersion()` / `useRejectMetadataVersion()` hooks
- **`SegmentApproval` model pattern** — Reference for the approval record structure
- **`evaluate_readiness()` in `core/src/readiness.rs`** — Add `metadata_approved` check
- **Delivery validation** in `handlers/delivery.rs` — Add metadata approval check

### New Infrastructure Needed
- Migration adding columns to `character_metadata_versions`
- Backend: approve/reject handlers with reviewer authorization check
- Frontend: approval hooks, UI controls in CharacterMetadataTab

### Database Changes

```sql
-- Add approval columns to existing table
ALTER TABLE character_metadata_versions
  ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN approved_by BIGINT REFERENCES users(id),
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN approval_comment TEXT;

-- Constraint: approval_status must be valid
ALTER TABLE character_metadata_versions
  ADD CONSTRAINT chk_metadata_approval_status
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Index for quickly finding the approved version per character
CREATE INDEX idx_metadata_versions_approved
  ON character_metadata_versions (character_id)
  WHERE approval_status = 'approved' AND deleted_at IS NULL;
```

### API Changes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/characters/{id}/metadata-versions/{vid}/approve` | Approve a metadata version |
| POST | `/characters/{id}/metadata-versions/{vid}/reject` | Reject a metadata version |

Both endpoints require the authenticated user to be the assigned reviewer for the character.

## 9. Success Metrics

- 100% of delivered characters have approved metadata versions
- Delivery export correctly blocks when metadata is unapproved
- Readiness computation reflects metadata approval status
- Reviewer can approve/reject metadata in < 2 clicks from the metadata tab

## 10. Open Questions

- Should activating a new version automatically reset its approval status to `pending`? (Proposed: yes — any new activation requires fresh approval)
- Should the existing `rejection_reason` field on `character_metadata_versions` be consolidated with the new `approval_comment`, or kept separate? (Proposed: keep separate — `rejection_reason` is for the activate/reject workflow, `approval_comment` is for the reviewer approval workflow)

## 11. Version History

- **v1.0** (2026-03-13): Initial PRD creation

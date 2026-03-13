# Task List: Metadata Version Approval

**PRD Reference:** `design/prds/133-prd-metadata-version-approval.md`
**Scope:** Add a formal approval workflow for character metadata versions — approve/reject by reviewer, readiness integration, delivery gate.

## Overview

This implementation layers an approval system on top of the existing `character_metadata_versions` table by adding `approval_status`, `approved_by`, `approved_at`, and `approval_comment` columns. New approve/reject endpoints check reviewer authorization via `character_review_assignments`. The readiness module gains a `metadata_approved` criterion, and delivery export is hard-gated on it. The frontend adds approval badges and reviewer-only controls to the metadata tab.

### What Already Exists
- `character_metadata_versions` table with `is_active`, `rejection_reason`, version numbering — extend with approval columns
- `CharacterMetadataVersionRepo` with `set_active()`, `find_active()`, CRUD — add `approve()` and `reject_approval()` methods
- `character_metadata_version.rs` handler with `activate_version()`, `reject_version()` — add `approve_metadata_version()` and `reject_metadata_approval()` handlers
- `character_review_assignments` table and `CharacterReviewRepo::find_active_by_character()` — use for reviewer authorization
- `character_review_audit_log` table and `CharacterReviewRepo::insert_audit_log()` — log approval decisions
- `evaluate_readiness()` in `core/src/readiness.rs` with `MissingItemType` enum — add `MetadataApproved` variant
- `validate_delivery()` in `handlers/delivery.rs` — add metadata approval check
- Frontend `useMetadataVersions()` / `useActivateVersion()` hooks — add `useApproveMetadataVersion()` / `useRejectMetadataApproval()` hooks
- Frontend `MetadataVersion` type — add approval fields
- Frontend `CharacterMetadataTab.tsx` with version history UI — add badges and controls

### What We're Building
1. Database migration adding approval columns to `character_metadata_versions`
2. Backend repo methods for approve/reject with single-approved enforcement
3. Backend handlers with reviewer authorization checks and audit logging
4. Readiness `MetadataApproved` criterion and delivery validation gate
5. Frontend hooks, types, approval badges, and reviewer-only controls

### Key Design Decisions
1. Approval is separate from activation — a version can be active but unapproved, or approved but not active (though in practice they align)
2. Only one version per character can be `approved` at a time — approving a new version resets the previous one to `pending`
3. Activating a new version resets its `approval_status` to `pending` — fresh approval required
4. Reviewer authorization uses existing `character_review_assignments` with `status = 'active'`

---

## Phase 1: Database Migration

### [COMPLETE] Task 1.1: Add approval columns to `character_metadata_versions`
**File:** `apps/db/migrations/20260313000006_add_metadata_version_approval.sql`

Add approval tracking columns, a CHECK constraint, and a partial index for fast approved-version lookups.

```sql
-- Add approval columns
ALTER TABLE character_metadata_versions
  ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN approved_by BIGINT REFERENCES users(id),
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN approval_comment TEXT;

-- Constraint: approval_status must be one of the valid values
ALTER TABLE character_metadata_versions
  ADD CONSTRAINT chk_metadata_approval_status
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Index for quickly finding the approved version per character
CREATE INDEX idx_metadata_versions_approved
  ON character_metadata_versions (character_id)
  WHERE approval_status = 'approved' AND deleted_at IS NULL;
```

**Acceptance Criteria:**
- [x] Migration runs cleanly on existing database
- [x] All existing rows default to `approval_status = 'pending'`
- [x] CHECK constraint rejects invalid status values
- [x] Partial index exists for approved version lookups
- [x] `approved_by` references `users(id)`

---

## Phase 2: Backend Model & Repository

### [COMPLETE] Task 2.1: Update `CharacterMetadataVersion` model
**File:** `apps/backend/crates/db/src/models/character_metadata_version.rs`

Add the four new fields to the model struct and create DTOs for the approve/reject requests.

```rust
// Add to CharacterMetadataVersion struct:
pub approval_status: String,        // "pending" | "approved" | "rejected"
pub approved_by: Option<DbId>,
pub approved_at: Option<Timestamp>,
pub approval_comment: Option<String>,

// New DTOs:
pub struct ApproveMetadataVersionRequest;  // empty — just POSTs

pub struct RejectMetadataApprovalRequest {
    pub comment: Option<String>,
}
```

**Acceptance Criteria:**
- [x] `CharacterMetadataVersion` has all four new fields
- [x] Fields derive `FromRow` and `Serialize` correctly
- [x] `ApproveMetadataVersionRequest` and `RejectMetadataApprovalRequest` DTOs exist
- [x] Compiles with `cargo check`

### [COMPLETE] Task 2.2: Update `COLUMNS` and repo methods
**File:** `apps/backend/crates/db/src/repositories/character_metadata_version_repo.rs`

Update the `COLUMNS` constant to include the new fields. Add `approve()` and `reject_approval()` methods. Ensure `set_active()` resets `approval_status` to `'pending'` when activating a version.

```rust
// COLUMNS: add "approval_status, approved_by, approved_at, approval_comment"

/// Approve a metadata version. Clears any previously approved version
/// for the same character (sets it back to 'pending'). Uses a transaction.
pub async fn approve(
    pool: &PgPool,
    character_id: DbId,
    version_id: DbId,
    user_id: DbId,
) -> Result<Option<CharacterMetadataVersion>, sqlx::Error>

/// Reject a metadata version's approval with an optional comment.
pub async fn reject_approval(
    pool: &PgPool,
    version_id: DbId,
    comment: Option<&str>,
) -> Result<Option<CharacterMetadataVersion>, sqlx::Error>

/// Find the approved version for a character (if any).
pub async fn find_approved(
    pool: &PgPool,
    character_id: DbId,
) -> Result<Option<CharacterMetadataVersion>, sqlx::Error>
```

Key implementation details:
- `approve()` must first `UPDATE ... SET approval_status = 'pending' WHERE character_id = $1 AND approval_status = 'approved'`, then `UPDATE ... SET approval_status = 'approved', approved_by = $2, approved_at = NOW()` on the target version. Both in a transaction.
- `set_active()` must additionally reset `approval_status = 'pending'` on the newly activated version (since activating a different version requires fresh approval).
- `create_as_active()` already defaults to `'pending'` via the DB default, so no change needed there.

**Acceptance Criteria:**
- [x] `COLUMNS` includes all four new fields
- [x] `approve()` sets status to `approved`, records `approved_by` and `approved_at`, clears previous approved version
- [x] `reject_approval()` sets status to `rejected` and records comment
- [x] `find_approved()` returns the approved version for a character
- [x] `set_active()` resets `approval_status` to `'pending'` on activation
- [x] All methods use transactions where needed
- [x] Compiles with `cargo check`

---

## Phase 3: Backend Handlers & Routes

### [COMPLETE] Task 3.1: Add approve/reject handlers
**File:** `apps/backend/crates/api/src/handlers/character_metadata_version.rs`

Add `approve_metadata_version()` and `reject_metadata_approval()` handler functions. Both must:
1. Extract `character_id` and `version_id` from path
2. Check the version exists and belongs to the character
3. Verify the requesting user is the active reviewer via `CharacterReviewRepo::find_active_by_character()`
4. Call the repo method
5. Log to `character_review_audit_log` with action `metadata_approved` or `metadata_rejected`
6. Return the updated `CharacterMetadataVersion` wrapped in `DataResponse`

```rust
/// POST /characters/{character_id}/metadata/versions/{version_id}/approve
pub async fn approve_metadata_version(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((character_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse>

/// POST /characters/{character_id}/metadata/versions/{version_id}/reject-approval
pub async fn reject_metadata_approval(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((character_id, version_id)): Path<(DbId, DbId)>,
    Json(body): Json<RejectMetadataApprovalRequest>,
) -> AppResult<impl IntoResponse>
```

Use typed response structs (not `serde_json::json!()`).

**Acceptance Criteria:**
- [x] `approve_metadata_version` sets approval status, records reviewer, logs audit
- [x] `reject_metadata_approval` sets rejection status with comment, logs audit
- [x] Both endpoints return 403 if user is not the assigned reviewer
- [x] Both endpoints return 404 if version doesn't exist
- [x] Both endpoints use `DataResponse<CharacterMetadataVersion>`
- [x] Audit log entries have correct `action`, `actor_user_id`, `character_id`, `metadata`
- [x] Compiles with `cargo check`

### [COMPLETE] Task 3.2: Add routes
**File:** `apps/backend/crates/api/src/routes/character_metadata_version.rs`

Add two new routes to the existing metadata version router:

```rust
.route(
    "/{version_id}/approve",
    post(character_metadata_version::approve_metadata_version),
)
.route(
    "/{version_id}/reject-approval",
    post(character_metadata_version::reject_metadata_approval),
)
```

**Acceptance Criteria:**
- [x] `POST /{character_id}/metadata/versions/{version_id}/approve` is routable
- [x] `POST /{character_id}/metadata/versions/{version_id}/reject-approval` is routable
- [x] Existing routes remain unchanged
- [x] Compiles with `cargo check`

---

## Phase 4: Readiness & Delivery Integration

### [COMPLETE] Task 4.1: Add `MetadataApproved` to readiness criteria
**File:** `apps/backend/crates/core/src/readiness.rs`

Add a new `MetadataApproved` variant to `MissingItemType` and a `metadata_approved` field to `ReadinessCriteria`. Update `evaluate_readiness()` to check this criterion.

```rust
// MissingItemType — add:
MetadataApproved,

// ReadinessCriteria — add:
pub metadata_approved: bool,

// evaluate_readiness() — add parameter:
metadata_approved: bool,

// In function body, add check block after metadata_complete:
if criteria.metadata_approved {
    total += 1;
    if metadata_approved {
        met += 1;
    } else {
        missing.push(MissingItemType::MetadataApproved.label());
    }
}
```

Also update:
- `MissingItemType::MetadataApproved.label()` → `"metadata_approved"`
- `ReadinessCriteria::default()` → `metadata_approved: true`
- `validate_criteria_json()` → add `"metadata_approved"` to boolean field list
- `parse_criteria_json()` → parse `metadata_approved` field
- All existing tests that call `evaluate_readiness()` — add the new parameter
- Add new tests for the `metadata_approved` criterion

**Acceptance Criteria:**
- [x] `MissingItemType::MetadataApproved` variant exists with label `"metadata_approved"`
- [x] `ReadinessCriteria` has `metadata_approved: bool` field (default `true`)
- [x] `evaluate_readiness()` checks `metadata_approved` when criteria requires it
- [x] `validate_criteria_json()` accepts `"metadata_approved"` boolean
- [x] `parse_criteria_json()` parses `metadata_approved` (defaults to `false` when missing from JSON)
- [x] All existing tests updated and pass
- [x] New tests cover: metadata approved met, metadata approved not met, metadata approved not in criteria
- [x] `cargo check` and `cargo test -p x121-core` pass

### [COMPLETE] Task 4.2: Update readiness evaluation callers
**Files:** All callers of `evaluate_readiness()` in the backend

Search for all call sites of `evaluate_readiness()` and add the new `metadata_approved` parameter. The caller must query `CharacterMetadataVersionRepo::find_approved()` to determine if an approved version exists.

**Acceptance Criteria:**
- [x] All callers of `evaluate_readiness()` pass the new `metadata_approved` boolean
- [x] Each caller queries the DB (or receives data) to determine if an approved metadata version exists
- [x] `cargo check` passes with no errors

### [COMPLETE] Task 4.3: Add metadata approval check to delivery validation
**File:** `apps/backend/crates/api/src/handlers/delivery.rs`

In `validate_delivery()`, after the existing character checks, iterate characters and check for an approved metadata version. Add a blocking error for each character missing one.

```rust
// In validate_delivery(), after the character loop:
for character in &characters {
    let approved = CharacterMetadataVersionRepo::find_approved(
        &state.pool, character.id
    ).await?;
    if approved.is_none() {
        issues.push(assembly::ValidationIssue {
            severity: assembly::IssueSeverity::Error,
            category: "metadata_not_approved".to_string(),
            message: format!(
                "Character '{}' has no approved metadata version",
                character.name
            ),
            entity_id: Some(character.id),
        });
    }
}
```

Also add the same check to `start_assembly()` — reject the request if any included character lacks approved metadata.

**Acceptance Criteria:**
- [x] `validate_delivery()` reports `metadata_not_approved` error for characters without approved metadata
- [x] `start_assembly()` rejects if any included character lacks approved metadata
- [x] Error messages include the character name
- [x] `cargo check` passes

---

## Phase 5: Frontend Types & Hooks

### [COMPLETE] Task 5.1: Update `MetadataVersion` type
**File:** `apps/frontend/src/features/characters/types.ts`

Add approval fields to the `MetadataVersion` interface:

```typescript
export interface MetadataVersion {
  // ... existing fields ...
  approval_status: "pending" | "approved" | "rejected";
  approved_by: number | null;
  approved_at: string | null;
  approval_comment: string | null;
}
```

**Acceptance Criteria:**
- [x] `MetadataVersion` has all four new fields with correct types
- [x] `npx tsc --noEmit` passes

### [COMPLETE] Task 5.2: Add approval mutation hooks
**File:** `apps/frontend/src/features/characters/hooks/use-metadata-versions.ts`

Add two new mutation hooks following the existing pattern:

```typescript
/** Approve a metadata version (reviewer only). */
export function useApproveMetadataVersion(characterId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: number) =>
      api.post<MetadataVersion>(
        `/characters/${characterId}/metadata/versions/${versionId}/approve`,
        {},
      ),
    onSuccess: () => invalidateVersionsAndMetadata(queryClient, characterId),
  });
}

/** Reject a metadata version's approval (reviewer only). */
export function useRejectMetadataApproval(characterId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { versionId: number; comment?: string }) =>
      api.post<MetadataVersion>(
        `/characters/${characterId}/metadata/versions/${data.versionId}/reject-approval`,
        { comment: data.comment },
      ),
    onSuccess: () => invalidateVersionsAndMetadata(queryClient, characterId),
  });
}
```

**Acceptance Criteria:**
- [x] `useApproveMetadataVersion` calls POST approve endpoint and invalidates queries
- [x] `useRejectMetadataApproval` calls POST reject-approval endpoint with optional comment
- [x] Both hooks follow existing pattern (query key invalidation via `invalidateVersionsAndMetadata`)
- [x] `npx tsc --noEmit` passes

---

## Phase 6: Frontend UI

### [COMPLETE] Task 6.1: Add approval status helper
**File:** `apps/frontend/src/features/characters/types.ts`

Add a `metadataApprovalBadgeVariant()` helper function for consistent badge rendering:

```typescript
export function metadataApprovalBadgeVariant(
  status: MetadataVersion["approval_status"],
): "success" | "danger" | "default" {
  switch (status) {
    case "approved": return "success";
    case "rejected": return "danger";
    default: return "default";
  }
}

export const METADATA_APPROVAL_LABEL: Record<MetadataVersion["approval_status"], string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};
```

**Acceptance Criteria:**
- [x] `metadataApprovalBadgeVariant()` maps statuses to badge variants
- [x] `METADATA_APPROVAL_LABEL` provides human-readable labels
- [x] `npx tsc --noEmit` passes

### [COMPLETE] Task 6.2: Add approval badges and controls to CharacterMetadataTab
**File:** `apps/frontend/src/features/characters/tabs/CharacterMetadataTab.tsx`

Modify the metadata tab to show:

1. **Approval badge** on each version in the version history list — `Pending Review` (default), `Approved` (green), `Rejected` (red)
2. **Approve / Reject buttons** visible only to the assigned reviewer on the active version
3. **Rejection comment modal** — when clicking Reject, a modal with an optional text input for the comment
4. **Approved version visual distinction** — green left border or check icon on the approved version row

Implementation approach:
- Import `useApproveMetadataVersion` and `useRejectMetadataApproval` hooks
- Determine if current user is the reviewer by checking `character_review_assignments` (add a `useCharacterReviewAssignment(characterId)` hook or pass reviewer info as a prop)
- Add `Badge` with `metadataApprovalBadgeVariant()` next to each version's existing source badge
- Add `Button` controls (Approve: green check icon, Reject: red X icon) with Tooltip wrappers, following the image variant pattern
- Add a small `Modal` for rejection comment input

**Acceptance Criteria:**
- [x] Each version row shows an approval status badge
- [x] Approved version has visual distinction (green border or check icon)
- [x] Reviewer sees Approve and Reject buttons on the active version
- [x] Non-reviewers see badges only, no action buttons
- [x] Reject button opens a modal for optional comment entry
- [x] After approval/rejection, badge updates via query invalidation
- [x] `npx tsc --noEmit` passes

### [COMPLETE] Task 6.3: Add approval warning to deliverables tab
**File:** `apps/frontend/src/features/characters/tabs/CharacterDeliverablesTab.tsx`

Show a warning badge on the Metadata section when the active metadata version is not approved.

**Acceptance Criteria:**
- [x] Metadata section shows `Approved` (green) or `Not Approved` (yellow/orange) badge
- [x] Badge pulls from the active version's `approval_status`
- [x] `npx tsc --noEmit` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260313000006_add_metadata_version_approval.sql` | Migration adding approval columns |
| `apps/backend/crates/db/src/models/character_metadata_version.rs` | Model with new approval fields + DTOs |
| `apps/backend/crates/db/src/repositories/character_metadata_version_repo.rs` | Repo with approve/reject/find_approved methods |
| `apps/backend/crates/api/src/handlers/character_metadata_version.rs` | Approve/reject handlers with reviewer auth |
| `apps/backend/crates/api/src/routes/character_metadata_version.rs` | New approve/reject-approval routes |
| `apps/backend/crates/core/src/readiness.rs` | `MetadataApproved` criterion + evaluate_readiness update |
| `apps/backend/crates/api/src/handlers/delivery.rs` | Delivery validation gate |
| `apps/frontend/src/features/characters/types.ts` | `MetadataVersion` type + approval helpers |
| `apps/frontend/src/features/characters/hooks/use-metadata-versions.ts` | Approval mutation hooks |
| `apps/frontend/src/features/characters/tabs/CharacterMetadataTab.tsx` | Approval badges + reviewer controls |
| `apps/frontend/src/features/characters/tabs/CharacterDeliverablesTab.tsx` | Approval warning badge |

---

## Dependencies

### Existing Components to Reuse
- `CharacterReviewRepo::find_active_by_character()` from `db/src/repositories/character_review_repo.rs` — reviewer authorization
- `CharacterReviewRepo::insert_audit_log()` from same file — audit logging
- `Badge` from `@/components/primitives` — status badges
- `Button` + `Tooltip` from `@/components/primitives` — approve/reject controls (icon-only with tooltip pattern from image variants)
- `Modal` from `@/components/composite` — rejection comment dialog
- `statusBadgeVariant()` pattern from `features/images/types.ts` — consistent badge variant mapping
- `invalidateVersionsAndMetadata()` from `use-metadata-versions.ts` — shared query invalidation

### New Infrastructure Needed
- 1 SQL migration
- 3 repo methods (`approve`, `reject_approval`, `find_approved`)
- 2 handler functions
- 2 route registrations
- 1 readiness enum variant + criteria field + evaluate parameter
- 2 frontend mutation hooks
- 1 badge helper + label map
- UI additions in 2 tab components

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Migration — Task 1.1
2. Phase 2: Backend Model & Repository — Tasks 2.1-2.2
3. Phase 3: Backend Handlers & Routes — Tasks 3.1-3.2
4. Phase 4: Readiness & Delivery — Tasks 4.1-4.3
5. Phase 5: Frontend Types & Hooks — Tasks 5.1-5.2
6. Phase 6: Frontend UI — Tasks 6.1-6.3

**MVP Success Criteria:**
- Reviewer can approve/reject metadata versions from the metadata tab
- Approval status visible on all versions
- Readiness score reflects metadata approval
- Delivery export blocked without approved metadata

### Post-MVP Enhancements
- Bulk metadata approval from project review queue
- Approval diff view (field-level change comparison)
- Event bus notifications for approval/rejection

---

## Notes

1. The `approval_status` reset on activation is critical — without it, a user could activate a different version and bypass the approval gate
2. Reviewer authorization uses the existing `character_review_assignments` table — no new permission system needed
3. The `reject-approval` endpoint is intentionally named differently from the existing `reject` endpoint (which handles the activate/reject workflow, not the reviewer approval workflow)
4. The `approval_comment` field is separate from `rejection_reason` — they serve different workflows (reviewer approval vs version activation)
5. Run `dry-guy` agent after all frontend changes are complete

---

## Version History

- **v1.0** (2026-03-13): Initial task list creation from PRD-133

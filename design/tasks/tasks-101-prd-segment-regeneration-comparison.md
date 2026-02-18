# Task List: Segment Regeneration Comparison

**PRD Reference:** `design/prds/101-prd-segment-regeneration-comparison.md`
**Scope:** Build automatic side-by-side comparison for regenerated segments with synchronized playback, SSIM difference highlighting, QA score comparison, quick accept/revert actions, version history browsing, and batch comparison workflow.

## Overview

Regeneration is the most common response to a rejected segment, and "Is the new version better?" is the immediate question. This PRD provides: automatic side-by-side comparison when a rejected segment is regenerated; synchronized playback of old vs. new versions; optional SSIM-based difference highlighting showing regions of maximum divergence; QA score comparison with color-coded improvement/degradation; quick one-click accept/revert/keep-both actions; version history filmstrip for browsing all previous versions; and a batch comparison workflow for reviewing multiple regenerated segments sequentially.

### What Already Exists
- PRD-035 Review Interface (approval actions)
- PRD-049 Automated Quality Gates (QA scores)
- PRD-050 Content Branching ("Keep Both" action)
- PRD-083 Video playback engine (dual player instances)
- PRD-036 Sync-play coordinator
- PRD-000 database infrastructure

### What We're Building
1. Auto-trigger comparison view on regeneration completion
2. Synchronized dual-player comparison layout
3. SSIM-based difference overlay (server-side or WebAssembly)
4. QA score comparison display
5. Quick actions: Keep New, Revert to Old, Keep Both
6. Version history filmstrip browser
7. Batch comparison workflow for multiple regenerations
8. Database table for segment versions and API endpoints

### Key Design Decisions
1. **Comparison is the default view** — After regeneration, comparison appears automatically. Not opt-in.
2. **SSIM computed server-side** — SSIM difference overlay is computationally expensive; pre-computed on the server and served as an overlay image.
3. **Version filmstrip** — All previous versions stored; any two can be compared.
4. **"Keep Both" creates a branch** — Via PRD-050 content branching system.

---

## Phase 1: Database & API

### Task 1.1: Create Segment Versions Table
**File:** `migrations/YYYYMMDD_create_segment_versions.sql`

```sql
CREATE TABLE segment_versions (
    id BIGSERIAL PRIMARY KEY,
    segment_id BIGINT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    video_path TEXT NOT NULL,
    qa_scores_json JSONB,              -- { "face": 0.89, "motion": 0.68 }
    params_json JSONB,                  -- Generation parameters used
    selected BOOLEAN NOT NULL DEFAULT FALSE,  -- Is this the active version?
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_segment_versions_segment_id ON segment_versions(segment_id);
CREATE UNIQUE INDEX uq_segment_versions_segment_version ON segment_versions(segment_id, version_number);
CREATE INDEX idx_segment_versions_selected ON segment_versions(segment_id, selected) WHERE selected = TRUE;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON segment_versions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `segment_versions` stores multiple versions per segment with video path and QA scores
- [ ] Unique constraint on (segment_id, version_number)
- [ ] `selected` flag marks the active version
- [ ] Partial index on selected=TRUE for efficient active version queries
- [ ] All FK columns indexed, `updated_at` trigger

### Task 1.2: Segment Version Model & Repository
**File:** `src/models/segment_version.rs`, `src/repositories/segment_version_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SegmentVersion {
    pub id: DbId,
    pub segment_id: DbId,
    pub version_number: i32,
    pub video_path: String,
    pub qa_scores_json: Option<serde_json::Value>,
    pub params_json: Option<serde_json::Value>,
    pub selected: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl SegmentVersionRepo {
    pub async fn get_versions(&self, segment_id: DbId) -> Result<Vec<SegmentVersion>>;
    pub async fn select_version(&self, segment_id: DbId, version_number: i32) -> Result<()>;
    pub async fn create_version(&self, segment_id: DbId, video_path: &str, params: serde_json::Value) -> Result<SegmentVersion>;
}
```

**Acceptance Criteria:**
- [ ] Model and repository with version CRUD
- [ ] `select_version` marks one version as selected and unmarks others
- [ ] `get_versions` returns all versions ordered by version_number
- [ ] Unit tests

### Task 1.3: Comparison API
**File:** `src/routes/segment_comparison.rs`

```rust
pub fn comparison_routes() -> Router<AppState> {
    Router::new()
        .route("/segments/:id/versions", get(list_versions))
        .route("/segments/:id/compare", get(compare_versions))
        .route("/segments/:id/versions/:v/diff-overlay", get(diff_overlay))
        .route("/segments/:id/versions/:v/select", post(select_version))
}
```

**Acceptance Criteria:**
- [ ] `GET /segments/:id/versions` returns all versions with metadata
- [ ] `GET /segments/:id/compare?v1=1&v2=2` returns comparison data for two versions
- [ ] `GET /segments/:id/versions/:v/diff-overlay` returns SSIM difference overlay image
- [ ] `POST /segments/:id/versions/:v/select` marks a version as the selected/active one

---

## Phase 2: SSIM Difference Service

### Task 2.1: SSIM Calculator
**File:** `src/services/ssim_calculator.rs`

```rust
pub struct SSIMCalculator {
    // Computes SSIM-based difference between two video versions
}

impl SSIMCalculator {
    pub async fn compute_diff(
        &self,
        video_a_path: &str,
        video_b_path: &str,
    ) -> Result<DiffResult> {
        // Extract corresponding frames from both versions
        // Compute SSIM per frame pair
        // Generate heat map overlay images
    }
}
```

**Acceptance Criteria:**
- [ ] Compute SSIM between corresponding frames of two versions
- [ ] Generate heat map overlay: blue = identical, red = maximum difference
- [ ] SSIM computation completes in <5 seconds per comparison
- [ ] Heat map stored as overlay images for client rendering

---

## Phase 3: Comparison View

### Task 3.1: Side-by-Side Comparison Component
**File:** `frontend/src/features/comparison/RegenerationComparison.tsx`

```typescript
interface RegenerationComparisonProps {
  segmentId: number;
  oldVersion: number;
  newVersion: number;
}

export const RegenerationComparison: React.FC<RegenerationComparisonProps> = (props) => {
  // Old version on left, new on right
  // Synchronized playback
  // Difference overlay toggle
  // QA score comparison
  // Quick action buttons
};
```

**Acceptance Criteria:**
- [ ] Old version on left, new version on right
- [ ] Renders within 2 seconds of regeneration completion
- [ ] No manual navigation required — comparison appears automatically

### Task 3.2: Synchronized Dual Playback
**File:** `frontend/src/features/comparison/useDualSync.ts`

**Acceptance Criteria:**
- [ ] Play, pause, scrub, and frame-step controls affect both simultaneously
- [ ] Frame-accurate synchronization via PRD-083 engine
- [ ] Individual volume controls per side

### Task 3.3: Difference Overlay Toggle
**File:** `frontend/src/features/comparison/DiffOverlay.tsx`

**Acceptance Criteria:**
- [ ] Optional SSIM-based difference overlay
- [ ] Heat map: blue = identical, red = maximum difference
- [ ] Toggleable on/off (overlay can be visually cluttering)
- [ ] Renders on top of the new version video

---

## Phase 4: QA Score Comparison

### Task 4.1: Score Comparison Display
**File:** `frontend/src/features/comparison/QAScoreComparison.tsx`

**Acceptance Criteria:**
- [ ] Show PRD-049 QA scores for both versions side by side
- [ ] Format: "Old: face 0.82, motion 0.71. New: face 0.89, motion 0.68"
- [ ] Color-coded: green for improved metrics, red for degraded
- [ ] Overall improvement/degradation summary

---

## Phase 5: Quick Actions

### Task 5.1: Comparison Action Buttons
**File:** `frontend/src/features/comparison/ComparisonActions.tsx`

**Acceptance Criteria:**
- [ ] "Keep New" — approve the regeneration (selects new version)
- [ ] "Revert to Old" — restore previous version
- [ ] "Keep Both" — create a branch via PRD-050
- [ ] Single keyboard shortcut for each action
- [ ] Users make decisions in <10 seconds on average

---

## Phase 6: Version History

### Task 6.1: Version Filmstrip Browser
**File:** `frontend/src/features/comparison/VersionFilmstrip.tsx`

**Acceptance Criteria:**
- [ ] Filmstrip showing all previous versions of a segment
- [ ] Select any two versions for side-by-side comparison
- [ ] Version metadata: generation date, parameters used, QA scores
- [ ] Thumbnail per version for visual identification

---

## Phase 7: Batch Comparison

### Task 7.1: Batch Comparison Workflow
**File:** `frontend/src/features/comparison/BatchComparison.tsx`

**Acceptance Criteria:**
- [ ] When multiple segments regenerated at once, present sequential comparison workflow
- [ ] Review each regenerated segment one by one
- [ ] Accept/revert each with progress tracking
- [ ] Summary at end: "Kept new: 8, Reverted: 2"
- [ ] Skip option for segments to review later

---

## Phase 8: Testing

### Task 8.1: Comprehensive Tests
**File:** `tests/comparison_test.rs`, `frontend/src/features/comparison/__tests__/`

**Acceptance Criteria:**
- [ ] Comparison view renders within 2 seconds of regeneration
- [ ] Synchronized playback maintains frame-level accuracy
- [ ] SSIM overlay renders in <5 seconds per comparison
- [ ] Quick actions correctly select/revert versions
- [ ] Version filmstrip correctly lists all versions
- [ ] Batch comparison workflow tracks progress correctly
- [ ] Users make accept/revert decisions in <10 seconds on average

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_segment_versions.sql` | Segment versions table |
| `src/models/segment_version.rs` | Rust model struct |
| `src/repositories/segment_version_repo.rs` | Version repository |
| `src/routes/segment_comparison.rs` | Axum API endpoints |
| `src/services/ssim_calculator.rs` | SSIM difference calculator |
| `frontend/src/features/comparison/RegenerationComparison.tsx` | Comparison view |
| `frontend/src/features/comparison/DiffOverlay.tsx` | Difference overlay |
| `frontend/src/features/comparison/QAScoreComparison.tsx` | QA score display |
| `frontend/src/features/comparison/ComparisonActions.tsx` | Quick action buttons |
| `frontend/src/features/comparison/VersionFilmstrip.tsx` | Version history |
| `frontend/src/features/comparison/BatchComparison.tsx` | Batch workflow |

## Dependencies
- PRD-035: Review Interface (approval actions)
- PRD-049: Automated Quality Gates (QA scores)
- PRD-050: Content Branching ("Keep Both" action)
- PRD-083: Video playback engine (dual player instances)
- PRD-036: Sync-play coordinator

## Implementation Order
### MVP
1. Phase 1 (Database & API) — version table and comparison endpoints
2. Phase 2 (SSIM) — difference calculation service
3. Phase 3 (Comparison View) — side-by-side with sync playback
4. Phase 4 (QA Scores) — score comparison display
5. Phase 5 (Quick Actions) — keep new, revert, keep both
6. Phase 6 (History) — version filmstrip
7. Phase 7 (Batch) — sequential batch comparison

### Post-MVP Enhancements
- A/B blind test: randomized display without labeling which is old/new

## Notes
- Comparison must be the default view after regeneration — not opt-in.
- SSIM computation is expensive; pre-compute on the server and cache the overlay images.
- Quick actions should be keyboard-accessible for fast decision-making.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

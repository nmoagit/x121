# Task List: First-Run Experience & Onboarding

**PRD Reference:** `design/prds/053-prd-first-run-experience-onboarding.md`
**Scope:** Build a guided onboarding system with interactive welcome tour, pre-loaded sample project, contextual hints, progressive feature reveal, role-specific paths, and a getting-started checklist on the dashboard.

## Overview

A complex platform needs guided introduction. This PRD provides onboarding that lets new users experience the workflow immediately and build confidence before investing in their own data. An interactive welcome tour highlights main navigation areas, a sample project demonstrates the review-approve-regenerate workflow, contextual hints appear on first encounter with features, and a checklist tracks getting-started milestones. Role-specific paths ensure Admins, Creators, and Reviewers each see relevant guidance.

### What Already Exists
- PRD-003 RBAC (for role-specific onboarding paths)
- PRD-042 Studio Pulse Dashboard (for checklist widget)
- PRD-029 design system components
- PRD-004 session persistence

### What We're Building
1. Interactive welcome tour engine (highlight, step-through, skip)
2. Sample project seed data and management
3. Contextual hint system (one-time tooltips)
4. Progressive feature reveal based on workflow completion
5. Role-specific onboarding path definitions
6. Dashboard onboarding checklist widget
7. Backend API for onboarding state management

### Key Design Decisions
1. **Tour is skippable and re-accessible** — Never lock users into a tour. Available again from Help menu.
2. **Sample project is real** — Includes actual generated segments for hands-on exploration, not a static mockup.
3. **Hints are one-shot** — Each hint appears once per feature, dismissible individually or all at once.
4. **Features subdued, not hidden** — Advanced features are visually subdued but accessible if explicitly sought.

---

## Phase 1: Database & API for Onboarding State

### Task 1.1: Create User Onboarding Table
**File:** `migrations/YYYYMMDD_create_user_onboarding.sql`

```sql
CREATE TABLE user_onboarding (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tour_completed BOOLEAN NOT NULL DEFAULT FALSE,
    hints_dismissed_json JSONB NOT NULL DEFAULT '[]',  -- Array of dismissed hint IDs
    checklist_progress_json JSONB NOT NULL DEFAULT '{}', -- { "upload_portrait": true, "run_generation": false, ... }
    feature_reveal_json JSONB NOT NULL DEFAULT '{}',     -- { "advanced_workflow": false, "branching": false, ... }
    sample_project_id BIGINT NULL,                        -- FK to the user's sample project
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_onboarding_user_id ON user_onboarding(user_id);
CREATE INDEX idx_user_onboarding_user_id ON user_onboarding(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_onboarding
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `user_onboarding` tracks tour completion, dismissed hints, checklist progress, and feature reveals
- [ ] One row per user (unique constraint on user_id)
- [ ] Optional FK to sample project
- [ ] `updated_at` trigger applied

### Task 1.2: Onboarding Model & Repository
**File:** `src/models/onboarding.rs`, `src/repositories/onboarding_repo.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserOnboarding {
    pub id: DbId,
    pub user_id: DbId,
    pub tour_completed: bool,
    pub hints_dismissed_json: serde_json::Value,
    pub checklist_progress_json: serde_json::Value,
    pub feature_reveal_json: serde_json::Value,
    pub sample_project_id: Option<DbId>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl OnboardingRepo {
    pub async fn get_or_create(&self, user_id: DbId) -> Result<UserOnboarding>;
    pub async fn update_onboarding(&self, user_id: DbId, update: UpdateOnboarding) -> Result<UserOnboarding>;
    pub async fn reset_onboarding(&self, user_id: DbId) -> Result<()>;
}
```

**Acceptance Criteria:**
- [ ] `get_or_create` creates onboarding row on first access
- [ ] `update_onboarding` supports partial updates to any field
- [ ] `reset_onboarding` clears all progress for re-onboarding
- [ ] Unit tests for repository operations

### Task 1.3: Onboarding API Endpoints
**File:** `src/routes/onboarding.rs`

```rust
pub fn onboarding_routes() -> Router<AppState> {
    Router::new()
        .route("/user/onboarding", get(get_onboarding).put(update_onboarding))
        .route("/user/onboarding/reset", post(reset_onboarding))
}
```

**Acceptance Criteria:**
- [ ] `GET /user/onboarding` returns current onboarding state
- [ ] `PUT /user/onboarding` updates tour, hints, checklist, or feature reveal state
- [ ] `POST /user/onboarding/reset` resets all onboarding state

---

## Phase 2: Welcome Tour

### Task 2.1: Tour Engine Component
**File:** `frontend/src/features/onboarding/TourEngine.tsx`

```typescript
interface TourStep {
  target: string;          // CSS selector for the highlighted element
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

interface TourEngineProps {
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
}
```

**Acceptance Criteria:**
- [ ] Step-by-step walkthrough with spotlight highlights on target elements
- [ ] Explanatory text for each step
- [ ] Skip button available at any point
- [ ] Progress indicator (step 2 of 5)
- [ ] Tour overlay does not block entire UI — real interface visible behind

### Task 2.2: Role-Specific Tour Paths
**File:** `frontend/src/features/onboarding/tourPaths.ts`

```typescript
export const tourPaths: Record<string, TourStep[]> = {
  admin: [
    { target: '#nav-dashboard', title: 'Dashboard', description: 'Monitor system health and worker status' },
    { target: '#nav-settings', title: 'Settings', description: 'Configure workers, users, and infrastructure' },
    // ... admin-specific steps
  ],
  creator: [
    { target: '#nav-library', title: 'Library', description: 'Your characters, scenes, and generated content' },
    { target: '#nav-workflow', title: 'Workflow Editor', description: 'Build and customize generation pipelines' },
    // ... creator-specific steps
  ],
  reviewer: [
    { target: '#nav-review', title: 'Review Queue', description: 'Segments awaiting your approval' },
    { target: '#review-shortcuts', title: 'Quick Review', description: 'Use keyboard shortcuts for rapid review' },
    // ... reviewer-specific steps
  ],
};
```

**Acceptance Criteria:**
- [ ] Admin path: infrastructure setup, worker configuration, user management
- [ ] Creator path: generation workflow, parameter tuning, batch operations
- [ ] Reviewer path: approval workflow, review shortcuts, annotation tools
- [ ] Role determined from PRD-003 RBAC assignment
- [ ] Tour completable in <3 minutes

### Task 2.3: Tour Re-Access
**File:** integration in Help menu

**Acceptance Criteria:**
- [ ] Tour re-accessible from Help menu at any time
- [ ] "Restart Tour" option resets tour progress and re-plays

---

## Phase 3: Sample Project

### Task 3.1: Sample Project Seed Data
**File:** `src/services/sample_project.rs`

Create a service that provisions a demo project for a new user.

**Acceptance Criteria:**
- [ ] Includes a character with seed images and pre-generated segments
- [ ] Users can explore the full workflow: review, approve, regenerate
- [ ] Clearly labeled as "Demo Project" with a distinct visual marker
- [ ] Deletable by the user once ready to work with real data
- [ ] Provisioned on first login (or on demand from onboarding)

### Task 3.2: Sample Project API
**File:** `src/routes/onboarding.rs` (extend)

**Acceptance Criteria:**
- [ ] `POST /user/onboarding/create-sample-project` provisions the sample project
- [ ] `DELETE /user/onboarding/sample-project` deletes the sample project
- [ ] Sample project created with realistic but clearly demo content

---

## Phase 4: Contextual Hints

### Task 4.1: Hint System Component
**File:** `frontend/src/features/onboarding/ContextualHint.tsx`

```typescript
interface ContextualHintProps {
  hintId: string;          // Unique hint identifier
  children: React.ReactNode;  // The element to attach the hint to
  message: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export const ContextualHint: React.FC<ContextualHintProps> = ({
  hintId,
  children,
  message,
  placement = 'bottom',
}) => {
  const { isDismissed, dismiss } = useHintState(hintId);
  if (isDismissed) return <>{children}</>;
  // Render tooltip on first encounter
};
```

**Acceptance Criteria:**
- [ ] Hints appear once per feature on first encounter
- [ ] Dismissible individually (click X or "Got it")
- [ ] "Don't show tips" dismisses all remaining hints
- [ ] Content is concise and actionable
- [ ] Dismissed hints persisted to onboarding state

### Task 4.2: Hint Definitions
**File:** `frontend/src/features/onboarding/hintDefinitions.ts`

**Acceptance Criteria:**
- [ ] Hints defined for each major feature area (Workflow Editor, Library, Review, etc.)
- [ ] Example: "Drag nodes from the sidebar to build a pipeline" (first time in Workflow Editor)
- [ ] Example: "Press Enter to approve, Backspace to reject" (first time in Review)

---

## Phase 5: Progressive Feature Reveal

### Task 5.1: Feature Reveal Controller
**File:** `frontend/src/features/onboarding/useFeatureReveal.ts`

```typescript
export function useFeatureReveal(featureKey: string): {
  isRevealed: boolean;
  reveal: () => void;
} {
  // Advanced features are visually subdued until basic workflows are completed
  // Not hidden — accessible if explicitly sought
}
```

**Acceptance Criteria:**
- [ ] Advanced features (Worker Pool, Branching, Custom Themes) visually subdued during early sessions
- [ ] Features "unlock" visually after completing basic workflows
- [ ] Not hidden — clickable if explicitly sought, just visually de-emphasized
- [ ] Reveal state persisted in onboarding JSON

---

## Phase 6: Onboarding Checklist

### Task 6.1: Checklist Widget
**File:** `frontend/src/features/onboarding/OnboardingChecklist.tsx`

```typescript
interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

const checklistItems: ChecklistItem[] = [
  { id: 'upload_portrait', label: 'Upload your first portrait', completed: false },
  { id: 'run_generation', label: 'Run your first generation', completed: false },
  { id: 'approve_segment', label: 'Approve your first segment', completed: false },
];
```

**Acceptance Criteria:**
- [ ] Displayed as a card/widget on the PRD-042 Dashboard
- [ ] Completion tracking with checkmarks
- [ ] Progress persists across sessions
- [ ] Dismissible once completed or manually hidden
- [ ] Clicking an incomplete item navigates to the relevant area

---

## Phase 7: Integration & Testing

### Task 7.1: Onboarding Flow Integration
**File:** `frontend/src/features/onboarding/OnboardingGate.tsx`

**Acceptance Criteria:**
- [ ] On first login, detect new user and trigger welcome tour
- [ ] Tour path selected based on user role from PRD-003
- [ ] After tour, show sample project prompt
- [ ] Checklist widget appears on dashboard until dismissed

### Task 7.2: Comprehensive Tests
**File:** `frontend/src/features/onboarding/__tests__/`

**Acceptance Criteria:**
- [ ] Tour steps render correctly for each role
- [ ] Tour skip correctly marks tour as completed
- [ ] Hints appear once and only once per feature
- [ ] "Don't show tips" dismisses all hints
- [ ] Checklist progress persists across sessions
- [ ] Sample project creation and deletion work correctly
- [ ] Feature reveal state updates on workflow completion

---

## Relevant Files
| File | Description |
|------|-------------|
| `migrations/YYYYMMDD_create_user_onboarding.sql` | Onboarding state table |
| `src/models/onboarding.rs` | Rust model struct |
| `src/repositories/onboarding_repo.rs` | Onboarding repository |
| `src/routes/onboarding.rs` | Axum API endpoints |
| `src/services/sample_project.rs` | Sample project provisioner |
| `frontend/src/features/onboarding/TourEngine.tsx` | Tour component |
| `frontend/src/features/onboarding/tourPaths.ts` | Role-specific tour definitions |
| `frontend/src/features/onboarding/ContextualHint.tsx` | Hint system |
| `frontend/src/features/onboarding/OnboardingChecklist.tsx` | Dashboard checklist |
| `frontend/src/features/onboarding/useFeatureReveal.ts` | Feature reveal logic |

## Dependencies
- PRD-003: RBAC (for role-specific onboarding paths)
- PRD-042: Studio Pulse Dashboard (for checklist widget)
- PRD-029: Design system components
- PRD-004: Session persistence (onboarding state)

## Implementation Order
### MVP
1. Phase 1 (Database & API) — onboarding state persistence
2. Phase 2 (Welcome Tour) — tour engine and role-specific paths
3. Phase 3 (Sample Project) — demo project provisioning
4. Phase 4 (Contextual Hints) — one-time feature hints
5. Phase 5 (Feature Reveal) — progressive disclosure of advanced features
6. Phase 6 (Checklist) — dashboard getting-started widget

### Post-MVP Enhancements
- Embedded video tutorials for complex workflows

## Notes
- Tour overlays should not block the entire UI — the real interface remains visible.
- Sample project should demonstrate a realistic workflow, not a toy example.
- Hints should feel helpful and professional, not patronizing.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

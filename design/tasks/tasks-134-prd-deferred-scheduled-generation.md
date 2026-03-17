# Task List: Deferred / Scheduled Generation

**PRD Reference:** `design/prds/134-prd-deferred-scheduled-generation.md`
**Scope:** Add ability to schedule scene video generation for a future time, with split-button UX, bulk scheduling, and management from the Job Scheduling page.

## Overview

This feature extends the existing PRD-119 schedule system to support a new `schedule_generation` action type. When a schedule fires, it calls the existing batch generation logic. A new "Scheduled" scene status (ID 8) provides visual feedback. The frontend gets a `SplitButton` design system component and a `ScheduleGenerationModal` for picking date/time.

### What Already Exists
- `Schedule` model + repository + CRUD endpoints (PRD-119)
- Schedule executor background service (PRD-119)
- `batch_generate()` handler for starting multiple scenes (PRD-057)
- `SceneStatus` enum with IDs 1-7
- `Button` primitive component with variant/size props
- `Modal` composite component
- Job scheduling page at `/admin/job-scheduling`
- Generation hooks (`useStartGeneration`, `useBatchGenerate`)

### What We're Building
1. "Scheduled" scene status (ID 8) — database + backend + frontend
2. `schedule_generation` action type in the schedule executor
3. `POST /api/v1/scenes/schedule-generation` endpoint
4. `POST /api/v1/schedules/{id}/cancel` endpoint with scene status revert
5. `SplitButton` design system component
6. `ScheduleGenerationModal` component
7. Split-button Generate on scene cards + toolbar schedule actions
8. Generation filter + management actions on Job Scheduling page

### Key Design Decisions
1. Uses PRD-119 schedule system (not raw `scheduled_start_at` on jobs) — schedule entries are manageable before they fire
2. New scene status "Scheduled" (ID 8) distinguishes from "Pending" and "Generating"
3. SplitButton added to design system as a reusable primitive
4. All selected scenes get the same scheduled time for bulk operations

---

## Phase 1: Database & Backend Foundation [COMPLETE]

### Task 1.1:  Add "Scheduled" Scene Status Migration [COMPLETE]
**File:** `apps/db/migrations/20260317000001_add_scheduled_scene_status.sql`

Add the new "Scheduled" status to the `scene_statuses` lookup table.

```sql
INSERT INTO scene_statuses (id, name) VALUES (8, 'Scheduled')
ON CONFLICT (id) DO NOTHING;
```

**Implementation:** Also widens `schedules.action_type` CHECK to include `schedule_generation` and `schedule_history.status` CHECK to include `cancelled`.

**Acceptance Criteria:**
- [x] Migration inserts status ID 8 with name "Scheduled"
- [x] Migration is idempotent (ON CONFLICT)
- [x] `sqlx migrate run` succeeds

### Task 1.2:  Add Scheduled Variant to Rust SceneStatus Enum [COMPLETE]
**File:** `apps/backend/crates/db/src/models/status.rs`

Add `Scheduled = 8` to the `SceneStatus` enum and update the `from_id`, `id()`, `name()` methods and tests.

**Acceptance Criteria:**
- [x] `SceneStatus::Scheduled` variant exists with value 8
- [x] `SceneStatus::from_id(8)` returns `Some(SceneStatus::Scheduled)`
- [x] `SceneStatus::Scheduled.name()` returns `"Scheduled"`
- [x] Existing tests updated to account for the new variant
- [x] `cargo check` passes

### Task 1.3:  Add `schedule_generation` Action Type [COMPLETE]
**File:** `apps/backend/crates/core/src/job_scheduling.rs`

Add the new action type constant and include it in validation.

```rust
pub const ACTION_SCHEDULE_GENERATION: &str = "schedule_generation";
pub const VALID_ACTION_TYPES: &[&str] = &[
    ACTION_SUBMIT_JOB,
    ACTION_SUBMIT_BATCH,
    ACTION_SCHEDULE_GENERATION,
];
```

**Acceptance Criteria:**
- [x] `ACTION_SCHEDULE_GENERATION` constant defined as `"schedule_generation"`
- [x] `VALID_ACTION_TYPES` array includes the new constant
- [x] `validate_action_type("schedule_generation")` returns `Ok(())`
- [x] Existing action types still validate correctly
- [x] `cargo check` passes

### Task 1.4:  Create Schedule Generation Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/generation.rs`

Add `POST /api/v1/scenes/schedule-generation` that creates a one-time schedule entry and sets scene statuses to "Scheduled".

```rust
#[derive(Debug, Deserialize)]
pub struct ScheduleGenerationRequest {
    pub scene_ids: Vec<DbId>,
    pub scheduled_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ScheduleGenerationResponse {
    pub schedule_id: DbId,
    pub scenes_scheduled: usize,
}
```

Implementation steps:
1. Validate `scheduled_at` is in the future
2. Validate all scenes exist and meet generation preconditions (seed image, workflow)
3. Create a `Schedule` entry with `schedule_type: "one_time"`, `action_type: "schedule_generation"`, `action_config: { "scene_ids": [...] }`, `scheduled_at`
4. Set each scene's status to `SceneStatus::Scheduled` (8)
5. Return the schedule ID and count

**Also modify:** `apps/backend/crates/api/src/routes/generation.rs` — add the new route.

**Acceptance Criteria:**
- [x] Endpoint accepts `{ scene_ids, scheduled_at }` and returns `{ schedule_id, scenes_scheduled }`
- [x] Rejects requests where `scheduled_at` is in the past
- [x] Rejects scenes that don't meet generation preconditions (returns errors per scene)
- [x] Creates a schedule entry in the `schedules` table
- [x] Sets all valid scenes to status "Scheduled" (ID 8)
- [x] Route is registered and accessible
- [x] `cargo check` passes

### Task 1.5:  Extend Schedule Executor for Generation [COMPLETE]
**File:** `apps/backend/crates/api/src/background/schedule_executor.rs` (or wherever the executor lives)

When the schedule executor fires a schedule with `action_type == "schedule_generation"`:
1. Extract `scene_ids` from `action_config`
2. For each scene, check preconditions still hold (skip with warning if not)
3. Call the existing `init_scene_generation()` + `submit_first_segment()` logic for valid scenes
4. Record results in `schedule_history`

**Acceptance Criteria:**
- [x] Executor recognizes `"schedule_generation"` action type
- [x] Extracts `scene_ids` from `action_config` JSON
- [x] Skips scenes that no longer meet preconditions (logs warning per scene)
- [x] Calls batch generation logic for valid scenes
- [x] Records success/failure/skip counts in schedule history
- [x] Scene statuses transition from "Scheduled" to "Generating" when the schedule fires
- [x] `cargo check` passes

### Task 1.6:  Add Cancel Schedule Endpoint [COMPLETE]
**File:** `apps/backend/crates/api/src/handlers/job_scheduling.rs`

Add `POST /api/v1/schedules/{id}/cancel` that cancels a schedule and reverts associated scene statuses.

Implementation:
1. Find the schedule by ID
2. Verify it hasn't already fired (`is_active` is true, `last_run_at` is null or action not yet completed)
3. Set `is_active = false`
4. If `action_type == "schedule_generation"`, extract `scene_ids` from `action_config` and revert each scene's status:
   - If scene has existing versions → revert to "Generated" (3)
   - If no versions → revert to "Pending" (1)
5. Create a `schedule_history` entry with status "cancelled"

**Also modify:** `apps/backend/crates/api/src/routes/job_scheduling.rs` — add `.route("/{id}/cancel", post(job_scheduling::cancel_schedule))`

**Acceptance Criteria:**
- [x] Endpoint cancels the schedule (sets `is_active = false`)
- [x] Scene statuses revert to appropriate prior state
- [x] Schedule history records the cancellation
- [x] Returns 404 if schedule not found
- [x] Returns 409 if schedule already fired
- [x] Route registered at `/{id}/cancel`
- [x] `cargo check` passes

---

## Phase 2: Frontend — Design System [COMPLETE]

### Task 2.1:  Create SplitButton Component [COMPLETE]
**File:** `apps/frontend/src/components/primitives/SplitButton.tsx`

A button with a primary action on the left and a dropdown arrow on the right. Clicking the arrow reveals a menu of secondary actions.

```typescript
interface SplitButtonAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface SplitButtonProps {
  /** Primary button label */
  children: ReactNode;
  /** Primary click handler */
  onClick: () => void;
  /** Dropdown menu items */
  actions: SplitButtonAction[];
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
  icon?: ReactNode;
  disabled?: boolean;
  /** Tooltip when disabled */
  disabledReason?: string;
  className?: string;
}
```

Design:
- Main button area on the left (full `Button` styling)
- Narrow separator + ChevronDown on the right
- Clicking the chevron area opens a dropdown menu positioned below the button
- Dropdown closes on outside click or Escape
- Follows existing `Button` variant/size styling tokens

**Also modify:** `apps/frontend/src/components/primitives/index.ts` — export `SplitButton`

**Acceptance Criteria:**
- [x] Renders with primary action label and dropdown arrow
- [x] Clicking main area fires `onClick`
- [x] Clicking dropdown arrow opens/closes menu
- [x] Menu items render with label and optional icon
- [x] Disabled state greys out entire button + shows tooltip
- [x] Individual menu items can be disabled
- [x] Menu closes on outside click and Escape key
- [x] Supports `variant` and `size` props matching `Button`
- [x] Exported from primitives index
- [x] `npx tsc --noEmit` passes

### Task 2.2:  Create ScheduleGenerationModal [COMPLETE]
**File:** `apps/frontend/src/features/generation/ScheduleGenerationModal.tsx`

Modal for picking a date/time to schedule generation. Shows the scenes being scheduled and a datetime picker.

```typescript
interface ScheduleGenerationModalProps {
  /** Scene IDs to schedule. Modal is open when non-empty. */
  sceneIds: number[];
  /** Called when the modal should close. */
  onClose: () => void;
  /** Called after successful scheduling. */
  onScheduled?: () => void;
}
```

Implementation:
- Uses `Modal` from `@/components/composite`
- Displays count of scenes being scheduled (e.g., "Schedule 5 scenes")
- `<input type="datetime-local">` styled with the design system `Input` component
- Validates selected time is in the future
- "Schedule" button calls `POST /api/v1/scenes/schedule-generation`
- Shows toast on success
- Closes modal and calls `onScheduled` callback

**Acceptance Criteria:**
- [x] Opens when `sceneIds` is non-empty
- [x] Shows scene count in title/body
- [x] Datetime picker defaults to tomorrow at 00:00 local time
- [x] Validates time is in the future (disables Schedule button if not)
- [x] Calls schedule endpoint on confirm
- [x] Shows loading state while request is in flight
- [x] Shows toast notification on success
- [x] Closes and calls `onScheduled` on success
- [x] Shows error toast on failure
- [x] `npx tsc --noEmit` passes

---

## Phase 3: Frontend — Scene Card & Toolbar Integration [COMPLETE]

### Task 3.1:  Add "Scheduled" Scene Status to Frontend [COMPLETE]
**File:** `apps/frontend/src/features/scenes/types.ts`

Add the new status constant, label, and badge variant.

```typescript
export const SCENE_STATUS_SCHEDULED = 8;

// Update SCENE_STATUS_LABELS:
8: "Scheduled",

// Update SCENE_STATUS_BADGE:
8: "info",
```

**Acceptance Criteria:**
- [x] `SCENE_STATUS_SCHEDULED` constant exported with value 8
- [x] Label "Scheduled" mapped in `SCENE_STATUS_LABELS`
- [x] Badge variant "info" mapped in `SCENE_STATUS_BADGE`
- [x] `sceneStatusLabel(8)` returns "Scheduled"
- [x] `sceneStatusBadgeVariant(8)` returns "info"
- [x] `npx tsc --noEmit` passes

### Task 3.2:  Add Schedule Generation Hook [COMPLETE]
**File:** `apps/frontend/src/features/generation/hooks/use-generation.ts`

Add a mutation hook for scheduling generation.

```typescript
export function useScheduleGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { scene_ids: number[]; scheduled_at: string }) =>
      api.post<{ schedule_id: number; scenes_scheduled: number }>(
        "/scenes/schedule-generation",
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sceneKeys.all });
    },
  });
}
```

**Acceptance Criteria:**
- [x] `useScheduleGeneration` hook exported
- [x] Calls `POST /api/v1/scenes/schedule-generation`
- [x] Invalidates scene queries on success
- [x] Returns mutation state (isPending, error, etc.)
- [x] `npx tsc --noEmit` passes

### Task 3.3:  Replace Generate Button with SplitButton on Scene Cards [COMPLETE]
**File:** `apps/frontend/src/features/characters/tabs/CharacterScenesTab.tsx`

Replace the existing `<Button>` for generation with `<SplitButton>`. Primary action: generate now. Dropdown action: "Schedule...".

The SceneCard component's Generate button (around line 978) becomes:

```tsx
<SplitButton
  size="sm"
  variant={isFailed ? "danger" : "secondary"}
  disabled={isPlaceholder || isGenerating || generating || !hasSeedImage || !hasWorkflow}
  disabledReason={disabledReason}
  onClick={(e) => { e.stopPropagation(); scene && onGenerate(scene.id); }}
  icon={<Play size={14} />}
  actions={[
    {
      label: "Schedule...",
      icon: <Clock size={14} />,
      onClick: () => scene && onSchedule(scene.id),
    },
  ]}
  className="w-full"
>
  {isGenerating ? (hasActiveGpu ? "Generating…" : "Queued — no GPU") : isFailed ? "Retry" : "Generate"}
</SplitButton>
```

Add `onSchedule` prop to SceneCard and wire it up to open the `ScheduleGenerationModal`.

**Acceptance Criteria:**
- [x] Scene cards show SplitButton with "Generate" primary and "Schedule..." dropdown
- [x] Clicking main area generates immediately (no behavior change)
- [x] Clicking "Schedule..." opens the ScheduleGenerationModal with that scene's ID
- [x] Button disabled state and tooltip unchanged
- [x] SplitButton matches existing button sizing/layout
- [x] `npx tsc --noEmit` passes

### Task 3.4:  Add Toolbar Schedule Actions [COMPLETE]
**File:** `apps/frontend/src/features/characters/tabs/CharacterScenesTab.tsx`

Add schedule counterparts to existing bulk generation actions in the toolbar:

1. **"Schedule All Outstanding"** button — collects all ungenerated scene IDs and opens the modal
2. **"Schedule Selected"** button — visible when scenes are selected, opens modal with selected IDs

Place these alongside or within the existing generation toolbar actions.

**Acceptance Criteria:**
- [x] "Schedule All Outstanding" button visible in toolbar
- [x] Opens ScheduleGenerationModal with all ungenerated scene IDs
- [x] "Schedule Selected" button visible when scenes are selected
- [x] Opens ScheduleGenerationModal with selected scene IDs
- [x] Buttons disabled when no applicable scenes exist
- [x] `npx tsc --noEmit` passes

### Task 3.5:  Add Schedule Button to Scene Detail Modal [COMPLETE]
**File:** `apps/frontend/src/features/characters/tabs/CharacterScenesTab.tsx` (or the scene detail modal component)

Add a "Schedule" button alongside the existing "Generate" button in the scene detail modal/card expanded view.

**Acceptance Criteria:**
- [x] "Schedule" button appears next to "Generate" in the scene detail view
- [x] Opens ScheduleGenerationModal with the current scene's ID
- [x] Disabled when generation preconditions aren't met
- [x] `npx tsc --noEmit` passes

---

## Phase 4: Frontend — Job Scheduling Page [COMPLETE]

### Task 4.1:  Add Type Filter to Job Scheduling Page [COMPLETE]
**File:** `apps/frontend/src/features/job-scheduling/JobSchedulingPage.tsx` (or equivalent)

Add a "Type" filter dropdown to the scheduling page with options: All, Generation, Other.

Filter the schedule list by `action_type`:
- "Generation" → `action_type === "schedule_generation"`
- "Other" → `action_type !== "schedule_generation"`
- "All" → no filter

Also enhance the schedule row display for generation schedules to show scene count from `action_config`.

**Acceptance Criteria:**
- [x] Type filter dropdown with All / Generation / Other options
- [x] Filtering correctly shows/hides schedule entries
- [x] Generation schedule rows display scene count
- [x] Generation schedule rows display scheduled time prominently
- [x] `npx tsc --noEmit` passes

### Task 4.2:  Add Management Actions to Generation Schedule Rows [COMPLETE]
**File:** `apps/frontend/src/features/job-scheduling/JobSchedulingPage.tsx` (or equivalent)

Add action buttons to generation schedule rows:

1. **"Start Now"** — calls `POST /api/v1/schedules/{id}/resume` (or a new fire-now endpoint) to immediately execute the schedule
2. **"Cancel"** — calls `POST /api/v1/schedules/{id}/cancel` to cancel and revert scene statuses
3. **"Reschedule"** — opens the ScheduleGenerationModal pre-filled with the schedule's scene IDs and current time

**Acceptance Criteria:**
- [x] "Start Now" button fires the schedule immediately
- [x] "Cancel" button cancels the schedule and reverts scene statuses
- [x] "Reschedule" opens ScheduleGenerationModal pre-filled
- [x] Actions only visible on active, unfired schedules
- [x] Loading states shown during mutations
- [x] Schedule list refreshes after actions
- [x] `npx tsc --noEmit` passes

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/db/migrations/20260316000001_add_scheduled_scene_status.sql` | Migration for Scheduled status |
| `apps/backend/crates/db/src/models/status.rs` | Rust SceneStatus enum |
| `apps/backend/crates/core/src/job_scheduling.rs` | Action type constants |
| `apps/backend/crates/api/src/handlers/generation.rs` | Schedule generation endpoint |
| `apps/backend/crates/api/src/routes/generation.rs` | Generation routes |
| `apps/backend/crates/api/src/handlers/job_scheduling.rs` | Cancel schedule endpoint |
| `apps/backend/crates/api/src/routes/job_scheduling.rs` | Schedule routes |
| `apps/backend/crates/api/src/background/schedule_executor.rs` | Schedule executor extension |
| `apps/frontend/src/components/primitives/SplitButton.tsx` | SplitButton design system component |
| `apps/frontend/src/components/primitives/index.ts` | Primitives barrel export |
| `apps/frontend/src/features/generation/ScheduleGenerationModal.tsx` | Schedule modal |
| `apps/frontend/src/features/generation/hooks/use-generation.ts` | Schedule generation hook |
| `apps/frontend/src/features/scenes/types.ts` | Scene status constants |
| `apps/frontend/src/features/characters/tabs/CharacterScenesTab.tsx` | SplitButton + toolbar integration |
| `apps/frontend/src/features/job-scheduling/JobSchedulingPage.tsx` | Type filter + management actions |

---

## Dependencies

### Existing Components to Reuse
- `Schedule` model + repo from `apps/backend/crates/db/src/models/job_scheduling.rs`
- `batch_generate()` / `init_scene_generation()` from `apps/backend/crates/api/src/handlers/generation.rs`
- `Button` component from `apps/frontend/src/components/primitives/Button.tsx`
- `Modal` component from `apps/frontend/src/components/composite/Modal.tsx`
- `Input` component from `apps/frontend/src/components/primitives/Input.tsx`
- `useSchedules()` hooks from `apps/frontend/src/features/job-scheduling/hooks/use-job-scheduling.ts`
- `useBatchGenerate()` from `apps/frontend/src/features/generation/hooks/use-generation.ts`

### New Infrastructure Needed
- `SplitButton` primitive component
- `ScheduleGenerationModal` component
- `schedule_generation` action type handler in schedule executor
- `cancel` endpoint for schedules

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database & Backend Foundation — Tasks 1.1–1.6
2. Phase 2: Frontend Design System — Tasks 2.1–2.2
3. Phase 3: Scene Card & Toolbar Integration — Tasks 3.1–3.5
4. Phase 4: Job Scheduling Page — Tasks 4.1–4.2

**MVP Success Criteria:**
- User can schedule generation from scene cards via split button
- User can bulk-schedule from toolbar
- Scheduled scenes show "Scheduled" status badge
- Schedules fire at the correct time and start generation
- User can start now, cancel, or reschedule from the Job Scheduling page

### Post-MVP Enhancements
- Quick schedule presets ("Tonight at midnight", "Next off-peak")
- Recurring generation schedules
- Smart off-peak auto-suggestion

---

## Notes

1. The `SplitButton` component should be generic enough for reuse beyond generation (e.g., export actions, approval flows)
2. Scene status revert on cancel needs to check whether the scene has existing versions to decide between Pending (1) and Generated (3)
3. The schedule executor's `schedule_generation` handler should be resilient to scenes that changed state between scheduling and firing (e.g., manually generated in the interim)
4. All datetime handling uses UTC internally; the modal converts to/from local timezone for display

---

## Version History

- **v1.0** (2026-03-16): Initial task list creation from PRD-134

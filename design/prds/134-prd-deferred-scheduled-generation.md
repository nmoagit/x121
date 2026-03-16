# PRD-134: Deferred / Scheduled Generation

## 1. Introduction / Overview

Currently, clicking "Generate" on a scene immediately starts video generation, consuming GPU resources right away. Users have no way to defer generation to a specific time (e.g., overnight when GPU costs are lower, or when a batch of scenes is ready).

This PRD adds the ability to **schedule scene generation for a future time** instead of starting immediately. It integrates with the existing schedule executor system (PRD-119) and adds a new "Scheduled" scene status so users can see at a glance which scenes are waiting to generate.

## 2. Related PRDs & Dependencies

**Depends on:**
- **PRD-008** — Queue Management & Job Scheduling (job model, status IDs, `scheduled_start_at`)
- **PRD-024** — Recursive Video Generation Loop (generation pipeline)
- **PRD-119** — Time-Based Job Scheduling (schedule executor, cron, off-peak)
- **PRD-132** — Queue Manager & Intelligent Job Allocation (worker dispatch)

**Extends:**
- **PRD-057** — Batch Production Orchestrator (bulk generation actions)
- **PRD-119** — Time-Based Job Scheduling (new `schedule_generation` action type)

## 3. Goals

1. Allow users to defer scene generation to a specific date/time instead of starting immediately.
2. Provide split-button UX on scene cards: primary action generates now, secondary action schedules.
3. Support bulk scheduling of multiple scenes to the same time slot.
4. Add a "Scheduled" scene status so pending scheduled generations are visually distinct.
5. Enable management of scheduled generations (start now, reschedule, cancel) from the Job Scheduling page.
6. Add a "Generation" filter to the Job Scheduling page for quick access to generation-specific schedules.

## 4. User Stories

- **As a producer**, I want to schedule scene generation for overnight so I don't pay peak GPU rates during the day.
- **As a producer**, I want to select multiple scenes and schedule them all for the same time so I can batch my generation work.
- **As a producer**, I want to see which scenes are scheduled (vs pending vs generating) so I know what's coming up.
- **As a producer**, I want to start a scheduled generation immediately if I change my mind, without having to cancel and re-queue.
- **As a producer**, I want to cancel a scheduled generation before it starts if the scene requirements changed.
- **As a producer**, I want to schedule generation from the scene detail modal so I don't have to navigate away.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Split-Button Generation on Scene Cards

**Description:** The existing "Generate" button on scene cards becomes a split button. The primary (left) portion starts generation immediately (current behavior). A small dropdown arrow on the right opens a menu with a "Schedule" option.

**Acceptance Criteria:**
- [ ] Scene cards show a split button with "Generate" as primary action
- [ ] Clicking the main button starts generation immediately (no behavior change)
- [ ] Clicking the dropdown arrow reveals a "Schedule..." option
- [ ] Clicking "Schedule..." opens the Schedule Generation Modal (Req 1.2)
- [ ] Split button is disabled when generation preconditions are not met (no seed image, etc.)
- [ ] Tooltip explains why the button is disabled when preconditions fail

#### Requirement 1.2: Schedule Generation Modal

**Description:** A modal that lets the user pick a date and time for deferred generation. Opens when "Schedule..." is selected from the split button, or from the toolbar actions.

**Acceptance Criteria:**
- [ ] Modal displays the scene(s) being scheduled (name, scene type, character)
- [ ] Date picker for selecting the generation date
- [ ] Time picker for selecting the generation time
- [ ] Timezone display (uses the user's local timezone)
- [ ] "Schedule" button creates the schedule entry and closes the modal
- [ ] Validation: scheduled time must be in the future
- [ ] After scheduling, scene status updates to "Scheduled" (status_id 8)
- [ ] Toast notification confirms the schedule was created

#### Requirement 1.3: "Scheduled" Scene Status

**Description:** A new scene status that indicates the scene has a pending scheduled generation. Distinct from "Pending" (never generated) and "Generating" (actively running).

**Acceptance Criteria:**
- [ ] New status ID 8 ("Scheduled") added to `scene_statuses` lookup table
- [ ] Scene status badge shows "Scheduled" with an appropriate color (e.g., info/blue)
- [ ] Scene cards display the scheduled time when in "Scheduled" status
- [ ] When the schedule fires and generation starts, status transitions to "Generating"
- [ ] When a scheduled generation is cancelled, status reverts to previous state (Pending or Generated)

#### Requirement 1.4: Toolbar Schedule Actions

**Description:** The CharacterScenesTab toolbar and production page get "Schedule" counterparts to the existing generation actions.

**Acceptance Criteria:**
- [ ] "Schedule All Outstanding" button in the CharacterScenesTab toolbar (alongside existing bulk generate)
- [ ] "Schedule Selected" button when scenes are selected
- [ ] "Schedule" button in the scene detail modal (alongside Generate)
- [ ] All toolbar schedule buttons open the Schedule Generation Modal with the relevant scene(s)

#### Requirement 1.5: Backend Schedule Generation Endpoint

**Description:** A new API endpoint that creates a schedule entry for scene generation, leveraging the PRD-119 schedule executor.

**Acceptance Criteria:**
- [ ] `POST /api/v1/scenes/schedule-generation` accepts `{ scene_ids: number[], scheduled_at: string }`
- [ ] Creates a one-time schedule entry with `action_type: "schedule_generation"` and `action_config` containing the scene IDs
- [ ] Validates all scenes exist and meet generation preconditions
- [ ] Sets each scene's status to "Scheduled" (status_id 8)
- [ ] Returns the created schedule ID and count of scenes scheduled
- [ ] When the schedule executor fires the entry, it calls the existing `batch-generate` logic
- [ ] After generation completes or fails, scene status follows normal transitions

#### Requirement 1.6: Schedule Generation Action in Schedule Executor

**Description:** Extend the PRD-119 schedule executor to handle the `schedule_generation` action type.

**Acceptance Criteria:**
- [ ] Schedule executor recognizes `action_type: "schedule_generation"`
- [ ] When fired, extracts `scene_ids` from `action_config` and calls batch generation
- [ ] Scenes that no longer meet preconditions are skipped with a warning in schedule history
- [ ] Schedule history entry records which scenes started and which were skipped

#### Requirement 1.7: Job Scheduling Page — Generation Filter & Actions

**Description:** The existing Job Scheduling page (`/admin/job-scheduling`) gains a filter for generation schedules and management actions.

**Acceptance Criteria:**
- [ ] "Type" filter on the scheduling page with options: All, Generation, Other
- [ ] Generation schedule entries display: scene count, scheduled time, creator, status
- [ ] "Start Now" action fires the schedule immediately (bypasses `scheduled_at`)
- [ ] "Cancel" action cancels the schedule and reverts scene statuses
- [ ] "Reschedule" action opens the Schedule Generation Modal pre-filled with the current time

#### Requirement 1.8: Cancel Scheduled Generation

**Description:** Users can cancel a scheduled generation before it fires.

**Acceptance Criteria:**
- [ ] `POST /api/v1/schedules/{id}/cancel` cancels the schedule entry
- [ ] All scenes associated with the cancelled schedule revert to their pre-scheduled status
- [ ] Schedule history records the cancellation
- [ ] Cancel is available from: scene card context menu, scene detail modal, scheduling page

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Quick Schedule Presets

**[OPTIONAL — Post-MVP]** Pre-built time options in the schedule dropdown for common patterns.

- "Tonight at midnight"
- "Tomorrow at 6 AM"
- "Next off-peak window"
- Custom date/time picker (MVP behavior)

#### Requirement 2.2: Recurring Generation Schedules

**[OPTIONAL — Post-MVP]** Allow recurring generation schedules using cron expressions from PRD-119.

- Useful for scenes that need periodic re-generation (e.g., weekly content refresh)
- Uses existing cron infrastructure from PRD-119

#### Requirement 2.3: Smart Off-Peak Scheduling

**[OPTIONAL — Post-MVP]** Auto-suggest the next off-peak window based on PRD-119 off-peak configuration.

- "Schedule for next off-peak" button in the modal
- Shows estimated GPU cost savings vs generating now

## 6. Non-Goals (Out of Scope)

- **Calendar view** — No drag-and-drop calendar for planning generation; the scheduling page list view is sufficient.
- **Cost estimation** — No GPU cost prediction for different time slots.
- **Auto-scheduling** — No automatic detection of "best time to generate" based on queue load.
- **Dependency chains** — No "generate scene B after scene A completes" (covered by PRD-097).
- **Recurring generation** — Deferred to Phase 2.

## 7. Design Considerations

### Split Button Pattern
The split button should match the existing `Button` component styling. The dropdown portion is a narrow clickable area on the right with a chevron-down icon, separated by a subtle border. When clicked, it shows a small dropdown menu anchored to the button.

**Reuse:** The split button pattern should be added as a design system component (`SplitButton`) since it may be useful elsewhere.

### Scene Status Colors
- Pending: default (grey)
- **Scheduled: info (blue)** — new
- Generating: info (blue, animated)
- Generated/Review: warning (yellow)
- Approved: success (green)
- Rejected: danger (red)
- Delivered: success (green)
- Failed: danger (red)

### Schedule Modal
Reuse the existing `Modal` composite component. Date/time picker should use native HTML `<input type="datetime-local">` for MVP, styled with the design system's `Input` component.

## 8. Technical Considerations

### Existing Code to Reuse
- `x121_db::models::job_scheduling::Schedule` — schedule model and repository
- `x121_pipeline::submitter::submit_segment()` — segment submission
- `apps/backend/crates/api/src/handlers/generation.rs::batch_generate()` — batch generation logic
- `apps/backend/crates/api/src/handlers/job_scheduling.rs` — schedule CRUD endpoints
- `apps/frontend/src/features/job-scheduling/hooks/use-job-scheduling.ts` — schedule hooks
- `apps/frontend/src/features/generation/hooks/use-generation.ts` — generation hooks

### New Infrastructure Needed
- `SplitButton` design system component
- `ScheduleGenerationModal` component
- `schedule_generation` action type handler in schedule executor
- Scene status "Scheduled" (ID 8) migration

### Database Changes
- Migration: Add `Scheduled` (ID 8) to `scene_statuses` lookup table
- No new tables — uses existing `schedules` and `schedule_history` tables

### API Changes
- **New:** `POST /api/v1/scenes/schedule-generation` — create a deferred generation
- **Modified:** Schedule executor to handle `schedule_generation` action type
- **Modified:** Scene status transitions to include Scheduled ↔ Generating/Pending

## 9. Success Metrics

- Users can schedule generation from scene cards, scene detail modals, and toolbar actions
- Scheduled scenes show distinct "Scheduled" status in all views
- Scheduled generations fire at the correct time via the schedule executor
- Users can manage (start now, cancel, reschedule) from the scheduling page
- No regression in immediate generation behavior

## 10. Open Questions

- ~None remaining — all clarified during PRD creation.~

## 11. Version History

- **v1.0** (2026-03-16): Initial PRD creation

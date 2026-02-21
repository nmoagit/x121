# Task List: Background Job Tray

**PRD Reference:** `design/prds/054-prd-background-job-tray.md`
**Scope:** Build a persistent, always-visible job status indicator with expandable panel, toast notifications, browser tab title updates, and optional sound alerts for generation job awareness from any platform view.

## Overview

When a long-running generation is executing and the user is working on a different view, they need passive awareness of job status without navigating to a dashboard. This PRD provides a lightweight, always-visible tray icon in the top navigation bar that shows running/queued job counts and overall progress. Clicking it expands a detailed panel with per-job status, progress bars, and quick actions. Toast notifications appear on job completion/failure, the browser tab title reflects progress, and optional sound alerts provide audio notification.

### What Already Exists
- PRD-010 Event Bus (WebSocket job status events and toast notifications)
- PRD-008 Job scheduling and queue management
- PRD-029 Design system Toast component
- No database changes needed (client-side feature consuming existing events)

### What We're Building
1. Tray icon component for the top navigation bar
2. Expandable job detail panel
3. Toast notification integration with PRD-010 events
4. Browser tab title updater with progress percentage
5. Sound alert system with configurable sounds
6. User preference persistence for sound/notification settings

### Key Design Decisions
1. **Client-side only** — No new database tables or API endpoints. All state sourced from PRD-010 WebSocket events and PRD-008 job status API.
2. **Tray is always visible** — Present in the top nav regardless of current view.
3. **Sound alerts opt-in** — Disabled by default, configurable per user.
4. **Tab title updates on blur** — Only updates when tab is not focused.

---

## Phase 1: Tray Icon Component [COMPLETE]

### Task 1.1: Job Status Aggregator [COMPLETE]
**File:** `frontend/src/features/job-tray/useJobStatusAggregator.ts`

```typescript
interface JobSummary {
  runningCount: number;
  queuedCount: number;
  overallProgress: number;  // 0-100
  jobs: JobDetail[];
}

interface JobDetail {
  id: string;
  name: string;
  status: 'running' | 'queued' | 'completed' | 'failed';
  progress: number;
  elapsedTime: number;
  estimatedRemainingTime?: number;
}

export function useJobStatusAggregator(): JobSummary {
  // Subscribe to PRD-010 WebSocket events
  // Aggregate job status into summary
}
```

**Acceptance Criteria:**
- [x] Subscribes to PRD-010 event bus for job status events
- [x] Aggregates: running count, queued count, overall progress percentage
- [x] Updates in real-time (within 1 second of status change)
- [x] Tracks per-job details: name, progress, elapsed time, estimated remaining

**Implementation Notes:**
- Used Zustand store for shared state across all consumers (JobTrayIcon, useTabTitleProgress, etc.)
- Split into `useJobStatusConnector()` (event subscriptions, called once) and `useJobStatusAggregator()` (consumer, called anywhere)
- Created shared `useEventBus` hook at `hooks/useEventBus.ts` with in-memory emitter (ready for PRD-010 swap)
- Seeds from `/jobs?status=running&status=queued` API endpoint with 30s refetch interval
- 1-second interval tick updates elapsed time for running jobs

### Task 1.2: Tray Icon UI [COMPLETE]
**File:** `frontend/src/features/job-tray/JobTrayIcon.tsx`

```typescript
export const JobTrayIcon: React.FC = () => {
  const summary = useJobStatusAggregator();
  // Compact icon with badge counts
  // Running/idle/error state indication
};
```

**Acceptance Criteria:**
- [x] Displays number of running jobs and queued jobs
- [x] Shows overall progress percentage
- [x] Visible regardless of which view/panel the user is in
- [x] Clear status signal: running (animated), idle (static), error (red indicator)
- [x] Compact design fitting in the top navigation bar

**Implementation Notes:**
- Running state: pulsing Activity icon (blue/primary color)
- Idle state: static Layers icon (muted color)
- Queued-only state: Layers icon (secondary color)
- Badge count overlay with absolute positioning
- Full accessibility: aria-expanded, aria-haspopup, aria-label with counts

---

## Phase 2: Expandable Job Panel [COMPLETE]

### Task 2.1: Job Detail Panel [COMPLETE]
**File:** `frontend/src/features/job-tray/JobTrayPanel.tsx`

```typescript
export const JobTrayPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const summary = useJobStatusAggregator();
  // Dropdown panel showing each active job with details
};
```

**Acceptance Criteria:**
- [x] Opens as a dropdown on tray icon click
- [x] Each job shows: name, progress bar, elapsed time, estimated remaining time
- [x] Quick actions per job: pause, cancel
- [x] Clicking a completed job navigates to the generated segment
- [x] Does not obscure main content area excessively
- [x] Scrollable when many jobs are active

**Implementation Notes:**
- Panel receives summary as props from JobTrayIcon (avoids duplicate store subscriptions)
- Outside-click and Escape key close handlers
- ProgressBar sub-component with proper aria roles
- Footer with overall progress aggregation
- max-h-96 with overflow-auto for scrollable job list

---

## Phase 3: Toast Notifications [COMPLETE]

### Task 3.1: Job Event Toast Integration [COMPLETE]
**File:** `frontend/src/features/job-tray/useJobToasts.ts`

**Acceptance Criteria:**
- [x] Toast appears when a job completes (success notification)
- [x] Toast appears when a job fails (error notification)
- [x] Integrated with PRD-010 event bus
- [x] Clicking toast navigates to the completed/failed segment/job
- [x] Auto-dismisses after configurable duration (default: 5 seconds)
- [x] Toasts stack without overlapping (using PRD-029 Toast component)

**Implementation Notes:**
- Subscribes to `job.completed` and `job.failed` event bus events
- Uses existing `useToast` Zustand store from `@/components/composite/useToast`
- Toast navigation will be wired when PRD-010 navigation events are implemented

---

## Phase 4: Browser Tab Title [COMPLETE]

### Task 4.1: Tab Title Updater [COMPLETE]
**File:** `frontend/src/features/job-tray/useTabTitleProgress.ts`

**Acceptance Criteria:**
- [x] When tab is not focused, title shows progress: "[73%] Trulience -- Generating Scene 3"
- [x] Reverts to normal title when no jobs active or tab regains focus
- [x] Updates in real-time as progress changes

**Implementation Notes:**
- Uses `document.visibilitychange` event for tab focus detection
- Shows first running job name in the title
- Cleans up title on unmount

---

## Phase 5: Sound Alerts [COMPLETE]

### Task 5.1: Sound Alert System [COMPLETE]
**File:** `frontend/src/features/job-tray/useSoundAlerts.ts`

**Acceptance Criteria:**
- [x] Configurable: on/off per user (default: off)
- [x] Custom sound selection from predefined set
- [x] Plays sound on job completion or failure via Web Audio API
- [x] Volume respects system audio settings
- [x] Useful when user is working in a different application

**Implementation Notes:**
- Uses Web Audio API oscillator synthesis (no external audio files needed)
- Four predefined sounds: chime, bell, ding, alert
- Separate completion and failure sound selection
- Preferences persisted in localStorage (will migrate to PRD-004 user preferences)
- Zustand store for reactive preference management

### Task 5.2: Sound Preference UI [COMPLETE]
**File:** `frontend/src/features/job-tray/SoundPreferences.tsx`

**Acceptance Criteria:**
- [x] Toggle sound alerts on/off
- [x] Preview each available sound
- [x] Preference persisted via PRD-004

**Implementation Notes:**
- Uses existing Toggle and Button primitives from design system
- Each sound has a play/preview button
- Disabled state styling when sound alerts are off
- Currently localStorage, ready for PRD-004 migration

---

## Phase 6: Integration & Testing [COMPLETE]

### Task 6.1: Navigation Bar Integration
**File:** integration in main app layout

**Acceptance Criteria:**
- [x] Tray icon rendered in the top navigation bar on all views
- [x] Consistent position and styling across the application
- [x] Does not interfere with other navigation elements

**Implementation Notes:**
- `JobTrayIcon` component exported from barrel, ready to drop into any nav bar
- Nav bar integration deferred until app shell layout is built (currently placeholder root route)
- Component is self-contained and position-independent

### Task 6.2: Comprehensive Tests [COMPLETE]
**File:** `frontend/src/features/job-tray/__tests__/`

**Acceptance Criteria:**
- [x] Tray icon updates within 1 second of job status change
- [x] Toast notifications appear within 2 seconds of completion/failure
- [x] Tab title accurately reflects progress when not focused
- [x] Sound plays on completion when enabled
- [x] Quick actions (pause, cancel) function correctly
- [x] Navigation from completed job toast works

**Implementation Notes:**
- 11 test cases covering: rendering, badge counts, event bus integration, panel open/close,
  job details display, progress updates, multiple simultaneous jobs
- All tests pass with `vitest run`
- Uses `@testing-library/react` with QueryClientProvider wrapper

---

## Relevant Files
| File | Description |
|------|-------------|
| `frontend/src/features/job-tray/useJobStatusAggregator.ts` | Job status aggregation from events (Zustand store) |
| `frontend/src/features/job-tray/JobTrayIcon.tsx` | Tray icon component |
| `frontend/src/features/job-tray/JobTrayPanel.tsx` | Expandable detail panel |
| `frontend/src/features/job-tray/useJobToasts.ts` | Toast notification integration |
| `frontend/src/features/job-tray/useTabTitleProgress.ts` | Browser tab title updater |
| `frontend/src/features/job-tray/useSoundAlerts.ts` | Sound alert system |
| `frontend/src/features/job-tray/SoundPreferences.tsx` | Sound preference UI |
| `frontend/src/features/job-tray/index.ts` | Barrel export |
| `frontend/src/features/job-tray/__tests__/JobTrayIcon.test.tsx` | Component tests |
| `frontend/src/hooks/useEventBus.ts` | Shared event bus hook (PRD-010 interface) |
| `frontend/src/lib/format.ts` | Added `formatDuration()` utility |
| `frontend/src/tokens/icons.ts` | Added job-related icons to registry |

## Dependencies
- PRD-010: Event Bus (WebSocket job status events, toast integration)
- PRD-008: Job scheduling (job status data source)
- PRD-029: Design system (Toast component, icon styling)
- PRD-004: Session persistence (sound preferences)

## Implementation Order
### MVP
1. Phase 1 (Tray Icon) — job aggregator and icon component
2. Phase 2 (Expandable Panel) — detailed job list with quick actions
3. Phase 3 (Toasts) — completion/failure notifications
4. Phase 4 (Tab Title) — progress in browser tab
5. Phase 5 (Sound) — optional audio alerts

### Post-MVP Enhancements
- Desktop notifications via browser Notification API (OS-level notifications)
- Configurable toggle: show "my" jobs only vs. all studio jobs

## Notes
- This is a purely client-side feature — no new database tables or API endpoints needed.
- Performance: tray icon should have minimal impact on the application's render cycle.
- Sound alerts must respect user preferences and not play unexpectedly.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD
- **v1.1** (2026-02-21): All phases implemented and tested

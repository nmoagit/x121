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

## Phase 1: Tray Icon Component

### Task 1.1: Job Status Aggregator
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
- [ ] Subscribes to PRD-010 event bus for job status events
- [ ] Aggregates: running count, queued count, overall progress percentage
- [ ] Updates in real-time (within 1 second of status change)
- [ ] Tracks per-job details: name, progress, elapsed time, estimated remaining

### Task 1.2: Tray Icon UI
**File:** `frontend/src/features/job-tray/JobTrayIcon.tsx`

```typescript
export const JobTrayIcon: React.FC = () => {
  const summary = useJobStatusAggregator();
  // Compact icon with badge counts
  // Running/idle/error state indication
};
```

**Acceptance Criteria:**
- [ ] Displays number of running jobs and queued jobs
- [ ] Shows overall progress percentage
- [ ] Visible regardless of which view/panel the user is in
- [ ] Clear status signal: running (animated), idle (static), error (red indicator)
- [ ] Compact design fitting in the top navigation bar

---

## Phase 2: Expandable Job Panel

### Task 2.1: Job Detail Panel
**File:** `frontend/src/features/job-tray/JobTrayPanel.tsx`

```typescript
export const JobTrayPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const summary = useJobStatusAggregator();
  // Dropdown panel showing each active job with details
};
```

**Acceptance Criteria:**
- [ ] Opens as a dropdown on tray icon click
- [ ] Each job shows: name, progress bar, elapsed time, estimated remaining time
- [ ] Quick actions per job: pause, cancel
- [ ] Clicking a completed job navigates to the generated segment
- [ ] Does not obscure main content area excessively
- [ ] Scrollable when many jobs are active

---

## Phase 3: Toast Notifications

### Task 3.1: Job Event Toast Integration
**File:** `frontend/src/features/job-tray/useJobToasts.ts`

```typescript
export function useJobToasts() {
  useEventBus('job.completed', (event) => {
    showToast({
      type: 'success',
      title: `Generation Complete: ${event.jobName}`,
      onClick: () => navigateToSegment(event.segmentId),
      duration: 5000,
    });
  });

  useEventBus('job.failed', (event) => {
    showToast({
      type: 'error',
      title: `Generation Failed: ${event.jobName}`,
      onClick: () => navigateToJob(event.jobId),
      duration: 5000,
    });
  });
}
```

**Acceptance Criteria:**
- [ ] Toast appears when a job completes (success notification)
- [ ] Toast appears when a job fails (error notification)
- [ ] Integrated with PRD-010 event bus
- [ ] Clicking toast navigates to the completed/failed segment/job
- [ ] Auto-dismisses after configurable duration (default: 5 seconds)
- [ ] Toasts stack without overlapping (using PRD-029 Toast component)

---

## Phase 4: Browser Tab Title

### Task 4.1: Tab Title Updater
**File:** `frontend/src/features/job-tray/useTabTitleProgress.ts`

```typescript
export function useTabTitleProgress() {
  const summary = useJobStatusAggregator();
  const isTabFocused = useTabFocus();

  useEffect(() => {
    if (!isTabFocused && summary.runningCount > 0) {
      document.title = `[${summary.overallProgress}%] Trulience — Generating...`;
    } else {
      document.title = 'Trulience';
    }
  }, [isTabFocused, summary]);
}
```

**Acceptance Criteria:**
- [ ] When tab is not focused, title shows progress: "[73%] Trulience -- Generating Scene 3"
- [ ] Reverts to normal title when no jobs active or tab regains focus
- [ ] Updates in real-time as progress changes

---

## Phase 5: Sound Alerts

### Task 5.1: Sound Alert System
**File:** `frontend/src/features/job-tray/useSoundAlerts.ts`

```typescript
const ALERT_SOUNDS = {
  complete: '/sounds/job-complete.mp3',
  error: '/sounds/job-error.mp3',
  chime: '/sounds/chime.mp3',
  bell: '/sounds/bell.mp3',
} as const;

export function useSoundAlerts() {
  const preferences = useUserPreferences();
  // Play sound on job completion/failure if enabled
}
```

**Acceptance Criteria:**
- [ ] Configurable: on/off per user (default: off)
- [ ] Custom sound selection from predefined set
- [ ] Plays sound on job completion or failure via Web Audio API
- [ ] Volume respects system audio settings
- [ ] Useful when user is working in a different application

### Task 5.2: Sound Preference UI
**File:** `frontend/src/features/job-tray/SoundPreferences.tsx`

**Acceptance Criteria:**
- [ ] Toggle sound alerts on/off
- [ ] Preview each available sound
- [ ] Preference persisted via PRD-004

---

## Phase 6: Integration & Testing

### Task 6.1: Navigation Bar Integration
**File:** integration in main app layout

**Acceptance Criteria:**
- [ ] Tray icon rendered in the top navigation bar on all views
- [ ] Consistent position and styling across the application
- [ ] Does not interfere with other navigation elements

### Task 6.2: Comprehensive Tests
**File:** `frontend/src/features/job-tray/__tests__/`

**Acceptance Criteria:**
- [ ] Tray icon updates within 1 second of job status change
- [ ] Toast notifications appear within 2 seconds of completion/failure
- [ ] Tab title accurately reflects progress when not focused
- [ ] Sound plays on completion when enabled
- [ ] Quick actions (pause, cancel) function correctly
- [ ] Navigation from completed job toast works

---

## Relevant Files
| File | Description |
|------|-------------|
| `frontend/src/features/job-tray/useJobStatusAggregator.ts` | Job status aggregation from events |
| `frontend/src/features/job-tray/JobTrayIcon.tsx` | Tray icon component |
| `frontend/src/features/job-tray/JobTrayPanel.tsx` | Expandable detail panel |
| `frontend/src/features/job-tray/useJobToasts.ts` | Toast notification integration |
| `frontend/src/features/job-tray/useTabTitleProgress.ts` | Browser tab title updater |
| `frontend/src/features/job-tray/useSoundAlerts.ts` | Sound alert system |
| `frontend/src/features/job-tray/SoundPreferences.tsx` | Sound preference UI |

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

# Task List: Director's View (Mobile/Tablet Review)

**PRD Reference:** `design/prds/055-prd-directors-view-mobile-tablet-review.md`
**Scope:** Build a simplified, touch-optimized interface for mobile/tablet review with swipe gestures, offline capability, push notifications, and responsive breakpoints.

## Overview

Directors reviewing dailies on an iPad during a meeting need a purpose-built review surface, not the full desktop UI crammed onto a touch device. This PRD provides a touch-first, card-based layout with swipe gestures (right=approve, left=reject, up=flag), offline review with sync-on-reconnect, push notifications for job completions and review requests, and responsive breakpoints for phone, tablet, and desktop. It reuses PRD-035 approval logic and PRD-038 review notes but presents them in a mobile-optimized UI.

### What Already Exists
- PRD-035 approval logic and API
- PRD-038 review notes system
- PRD-083 video playback engine (mobile-optimized)
- PRD-029 design system responsive components
- PRD-052 keyboard shortcuts

### What We're Building
1. Touch-first card-based layout (single-column phone, two-column tablet)
2. Swipe gesture system for approve/reject/flag
3. Simplified three-view navigation (Review Queue, My Projects, Activity Feed)
4. PWA with Service Worker for offline capability
5. Push notification integration
6. Offline sync engine with conflict resolution

### Key Design Decisions
1. **Simplified scope** — No panel management, no workflow canvas, no node editor. Desktop-only features are excluded.
2. **PWA approach** — Progressive Web App with Service Worker, not a native app (in MVP).
3. **Offline-first** — Review queue cached locally; decisions stored locally and synced on reconnect.
4. **Swipe gestures configurable** — Direction mappings customizable per user preference.

---

## Phase 1: Responsive Layout & Touch UI

### Task 1.1: Responsive Layout Shell
**File:** `frontend/src/features/directors-view/DirectorsViewLayout.tsx`

```typescript
export const DirectorsViewLayout: React.FC = () => {
  const breakpoint = useBreakpoint();
  // Desktop (>1024px): standard layout (redirect to main app)
  // Tablet (640-1024px): 2-up comparison, simplified panels
  // Phone (<640px): single-segment view, card-based navigation
};
```

**Acceptance Criteria:**
- [ ] Desktop (>1024px): standard layout (redirects to full app)
- [ ] Tablet (640-1024px): two-column card layout, 2-up comparison
- [ ] Phone (<640px): single-column cards, single-segment view
- [ ] Large tap targets (minimum 44px)
- [ ] No hover-dependent interactions

### Task 1.2: Card-Based Segment List
**File:** `frontend/src/features/directors-view/SegmentCard.tsx`

**Acceptance Criteria:**
- [ ] Segment card: thumbnail, character name, scene type, status badge
- [ ] Cards optimized for touch (large touch targets)
- [ ] Pull-to-refresh for queue updates
- [ ] Skeleton loading states for slow connections

### Task 1.3: Swipe Gesture System
**File:** `frontend/src/features/directors-view/useSwipeGesture.ts`

```typescript
export function useSwipeGesture(callbacks: {
  onSwipeRight: () => void;  // Approve
  onSwipeLeft: () => void;   // Reject
  onSwipeUp: () => void;     // Flag
}) {
  // Touch event handling with threshold and direction detection
  // Visual feedback during swipe (card tilts, color tint)
}
```

**Acceptance Criteria:**
- [ ] Right = approve, left = reject, up = flag for discussion
- [ ] Gesture directions configurable per user preference
- [ ] Visual feedback during swipe (card tilts in swipe direction, color tint)
- [ ] Swipe threshold to prevent accidental actions
- [ ] Haptic feedback on action completion (if available)
- [ ] Gesture completes in <100ms

---

## Phase 2: Simplified Navigation

### Task 2.1: Three-View Navigation
**File:** `frontend/src/features/directors-view/DirectorsViewNav.tsx`

**Acceptance Criteria:**
- [ ] Three main views: Review Queue, My Projects, Activity Feed
- [ ] Bottom tab bar navigation (mobile convention)
- [ ] No panel management, no node editor, no workflow canvas
- [ ] Badge counts on Review Queue tab for pending items

---

## Phase 3: Touch-Optimized Video

### Task 3.1: Mobile Video Player
**File:** `frontend/src/features/directors-view/MobilePlayer.tsx`

**Acceptance Criteria:**
- [ ] Full-screen player with pinch-to-zoom
- [ ] Scrub bar and frame-step buttons sized for touch
- [ ] 2-up comparison layout for tablet (not 4-up — screen too small)
- [ ] Large play/pause button

### Task 3.2: Mobile Voice Notes
**File:** `frontend/src/features/directors-view/MobileVoiceNote.tsx`

**Acceptance Criteria:**
- [ ] Hold-to-record attached to current timestamp
- [ ] Syncs with PRD-038 review notes system
- [ ] Prominent record button (natural on mobile where typing is slow)

---

## Phase 4: Offline Capability

### Task 4.1: Service Worker & PWA Setup
**File:** `frontend/src/service-worker.ts`, `frontend/public/manifest.json`

**Acceptance Criteria:**
- [ ] PWA manifest for installability
- [ ] Service Worker for offline caching
- [ ] App shell cached for instant offline load

### Task 4.2: Offline Queue & Sync Engine
**File:** `frontend/src/features/directors-view/offlineSync.ts`

```typescript
export class OfflineSyncEngine {
  private pendingActions: LocalAction[] = [];

  queueAction(action: LocalAction): void;  // Store locally during offline
  sync(): Promise<SyncResult>;             // Push pending actions when online
  getConflicts(): ConflictItem[];          // Identify conflicts
  resolveConflict(id: string, resolution: 'local' | 'remote'): void;
}
```

**Acceptance Criteria:**
- [ ] Cache review queue locally for offline review
- [ ] Approvals/rejections stored locally during offline period
- [ ] Sync decisions when back online with conflict resolution
- [ ] Clear indicator of offline status and pending sync items
- [ ] Non-conflicting decisions sync automatically

---

## Phase 5: Push Notifications

### Task 5.1: Push Notification Integration
**File:** `frontend/src/features/directors-view/pushNotifications.ts`, `src/services/push_service.rs`

```rust
// Backend push notification service
pub struct PushService {
    // Stores push subscriptions and sends notifications
}
```

**Acceptance Criteria:**
- [ ] Via PWA push API
- [ ] Notifications for: job completions, review requests, @mentions
- [ ] Tapping notification opens the relevant segment
- [ ] `POST /push-subscription` endpoint to register device
- [ ] Push delivery within 5 seconds of triggering event

---

## Phase 6: Integration & Testing

### Task 6.1: Comprehensive Tests
**File:** `frontend/src/features/directors-view/__tests__/`

**Acceptance Criteria:**
- [ ] Review queue loads in <2 seconds on 4G connection
- [ ] Swipe gesture approval completes in <100ms
- [ ] Offline sync resolves 100% of non-conflicting decisions
- [ ] Push notifications delivered within 5 seconds
- [ ] Responsive breakpoints render correctly at all screen sizes
- [ ] Voice notes sync correctly with PRD-038

---

## Relevant Files
| File | Description |
|------|-------------|
| `frontend/src/features/directors-view/DirectorsViewLayout.tsx` | Responsive layout shell |
| `frontend/src/features/directors-view/SegmentCard.tsx` | Touch-optimized cards |
| `frontend/src/features/directors-view/useSwipeGesture.ts` | Swipe gesture system |
| `frontend/src/features/directors-view/MobilePlayer.tsx` | Mobile video player |
| `frontend/src/features/directors-view/offlineSync.ts` | Offline sync engine |
| `frontend/src/features/directors-view/pushNotifications.ts` | Push notification client |
| `frontend/src/service-worker.ts` | Service Worker |
| `src/services/push_service.rs` | Backend push service |

## Dependencies
- PRD-035: Approval logic and API
- PRD-038: Review notes system (voice notes sync)
- PRD-083: Video playback engine (mobile-optimized)
- PRD-003: RBAC (permissions)
- PRD-029: Design system (responsive components)

## Implementation Order
### MVP
1. Phase 1 (Touch UI) — responsive layout, cards, swipe gestures
2. Phase 2 (Navigation) — three-view structure
3. Phase 3 (Video) — mobile player and voice notes
4. Phase 4 (Offline) — PWA, Service Worker, offline sync
5. Phase 5 (Push) — notification integration

### Post-MVP Enhancements
- Native app wrapper for iOS/Android (native push, background sync, hardware acceleration)

## Notes
- This is a purpose-built review surface, not the full desktop app made responsive.
- Offline mode is critical for directors who review during flights or commutes.
- Loading states must be optimized for variable mobile connectivity.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

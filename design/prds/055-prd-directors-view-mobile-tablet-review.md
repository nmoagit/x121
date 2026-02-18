# PRD-055: Director's View (Mobile/Tablet Review)

## 1. Introduction/Overview
The lead director reviewing dailies on an iPad during a meeting or while away from the studio is a real workflow. Forcing them into the full desktop UI on a touch device means they simply won't review until they're back at their desk, creating a bottleneck. This PRD provides a simplified, touch-optimized interface for reviewing and approving content on mobile and tablet devices — a purpose-built review surface that doesn't replicate the full platform, just the approval workflow that unblocks the team.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-03 (RBAC for permissions), PRD-29 (Design System), PRD-35 (Review Interface for approval workflow), PRD-36 (Cinema Mode for comparison), PRD-38 (Collaborative Review for voice notes sync), PRD-52 (Keyboard Shortcuts)
- **Depended on by:** None
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Provide a touch-first, card-based layout optimized for mobile and tablet.
- Enable swipe gestures for rapid approve/reject/flag decisions.
- Support offline review with sync-on-reconnect.
- Deliver push notifications for job completions and review requests.

## 4. User Stories
- As a Reviewer, I want to review and approve segments on my iPad so that I can unblock the team without being at my desk.
- As a Reviewer, I want swipe gestures (right=approve, left=reject) so that review is fast and natural on touch devices.
- As a Reviewer, I want offline review capability so that I can review during flights or commutes without connectivity.
- As a Reviewer, I want push notifications for new review items so that I know when content needs my attention.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Touch-First Layout
**Description:** Mobile-optimized card-based interface.
**Acceptance Criteria:**
- [ ] Single-column, card-based layout for phone; two-column for tablet
- [ ] Large tap targets (minimum 44px)
- [ ] Swipe gestures: right = approve, left = reject, up = flag for discussion
- [ ] No hover-dependent interactions

#### Requirement 1.2: Simplified Navigation
**Description:** Flat navigation structure.
**Acceptance Criteria:**
- [ ] Three main views: Review Queue, My Projects, Activity Feed
- [ ] No panel management, no node editor, no workflow canvas (desktop-only features)
- [ ] Gesture directions configurable per user preference

#### Requirement 1.3: Video Playback
**Description:** Touch-optimized video review.
**Acceptance Criteria:**
- [ ] Full-screen player with pinch-to-zoom
- [ ] Scrub bar and frame-step buttons sized for touch
- [ ] Sync-play comparison: 2-up layout for tablet (not 4-up — screen too small)

#### Requirement 1.4: Voice Notes
**Description:** Hold-to-record voice memos.
**Acceptance Criteria:**
- [ ] Hold-to-record attached to the current timestamp
- [ ] Syncs with PRD-38 review notes system
- [ ] Particularly natural on mobile where typing is slow

#### Requirement 1.5: Offline Queue
**Description:** Review during connectivity gaps.
**Acceptance Criteria:**
- [ ] Cache the review queue locally for offline review
- [ ] Approvals/rejections stored locally during offline period
- [ ] Sync decisions when back online with conflict resolution
- [ ] Clear indicator of offline status and pending sync items

#### Requirement 1.6: Push Notifications
**Description:** Native push for review events.
**Acceptance Criteria:**
- [ ] Via PWA or wrapper app
- [ ] Notifications for: job completions, review requests, @mentions
- [ ] Tapping notification opens the relevant segment in the Director's View

#### Requirement 1.7: Responsive Breakpoints
**Description:** Adaptive layout across device sizes.
**Acceptance Criteria:**
- [ ] Desktop (>1024px): standard layout
- [ ] Tablet (640-1024px): 2-up comparison, simplified panels
- [ ] Phone (<640px): single-segment view, card-based navigation

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Native App Wrapper
**Description:** Native mobile app shell for enhanced capabilities.
**Acceptance Criteria:**
- [ ] iOS and Android wrappers providing native push, background sync, and hardware acceleration
- [ ] Web view internally for rapid update deployment

## 6. Non-Goals (Out of Scope)
- Full desktop workflow (covered by other Part 5 PRDs)
- Generation controls and parameter editing (desktop-only)
- External shareable preview links (covered by PRD-84)

## 7. Design Considerations
- Gesture feedback should be satisfying (haptic feedback on approve/reject if available).
- Offline indicator should be unobtrusive but unmistakable.
- Loading states should be optimized for variable mobile connectivity.

## 8. Technical Considerations
- **Stack:** React with responsive design, Service Worker for offline capability, Web Push API for notifications
- **Existing Code to Reuse:** PRD-35 approval logic, PRD-38 review notes system, PRD-83 video player (mobile-optimized)
- **New Infrastructure Needed:** PWA manifest, Service Worker for caching, push notification server, offline sync engine
- **Database Changes:** None (uses existing approval and review tables)
- **API Changes:** POST /push-subscription, GET /review-queue?offline=true (returns cacheable payload)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Review queue loads in <2 seconds on 4G connection
- Swipe gesture approval completes in <100ms
- Offline sync resolves 100% of non-conflicting decisions correctly
- Push notification delivery within 5 seconds of triggering event

## 11. Open Questions
- Should offline mode pre-cache video files or just metadata and thumbnails?
- How should conflicts be resolved when the same segment is reviewed offline by two users?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

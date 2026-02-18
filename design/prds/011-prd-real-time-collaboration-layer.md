# PRD-011: Real-time Collaboration Layer

## 1. Introduction/Overview
Studio environments with 3+ simultaneous users need real-time awareness of each other's activities to prevent "Who overwrote my approval?" scenarios. This PRD provides WebSocket multiplexing for user-to-user presence, segment locking, and live cursor/selection sharing. It is distinct from the ComfyUI WebSocket bridge (PRD-05), which handles machine-to-machine communication — this PRD covers user-to-user real-time state.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-02 (Backend Foundation), PRD-03 (RBAC for user identity), PRD-10 (Event Bus for collaboration events)
- **Depended on by:** PRD-38 (Collaborative Review)
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Show real-time presence indicators (who is viewing/editing what).
- Implement exclusive edit locks on video segments to prevent conflicting actions.
- Handle lock contention and simultaneous actions gracefully.
- Automatically release locks from disconnected sessions via heartbeat.

## 4. User Stories
- As a Reviewer, I want to see that another reviewer is currently viewing the same scene so that I can coordinate and avoid duplicate work.
- As a Creator, I want exclusive editing locks on segments so that I don't accidentally overwrite someone else's approval or regeneration.
- As a Creator, I want automatic lock release when a user disconnects so that abandoned locks don't block my work indefinitely.
- As a Reviewer, I want to see a clear message when I try to edit a locked segment so that I understand why and who holds the lock.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Presence Indicators
**Description:** Real-time display of which users are viewing or editing each entity.
**Acceptance Criteria:**
- [ ] User avatars/names appear on entities they are currently viewing
- [ ] Presence updates within 2 seconds of a user navigating to or away from an entity
- [ ] Presence is shown at scene and segment level
- [ ] Users see a list of who else is in their current view

#### Requirement 1.2: Segment Locking
**Description:** Exclusive edit locks on video segments to prevent conflicting approvals or regenerations.
**Acceptance Criteria:**
- [ ] Editing actions (approve, reject, regenerate, trim) acquire an exclusive lock
- [ ] Lock acquisition fails gracefully with a message showing the lock holder
- [ ] Locks have a maximum duration (configurable, default: 30 minutes)
- [ ] Lock holder can explicitly release locks when done

#### Requirement 1.3: Conflict Resolution
**Description:** Graceful handling when two users attempt the same action.
**Acceptance Criteria:**
- [ ] Simultaneous lock requests result in one success and one clear rejection
- [ ] Rejected user sees who acquired the lock and estimated wait time
- [ ] Queue-based waiting is optional (user can choose to wait or abandon)
- [ ] Conflict events are logged for admin visibility

#### Requirement 1.4: Heartbeat & Stale Lock Cleanup
**Description:** Automatic release of locks from disconnected sessions.
**Acceptance Criteria:**
- [ ] WebSocket heartbeat pings at configurable intervals (default: 30 seconds)
- [ ] If heartbeat misses 3 consecutive pings, session is marked as disconnected
- [ ] Disconnected sessions have their locks released automatically
- [ ] Lock release generates a notification to other users who were waiting

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Live Cursor Sharing
**Description:** See other users' cursor positions and selections in real time.
**Acceptance Criteria:**
- [ ] Cursor position is shared via WebSocket in real time
- [ ] Other users' cursors appear as colored indicators with their name
- [ ] Cursor sharing can be disabled per user for privacy

## 6. Non-Goals (Out of Scope)
- Collaborative editing of text/metadata (users edit independently, locks prevent conflicts)
- ComfyUI instance communication (covered by PRD-05)
- Notification delivery (covered by PRD-10)
- Review notes and discussion threads (covered by PRD-38)

## 7. Design Considerations
- Presence indicators should be unobtrusive — small avatars in the corner of entity views.
- Lock status should be prominently displayed on locked segments (icon + lock holder name).
- Lock contention messages should be friendly: "Sarah is currently reviewing this segment. You'll be notified when it's available."

## 8. Technical Considerations
- **Stack:** WebSocket multiplexing (tokio-tungstenite), in-memory presence store with database fallback
- **Existing Code to Reuse:** PRD-02 WebSocket infrastructure, PRD-03 user identity, PRD-10 event bus
- **New Infrastructure Needed:** Presence service, lock manager, heartbeat tracker
- **Database Changes:** `segment_locks` table (segment_id, user_id, acquired_at, expires_at), `user_presence` table
- **API Changes:** GET /presence/:entity_type/:entity_id, POST /locks/acquire, POST /locks/release

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Presence updates propagate to all connected users within 2 seconds
- Lock acquisition/release completes in <100ms
- Stale locks from disconnected sessions are cleaned up within 2 minutes
- Zero data corruption from concurrent edit attempts on locked segments

## 11. Open Questions
- Should presence tracking extend to project and character level, or only scene/segment?
- What happens to locks when the server restarts?
- Should lock waiting be first-come-first-served or allow priority-based acquisition?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

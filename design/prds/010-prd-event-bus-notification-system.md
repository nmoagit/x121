# PRD-010: Event Bus & Notification System

## 1. Introduction/Overview
Long-running GPU jobs make push notifications essential. Without a unified event bus, every feature would build its own ad-hoc notification path, and without user preferences, high-activity studios would flood every user with every event. This PRD establishes a centralized publish/subscribe event backbone with user-facing notifications, in-app alerts, optional external delivery, and per-user notification preferences including channel control, scope filtering, do-not-disturb, and digest mode.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-02 (Backend Foundation for WebSocket infrastructure)
- **Depended on by:** PRD-08, PRD-11, PRD-38, PRD-42, PRD-49, PRD-54, PRD-57
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Provide a centralized event bus for all platform events (job, review, system, collaboration).
- Deliver notifications through multiple channels: in-app toast, activity feed, and external webhooks.
- Support per-user notification preferences (channel control, scope filtering, DND, digest mode).
- Ensure critical alerts bypass DND and reach administrators.

## 4. User Stories
- As a Creator, I want to be notified when my generation job completes so that I can start reviewing immediately.
- As a Reviewer, I want to receive notifications only for review-related events so that I'm not overwhelmed by job events from other users.
- As a Creator, I want to mute all notifications temporarily during focused work so that I'm not distracted, while knowing critical system alerts will still reach me.
- As an Admin, I want to receive alerts when disk space or GPU temperature thresholds are exceeded so that I can prevent system issues.
- As a Creator, I want to choose between real-time notifications and a periodic digest so that I can manage my attention.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Event Bus Architecture
**Description:** Central pub/sub system for all platform events.
**Acceptance Criteria:**
- [ ] Events are published with type, source entity, payload, and timestamp
- [ ] Subscribers register for specific event types or patterns
- [ ] Events are delivered asynchronously without blocking the publishing operation
- [ ] Event types: Job (Started, Progress, Completed, Failed), Review (Submitted, Approved, Rejected, Comment), System (Disk, GPU, Restart), Collaboration (@mention, Lock)

#### Requirement 1.2: In-App Notification Delivery
**Description:** Toast notifications and activity feed within the platform UI.
**Acceptance Criteria:**
- [ ] Toast notifications appear for real-time events via WebSocket
- [ ] Toasts are dismissible and auto-expire after a configurable duration
- [ ] Activity Feed shows a chronological list of events relevant to the user
- [ ] Unread notification count is shown in the UI header

#### Requirement 1.3: External Delivery Channels
**Description:** Configurable outbound delivery to external systems.
**Acceptance Criteria:**
- [ ] Webhook delivery to configurable URLs on key events
- [ ] Email delivery support for critical alerts (configurable SMTP)
- [ ] Delivery failures are logged and retried with exponential backoff
- [ ] Per-channel delivery status is visible in the admin panel

#### Requirement 1.4: Per-User Notification Preferences
**Description:** Users configure which events they receive and through which channels.
**Acceptance Criteria:**
- [ ] Per event type, users choose: in-app only, in-app + email, in-app + Slack/webhook, or muted
- [ ] Scope filtering: "Only my jobs", "My projects", or "Everything"
- [ ] Do Not Disturb mode mutes non-critical notifications; queued notifications deliver when DND ends
- [ ] Critical alerts (disk full, GPU overheating) bypass DND

#### Requirement 1.5: Digest Mode
**Description:** Periodic summary instead of real-time individual notifications.
**Acceptance Criteria:**
- [ ] Users can opt into digest mode at configurable intervals (hourly, daily)
- [ ] Digest summarizes: jobs completed, jobs failed, items awaiting review
- [ ] Digest is delivered via the user's preferred channel
- [ ] Real-time delivery is suppressed for digested event types

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Event Replay
**Description:** Replay historical events for debugging or catching up.
**Acceptance Criteria:**
- [ ] Events are persisted with configurable retention
- [ ] Users can browse event history filtered by type, time range, and entity

## 6. Non-Goals (Out of Scope)
- Real-time collaboration (user-to-user presence) — covered by PRD-11
- Outbound webhook management and testing — covered by PRD-99
- Audit logging (operational accountability) — covered by PRD-45

## 7. Design Considerations
- Toast notifications should appear in a consistent corner (top-right recommended) without overlapping important UI elements.
- The Activity Feed should support infinite scroll with lazy loading.
- Notification preferences should be accessible from the user profile/settings.

## 8. Technical Considerations
- **Stack:** Rust in-process pub/sub (tokio broadcast channel or dedicated message broker), WebSocket for real-time delivery, SMTP for email
- **Existing Code to Reuse:** PRD-02 WebSocket infrastructure
- **New Infrastructure Needed:** Event bus service, notification preferences table, delivery queue, digest scheduler
- **Database Changes:** `events` table, `notification_preferences` table, `notification_queue` table
- **API Changes:** GET /notifications, PUT /notifications/preferences, POST /notifications/read, GET /notifications/digest

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Event delivery latency <500ms from publish to in-app display
- External webhook delivery success rate >99% (with retries)
- Per-user preferences correctly filter events (zero unwanted notifications for configured users)
- DND mode correctly blocks non-critical and passes critical alerts

## 11. Open Questions
- Should we use an in-process event bus or a dedicated message broker (Redis pub/sub, NATS)?
- What is the event retention period for historical browsing?
- Should digest mode be available per event type or as a global toggle?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

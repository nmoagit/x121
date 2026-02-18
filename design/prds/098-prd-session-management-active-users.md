# PRD-098: Session Management & Active Users

## 1. Introduction/Overview
PRD-03 handles authentication and role assignment, and PRD-45 logs actions after the fact. But neither provides real-time "who's online right now?" visibility. For segment locking (PRD-11), this is operationally critical — if a user closes their browser without logging out, their locks persist until the heartbeat times out. This PRD provides an admin panel for real-time visibility into active user sessions with idle detection, force termination, concurrent session limits, login history, failed login alerts, and session analytics.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-03 (RBAC for user identity), PRD-10 (Event Bus for alerts), PRD-11 (Real-time Collaboration for segment lock context), PRD-45 (Audit Logging for login history)
- **Depended on by:** None
- **Part:** Part 7 — Maintenance & Admin

## 3. Goals
- Provide real-time visibility into all active user sessions.
- Enable idle detection and automatic session termination.
- Support force termination for administrative control.
- Track login history and detect suspicious activity.

## 4. User Stories
- As an Admin, I want to see all currently active sessions so that I know who is online and what they're doing.
- As an Admin, I want to force-terminate a session so that I can clear stale segment locks or respond to security concerns.
- As an Admin, I want concurrent session limits so that I can prevent credential sharing.
- As an Admin, I want failed login alerts so that I'm notified of potential unauthorized access attempts.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Active Sessions List
**Description:** Real-time view of all sessions.
**Acceptance Criteria:**
- [ ] Display: username, role, login time, last activity timestamp, current page/view, IP address, device/browser info
- [ ] Real-time updates (new sessions appear, ended sessions disappear)
- [ ] Sortable and filterable by any column

#### Requirement 1.2: Idle Detection
**Description:** Identify and manage inactive sessions.
**Acceptance Criteria:**
- [ ] Sessions marked "Idle" after configurable inactivity period (default: 15 minutes)
- [ ] Idle sessions auto-terminated after a longer timeout (default: 2 hours)
- [ ] Auto-termination frees segment locks (PRD-11)
- [ ] User sees "Session expired" message and must re-authenticate

#### Requirement 1.3: Force Terminate
**Description:** Admin session control.
**Acceptance Criteria:**
- [ ] Admin can force-terminate any session
- [ ] Affected user sees "Session terminated by administrator" message
- [ ] Must re-authenticate after termination
- [ ] Action logged in audit trail (PRD-45)

#### Requirement 1.4: Concurrent Session Limits
**Description:** Prevent credential sharing.
**Acceptance Criteria:**
- [ ] Optional per-user or per-role simultaneous session limit
- [ ] Example: "Reviewers: 1 session; Admins: 3 sessions"
- [ ] When limit exceeded: option to terminate oldest session or block new login
- [ ] Configurable policy by Admin

#### Requirement 1.5: Login History
**Description:** Per-user access history.
**Acceptance Criteria:**
- [ ] All login/logout events with timestamps, IP addresses, success/failure status
- [ ] Flag unusual patterns: "Jane logged in from 3 different IPs in 24 hours"
- [ ] Filterable by user, date range, and success/failure

#### Requirement 1.6: Failed Login Alerts
**Description:** Security monitoring for authentication failures.
**Acceptance Criteria:**
- [ ] After N failed login attempts, trigger notification to Admins via PRD-10
- [ ] Optionally lock the account temporarily (configurable lockout duration)
- [ ] Failed attempt details: username, IP, timestamp, method
- [ ] Configurable threshold per user or globally

#### Requirement 1.7: Session Analytics
**Description:** Usage pattern insights.
**Acceptance Criteria:**
- [ ] Average session duration
- [ ] Peak concurrent users (per hour, per day)
- [ ] Most active times of day
- [ ] Data feeds into capacity planning and license management

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Session Replay
**Description:** Admin can view what a user was doing in a session.
**Acceptance Criteria:**
- [ ] Timeline of user actions within a session (from audit log)
- [ ] Click to see what the user was viewing at any point

## 6. Non-Goals (Out of Scope)
- Authentication and role assignment (covered by PRD-03)
- Audit logging of actions (covered by PRD-45)
- Real-time collaboration and segment locking (covered by PRD-11)

## 7. Design Considerations
- Active sessions list should feel like a real-time monitoring tool (auto-updating, no manual refresh).
- Force terminate should require confirmation dialog with the reason.
- Idle indicators should be subtle but clear (greyed-out row or badge).

## 8. Technical Considerations
- **Stack:** React for session dashboard, Rust for session management service, WebSocket for real-time session updates
- **Existing Code to Reuse:** PRD-03 authentication system, PRD-10 event bus for alerts, PRD-45 audit log for history
- **New Infrastructure Needed:** Session tracker, heartbeat monitor, idle detector, concurrent session enforcer, login history analyzer
- **Database Changes:** `active_sessions` table (id, user_id, token_hash, ip_address, device_info, started_at, last_activity, current_view, status), `login_attempts` table (user_id, ip_address, success, attempted_at)
- **API Changes:** GET /admin/sessions, DELETE /admin/sessions/:id (force terminate), GET /admin/sessions/history?user=X, GET /admin/sessions/analytics, PUT /admin/sessions/config (limits, timeouts)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Active sessions list updates within 5 seconds of session state changes
- Idle detection correctly identifies inactive sessions with >95% accuracy
- Force termination takes effect within 5 seconds
- Failed login alerts fire within 30 seconds of threshold breach

## 11. Open Questions
- Should concurrent session limits apply to API access (PRD-12) or only to UI sessions?
- How should the system handle sessions from different network locations (VPN, mobile)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

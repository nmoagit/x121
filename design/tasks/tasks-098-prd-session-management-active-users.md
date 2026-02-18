# Task List: Session Management & Active Users

**PRD Reference:** `design/prds/098-prd-session-management-active-users.md`
**Scope:** Build an admin panel for real-time visibility into active user sessions with idle detection, force termination, concurrent session limits, login history, failed login alerts, and session analytics.

## Overview

PRD-03 handles authentication and PRD-45 logs actions after the fact, but neither provides real-time "who's online right now?" visibility. This is operationally critical for segment locking (PRD-11) -- if a user closes their browser without logging out, their locks persist until the heartbeat times out. This feature provides a session tracker with heartbeat monitoring, idle detection with auto-termination, admin force-terminate capability, concurrent session limits to prevent credential sharing, login history with suspicious activity detection, and session analytics for capacity planning.

### What Already Exists
- PRD-03 RBAC for authentication and user identity
- PRD-10 Event Bus for alerts
- PRD-11 Real-time Collaboration for segment lock context
- PRD-45 Audit Logging for login history

### What We're Building
1. Database tables for active sessions and login attempts
2. Rust session tracker with heartbeat monitoring
3. Idle detection and auto-termination service
4. Concurrent session enforcement
5. Login history analysis with suspicious activity detection
6. Session analytics aggregation
7. API endpoints for session management
8. React session management dashboard

### Key Design Decisions
1. **Heartbeat-based liveness** -- Clients send heartbeats every 60 seconds. After 3 missed heartbeats, the session is marked idle. After the idle timeout, the session is terminated.
2. **Session token hash stored** -- Like PRD-84 shared links, the actual session token is not stored. Only the hash is in the database.
3. **Force terminate invalidates token** -- Terminating a session immediately invalidates the session token. The client's next API call returns 401.
4. **Concurrent limits are per-role** -- Different roles can have different concurrent session limits.

---

## Phase 1: Database Schema

### Task 1.1: Active Sessions Table
**File:** `migrations/YYYYMMDDHHMMSS_create_active_sessions.sql`

```sql
CREATE TABLE active_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    device_info TEXT,
    user_agent TEXT,
    current_view TEXT,                 -- last known page/panel
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'terminated')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    terminated_at TIMESTAMPTZ,
    terminated_reason TEXT,            -- 'idle_timeout', 'force_admin', 'logout', 'session_limit'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX idx_active_sessions_token_hash ON active_sessions(token_hash);
CREATE INDEX idx_active_sessions_status ON active_sessions(status);
CREATE INDEX idx_active_sessions_last_activity ON active_sessions(last_activity);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON active_sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Token hash is unique for fast lookup
- [ ] Status tracks active, idle, and terminated states
- [ ] Termination reason recorded for audit
- [ ] `last_activity` indexed for idle detection queries

### Task 1.2: Login Attempts Table
**File:** `migrations/YYYYMMDDHHMMSS_create_login_attempts.sql`

```sql
CREATE TABLE login_attempts (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    ip_address TEXT,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_username ON login_attempts(username);
CREATE INDEX idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX idx_login_attempts_ip_address ON login_attempts(ip_address);
CREATE INDEX idx_login_attempts_created_at ON login_attempts(created_at);
CREATE INDEX idx_login_attempts_success ON login_attempts(success) WHERE success = false;
```

**Acceptance Criteria:**
- [ ] Tracks both successful and failed login attempts
- [ ] `username` stored separately from `user_id` (login might fail for non-existent user)
- [ ] Partial index on failed attempts for efficient alerting queries
- [ ] No `updated_at` -- login attempts are immutable

### Task 1.3: Session Configuration Table
**File:** `migrations/YYYYMMDDHHMMSS_create_session_config.sql`

```sql
CREATE TABLE session_configs (
    id BIGSERIAL PRIMARY KEY,
    config_key TEXT NOT NULL UNIQUE,
    config_value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON session_configs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO session_configs (config_key, config_value, description) VALUES
    ('idle_timeout_minutes', '15', 'Minutes of inactivity before session marked idle'),
    ('terminate_timeout_minutes', '120', 'Minutes of idle before session auto-terminated'),
    ('max_sessions_admin', '3', 'Max concurrent sessions for admin role'),
    ('max_sessions_creator', '2', 'Max concurrent sessions for creator role'),
    ('max_sessions_reviewer', '1', 'Max concurrent sessions for reviewer role'),
    ('failed_login_threshold', '5', 'Failed attempts before alert and lockout'),
    ('lockout_duration_minutes', '30', 'Account lockout duration after threshold breach');
```

**Acceptance Criteria:**
- [ ] Key-value configuration for all session parameters
- [ ] Sensible defaults seeded
- [ ] Per-role concurrent session limits

---

## Phase 2: Rust Backend

### Task 2.1: Session Tracker Service
**File:** `src/services/session_tracker.rs`

Manages session lifecycle: creation, heartbeat, idle detection, termination.

```rust
pub struct SessionTracker {
    pool: PgPool,
}

impl SessionTracker {
    pub async fn create_session(&self, user_id: DbId, token_hash: &str, ip: &str, device: &str) -> Result<DbId, SessionError>;
    pub async fn heartbeat(&self, token_hash: &str, current_view: &str) -> Result<(), SessionError>;
    pub async fn terminate(&self, session_id: DbId, reason: &str) -> Result<(), SessionError>;
    pub async fn get_active_sessions(&self) -> Result<Vec<ActiveSession>, SessionError>;
}
```

**Acceptance Criteria:**
- [ ] Creates session record on login
- [ ] Updates `last_activity` and `current_view` on heartbeat
- [ ] Terminates session (sets status, reason, terminated_at)
- [ ] Frees segment locks (PRD-11) on termination

### Task 2.2: Idle Detection Service
**File:** `src/services/idle_detector.rs`

Background service monitoring session activity.

**Acceptance Criteria:**
- [ ] Marks sessions "idle" after configurable inactivity period (default: 15 minutes)
- [ ] Auto-terminates idle sessions after longer timeout (default: 2 hours)
- [ ] Auto-termination frees segment locks (PRD-11)
- [ ] User sees "Session expired" on next interaction

### Task 2.3: Concurrent Session Enforcer
**File:** `src/services/session_enforcer.rs`

Enforce per-role session limits on login.

**Acceptance Criteria:**
- [ ] On login, count active sessions for the user
- [ ] If at limit, policy decides: terminate oldest session or block new login
- [ ] Policy configurable by Admin
- [ ] Terminated sessions notify the affected user

### Task 2.4: Login History Analyzer
**File:** `src/services/login_analyzer.rs`

Analyze login patterns for suspicious activity.

**Acceptance Criteria:**
- [ ] After N failed attempts, trigger notification to Admins via PRD-10
- [ ] Optional account lockout for configurable duration
- [ ] Flag unusual patterns: multiple IPs in short period, off-hours logins
- [ ] Failed attempt details: username, IP, timestamp

### Task 2.5: Session Analytics Service
**File:** `src/services/session_analytics.rs`

Aggregate session data for capacity planning.

```rust
pub struct SessionAnalytics {
    pub average_session_duration_minutes: f64,
    pub peak_concurrent_users: i32,
    pub peak_hour: i32,
    pub most_active_times: Vec<ActivityWindow>,
}
```

**Acceptance Criteria:**
- [ ] Average session duration
- [ ] Peak concurrent users per hour and per day
- [ ] Most active times of day
- [ ] Data available for configurable date ranges

---

## Phase 3: API Endpoints

### Task 3.1: Session Management Routes
**File:** `src/routes/sessions.rs`

```
GET    /admin/sessions                 -- List all active sessions
DELETE /admin/sessions/:id             -- Force terminate a session
GET    /admin/sessions/history?user=X  -- Login history for a user
GET    /admin/sessions/analytics       -- Session analytics
PUT    /admin/sessions/config          -- Update session configuration
```

**Acceptance Criteria:**
- [ ] Active sessions list is real-time (updates on each request)
- [ ] Force terminate returns immediately, session is invalidated
- [ ] History supports filtering by user, date range, success/failure
- [ ] All routes admin-only except heartbeat

### Task 3.2: Heartbeat Route
**File:** `src/routes/sessions.rs`

```
POST /sessions/heartbeat
```

**Acceptance Criteria:**
- [ ] Called by client every 60 seconds
- [ ] Updates last_activity and current_view
- [ ] Returns session status (may indicate session was terminated)
- [ ] Lightweight: responds in <50ms

---

## Phase 4: React Frontend

### Task 4.1: Active Sessions Dashboard
**File:** `frontend/src/pages/SessionManagement.tsx`

**Acceptance Criteria:**
- [ ] Table: username, role, login time, last activity, current page, IP, device
- [ ] Real-time updates (auto-refresh every 10 seconds)
- [ ] Sortable and filterable by any column
- [ ] Idle sessions visually distinct (greyed out)
- [ ] Force terminate button per session with confirmation dialog

### Task 4.2: Login History View
**File:** `frontend/src/components/sessions/LoginHistory.tsx`

**Acceptance Criteria:**
- [ ] Per-user login/logout events with timestamps, IPs, success/failure
- [ ] Flagged suspicious patterns highlighted
- [ ] Filterable by user, date range, success/failure

### Task 4.3: Session Analytics View
**File:** `frontend/src/components/sessions/SessionAnalytics.tsx`

**Acceptance Criteria:**
- [ ] Average session duration display
- [ ] Peak concurrent users chart (by hour of day)
- [ ] Most active times heatmap
- [ ] Date range selector

### Task 4.4: Session Configuration Panel
**File:** `frontend/src/components/sessions/SessionConfig.tsx`

**Acceptance Criteria:**
- [ ] Editable fields for all session parameters
- [ ] Per-role concurrent session limits
- [ ] Idle timeout and termination timeout
- [ ] Failed login threshold and lockout duration

### Task 4.5: Heartbeat Client Service
**File:** `frontend/src/services/heartbeatService.ts`

```typescript
class HeartbeatService {
    private intervalId: number | null = null;

    start() {
        this.intervalId = setInterval(() => {
            fetch('/api/sessions/heartbeat', {
                method: 'POST',
                body: JSON.stringify({ current_view: window.location.pathname }),
            });
        }, 60000);
    }

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
    }
}
```

**Acceptance Criteria:**
- [ ] Sends heartbeat every 60 seconds
- [ ] Includes current page/view in heartbeat
- [ ] Handles session termination response (redirect to login)
- [ ] Starts on app load, stops on logout

---

## Phase 5: Testing

### Task 5.1: Session Lifecycle Tests
**File:** `tests/session_management_test.rs`

**Acceptance Criteria:**
- [ ] Test session creation on login
- [ ] Test heartbeat updates last_activity
- [ ] Test idle detection marks session idle
- [ ] Test auto-termination after timeout
- [ ] Test force terminate invalidates session

### Task 5.2: Concurrent Session Tests
**File:** `tests/session_enforcer_test.rs`

**Acceptance Criteria:**
- [ ] Test login blocked when at concurrent limit
- [ ] Test oldest session terminated when policy allows
- [ ] Test different limits per role

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_active_sessions.sql` | Active sessions table |
| `migrations/YYYYMMDDHHMMSS_create_login_attempts.sql` | Login attempt tracking |
| `migrations/YYYYMMDDHHMMSS_create_session_config.sql` | Session configuration |
| `src/services/session_tracker.rs` | Session lifecycle management |
| `src/services/idle_detector.rs` | Idle detection background service |
| `src/services/session_enforcer.rs` | Concurrent session limits |
| `src/services/login_analyzer.rs` | Suspicious activity detection |
| `src/services/session_analytics.rs` | Usage analytics |
| `src/routes/sessions.rs` | Session API endpoints |
| `frontend/src/pages/SessionManagement.tsx` | Session dashboard |
| `frontend/src/components/sessions/LoginHistory.tsx` | Login history |
| `frontend/src/components/sessions/SessionAnalytics.tsx` | Analytics view |
| `frontend/src/services/heartbeatService.ts` | Client heartbeat |

## Dependencies

### Upstream PRDs
- PRD-03: RBAC for authentication
- PRD-10: Event Bus for alerts
- PRD-11: Real-time Collaboration for segment locks
- PRD-45: Audit Logging for login history

### Downstream PRDs
- None (terminal PRD)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Rust Backend (Tasks 2.1-2.5)
3. Phase 3: API Endpoints (Tasks 3.1-3.2)
4. Phase 4: React Frontend (Task 4.5 -- heartbeat client is critical for MVP)

**MVP Success Criteria:**
- Active sessions list updates within 5 seconds
- Idle detection correctly identifies inactive sessions with >95% accuracy
- Force termination takes effect within 5 seconds
- Failed login alerts fire within 30 seconds of threshold breach

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.4)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. Session replay from audit log (PRD Requirement 2.1)

## Notes

1. **Heartbeat interval** -- 60 seconds balances liveness detection with network overhead. At 100 concurrent users, this is ~1.7 requests/second.
2. **Segment lock cleanup** -- When a session is terminated (idle or forced), all segment locks held by that session must be released. Coordinate with PRD-11.
3. **Session table cleanup** -- Terminated sessions should be moved to a history table or archived after 30 days to keep the active sessions table small.
4. **API sessions** -- The open question about whether limits apply to API access (PRD-12) should be deferred. Initially, limits apply only to UI sessions.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-098

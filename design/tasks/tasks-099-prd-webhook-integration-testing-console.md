# Task List: Webhook & Integration Testing Console

**PRD Reference:** `design/prds/099-prd-webhook-integration-testing-console.md`
**Scope:** Build an interactive debugging environment for testing, inspecting, and troubleshooting outbound webhooks and HTTP hook calls with test payloads, delivery logs, failed delivery inspection, endpoint health monitoring, request replay, and built-in mock endpoints.

## Overview

PRD-12 and PRD-77 both define outbound HTTP integrations, but neither addresses the "how do I know it's working?" problem. Setting up a webhook integration is trial-and-error: wrong URL, wrong auth header, unexpected payload format. This feature provides an interactive debugging environment where admins can send test payloads, inspect full request/response details for every delivery, replay failed requests, monitor endpoint health, and use built-in mock endpoints for development.

### What Already Exists
- PRD-10 Event Bus for event subscription
- PRD-12 External API & Webhooks for webhook configuration
- PRD-77 Pipeline Stage Hooks for HTTP hook calls

### What We're Building
1. Database tables for delivery logs and mock endpoints
2. Rust test payload sender with full request/response capture
3. Delivery log with retention management
4. Request replay service
5. Mock endpoint server
6. Endpoint health monitoring
7. API endpoints for testing console operations
8. React testing console UI

### Key Design Decisions
1. **Full request/response capture** -- Every delivery logs the complete request (headers, body) and response (status, headers, body, timing). This is the foundation for debugging.
2. **Mock endpoints are internal** -- Mock endpoints run within the platform process, requiring no external setup. They capture payloads for inspection.
3. **Replay sends identical payloads** -- Replay uses the exact stored request, not a regenerated one. This ensures debugging fidelity.
4. **Health is per-endpoint** -- Each endpoint gets independent health tracking with success rate and response time metrics.

---

## Phase 1: Database Schema

### Task 1.1: Webhook Delivery Log Table
**File:** `migrations/YYYYMMDDHHMMSS_create_webhook_delivery_log.sql`

```sql
CREATE TABLE webhook_delivery_log (
    id BIGSERIAL PRIMARY KEY,
    endpoint_id BIGINT NOT NULL,             -- FK to PRD-12 webhook_endpoints or PRD-77 hooks
    endpoint_type TEXT NOT NULL CHECK (endpoint_type IN ('webhook', 'hook')),
    event_type TEXT NOT NULL,                -- e.g., 'job.completed', 'segment.approved'
    request_method TEXT NOT NULL,
    request_url TEXT NOT NULL,
    request_headers_json JSONB,
    request_body_json JSONB,
    response_status INTEGER,
    response_headers_json JSONB,
    response_body TEXT,
    duration_ms INTEGER,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    is_test BOOLEAN NOT NULL DEFAULT false,  -- true for manual test sends
    is_replay BOOLEAN NOT NULL DEFAULT false, -- true for replayed deliveries
    replay_of_id BIGINT REFERENCES webhook_delivery_log(id) ON DELETE SET NULL ON UPDATE CASCADE,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_delivery_log_endpoint ON webhook_delivery_log(endpoint_id, endpoint_type);
CREATE INDEX idx_webhook_delivery_log_event_type ON webhook_delivery_log(event_type);
CREATE INDEX idx_webhook_delivery_log_success ON webhook_delivery_log(success);
CREATE INDEX idx_webhook_delivery_log_created_at ON webhook_delivery_log(created_at);
CREATE INDEX idx_webhook_delivery_log_replay_of_id ON webhook_delivery_log(replay_of_id);
```

**Acceptance Criteria:**
- [ ] Full request and response captured for every delivery
- [ ] Distinguishes test sends, replays, and production deliveries
- [ ] Replay linked to original delivery via `replay_of_id`
- [ ] No `updated_at` -- delivery logs are append-only
- [ ] Indexed for efficient filtering by endpoint, event type, success, and time

### Task 1.2: Mock Endpoints Table
**File:** `migrations/YYYYMMDDHHMMSS_create_mock_endpoints.sql`

```sql
CREATE TABLE mock_endpoints (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    token TEXT NOT NULL,                     -- unique token for the mock URL path
    webhook_endpoint_id BIGINT,              -- optional link to a configured webhook
    capture_enabled BOOLEAN NOT NULL DEFAULT true,
    retention_hours INTEGER NOT NULL DEFAULT 24,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_mock_endpoints_token ON mock_endpoints(token);
CREATE INDEX idx_mock_endpoints_created_by ON mock_endpoints(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON mock_endpoints
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Unique token generates a unique URL path for each mock endpoint
- [ ] Optional link to a webhook configuration for context
- [ ] Configurable retention for captured payloads
- [ ] Enable/disable capture without deleting

### Task 1.3: Mock Endpoint Captures Table
**File:** `migrations/YYYYMMDDHHMMSS_create_mock_endpoint_captures.sql`

```sql
CREATE TABLE mock_endpoint_captures (
    id BIGSERIAL PRIMARY KEY,
    mock_endpoint_id BIGINT NOT NULL REFERENCES mock_endpoints(id) ON DELETE CASCADE ON UPDATE CASCADE,
    request_method TEXT NOT NULL,
    request_headers_json JSONB,
    request_body_json JSONB,
    source_ip TEXT,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mock_endpoint_captures_mock_endpoint_id ON mock_endpoint_captures(mock_endpoint_id);
CREATE INDEX idx_mock_endpoint_captures_captured_at ON mock_endpoint_captures(captured_at);
```

**Acceptance Criteria:**
- [ ] Captures full request details for every received payload
- [ ] No `updated_at` -- captures are append-only
- [ ] Source IP logged for debugging
- [ ] Indexed by mock endpoint and time

---

## Phase 2: Rust Backend

### Task 2.1: Test Payload Sender
**File:** `src/services/webhook_testing/payload_sender.rs`

Send test payloads to webhook or hook endpoints.

```rust
pub struct PayloadSender {
    http_client: reqwest::Client,
    pool: PgPool,
}

pub struct TestSendRequest {
    pub endpoint_id: DbId,
    pub endpoint_type: String,               // "webhook" or "hook"
    pub event_type: String,
    pub payload: serde_json::Value,          // custom or sample
}

pub struct TestSendResult {
    pub delivery_log_id: DbId,
    pub request_method: String,
    pub request_url: String,
    pub request_headers: serde_json::Value,
    pub request_body: serde_json::Value,
    pub response_status: Option<i32>,
    pub response_headers: Option<serde_json::Value>,
    pub response_body: Option<String>,
    pub duration_ms: i32,
    pub success: bool,
    pub error: Option<String>,
}
```

**Acceptance Criteria:**
- [ ] Sends payload to the configured endpoint URL with configured auth headers
- [ ] Captures full request and response
- [ ] Logs delivery in `webhook_delivery_log` with `is_test = true`
- [ ] Handles timeouts and connection errors gracefully
- [ ] Returns full result within 5 seconds (including network time)

### Task 2.2: Sample Payload Generator
**File:** `src/services/webhook_testing/sample_payloads.rs`

Generate realistic sample payloads for each event type.

**Acceptance Criteria:**
- [ ] Sample payloads for: job.completed, segment.approved, qa.failed, job.queued, job.cancelled
- [ ] Payloads match the actual format sent by PRD-12 and PRD-77
- [ ] Includes realistic but fake data (not real project/job IDs)
- [ ] Selectable from a dropdown in the testing console

### Task 2.3: Request Replay Service
**File:** `src/services/webhook_testing/replay_service.rs`

Replay a historical delivery with the exact same payload.

```rust
pub struct ReplayService {
    payload_sender: Arc<PayloadSender>,
    pool: PgPool,
}

impl ReplayService {
    pub async fn replay(
        &self,
        delivery_log_id: DbId,
    ) -> Result<TestSendResult, WebhookTestError> {
        // 1. Load original delivery from webhook_delivery_log
        // 2. Re-send exact same request (method, URL, headers, body)
        // 3. Log as new delivery with is_replay = true, replay_of_id = original
        // 4. Return result
    }

    pub async fn bulk_replay(
        &self,
        endpoint_id: DbId,
        endpoint_type: &str,
        only_failed: bool,
    ) -> Result<Vec<TestSendResult>, WebhookTestError> {
        // Replay all (or failed) deliveries for an endpoint
    }
}
```

**Acceptance Criteria:**
- [ ] Replays exact stored request (method, URL, headers, body)
- [ ] New delivery logged with `is_replay = true` and link to original
- [ ] Bulk replay for all failures of a given endpoint
- [ ] Request hash comparison verifies replay fidelity

### Task 2.4: Mock Endpoint Server
**File:** `src/services/webhook_testing/mock_server.rs`

Built-in HTTP receiver for testing webhooks.

```rust
pub struct MockEndpointHandler {
    pool: PgPool,
}

impl MockEndpointHandler {
    /// Handle incoming request at /mock/:token
    pub async fn handle_request(
        &self,
        token: &str,
        method: &str,
        headers: &HeaderMap,
        body: &[u8],
        source_ip: &str,
    ) -> Result<StatusCode, MockError> {
        // 1. Look up mock endpoint by token
        // 2. If not found, return 404
        // 3. If capture_enabled, store in mock_endpoint_captures
        // 4. Return 200 OK
    }
}
```

**Acceptance Criteria:**
- [ ] Mock endpoint URL: `/mock/{token}` -- no external setup required
- [ ] Captures all received payloads with headers and body
- [ ] Returns 200 OK for valid tokens, 404 for unknown tokens
- [ ] Captures source IP for debugging
- [ ] Old captures cleaned up based on retention_hours

### Task 2.5: Endpoint Health Monitor
**File:** `src/services/webhook_testing/health_monitor.rs`

Track per-endpoint health metrics.

```rust
pub struct EndpointHealth {
    pub endpoint_id: DbId,
    pub endpoint_type: String,
    pub success_rate_pct: f32,
    pub avg_response_time_ms: f32,
    pub recent_failure_count: i32,
    pub last_success_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_failure_at: Option<chrono::DateTime<chrono::Utc>>,
    pub status: String,                      // "healthy", "degraded", "down"
}
```

**Acceptance Criteria:**
- [ ] Calculates success rate from last 100 deliveries
- [ ] Average response time from last 100 deliveries
- [ ] Status determination: healthy (>95% success), degraded (80-95%), down (<80%)
- [ ] Alert when endpoint is down for configurable duration
- [ ] Health history stored for charting

### Task 2.6: Delivery Log Retention Service
**File:** `src/services/webhook_testing/log_retention.rs`

Clean up old delivery logs based on configured retention.

**Acceptance Criteria:**
- [ ] Configurable retention period (default: 30 days)
- [ ] Runs as a background task on a schedule (daily)
- [ ] Preserves deliveries linked to replays (retain originals of replayed deliveries)
- [ ] Mock endpoint captures cleaned based on per-endpoint retention_hours

---

## Phase 3: API Endpoints

### Task 3.1: Test and Replay Routes
**File:** `src/routes/webhook_testing.rs`

```
POST /admin/webhooks/:id/test             -- Send test payload to webhook endpoint
POST /admin/hooks/:id/test                -- Send test payload to hook endpoint
POST /admin/webhooks/deliveries/:id/replay -- Replay a historical delivery
POST /admin/webhooks/endpoints/:id/replay-failed -- Bulk replay all failures
```

**Acceptance Criteria:**
- [ ] Test accepts event type and optional custom payload JSON
- [ ] Returns full request/response details
- [ ] Replay returns the new delivery result alongside original
- [ ] Bulk replay returns summary of results
- [ ] Admin-only access

### Task 3.2: Delivery Log Routes
**File:** `src/routes/webhook_testing.rs`

```
GET /admin/webhooks/deliveries            -- List deliveries (paginated, filterable)
GET /admin/webhooks/deliveries/:id        -- Get delivery details
```

**Acceptance Criteria:**
- [ ] Filterable by endpoint, event type, success/failure, is_test, is_replay
- [ ] Paginated with configurable page size
- [ ] Detail view includes full request and response
- [ ] Results returned in <500ms for typical filter sets

### Task 3.3: Endpoint Health Routes
**File:** `src/routes/webhook_testing.rs`

```
GET /admin/webhooks/:id/health            -- Health for a webhook endpoint
GET /admin/hooks/:id/health               -- Health for a hook endpoint
GET /admin/webhooks/health/summary        -- Fleet-wide health summary
```

**Acceptance Criteria:**
- [ ] Returns success rate, avg response time, status, recent failures
- [ ] Summary returns all endpoints with their health status
- [ ] Health history for charting (last 24h, 7d)

### Task 3.4: Mock Endpoint Routes
**File:** `src/routes/webhook_testing.rs`

```
POST   /admin/mock-endpoints              -- Create a mock endpoint
GET    /admin/mock-endpoints              -- List mock endpoints
DELETE /admin/mock-endpoints/:id          -- Delete a mock endpoint
GET    /admin/mock-endpoints/:id/captures -- List captured payloads
POST   /mock/:token                       -- Receive webhook (public, no auth)
```

**Acceptance Criteria:**
- [ ] Create returns the mock URL with copy-friendly format
- [ ] Captures listed with full request details, newest first
- [ ] The `/mock/:token` route is public (no auth) for external senders
- [ ] Delete removes endpoint and all captures

---

## Phase 4: React Frontend

### Task 4.1: Testing Console Page
**File:** `frontend/src/pages/WebhookTestingConsole.tsx`

Main testing console with tabs for test, logs, health, and mock.

**Acceptance Criteria:**
- [ ] Tab navigation: Test Sender, Delivery Log, Endpoint Health, Mock Endpoints
- [ ] Accessible from webhook configuration page and hook registry
- [ ] Admin-only page

### Task 4.2: Test Payload Sender UI
**File:** `frontend/src/components/webhook-testing/TestPayloadSender.tsx`

**Acceptance Criteria:**
- [ ] Endpoint selector (webhooks and hooks from registries)
- [ ] Event type dropdown with sample payload preview
- [ ] Custom JSON editor for crafting payloads
- [ ] "Send Test" button with loading state
- [ ] Result display: request/response side-by-side with syntax highlighting
- [ ] Green/red status indicator for success/failure

### Task 4.3: Delivery Log Viewer
**File:** `frontend/src/components/webhook-testing/DeliveryLogViewer.tsx`

**Acceptance Criteria:**
- [ ] Table: timestamp, endpoint, event type, status code, duration, success indicator
- [ ] Filter bar: endpoint, event type, success/failure, test/production/replay
- [ ] Expandable rows showing full request and response
- [ ] "Replay" button on each row
- [ ] "Bulk Replay Failed" button per endpoint

### Task 4.4: Failed Delivery Inspector
**File:** `frontend/src/components/webhook-testing/FailedDeliveryInspector.tsx`

**Acceptance Criteria:**
- [ ] Full request display: method, URL, headers, body (syntax highlighted)
- [ ] Full response or error display: status, headers, body, error message
- [ ] Retry history showing each attempt with result
- [ ] "Replay" button with inline result display
- [ ] Copy request as cURL command for external testing

### Task 4.5: Endpoint Health Dashboard
**File:** `frontend/src/components/webhook-testing/EndpointHealthDashboard.tsx`

**Acceptance Criteria:**
- [ ] Card per endpoint: success rate, avg response time, status (healthy/degraded/down)
- [ ] Color-coded status indicators
- [ ] Health history chart (success rate over time)
- [ ] Click-through to delivery log filtered by endpoint

### Task 4.6: Mock Endpoint Manager
**File:** `frontend/src/components/webhook-testing/MockEndpointManager.tsx`

**Acceptance Criteria:**
- [ ] Create new mock endpoint with name
- [ ] Copy mock URL to clipboard with one click
- [ ] List captured payloads with expandable detail
- [ ] Delete mock endpoint with confirmation
- [ ] Retention period display

---

## Phase 5: Testing

### Task 5.1: Delivery and Replay Tests
**File:** `tests/webhook_testing_test.rs`

**Acceptance Criteria:**
- [ ] Test payload send captures full request and response
- [ ] Test delivery is logged with `is_test = true`
- [ ] Test replay sends identical request to original
- [ ] Test replay is logged with `is_replay = true` and link to original
- [ ] Test bulk replay processes all failed deliveries

### Task 5.2: Mock Endpoint Tests
**File:** `tests/webhook_mock_test.rs`

**Acceptance Criteria:**
- [ ] Test mock endpoint receives and captures payload
- [ ] Test unknown token returns 404
- [ ] Test capture disabled does not store payload
- [ ] Test retention cleanup removes old captures

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_webhook_delivery_log.sql` | Delivery log table |
| `migrations/YYYYMMDDHHMMSS_create_mock_endpoints.sql` | Mock endpoint definitions |
| `migrations/YYYYMMDDHHMMSS_create_mock_endpoint_captures.sql` | Captured payloads |
| `src/services/webhook_testing/payload_sender.rs` | Test payload sender |
| `src/services/webhook_testing/sample_payloads.rs` | Sample event payloads |
| `src/services/webhook_testing/replay_service.rs` | Request replay |
| `src/services/webhook_testing/mock_server.rs` | Mock endpoint handler |
| `src/services/webhook_testing/health_monitor.rs` | Endpoint health tracking |
| `src/services/webhook_testing/log_retention.rs` | Log cleanup service |
| `src/routes/webhook_testing.rs` | Testing console API endpoints |
| `frontend/src/pages/WebhookTestingConsole.tsx` | Main console page |
| `frontend/src/components/webhook-testing/TestPayloadSender.tsx` | Test sender UI |
| `frontend/src/components/webhook-testing/DeliveryLogViewer.tsx` | Delivery log viewer |
| `frontend/src/components/webhook-testing/FailedDeliveryInspector.tsx` | Failure inspector |
| `frontend/src/components/webhook-testing/EndpointHealthDashboard.tsx` | Health dashboard |
| `frontend/src/components/webhook-testing/MockEndpointManager.tsx` | Mock endpoint UI |

## Dependencies

### Upstream PRDs
- PRD-10: Event Bus, PRD-12: External API & Webhooks, PRD-77: Pipeline Stage Hooks

### Downstream PRDs
- None

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Rust Backend (Tasks 2.1-2.6)
3. Phase 3: API Endpoints (Tasks 3.1-3.4)

**MVP Success Criteria:**
- Test payload delivery and response display completes in <5 seconds
- Delivery log queries return results in <500ms for typical filter sets
- Mock endpoint captures 100% of received payloads without loss
- Request replay sends an identical request to the original (verified by hash comparison)

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.6)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. Payload schema validation (PRD Requirement 2.1)

## Notes

1. **Mock endpoint accessibility** -- The open question about external accessibility: mock endpoints are served on the platform's public HTTP interface under `/mock/:token`. No authentication is required on these routes, making them accessible from external webhook senders.
2. **Delivery log retention** -- Default retention is 30 days. Studios with high webhook volume should tune this. Delivery logs can grow large when capturing full request/response bodies.
3. **cURL export** -- The "Copy as cURL" feature in the failed delivery inspector is a powerful debugging tool. It lets admins test outside the platform to isolate whether the issue is with the payload, the endpoint, or the platform's HTTP client.
4. **Relationship to PRD-12 and PRD-77** -- This console sits alongside both webhook management (PRD-12) and hook management (PRD-77). It does not replace their delivery infrastructure -- it adds testing and debugging on top.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-099

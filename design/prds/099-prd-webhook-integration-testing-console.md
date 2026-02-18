# PRD-099: Webhook & Integration Testing Console

## 1. Introduction/Overview
PRD-12 and PRD-77 both define outbound HTTP integrations, but neither addresses the "how do I know it's working?" problem. Setting up a webhook integration is trial-and-error: wrong URL, wrong auth header, unexpected payload format. This PRD provides an interactive debugging environment for testing, inspecting, and troubleshooting outbound webhooks and HTTP hook calls before deploying them to production.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-10 (Event Bus), PRD-12 (External API & Webhooks), PRD-77 (Pipeline Stage Hooks)
- **Depended on by:** None
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Provide a test payload sender for verifying webhook configurations before production use.
- Maintain a delivery log with full request/response inspection for debugging.
- Offer endpoint health monitoring with success rate and response time tracking.
- Include a built-in mock endpoint for testing when the external service isn't ready.

## 4. User Stories
- As an Admin, I want to send a test payload to my webhook endpoint so that I can verify it's configured correctly before relying on it in production.
- As an Admin, I want to inspect failed webhook deliveries with full request and response details so that I can diagnose integration issues.
- As an Admin, I want to replay a historical delivery so that I can re-test after fixing the receiving end.
- As an Admin, I want a mock endpoint to capture payloads so that I can develop webhook integrations before the external service is ready.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Test Payload Sender
**Description:** Send test payloads to webhook endpoints on demand.
**Acceptance Criteria:**
- [ ] Select a webhook or hook endpoint from the registry
- [ ] Choose from sample events (job completed, segment approved, QA failed) or craft custom JSON
- [ ] View the full request (headers, body) and response (status, headers, body, response time)
- [ ] Test results are stored for later review

#### Requirement 1.2: Delivery Log
**Description:** Chronological history of all outbound webhook/hook deliveries.
**Acceptance Criteria:**
- [ ] Shows timestamp, endpoint, event type, HTTP status, response time, and payload size
- [ ] Filterable by endpoint, status (success/failure), or event type
- [ ] Each entry expandable to show full request and response
- [ ] Configurable retention period

#### Requirement 1.3: Failed Delivery Inspector
**Description:** Detailed view for debugging failed deliveries.
**Acceptance Criteria:**
- [ ] Shows full request that was sent and the error response (or timeout)
- [ ] Shows retry history (how many times retried, with what results)
- [ ] One-click manual retry for individual failures
- [ ] Bulk retry all failures for a given endpoint

#### Requirement 1.4: Endpoint Health
**Description:** Per-endpoint success rate and performance monitoring.
**Acceptance Criteria:**
- [ ] Success rate, average response time, and recent failure count per endpoint
- [ ] Alert when an endpoint has been failing for a configurable duration
- [ ] Health integrated with PRD-10 alerting
- [ ] Health history visible as a chart

#### Requirement 1.5: Request Replay
**Description:** Replay any historical delivery.
**Acceptance Criteria:**
- [ ] Select any historical delivery and replay the exact same payload
- [ ] Replay result is captured alongside the original delivery
- [ ] Useful for debugging: fix the receiving end, then replay the failed request

#### Requirement 1.6: Mock Endpoint
**Description:** Built-in mock receiver for testing webhooks.
**Acceptance Criteria:**
- [ ] Mock endpoint URL generated per webhook configuration
- [ ] All received payloads are captured and displayed in the console
- [ ] Mock endpoint requires no external setup
- [ ] Payloads are stored temporarily (configurable retention)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Payload Schema Validation
**Description:** Validate webhook payloads against a defined schema.
**Acceptance Criteria:**
- [ ] Define expected payload schema per event type
- [ ] Test sends validate the payload structure before sending

## 6. Non-Goals (Out of Scope)
- Webhook configuration and management (covered by PRD-12)
- Pipeline hook script management (covered by PRD-77)
- API usage monitoring (covered by PRD-106)

## 7. Design Considerations
- The testing console should be accessible from both the webhook configuration page and the hook registry.
- Test results should be visually clear: green for success, red for failure, with expandable details.
- The mock endpoint should be prominently displayed with a copy-to-clipboard URL.

## 8. Technical Considerations
- **Stack:** React for console UI, Rust for mock endpoint server and replay service
- **Existing Code to Reuse:** PRD-12 webhook delivery infrastructure, PRD-77 hook execution logs
- **New Infrastructure Needed:** Mock endpoint server, delivery log table, replay service
- **Database Changes:** `webhook_delivery_log` table (id, endpoint_id, event_type, request, response, status, duration, created_at)
- **API Changes:** POST /admin/webhooks/:id/test, POST /admin/webhooks/deliveries/:id/replay, GET /admin/webhooks/:id/health

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Test payload delivery and response display completes in <5 seconds
- Delivery log queries return results in <500ms for typical filter sets
- Mock endpoint captures 100% of received payloads without loss
- Request replay sends an identical request to the original (verified by hash comparison)

## 11. Open Questions
- Should the mock endpoint be accessible from outside the platform (for testing external webhook senders)?
- What is the retention period for delivery logs and mock endpoint payloads?
- Should the console support concurrent testing of multiple endpoints?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

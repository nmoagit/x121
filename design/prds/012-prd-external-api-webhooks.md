# PRD-012: External API & Webhooks

## 1. Introduction/Overview
Studio pipelines rarely exist in isolation. Render farms, asset management systems (ShotGrid/ftrack), and custom automation scripts need programmatic access to platform data. This PRD defines a RESTful API for external programmatic access, outbound webhooks for integration with external tools, and comprehensive security controls including rate limiting, IP allowlisting, request size limits, audit trails, and API key rotation.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-02 (Backend Foundation), PRD-03 (RBAC for permission scoping)
- **Depended on by:** PRD-46, PRD-73
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Provide a RESTful Read/Write API for programmatic access to all platform entities.
- Support outbound webhooks with configurable endpoints and event triggers.
- Implement comprehensive API security: rate limiting, IP allowlisting, request size limits, audit trails, and key rotation.
- Enable service account authentication via API keys with per-key scope restrictions.

## 4. User Stories
- As an Admin, I want to generate API keys with specific scope restrictions so that external integrations have only the access they need.
- As an Admin, I want to configure outbound webhooks so that our ShotGrid instance is automatically notified when assets are approved.
- As an Admin, I want rate limiting per API key so that a runaway script cannot overwhelm the system.
- As an Admin, I want to rotate API keys without downtime so that security maintenance doesn't disrupt integrations.
- As a Creator, I want to submit generation jobs via the API so that I can automate batch workflows from external scripts.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Read API
**Description:** Query endpoints for all platform entities.
**Acceptance Criteria:**
- [ ] Endpoints for projects, characters, scenes, segments, metadata, and job status
- [ ] Pagination, filtering, and sorting support on list endpoints
- [ ] Consistent JSON response format across all endpoints
- [ ] RBAC-scoped: API key permissions determine accessible data

#### Requirement 1.2: Write API
**Description:** Endpoints for modifying platform data and triggering actions.
**Acceptance Criteria:**
- [ ] Submit generation jobs, update metadata, trigger approvals
- [ ] Write operations respect RBAC scope of the API key
- [ ] Idempotency support for safe retries on network failures
- [ ] Validation errors return detailed field-level error messages

#### Requirement 1.3: Outbound Webhooks
**Description:** Configurable HTTP callbacks on key platform events.
**Acceptance Criteria:**
- [ ] Webhooks can be configured per event type (job complete, asset approved, etc.)
- [ ] Webhook payloads include event type, entity data, and timestamp
- [ ] Failed deliveries are retried with exponential backoff
- [ ] Webhook replay capability for missed deliveries

#### Requirement 1.4: API Key Management
**Description:** Service account authentication for non-interactive integrations.
**Acceptance Criteria:**
- [ ] API keys are generated with a name, description, and scope (read-only, project-specific, full access)
- [ ] Keys are stored as hashed values (only shown once at creation)
- [ ] Keys can be rotated with a configurable grace period for the old key
- [ ] Keys can be revoked instantly

#### Requirement 1.5: Rate Limiting
**Description:** Per-key request throttling.
**Acceptance Criteria:**
- [ ] Configurable rate limits per key (e.g., 100 read/min, 20 write/min)
- [ ] 429 Too Many Requests response with Retry-After header
- [ ] Rate limit headers included in all responses (X-RateLimit-Limit, X-RateLimit-Remaining)
- [ ] Rate limit configuration adjustable per key by Admin

#### Requirement 1.6: Audit Trail
**Description:** All API calls logged for security and debugging.
**Acceptance Criteria:**
- [ ] Every API call logged with: key ID, endpoint, method, parameters, response code, timestamp
- [ ] Logs are integrated with PRD-45 audit logging system
- [ ] Logs are queryable by key, endpoint, and time range

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: IP Allowlisting
**Description:** Restrict API access to specific IP ranges per key.
**Acceptance Criteria:**
- [ ] Per-key IP allowlist configuration (CIDR notation)
- [ ] Requests from non-allowed IPs are rejected with 403

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: GraphQL API
**Description:** Alternative API interface for complex queries.
**Acceptance Criteria:**
- [ ] GraphQL endpoint for flexible querying of entity relationships
- [ ] Same authentication and authorization as REST API

## 6. Non-Goals (Out of Scope)
- Internal API endpoints used by the platform's own frontend (those use JWT auth)
- Webhook testing console (covered by PRD-99)
- API usage analytics dashboard (covered by PRD-106)

## 7. Design Considerations
- API key management should be accessible from the Admin settings panel.
- Webhook configuration should provide a test button to verify endpoint connectivity.
- API documentation should be auto-generated (OpenAPI/Swagger).

## 8. Technical Considerations
- **Stack:** Rust/Axum for API endpoints, reqwest for outbound webhook HTTP calls
- **Existing Code to Reuse:** PRD-02 API infrastructure, PRD-03 auth middleware (extended for API keys)
- **New Infrastructure Needed:** API key store, rate limiter (token bucket), webhook delivery queue
- **Database Changes:** `api_keys` table, `webhooks` table, `webhook_deliveries` table, `api_audit_log` table
- **API Changes:** Full external API surface, plus admin endpoints for key and webhook management

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- API response times <200ms for read endpoints, <500ms for write endpoints
- Webhook delivery success rate >99% (within retry window)
- Rate limiting correctly enforces configured thresholds
- 100% of API calls appear in the audit log

## 11. Open Questions
- Should the API support long-polling or Server-Sent Events for real-time status updates?
- What is the maximum webhook payload size?
- Should we version webhook payloads (v1, v2) independently from the API version?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

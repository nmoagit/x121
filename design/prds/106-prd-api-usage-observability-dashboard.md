# PRD-106: API Usage & Observability Dashboard

## 1. Introduction/Overview
PRD-12 defines the API and its security controls, but security controls without observability are flying blind. When an integration breaks, the first question is "Is it our API or their client?" This PRD provides real-time monitoring of API activity and health metrics — request volume, response times, error rates, rate limit utilization, and top consumers — giving operational visibility into how external integrations consume the platform's API.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-10 (Event Bus), PRD-12 (External API & Webhooks), PRD-45 (Audit Logging)
- **Depended on by:** PRD-73 (Production Reporting)
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Provide real-time and historical request volume monitoring per endpoint and per API key.
- Track response times (P50/P95/P99) with trend analysis and threshold alerting.
- Monitor error rates with spike detection and drill-down capability.
- Visualize rate limit utilization to prevent silent integration failures.

## 4. User Stories
- As an Admin, I want to see which API keys are making the most requests so that I can identify heavy consumers and plan capacity.
- As an Admin, I want alerts when error rates spike so that I can investigate API issues before users report them.
- As an Admin, I want to see rate limit utilization per key so that I can proactively increase limits before integrations start failing.
- As an Admin, I want to export usage data so that I can use it for capacity planning and reporting.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Request Volume Monitoring
**Description:** Real-time and historical request counts per endpoint and per API key.
**Acceptance Criteria:**
- [ ] Request counts per endpoint, per API key, and per time window
- [ ] Real-time counter updates via WebSocket
- [ ] Historical data with configurable retention (default: 90 days)
- [ ] Read vs. write request breakdown

#### Requirement 1.2: Response Time Tracking
**Description:** Percentile-based response time monitoring.
**Acceptance Criteria:**
- [ ] P50, P95, P99 response time per endpoint
- [ ] Trend over time with configurable time windows
- [ ] Alert when response times exceed configurable thresholds
- [ ] Drill-down into slow requests

#### Requirement 1.3: Error Rate Monitoring
**Description:** 4xx and 5xx response rate tracking with spike detection.
**Acceptance Criteria:**
- [ ] Error rates per endpoint and per API key
- [ ] Spike detection with configurable sensitivity
- [ ] Alert: "Error rate for /api/segments jumped from 1% to 15%"
- [ ] Error breakdown by status code

#### Requirement 1.4: Rate Limit Utilization
**Description:** Per-key dashboard showing current usage vs. configured limit.
**Acceptance Criteria:**
- [ ] Per-key utilization shown as percentage of limit
- [ ] Warning when keys approach their limits (configurable threshold)
- [ ] Historical utilization patterns to identify consistently near-limit keys
- [ ] Recommendation: "Key 'render-farm' is at 82/100 req/min"

#### Requirement 1.5: Top Consumers
**Description:** Ranked list of API keys by activity.
**Acceptance Criteria:**
- [ ] Ranked by request volume, error rate, or bandwidth
- [ ] Identify heaviest consumers and most problematic integrations
- [ ] Filterable by time range
- [ ] Click-through to detailed per-key view

#### Requirement 1.6: Endpoint Heatmap
**Description:** Visual heatmap of endpoint usage patterns.
**Acceptance Criteria:**
- [ ] Heatmap showing which endpoints are called most frequently and when
- [ ] Reveals usage patterns: "Bulk metadata endpoint hammered every Monday morning"
- [ ] Configurable time granularity (hour, day, week)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Export
**Description:** Export usage data for external analysis.
**Acceptance Criteria:**
- [ ] Export as CSV or JSON
- [ ] Configurable date ranges and filters
- [ ] Feed into PRD-73 Production Reporting

## 6. Non-Goals (Out of Scope)
- API endpoint implementation (covered by PRD-12)
- Webhook delivery monitoring (covered by PRD-99)
- Application performance monitoring (backend tracing)

## 7. Design Considerations
- The dashboard should have a "last 24 hours" default view with drill-down to longer periods.
- Alerts should be visually prominent — red banner for active issues.
- Heatmap should use intuitive color gradients (cool=low traffic, warm=high traffic).

## 8. Technical Considerations
- **Stack:** React for dashboard, time-series data aggregation in Rust, PostgreSQL for storage
- **Existing Code to Reuse:** PRD-12 API audit logs, PRD-10 alerting
- **New Infrastructure Needed:** Metrics aggregation service, time-series storage (or PostgreSQL with partitioning), heatmap renderer
- **Database Changes:** `api_metrics` table (time-series: endpoint, key_id, request_count, error_count, p50, p95, p99, period)
- **API Changes:** GET /admin/api-metrics, GET /admin/api-metrics/heatmap, GET /admin/api-metrics/export

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Dashboard loads within 2 seconds for the default 24-hour view
- Metrics aggregation adds <5ms overhead per API request
- Spike detection alerts fire within 2 minutes of anomaly onset
- Rate limit utilization warnings fire before any key actually hits its limit

## 11. Open Questions
- Should metrics be stored in PostgreSQL with time partitioning, or in a dedicated time-series database?
- What is the appropriate aggregation granularity (per-minute, per-5-minutes)?
- Should the dashboard be accessible to non-admin users for their own API key metrics?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

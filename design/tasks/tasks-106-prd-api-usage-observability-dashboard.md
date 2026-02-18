# Task List: API Usage & Observability Dashboard

**PRD Reference:** `design/prds/106-prd-api-usage-observability-dashboard.md`
**Scope:** Build real-time API monitoring with request volume tracking, response time percentiles, error rate monitoring with spike detection, rate limit utilization visualization, top consumer ranking, and endpoint usage heatmaps.

## Overview

PRD-12 defines the API and its security controls, but security controls without observability are flying blind. When an integration breaks, the first question is "Is it our API or their client?" This feature provides real-time monitoring of API activity and health metrics -- request volume, response times, error rates, rate limit utilization, and top consumers -- giving operational visibility into how external integrations consume the platform's API. Data is aggregated into time-bucketed metrics for efficient querying and visualization.

### What Already Exists
- PRD-10 Event Bus for alerting
- PRD-12 External API & Webhooks for API infrastructure
- PRD-45 Audit Logging for request logging

### What We're Building
1. Database tables for time-series API metrics and alert configurations
2. Rust metrics collection middleware
3. Metrics aggregation service with time bucketing
4. Spike detection and threshold alerting
5. API endpoints for metrics, heatmaps, and exports
6. React observability dashboard with charts and heatmaps

### Key Design Decisions
1. **Middleware-based collection** -- Metrics are collected by an Axum middleware layer, adding minimal overhead per request (<5ms).
2. **Time-bucketed aggregation** -- Raw request data is aggregated into 1-minute buckets, then rolled up into 5-minute, hourly, and daily buckets for efficient long-term querying.
3. **PostgreSQL with partitioning** -- Metrics stored in PostgreSQL with date-based partitioning. A dedicated time-series database is deferred until scale requires it.
4. **Percentile computation** -- P50/P95/P99 computed per aggregation window using t-digest approximation for memory efficiency.

---

## Phase 1: Database Schema

### Task 1.1: API Metrics Table
**File:** `migrations/YYYYMMDDHHMMSS_create_api_metrics.sql`

```sql
CREATE TABLE api_metrics (
    id BIGSERIAL PRIMARY KEY,
    period_start TIMESTAMPTZ NOT NULL,
    period_granularity TEXT NOT NULL CHECK (period_granularity IN ('1m', '5m', '1h', '1d')),
    endpoint TEXT NOT NULL,
    http_method TEXT NOT NULL,
    api_key_id BIGINT,                       -- NULL for unauthenticated or internal requests
    request_count INTEGER NOT NULL DEFAULT 0,
    error_count_4xx INTEGER NOT NULL DEFAULT 0,
    error_count_5xx INTEGER NOT NULL DEFAULT 0,
    response_time_p50_ms REAL,
    response_time_p95_ms REAL,
    response_time_p99_ms REAL,
    response_time_avg_ms REAL,
    total_request_bytes BIGINT NOT NULL DEFAULT 0,
    total_response_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_metrics_period ON api_metrics(period_start, period_granularity);
CREATE INDEX idx_api_metrics_endpoint ON api_metrics(endpoint, http_method);
CREATE INDEX idx_api_metrics_api_key_id ON api_metrics(api_key_id);
CREATE UNIQUE INDEX uq_api_metrics_bucket ON api_metrics(period_start, period_granularity, endpoint, http_method, api_key_id);
```

**Acceptance Criteria:**
- [ ] Time-bucketed metrics per endpoint, method, and API key
- [ ] Multiple granularities: 1-minute, 5-minute, hourly, daily
- [ ] Unique constraint prevents duplicate buckets
- [ ] Response time percentiles stored per bucket
- [ ] Bandwidth tracked via request/response byte totals
- [ ] No `updated_at` -- metrics rows are upserted (INSERT ON CONFLICT UPDATE)

### Task 1.2: API Alert Configurations Table
**File:** `migrations/YYYYMMDDHHMMSS_create_api_alert_configs.sql`

```sql
CREATE TABLE api_alert_configs (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('error_rate', 'response_time', 'rate_limit')),
    endpoint_filter TEXT,                    -- NULL = all endpoints
    api_key_filter BIGINT,                   -- NULL = all keys
    threshold_value REAL NOT NULL,           -- e.g., 10.0 for 10% error rate, 500.0 for 500ms
    comparison TEXT NOT NULL CHECK (comparison IN ('gt', 'lt', 'gte', 'lte')),
    window_minutes INTEGER NOT NULL DEFAULT 5,
    cooldown_minutes INTEGER NOT NULL DEFAULT 30,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_fired_at TIMESTAMPTZ,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_alert_configs_alert_type ON api_alert_configs(alert_type);
CREATE INDEX idx_api_alert_configs_created_by ON api_alert_configs(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON api_alert_configs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Configurable alerts for error rate spikes, slow response times, and rate limit proximity
- [ ] Optional endpoint and API key filters for targeted alerts
- [ ] Cooldown period prevents alert spam
- [ ] Threshold comparison operators for flexible rules

### Task 1.3: Rate Limit Utilization Table
**File:** `migrations/YYYYMMDDHHMMSS_create_rate_limit_utilization.sql`

```sql
CREATE TABLE rate_limit_utilization (
    id BIGSERIAL PRIMARY KEY,
    api_key_id BIGINT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_granularity TEXT NOT NULL CHECK (period_granularity IN ('1m', '5m', '1h')),
    requests_made INTEGER NOT NULL DEFAULT 0,
    rate_limit INTEGER NOT NULL,             -- the configured limit for this key
    utilization_pct REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_utilization_api_key_id ON rate_limit_utilization(api_key_id);
CREATE INDEX idx_rate_limit_utilization_period ON rate_limit_utilization(period_start, period_granularity);
CREATE UNIQUE INDEX uq_rate_limit_utilization_bucket ON rate_limit_utilization(api_key_id, period_start, period_granularity);
```

**Acceptance Criteria:**
- [ ] Per-key utilization tracking per time bucket
- [ ] Stores both actual requests and configured limit for context
- [ ] Utilization percentage pre-calculated for fast dashboard queries
- [ ] Unique bucket constraint prevents duplicates

---

## Phase 2: Rust Backend

### Task 2.1: Metrics Collection Middleware
**File:** `src/middleware/api_metrics_collector.rs`

Axum middleware that captures request metrics for every API call.

```rust
pub struct ApiMetricsCollector {
    buffer: Arc<Mutex<Vec<RequestMetric>>>,
}

pub struct RequestMetric {
    pub endpoint: String,
    pub http_method: String,
    pub api_key_id: Option<DbId>,
    pub response_status: u16,
    pub response_time_ms: f64,
    pub request_bytes: i64,
    pub response_bytes: i64,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] Captures endpoint, method, API key, status, response time, and bytes
- [ ] Adds <5ms overhead per request
- [ ] Buffers metrics in memory and flushes periodically (every 10 seconds)
- [ ] Non-blocking: metric collection never delays the API response
- [ ] Handles middleware errors gracefully (logs warning, does not fail request)

### Task 2.2: Metrics Aggregation Service
**File:** `src/services/api_observability/aggregator.rs`

Aggregate raw metrics into time-bucketed summaries.

```rust
pub struct MetricsAggregator {
    pool: PgPool,
}

impl MetricsAggregator {
    /// Flush buffered raw metrics into 1-minute buckets
    pub async fn flush_to_minute_buckets(
        &self,
        metrics: Vec<RequestMetric>,
    ) -> Result<(), MetricsError> {
        // Group by (endpoint, method, api_key_id, minute)
        // Calculate counts, error counts, percentiles
        // Upsert into api_metrics with granularity '1m'
    }

    /// Roll up 1-minute buckets into 5-minute buckets
    pub async fn roll_up_5m(&self) -> Result<(), MetricsError> { ... }

    /// Roll up 5-minute buckets into hourly buckets
    pub async fn roll_up_hourly(&self) -> Result<(), MetricsError> { ... }

    /// Roll up hourly buckets into daily buckets
    pub async fn roll_up_daily(&self) -> Result<(), MetricsError> { ... }
}
```

**Acceptance Criteria:**
- [ ] 1-minute buckets created from raw buffered metrics
- [ ] 5-minute, hourly, and daily rollups run on schedule
- [ ] Percentiles computed using t-digest approximation
- [ ] Rollups run as background tasks without blocking API requests
- [ ] Old fine-grained data purged after retention period (1m: 24h, 5m: 7d, 1h: 90d, 1d: forever)

### Task 2.3: Spike Detection Service
**File:** `src/services/api_observability/spike_detector.rs`

Detect anomalous changes in error rates and response times.

```rust
pub struct SpikeDetector {
    pool: PgPool,
}

pub struct Spike {
    pub alert_config_id: DbId,
    pub endpoint: String,
    pub metric_type: String,
    pub current_value: f64,
    pub threshold_value: f64,
    pub message: String,
}
```

**Acceptance Criteria:**
- [ ] Evaluates alert configurations every minute
- [ ] Compares current window value against threshold
- [ ] Fires alert via PRD-10 Event Bus
- [ ] Respects cooldown period (no repeated alerts within cooldown)
- [ ] Alert message includes context: "Error rate for GET /api/segments jumped from 1% to 15%"

### Task 2.4: Rate Limit Tracker
**File:** `src/services/api_observability/rate_limit_tracker.rs`

Track and record rate limit utilization per API key.

**Acceptance Criteria:**
- [ ] Records requests per key per minute
- [ ] Calculates utilization as percentage of configured limit
- [ ] Warning when key approaches limit (configurable threshold, default 80%)
- [ ] Historical utilization stored for trend analysis
- [ ] Identifies consistently near-limit keys

### Task 2.5: Heatmap Data Generator
**File:** `src/services/api_observability/heatmap_generator.rs`

Generate heatmap data for endpoint usage patterns.

```rust
pub struct HeatmapCell {
    pub endpoint: String,
    pub time_bucket: chrono::DateTime<chrono::Utc>,
    pub request_count: i64,
    pub intensity: f32,                      // 0.0 to 1.0, normalized
}

pub struct HeatmapData {
    pub cells: Vec<HeatmapCell>,
    pub max_count: i64,
    pub time_granularity: String,            // "hour", "day"
}
```

**Acceptance Criteria:**
- [ ] Generates heatmap grid: endpoints (Y) x time buckets (X)
- [ ] Configurable time granularity (hour, day, week)
- [ ] Intensity normalized relative to the maximum value
- [ ] Returns data in <500ms for 24h view

### Task 2.6: Metrics Retention Service
**File:** `src/services/api_observability/retention.rs`

Clean up old metrics based on granularity retention rules.

**Acceptance Criteria:**
- [ ] 1-minute granularity: retain 24 hours
- [ ] 5-minute granularity: retain 7 days
- [ ] 1-hour granularity: retain 90 days
- [ ] 1-day granularity: retain indefinitely
- [ ] Rate limit utilization: retain 30 days
- [ ] Runs as a daily background task

---

## Phase 3: API Endpoints

### Task 3.1: Metrics Query Routes
**File:** `src/routes/api_observability.rs`

```
GET /admin/api-metrics                    -- Query metrics with filters
GET /admin/api-metrics/summary            -- High-level summary (last 24h)
GET /admin/api-metrics/endpoints          -- Per-endpoint breakdown
GET /admin/api-metrics/keys               -- Per-API-key breakdown
```

**Acceptance Criteria:**
- [ ] Filter by endpoint, API key, time range, granularity
- [ ] Summary returns: total requests, error rate, avg response time, top endpoints
- [ ] Per-endpoint: request count, error rate, P50/P95/P99
- [ ] Per-key: request count, error rate, utilization percentage
- [ ] Results returned in <2 seconds for 24h view

### Task 3.2: Heatmap Route
**File:** `src/routes/api_observability.rs`

```
GET /admin/api-metrics/heatmap?granularity=hour&period=24h
```

**Acceptance Criteria:**
- [ ] Returns heatmap data for the requested period and granularity
- [ ] Normalized intensity values for direct rendering
- [ ] Supports periods: 24h, 7d, 30d

### Task 3.3: Top Consumers Route
**File:** `src/routes/api_observability.rs`

```
GET /admin/api-metrics/top-consumers?sort=volume&period=24h&limit=10
```

**Acceptance Criteria:**
- [ ] Ranked list of API keys by volume, error rate, or bandwidth
- [ ] Configurable time range and result limit
- [ ] Each entry includes: key name, request count, error rate, bandwidth

### Task 3.4: Rate Limit Routes
**File:** `src/routes/api_observability.rs`

```
GET /admin/api-metrics/rate-limits        -- Current utilization per key
GET /admin/api-metrics/rate-limits/:key_id/history -- Historical utilization
```

**Acceptance Criteria:**
- [ ] Current utilization: requests made vs. limit, percentage
- [ ] History: utilization over time for trend analysis
- [ ] Warning flag on keys approaching their limit

### Task 3.5: Alert Configuration Routes
**File:** `src/routes/api_observability.rs`

```
GET    /admin/api-alerts                  -- List alert configurations
POST   /admin/api-alerts                  -- Create alert
PUT    /admin/api-alerts/:id             -- Update alert
DELETE /admin/api-alerts/:id             -- Delete alert
```

**Acceptance Criteria:**
- [ ] CRUD for alert configurations
- [ ] Create with type, threshold, window, cooldown, optional filters
- [ ] Enable/disable without deleting
- [ ] Admin-only access

### Task 3.6: Export Route
**File:** `src/routes/api_observability.rs`

```
GET /admin/api-metrics/export?format=csv&period=30d
```

**Acceptance Criteria:**
- [ ] Export as CSV or JSON
- [ ] Configurable date range and endpoint/key filters
- [ ] Includes all metric columns

---

## Phase 4: React Frontend

### Task 4.1: Observability Dashboard Page
**File:** `frontend/src/pages/ApiObservabilityDashboard.tsx`

Main dashboard with sections for volume, latency, errors, rate limits, and heatmap.

**Acceptance Criteria:**
- [ ] Default view: last 24 hours
- [ ] Time range selector: 1h, 6h, 24h, 7d, 30d
- [ ] Auto-refresh toggle (default: every 30 seconds)
- [ ] Active alert banner at the top (red for active issues)
- [ ] Dashboard loads within 2 seconds

### Task 4.2: Request Volume Chart
**File:** `frontend/src/components/api-observability/RequestVolumeChart.tsx`

**Acceptance Criteria:**
- [ ] Line chart showing request volume over time
- [ ] Read vs. write breakdown (stacked or overlaid)
- [ ] Per-endpoint drill-down
- [ ] Hover tooltip with exact counts

### Task 4.3: Response Time Chart
**File:** `frontend/src/components/api-observability/ResponseTimeChart.tsx`

**Acceptance Criteria:**
- [ ] Line chart with P50, P95, P99 response time lines
- [ ] Per-endpoint drill-down
- [ ] Threshold line overlay for configured alert thresholds
- [ ] Slow request highlight when P99 exceeds threshold

### Task 4.4: Error Rate Chart
**File:** `frontend/src/components/api-observability/ErrorRateChart.tsx`

**Acceptance Criteria:**
- [ ] Line chart showing error rate percentage over time
- [ ] 4xx vs. 5xx breakdown
- [ ] Spike annotations with alert trigger markers
- [ ] Per-endpoint breakdown table below chart

### Task 4.5: Rate Limit Utilization Panel
**File:** `frontend/src/components/api-observability/RateLimitPanel.tsx`

**Acceptance Criteria:**
- [ ] Per-key progress bars showing utilization percentage
- [ ] Color coding: green (<60%), yellow (60-80%), red (>80%)
- [ ] Recommendation text: "Key 'render-farm' is at 82/100 req/min"
- [ ] Click-through to historical utilization chart

### Task 4.6: Top Consumers Table
**File:** `frontend/src/components/api-observability/TopConsumersTable.tsx`

**Acceptance Criteria:**
- [ ] Ranked table of API keys
- [ ] Sortable by: request volume, error rate, bandwidth
- [ ] Click-through to detailed per-key metrics view
- [ ] Time range filter

### Task 4.7: Endpoint Heatmap
**File:** `frontend/src/components/api-observability/EndpointHeatmap.tsx`

**Acceptance Criteria:**
- [ ] Heatmap grid: endpoints (Y-axis) x time (X-axis)
- [ ] Color gradient: cool (blue/green) = low traffic, warm (orange/red) = high traffic
- [ ] Configurable granularity: hourly, daily, weekly
- [ ] Hover tooltip with exact request count and time period
- [ ] Reveals patterns: "Bulk metadata endpoint hammered every Monday morning"

### Task 4.8: Alert Configuration UI
**File:** `frontend/src/components/api-observability/AlertConfigPanel.tsx`

**Acceptance Criteria:**
- [ ] List configured alerts with type, threshold, and status
- [ ] Create/edit form: type, threshold, window, cooldown, endpoint/key filters
- [ ] Enable/disable toggle
- [ ] Alert history: when each alert last fired

---

## Phase 5: Testing

### Task 5.1: Metrics Collection Tests
**File:** `tests/api_metrics_collection_test.rs`

**Acceptance Criteria:**
- [ ] Test middleware captures request metrics accurately
- [ ] Test metrics are buffered and flushed to minute buckets
- [ ] Test percentile calculation is within expected accuracy
- [ ] Test error counts correctly categorize 4xx and 5xx

### Task 5.2: Aggregation and Alerting Tests
**File:** `tests/api_metrics_aggregation_test.rs`

**Acceptance Criteria:**
- [ ] Test rollup from 1m to 5m preserves totals
- [ ] Test rollup from 5m to 1h preserves totals
- [ ] Test spike detection fires alert when threshold exceeded
- [ ] Test cooldown prevents repeated alerts
- [ ] Test retention cleanup removes old data at correct granularity

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_api_metrics.sql` | Time-series metrics table |
| `migrations/YYYYMMDDHHMMSS_create_api_alert_configs.sql` | Alert configuration table |
| `migrations/YYYYMMDDHHMMSS_create_rate_limit_utilization.sql` | Rate limit tracking |
| `src/middleware/api_metrics_collector.rs` | Request metrics middleware |
| `src/services/api_observability/aggregator.rs` | Metrics aggregation and rollup |
| `src/services/api_observability/spike_detector.rs` | Anomaly detection |
| `src/services/api_observability/rate_limit_tracker.rs` | Rate limit utilization |
| `src/services/api_observability/heatmap_generator.rs` | Heatmap data generation |
| `src/services/api_observability/retention.rs` | Metrics retention cleanup |
| `src/routes/api_observability.rs` | API metrics endpoints |
| `frontend/src/pages/ApiObservabilityDashboard.tsx` | Main dashboard page |
| `frontend/src/components/api-observability/RequestVolumeChart.tsx` | Volume chart |
| `frontend/src/components/api-observability/ResponseTimeChart.tsx` | Latency chart |
| `frontend/src/components/api-observability/ErrorRateChart.tsx` | Error rate chart |
| `frontend/src/components/api-observability/RateLimitPanel.tsx` | Rate limit display |
| `frontend/src/components/api-observability/TopConsumersTable.tsx` | Top consumers |
| `frontend/src/components/api-observability/EndpointHeatmap.tsx` | Usage heatmap |
| `frontend/src/components/api-observability/AlertConfigPanel.tsx` | Alert management |

## Dependencies

### Upstream PRDs
- PRD-10: Event Bus, PRD-12: External API & Webhooks, PRD-45: Audit Logging

### Downstream PRDs
- PRD-73: Production Reporting (API usage data for reports)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.3)
2. Phase 2: Rust Backend (Tasks 2.1-2.6)
3. Phase 3: API Endpoints (Tasks 3.1-3.6)

**MVP Success Criteria:**
- Dashboard loads within 2 seconds for the default 24-hour view
- Metrics aggregation adds <5ms overhead per API request
- Spike detection alerts fire within 2 minutes of anomaly onset
- Rate limit utilization warnings fire before any key actually hits its limit

### Post-MVP Enhancements
1. Phase 4: React Frontend (Tasks 4.1-4.8)
2. Phase 5: Testing (Tasks 5.1-5.2)
3. CSV/JSON export (PRD Requirement 2.1)

## Notes

1. **PostgreSQL vs. time-series DB** -- The open question about PostgreSQL vs. a dedicated time-series database: start with PostgreSQL using date-based partitioning and the multi-granularity rollup approach. This avoids introducing a new dependency. If volume exceeds what PostgreSQL handles efficiently (millions of metrics rows per day), consider migrating to TimescaleDB (a PostgreSQL extension) as a minimal-disruption upgrade path.
2. **Aggregation granularity** -- The open question about granularity: 1-minute buckets for the last 24 hours, rolled up to 5-minute for 7 days, hourly for 90 days, and daily for long-term. This balances precision with storage efficiency.
3. **Non-admin access** -- The open question about non-admin users: defer to post-MVP. Initially, the observability dashboard is admin-only. Per-key dashboards for API consumers can be added later.
4. **t-digest for percentiles** -- Computing exact percentiles from millions of requests is expensive. The t-digest algorithm provides accurate approximations (within ~1% for P99) using fixed memory. The `tdigest` Rust crate implements this.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-106

# Task List: External API & Webhooks

**PRD Reference:** `design/prds/012-prd-external-api-webhooks.md`
**Scope:** Build an external-facing REST API with API key authentication, outbound webhooks with retry, rate limiting, audit logging, and key rotation for programmatic integration with external systems.

## Overview

This PRD creates the external integration surface of the platform. Unlike the internal API (used by the frontend with JWT auth), this external API uses API key authentication for service accounts and scripts. It provides read/write access to all platform entities, outbound webhook delivery on key events, per-key rate limiting, and a complete audit trail. The external API shares the same Axum router infrastructure and repository layer but adds a separate authentication path (API key instead of JWT) with scope-based authorization.

### What Already Exists
- PRD-002: Axum server, `AppState`, `AppError`, middleware stack
- PRD-003: Auth middleware (JWT-based), RBAC system, users table
- PRD-001: Entity repositories (projects, characters, scenes, segments)
- PRD-010: Event bus for webhook trigger events

### What We're Building
1. Database tables: `api_keys`, `webhooks`, `webhook_deliveries`, `api_audit_log`
2. API key authentication middleware (alongside JWT)
3. API key management endpoints (admin)
4. External API endpoints (same data, different auth)
5. Rate limiting middleware (per-key token bucket)
6. Outbound webhook delivery service
7. Webhook management endpoints (admin)
8. Audit logging for all external API calls
9. Key rotation with grace period

### Key Design Decisions
1. **API keys as Bearer tokens** — External clients use `Authorization: Bearer <api_key>` just like JWT, but the middleware detects the prefix to distinguish them.
2. **Scoped keys** — Each API key has a scope (read_only, project_specific, full_access). The scope restricts which endpoints and entities the key can access.
3. **Token bucket rate limiting** — In-memory token bucket per key with configurable refill rate. Simpler and faster than database-backed counting.
4. **Webhook delivery queue** — Failed webhook deliveries are persisted and retried. The delivery service runs as a background task.

---

## Phase 1: Database Schema

### Task 1.1: Create API Keys Table
**File:** `migrations/20260219100001_create_api_keys_table.sql`

```sql
CREATE TABLE api_key_scopes (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON api_key_scopes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO api_key_scopes (name, description) VALUES
    ('read_only', 'Read access to all entities'),
    ('project_read', 'Read access scoped to specific projects'),
    ('full_access', 'Read and write access to all entities'),
    ('project_full', 'Read and write access scoped to specific projects');

CREATE TABLE api_keys (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    scope_id BIGINT NOT NULL REFERENCES api_key_scopes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    rate_limit_read_per_min INTEGER NOT NULL DEFAULT 100,
    rate_limit_write_per_min INTEGER NOT NULL DEFAULT 20,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_scope_id ON api_keys(scope_id);
CREATE INDEX idx_api_keys_project_id ON api_keys(project_id);
CREATE INDEX idx_api_keys_created_by ON api_keys(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `api_key_scopes` lookup table with read_only, project_read, full_access, project_full
- [ ] `api_keys` table with hashed key (never stores plaintext)
- [ ] `key_prefix TEXT` stores first 8 chars for identification without revealing key
- [ ] `project_id` optional — only populated for project-scoped keys
- [ ] Per-key rate limits configurable
- [ ] `expires_at` for time-limited keys
- [ ] `revoked_at` for instant revocation

### Task 1.2: Create Webhooks Tables
**File:** `migrations/20260219100002_create_webhooks_tables.sql`

```sql
CREATE TABLE webhooks (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT,
    event_types JSONB NOT NULL DEFAULT '[]',
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    last_triggered_at TIMESTAMPTZ,
    failure_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_created_by ON webhooks(created_by);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE webhook_deliveries (
    id BIGSERIAL PRIMARY KEY,
    webhook_id BIGINT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
    event_id BIGINT REFERENCES events(id) ON DELETE SET NULL ON UPDATE CASCADE,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    response_status_code SMALLINT,
    response_body TEXT,
    attempt_count SMALLINT NOT NULL DEFAULT 0,
    max_attempts SMALLINT NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_event_id ON webhook_deliveries(event_id);
CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries(next_retry_at)
    WHERE status = 'pending' OR status = 'retrying';

CREATE TRIGGER set_updated_at BEFORE UPDATE ON webhook_deliveries
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] `webhooks` table with URL, secret (for HMAC signing), event type filter
- [ ] `event_types JSONB` — array of event type names to trigger on
- [ ] `webhook_deliveries` table tracks each delivery attempt
- [ ] `attempt_count` with `max_attempts` for retry limit
- [ ] `next_retry_at` for exponential backoff scheduling
- [ ] Partial index on pending/retrying deliveries for efficient polling

### Task 1.3: Create API Audit Log Table
**File:** `migrations/20260219100003_create_api_audit_log_table.sql`

```sql
CREATE TABLE api_audit_log (
    id BIGSERIAL PRIMARY KEY,
    api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL ON UPDATE CASCADE,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    query_params TEXT,
    request_body_size INTEGER,
    response_status SMALLINT NOT NULL,
    response_time_ms INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_audit_log_api_key_id ON api_audit_log(api_key_id);
CREATE INDEX idx_api_audit_log_created_at ON api_audit_log(created_at DESC);
CREATE INDEX idx_api_audit_log_path ON api_audit_log(path);
```

**Acceptance Criteria:**
- [ ] Every external API call logged with method, path, status, timing
- [ ] `api_key_id` identifies which key made the call
- [ ] IP address and user agent captured
- [ ] No `updated_at` (append-only log)
- [ ] Indexes for querying by key, time, and path

---

## Phase 2: API Key Authentication

### Task 2.1: API Key Generation and Hashing
**File:** `src/auth/api_key.rs`

```rust
use sha2::{Sha256, Digest};
use rand::Rng;

const KEY_PREFIX_LENGTH: usize = 8;
const KEY_LENGTH: usize = 48;

pub fn generate_api_key() -> (String, String, String) {
    let key: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(KEY_LENGTH)
        .map(char::from)
        .collect();

    let prefix = key[..KEY_PREFIX_LENGTH].to_string();
    let hash = hash_api_key(&key);

    (key, prefix, hash) // (plaintext to show user, prefix for identification, hash for storage)
}

pub fn hash_api_key(key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    format!("{:x}", hasher.finalize())
}
```

**Acceptance Criteria:**
- [ ] Generates random 48-character alphanumeric API key
- [ ] Returns plaintext (shown once), prefix (for display), and SHA-256 hash (for storage)
- [ ] Hash function matches the one used for validation
- [ ] `rand` crate added to `Cargo.toml`

### Task 2.2: API Key Auth Middleware
**File:** `src/middleware/api_key_auth.rs`

```rust
pub struct ApiKeyUser {
    pub key_id: DbId,
    pub scope: String,
    pub project_id: Option<DbId>,
    pub rate_limit_read: i32,
    pub rate_limit_write: i32,
}

#[axum::async_trait]
impl FromRequestParts<AppState> for ApiKeyUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let auth_header = parts.headers.get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized("Missing Authorization header".to_string()))?;

        let key = auth_header.strip_prefix("Bearer ")
            .ok_or(AppError::Unauthorized("Invalid Authorization format".to_string()))?;

        let key_hash = hash_api_key(key);

        let api_key = sqlx::query_as::<_, ApiKeyRow>(
            "SELECT ak.id, ak.scope_id, aks.name as scope_name, ak.project_id,
                    ak.rate_limit_read_per_min, ak.rate_limit_write_per_min,
                    ak.is_active, ak.expires_at, ak.revoked_at
             FROM api_keys ak
             JOIN api_key_scopes aks ON ak.scope_id = aks.id
             WHERE ak.key_hash = $1"
        )
        .bind(&key_hash)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| AppError::Unauthorized("Invalid API key".to_string()))?
        .ok_or(AppError::Unauthorized("Invalid API key".to_string()))?;

        // Check active, not expired, not revoked
        if !api_key.is_active {
            return Err(AppError::Unauthorized("API key is deactivated".to_string()));
        }
        if api_key.revoked_at.is_some() {
            return Err(AppError::Unauthorized("API key has been revoked".to_string()));
        }
        if let Some(expires) = api_key.expires_at {
            if expires < chrono::Utc::now() {
                return Err(AppError::Unauthorized("API key has expired".to_string()));
            }
        }

        // Update last_used_at (async, non-blocking)
        let pool = state.pool.clone();
        let key_id = api_key.id;
        tokio::spawn(async move {
            sqlx::query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1")
                .bind(key_id).execute(&pool).await.ok();
        });

        Ok(ApiKeyUser {
            key_id: api_key.id,
            scope: api_key.scope_name,
            project_id: api_key.project_id,
            rate_limit_read: api_key.rate_limit_read_per_min,
            rate_limit_write: api_key.rate_limit_write_per_min,
        })
    }
}
```

**Acceptance Criteria:**
- [ ] Reads Bearer token from Authorization header
- [ ] Hashes and looks up in `api_keys` table
- [ ] Checks: active, not expired, not revoked
- [ ] Updates `last_used_at` asynchronously (non-blocking)
- [ ] Returns `ApiKeyUser` with scope and rate limits

---

## Phase 3: Rate Limiting

### Task 3.1: Token Bucket Rate Limiter
**File:** `src/middleware/rate_limiter.rs`

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Instant;

struct TokenBucket {
    tokens: f64,
    max_tokens: f64,
    refill_rate: f64, // tokens per second
    last_refill: Instant,
}

pub struct RateLimiter {
    buckets: Arc<Mutex<HashMap<String, TokenBucket>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            buckets: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn check(&self, key: &str, max_per_min: i32) -> Result<RateLimitInfo, ()> {
        let mut buckets = self.buckets.lock().await;
        let bucket = buckets.entry(key.to_string()).or_insert_with(|| {
            TokenBucket {
                tokens: max_per_min as f64,
                max_tokens: max_per_min as f64,
                refill_rate: max_per_min as f64 / 60.0,
                last_refill: Instant::now(),
            }
        });

        // Refill tokens
        let elapsed = bucket.last_refill.elapsed().as_secs_f64();
        bucket.tokens = (bucket.tokens + elapsed * bucket.refill_rate).min(bucket.max_tokens);
        bucket.last_refill = Instant::now();

        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            Ok(RateLimitInfo {
                limit: max_per_min,
                remaining: bucket.tokens as i32,
                retry_after: None,
            })
        } else {
            let retry_after = ((1.0 - bucket.tokens) / bucket.refill_rate).ceil() as u64;
            Err(())
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Token bucket algorithm with per-key buckets
- [ ] Configurable rate per key (read and write separate)
- [ ] Returns remaining tokens for response headers
- [ ] Returns retry-after duration when rate exceeded
- [ ] 429 Too Many Requests response with Retry-After header

### Task 3.2: Rate Limit Response Headers
**File:** `src/middleware/rate_limiter.rs` (middleware layer)

**Acceptance Criteria:**
- [ ] `X-RateLimit-Limit` header on all external API responses
- [ ] `X-RateLimit-Remaining` header with remaining tokens
- [ ] `Retry-After` header on 429 responses
- [ ] Read and write endpoints use separate rate limits

---

## Phase 4: External API Endpoints

### Task 4.1: External API Router
**File:** `src/api/external.rs`

```rust
pub fn external_api_routes() -> Router<AppState> {
    Router::new()
        .route("/projects", axum::routing::get(ext_handlers::list_projects))
        .route("/projects/:id", axum::routing::get(ext_handlers::get_project))
        .route("/projects/:id/characters", axum::routing::get(ext_handlers::list_characters))
        .route("/projects/:id/characters/:char_id/scenes", axum::routing::get(ext_handlers::list_scenes))
        .route("/jobs", axum::routing::get(ext_handlers::list_jobs)
            .post(ext_handlers::submit_job))
        .route("/jobs/:id", axum::routing::get(ext_handlers::get_job))
        // ... more endpoints
}
```

**Acceptance Criteria:**
- [ ] External API mounted at `/api/ext/v1/`
- [ ] Reuses existing repositories (same data, different auth)
- [ ] Scope enforcement: read-only keys cannot access write endpoints
- [ ] Project-scoped keys can only access their project's data
- [ ] Pagination, filtering, sorting on list endpoints

### Task 4.2: Audit Logging Middleware
**File:** `src/middleware/api_audit.rs`

```rust
pub async fn audit_log_middleware(
    api_key: ApiKeyUser,
    req: Request<Body>,
    next: Next<Body>,
) -> Response {
    let method = req.method().to_string();
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(String::from);
    let start = Instant::now();

    let response = next.run(req).await;

    let status = response.status().as_u16() as i16;
    let duration = start.elapsed().as_millis() as i32;

    // Async log (non-blocking)
    tokio::spawn(async move {
        sqlx::query(
            "INSERT INTO api_audit_log (api_key_id, method, path, query_params, response_status, response_time_ms)
             VALUES ($1, $2, $3, $4, $5, $6)"
        )
        .bind(api_key.key_id)
        .bind(&method)
        .bind(&path)
        .bind(&query)
        .bind(status)
        .bind(duration)
        .execute(&pool)
        .await
        .ok();
    });

    response
}
```

**Acceptance Criteria:**
- [ ] Every external API call logged to `api_audit_log`
- [ ] Captures: key_id, method, path, query, status, response time
- [ ] Logging is non-blocking (async spawn)
- [ ] Audit log does not slow down API responses

---

## Phase 5: Webhook Delivery

### Task 5.1: Webhook Delivery Service
**File:** `src/webhooks/delivery.rs`

```rust
pub struct WebhookDeliveryService {
    pool: PgPool,
    client: reqwest::Client,
}

impl WebhookDeliveryService {
    pub async fn run(&self, cancel_token: CancellationToken) {
        let mut ticker = tokio::time::interval(Duration::from_secs(5));
        loop {
            tokio::select! {
                _ = cancel_token.cancelled() => break,
                _ = ticker.tick() => self.process_pending_deliveries().await,
            }
        }
    }

    async fn process_pending_deliveries(&self) {
        let pending = sqlx::query_as::<_, WebhookDelivery>(
            "SELECT wd.*, w.url, w.secret FROM webhook_deliveries wd
             JOIN webhooks w ON wd.webhook_id = w.id
             WHERE (wd.status = 'pending' OR wd.status = 'retrying')
               AND (wd.next_retry_at IS NULL OR wd.next_retry_at <= NOW())
               AND wd.attempt_count < wd.max_attempts
             ORDER BY wd.created_at ASC LIMIT 50"
        )
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default();

        for delivery in pending {
            self.attempt_delivery(&delivery).await;
        }
    }

    async fn attempt_delivery(&self, delivery: &WebhookDelivery) {
        let mut request = self.client.post(&delivery.url)
            .json(&delivery.payload)
            .timeout(Duration::from_secs(10));

        // HMAC signing if secret is configured
        if let Some(secret) = &delivery.secret {
            let signature = compute_hmac(secret, &delivery.payload);
            request = request.header("X-Webhook-Signature", signature);
        }

        match request.send().await {
            Ok(response) => {
                let status = response.status().as_u16() as i16;
                if response.status().is_success() {
                    // Mark delivered
                    self.mark_delivered(delivery.id, status).await;
                } else {
                    // Schedule retry
                    self.schedule_retry(delivery.id, status, delivery.attempt_count + 1).await;
                }
            }
            Err(e) => {
                self.schedule_retry(delivery.id, 0, delivery.attempt_count + 1).await;
            }
        }
    }

    async fn schedule_retry(&self, delivery_id: DbId, status: i16, attempt: i16) {
        let delay_secs = (2i64.pow(attempt as u32)).min(3600); // 2, 4, 8... capped at 1h
        sqlx::query(
            "UPDATE webhook_deliveries SET status = 'retrying', attempt_count = $2,
                    response_status_code = $3,
                    next_retry_at = NOW() + ($4 || ' seconds')::INTERVAL
             WHERE id = $1"
        )
        .bind(delivery_id)
        .bind(attempt)
        .bind(status)
        .bind(delay_secs.to_string())
        .execute(&self.pool)
        .await
        .ok();
    }
}
```

**Acceptance Criteria:**
- [ ] Polls for pending deliveries every 5 seconds
- [ ] Delivers payload via POST with 10-second timeout
- [ ] HMAC-SHA256 signature in `X-Webhook-Signature` header when secret configured
- [ ] Exponential backoff: 2s, 4s, 8s, 16s... capped at 1 hour
- [ ] Max 3 attempts before marking as failed
- [ ] Response status code captured

### Task 5.2: Webhook Event Subscription
**File:** `src/webhooks/subscriber.rs`

```rust
pub struct WebhookSubscriber {
    pool: PgPool,
}

impl WebhookSubscriber {
    /// Called by the event bus when an event is published
    pub async fn on_event(&self, event: &PlatformEvent) {
        // Find webhooks subscribed to this event type
        let webhooks = sqlx::query_as::<_, Webhook>(
            "SELECT * FROM webhooks WHERE is_enabled = true
             AND event_types @> $1::jsonb"
        )
        .bind(serde_json::json!([&event.event_type]))
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default();

        // Create delivery records for each webhook
        for webhook in webhooks {
            sqlx::query(
                "INSERT INTO webhook_deliveries (webhook_id, event_id, payload)
                 VALUES ($1, $2, $3)"
            )
            .bind(webhook.id)
            .bind(event.event_id)
            .bind(&event.payload)
            .execute(&self.pool)
            .await
            .ok();
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Subscribes to event bus events
- [ ] Matches events against webhook `event_types` filter
- [ ] Creates delivery record for each matching webhook
- [ ] Delivery service picks up records and sends them

---

## Phase 6: Admin API Key and Webhook Management

### Task 6.1: API Key Management Endpoints
**File:** `src/api/handlers/api_keys.rs`

**Acceptance Criteria:**
- [ ] `POST /api/v1/admin/api-keys` — generate new key (returns plaintext once)
- [ ] `GET /api/v1/admin/api-keys` — list keys (shows prefix, not full key)
- [ ] `PUT /api/v1/admin/api-keys/:id` — update key settings (rate limits, scope)
- [ ] `POST /api/v1/admin/api-keys/:id/rotate` — rotate key (new key, old key has grace period)
- [ ] `POST /api/v1/admin/api-keys/:id/revoke` — instantly revoke key
- [ ] All admin-only endpoints

### Task 6.2: Webhook Management Endpoints
**File:** `src/api/handlers/webhooks.rs`

**Acceptance Criteria:**
- [ ] `POST /api/v1/admin/webhooks` — create webhook subscription
- [ ] `GET /api/v1/admin/webhooks` — list webhooks
- [ ] `PUT /api/v1/admin/webhooks/:id` — update webhook (URL, events, enabled)
- [ ] `DELETE /api/v1/admin/webhooks/:id` — delete webhook
- [ ] `POST /api/v1/admin/webhooks/:id/test` — send test payload
- [ ] `GET /api/v1/admin/webhooks/:id/deliveries` — delivery history with status
- [ ] `POST /api/v1/admin/webhooks/deliveries/:id/replay` — replay failed delivery

---

## Phase 7: Integration Tests

### Task 7.1: API Key Auth Tests
**File:** `tests/api_key_tests.rs`

**Acceptance Criteria:**
- [ ] Test: valid key authenticates successfully
- [ ] Test: revoked key returns 401
- [ ] Test: expired key returns 401
- [ ] Test: read-only key cannot access write endpoint (403)
- [ ] Test: project-scoped key cannot access other projects (403)
- [ ] Test: rate limiting returns 429 after exceeding limit

### Task 7.2: Webhook Delivery Tests
**File:** `tests/webhook_tests.rs`

**Acceptance Criteria:**
- [ ] Test: event creates delivery records for matching webhooks
- [ ] Test: successful delivery marks record as delivered
- [ ] Test: failed delivery schedules retry with exponential backoff
- [ ] Test: HMAC signature is correct
- [ ] Test: max attempts reached marks delivery as failed

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/20260219100001_create_api_keys_table.sql` | API keys and scopes DDL |
| `migrations/20260219100002_create_webhooks_tables.sql` | Webhooks and deliveries DDL |
| `migrations/20260219100003_create_api_audit_log_table.sql` | API audit log DDL |
| `src/auth/api_key.rs` | API key generation and hashing |
| `src/middleware/api_key_auth.rs` | API key authentication extractor |
| `src/middleware/rate_limiter.rs` | Token bucket rate limiter |
| `src/middleware/api_audit.rs` | Audit logging middleware |
| `src/api/external.rs` | External API router and endpoints |
| `src/webhooks/mod.rs` | Webhooks module barrel |
| `src/webhooks/delivery.rs` | Webhook delivery service with retry |
| `src/webhooks/subscriber.rs` | Event bus -> webhook subscription |
| `src/api/handlers/api_keys.rs` | Admin API key management |
| `src/api/handlers/webhooks.rs` | Admin webhook management |
| `src/repositories/api_key_repo.rs` | API key CRUD |
| `src/repositories/webhook_repo.rs` | Webhook CRUD |

---

## Dependencies

### Existing Components to Reuse
- PRD-002: Axum server, `AppState`, `AppError`
- PRD-003: User model, admin role checks
- PRD-001: Entity repositories for data access
- PRD-010: Event bus for webhook triggering

### New Infrastructure Needed
- `hmac` and `sha2` crates for webhook HMAC signing
- `rand` crate for API key generation
- `reqwest` (likely already present) for webhook HTTP calls

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Database Schema — Tasks 1.1–1.3
2. Phase 2: API Key Authentication — Tasks 2.1–2.2
3. Phase 3: Rate Limiting — Tasks 3.1–3.2
4. Phase 4: External API Endpoints — Tasks 4.1–4.2

**MVP Success Criteria:**
- API keys generated, hashed, and validated
- External API endpoints accessible with API key auth
- Rate limiting enforces per-key thresholds
- All external API calls logged to audit table
- Scope enforcement restricts access

### Post-MVP Enhancements
1. Phase 5: Webhook Delivery — Tasks 5.1–5.2
2. Phase 6: Admin Management — Tasks 6.1–6.2
3. Phase 7: Integration Tests — Tasks 7.1–7.2

---

## Notes

1. **Key rotation grace period:** When a key is rotated, the old key remains valid for a configurable period (default 24h). Both old and new hashes are checked during the grace period.
2. **HMAC signing:** Webhooks can optionally include an HMAC-SHA256 signature so recipients can verify the payload's authenticity. The secret is stored in the `webhooks` table.
3. **Audit log retention:** The audit log grows continuously. Consider partitioning by month or automatic archival of records older than 90 days.
4. **API versioning:** External API is mounted at `/api/ext/v1/`. When breaking changes are needed, a `/api/ext/v2/` can be created alongside.
5. **Idempotency:** Write endpoints should support an `Idempotency-Key` header. The key is stored and checked to prevent duplicate operations from retried requests.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD

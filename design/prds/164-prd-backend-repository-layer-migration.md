# PRD-164: Backend Repository Layer Migration

## 1. Introduction/Overview

The backend follows a repository pattern where SQL queries live in `crates/db/src/repositories/` and handlers in `crates/api/src/handlers/` call repository methods. However, 24 handler files currently contain inline `sqlx::query` calls — raw SQL that should live in the repository layer. The worst offender is `scene_video_version.rs` with 10 inline queries, including an 80-line browse query with 15 bind parameters duplicated between count and items variants.

Additionally, 30+ repository functions use unbounded `list_all()` without pagination, and the connection pool configuration is hardcoded with potentially conservative defaults.

This PRD migrates inline SQL to the repository layer, adds pagination to unbounded queries, and makes the connection pool configurable.

These fixes are sourced from the **Performance Audit — Rust Backend** (2026-03-30), findings PERF-16, PERF-17, and PERF-20.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-00** (Database Normalization) — repository pattern, `PaginationParams` type
- **PRD-02** (Backend Foundation) — connection pool setup in `crates/db/src/lib.rs`

### Extends
- **PRD-109** (Scene Video Versioning) — `scene_video_version.rs` has the most inline SQL
- **PRD-39** (Delivery Packaging) — `delivery.rs` inline SQL
- **PRD-129** (Character Review Allocation) — `avatar_review.rs` inline SQL
- **PRD-112** (Project Hub) — `project.rs` inline SQL

### Related
- **PRD-160** (Critical N+1 Elimination) — new batch methods belong in repositories
- **PRD-161** (N+1 Cleanup) — additional repository methods
- **PRD-162** (Transaction Safety) — repository methods need to accept transactions

## 3. Goals

### Primary Goals
1. Move all inline `sqlx::query` calls from handler files to the `db/repositories` layer.
2. Add pagination (using existing `PaginationParams`) to unbounded `list_all()` functions on growth tables.
3. Make connection pool configuration (max connections, max lifetime) driven by environment variables.

### Secondary Goals
- Eliminate SQL duplication between count and items queries in browse endpoints.
- Ensure all repository methods accept `impl Executor` for transaction compatibility (PRD-162).
- Improve code organization and testability by centralizing all SQL.

## 4. User Stories

- **US-1:** As a backend developer, I want all SQL in the repository layer so I can find, review, and optimize queries in one place instead of hunting through 24 handler files.
- **US-2:** As an operator of a growing instance, I want `list_all` endpoints to be paginated by default so they don't cause OOM or timeout on tables with millions of rows.
- **US-3:** As a deployment engineer, I want to tune the database connection pool via environment variables so I can optimize for my hardware without code changes.

## 5. Functional Requirements

### Phase 1: Priority Repository Migration (PERF-16)

#### Requirement 1.1: Migrate `scene_video_version.rs` Inline SQL

**File:** `crates/api/src/handlers/scene_video_version.rs` — **10 inline `sqlx::query` calls**

**Priority:** Highest — the browse query alone is ~80 lines of raw SQL with 15 bind parameters.

**Acceptance Criteria:**
- [ ] All 10 `sqlx::query` / `sqlx::query_as` calls moved to `SceneVideoVersionRepo` or related repository
- [ ] Browse query (count + items) consolidated: shared query builder or CTE that returns both count and rows
- [ ] Handler file contains zero `sqlx::` imports
- [ ] All moved queries have corresponding repository method signatures documenting their purpose
- [ ] Existing API behavior is identical (same JSON responses)

**Technical Notes:**
- The browse query has 15 bind parameters for filters — consider a `BrowseFilter` struct that the repo method accepts
- Count and items queries share identical WHERE clause — DRY this with a shared builder or CTE

#### Requirement 1.2: Migrate Remaining Handler Files

**Files with inline SQL:**
- `delivery.rs`
- `directors_view.rs`
- `qa_rulesets.rs`
- `comparison.rs`
- `media_management.rs`
- `compliance.rs`
- `dashboard.rs`
- `avatar_review.rs`
- `avatar.rs`
- `project.rs`
- `avatar_dashboard.rs`
- `pipelines.rs`
- `media_variant.rs`
- `export.rs`
- `annotation.rs`
- (and remaining files up to 24 total)

**Acceptance Criteria:**
- [ ] All 24 handler files have zero `sqlx::query` calls
- [ ] Each query is moved to the appropriate existing repository (e.g., `delivery.rs` queries go to `DeliveryRepo`)
- [ ] If no repository exists for a handler's domain, a new repository is created following existing naming conventions
- [ ] All handler files have zero `sqlx::` imports (only import from `db::repositories::*`)
- [ ] No SQL duplication between count/items variants of list queries

### Phase 2: Pagination for Unbounded Queries (PERF-17)

#### Requirement 2.1: Add Pagination to Growth-Table `list_all` Functions

**Description:** Add `PaginationParams` (already exists in `crate::query`) with a default LIMIT of 1000 to repository functions that query tables with unbounded growth.

**Lookup tables (SKIP — bounded by design):** Languages, resolution tiers, scene types, status tables, category values.

**Growth tables (MUST paginate):**
- `BulkOperationRepo::list_all`
- `TriggerWorkflowRepo::list_all`
- `SessionManagementRepo::list_all`
- `ModelChecksumRepo::list_all`
- `BudgetQuotaRepo::list_all`
- `WebhookTestingRepo::list_all`

**Acceptance Criteria:**
- [ ] Each listed `list_all` function signature changed to accept `PaginationParams`
- [ ] Default LIMIT of 1000 when no pagination is provided
- [ ] Response includes pagination metadata (`total_count`, `limit`, `offset`) in the API envelope `meta` field
- [ ] Handlers that call these functions pass through pagination query params from the request
- [ ] Frontend components that consume these endpoints handle pagination (or show first page with "load more")
- [ ] Lookup table `list_all` functions are explicitly left unbounded (documented with a comment explaining why)

**Technical Notes:**
- `PaginationParams` already exists in `crate::query` — reuse it
- Pattern: `SELECT ... LIMIT $1 OFFSET $2` with a parallel `SELECT COUNT(*)` for total

### Phase 3: Connection Pool Configuration (PERF-20)

#### Requirement 3.1: Make Connection Pool Configurable via Environment Variables

**File:** `crates/db/src/lib.rs:18-27`

**Current behavior:** Hardcoded `max_connections: 10`, no `max_lifetime`.

**Acceptance Criteria:**
- [ ] `DATABASE_MAX_CONNECTIONS` env var controls `max_connections` (default: 10)
- [ ] `DATABASE_MAX_LIFETIME_SECS` env var controls `max_lifetime` (default: 1800 seconds / 30 minutes)
- [ ] `DATABASE_MIN_CONNECTIONS` env var controls `min_connections` (default: 2)
- [ ] `DATABASE_ACQUIRE_TIMEOUT_SECS` env var controls connection acquire timeout (default: 30)
- [ ] All defaults match current behavior (10 connections) to avoid breaking existing deployments
- [ ] `max_lifetime` is set even with default — prevents stale connections
- [ ] Pool configuration is logged at startup (INFO level) showing actual values
- [ ] `.env.example` updated with the new variables and their defaults

**Technical Notes:**
- Use `std::env::var("DATABASE_MAX_CONNECTIONS").ok().and_then(|v| v.parse().ok()).unwrap_or(10)`
- `max_lifetime(Duration::from_secs(max_lifetime_secs))` prevents connections from living forever
- With N+1 fixes (PRD-160, PRD-161), 10 connections should be sufficient, but operators need the ability to tune

## 6. Non-Functional Requirements

### Performance
- Repository migration: zero performance impact (same SQL, different file location)
- Pagination: prevents OOM on large tables, adds < 1ms overhead for `COUNT(*)` on indexed tables
- Connection pool: `max_lifetime` prevents stale connection errors under load

### Security
- No changes to authorization logic
- Connection pool credentials handling unchanged

## 7. Non-Goals (Out of Scope)

- Query optimization (covered by PRD-160, PRD-161)
- Transaction wrapping (covered by PRD-162)
- Async runtime fixes (covered by PRD-163)
- Adding a query builder abstraction (raw SQL in repositories is fine)
- Migrating to a different database library

## 8. Design Considerations

- **Repository method naming:** Follow existing convention: `list_*`, `find_*`, `create_*`, `update_*`, `delete_*`
- **Browse query pattern:** Use a `BrowseParams` struct for complex filter queries (like the 15-parameter video browse) rather than individual parameters
- **Pagination default:** 1000 is generous for admin/internal endpoints — external API endpoints may want smaller defaults (100)

## 9. Technical Considerations

### Existing Code to Reuse
- `PaginationParams` from `crate::query`
- All existing repository patterns in `crates/db/src/repositories/`
- `sqlx::query_as!` macro for type-safe queries
- Existing `DbId` type alias

### Database Changes
- No schema changes
- No new migrations

### API Changes
- Paginated endpoints gain `meta.total_count`, `meta.limit`, `meta.offset` in response envelope (additive)
- Existing unpaginated calls continue to work (default limit applied server-side)

## 10. Edge Cases & Error Handling

- **Migration correctness:** Each moved query must be tested against the same inputs to verify identical SQL behavior — use existing integration tests as the verification suite
- **Pagination on empty tables:** Return `{ data: [], meta: { total_count: 0, limit: 1000, offset: 0 } }`
- **Invalid pagination params:** Negative offset or limit should be rejected with 400 Bad Request
- **Pool exhaustion:** With configurable pool, operators might set `max_connections` too low — log a WARNING if pool utilization exceeds 80%
- **Pool env var parsing errors:** Invalid values should fall back to defaults with a WARNING log, not crash the server

## 11. Success Metrics

- Zero `sqlx::query` calls in any handler file (verified by grep)
- All growth-table `list_all` functions accept `PaginationParams`
- Connection pool configurable via 4 environment variables
- No regression in existing integration tests

## 12. Testing Requirements

- **Integration tests:** All existing tests pass after migration (same SQL, same results)
- **Pagination tests:** Verify `limit`, `offset`, and `total_count` for paginated endpoints
- **Pool config tests:** Verify env var parsing with valid, invalid, and missing values
- **SQL audit:** Grep `crates/api/src/handlers/` for `sqlx::query` — must return zero results after Phase 1

## 13. Open Questions

- Should browse queries use a CTE for shared WHERE clause between count and items, or a Rust query builder struct?
- Should we add a `DATABASE_IDLE_TIMEOUT_SECS` env var as well, or is `max_lifetime` sufficient?
- For handlers that call repositories — should all method signatures accept `impl Executor` now (for PRD-162 compatibility), or defer that to PRD-162?

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-30 | AI Product Manager | Initial draft from PERFORMANCE-AUDIT-BACKEND.md findings PERF-16, PERF-17, PERF-20 |

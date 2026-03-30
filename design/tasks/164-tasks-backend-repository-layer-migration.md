# Task List: Backend Repository Layer Migration

**PRD Reference:** `design/prds/164-prd-backend-repository-layer-migration.md`
**Scope:** Move all inline `sqlx::query` calls from 24 handler files to the repository layer, add pagination to unbounded `list_all()` queries on growth tables, and make the connection pool configurable via environment variables.

## Overview

The backend follows a repository pattern where SQL lives in `crates/db/src/repositories/` and handlers call repository methods. However, 24 handler files contain inline `sqlx::query` calls — raw SQL that should be in the repository layer. The worst offender is `scene_video_version.rs` with 10 inline queries including an 80-line browse query. Additionally, 30+ repository functions use unbounded `list_all()` without pagination, and the connection pool is hardcoded. This PRD centralizes all SQL, adds pagination to growth tables, and makes the pool configurable.

### What Already Exists
- Repository pattern in `apps/backend/crates/db/src/repositories/` — 40+ repository files
- `PaginationParams` in `crates/db/src/query.rs` for paginated list methods
- `DbId` type alias, `sqlx::query_as!` macro for type-safe queries
- `PoolConfig` struct in `crates/db/src/lib.rs` with `max_connections`, `min_connections`, etc.
- `.env.example` for documenting environment variables

### What We're Building
1. Move 10 inline queries from `scene_video_version.rs` to `SceneVideoVersionRepo`
2. Move inline queries from 23 additional handler files to their repos
3. Add `PaginationParams` to 6 growth-table `list_all` functions
4. Make connection pool configurable via 4 env vars + add `max_lifetime`

### Key Design Decisions
1. **Repository method naming** — follow existing convention: `list_*`, `find_*`, `create_*`, `update_*`, `delete_*`, `browse_*`
2. **`BrowseFilter` struct** for complex queries — the 80-line video browse query gets a typed filter struct instead of 15 individual parameters
3. **DRY count+items** — browse queries use a shared WHERE clause builder (Rust struct) to avoid SQL duplication
4. **Pagination defaults** — 1000 for internal endpoints, matches `PaginationParams` existing pattern

---

## Phase 1: Priority Repository Migration — `scene_video_version.rs`

### Task 1.1: Create `BrowseClipsFilter` Struct and Move Browse Query
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs` (new methods)
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs` (remove inline SQL)

Move the 80-line browse clips query (count + items) into the repository. Create a typed filter struct.

**New repository types and methods:**
```rust
/// Filter parameters for the clip browse query.
#[derive(Debug, Default)]
pub struct BrowseClipsFilter {
    pub pipeline_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub avatar_id: Option<DbId>,
    pub scene_type_id: Option<DbId>,
    pub track_id: Option<DbId>,
    pub status: Option<String>,
    pub search: Option<String>,
    pub has_preview: Option<bool>,
    pub is_purged: Option<bool>,
    pub sort_by: Option<String>,
    pub sort_dir: Option<String>,
    // ... remaining filter fields
}

/// Browse clips with filtering and pagination. Returns (items, total_count).
pub async fn browse_clips(
    pool: &DbPool,
    filter: &BrowseClipsFilter,
    pagination: &PaginationParams,
) -> Result<(Vec<ClipBrowseItem>, i64), sqlx::Error> {
    // Build WHERE clause once, use for both count and items query.
    // ... shared filter logic
}
```

**Current inline SQL locations in handler:**
- Line 887: `sqlx::query_scalar(&count_sql)` — count query
- Line 920: `sqlx::query_as::<_, ClipBrowseItem>(&items_sql)` — items query

**Acceptance Criteria:**
- [ ] `BrowseClipsFilter` struct encapsulates all filter parameters
- [ ] Single `browse_clips` method returns `(Vec<ClipBrowseItem>, i64)` — items and count
- [ ] WHERE clause built once and shared between count and items queries (no SQL duplication)
- [ ] Handler file no longer contains the browse SQL
- [ ] API response identical to current behavior
- [ ] `cargo check` passes

### Task 1.2: Move Derived Clips Browse Query to Repository
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs`
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

Move the derived clips browse query (lines 1744, 1765) to the repository.

**Current inline SQL locations:**
- Line 1744: `sqlx::query_scalar(&count_sql)` — derived clips count
- Line 1765: `sqlx::query_as::<_, DerivedClipItem>(&items_sql)` — derived clips items

**Acceptance Criteria:**
- [ ] `browse_derived_clips` method in `SceneVideoVersionRepo`
- [ ] Same `BrowseClipsFilter` struct reused or extended
- [ ] Handler has zero inline SQL for derived clips browse
- [ ] `cargo check` passes

### Task 1.3: Move Import Resolution Queries to Repository
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs` (or `avatar_repo.rs`)
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

Move the inline resolution queries used during derived clip import (lines 1384-1492).

**Current inline SQL locations:**
- Line 1384: `sqlx::query_as("SELECT id FROM avatars WHERE ...")` — avatar slug resolution
- Line 1398: `sqlx::query_as(/* fallback avatar query */)` — fallback resolution
- Line 1443: `sqlx::query_as("SELECT id FROM tracks WHERE ...")` — track resolution
- Line 1463: `sqlx::query_as("SELECT id FROM scenes WHERE ...")` — scene resolution
- Line 1492: `sqlx::query_as("SELECT id FROM scene_video_versions WHERE ...")` — parent version

**New repository methods:**
```rust
// In AvatarRepo:
pub async fn find_by_slug(pool: &DbPool, slug: &str) -> Result<Option<DbId>, sqlx::Error> { }
pub async fn find_by_slug_fallback(pool: &DbPool, slug: &str) -> Result<Option<DbId>, sqlx::Error> { }

// In TrackRepo:
pub async fn find_id_by_slug(pool: &DbPool, slug: &str) -> Result<Option<DbId>, sqlx::Error> { }

// In SceneRepo:
pub async fn find_id_by_components(pool: &DbPool, avatar_id: DbId, scene_type_id: DbId, track_id: DbId) -> Result<Option<DbId>, sqlx::Error> { }

// In SceneVideoVersionRepo:
pub async fn find_parent_version(pool: &DbPool, scene_id: DbId, version: i32) -> Result<Option<DbId>, sqlx::Error> { }
```

**Acceptance Criteria:**
- [ ] All 5 inline resolution queries moved to appropriate repositories
- [ ] Each query in its domain-correct repository (avatar queries in AvatarRepo, etc.)
- [ ] Handler uses repo method calls instead of inline SQL
- [ ] `cargo check` passes

### Task 1.4: Move Remaining 2 Inline Queries from `scene_video_version.rs`
**File:** `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs`
**File:** `apps/backend/crates/api/src/handlers/scene_video_version.rs`

Move the remaining inline queries at lines 1046 and 1068.

**Current inline SQL locations:**
- Line 1046: `sqlx::query(/* ... */)` — likely an update or status change
- Line 1068: `sqlx::query(&sql)` — dynamic query

**Acceptance Criteria:**
- [ ] All 10 inline `sqlx::query` calls removed from `scene_video_version.rs`
- [ ] Handler file has zero `sqlx::` imports
- [ ] `cargo check` passes

---

## Phase 2: Remaining Handler File Migration

### Task 2.1: Migrate `delivery.rs` Inline SQL
**File:** `apps/backend/crates/api/src/handlers/delivery.rs`
**File:** `apps/backend/crates/db/src/repositories/delivery_repo.rs`

**Acceptance Criteria:**
- [ ] All `sqlx::query` calls moved to `DeliveryRepo`
- [ ] Handler has zero `sqlx::` imports
- [ ] `cargo check` passes

### Task 2.2: Migrate `directors_view.rs` Inline SQL
**File:** `apps/backend/crates/api/src/handlers/directors_view.rs`

**Acceptance Criteria:**
- [ ] All `sqlx::query` calls moved to appropriate repository
- [ ] Handler has zero `sqlx::` imports
- [ ] `cargo check` passes

### Task 2.3: Migrate `avatar_review.rs` Inline SQL
**File:** `apps/backend/crates/api/src/handlers/avatar_review.rs`
**File:** `apps/backend/crates/db/src/repositories/avatar_review_repo.rs`

**Acceptance Criteria:**
- [ ] All `sqlx::query` calls moved to `AvatarReviewRepo`
- [ ] Handler has zero `sqlx::` imports
- [ ] `cargo check` passes

### Task 2.4: Migrate `project.rs` Inline SQL
**File:** `apps/backend/crates/api/src/handlers/project.rs`
**File:** `apps/backend/crates/db/src/repositories/project_repo.rs`

**Acceptance Criteria:**
- [ ] All `sqlx::query` calls moved to `ProjectRepo`
- [ ] Handler has zero `sqlx::` imports
- [ ] `cargo check` passes

### Task 2.5: Migrate Remaining 20 Handler Files
**Files:** `qa_rulesets.rs`, `comparison.rs`, `media_management.rs`, `compliance.rs`, `dashboard.rs`, `avatar.rs`, `avatar_dashboard.rs`, `pipelines.rs`, `media_variant.rs`, `export.rs`, `annotation.rs`, and remaining files up to 24 total.

**Process for each file:**
1. `grep -n "sqlx::query" <file>` to find all inline queries
2. Identify the correct repository for each query
3. Create a repository method with descriptive name
4. Replace inline SQL in handler with repo method call
5. Remove `sqlx::` imports from handler
6. `cargo check`

**Acceptance Criteria:**
- [ ] All 24 handler files have zero `sqlx::query` calls
- [ ] `grep -r "sqlx::query" apps/backend/crates/api/src/handlers/` returns zero results
- [ ] Each query moved to the appropriate repository
- [ ] New repositories created where needed (following naming conventions)
- [ ] No SQL duplication between count/items variants
- [ ] `cargo check` passes

---

## Phase 3: Pagination for Unbounded Queries

### Task 3.1: Add Pagination to `BulkOperationRepo::list_all`
**File:** `apps/backend/crates/db/src/repositories/bulk_operation_repo.rs`

**Current signature:**
```rust
pub async fn list_all(pool: &DbPool) -> Result<Vec<BulkOperation>, sqlx::Error>
```

**New signature:**
```rust
pub async fn list_all(
    pool: &DbPool,
    pagination: &PaginationParams,
) -> Result<(Vec<BulkOperation>, i64), sqlx::Error> {
    let total = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM bulk_operations"
    ).fetch_one(pool).await?.unwrap_or(0);

    let items = sqlx::query_as!(
        BulkOperation,
        "SELECT * FROM bulk_operations ORDER BY id DESC LIMIT $1 OFFSET $2",
        pagination.limit(),
        pagination.offset(),
    ).fetch_all(pool).await?;

    Ok((items, total))
}
```

**Acceptance Criteria:**
- [ ] Accepts `PaginationParams` with default LIMIT of 1000
- [ ] Returns `(Vec<T>, i64)` — items and total count
- [ ] Handler passes through pagination query params from request
- [ ] API response includes `meta.total_count`, `meta.limit`, `meta.offset`
- [ ] `cargo check` passes

### Task 3.2: Add Pagination to Remaining Growth-Table `list_all` Functions
**Files:**
- `apps/backend/crates/db/src/repositories/trigger_workflow_repo.rs`
- `apps/backend/crates/db/src/repositories/session_management_repo.rs`
- `apps/backend/crates/db/src/repositories/model_checksum_repo.rs`
- `apps/backend/crates/db/src/repositories/budget_quota_repo.rs`
- `apps/backend/crates/db/src/repositories/webhook_testing_repo.rs`

Apply the same pagination pattern as Task 3.1 to all five remaining repos.

**Acceptance Criteria:**
- [ ] All 5 `list_all` functions accept `PaginationParams`
- [ ] Default LIMIT of 1000 when no pagination provided
- [ ] All return `(Vec<T>, i64)` tuple
- [ ] Corresponding handlers updated to pass pagination params
- [ ] Lookup table `list_all` functions left unbounded (with comment: `// Bounded by design — lookup table`)
- [ ] `cargo check` passes

### Task 3.3: Update Handlers to Pass Pagination and Include Meta
**Files:** Handler files that call the updated `list_all` functions

For each paginated endpoint, update the handler to:
1. Extract `PaginationParams` from query string
2. Pass to the repo method
3. Include pagination metadata in the response envelope

```rust
pub async fn list_operations(
    State(state): State<AppState>,
    Query(pagination): Query<PaginationParams>,
) -> AppResult<Json<PaginatedResponse<BulkOperation>>> {
    let (items, total) = BulkOperationRepo::list_all(&state.pool, &pagination).await?;
    Ok(Json(PaginatedResponse {
        data: items,
        meta: PaginationMeta {
            total_count: total,
            limit: pagination.limit(),
            offset: pagination.offset(),
        },
    }))
}
```

**Acceptance Criteria:**
- [ ] Each handler extracts `PaginationParams` from query string
- [ ] Response includes `meta.total_count`, `meta.limit`, `meta.offset`
- [ ] Default pagination (no params) returns first 1000 rows
- [ ] Invalid pagination params (negative offset/limit) rejected with 400
- [ ] `cargo check` passes

---

## Phase 4: Connection Pool Configuration

### Task 4.1: Make Connection Pool Configurable via Environment Variables
**File:** `apps/backend/crates/db/src/lib.rs` (lines 18-46)

**Current `PoolConfig` (lines 18-27):**
```rust
impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_connections: 10,
            min_connections: 2,
            idle_timeout_secs: 300,
            acquire_timeout_secs: 5,
        }
    }
}
```

**New `PoolConfig::from_env`:**
```rust
impl PoolConfig {
    /// Load pool configuration from environment variables with sensible defaults.
    pub fn from_env() -> Self {
        let config = Self {
            max_connections: std::env::var("DATABASE_MAX_CONNECTIONS")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(10),
            min_connections: std::env::var("DATABASE_MIN_CONNECTIONS")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(2),
            idle_timeout_secs: std::env::var("DATABASE_IDLE_TIMEOUT_SECS")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(300),
            acquire_timeout_secs: std::env::var("DATABASE_ACQUIRE_TIMEOUT_SECS")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(30),
            max_lifetime_secs: std::env::var("DATABASE_MAX_LIFETIME_SECS")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(1800),
        };
        tracing::info!(
            max_connections = config.max_connections,
            min_connections = config.min_connections,
            idle_timeout_secs = config.idle_timeout_secs,
            acquire_timeout_secs = config.acquire_timeout_secs,
            max_lifetime_secs = config.max_lifetime_secs,
            "Database pool configured"
        );
        config
    }
}
```

Also add `max_lifetime_secs` field to `PoolConfig` and apply it in `create_pool_with_config`:

```rust
pub struct PoolConfig {
    pub max_connections: u32,
    pub min_connections: u32,
    pub idle_timeout_secs: u64,
    pub acquire_timeout_secs: u64,
    pub max_lifetime_secs: u64,  // NEW
}

pub async fn create_pool_with_config(
    database_url: &str,
    config: PoolConfig,
) -> Result<DbPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .idle_timeout(Duration::from_secs(config.idle_timeout_secs))
        .acquire_timeout(Duration::from_secs(config.acquire_timeout_secs))
        .max_lifetime(Duration::from_secs(config.max_lifetime_secs))  // NEW
        .connect(database_url)
        .await
}
```

**Acceptance Criteria:**
- [ ] `DATABASE_MAX_CONNECTIONS` env var (default: 10)
- [ ] `DATABASE_MIN_CONNECTIONS` env var (default: 2)
- [ ] `DATABASE_ACQUIRE_TIMEOUT_SECS` env var (default: 30)
- [ ] `DATABASE_MAX_LIFETIME_SECS` env var (default: 1800 / 30 minutes)
- [ ] `max_lifetime` applied in `create_pool_with_config` — prevents stale connections
- [ ] Pool configuration logged at startup (INFO level)
- [ ] Invalid env var values fall back to defaults (no crash)
- [ ] Existing `Default` impl updated to include `max_lifetime_secs: 1800`
- [ ] `cargo check` passes

### Task 4.2: Update Pool Creation Call Site to Use `from_env`
**File:** `apps/backend/crates/api/src/main.rs` (or wherever `create_pool` is called)

Update the server startup to use `PoolConfig::from_env()` instead of `PoolConfig::default()`.

**Acceptance Criteria:**
- [ ] Pool created with `create_pool_with_config(url, PoolConfig::from_env()).await?`
- [ ] Existing deployments unchanged (same defaults)
- [ ] `cargo check` passes

### Task 4.3: Update `.env.example` with Pool Configuration Variables
**File:** `apps/backend/.env.example`

Add the new environment variables with their defaults and descriptions.

```env
# Database Connection Pool
# DATABASE_MAX_CONNECTIONS=10
# DATABASE_MIN_CONNECTIONS=2
# DATABASE_ACQUIRE_TIMEOUT_SECS=30
# DATABASE_MAX_LIFETIME_SECS=1800
```

**Acceptance Criteria:**
- [ ] All 4 env vars documented in `.env.example`
- [ ] Default values shown in comments
- [ ] Brief description of each variable's purpose
- [ ] `cargo check` passes (no code changes in this task)

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/backend/crates/db/src/repositories/scene_video_version_repo.rs` | Browse queries, resolution queries migrated here |
| `apps/backend/crates/api/src/handlers/scene_video_version.rs` | 10 inline queries removed |
| `apps/backend/crates/api/src/handlers/delivery.rs` | Inline SQL removed |
| `apps/backend/crates/api/src/handlers/directors_view.rs` | Inline SQL removed |
| `apps/backend/crates/api/src/handlers/avatar_review.rs` | Inline SQL removed |
| `apps/backend/crates/api/src/handlers/project.rs` | Inline SQL removed |
| `apps/backend/crates/api/src/handlers/*.rs` | 20 additional handler files cleaned |
| `apps/backend/crates/db/src/repositories/bulk_operation_repo.rs` | Paginated `list_all` |
| `apps/backend/crates/db/src/repositories/trigger_workflow_repo.rs` | Paginated `list_all` |
| `apps/backend/crates/db/src/repositories/session_management_repo.rs` | Paginated `list_all` |
| `apps/backend/crates/db/src/repositories/model_checksum_repo.rs` | Paginated `list_all` |
| `apps/backend/crates/db/src/repositories/budget_quota_repo.rs` | Paginated `list_all` |
| `apps/backend/crates/db/src/repositories/webhook_testing_repo.rs` | Paginated `list_all` |
| `apps/backend/crates/db/src/lib.rs` | Pool config env vars + `max_lifetime` |
| `apps/backend/.env.example` | Pool env var documentation |

---

## Dependencies

### Existing Components to Reuse
- `PaginationParams` from `crates/db/src/query.rs`
- All existing repository patterns in `crates/db/src/repositories/`
- `sqlx::query_as!` macro for type-safe queries
- `PoolConfig` struct in `crates/db/src/lib.rs`
- `tracing::info!` for startup logging

### New Infrastructure Needed
- `BrowseClipsFilter` struct for typed browse query parameters
- `PoolConfig::from_env()` constructor
- `max_lifetime_secs` field on `PoolConfig`

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: `scene_video_version.rs` migration — Tasks 1.1-1.4 (highest inline count)
2. Phase 4: Pool configuration — Tasks 4.1-4.3 (quick win, operational benefit)
3. Phase 3: Pagination — Tasks 3.1-3.3 (prevents OOM on growth tables)
4. Phase 2: Remaining handler migration — Tasks 2.1-2.5 (largest effort, lower urgency)

**MVP Success Criteria:**
- `scene_video_version.rs` has zero `sqlx::query` calls
- Connection pool configurable via 4 env vars
- Growth-table `list_all` functions accept `PaginationParams`
- `grep -r "sqlx::query" apps/backend/crates/api/src/handlers/` returns zero results (after Phase 2)

### Post-MVP Enhancements
- Consider a query builder abstraction for complex browse queries with many filters
- Add pool utilization logging (WARNING at 80%+ saturation)

---

## Notes

1. Phase 1 (scene_video_version.rs) is the highest priority because it contains the most inline SQL (10 queries) and the most complex one (80-line browse query). Start here.
2. Phase 2 can be done incrementally — one handler file per commit. Each file is independent.
3. For the browse query DRY fix (Task 1.1), consider whether a CTE or Rust-side query builder is better. A Rust builder struct that generates both count and items SQL from the same filters avoids SQL duplication without requiring CTE support.
4. Phase 4 (pool config) is a quick win that can be done in parallel with Phase 1. The `acquire_timeout_secs` default is being changed from 5 to 30 — this is intentional per the PRD.
5. When migrating queries, verify each produces identical SQL output by comparing `EXPLAIN` plans before and after.

---

## Version History

- **v1.0** (2026-03-30): Initial task list creation from PRD-164

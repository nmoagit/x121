# Task List: Database Normalization & Strict Integrity

**PRD Reference:** `design/prds/000-prd-database-normalization.md`
**Scope:** Create the PostgreSQL database, bootstrap the Rust backend project with SQLx, establish migration framework, naming conventions, status lookup tables, pgvector, and efficiency best practices that all subsequent PRDs build upon.

## Overview

This is the foundational infrastructure PRD — no application code exists yet. We are building from scratch: a Cargo workspace with SQLx, environment-driven database configuration, a migration framework, and the initial schema containing status lookup tables. Every decision here (BIGSERIAL PKs, `i64` everywhere, TIMESTAMPTZ, FK indexes) becomes the template that 105 subsequent PRDs follow.

### What Already Exists
- `design/local_config/.env` — Database connection parameters for local dev
- `design/prds/000-prd-database-normalization.md` — Full requirements specification
- PostgreSQL instance running on localhost:5432

### What We're Building
1. Rust/Cargo workspace with SQLx and async runtime
2. Environment-based database configuration module
3. Database creation script and bootstrap process
4. SQLx migration framework with initial migrations
5. Status lookup tables with seed data
6. pgvector extension setup
7. `SCHEMA_CONVENTIONS.md` reference document

### Key Design Decisions
1. **`BIGSERIAL` / `BIGINT` everywhere** — All PKs and FKs are `i64` in Rust. One type, no mixing, no SQLx compile friction.
2. **`type DbId = i64`** — Single type alias used across the entire backend for all database identifiers.
3. **`TEXT` over `VARCHAR(n)`** — PostgreSQL handles both identically; arbitrary length limits cause bugs without saving space.
4. **`TIMESTAMPTZ` always** — Never bare `TIMESTAMP`. Timezone-naive timestamps cause subtle bugs.
5. **Forward-only migrations** — SQLx convention. Each migration is a single `.sql` file, no down migrations.
6. **FK columns always indexed** — PostgreSQL does not auto-index foreign keys. Every FK gets `idx_{table}_{fk_column}`.

---

## Phase 1: Rust Project Scaffold

### Task 1.1: Initialize Cargo Workspace
**File:** `Cargo.toml`, `src/main.rs`

Create the root Cargo project for the Trulience backend. This is a binary crate that will grow into the Axum web server, but for now just needs to compile and run.

```toml
[package]
name = "trulience"
version = "0.1.0"
edition = "2021"

[dependencies]
sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "postgres", "migrate", "macros"] }
tokio = { version = "1", features = ["full"] }
dotenvy = "0.15"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

**Acceptance Criteria:**
- [ ] `cargo build` succeeds with zero warnings
- [ ] `src/main.rs` exists with a minimal `#[tokio::main]` entry point
- [ ] SQLx, tokio, dotenvy, and tracing are declared as dependencies
- [ ] `.gitignore` includes `target/`, `.env`, and common Rust ignores

### Task 1.2: Environment Configuration Module
**File:** `src/config.rs`

Create a configuration struct that reads all database parameters from environment variables, with fallback to `.env` file via `dotenvy`. No hardcoded values.

```rust
pub struct DbConfig {
    pub host: String,
    pub port: u16,
    pub name: String,
    pub user: String,
    pub password: String,
    pub ssl: bool,
}
```

**Acceptance Criteria:**
- [ ] `DbConfig` loads from env vars: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`
- [ ] Defaults: host=`localhost`, port=`5432`, name=`trulience_x121`, ssl=`false`
- [ ] `DB_USER` and `DB_PASSWORD` are required — panic with clear message if missing
- [ ] `DbConfig::connection_string()` returns a valid `postgres://` URL
- [ ] `dotenvy::dotenv().ok()` is called at startup (no panic if `.env` missing)
- [ ] Unit test verifies config loads from env vars

### Task 1.3: Create Root `.env` File
**File:** `.env`

Create the project root `.env` file for local development, mirroring `design/local_config/.env`.

```env
DB_USER=matthias
DB_HOST=localhost
DB_NAME=trulience_x121
DB_PASSWORD=FNvv-iJz7GX9wtXZAZ74
DB_PORT=5432
DB_SSL=false
```

**Acceptance Criteria:**
- [ ] `.env` exists at project root with all 6 variables
- [ ] `.env` is listed in `.gitignore` (never committed)
- [ ] `design/local_config/.env` remains as the reference/template (not modified)

### Task 1.4: Define DbId Type Alias
**File:** `src/types.rs`

Create the foundational type alias that every module in the backend will use for database identifiers.

```rust
/// All database primary keys and foreign keys are BIGSERIAL (i64).
/// Using a single type alias prevents mixed-type friction with SQLx compile-time checks.
pub type DbId = i64;
```

**Acceptance Criteria:**
- [ ] `pub type DbId = i64` is defined in `src/types.rs`
- [ ] `src/types.rs` is declared as a module in `src/main.rs`
- [ ] No other integer types are used for database IDs anywhere in the codebase

---

## Phase 2: Database Creation & Bootstrap

### Task 2.1: Database Creation Script
**File:** `scripts/create_db.sh`

Shell script to create the database and install extensions. Must be idempotent — safe to run against an already-configured database.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Load env
source .env

# Create database if not exists
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tc \
  "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" \
  | grep -q 1 \
  || psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME"

# Install extensions
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector"
```

**Acceptance Criteria:**
- [ ] Script creates `trulience_x121` database if it doesn't exist
- [ ] Script installs `pgvector` extension (`CREATE EXTENSION IF NOT EXISTS vector`)
- [ ] Script is idempotent — running twice produces no errors and no side effects
- [ ] Script reads connection details from `.env`
- [ ] Script is executable (`chmod +x`)
- [ ] Script prints clear status messages (created vs. already exists)

### Task 2.2: Connection Pool Setup
**File:** `src/db.rs`

Create the database connection module that initializes a `PgPool` from `DbConfig` with configurable pool settings.

```rust
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub async fn connect(config: &DbConfig) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .min_connections(2)
        .idle_timeout(std::time::Duration::from_secs(300))
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&config.connection_string())
        .await
}
```

**Acceptance Criteria:**
- [ ] `PgPool` is created from `DbConfig` connection string
- [ ] Pool settings: `max_connections=10`, `min_connections=2`, `idle_timeout=300s`, `acquire_timeout=5s`
- [ ] Pool settings are configurable via env vars (optional, with sensible defaults)
- [ ] Function returns `Result<PgPool, sqlx::Error>` — no panics

### Task 2.3: Health Check on Startup
**File:** `src/db.rs`

Add a health check function that verifies database connectivity after pool creation.

```rust
pub async fn health_check(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(pool)
        .await?;
    Ok(())
}
```

**Acceptance Criteria:**
- [ ] `SELECT 1` query confirms connectivity
- [ ] Health check runs on backend startup after pool creation
- [ ] Clear error message on failure (connection refused, auth failed, etc.)
- [ ] Health check logged via `tracing::info!`

### Task 2.4: Wire Up Main Entry Point
**File:** `src/main.rs`

Connect config → pool → health check → migration runner in the main function.

```rust
#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    dotenvy::dotenv().ok();

    let config = config::DbConfig::from_env();
    let pool = db::connect(&config).await.expect("Failed to connect to database");
    db::health_check(&pool).await.expect("Database health check failed");

    // Run migrations (dev mode)
    sqlx::migrate!().run(&pool).await.expect("Migration failed");

    tracing::info!("Database ready");
}
```

**Acceptance Criteria:**
- [ ] Application starts, loads config, connects, health-checks, runs migrations
- [ ] Startup fails fast with clear error if database is unreachable
- [ ] `cargo run` succeeds against a running PostgreSQL instance
- [ ] Tracing output shows each startup step

---

## Phase 3: Migration Framework

### Task 3.1: Create Migrations Directory
**File:** `migrations/`

Create the SQLx migrations directory and verify the framework works.

**Acceptance Criteria:**
- [ ] `migrations/` directory exists at project root
- [ ] `sqlx migrate run` can be executed (even with no migrations yet)
- [ ] SQLx creates its internal `_sqlx_migrations` tracking table automatically

### Task 3.2: Initial Migration — Updated_at Trigger Function
**File:** `migrations/20260218000001_create_updated_at_trigger.sql`

Create a reusable trigger function for auto-updating `updated_at` timestamps. Every table will use this.

```sql
-- Reusable trigger function: auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Acceptance Criteria:**
- [ ] `trigger_set_updated_at()` function is created
- [ ] Function sets `NEW.updated_at = NOW()` on every UPDATE
- [ ] Migration follows naming convention: `{YYYYMMDD}{HHMMSS}_{description}.sql`
- [ ] `sqlx migrate run` applies it successfully

### Task 3.3: Migration — Status Lookup Table Template
**File:** `migrations/20260218000002_create_status_lookup_tables.sql`

Create all initial status lookup tables. Each follows the same pattern: `id BIGSERIAL PRIMARY KEY`, `name TEXT NOT NULL UNIQUE`, timestamps, trigger.

```sql
-- Job statuses
CREATE TABLE job_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON job_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Approval statuses
CREATE TABLE approval_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON approval_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Worker statuses
CREATE TABLE worker_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON worker_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Project statuses
CREATE TABLE project_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Scene statuses
CREATE TABLE scene_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON scene_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Segment statuses
CREATE TABLE segment_statuses (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON segment_statuses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Six lookup tables created: `job_statuses`, `approval_statuses`, `worker_statuses`, `project_statuses`, `scene_statuses`, `segment_statuses`
- [ ] All tables use `id BIGSERIAL PRIMARY KEY`
- [ ] All tables have `name TEXT NOT NULL UNIQUE`
- [ ] All tables have `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- [ ] All tables have the `set_updated_at` trigger
- [ ] Migration applies cleanly via `sqlx migrate run`

### Task 3.4: Migration — Seed Status Lookup Data
**File:** `migrations/20260218000003_seed_status_lookup_data.sql`

Populate lookup tables with initial status values.

```sql
-- Job statuses
INSERT INTO job_statuses (name, description) VALUES
    ('pending', 'Job is queued and waiting to be picked up'),
    ('running', 'Job is currently being executed by a worker'),
    ('completed', 'Job finished successfully'),
    ('failed', 'Job encountered an error and stopped'),
    ('cancelled', 'Job was cancelled by the user'),
    ('retrying', 'Job failed and is being retried');

-- Approval statuses
INSERT INTO approval_statuses (name, description) VALUES
    ('pending', 'Awaiting review'),
    ('approved', 'Approved by reviewer'),
    ('rejected', 'Rejected by reviewer'),
    ('revision_requested', 'Changes requested by reviewer');

-- Worker statuses
INSERT INTO worker_statuses (name, description) VALUES
    ('idle', 'Worker is available and waiting for jobs'),
    ('busy', 'Worker is currently processing a job'),
    ('offline', 'Worker is not connected'),
    ('draining', 'Worker is finishing current job and will go offline');

-- Project statuses
INSERT INTO project_statuses (name, description) VALUES
    ('draft', 'Project is being set up'),
    ('active', 'Project is in active production'),
    ('paused', 'Project is temporarily on hold'),
    ('completed', 'All deliverables are done'),
    ('archived', 'Project is archived and read-only');

-- Scene statuses
INSERT INTO scene_statuses (name, description) VALUES
    ('pending', 'Scene is configured but not yet generated'),
    ('generating', 'Scene segments are being generated'),
    ('generated', 'All segments are generated, awaiting review'),
    ('approved', 'Scene passed review'),
    ('rejected', 'Scene failed review'),
    ('delivered', 'Scene is packaged and delivered');

-- Segment statuses
INSERT INTO segment_statuses (name, description) VALUES
    ('pending', 'Segment is queued for generation'),
    ('generating', 'Segment is being generated'),
    ('generated', 'Segment generation complete'),
    ('failed', 'Segment generation failed'),
    ('approved', 'Segment passed QA'),
    ('rejected', 'Segment failed QA');
```

**Acceptance Criteria:**
- [ ] All six lookup tables are populated with initial values
- [ ] Each status has a human-readable `description`
- [ ] Migration is idempotent-safe (runs once, no duplicate key errors on re-run since SQLx tracks applied migrations)
- [ ] Status names use `snake_case` lowercase

---

## Phase 4: Schema Conventions & Documentation

### Task 4.1: Create SCHEMA_CONVENTIONS.md
**File:** `design/SCHEMA_CONVENTIONS.md`

Document all database naming and design conventions in a single reference file that all developers and PRDs follow.

**Acceptance Criteria:**
- [ ] Documents table naming: `snake_case`, plural
- [ ] Documents column naming: `snake_case`
- [ ] Documents PK convention: `id BIGSERIAL PRIMARY KEY` → `i64` in Rust
- [ ] Documents FK convention: `{referenced_table_singular}_id` as `BIGINT`
- [ ] Documents lookup table convention: `{domain}_statuses`
- [ ] Documents index naming: `idx_{table}_{column(s)}`
- [ ] Documents unique constraint naming: `uq_{table}_{column(s)}`
- [ ] Documents timestamp convention: `created_at` + `updated_at` as `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- [ ] Documents `updated_at` trigger convention
- [ ] Documents data type rules: `TEXT` over `VARCHAR(n)`, `BOOLEAN` not int flags, `TIMESTAMPTZ` always
- [ ] Documents cascading rules: every FK must specify explicit `ON DELETE` and `ON UPDATE`
- [ ] Documents `DbId = i64` Rust type alias requirement
- [ ] Includes a complete example table DDL as a copy-paste template

### Task 4.2: Create Example Table Template Migration
**File:** `migrations/20260218000004_create_example_table_template.sql`

A commented-out reference migration that demonstrates every convention. Not applied as real schema — wrapped in a DO block that does nothing, or placed as a `.sql.example` file. This is the copy-paste starting point for every future migration.

```sql
-- =============================================================
-- TEMPLATE: Copy this when creating a new table migration
-- =============================================================
-- CREATE TABLE things (
--     id BIGSERIAL PRIMARY KEY,
--
--     -- Required foreign keys (BIGINT NOT NULL, always indexed)
--     project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
--
--     -- Optional foreign keys (BIGINT NULL)
--     parent_thing_id BIGINT REFERENCES things(id) ON DELETE SET NULL ON UPDATE CASCADE,
--
--     -- Status via lookup table (BIGINT NOT NULL)
--     status_id BIGINT NOT NULL REFERENCES thing_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
--
--     -- Data columns
--     name TEXT NOT NULL,
--     description TEXT,
--     is_active BOOLEAN NOT NULL DEFAULT true,
--     sort_order INTEGER NOT NULL DEFAULT 0,
--
--     -- Timestamps (mandatory on every table)
--     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
--
-- -- Indexes: every FK column, plus any common query filters
-- CREATE INDEX idx_things_project_id ON things(project_id);
-- CREATE INDEX idx_things_parent_thing_id ON things(parent_thing_id);
-- CREATE INDEX idx_things_status_id ON things(status_id);
--
-- -- Unique constraints where business logic requires
-- CREATE UNIQUE INDEX uq_things_project_id_name ON things(project_id, name);
--
-- -- Updated_at trigger (mandatory on every table)
-- CREATE TRIGGER set_updated_at BEFORE UPDATE ON things
--     FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
-- =============================================================

-- This migration intentionally contains no executable SQL.
-- It exists as a reference template for developers.
SELECT 1;
```

**Acceptance Criteria:**
- [ ] Template demonstrates every convention from `SCHEMA_CONVENTIONS.md`
- [ ] Shows `BIGSERIAL PRIMARY KEY`, `BIGINT` FKs, `ON DELETE`/`ON UPDATE` rules
- [ ] Shows `TEXT`, `BOOLEAN`, `INTEGER`, `TIMESTAMPTZ` column types
- [ ] Shows index naming, unique constraint naming, trigger setup
- [ ] Migration applies without error (just `SELECT 1`)
- [ ] All comments are clear enough that a developer can copy-paste and adapt

---

## Phase 5: pgvector Setup

### Task 5.1: Verify pgvector Extension
**File:** `scripts/create_db.sh` (already created in Task 2.1)

Verify that the database creation script correctly installs pgvector and that vector column types are usable.

**Acceptance Criteria:**
- [ ] `CREATE EXTENSION IF NOT EXISTS vector` succeeds
- [ ] A test query `SELECT '[1,2,3]'::vector` succeeds after extension installation
- [ ] Extension version is logged during bootstrap

### Task 5.2: Document Vector Index Strategy
**File:** `design/SCHEMA_CONVENTIONS.md` (append section)

Add a section to the conventions document covering pgvector index recommendations for downstream PRDs (PRD-20, PRD-76).

**Acceptance Criteria:**
- [ ] Documents HNSW vs IVFFlat trade-offs
- [ ] Recommends HNSW as default for <1M vectors (better recall, no training step)
- [ ] Recommends IVFFlat for >1M vectors (faster build, lower memory)
- [ ] Documents index creation syntax: `CREATE INDEX idx_{table}_{column}_vec ON {table} USING hnsw ({column} vector_cosine_ops)`
- [ ] Notes that vector indexes should be created after bulk data load, not in the initial migration

---

## Phase 6: Verification & Integration Testing

### Task 6.1: Database Bootstrap Integration Test
**File:** `tests/db_bootstrap.rs`

End-to-end test that verifies the full bootstrap sequence: config load → connect → health check → migrate → verify schema.

```rust
#[tokio::test]
async fn test_full_bootstrap() {
    dotenvy::dotenv().ok();
    let config = trulience::config::DbConfig::from_env();
    let pool = trulience::db::connect(&config).await.unwrap();
    trulience::db::health_check(&pool).await.unwrap();
    sqlx::migrate!().run(&pool).await.unwrap();

    // Verify lookup tables exist and have data
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM job_statuses")
        .fetch_one(&pool).await.unwrap();
    assert!(count.0 > 0, "job_statuses should be seeded");
}
```

**Acceptance Criteria:**
- [ ] Test connects to the real dev database
- [ ] Test runs all migrations
- [ ] Test verifies all six lookup tables exist
- [ ] Test verifies lookup tables contain seed data
- [ ] Test verifies pgvector extension is available
- [ ] `cargo test` passes

### Task 6.2: Verify Convention Compliance
**File:** `tests/schema_conventions.rs`

Test that queries the `information_schema` to verify naming and type conventions are followed.

```rust
#[tokio::test]
async fn test_all_pks_are_bigint() {
    // Query information_schema.columns for all 'id' columns
    // Assert they are all 'bigint' type
}

#[tokio::test]
async fn test_all_tables_have_timestamps() {
    // Query information_schema.columns for created_at and updated_at
    // Assert every table (except _sqlx_migrations) has both
}

#[tokio::test]
async fn test_all_fks_have_indexes() {
    // Cross-reference pg_constraint with pg_indexes
    // Assert every FK column has a corresponding index
}
```

**Acceptance Criteria:**
- [ ] Test verifies all `id` columns are `bigint` type
- [ ] Test verifies all tables have `created_at` and `updated_at` columns of type `timestamp with time zone`
- [ ] Test verifies every foreign key column has an index
- [ ] Test verifies no `character varying` columns exist (TEXT preferred)
- [ ] Tests skip the `_sqlx_migrations` internal table

### Task 6.3: Cascading Rules Documentation
**File:** `design/CASCADING_RULES.md`

Document the cascading rule decisions for the platform. This becomes the reference for all future PRDs when choosing ON DELETE/ON UPDATE actions.

**Acceptance Criteria:**
- [ ] Documents when to use `CASCADE` (parent owns children entirely, e.g., project → scenes)
- [ ] Documents when to use `SET NULL` (optional references, e.g., assigned_worker_id)
- [ ] Documents when to use `RESTRICT` (prevent deletion of referenced data, e.g., lookup statuses)
- [ ] Provides a decision tree or table for choosing the right rule
- [ ] Notes that `CASCADE` deletes require application-level confirmation before triggering

---

## Relevant Files

| File | Description |
|------|-------------|
| `Cargo.toml` | Rust project manifest with SQLx dependencies |
| `src/main.rs` | Entry point — config, pool, health check, migrations |
| `src/config.rs` | `DbConfig` struct — env-driven database configuration |
| `src/db.rs` | Connection pool creation and health check |
| `src/types.rs` | `DbId = i64` type alias |
| `.env` | Local dev environment variables |
| `.gitignore` | Excludes `.env`, `target/` |
| `scripts/create_db.sh` | Database creation and extension installation |
| `migrations/20260218000001_create_updated_at_trigger.sql` | Reusable `trigger_set_updated_at()` function |
| `migrations/20260218000002_create_status_lookup_tables.sql` | Six status lookup tables |
| `migrations/20260218000003_seed_status_lookup_data.sql` | Initial status values |
| `migrations/20260218000004_create_example_table_template.sql` | Convention template for developers |
| `design/SCHEMA_CONVENTIONS.md` | Complete naming and design conventions reference |
| `design/CASCADING_RULES.md` | ON DELETE / ON UPDATE decision guide |
| `tests/db_bootstrap.rs` | Integration test — full bootstrap sequence |
| `tests/schema_conventions.rs` | Convention compliance tests against information_schema |

---

## Dependencies

### Existing Components to Reuse
- `design/local_config/.env` — Reference for connection parameters
- PostgreSQL 15+ running on localhost:5432

### New Infrastructure Needed
- Rust toolchain (stable)
- Cargo workspace
- SQLx CLI (`cargo install sqlx-cli --features postgres`)
- pgvector extension installed on PostgreSQL

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Rust Project Scaffold — Tasks 1.1–1.4
2. Phase 2: Database Creation & Bootstrap — Tasks 2.1–2.4
3. Phase 3: Migration Framework — Tasks 3.1–3.4
4. Phase 4: Schema Conventions & Documentation — Tasks 4.1–4.2

**MVP Success Criteria:**
- `cargo run` starts, connects to database, runs migrations, exits cleanly
- All six lookup tables exist with seed data
- `SCHEMA_CONVENTIONS.md` documents every convention
- `DbId = i64` is the only type used for database identifiers

### Post-MVP Enhancements
1. Phase 5: pgvector Setup — Tasks 5.1–5.2
2. Phase 6: Verification & Integration Testing — Tasks 6.1–6.3

---

## Notes

1. **SQLx offline mode:** For CI builds without a live database, run `cargo sqlx prepare` to generate query metadata. This should be set up once Phase 2 is working.
2. **Migration ordering:** Timestamps in migration filenames must be strictly increasing. When multiple developers create migrations, coordinate timestamps to avoid conflicts.
3. **No down migrations:** SQLx uses forward-only migrations by convention. To "undo" a migration, create a new migration that reverses the changes.
4. **Database creation is separate from migrations:** The `scripts/create_db.sh` script creates the database and installs extensions. Migrations handle schema. These are two distinct steps.
5. **Test database:** Integration tests run against the real dev database. A dedicated test database or transaction rollback strategy should be considered before adding data-modifying tests.

---

## Version History

- **v1.0** (2026-02-18): Initial task list creation from PRD-000 v1.3

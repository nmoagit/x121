# PRD-000: Database Normalization & Strict Integrity

## 1. Introduction/Overview
Every professional studio tool depends on trustworthy data. Data drift — where database records diverge from actual file states, or statuses are stored as free-text strings with inconsistent values — undermines every downstream feature from delivery packaging to audit logging. This PRD establishes the foundational database design standards that every other PRD implicitly depends on: database creation and bootstrap, Third Normal Form normalization, lookup-table-driven statuses, strict relational integrity with cascading rules, and migration framework setup.

## 2. Related PRDs & Dependencies
- **Depends on:** None (foundational)
- **Depended on by:** All PRDs
- **Part:** Part 0 — Architecture & Data Standards

## 3. Goals
- Create and bootstrap the PostgreSQL database with all required extensions and configuration.
- Establish the migration framework and conventions used by all subsequent PRDs.
- Enforce 3rd Normal Form (3NF) minimum across all database tables to eliminate data redundancy and update anomalies.
- Eliminate all text-column state storage by migrating statuses to dedicated lookup tables with integer foreign keys.
- Prevent metadata-to-file and file-to-database mismatches through strict foreign key constraints and cascading rules.
- Provide a reliable, consistent data layer that every other PRD can build upon without defensive coding against data inconsistencies.

## 4. User Stories
- As an Admin, I want all database statuses to be defined in lookup tables so that I can add or rename a status value in one place without updating scattered text fields.
- As a Creator, I want strict foreign key constraints so that deleting a character automatically cascades correctly to its scenes and segments, preventing orphaned records.
- As a Reviewer, I want reliable data integrity so that when I approve a segment, the approval status is guaranteed to be a valid, known value — not a typo or free-text variant.
- As an Admin, I want cascading rules clearly defined so that I understand the impact of deleting or archiving any entity before it happens.
- As a Creator, I want the database to reject invalid data at the constraint level so that bugs in application code cannot silently corrupt production data.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.0: Database Creation & Bootstrap
**Description:** Create the PostgreSQL database, install required extensions, and configure the connection for the platform backend. Configuration is read from environment variables or a `.env` file (see `design/local_config/.env` for dev defaults).
**Acceptance Criteria:**
- [ ] Database `x121_x121` is created on the configured PostgreSQL instance
- [ ] Connection parameters (host, port, user, password, database name, SSL mode) are read from environment configuration — never hardcoded
- [ ] `pgvector` extension is installed (`CREATE EXTENSION IF NOT EXISTS vector`)
- [ ] No unnecessary extensions installed — only extensions with a clear use case (e.g., `pgvector`)
- [ ] Connection pool is configured (min/max connections, idle timeout, connection lifetime) via SQLx pool settings
- [ ] A health-check query (`SELECT 1`) confirms connectivity on backend startup
- [ ] Bootstrap is idempotent — running it against an already-configured database does nothing destructive

#### Requirement 1.0.1: Migration Framework Setup
**Description:** Establish the migration framework that all subsequent PRDs use to create and alter database tables. Migrations are versioned, ordered, and reversible.
**Acceptance Criteria:**
- [ ] SQLx migrations directory is created (`migrations/`)
- [ ] Migration naming convention established: `{YYYYMMDD}{HHMMSS}_{description}.sql` (e.g., `20260218120000_create_lookup_tables.sql`)
- [ ] `sqlx migrate run` applies all pending migrations in order
- [ ] Each migration is a single `.sql` file with forward-only SQL (SQLx convention)
- [ ] A `migration_lock` or equivalent prevents concurrent migration runs
- [ ] The backend automatically runs pending migrations on startup (configurable: auto-migrate in dev, manual in production)
- [ ] Migration status is queryable: which migrations have been applied, when, and in what order

#### Requirement 1.0.2: Database Naming Conventions
**Description:** Establish consistent naming conventions for all database objects to be followed by all PRDs.
**Acceptance Criteria:**
- [ ] Table names: `snake_case`, plural (e.g., `characters`, `scene_types`, `video_segments`)
- [ ] Column names: `snake_case` (e.g., `created_at`, `scene_type_id`)
- [ ] Primary keys: `id BIGSERIAL PRIMARY KEY` — all tables use `BIGINT`, mapping to `i64` in Rust. One type everywhere, no mixing.
- [ ] Foreign keys: `{referenced_table_singular}_id` (e.g., `character_id`, `project_id`)
- [ ] Lookup/status tables: `{domain}_statuses` (e.g., `job_statuses`, `approval_statuses`)
- [ ] Indexes: `idx_{table}_{column(s)}` (e.g., `idx_characters_project_id`)
- [ ] Unique constraints: `uq_{table}_{column(s)}`
- [ ] Timestamps: every table includes `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- [ ] Naming conventions documented in a `SCHEMA_CONVENTIONS.md` reference file

#### Requirement 1.1: Third Normal Form Schema Design
**Description:** All database tables must be designed to at least 3NF. No transitive dependencies. Every non-key column must depend on the primary key, the whole key, and nothing but the key.
**Acceptance Criteria:**
- [ ] No table contains columns that depend on non-key columns (no transitive dependencies)
- [ ] All repeating groups are extracted into separate tables with proper foreign keys
- [ ] Schema review checklist verifies 3NF compliance for every new migration

#### Requirement 1.2: Status Lookup Tables
**Description:** All entity statuses (Job, Approval, Worker, Role, Segment, Scene, Project, etc.) must reside in dedicated lookup tables. No text-column state storage anywhere in the schema.
**Acceptance Criteria:**
- [ ] Each status domain has its own lookup table (e.g., `job_statuses`, `approval_statuses`, `worker_statuses`)
- [ ] All status columns in entity tables are integer foreign keys referencing the appropriate lookup table
- [ ] Lookup tables are seeded with initial values via migrations
- [ ] Adding a new status value requires only an INSERT into the lookup table, not a schema migration

#### Requirement 1.3: Strict Foreign Key Constraints
**Description:** Every relationship between entities must be enforced by database-level foreign key constraints. No "soft" references via unconstrained text or integer columns.
**Acceptance Criteria:**
- [ ] All entity relationships have explicit FOREIGN KEY constraints
- [ ] All foreign key columns have NOT NULL constraints where the relationship is mandatory
- [ ] Unique constraints prevent duplicate entries where business logic requires uniqueness

#### Requirement 1.4: Cascading Rules
**Description:** Define explicit ON DELETE and ON UPDATE cascading rules for every foreign key to prevent orphaned records and ensure predictable behavior when parent entities are modified or removed.
**Acceptance Criteria:**
- [ ] Every foreign key specifies an explicit ON DELETE action (CASCADE, SET NULL, or RESTRICT)
- [ ] Every foreign key specifies an explicit ON UPDATE action
- [ ] Cascading rules are documented in a schema reference document
- [ ] Destructive cascades (CASCADE on delete) require application-level confirmation before triggering

#### Requirement 1.5: pgvector Extension for Embeddings
**Description:** Install and configure the pgvector extension for PostgreSQL to support vector similarity queries needed by downstream PRDs (visual search, face embeddings).
**Acceptance Criteria:**
- [ ] pgvector extension is installed and enabled in the database
- [ ] Vector column types are available for use by PRD-20 and PRD-76
- [ ] A baseline index strategy (IVFFlat or HNSW) is documented for vector columns

#### Requirement 1.6: Database Efficiency Best Practices
**Description:** All tables and queries must follow PostgreSQL efficiency best practices. Integer primary keys, appropriate data types, and proper indexing are mandatory from day one — retrofitting these into a live system is expensive.
**Acceptance Criteria:**
- [ ] All tables use `id BIGSERIAL PRIMARY KEY` — sequential `BIGINT`, maps to `i64` in Rust. No UUIDs. One integer type for all PKs and FKs eliminates type mismatches in SQLx compile-time checks
- [ ] All foreign key columns are `BIGINT NOT NULL` (or `BIGINT NULL` for optional relationships) — same type as the referenced PK, no casting needed in Rust
- [ ] A single Rust type alias `type DbId = i64` is used throughout the backend — every id field, every FK parameter, every query binding uses this one type
- [ ] All foreign key columns are indexed (`idx_{table}_{fk_column}`) — PostgreSQL does not auto-index foreign keys
- [ ] `TEXT` is preferred over `VARCHAR(n)` for variable-length strings (PostgreSQL handles both identically; arbitrary length limits cause bugs without saving space)
- [ ] Fixed-length identifiers use `CHAR(n)` only when truly fixed-width (e.g., ISO country codes)
- [ ] Boolean columns use `BOOLEAN NOT NULL DEFAULT false`, not integer flags or text
- [ ] Non-PK/FK numeric columns use the narrowest appropriate type: `SMALLINT` for small enums/counts, `INTEGER` for general use. But all PKs and FKs are `BIGINT` — no exceptions
- [ ] `TIMESTAMPTZ` (not `TIMESTAMP`) for all time values — timezone-naive timestamps cause subtle bugs
- [ ] Partial indexes used where queries filter on a common condition (e.g., `WHERE status_id = 1`)
- [ ] `EXPLAIN ANALYZE` review required for any query touching >10k rows before deployment
- [ ] No `SELECT *` in application code — always specify columns explicitly
- [ ] Bulk inserts use `COPY` or multi-row `INSERT` rather than row-by-row loops

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Automated Schema Compliance Linting
**Description:** CI pipeline step that validates all new migrations against 3NF rules and naming conventions before they can be merged.
**Acceptance Criteria:**
- [ ] Lint tool detects text-type status columns and flags them as violations
- [ ] Lint tool detects missing ON DELETE/ON UPDATE specifications
- [ ] Schema compliance report generated on every PR that includes migration files

#### **[OPTIONAL - Post-MVP]** Requirement 2.2: Schema Documentation Auto-Generation
**Description:** Automatically generate an ERD (Entity-Relationship Diagram) and schema reference document from the live database schema.
**Acceptance Criteria:**
- [ ] ERD is regenerated on every migration and published to the wiki (PRD-56)
- [ ] Each table and column includes a human-readable description comment

## 6. Non-Goals (Out of Scope)
- Application-level ORM design decisions (this PRD covers database-level constraints only)
- Query optimization and indexing strategies beyond pgvector (handled per-feature by individual PRDs)
- Data migration from legacy systems (covered by PRD-86)
- Backup and recovery procedures (covered by PRD-81)

## 7. Design Considerations
- The database schema is invisible to end users, but its integrity is felt everywhere. Error messages from constraint violations must be translated into user-friendly language by the application layer.
- Status lookup tables should be exposed in Admin UI for reference, showing all valid statuses and their usage counts.

## 8. Technical Considerations
- **Stack:** PostgreSQL 15+ with pgvector extension, SQLx for Rust query building and migrations
- **Dev Configuration:** `design/local_config/.env` contains database connection parameters for local development
- **Existing Code to Reuse:** None (foundational)
- **New Infrastructure Needed:**
  - PostgreSQL database instance (dev: localhost:5432, prod: configurable)
  - Extensions: `pgvector`
  - SQLx migration framework (`migrations/` directory at project root)
  - Connection pool (SQLx `PgPool` with configurable pool size)
- **Database Changes:** Database creation, extension installation, migration framework bootstrap, initial schema with lookup tables and base entity tables
- **API Changes:** None directly (this PRD is infrastructure-only)
- **Environment Variables:**
  - `DB_HOST` — PostgreSQL host (default: `localhost`)
  - `DB_PORT` — PostgreSQL port (default: `5432`)
  - `DB_NAME` — Database name (default: `x121_x121`)
  - `DB_USER` — Database user
  - `DB_PASSWORD` — Database password
  - `DB_SSL` — SSL mode (default: `false` for dev)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- 100% of status columns use lookup table foreign keys (zero text-based statuses)
- 100% of foreign keys have explicit ON DELETE and ON UPDATE rules
- Zero orphaned records detectable by a scheduled integrity scan
- All new migrations pass 3NF compliance review
- 100% of tables use `BIGSERIAL` integer primary keys (zero UUID PKs, zero mixed-type FKs)
- 100% of foreign key columns have a corresponding index
- No query in production code uses `SELECT *`

## 11. Open Questions
- ~~Should lookup table IDs be sequential integers or use a different strategy?~~ **Resolved:** All tables (including lookups) use `BIGSERIAL` → `i64` in Rust. One type everywhere.
- What is the retention policy for soft-deleted records vs. hard deletes with CASCADE?
- ~~Should we adopt a naming convention for lookup tables?~~ **Resolved:** `{domain}_statuses` suffix convention (e.g., `job_statuses`).

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification
- **v1.1** (2026-02-18): Added database bootstrap, migration framework, naming conventions
- **v1.2** (2026-02-18): Switched from UUID to integer PKs; added Requirement 1.6 (efficiency best practices)
- **v1.3** (2026-02-18): Standardized on `BIGSERIAL`/`BIGINT` (`i64`) for all PKs and FKs — single Rust type, no mixed-type friction with SQLx

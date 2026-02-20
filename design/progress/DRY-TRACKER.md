# DRY Tracker — Components & Functions Under Watch

Ongoing log of components, functions, patterns, and utilities that the DRY-GUY agent has flagged or that developers have identified as candidates for deduplication, extraction, or sharing.

**Purpose:** Prevent duplication before it happens. When implementing a new PRD, check this list first — if something similar already exists, reuse it instead of building from scratch.

**Process:**
1. After every significant implementation, run the `dry-guy` agent
2. Record any flagged patterns, near-duplicates, or extraction candidates here
3. When a shared utility is created from a DRY finding, move the entry to the "Resolved" section
4. Reference this log in PRs that touch flagged areas

---

## Status Legend

| Status | Meaning |
|--------|---------|
| `watch` | Identified as potential duplication risk — monitor as more PRDs are implemented |
| `flagged` | DRY-GUY has flagged active duplication — extraction needed |
| `in-progress` | Shared utility/component is being extracted |
| `resolved` | Shared utility created and all consumers refactored to use it |

---

## Active Watch List

### Database & Backend Patterns

| ID | Pattern / Component | PRDs Involved | Status | Notes |
|----|---------------------|---------------|--------|-------|
| DRY-001 | `DbId` type alias (`i64`) usage consistency | All PRDs | `watch` | Defined in PRD-000. Every module must use `DbId`, not raw `i64` for IDs |
| DRY-002 | Status lookup table query patterns | All PRDs with status FKs | `watch` | Expect repeated `JOIN {domain}_statuses` patterns — candidate for shared query helpers |
| DRY-003 | CRUD handler boilerplate (list/get/create/update/delete) | PRD-01, PRD-02, and all entity PRDs | `watch` | Axum handlers will repeat the same patterns — candidate for macro or generic handler |
| DRY-004 | Pagination query pattern | PRD-20, PRD-42, PRD-73, all list endpoints | `watch` | `LIMIT/OFFSET` or cursor-based pagination will appear in many handlers |
| DRY-005 | `updated_at` trigger creation in migrations | All PRDs with tables | `watch` | Trigger function defined once in PRD-000; each table just adds the trigger. Watch for copy-paste divergence |
| DRY-006 | Error response formatting | PRD-02 and all API PRDs | `watch` | Constraint violation → user-friendly error translation will be needed everywhere |
| DRY-007 | FK index creation pattern in migrations | All PRDs with tables | `watch` | Every FK needs `CREATE INDEX idx_{table}_{col}` — easy to forget or name inconsistently |
| DRY-008 | Soft delete `WHERE deleted_at IS NULL` filter | PRD-109, all entity repos | `watch` | Every repo query (find_by_id, list_*) must include this filter. Missing it = showing deleted records. |
| DRY-009 | `soft_delete` / `restore` / `hard_delete` method pattern | PRD-109, all entity repos | `watch` | All 9+ repos need identical method signatures. Candidate for trait or macro if boilerplate grows. |
| DRY-010 | Version-as-final transactional pattern | PRD-109, PRD-069 | `watch` | Unmark old + mark new in one transaction. Could be reused if other entities get versioning. |
| DRY-011 | Trash entity-type parallel lists (5 locations) | PRD-109 | `watch` | 9 entity type strings appear in 5 parallel match/list sites: `KNOWN_ENTITY_TYPES`, `PURGE_ORDER`, `table_and_name_expr`, `check_parent_trashed` (all in `trash_repo.rs`), and `dispatch_restore` (in `handlers/trash.rs`). Adding a new entity type requires updating all 5. Consider a single `EntityMeta` data array if the codebase grows beyond 12 entity types. |
| DRY-012 | `resolve_role_name` logic duplicated across handlers | PRD-03 | `resolved` | Extracted to `RoleRepo::resolve_name()` in `db/src/repositories/role_repo.rs`. Both `auth.rs` and `admin.rs` now call it. |
| DRY-013 | Role name magic strings (`"admin"`, `"creator"`, `"reviewer"`) | PRD-03 | `resolved` | Constants defined in `core/src/roles.rs` (`ROLE_ADMIN`, `ROLE_CREATOR`, `ROLE_REVIEWER`). `rbac.rs` updated to use them. |
| DRY-014 | Validate-then-hash password 2-step pattern | PRD-03 | `watch` | `validate_password_strength(...)` + `hash_password(...)` with identical `map_err` wrapping appears twice in `admin.rs:64-69` and `admin.rs:177-182`. Extract to `validate_and_hash_password(password, min_len) -> AppResult<String>` if a third occurrence appears (e.g., self-service password change endpoint). |
| DRY-015 | RBAC extractor boilerplate (`RequireAdmin`, `RequireCreator`, `RequireAuth`) | PRD-03 | `watch` | Three `FromRequestParts` impls that differ only in role check logic. If a 4th extractor (e.g., `RequireReviewer`) is added, extract a `require_role!` macro. |

### Frontend Patterns

| ID | Pattern / Component | PRDs Involved | Status | Notes |
|----|---------------------|---------------|--------|-------|
| DRY-020 | Status badge/chip component | PRD-29, PRD-35, PRD-42, PRD-54 | `watch` | Status display (colored badge with lookup name) will appear in many views |
| DRY-021 | Data table with sort/filter/pagination | PRD-29, PRD-20, PRD-42, PRD-73 | `watch` | Reusable table component needed early — many PRDs will need it |
| DRY-022 | Confirmation dialog (destructive actions) | PRD-29, PRD-15, PRD-72 | `watch` | CASCADE deletes require confirmation — shared dialog needed |
| DRY-023 | Image thumbnail/preview component | PRD-21, PRD-62, PRD-83, PRD-96 | `watch` | Multiple PRDs display image/video thumbnails — one component |
| DRY-024 | Progress indicator (job/generation) | PRD-24, PRD-54, PRD-57, PRD-90 | `watch` | Generation progress bars/strips appear across many views |
| DRY-025 | Side-by-side comparison layout | PRD-22, PRD-68, PRD-101 | `watch` | Image and video comparison views share the same layout pattern |
| DRY-026 | Form validation patterns | PRD-14, PRD-23, PRD-66 | `watch` | Input validation with error display will repeat across all forms |

### API & Data Fetching

| ID | Pattern / Component | PRDs Involved | Status | Notes |
|----|---------------------|---------------|--------|-------|
| DRY-040 | React Query / data fetching hooks | All frontend PRDs | `watch` | `useQuery`/`useMutation` patterns will repeat — establish hook conventions early |
| DRY-041 | WebSocket event subscription pattern | PRD-05, PRD-10, PRD-11 | `watch` | Real-time updates from event bus will be consumed by many components |
| DRY-042 | File upload handling | PRD-16, PRD-21, PRD-86 | `watch` | Multiple PRDs accept file uploads — shared upload component + backend handler |
| DRY-043 | CSV/report export pattern | PRD-22, PRD-73, PRD-94 | `watch` | Several PRDs export data as CSV — shared export utility |

### Pipeline & Generation

| ID | Pattern / Component | PRDs Involved | Status | Notes |
|----|---------------------|---------------|--------|-------|
| DRY-060 | FFmpeg command builder | PRD-24, PRD-25, PRD-39, PRD-83 | `watch` | Multiple PRDs call FFmpeg for frame extraction, stitching, transcoding — shared builder |
| DRY-061 | Image quality scoring | PRD-22, PRD-49, PRD-76 | `watch` | Quality assessment (sharpness, face detection) used by multiple QA PRDs |
| DRY-062 | ComfyUI workflow submission pattern | PRD-05, PRD-24, PRD-58 | `watch` | Workflow dispatch to ComfyUI will be called from multiple orchestrators |

---

## Resolved

| ID | Original Pattern | Resolution | Shared Location | Date |
|----|-----------------|------------|-----------------|------|
| DRY-012 | `resolve_role_name` duplicated in auth.rs + admin.rs | Extracted to `RoleRepo::resolve_name()` | `db/src/repositories/role_repo.rs` | 2026-02-20 |
| DRY-013 | Role magic strings hardcoded in rbac.rs | Created `ROLE_ADMIN/CREATOR/REVIEWER` constants | `core/src/roles.rs` | 2026-02-20 |

---

## DRY-GUY Audit Log

Record of every DRY-GUY audit run against the codebase.

| Date | PRD(s) Touched | Files Audited | Findings | Action Taken |
|------|---------------|---------------|----------|--------------|
| 2026-02-20 | Phase -1 scaffold | 33 (11 Rust, 14 Frontend, 8 Infra) | 6 (0 critical, 3 medium, 3 low) | Fixed CI DATABASE_URL dedup, vitest config merge, Storybook color comment. Watch: tracing init, Docker anchors. |
| 2026-02-20 | PRD-00 Database Normalization | 12 (2 Rust lib, 2 Rust test, 1 API, 4 SQL, 2 docs, 1 DRY-TRACKER) | 3 (0 critical, 1 medium, 2 low) | All acceptable/deferred. Medium: tracing init (2 binaries, extract at 3). Low: SQL filter clause in tests (readable as-is), lookup DDL repetition (mitigated by template migration 000003). No code changes needed. |
| 2026-02-20 | PRD-01 Phase 4 (API Endpoints) | 17 (8 handlers, 5 routes, 1 error, 1 lib, 1 test helper, 1 main) | 2 low, rest acceptable | No changes. NotFound construction (19x) and delete-if pattern (8x) are thin-adapter repetition. DRY-003 stays `watch`. scene_type.rs correctly deduplicates dual-scope via inner helpers. |
| 2026-02-20 | PRD-01 Test Files (entity_crud, entity_api, schema_conventions) | 8 test files across db+api crates | 2 HIGH (extracted), 1 MEDIUM (watch), 2 LOW (acceptable) | Extracted `body_json`, `post_json`, `put_json`, `get`, `delete`, `send_json` to `api/tests/common/mod.rs`. Unified `post_json`/`put_json` via `send_json` base. Refactored health.rs + entity_api.rs to use shared helpers. Watch: entity_crud.rs fixtures if second api test needs them. |
| 2026-02-20 | PRD-109 Phases 5-6 (Trash API + Delivery) | 12 (1 trash_repo, 5 entity repos modified, 1 trash handler, 1 trash route, 1 delivery.rs, 1 handlers/mod, 1 routes/mod, 1 repos/mod) | 1 HIGH (dead code), 2 MEDIUM (watch), 2 LOW, 4 CLEAN | HIGH: `find_by_id_include_deleted` on 5 individual repos is dead code (uncalled) — recommend removal. MEDIUM: DRY-009 confirmed (27 identical soft_delete/restore/hard_delete methods across 9 repos), DRY-011 added (5 parallel entity-type lists). LOW: fallback in `table_and_name_expr`, dispatch_restore inherent to architecture. CLEAN: delivery.rs, route file, handler pattern. |
| 2026-02-20 | PRD-03 Phases 1-6 (User Identity & RBAC) | 19 new + 9 modified (3 SQL migrations, 3 db models, 3 db repos, 3 auth modules, 2 middleware modules, 2 handler modules, 2 route modules, 1 config) | 2 flagged (DRY-012, DRY-013), 2 watch (DRY-014, DRY-015), 3 LOW, rest CLEAN | FLAGGED: `resolve_role_name` duplicated between auth.rs and admin.rs (DRY-012); role name magic strings in rbac.rs (DRY-013). WATCH: validate+hash pattern 2x in admin.rs (DRY-014), RBAC extractor boilerplate at 3 impls (DRY-015). LOW: `"Account is deactivated"` 2x in auth.rs (same file, different paths), `UserInfo` vs `UserResponse` (intentionally different scopes), `"unknown"` fallback (resolves with DRY-012). CLEAN: password.rs, jwt.rs, AuthUser extractor, all repos, all routes, all migrations, test config. |

---

## How to Use This File

### When Starting a New PRD Implementation
1. Read the "Active Watch List" section
2. Check if your PRD is mentioned in any existing DRY entry
3. If yes, check whether a shared utility already exists (see "Resolved" section)
4. If a shared utility exists, use it. If not, build one and resolve the DRY entry.

### After Implementing Code
1. Run `dry-guy` agent on all changed files
2. If new patterns are flagged, add them to the "Active Watch List"
3. If existing patterns are resolved, move them to "Resolved" with the shared location

### When Reviewing PRs
1. Check if the PR introduces code that matches any `watch` or `flagged` entries
2. If so, request that the author use the shared utility or extract one
3. Block merge until DRY-GUY audit passes

---

## Version History

- **v1.0** (2026-02-18): Initial creation with pre-identified watch patterns from PRD analysis

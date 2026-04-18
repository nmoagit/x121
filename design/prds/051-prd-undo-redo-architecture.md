# PRD-051: Undo/Redo Architecture

## 1. Introduction/Overview
Creative tools live and die by their undo system. This PRD provides a structured, tree-based undo/redo system that tracks all reversible actions across the platform with per-entity scoping and persistent state. The tree model (vs. linear stack) is essential because creators frequently explore variations ("try this, undo, try that") and need to revisit earlier branches without losing any history.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-04 (Session Persistence for undo tree serialization), PRD-47 (Tagging for tag add/remove undo)
- **Depended on by:**
  - **PRD-167** (Revert to Original — Uploaded Baseline Restoration): first external consumer of the undo tree. Drove the v1.1 amendment. Requires the action-type registry, protected-node-types pruning, the built-in `external_mutation` node kind, and the schema/API stability guarantee introduced in Phase 3. PRD-167 registers three action types (`baseline_captured`, `revert_to_baseline`, and `external_mutation` — the last is the built-in contributed by this PRD) through the registry added in Req 3.1.
  - Cross-reference: **PRD-045** (Audit Logging & Compliance) remains the authoritative record of "who did what, when" for cross-user mutations. The `external_mutation` node kind (Req 3.3) is a per-viewer history marker, not a replacement for the audit log.
- **Part:** Part 4 — Design System & UX Patterns

## 3. Goals
- Implement tree-based (not linear) undo history preserving all branches.
- Scope undo operations per entity (character, scene, segment) — not globally.
- Define clear boundaries between undoable and non-undoable actions.
- Persist undo state across sessions.

## 4. User Stories
- As a Creator, I want tree-based undo so that when I explore a parameter variation and want to go back, my previous exploration branch is preserved.
- As a Creator, I want per-entity undo so that undoing a metadata change on Character A doesn't affect unrelated work on Character B.
- As a Creator, I want a visual history browser so that I can see all my undo branches and click any point to preview the state.
- As a Creator, I want undo state to survive logout/login so that I can resume exploration in my next session.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Tree-Based History
**Description:** Undo history forms a tree, not a linear stack.
**Acceptance Criteria:**
- [ ] When a user undoes several steps and performs a new action, the old forward path is preserved as a branch
- [ ] Branches are navigable — user can switch to any branch at any time
- [ ] No history is ever destroyed by branching

#### Requirement 1.2: Per-Entity Scope
**Description:** Undo operates at the entity level.
**Acceptance Criteria:**
- [ ] Each entity (character, scene, segment) maintains its own undo tree
- [ ] Undoing on one entity does not affect other entities
- [ ] Entity-level scope prevents cross-entity confusion in multi-entity workflows

#### Requirement 1.3: Undoable Actions
**Description:** Define which actions support undo.
**Acceptance Criteria:**
- [ ] Metadata edits (character traits, scene parameters, segment settings)
- [ ] Approval/rejection decisions (with confirmation, since these may have triggered downstream events via PRD-97)
- [ ] Parameter changes on pending/queued generation jobs
- [ ] Tag additions/removals (PRD-47)
- [ ] Template application (PRD-27) — revert to pre-template state

#### Requirement 1.4: Non-Undoable Actions
**Description:** Explicitly define actions that cannot be undone.
**Acceptance Criteria:**
- [ ] Completed GPU generation (too expensive — use re-generation instead)
- [ ] Disk reclamation (PRD-15 — deleted files cannot be restored from undo)
- [ ] Audit log entries (PRD-45 — immutable by definition)
- [ ] Clear messaging when a non-undoable action is performed

#### Requirement 1.5: Persistence
**Description:** Undo tree survives sessions.
**Acceptance Criteria:**
- [ ] Undo tree state serialized per user per entity
- [ ] Stored via PRD-04 session persistence
- [ ] Survives logout/login

#### Requirement 1.6: Visual History Browser
**Description:** Visual representation of the undo tree.
**Acceptance Criteria:**
- [ ] Scrollable timeline showing the undo tree with branch points
- [ ] Click any node to preview the state at that point before committing
- [ ] Current position clearly indicated
- [ ] Branch labels showing the action that created each branch

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Undo History Sharing
**Description:** Share undo branches with collaborators.
**Acceptance Criteria:**
- [ ] Export a specific branch of the undo tree as a named "exploration"
- [ ] Another user can import and apply the exploration to their entity

### Phase 3: Extensibility (v1.1)

Phase 3 was added in the v1.1 amendment (2026-04-17) after PRD-167 became the first external consumer of the undo tree. It converts PRD-051 from a closed, single-PRD feature into a general extension mechanism that other PRDs can plug into without forking `tree_json` parsing or patching the undo core. The four requirements below MUST all land together — they are interdependent and partial adoption would leave the registry useless, the pruner unsafe, or the schema contract ambiguous.

Phase 3 is strictly additive. Existing `undo_trees` rows written by the v1.0 implementation remain valid and navigable without migration (see Req 3.4). v1.0 callers that did not register an action type continue to work via a built-in `legacy_unregistered` fallback (see Req 3.1).

#### Requirement 3.1: Action-Type Registry
**Description:** Introduce a first-class registry of undo-tree node kinds so other PRDs can declare new `action_type` values with typed payload schemas, retention rules, and frontend rendering hints, without modifying the undo core. The registry is the single authoritative lookup for "what kinds of nodes can appear in an undo tree and how should they be handled."

**Design decisions (recorded):**
- **Location.** The registry is a backend DB lookup table (`undo_action_types`) plus a Rust registration API that mirrors the lookup rows at service startup. Rejected alternatives: (a) a pure Rust enum with a derive macro — loses runtime discoverability for the frontend; (b) a YAML config file — duplicates data already stored in `undo_trees.tree_json` payloads and cannot be introspected from SQL. The DB-table-plus-Rust-API approach matches the existing platform lookup-table convention (PRD-00) and is consistent with how `baseline_entity_types` is handled in PRD-167.
- **Payload schemas.** Each action type declares its payload schema as a JSON Schema document (draft 2020-12) referenced by name from the `payload_schema_ref` column. Schema documents live under `crates/core/schemas/undo_action_types/<name>.v<N>.json` in-repo and are loaded at startup. Payloads on write are validated against the declared schema; payloads on read are validated leniently (missing optional fields tolerated) so that older on-disk nodes keep working after a schema adds a field. This is the approach recommended in the amendment brief; alternatives considered (per-type Rust structs only, free-form JSON) either lose cross-language validation or lose discoverability.
- **Frontend rendering.** A companion frontend registry keyed by `action_type.name` supplies an icon, label, payload-preview renderer, and "show-in-history-browser" flag. Types that have no registered frontend entry render with a generic node icon and `name` as label — the visual history browser NEVER crashes or hides tree structure on an unknown type. PRD-051 ships default frontend entries for every built-in action type listed in Req 1.3 plus `legacy_unregistered`, `baseline_captured`, `revert_to_baseline`, and `external_mutation`.
- **Backwards compatibility.** Existing v1.0 `undo_trees` rows have `action_type` values written without a registry. On first access after upgrade, any unknown `action_type` is auto-registered into the `legacy_unregistered` category (a single catch-all row seeded by migration) so the tree stays navigable. v1.0 nodes are treated as non-undoable-by-default until the owning PRD registers a real action type for them — this is safe: navigating to them works, applying them does not.

**Acceptance Criteria:**
- [ ] New lookup table `undo_action_types` created with columns: `id SMALLSERIAL PK`, `name TEXT UNIQUE NOT NULL` (e.g. `metadata_edit`, `approval_decision`, `baseline_captured`), `owning_prd TEXT NOT NULL` (e.g. `PRD-051`, `PRD-167`), `is_system BOOLEAN NOT NULL DEFAULT false` (true for built-ins, false for externally registered types), `payload_schema_ref TEXT NOT NULL` (path to the JSON Schema document; format `<name>.v<N>.json`), `renderer_hint TEXT` (nullable opaque string consumed by the frontend registry, e.g. `rewind-arrow`), `is_undoable BOOLEAN NOT NULL DEFAULT true`, `retention_days INTEGER` (NULL means "inherit general pruning policy"), `is_protected BOOLEAN NOT NULL DEFAULT false` (true means the node is immune to pruning — see Req 3.2), `deprecated_at TIMESTAMPTZ` (nullable — soft-retire an action type without breaking historical rows), `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- [ ] `BIGINT id` convention is relaxed to `SMALLSERIAL` here because the set of action types is small and bounded — this matches the platform's existing treatment of lookup tables (see `baseline_entity_types` in PRD-167, `scene_statuses`, etc.). Follows PRD-00 ID conventions for lookups.
- [ ] Seeded rows on migration: one row per Req 1.3 built-in (`metadata_edit`, `approval_decision`, `parameter_change`, `tag_change`, `template_application`), plus `legacy_unregistered` (the v1.0 catch-all), plus `external_mutation` (the built-in contributed by Req 3.3). PRD-167's two action types (`baseline_captured`, `revert_to_baseline`) are seeded by that PRD's own migration — not by PRD-051.
- [ ] Rust registration API: `crates/core/src/undo_tree/registry.rs` exposes `register_action_type(spec: ActionTypeSpec) -> Result<ActionTypeId>` callable at service startup. The function is idempotent (same `name` + `payload_schema_ref` = no-op; same `name` + different schema ref = version-bump path — see Req 3.4). Registration writes-through to the DB lookup table so a fresh deploy auto-populates rows for any PRD-owned types declared in code.
- [ ] `ActionTypeSpec` struct fields mirror the DB columns. A `PayloadSchema` associated type carries the compiled JSON Schema validator.
- [ ] Payload write-validation: every `undo_trees.tree_json` mutation runs the node's `action_payload` through the registered schema before persistence. Validation failure returns 400 / error at the service boundary; the tree is never corrupted by a malformed payload.
- [ ] Payload read-validation is LENIENT: missing optional fields or extra unrecognized fields do not fail reads — they only fail writes. This protects legacy rows and rolling deploys.
- [ ] Frontend registry at `apps/frontend/src/features/undo-tree/actionTypeRegistry.ts` exposes `registerActionType(spec: FrontendActionTypeSpec)` with `{ name, icon, label, renderPayloadPreview, isVisibleInBrowser }`. Unknown action types at render time fall back to `<GenericNodeIcon />` + `spec.name` — never a crash, never a dropped node.
- [ ] New admin API: `GET /api/v1/undo/action-types` returns the full registry (for debugging, introspection, and for the frontend to hydrate its registry at app startup). Read-only. Requires `creator` or `admin`.
- [ ] `POST /api/v1/admin/undo/action-types` exists but is restricted to admin and is explicitly marked "for emergency deprecation / rename only" — day-to-day registration is code-driven via the Rust API.
- [ ] All existing v1.0 `undo_trees` rows remain readable and navigable after the migration — verified by an integration test that loads a fixture created against the v1.0 schema and asserts the visual history browser renders every node.
- [ ] DRY-GUY audit confirms no PRD implements its own parallel "undo action type" registry — all action-type registration flows through this API.

**Technical Notes:**
- Migration: `apps/db/migrations/20260417000010_create_undo_action_types.sql` creates the lookup table and seeds built-ins + `legacy_unregistered` + `external_mutation`.
- PRD-167's migration seeds `baseline_captured` and `revert_to_baseline` through the standard registration API, not a hand-written INSERT, so its action types exercise the same code path every future PRD will use.
- The registry is the contract surface Req 3.4 formalizes — any change to `ActionTypeSpec` or the seeded rows is a schema change, see Req 3.4.

#### Requirement 3.2: Protected-Node-Types Pruning Mechanism
**Description:** Tree pruning (PRD-051's v1.0 open question — maximum tree depth/size before old branches are pruned) must respect per-action-type retention policies declared at registration time. Some node kinds must survive pruning indefinitely (e.g. PRD-167's `baseline_captured` roots), others have their own TTL (e.g. PRD-167's `revert_to_baseline` = 30 days), and the default policy covers everything else.

The pruner MUST preserve tree connectivity. If a node between the root and the current head is protected, every intermediate node on the path from the protected node to the current head (and from the root to the protected node, if it is not the root itself) is automatically preserved so the tree remains navigable. Users must never see a broken tree where "you cannot get to the baseline because the node that linked to it was pruned."

**Acceptance Criteria:**
- [ ] Global pruning policy configured in `platform_settings` under namespace `undo.pruning`:
  - `undo.pruning.default_max_depth INTEGER` — maximum nodes per tree before tail-pruning kicks in (default 500).
  - `undo.pruning.default_max_age_days INTEGER` — nodes older than this are candidates for pruning unless protected (default 90).
  - `undo.pruning.enabled BOOLEAN DEFAULT false` — pruning is off by default in v1.1 MVP; operators opt in explicitly. This was PRD-051's v1.0 open question and is now resolved: pruning is opt-in at the platform level.
- [ ] Per-action-type overrides come from `undo_action_types`:
  - `retention_days = NULL` → inherit `default_max_age_days`.
  - `retention_days = N` → node survives at least N days, independent of the default.
  - `is_protected = true` → node is never pruned regardless of age or depth (used for `baseline_captured`).
- [ ] Pruning algorithm preserves tree connectivity via a protected-set closure pass:
  1. Collect the set of "keep-forever" nodes (any node with `is_protected = true` OR within `retention_days` OR the current head of any branch).
  2. For each keep-forever node, walk the path to the root AND the path to the current head — every node on those paths is added to the keep set.
  3. Only nodes NOT in the keep set are eligible for deletion.
- [ ] The current head of every branch is ALWAYS protected. Pruning never orphans a live branch even if the head is old.
- [ ] A protected node between a root and the head keeps all intermediate nodes — verified by a pruning integration test that constructs a 100-node tree, marks the 50th node protected, runs the pruner with aggressive age limits, and asserts nodes 1-100 all survive.
- [ ] Pruning runs as a background task scheduled through PRD-119 (time-based scheduling) when `undo.pruning.enabled = true`. Default cadence: daily at 03:00 local server time. The job is idempotent and uses a soft-delete `pruned_at TIMESTAMPTZ` column rather than a hard DELETE for a 7-day grace period (so recovery is possible if retention policy was misconfigured).
- [ ] New column on `undo_trees.tree_json` node entries: `pruned_at TIMESTAMPTZ` — nullable. Read path filters out `pruned_at IS NOT NULL` older than the grace window.
- [ ] Admin API: `POST /api/v1/admin/undo/prune/dry-run` — returns the list of nodes that would be pruned under the current policy without touching them. `POST /api/v1/admin/undo/prune/run` — triggers a one-shot prune (admin only, rate-limited to once per 5 minutes).
- [ ] The visual history browser surfaces a "Pruning scheduled" badge on nodes whose `pruned_at` is set but still within the grace window, so users get a warning before the node disappears.
- [ ] Retention policies are declarative, not hardcoded — the pruner reads everything it needs from `undo_action_types`. No PRD should need to modify the pruner's source code to add a new retention policy.
- [ ] Works with the legacy `legacy_unregistered` action type: those nodes inherit the default policy (no special protection), matching their v1.0 semantics.

**Technical Notes:**
- Implementation lives in `crates/core/src/undo_tree/pruner.rs` with a unit test suite that covers: default pruning, per-type retention, `is_protected = true`, connectivity preservation, head protection, grace-period behaviour.
- Because `tree_json` is a single JSONB blob per `(user_id, entity_type, entity_id)`, the pruner operates at the JSON document level — it rewrites `tree_json` after marking nodes as pruned. This is intentional: it keeps the v1.0 storage schema unchanged and avoids a normalized-tree migration that would have ripple effects.
- For very large trees (>10k nodes in a single JSONB), the pruner logs a warning and emits a metric `undo.tree_oversized` — future work may migrate such trees to a normalized table, but that is explicitly out of scope for v1.1.

#### Requirement 3.3: Built-In `external_mutation` Node Type
**Description:** PRD-051 v1.0 implicitly assumed every mutation on the tree was performed by the tree's owning user (undo trees are per-user, per-entity). v1.1 extends this to cross-user scenarios. When user B mutates an entity that user A has an open undo tree for, user A's tree gets an `external_mutation` node inserted at their current head on their next fetch of the tree. User A's existing branches are preserved and remain navigable; "jump to latest" anchors on the new external node.

This is a built-in node type (shipped in the PRD-051 seed data) rather than a PRD-167-specific contribution, because cross-user divergence is a property of the tree architecture itself, not of any one feature. Future PRDs (e.g. real-time collaboration features built on PRD-011) will reuse `external_mutation` for the same purpose.

**Acceptance Criteria:**
- [ ] `external_mutation` seeded into `undo_action_types` at migration time with `owning_prd = 'PRD-051'`, `is_system = true`, `is_undoable = false`, `is_protected = false`, `retention_days = NULL` (inherits default pruning — a stale external marker is fine to collect once the entity has moved on), `renderer_hint = 'external-pulse'`.
- [ ] Payload schema (at `crates/core/schemas/undo_action_types/external_mutation.v1.json`) defines:
  - `mutating_user_id` (BIGINT, required) — the user who made the external change.
  - `mutating_user_display_name` (string, required) — denormalized for the history browser so it renders without a follow-up user-lookup query.
  - `mutated_at` (ISO-8601 timestamp, required).
  - `action_summary` (string, required, 1-240 chars) — brief human-readable description, e.g. `"changed 3 metadata fields"`, `"reverted to baseline"`.
  - `state_ref` (object, required) — one of `{ diff_path: string }` OR `{ snapshot_id: BIGINT, snapshot_source: "baseline_snapshots" | "metadata_versions" | "workflow_versions" | "custom" }`. The history browser uses this to render a preview of what changed. `state_ref` is a pointer, not embedded state, so `external_mutation` payloads stay small.
  - `audit_log_id BIGINT` (optional but recommended) — link back to the PRD-045 audit event that authoritatively describes the change.
- [ ] Insertion rule: on every tree fetch, the server checks whether the entity's canonical state has advanced past the user's current head (e.g. via `entities.version_id` or an equivalent versioning pointer supplied by the entity type — PRD-167 uses `baseline_snapshots.id` and version-table IDs). If so, a system-authored `external_mutation` node is appended to the tree at the user's current head, with `user_id = SYSTEM_USER`, before the tree is returned. Idempotent: if the most recent node on the user's head is already an `external_mutation` referencing the same `state_ref`, no new node is inserted.
- [ ] User A's existing branches are preserved — the `external_mutation` node becomes a sibling of whatever the user would otherwise branch to. PRD-051 Req 1.1 branch-preservation guarantee is not violated.
- [ ] Jumping to an `external_mutation` node is a no-op navigation: the tree's head pointer moves to that node but no entity state is re-applied (the entity is already in the post-external state server-side). The frontend shows a toast `"Synced to latest — changes made by <user>"`.
- [ ] Attempting to "undo" an `external_mutation` node returns a friendly error in the UI: "This change was made by another user. To revert it, ask <user> or use the Revert to Original action if available." — refers to PRD-167 where applicable. The server-side undo API returns 409 with `code: external_mutation_not_undoable`.
- [ ] The history browser renders `external_mutation` nodes with a distinctive icon (per `renderer_hint = 'external-pulse'`) and a label like `"Alice changed 3 metadata fields"`. The mutating user's avatar is shown inline.
- [ ] PRD-045 cross-reference: every `external_mutation` node SHOULD carry `audit_log_id` in its payload when the mutation flowed through an audited path. The audit log remains authoritative — `external_mutation` is a viewer convenience, not a source of truth.
- [ ] Works across the MVP action types registered by PRD-167 (`baseline_captured`, `revert_to_baseline`) — a revert performed by user B correctly surfaces as an `external_mutation` in user A's tree, verified by integration test.

**Technical Notes:**
- Backend: insertion lives in `crates/core/src/undo_tree/external_mutation.rs`. Entity-type plugins (workflows, characters, etc.) implement a trait `CanonicalStateCursor` with a single method `current_cursor(&self, entity_id) -> Cursor` so the insertion routine can compare the user's head to the entity's canonical state without entity-specific knowledge.
- No new endpoint — insertion happens transparently inside the existing `GET /user/undo-tree/:entity_type/:entity_id` handler.
- Frontend: the toast is emitted by the `useUndoTree` hook when it detects a new `external_mutation` at the tail since last fetch.

#### Requirement 3.4: Schema Freeze & Extension Stability Guarantee
**Description:** With external PRDs starting to depend on PRD-051's schema, API, and tree_json structure, PRD-051 must document a formal stability contract. This requirement defines which surfaces are STABLE (breaking changes require a major version bump and a migration path), which are INTERNAL (may change without notice), and how downstream PRDs evolve their payload schemas safely.

**STABLE surfaces (will not break without a major version bump — v2.0):**
- `undo_trees` table column names and types.
- `undo_action_types` table column names and types.
- `GET/PUT /user/undo-tree/:entity_type/:entity_id` request/response shape.
- `GET /api/v1/undo/action-types` response shape.
- Rust public API: `crates/core/src/undo_tree/registry.rs` (`ActionTypeSpec`, `register_action_type`, payload validation trait).
- Rust public API: `crates/core/src/undo_tree/mod.rs` (`UndoTree`, `UndoNode`, navigation methods).
- Frontend public API: `apps/frontend/src/features/undo-tree/actionTypeRegistry.ts` (`FrontendActionTypeSpec`, `registerActionType`).
- Seeded built-in action types: their `name` values (`metadata_edit`, `approval_decision`, `parameter_change`, `tag_change`, `template_application`, `legacy_unregistered`, `external_mutation`). Their payload schemas are versioned independently (see Req 3.4 versioning strategy below).
- The invariant "every node has `id`, `parent_id`, `action_type`, `action_payload`, `created_at` in `tree_json`."

**INTERNAL surfaces (may change — do NOT depend on these):**
- Pruner implementation details (`pruner.rs` function signatures, scheduling cadence, exact algorithm).
- JSONB compaction and compression strategies.
- The exact content of `legacy_unregistered` handling — the NAME is stable, the behaviour may tighten.
- Non-public helpers in `crates/core/src/undo_tree/internal/*`.
- The rendering details of the visual history browser beyond the act of rendering registered types via the frontend registry.

**Payload-schema versioning strategy:**
- Each action type's `payload_schema_ref` carries an explicit version: `<name>.v<N>.json`.
- **Additive changes** (new OPTIONAL fields, widened enums) are a minor schema bump and do NOT require a new `payload_schema_ref` — the JSON Schema is edited in place. Read-validation is lenient (see Req 3.1) so older on-disk payloads continue to parse.
- **Breaking changes** (field renames, type changes, new REQUIRED fields) MUST create a new `<name>.v<N+1>.json` file. The owning PRD registers the new version with a new `payload_schema_ref`, writes a one-time migration that converts existing payloads in place (or leaves them at vN with a documented compat shim), and updates frontend renderers. The old schema file is retained for the grace period during which mixed on-disk data may exist.
- Deprecated action types are soft-retired by setting `deprecated_at` — tree_json nodes still render, but new nodes cannot be written with that type.

**Acceptance Criteria:**
- [ ] A new subsection `Stability Contract` is added to this PRD (see above) documenting STABLE and INTERNAL surfaces.
- [ ] The payload-schema versioning strategy is documented (see above) and enforced by the registry: attempting to register an action type with a `payload_schema_ref` that already exists in the DB with a different schema document hash fails fast with error `SchemaDrift` — operator must either revert the schema or publish a new `vN+1`.
- [ ] A changelog file is created at `design/prds/amendments/051-undo-redo-changelog.md` listing every breaking change to a STABLE surface with date, PRD, and migration instructions. Empty at v1.1 baseline; every future amendment appends an entry.
- [ ] A deprecation policy is documented: STABLE surfaces may be deprecated with at least 60 days notice before removal, announced via the changelog file AND a `deprecated` response header on affected API endpoints.
- [ ] DRY-GUY audit: no PRD writes directly to `undo_trees.tree_json` — all mutations flow through `crates/core/src/undo_tree/` APIs. Violations are fixed at write time, not by the undo core.
- [ ] All existing v1.0 rows (from deployments made before 2026-04-17) pass an idempotency check: re-running the v1.1 migration on a v1.0 snapshot produces the same result as a fresh v1.1 deploy. No data loss, no silent rewrites. Verified by a migration test fixture.

**Technical Notes:**
- The stability contract is a commitment, not an implementation — enforcement is procedural (code review + DRY-GUY + the changelog file) rather than runtime. There is no automated "breaking-change detector" in v1.1.
- `design/prds/amendments/051-undo-redo-changelog.md` follows the format used elsewhere in the project: `| Date | PRD | Surface | Change | Migration |`.

## 6. Non-Goals (Out of Scope)
- Non-linear parameter history for progressive disclosure (covered by PRD-32)
- Content branching for generated outputs (covered by PRD-50)
- Audit logging of actions (covered by PRD-45)

## 7. Design Considerations
- The visual history browser should use a tree/graph visualization, not a flat list.
- Branch points should be visually distinct from linear steps.
- Preview of historical states should be non-destructive (view only) until the user commits.

## 8. Technical Considerations
- **Stack:** React state management (zustand or similar) with tree-structured history, serialized to JSON
- **Existing Code to Reuse:** PRD-04 session persistence for storage, PRD-47 tag data for tag undo operations
- **New Infrastructure Needed:** Undo tree data structure, action serializer/deserializer, visual tree renderer
- **Database Changes:** `undo_trees` table (user_id, entity_type, entity_id, tree_json, updated_at)
- **API Changes:** GET/PUT /user/undo-tree/:entity_type/:entity_id

### v1.1 Technical Additions (Phase 3)

- **New DB migration:** `apps/db/migrations/20260417000010_create_undo_action_types.sql` creates the `undo_action_types` lookup table (see Req 3.1) and seeds the seven initial rows (five v1.0 built-ins + `legacy_unregistered` + `external_mutation`). The migration is additive — it does not touch existing `undo_trees` rows.
- **New DB migration:** `apps/db/migrations/20260417000011_undo_trees_pruning_columns.sql` adds `pruned_at TIMESTAMPTZ` to tree-json node entries via a one-time JSONB pass. Because the node entries live inside `tree_json`, this is an in-place JSON document migration rather than a column add. Rows without nodes (never-used trees) are no-ops.
- **New crates:**
  - `crates/core/src/undo_tree/registry.rs` — action-type registry (Req 3.1).
  - `crates/core/src/undo_tree/pruner.rs` — pruning algorithm with protected-node-types (Req 3.2).
  - `crates/core/src/undo_tree/external_mutation.rs` — cross-user divergence marker (Req 3.3).
  - `crates/core/schemas/undo_action_types/*.v1.json` — JSON Schema payloads for built-in types.
- **New frontend modules:**
  - `apps/frontend/src/features/undo-tree/actionTypeRegistry.ts` — frontend mirror of the backend registry, hydrated at app startup from `GET /api/v1/undo/action-types`.
  - Default renderers for every built-in action type, plus a generic fallback renderer for unknown types.
- **New/changed API endpoints:**
  - `GET /api/v1/undo/action-types` (Req 3.1) — list all registered types.
  - `POST /api/v1/admin/undo/action-types` (Req 3.1) — emergency admin override for type registration.
  - `POST /api/v1/admin/undo/prune/dry-run` (Req 3.2) — preview pruning.
  - `POST /api/v1/admin/undo/prune/run` (Req 3.2) — trigger one-shot prune.
  - Existing `GET /user/undo-tree/:entity_type/:entity_id` gains idempotent server-side insertion of `external_mutation` nodes when canonical state has advanced past the user's head (Req 3.3). Response shape is unchanged — the new node appears as an ordinary tree node, so v1.0 clients render it as a `legacy_unregistered` node until they update their frontend registry.
- **Platform settings:** three new keys under `undo.pruning` namespace (`default_max_depth`, `default_max_age_days`, `enabled`). Default values are chosen so that enabling pruning on a legacy deployment does not accidentally delete valuable tail history — `enabled = false` until an operator opts in.
- **DRY impact:** the registry supersedes any per-PRD ad-hoc registry. PRD-167's in-flight plan to keep its own `undo_action_types` mirror is explicitly dropped in favour of a single registration through this API — see PRD-167 v1.2 §9 item (a). DRY tracker entry to be added post-implementation.

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Undo/redo operations execute in <50ms (instant feel)
- Undo tree correctly preserves all branches without data loss
- Undo state successfully persists across logout/login cycles
- Per-entity scoping prevents cross-entity undo interference

## 11. Open Questions

*Resolved in v1.1 (2026-04-17):*
- *What is the maximum undo tree depth/size before pruning old branches?* — Resolved by Req 3.2. Default cap is 500 nodes or 90 days (whichever hits first), configurable via the `undo.pruning.*` platform settings. Per-action-type retention overrides the global cap. Pruning is OFF by default (`undo.pruning.enabled = false`) and is opt-in per deployment. Protected node types (`baseline_captured`, any type with `is_protected = true`) are immune indefinitely, and the pruner preserves tree connectivity (no orphan nodes, no broken paths between head and root).
- *Should undo trees be purgeable by the user (e.g., "Clear all undo history for this character")?* — Still relevant, but now framed by the Req 3.2 pruning story. A user-facing "clear history" action would essentially perform a per-tree immediate prune respecting the same protection rules (protected roots survive even a user-initiated purge). Deferred to post-v1.1.

*Still open:*

1. **User-initiated "Clear all undo history for this entity."** Scope and UI not yet specified. Expected behaviour: all non-protected nodes deleted; protected nodes (e.g. `baseline_captured` roots) retained; tree resets to the oldest protected node as its new root. Requires a confirmation modal because even with protection, the user's personal branch history is irretrievable. Defer to a dedicated follow-up or Req 2.1 post-MVP slot.
2. **Per-entity-type pruning override beyond action-type granularity.** An entity type (say `workflow`) may want different retention than another (`character_metadata`) independent of action type. Req 3.2 keys retention off `undo_action_types`, not entity types. If this gap proves real, add a `retention_days` override to an entity-type lookup table in a future amendment. No evidence yet that this is needed — defer.
3. **Normalized `undo_nodes` table vs. continuing with JSONB.** Req 3.2 notes the pruner emits an `undo.tree_oversized` warning for trees over 10k nodes. Long-term we may migrate from `undo_trees.tree_json` (single JSONB per user+entity) to a normalized `undo_nodes` table. That migration would be a STABLE-surface breaking change per Req 3.4 and would require v2.0. Tracked here so it is not forgotten.
4. **Cross-user branch merge semantics.** v1.1 handles cross-user divergence one-way (user B's changes appear as `external_mutation` in user A's tree). It does NOT support "merge my branch into the canonical state after seeing user B's change." Real-time collaborative merge is explicitly out of scope (see PRD-167 Non-Goals) but may resurface as its own PRD.
5. **Registry auto-discovery.** Today each PRD calls `register_action_type` explicitly at startup. A future refinement could use an attribute-macro or `inventory` crate pattern to auto-register types at link time. Considered and rejected for v1.1 (too much machinery for 10+ expected action types); revisit if the registry grows past ~50 entries.

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification.
- **v1.1** (2026-04-17): Amendment — Extensibility Phase 3 added. Driven by PRD-167 (Revert to Original) becoming the first external consumer of the undo tree. Adds four new requirements (3.1 Action-Type Registry, 3.2 Protected-Node-Types Pruning, 3.3 Built-In `external_mutation` Node Type, 3.4 Schema Freeze & Extension Stability Guarantee). Introduces the `undo_action_types` lookup table, a Rust registration API, a frontend registry, a connectivity-preserving pruner with per-type retention, the cross-user divergence marker node kind, and a formal stability contract for downstream PRDs. Resolves v1.0 Open Question about pruning (default 500 nodes / 90 days, opt-in, protected-node-aware). All existing v1.0 `undo_trees` rows remain valid and navigable without data migration — unknown legacy action types are auto-categorized as `legacy_unregistered`. PRD-051 status moves from `done` back to `in-progress` until the four new requirements ship.

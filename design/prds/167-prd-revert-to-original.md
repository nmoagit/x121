# PRD-167: Revert to Original (Uploaded Baseline Restoration)

**Document ID:** 167-prd-revert-to-original
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-04-17
**Last Updated:** 2026-04-17 (v1.2 — PRD-051 extension-point requirements locked in)

---

## 1. Introduction/Overview

Several entities in the platform follow an "upload -> edit in-app" lifecycle. A user uploads a file (workflow JSON, character metadata, speech list, scene type config, etc.), the platform parses it into the database, and the user subsequently edits the derived data in the UI. Today there is no consistent way to undo all of those in-app edits and return to the state immediately after import. Users either have to hunt for the original file on their disk and re-import it (losing all related context), or accept their edits as permanent.

Some entities already have partial versioning (workflows, character metadata) but the semantics differ from PRD to PRD: workflows keep every edit as a new `workflow_version` row but have no explicit "original/baseline" marker; `character_metadata_versions` has a `source` column (`manual | generated | csv_import | json_import`) and an `is_active` flag but no explicit "revert to the first imported version" action; speech, prompt overrides, and many settings have no version history at all.

This PRD introduces a **uniform "Revert to Original" capability** that preserves an immutable `uploaded_baseline` snapshot for every supported entity at import time and exposes a single, predictable UI affordance to restore it. In v1 the revert and undo-revert mechanics are **unified with PRD-051's tree-based undo system**: the baseline is registered as the root node of the per-entity undo tree, a revert is recorded as a new tree node that references that root, and "undo the revert" is just ordinary PRD-051 tree navigation. No parallel pre-revert archive table is needed. The MVP covers three high-value entities — workflows, character metadata, character speech — and establishes a shared backend pattern that later PRDs can plug into.

## 2. Related PRDs & Dependencies

### Depends On (Hard — must land before PRD-167 implementation starts)
- **PRD-00** (Database Normalization & Strict Integrity): lookup tables, ID strategy, FK conventions. Status: `done`.
- **PRD-01** (Project, Character & Scene Data Model): entities that get the revert action (characters, scenes). Status: `done`.
- **PRD-03** (User Identity & RBAC): creator/admin role gating for revert, `created_by`/`reverted_by` attribution. Status: `done`.
- **PRD-045** (Audit Logging & Compliance): every revert must emit an audit event. Status: `done`.
- **PRD-051** (Undo/Redo Architecture): **hard dependency** — revert is implemented as a node in the PRD-051 undo tree, and undo-revert is PRD-051 tree navigation. Status per PRD-STATUS.md: `done` (2026-02-22). **However**, PRD-167 imposes four new requirements on PRD-051 that the current implementation does not yet satisfy (action-type registry, protected-node-types pruning mechanism, `external_mutation` node type, and schema freeze). These must land as a PRD-051 follow-up before PRD-167 can begin implementation. See §9 "Requirements PRD-167 imposes on PRD-051" for the complete enumeration and §9 "Risks introduced by PRD-051 unification" for mitigation options. Per v1.2 resolution (Q3): PRD-051's `undo_trees` schema and action-type registry API must be frozen and merged before any PRD-167 work begins. This likely requires promoting PRD-051 back out of its current "done" state (via a follow-up ticket or amendment) and reordering the build plan — flag to the user rather than modifying BUILD-PLAN.md from within PRD-167.
- **PRD-04** (Session & Workspace Persistence): PRD-051 serialises undo trees via PRD-04; no new persistence layer needed. Status: `done`.

### Extends
- **PRD-075** (ComfyUI Workflow Import & Validation): adds a `revert_to_baseline` action on top of the existing `workflows` + `workflow_versions` schema. The import creates both a `baseline_snapshots` row and the root node of the PRD-051 undo tree for the workflow.
- **PRD-013 / PRD-125 / PRD-133** (Dual-Metadata System / LLM Refinement Pipeline / Metadata Version Approval): adds a `revert_to_baseline` action on top of the existing `character_metadata_versions` schema, marking the most recent `json_import` or `csv_import` version as the baseline and as the undo-tree root.
- **PRD-051** (Undo/Redo Architecture): this PRD defines two new well-known node kinds in the undo tree — `baseline_captured` (root) and `revert_to_baseline` (branch). No schema change to `undo_trees`, only convention on `action_type` values.
- **PRD-115** (Generation Strategy & Workflow Prompt Management): `workflow_prompt_slots.default_text` is already the workflow default; revert restores scene-type overrides to empty / workflow default.
- **PRD-124** (Speech & TTS Repository): speech is currently flat; this PRD adds the baseline-snapshot pattern so a CSV/JSON import of speech can be reverted.

### Integrates With
- **PRD-010** (Event Bus): emits `entity.reverted` events for subscribers.
- **PRD-070 / PRD-095** (Notes / Production Comments): revert UI surfaces the required reason that is attached to the audit record.
- **PRD-011** (Real-time Collaboration): revert respects entity locks.
- **PRD-165** (Server-Side Directory & S3 Import): imports from server paths / S3 create a baseline snapshot the same way browser-drop imports do.
- **PRD-126** (Critical Bug Fixes & UX Polish): revert UI follows existing modal / confirmation patterns.

### Conflicts With
- None. This PRD is additive; it does not change existing version creation semantics. The PRD-051 unification means revert extends rather than replaces the undo tree.

## 3. Goals

### Primary Goals
1. Preserve an immutable `uploaded_baseline` snapshot for every supported entity at the moment of import (or re-import), without duplicating logic per entity.
2. Expose a single, discoverable "Revert to Original" action on every entity that supports it.
3. Make revert itself auditable and undoable by **recording it as a node in the PRD-051 undo tree** — revert creates a new version (never overwrites history), and "undo the revert" is ordinary undo-tree navigation. No parallel archive machinery.
4. Cover three high-value entities in MVP: **ComfyUI Workflows**, **Character Metadata**, **Character Speech** (CSV/JSON-imported).
5. Provide a reusable backend primitive (`baseline_snapshots` table + service trait + PRD-051 undo-tree integration helpers) so future entities opt in cheaply.

### Secondary Goals
1. Show users a clear diff between their current state and the baseline before they confirm the revert, so nothing is destroyed silently.
2. Preserve the baseline forever by default (no retention-driven deletion). Re-import always prompts the user whether to replace or keep the current baseline.
3. Surface baseline metadata (who uploaded, when, from what file) as a first-class UI element, not a hidden audit log.
4. Keep the action safe: destructive in intent but reversible in practice — revert is always a new undo-tree node.

## 4. User Stories

- As a **Creator**, when I have edited a workflow in the canvas and realise my edits have broken something, I want to revert to the version I originally imported so I can start again without hunting for the JSON file.
- As a **Project Manager**, when a metadata refinement pass produced the wrong output and I have made further manual edits on top, I want a single click to get back to the JSON I imported from the studio's onboarding spreadsheet.
- As a **Creator**, when I revert, I want to see a diff of exactly what changes so I do not lose edits I still care about accidentally.
- As an **Admin or Creator**, when a user re-uploads a corrected source file, I want the system to **prompt me every time** to decide whether the new upload replaces the baseline or is treated as an ordinary edit — no hidden default that silently changes meaning.
- As a **Reviewer**, when someone reverts by mistake, I want to be able to undo the revert itself — revert must not destroy anyone's work. (In v1 this is the same Undo action the PRD-051 visual history browser provides.)
- As a **PM**, I want to see who last modified the baseline, when it happened, and from what filename, so I know what "original" actually means before I restore it.
- As a **Creator**, I want to be prevented from reverting entities that never had an "original" (e.g. metadata created manually in-app with no import), because there is no baseline to revert to.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Shared `baseline_snapshots` Table
**Description:** A single polymorphic table stores baseline snapshots for all supported entity types. Each snapshot is immutable content plus provenance metadata. Every entity that opts in references its current baseline via the `baseline_snapshots.id` key, following the pattern already used by `asset_registry` and `character_metadata_versions`.

**Acceptance Criteria:**
- [ ] `baseline_snapshots` table created with: `id BIGSERIAL PK`, `uuid UUID UNIQUE NOT NULL`, `entity_type TEXT NOT NULL` (lookup-validated — see 1.2), `entity_id BIGINT NOT NULL`, `content JSONB NOT NULL`, `content_hash TEXT NOT NULL` (SHA-256, used for dedup), `source_kind TEXT NOT NULL` (`file_upload | s3_import | server_path | api_push | initial_generation`), `source_filename TEXT`, `source_path TEXT`, `file_size_bytes BIGINT`, `import_session_id BIGINT REFERENCES import_sessions(id) ON DELETE SET NULL`, `created_by BIGINT REFERENCES users(id) ON DELETE SET NULL`, `notes TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `deleted_at TIMESTAMPTZ` (soft delete, not `revoked_at`).
- [ ] Composite index on `(entity_type, entity_id)`; partial unique index on `(entity_type, entity_id, content_hash) WHERE deleted_at IS NULL` to prevent duplicate baselines.
- [ ] `BIGINT id` + `UUID uuid` follows platform ID strategy.
- [ ] Table has `set_updated_at` trigger only if we add an `updated_at` column (we intentionally do **not** — baselines are immutable; changes create new rows).
- [ ] RLS or role-gated: only `creator`/`admin` can insert via API; `reviewer` can read but not revert.

**Technical Notes:**
- `entity_type` is a TEXT validated against a lookup table (`baseline_entity_types`) rather than an enum — follows the platform's lookup-table convention (PRD-00).
- `content` is JSONB for structured entities (workflows, metadata, speech). For entities where the baseline is a binary file (future-proofing), a sibling `baseline_artifacts` table should be added in a later PRD — explicitly out of scope here.

#### Requirement 1.2: `baseline_entity_types` Lookup Table
**Description:** Seeded lookup table enumerating which entity types support revert. Ensures `entity_type` on `baseline_snapshots` is constrained and allows enabling new entities without a migration.

**Acceptance Criteria:**
- [ ] `baseline_entity_types` table: `id SMALLSERIAL PK`, `name TEXT UNIQUE NOT NULL`, `table_name TEXT NOT NULL`, `is_enabled BOOLEAN NOT NULL DEFAULT true`, `revert_label TEXT`, `description TEXT`.
- [ ] Seeded with MVP entries: `workflow`, `character_metadata`, `character_speech`.
- [ ] `baseline_snapshots.entity_type` is validated against this table at the service layer (CHECK constraint via trigger or application-level).
- [ ] Admin API to list enabled types: `GET /api/v1/baselines/entity-types`.

#### Requirement 1.3: Per-Entity `baseline_snapshot_id` Column
**Description:** Each supported entity gets a nullable `baseline_snapshot_id BIGINT` column pointing at the current baseline. This is a cached pointer — the canonical "which snapshot is the baseline right now" mapping — and is updated when a new import re-baselines the entity.

**Acceptance Criteria:**
- [ ] `workflows.baseline_snapshot_id BIGINT REFERENCES baseline_snapshots(id) ON DELETE SET NULL` added.
- [ ] `characters.metadata_baseline_snapshot_id BIGINT REFERENCES baseline_snapshots(id) ON DELETE SET NULL` added (named with `metadata_` prefix because characters will later have more baselines — speech baseline gets its own column).
- [ ] `characters.speech_baseline_snapshot_id BIGINT REFERENCES baseline_snapshots(id) ON DELETE SET NULL` added.
- [ ] Backfill: for existing entities with an import history (workflows with `imported_from IS NOT NULL`, `character_metadata_versions` with `source IN ('csv_import','json_import')`), a one-time backfill creates baseline snapshots from the earliest qualifying record and points the FK at it.
- [ ] Entities created manually in-app (no import) have NULL — the Revert button is hidden / disabled in the UI (see 1.10).

#### Requirement 1.4: Capture Baseline on Import (Workflows)
**Description:** Extend the existing workflow import flow (PRD-075) so that every import creates a `baseline_snapshots` row and updates `workflows.baseline_snapshot_id`.

**Acceptance Criteria:**
- [ ] `POST /api/v1/workflows/import` captures the raw uploaded JSON into `baseline_snapshots.content`, records filename, size, uploader, and import session.
- [ ] On first import of a new workflow: creates baseline + sets `baseline_snapshot_id`.
- [ ] On re-import of an existing workflow (same `name`, user confirms overwrite): creates a **new** baseline (old one retained with `deleted_at = NULL`, simply no longer referenced), sets `baseline_snapshot_id` to the new one. The previous baseline is preserved so an audit query can reconstruct "what was originally uploaded in January."
- [ ] Content hash dedup: if the uploaded JSON is bit-for-bit identical to the current baseline, no new snapshot row is created (returns the existing `baseline_snapshot_id`).
- [ ] Workflow version 1 (or the version created at import) carries a boolean flag `is_baseline` OR the version's `id` matches the `baseline_snapshot.content` — the canonical link is the FK on `workflows.baseline_snapshot_id`, not a flag on `workflow_versions`.

**Technical Notes:**
- This requirement does **not** change the existing `workflow_versions` semantics. Every edit still creates a new version. The baseline is a separate concept stored in `baseline_snapshots`.

#### Requirement 1.5: Capture Baseline on Import (Character Metadata)
**Description:** Extend the character metadata import paths (CSV import, JSON import, legacy import, LLM refinement approval when marked as `source='json_import'`) to capture a baseline.

**Acceptance Criteria:**
- [ ] Any `character_metadata_versions` insert where `source IN ('csv_import','json_import')` triggers creation of a `baseline_snapshots` row with `entity_type='character_metadata'` and `entity_id=character_id`.
- [ ] `characters.metadata_baseline_snapshot_id` updated to the newly created snapshot.
- [ ] `source_bio` and `source_tov` fields on the version record are **not** the baseline — the baseline is the imported metadata JSON itself (because that is what "revert to original" means in the user's head).
- [ ] Bio/ToV protection (PRD-125 Req A.2) is unchanged: reverting metadata never touches `bio.json` or `tov.json` source files.

#### Requirement 1.6: Capture Baseline on Import (Character Speech)
**Description:** Extend the speech CSV/JSON import endpoint (PRD-124) to capture the full imported speech list as a single JSONB baseline per character.

**Acceptance Criteria:**
- [ ] `POST /api/v1/characters/:id/speeches/import` captures the parsed speech entries (array of `{speech_type, version, text, language_id}`) as `baseline_snapshots.content`.
- [ ] `characters.speech_baseline_snapshot_id` updated.
- [ ] Multi-language imports (PRD-136) are included in the snapshot — a revert restores all languages that were part of the original import.

#### Requirement 1.7: Revert Action API
**Description:** A uniform revert endpoint per entity type that applies the baseline content on top of the current entity state and creates a new version **and** a new node in the PRD-051 undo tree. The undo tree is the single source of truth for "how to go back."

**Acceptance Criteria:**
- [ ] `POST /api/v1/workflows/:id/revert-to-baseline` — creates a new `workflow_versions` row whose `json_content` equals the baseline `content`, increments `current_version`, re-runs media slot discovery (PRD-146). Returns the new version and the new undo-tree node id.
- [ ] `POST /api/v1/characters/:id/metadata/revert-to-baseline` — creates a new `character_metadata_versions` row with `source='revert_to_baseline'` and `metadata` equal to the baseline content, sets `is_active = true` and demotes the previously active version. Approval status resets to `pending` (PRD-133).
- [ ] `POST /api/v1/characters/:id/speeches/revert-to-baseline` — within a single DB transaction, inserts speeches replacing the current set **and** appends a `revert_to_baseline` node to the PRD-051 undo tree whose `action_payload` is a full JSON snapshot of the pre-revert speeches. Speech has no per-row version table, so the undo tree is the only record of the pre-revert state — this is acceptable because PRD-051 mandates tree persistence via PRD-04.
- [ ] All revert endpoints require `{reason: string, confirm_changes_will_be_lost: true}` in the request body. `reason` must be at least **10 characters** (see §13 Decisions for rationale; trimmed whitespace does not count). `confirm_changes_will_be_lost` must be `true`. Otherwise 400.
- [ ] All revert endpoints emit an `entity.reverted` audit event (PRD-045) with `{entity_type, entity_id, baseline_snapshot_id, reverted_by, reason, previous_state_version_id, undo_tree_node_id}`.
- [ ] Endpoints require `creator` or `admin` role; respect entity locks (PRD-011).
- [ ] If `baseline_snapshot_id IS NULL` for the entity, the endpoint returns 409 Conflict with message `"No baseline exists for this entity — it was not imported."`.

**Technical Notes:**
- All three handlers share a common core routine `core::baseline::apply_revert(entity_type, entity_id, applier, undo_tree_ctx)` where `applier` is a closure/trait object that knows how to inflate the JSONB content into the entity's concrete schema, and `undo_tree_ctx` is the PRD-051 undo-tree handle for the acting user + entity. This is the DRY primitive future entities will reuse.

#### Requirement 1.8: Revert Is a PRD-051 Undo-Tree Node (Unified History)
**Description:** Revert does not create a parallel archive system. It appends a node to the per-user, per-entity undo tree defined by PRD-051. "Undo the revert" is identical to the Undo button that PRD-051 exposes in its visual history browser. The baseline itself is registered as the root node of the tree when the entity is first imported.

**Acceptance Criteria:**
- [ ] When an entity is first imported and a `baseline_snapshots` row is created, the system also inserts a root node into `undo_trees` for the importing user with `action_type='baseline_captured'` and `action_payload={baseline_snapshot_id}`.
- [ ] When a revert is applied, a new child node is appended to the current head of the acting user's undo tree with `action_type='revert_to_baseline'` and `action_payload={baseline_snapshot_id, pre_revert_snapshot: <full pre-state JSON>, post_revert_version_id}`.
- [ ] PRD-051's visual history browser (Req 1.6 of PRD-051) renders these two node kinds with dedicated icons: a flag for `baseline_captured`, a rewind arrow for `revert_to_baseline`.
- [ ] Undoing a `revert_to_baseline` node via the PRD-051 history browser re-applies `action_payload.pre_revert_snapshot` to the entity via the same `core::baseline::apply_revert` primitive (the applier is entity-type aware).
- [ ] Workflow and metadata reverts additionally rely on their existing version tables (`workflow_versions`, `character_metadata_versions`) — the undo-tree node is the unified history marker, not the primary storage for the pre-revert state. Speech revert relies on the undo tree for pre-revert storage (no version table exists for speech).
- [ ] Per-user scoping (resolved v1.2, Q1): undo trees are **per-user-per-entity** (matches PRD-051's existing scope). The baseline snapshot itself is **entity-level** — shared across all users because "the original" is a property of the entity, not of any one viewer. Each user who touches the entity has their own tree anchored to the same shared baseline. If user A reverts and user B later reverts their own changes, each user's tree records their own actions; the entity itself has one canonical state but each user navigates their own history.
- [ ] **Cross-user divergence handling** (resolved v1.2, Q1): when user B mutates an entity whose state user A is viewing, a system-generated node with `action_type='external_mutation'` is inserted into user A's tree at user A's current head. The payload captures `{mutating_user_id, mutation_summary, post_mutation_state_ref}`. User A's existing branches are preserved and remain navigable (honouring PRD-051 Req 1.1's branch-preservation guarantee), but "jump to latest" in the visual history browser points to the new external state. The external-mutation node is non-undoable for user A (it reflects work user A did not do) but serves as a visible marker that the entity diverged from their local history. This node kind is contributed by PRD-167 and must be supported by PRD-051 — see §9 "Requirements PRD-167 imposes on PRD-051" item (c).

#### Requirement 1.9: Diff Preview Before Confirmation
**Description:** The Revert button opens a modal showing a field-level diff between the current state and the baseline. The user confirms only after seeing what will change.

**Acceptance Criteria:**
- [ ] `GET /api/v1/{entity}/:id/revert-preview` returns `{baseline_snapshot: BaselineSnapshotSummary, diff: {added: [...], modified: [...], removed: [...]}}`.
- [ ] Diff uses the existing diff engine used by PRD-066 (metadata editor import diff) and PRD-125 (LLM refinement diff) — **no new diff library**.
- [ ] The modal displays:
  - baseline provenance (filename, uploader, upload date, file size)
  - diff summary counts (e.g. "12 fields changed, 3 added, 1 removed")
  - expandable field-level diff
  - a **required** "reason" textarea for all actors (creator, admin, reviewer). Minimum 10 characters after trimming whitespace. Inline validation: submit button is disabled until the minimum length is met, with helper text "Please describe why you are reverting (at least 10 characters)."
  - two buttons: "Cancel" and "Revert to Original" (the PRD-051 undo-revert path makes this safe — copy reflects that: "You can undo this from the history browser.").
- [ ] If current state equals baseline (diff is empty), the Revert button is disabled with tooltip "Already at baseline."

#### Requirement 1.10: UI Affordance — Placement and Visibility Rules
**Description:** The Revert button appears in a predictable place on every supported entity page. It is visible only when there is something to revert to.

**Acceptance Criteria:**
- [ ] **Workflows**: "Revert to Original" button in the WorkflowDetailPanel header row, grouped with existing version actions, visible only when `baseline_snapshot_id IS NOT NULL`.
- [ ] **Character Metadata** (PRD-066 MetadataForm / MetadataSpreadsheet): "Revert to Original" in the versions dropdown and at the top of the Metadata tab (PRD-112), visible only when `metadata_baseline_snapshot_id IS NOT NULL`.
- [ ] **Character Speech** (PRD-124 Speech tab): "Revert to Original" in the tab toolbar, visible only when `speech_baseline_snapshot_id IS NOT NULL`.
- [ ] Button is hidden (not just disabled) when there is no baseline, to avoid confusing users about a capability they cannot use.
- [ ] Button is disabled with a lock icon when the entity is locked by another user (PRD-011).
- [ ] Tooltip on the button shows baseline provenance: "Revert to workflow uploaded by alice@studio.com on 2026-03-20 (dance_v2.json)".

#### Requirement 1.11: Re-Import Always Prompts (No Configurable Default)
**Description:** When a user re-imports a file for an existing entity, the system **always** prompts them to choose whether the new upload should replace the baseline or simply create an edit. There is no admin-configurable "always replace" or "always keep" default — the prompt is mandatory every time so baseline changes are never silent.

**Acceptance Criteria:**
- [ ] Re-import flow displays a modal: "An earlier version of this workflow was uploaded on [date] by [user]. What should happen to the baseline?"
  - Option A: "Replace the baseline — future reverts will restore this new upload." (radio, no pre-selection)
  - Option B: "Keep the current baseline — just apply these changes as an edit." (radio, no pre-selection)
  - The modal's primary button is disabled until one option is selected, so the user must make an explicit choice every time.
- [ ] Option A creates a new `baseline_snapshots` row, updates the FK, and inserts a new **root** in the undo tree (`action_type='baseline_captured'`, new baseline id). The old baseline is not deleted (so audit queries can reconstruct history) but is no longer referenced by the entity.
- [ ] Option B creates a new version but does **not** touch `baseline_snapshot_id` and does **not** reset the undo tree — the edit is a normal node appended to the tree.
- [ ] Every baseline change is audit-logged with `entity.baseline_changed` event, payload includes the user's choice.
- [ ] No `platform_settings.baseline.auto_rebase_on_reimport` key exists. The prompt is not skippable by admin config.

#### Requirement 1.12: Retention Policy for Baseline Snapshots
**Description:** Baseline snapshots are preserved forever by default. Undo-revert durability is provided entirely by PRD-051's `undo_trees` persistence, which inherits its retention rules from PRD-04 session persistence — no separate `baseline.undo_revert_retention_days` key exists.

**Acceptance Criteria:**
- [ ] `baseline_snapshots` rows are never auto-deleted. Soft delete (`deleted_at`) is only set if an admin explicitly removes the associated entity (cascade) or triggers a GDPR-style cleanup.
- [ ] Undo-revert is available for **30 days** after a revert. This is a **locked v1 value** — not configurable in admin settings. Implemented via a standard pruning pass on `undo_trees` that retains nodes of type `revert_to_baseline` for at least 30 days regardless of PRD-051's general pruning policy (see 1.12.1). Older revert nodes are garbage collected along with the rest of the tree's tail.
- [ ] **1.12.1 Undo-tree retention hook in PRD-051:** PRD-051 undo trees have their own pruning rules for depth and age (see PRD-051 Open Question "maximum undo tree depth/size before pruning"). PRD-167 requires that whatever pruning policy PRD-051 adopts, `action_type='revert_to_baseline'` and `action_type='baseline_captured'` nodes are pinned for at least 30 days since creation and are never pruned if they are the current head of a branch. If PRD-051 has not yet defined a pruning policy when PRD-167 lands, PRD-167 contributes the 30-day retention default as the first policy entry.
- [ ] Storage footprint: the platform tracks total `baseline_snapshots` size in the disk visualizer (PRD-019) under category "Baselines."

#### Requirement 1.13: Audit Log Integration
**Description:** Every baseline-related action is logged through PRD-045.

**Acceptance Criteria:**
- [ ] `entity.baseline_created` — fired when a baseline is first captured.
- [ ] `entity.baseline_replaced` — fired when re-import replaces the baseline (includes old and new `baseline_snapshot_id`).
- [ ] `entity.reverted` — fired when a revert is applied; payload includes `baseline_snapshot_id`, `pre_revert_version_id`, `post_revert_version_id`, `reason`.
- [ ] `entity.revert_undone` — fired when a user undoes a revert.
- [ ] Audit events are queryable in the Activity Console (PRD-118).

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL — Post-MVP]** Requirement 2.1: Partial / Field-Level Revert
**Description:** Allow users to revert only selected fields to baseline, rather than all-or-nothing. E.g. "revert only the prompt fields, keep my scene parameter edits."

#### **[OPTIONAL — Post-MVP]** Requirement 2.2: Expand to Additional Entities
**Description:** Add baseline support for: scene types (Req uses `scene_type_prompt_defaults`), prompt fragments, project settings, platform settings, workflow prompt overrides, seed assignments (PRD-146).

#### **[OPTIONAL — Post-MVP]** Requirement 2.3: Bulk Revert
**Description:** Revert multiple entities at once from a batch operations page (e.g. revert metadata for all characters in a project that were imported from the same CSV).

#### **[OPTIONAL — Post-MVP]** Requirement 2.4: Baseline Comparison Across Entities
**Description:** Compare two baselines side-by-side, e.g. to see what changed between two historical uploads of the same workflow.

#### **[OPTIONAL — Post-MVP]** Requirement 2.5: Baseline Export
**Description:** Download the baseline as the original file format (.json) — useful when the user has lost their local copy.

## 6. Non-Functional Requirements

### Performance
- Revert preview diff must return in <500ms for payloads up to 1 MB.
- Revert apply must complete in <2 seconds for any MVP entity (workflows up to 5 MB JSON, metadata up to 200 KB, speech up to 100 entries).
- Baseline write during import must add <100ms overhead to the existing import path.

### Security
- Revert endpoints require `creator` or `admin`; reviewers can view but not trigger.
- Baseline `content` JSONB must not include secrets; import paths that strip secrets (PRD-110 `platform_settings`) continue to do so before baseline capture.
- All revert actions are immutably logged (PRD-045).
- Baseline reads are RBAC-gated the same as the owning entity.

### Storage
- JSONB compression handled by PostgreSQL TOAST; expected footprint <10 GB for 10,000 characters + 1,000 workflows at current data shapes.
- Storage usage reported in PRD-019 disk visualizer.

## 7. Non-Goals (Out of Scope)

- **Binary file baselines.** This PRD handles JSONB-serialisable entities only. Image / video revert is handled by PRD-021 and PRD-109 respectively and remains unchanged.
- **Real-time collaborative merge.** Revert is a single-user action; concurrent revert + edit is resolved by entity locks (PRD-011) and last-writer-wins semantics for the non-locked case.
- **Branching of baselines.** A given entity has at most one current baseline. Historical baselines are retained for audit but are not user-selectable as the "live" baseline without going through re-import.
- **Separate pre-revert archive storage.** Superseded by the PRD-051 unification — the undo tree stores the pre-revert state. (Earlier draft proposed a `speech_revert_archives` table; removed in v1.1.)
- **Scene video / image revert.** Already covered by PRD-109 (SVV versioning) and PRD-021 (image variant hero selection).
- **Automatic periodic baselining.** The baseline is explicit — set only on import or admin re-baseline. No cron-driven "save current state as baseline" in MVP.
- **Revert of Bio/ToV files.** These are source files protected by PRD-125 Req A.2. If they need restoration, that is a separate import flow.

## 8. Design Considerations

- **Button style.** "Revert to Original" uses the design system's `Button` primitive with `variant="warning"` — destructive-ish intent but reversible. Existing warning icon set.
- **Confirmation modal.** Reuses PRD-029's `ConfirmModal` pattern. The "reason" textarea is **always required** (minimum 10 characters after trimming). There is no admin setting to toggle this; the field is mandatory for every actor role.
- **Diff rendering.** Reuses the JSON diff renderer from PRD-066 (`features/metadata-editor/BulkEditDialog`) and PRD-125 (refinement diff). If that component does not expose a generic JSON diff mode yet, this PRD includes extracting it into `components/composite/JsonDiff.tsx`.
- **Tooltip / popover for baseline provenance.** `components/primitives/Popover.tsx` with a compact card: uploader avatar, filename, timestamp, size.
- **Undo-revert surface.** Two entry points, both provided by PRD-051: (1) the immediate post-revert toast snackbar with an "Undo" action (7 second timeout), which calls the same endpoint PRD-051 uses to step back one node in the undo tree; (2) the PRD-051 visual history browser, which lets the user step back to any earlier tree node including the `baseline_captured` root or any pre-revert node, for 30 days. PRD-167 adds no new UI for undo-revert beyond these.

## 9. Technical Considerations

### Existing Code to Reuse
| Component | Source | Usage |
|-----------|--------|-------|
| Workflow version history | `workflow_versions` (PRD-075) | Revert creates a new workflow version — no new version table needed |
| Metadata version history | `character_metadata_versions` (PRD-013, PRD-125) | Revert creates a new metadata version — `source='revert_to_baseline'` added to the CHECK constraint |
| Undo tree | `undo_trees` (PRD-051) | Baseline capture writes a `baseline_captured` root node; revert writes a `revert_to_baseline` child node. No schema change to `undo_trees`. |
| Undo-tree persistence | PRD-04 session persistence (via PRD-051) | 30-day undo-revert durability rides on the existing tree serialization path. |
| JSON diff | PRD-066 metadata import diff, PRD-125 LLM refinement diff | Shared in a new `components/composite/JsonDiff.tsx` |
| Audit logging | `audit_logs` (PRD-045) | Four new event types registered |
| Event bus | `EventBus` (PRD-010) | Emits `entity.reverted` and friends |
| Entity locks | `entity_locks` (PRD-011) | Revert respects locks |
| Import sessions | `import_sessions` (PRD-016) | Link `baseline_snapshots.import_session_id` for traceability |
| Reclamation engine | PRD-015 | Cleanup of legacy / orphaned baseline snapshots (not of undo-tree nodes; PRD-051 owns that GC) |

### New Infrastructure Needed
| Component | Location | Purpose |
|-----------|----------|---------|
| `baseline_snapshots` table | `apps/db/migrations/20260417000001_create_baseline_snapshots.sql` | Shared snapshot storage |
| `baseline_entity_types` lookup | `apps/db/migrations/20260417000002_seed_baseline_entity_types.sql` | Enabled entity types |
| `crates/core/src/baseline.rs` | Backend | Shared revert service, content hashing, diff support, undo-tree node emission |
| `crates/db/src/repositories/baseline_repo.rs` | Backend | CRUD for snapshots |
| `crates/api/src/handlers/baseline.rs` | Backend | Shared preview endpoint + per-entity revert handler glue |
| `crates/core/src/undo_tree/baseline_node_kinds.rs` | Backend | Constants for `action_type` values `baseline_captured` and `revert_to_baseline`, plus typed (de)serialization of their payloads. Contributed to the PRD-051 module so other PRDs can reuse. |
| `apps/frontend/src/components/composite/RevertToOriginalButton.tsx` | Frontend | Shared button + modal (required-reason textarea with 10-char validation) |
| `apps/frontend/src/hooks/useRevertToBaseline.ts` | Frontend | Shared hook (accepts entity config) |
| `apps/frontend/src/components/composite/JsonDiff.tsx` | Frontend | Extracted from existing diff UIs |

### Database Changes

Follows ID strategy (`BIGINT id`, `UUID uuid` where applicable) and soft-delete convention (`deleted_at`, not `revoked_at`).

1. New tables:
   - `baseline_snapshots` (see 1.1)
   - `baseline_entity_types` (lookup, see 1.2)
   - **No `speech_revert_archives` table.** Pre-revert speech state is stored as `action_payload` on the PRD-051 undo-tree node (`undo_trees.tree_json`). This is the main simplification from the PRD-051 unification.
2. Column additions:
   - `workflows.baseline_snapshot_id`
   - `characters.metadata_baseline_snapshot_id`
   - `characters.speech_baseline_snapshot_id`
3. CHECK constraint update:
   - `character_metadata_versions.source` CHECK extended to include `'revert_to_baseline'`.
4. Backfill migration:
   - For each workflow where `imported_from IS NOT NULL`, synthesize a baseline from `workflow_versions` version 1. Also seed a `baseline_captured` root node in `undo_trees` for the importing user if one does not already exist.
   - For each character with any `character_metadata_versions` row where `source IN ('csv_import','json_import')`, synthesize a baseline from the earliest such row and seed the undo-tree root.
   - For existing speech data with no import record (none today per PRD-124), no backfill — those characters simply get no baseline.

### Risks introduced by PRD-051 unification

| Risk | Mitigation |
|------|------------|
| **PRD-051 ships without the extension points PRD-167 requires.** PRD-STATUS.md lists PRD-051 as `done` (2026-02-22), but its current implementation has no action-type registry, no protected-node-types pruning mechanism, and no `external_mutation` node type. | PRD-167 cannot ship until a PRD-051 follow-up lands those four extension points. This must precede any PRD-167 work. BUILD-PLAN.md should be updated (not from within PRD-167) to reflect a PRD-051 re-opening. If schedule pressure forces PRD-167 earlier, a **stage-1-only** variant (baseline capture + diff preview + revert API) could ship without the undo-revert feature, returning an explicit "Undo is not yet available" message — but this violates Goal 3 and should be avoided. See §9 "Requirements PRD-167 imposes on PRD-051" for the enumerated list. |
| PRD-051's `undo_trees` is **per-user, per-entity**; the baseline is **per-entity, shared**. | Resolved (Q1): the baseline lives in `baseline_snapshots` (entity-level); the undo-tree node only references its id. Each user who touches the entity gets their own `baseline_captured` root pointing at the same shared baseline. Cross-user divergence is handled via `external_mutation` nodes injected into the viewer's tree (see Req 1.8). |
| PRD-051's **pruning policy is an open question** in that PRD (PRD-051 §11). If it defaults to aggressive pruning, `revert_to_baseline` or `baseline_captured` nodes could be collected before the 30-day window. | Resolved (Q4): PRD-051 must add a **protected-node-types mechanism** to its pruning algorithm. `baseline_captured` root nodes and their baseline-snapshot references are **immune to general tree pruning** — they survive any pruning pass indefinitely. `revert_to_baseline` nodes (and the pre-revert state embedded in their payload) are retained for 30 days independently and pruned thereafter. This is a hard requirement PRD-167 imposes on PRD-051 — see §9 "Requirements PRD-167 imposes on PRD-051" item (b). |
| PRD-051 defines undoable / non-undoable action categories. "Revert to baseline" crosses boundaries (it touches approval status in PRD-133 flows, which PRD-051 flags as "with confirmation"). | PRD-167 §1.7 requires an explicit confirmation modal plus a required reason, satisfying PRD-051's "with confirmation" requirement. |
| **Data size.** Speech pre-revert snapshots stored in `undo_trees.tree_json` could bloat the tree JSON. | Monitor via NFR; if a speech snapshot exceeds a threshold (say 256 KB), store it as a separate `baseline_snapshots` row with `entity_type='character_speech_pre_revert'` and reference it from the tree node. This is a performance optimization, not an architectural change. |
| **Action-type string sprawl.** If PRD-051 keeps action types as free-form strings in `tree_json`, new node kinds (`baseline_captured`, `revert_to_baseline`, `external_mutation`) cannot be discovered, validated, or reliably rendered by the visual history browser. | Resolved (Q2): PRD-051 owns the **action-type registry** (lookup table + typed payload schema). PRD-167 does NOT introduce its own registry; it registers its three action types through PRD-051's extension API. See §9 "Requirements PRD-167 imposes on PRD-051" item (a). |

### Requirements PRD-167 imposes on PRD-051

PRD-167 is the first consumer of PRD-051's undo tree beyond the original MVP. It requires four extension points that the current PRD-051 implementation does not provide. These must be designed, approved, and merged in a PRD-051 follow-up before PRD-167 implementation begins. They are called out here so the scope of the PRD-051 re-opening is unambiguous.

**(a) Action-type registry API.** PRD-051 must introduce a registry of action types (typed names plus payload schemas) so new consumers can plug in new node kinds without forking `tree_json` parsing. Concretely this means:
- A new lookup table (proposed name: `undo_action_types`) with columns `id`, `name`, `owning_prd`, `is_system`, `payload_schema_ref`, `renderer_hint`, `is_undoable`, `retention_days` (NULL = inherit general pruning).
- A Rust registration API in `crates/core/src/undo_tree/` that lets downstream PRDs call `register_action_type(spec)` at service startup.
- A frontend registry keyed by action-type name so the visual history browser can render node icons and payload previews generically.
- PRD-167 registers its three action types (`baseline_captured`, `revert_to_baseline`, `external_mutation`) through this API at startup.

**(b) Protected-node-types pruning mechanism.** PRD-051's pruning algorithm (yet to be implemented — PRD-051 §11 open question) must respect a "protected" flag per action-type. Specifically:
- `baseline_captured` root nodes are **immune to pruning indefinitely** — they and the baseline-snapshot references in their payload must survive every pruning pass.
- `revert_to_baseline` nodes follow a 30-day retention rule independently of PRD-051's general depth/age policy.
- The pruning algorithm must consult `undo_action_types.retention_days` (or an equivalent protected-list mechanism) before deleting any node.

**(c) `external_mutation` node type support.** PRD-051's tree model currently assumes every node was authored by the tree's owning user. PRD-167 introduces the scenario where user B's edits need to be reflected in user A's per-user tree as a system-generated marker. PRD-051 must:
- Accept node inserts with `action_type='external_mutation'` that are authored by the system on behalf of a non-owner mutation.
- Flag such nodes as non-undoable by the tree owner (they cannot roll back user B's edits through their own tree).
- Render them visually as a distinct "external" marker in the history browser.
- Ensure "jump to latest" navigation correctly anchors at these nodes when they are the current head.

**(d) Schema freeze before PRD-167 starts.** PRD-051's `undo_trees` table and the new action-type registry API (item a) must be frozen and merged before any PRD-167 work begins. If PRD-051's schema is still in flux during PRD-167 implementation, seeded baseline roots and `revert_to_baseline` nodes will break when the schema evolves. This is a scheduling constraint rather than a technical feature. Flag to the user: promote PRD-051 out of `backlog` (or re-open the already-`done` entry with a v1.1 amendment) in PRD-STATUS.md and reorder BUILD-PLAN.md so PRD-051's follow-up precedes PRD-167.

### API Changes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET`  | `/api/v1/{entity}/:id/baseline` | Return baseline snapshot summary + content |
| `GET`  | `/api/v1/{entity}/:id/revert-preview` | Return diff between current state and baseline |
| `POST` | `/api/v1/{entity}/:id/revert-to-baseline` | Apply the revert (creates new version + new undo-tree node) |
| `GET`  | `/api/v1/baselines/entity-types` | List enabled entity types |
| `POST` | `/api/v1/admin/baselines/:id/rebase` | Admin action to force-set baseline to an existing version (post-MVP gate: admin-only even in MVP) |

**No dedicated "undo revert" endpoint.** Undo-revert is served by the PRD-051 undo API (`PUT /user/undo-tree/:entity_type/:entity_id` with the target node id). PRD-167 simply exposes the same Undo button on the revert toast that the PRD-051 history browser exposes.

`{entity}` resolves to `workflows`, `characters/:id/metadata`, or `characters/:id/speeches` depending on entity.

## 10. Edge Cases & Error Handling

- **No baseline exists.** Button hidden; API returns 409 `"No baseline exists for this entity — it was not imported."`.
- **Entity locked by another user.** Button disabled with lock icon; API returns 423 Locked.
- **Current state equals baseline.** Preview returns empty diff; button disabled with tooltip "Already at baseline."
- **Concurrent revert.** Revert takes an entity lock for the duration; second concurrent revert waits or fails fast (configurable, default fail fast with 423).
- **Baseline content larger than 5 MB.** Import-time warning; still accepted but logs a `baseline.oversized_snapshot` metric.
- **Invalid JSON content after revert** (e.g. workflow baseline references a custom node that is no longer installed). Revert still succeeds — the downstream validation (PRD-075) surfaces the issue after revert, consistent with how fresh imports behave.
- **User deletes the entity.** `ON DELETE SET NULL` on the `baseline_snapshot_id` FK preserves the snapshot; orphan snapshots are surfaced in the admin cleanup tool (PRD-043 integrity tools).
- **User rapidly reverts and undoes.** Each revert and undo-revert creates a new version; no merging or compacting in MVP.
- **Re-import with identical hash.** No new baseline row (dedup via `content_hash`); audit log records `entity.baseline_confirmed` so the user still sees their re-import was noted.

## 11. Success Metrics

- **Adoption:** >30% of workflows and >50% of imported metadata records have a valid `baseline_snapshot_id` within one month of rollout (via backfill + forward capture).
- **Usage:** At least 5% of users trigger a revert per month across the MVP entities.
- **Safety:** Zero incidents of data loss attributable to revert — every revert should be traceable back to both the baseline and the pre-revert state.
- **Performance:** p95 revert apply latency <2s; p95 preview latency <500ms (matches NFR).
- **User confidence:** Post-feature survey — users report they feel "safe experimenting with edits" with >70% agreement.

## 12. Testing Requirements

- **Unit tests (Rust):** baseline service (hash computation, dedup, revert apply), at least 30 tests covering the three MVP entities.
- **Integration tests (Rust):** full import → edit → revert → undo-revert round trip for each MVP entity; lock conflicts; RBAC denials; dedup on identical re-import.
- **Frontend unit tests:** RevertToOriginalButton states (hidden / disabled / enabled / loading), JsonDiff rendering of add/modify/remove cases, modal confirmation flow including required reason.
- **Frontend integration test:** revert flow end-to-end via MSW, including optimistic UI + rollback on API failure.
- **Migration tests:** backfill produces correct baseline pointers for seeded fixtures; rollback migration cleanly drops added columns.
- **DRY-GUY audit:** after implementation, run `dry-guy` to confirm the shared `baseline.rs` core module is used by all three MVP entity handlers and that no per-entity revert code diverged.

## 13. Open Questions

*Resolved in v1.1 (2026-04-17):*
- *V1 scope = workflows, character metadata, character speech. Confirmed.*
- *Re-import default = always prompt, no admin-configurable skip. Confirmed.*
- *Reason textarea = required for all actors, min 10 characters. Confirmed.*
- *Undo-revert retention = 30 days, locked v1 value, not admin-configurable. Confirmed.*
- *Relationship to PRD-051 = unified in v1 via undo-tree node kinds `baseline_captured` and `revert_to_baseline`.*

*Decisions worth flagging in the PRD:*
- **Reason min-length = 10 characters.** Chosen as a pragmatic middle ground: long enough to discourage "oops", "test", or single-word placeholders; short enough to not block quick legitimate reverts like "wrong file uploaded". Reviewable in first-month metrics — if >20% of reasons cluster at exactly the 10-char boundary, revisit.

*Still open:*

1. **Who sees the Revert button?** Recommendation: `creator` and `admin`. Should `reviewer` see it too (given they can reject metadata versions via PRD-133)?
2. **Single vs multi-baseline per entity.** Recommendation: **single baseline per entity** (the latest import). Multi-baseline ("revert to any historical upload") is post-MVP Req 2.4. Flag: do studio workflows demand "revert to the January upload, not March"?
3. **CHECK constraint vs lookup for `source='revert_to_baseline'`.** Extending the CHECK constraint on `character_metadata_versions.source` is slightly redundant with the lookup-table pattern we use elsewhere. Should this PRD also migrate `source` into a lookup table as a side-effect? (Scope creep risk — recommendation: defer to a dedicated refactor.)

*Resolved in v1.2 (2026-04-17):*
- *Cross-user tree semantics — resolved (Q1): per-user undo trees with entity-level baseline; cross-user divergence represented by system-generated `external_mutation` nodes inserted into the viewer's tree at their current head. Existing branches are preserved. See Req 1.8.*
- *Action-type registry location — resolved (Q2): registry lives in PRD-051 as the foundational undo system. PRD-167 registers its three action types (`baseline_captured`, `revert_to_baseline`, `external_mutation`) through PRD-051's extension API. See §9 "Requirements PRD-167 imposes on PRD-051" item (a).*
- *PRD-051 schema freeze ordering — resolved (Q3): PRD-051's `undo_trees` schema and action-type registry API must be frozen and merged before any PRD-167 work begins. This is flagged as a scheduling constraint in §2 Dependencies and §9 item (d). BUILD-PLAN.md reordering is deferred to the user rather than edited from within PRD-167.*
- *Pruning-policy compatibility — resolved (Q4): baseline-related nodes are immune to general pruning. `baseline_captured` roots survive indefinitely; `revert_to_baseline` nodes follow a 30-day rule independently. PRD-051's pruning algorithm must gain a protected-node-types mechanism. See §9 item (b).*

## 14. Version History

- **v1.0** (2026-04-17): Initial PRD creation. MVP scoped to workflows, character metadata, character speech. Introduces shared `baseline_snapshots` table and `core::baseline` service primitive. Revert is non-destructive (creates a new version) and itself undoable via pre-revert archives retained for 30 days.
- **v1.1** (2026-04-17): Unified with PRD-051 undo-tree architecture. Replaced the proposed `speech_revert_archives` table with `undo_trees` node payloads. Re-import always prompts (no admin-configurable default). Reason textarea required for all actors (10-char minimum). 30-day undo-revert retention locked as v1 value (not admin-configurable). Removed `/revert-undone` endpoint in favour of the existing PRD-051 undo API. Added `baseline_captured` and `revert_to_baseline` undo-tree node kinds. PRD-051 promoted to hard dependency. Added risk table for the unification. Five resolved open questions removed; four new ones added regarding cross-user tree semantics, action-type registry, schema-freeze ordering, and pruning-policy compatibility.
- **v1.2** (2026-04-17): Resolved the four remaining open questions. (Q1) Cross-user semantics: per-user undo trees with entity-level baseline; divergence is surfaced via a new system-generated `external_mutation` node type inserted into the viewer's tree, preserving branches. (Q2) Action-type registry lives in PRD-051 (not PRD-167); PRD-167 registers its three action types through PRD-051's extension API. (Q3) PRD-051 schema and registry API must be frozen before PRD-167 starts — documented as a scheduling constraint, BUILD-PLAN changes deferred to the user. (Q4) Baseline-related nodes immune to general pruning: `baseline_captured` roots survive indefinitely, `revert_to_baseline` nodes follow a 30-day rule; PRD-051's pruning algorithm must gain a protected-node-types mechanism. Added new §9 subsection "Requirements PRD-167 imposes on PRD-051" enumerating the four extension points (registry API, protected-node-types, `external_mutation` node kind, schema freeze). Updated §2 Dependencies to note PRD-051 is `done` in PRD-STATUS.md but still requires a follow-up to deliver these extension points. Updated §1.8 acceptance criteria to reference the new cross-user scenario. Updated risks table.

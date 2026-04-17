# ADR-002: Consolidate Clip-Filter WHERE Clause

- **Date:** 2026-04-17
- **Status:** Accepted
- **PRD / Bug:** PRD-169 (transcode surface state) — post-release DRY audit
- **Related:** ADR-001 (row-mapper), PRD-151 (bulk export)

## Context

The filter predicate used to browse `scene_video_versions` with avatar /
scene / project context is duplicated across three sites:

1. `handlers::scene_video_version::browse_clips` — browse endpoint.
2. `handlers::scene_video_version::bulk_update_clip_status` — bulk approve /
   reject (already calls a local `clip_browse_where_clause()` helper).
3. `handlers::export::resolve_ids_from_filters` — the `scene_video_version`
   branch copy-pastes the same FROM + WHERE shape to resolve IDs for export.

Any filter change (e.g. "filter by track", "exclude tags", "hide disabled
avatars") must be applied in all three sites or behavior drifts between
browse, bulk actions, and export. The existing `clip_browse_where_clause()`
helper is private to the handler file; export can't reuse it.

## Decision

Move the shared WHERE clause into the db crate as a public helper colocated
with the repo that owns the entity:

- Location: `crates/db/src/repositories/scene_video_version_repo.rs` as a
  module-private `CLIP_BROWSE_WHERE` string constant plus a public
  `clip_browse_where_clause()` accessor. The repo already owns the
  canonical `COLUMNS` list; the filter WHERE is the matching predicate.
- The new `SceneVideoVersionRepo::list_with_context()` method (ADR-001)
  consumes this constant.
- `export.rs`'s `scene_video_version` branch binds the same positional
  parameters and composes the same WHERE. The bulk-action helper likewise
  calls the public function instead of maintaining its own copy.

No new crate, no new module — the predicate is a piece of data the repo
owns.

## Consequences

**Positive**

- One WHERE to maintain. Adding a new filter (e.g. a
  `created_since` cutoff) appears in browse, export, and bulk actions
  atomically.
- Bind-order contract is documented alongside the repo, where future
  maintainers look first.

**Negative / Trade-offs**

- Positional bind-order is an implicit contract: `$1 = project_id`,
  `$2 = pipeline_id`, …, `$12 = parent_version_id`. Callers must bind in
  the exact order. Mitigation: colocate the `BIND_ORDER_DOC` comment in
  the constant so the contract is unmissable at the call site.
- Export uses a subset of the filter (it does not need `has_parent` or
  `parent_version_id`). It still binds them as `NULL` / `false`. Trivial
  cost; symmetric predicate wins.

**Migration**

- Ship together with ADR-001 (same files, same commit).
- `export.rs` stops duplicating the predicate; its output changes nothing
  observable — it still returns the same SVV IDs for the same filters.

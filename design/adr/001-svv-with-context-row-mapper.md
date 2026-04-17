# ADR-001: Shared `SceneVideoVersionWithContext` Row-Mapper

- **Date:** 2026-04-17
- **Status:** Accepted
- **PRD / Bug:** PRD-169 (transcode surface state) — post-release DRY audit
- **Related:** ADR-002 (shared WHERE clause), DRY-820 (DRY-TRACKER), DEVELOPER_RULES §3.2

## Context

Two API handlers — `browse_clips` (`GET /scene-video-versions/browse`) and
`list_derived_clips` (`GET /avatars/{id}/derived-clips`) — hand-roll `SELECT`
statements against `scene_video_versions`, joining avatar/scene/track/project
context. The canonical `SceneVideoVersion` column list lives in
`SceneVideoVersionRepo::COLUMNS`.

PRD-169 added a `transcode_state` column to `scene_video_versions`. The repo's
`COLUMNS` constant was updated, so all repo-based reads picked it up. Both
hand-rolled handler SELECTs silently dropped the new column, causing the
frontend to render every clip as "Processing" across the entire browse
library. A second latent instance was discovered in `list_derived_clips` and
patched.

Each handler also owns a parallel row struct (`ClipBrowseItem`,
`DerivedClipItem`) whose field list must stay in lockstep with the SELECT
column order — a second drift axis.

## Decision

Introduce a single `SceneVideoVersionWithContext` struct in
`crates/db/src/models/scene_video_version.rs` that:

1. Flattens the full `SceneVideoVersion` using `#[sqlx(flatten)]` so any
   future column added to the table automatically flows through.
2. Appends the avatar/scene/track/project context fields (`avatar_id`,
   `avatar_name`, `avatar_is_enabled`, `scene_type_name`, `track_name`,
   `project_id`, `project_name`, `parent_version_number`).
3. Includes the transcode-job enrichment fields (`transcode_error`,
   `transcode_started_at`, `transcode_attempts`, `transcode_job_id`) so a
   single SELECT satisfies everything the frontend needs — no post-query
   `enrich_with_transcode_fields` round trip.

A new repo method `SceneVideoVersionRepo::list_with_context(pool, filters)`
owns the SELECT. It composes `Self::COLUMNS` for the SVV portion of the
query, so adding a column to `scene_video_versions` automatically appears in
every context-aware list endpoint.

Both `browse_clips` and `list_derived_clips` are refactored to call
`list_with_context`. The hand-rolled SELECTs and the `ClipBrowseItem` /
`DerivedClipItem` row structs are deleted.

## Consequences

**Positive**

- Single source of truth for "SVV + context" reads. Adding a column to
  `scene_video_versions` requires one change (the `COLUMNS` constant), and
  every consumer picks it up.
- Row-struct drift between backend and frontend is eliminated for list
  endpoints.
- The PRD-169 bug class is closed structurally, not just patched.
- One SELECT per page fetch (vs. SELECT + enrichment round trip), lowering
  latency for browse pages.

**Negative / Trade-offs**

- `#[sqlx(flatten)]` requires column-name uniqueness between the flattened
  struct and the joined context columns. We already prefix context columns
  distinctly (`avatar_id`, `scene_type_name`, etc.), so no collision exists
  today. New context fields must avoid `SceneVideoVersion`'s names.
- The struct couples the wire format of two endpoints. If one endpoint
  needs a narrower shape, we either subset in the serializer or split
  structs. Treated as follow-up work, not blocker.

**Migration**

- Frontend response shape: the JSON payload has the same flat field layout
  the hand-typed interfaces expected (`#[sqlx(flatten)]` produces flat JSON
  because the inner struct is `#[serde(flatten)]`-equivalent for
  serialization). Hand-typed frontend interfaces are replaced by generated
  types per ADR-003.

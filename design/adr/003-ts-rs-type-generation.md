# ADR-003: Adopt `ts-rs` for Backend → Frontend Type Generation

- **Date:** 2026-04-17
- **Status:** Accepted
- **PRD / Bug:** PRD-169 (transcode surface state) — post-release DRY audit
- **Related:** ADR-001, ADR-002, DEVELOPER_RULES §3.2 ("Schema drift"),
  DRY-TRACKER §11 "Schema drift — hand-typed TypeScript interface mirroring
  a backend struct, kept in sync manually"

## Context

The PRD-169 "transcode_state" bug had two root causes. The backend drift
(hand-rolled SELECT vs. repo `COLUMNS`) is addressed by ADR-001 and
ADR-002. The deeper cause is structural: the frontend owns hand-typed
TypeScript interfaces (`ClipBrowseItem`, `DerivedClipItem`) that mirror
backend response shapes. Every new backend field requires a manual TS edit.
If the manual edit lags or disagrees with the wire format, the frontend
silently renders stale or wrong data.

DEVELOPER_RULES §3.2 forbids hand-transcribed DTOs. The project ships ~120
PRDs' worth of hand-typed frontend interfaces. PRD-169 is the second time
in the last quarter that schema drift shipped to users.

## Decision

Adopt `ts-rs` (crates.io) for Rust → TypeScript type generation:

- **Library:** `ts-rs = "10"` with features `chrono-impl` and
  `serde-json-impl`. Added as a dependency to the two crates that own
  wire-format structs today: `crates/db` (models) and `crates/api`
  (handlers / response wrappers).
- **Annotation:** Rust structs that cross the HTTP boundary are annotated
  with `#[derive(TS)]` and `#[ts(export, export_to = "../../apps/frontend/src/generated/")]`.
- **Generation:** `ts-rs` generates `.ts` files at `cargo test` time (its
  default mechanism). The generator is invoked by running
  `cargo test --workspace export_bindings` (ts-rs emits per-struct test
  functions that do the export). A workspace-level wrapper command is
  added to `design/CONVENTIONS.md`.
- **CI gate:** a job runs the generator and asserts
  `git diff --exit-code apps/frontend/src/generated/`. If a PR changes a
  Rust wire struct without regenerating, CI fails.
- **Scope of this PR:** SVV-related types only, as proof of concept:
  `SceneVideoVersion`, `SceneVideoVersionWithContext`, `TranscodeJob`,
  the paginated response wrappers, and the filter request struct. Other
  wire structs remain hand-typed and are migrated in follow-up PRs as
  they are touched.
- **Frontend import path:** `apps/frontend/src/generated/*.ts` with the
  `@/generated/*` alias already available via `tsconfig.json` /
  `vite.config.ts` (verified during implementation).

### Tool choice

- **`ts-rs` over `specta`:** ts-rs is more mature, simpler to integrate
  (generation via `cargo test`, no separate binary), and has wider adoption
  in sqlx-backed projects. `specta` is attractive for richer type
  support but overkill for our needs.
- **`ts-rs` over `openapi-typescript`:** the project has no central OpenAPI
  spec (confirmed during PRD-169 implementation). Generating one would
  require annotating every handler — a larger effort than annotating the
  ~10 wire structs needed right now.

## Consequences

**Positive**

- Schema drift between backend and frontend becomes a compile/CI failure
  rather than a runtime silent miss.
- New backend fields appear in frontend types automatically on regenerate.
- DEVELOPER_RULES §3.2 becomes enforceable for the annotated structs.

**Negative / Trade-offs**

- `ts-rs` generates TS with its own idioms (e.g. `bigint` for `i64`).
  Our project uses `number` for DB IDs (`DbId = i64`). We override via
  `#[ts(type = "number")]` on the relevant fields — verified workable in
  ts-rs 10.
- Generated files are committed to git (SSoT for the frontend build). CI
  drift check is what enforces that humans don't edit them.
- Partial rollout: until every wire struct is annotated, some interfaces
  remain hand-typed. During migration, the two worlds coexist. Follow-up
  PRs phase more structs in.
- Adds a small build-time cost (cargo test runs export functions). Trivial
  in practice; already covered by existing CI `cargo test` runs.

**Migration**

- Phase 3 of the DRY follow-up (this PR) adds the annotations and replaces
  `ClipBrowseItem` / `DerivedClipItem` / `ClipBrowsePage` / `DerivedClipsPage`
  hand-typed interfaces with generated ones.
- Future PRs that add a new wire struct MUST annotate it with
  `#[derive(TS)] #[ts(export)]`. Hand-typed frontend interfaces for new
  wire structs are forbidden post-merge; CI drift check enforces this for
  annotated structs.
- A dedicated follow-up PR sweeps remaining hand-typed interfaces.

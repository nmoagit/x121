# X121 Platform — Build Plan

Optimal build order for all 135 PRDs, organized into dependency-ordered phases.
Each phase can begin only after all prior phases are complete. PRDs within a phase
can be built **in parallel** (dependencies are satisfied by earlier phases).

> **136 PRDs complete as of 2026-03-18.** All committed PRDs implemented. 15 MAYBEs remain on the evaluation list.

> **Source of truth:** Cross-Reference Map in [`design/design.md`](../design.md) (Appendix)
> **Status tracking:** [`PRD-STATUS.md`](./PRD-STATUS.md)

---

## How to Read This Plan

- **Phase** = a set of PRDs whose dependencies are fully satisfied by earlier phases
- **Track** = a parallel workstream within a phase (Backend / Frontend / Data / Pipeline)
- PRDs listed within a track have no inter-dependencies and can be built simultaneously
- Estimated effort is relative (S/M/L/XL) not calendar time
- The plan covers 133 confirmed PRDs. The 15 "MAYBE" items (M-01 through M-15) are excluded

## Mandatory Quality Gate: dry-guy

**The `dry-guy` agent MUST be run after every significant code change.** No exceptions.

This applies at every level:
- **Per task:** After completing any task that writes/modifies code, run dry-guy before proceeding
- **Per phase:** Before the phase-end commit, run a final dry-guy audit across all files changed in the phase
- **Cross-PRD:** When starting a new PRD, run dry-guy against recently completed PRDs to catch cross-module duplication

All findings must be logged in [`DRY-TRACKER.md`](./DRY-TRACKER.md). Flagged duplication must be resolved before merging.

---

## Phase -1 — Pre-Implementation Scaffolding

**Goal:** Working dev environment, repo structure, CI, and all tooling ready so Phase 0 PRDs can land cleanly.
**Milestone:** `cargo check` passes, frontend dev server starts, test DB connects, CI runs green on empty project.

This phase contains no PRD work — only structural setup.

### Step 1: Dev Environment

| Task | Details |
|------|---------|
| Install pnpm | Frontend package manager (`npm i -g pnpm`) |
| Install sqlx-cli | Migration tool (`cargo install sqlx-cli --features postgres`) |
| Docker Compose | PostgreSQL 16 + pgvector, Redis (optional for later) |
| `.env` template | `DATABASE_URL`, `COMFYUI_WS_URL`, `STORAGE_ROOT`, `JWT_SECRET`, `RUST_LOG` |
| Verify toolchain | Rust edition 2024, Node 22+, pnpm 9+ |

### Step 2: Rust Workspace

| Task | Details |
|------|---------|
| Root `Cargo.toml` | Workspace members: `crates/*` |
| `rust-toolchain.toml` | Pin Rust channel and edition |
| `.cargo/config.toml` | Build settings, linker config |
| `crates/core/` | Stub lib crate — `DbId`, `Timestamp`, `CoreError` types |
| `crates/db/` | Stub lib crate — `DbPool` type alias, empty migration runner |
| `crates/api/` | Stub binary — Axum server that starts and serves `/health` |
| `crates/events/` | Stub lib crate — event types skeleton |
| `crates/comfyui/` | Stub lib crate — client skeleton |
| `crates/pipeline/` | Stub lib crate — pipeline types skeleton |
| `crates/worker/` | Stub binary — worker entrypoint skeleton |
| Verify | `cargo check` passes across all crates |

### Step 3: Frontend Workspace

| Task | Details |
|------|---------|
| `pnpm-workspace.yaml` | Define `web/` as workspace |
| `web/package.json` | React 19, Vite 6, TypeScript 5, Tailwind 4, TanStack Query/Router, Zustand, Zod |
| `web/vite.config.ts` | API proxy to backend, path aliases |
| `web/tsconfig.json` | Strict mode, `@/` path alias |
| `web/tailwind.config.ts` | Token-based theme using CSS custom properties |
| `web/src/tokens/` | Initial token files (colors, typography, spacing) |
| `web/src/main.tsx` | App shell with router + query provider |
| `web/src/components/` | Empty directory structure (primitives/, composite/, layout/, domain/) |
| `web/src/lib/api.ts` | API client wrapper (base URL, auth header, error handling) |
| Storybook | Basic Storybook config for design system development |
| Verify | `pnpm dev` starts, page renders |

### Step 4: Database

| Task | Details |
|------|---------|
| `migrations/` directory | At repo root |
| First migration | `000_init.sql` — `set_updated_at()` trigger function, pgvector extension |
| Test DB script | Script or docker command to create/reset test database |
| Verify | `sqlx migrate run` succeeds, `cargo sqlx prepare` works |

### Step 5: CI & Tooling

| Task | Details |
|------|---------|
| `.github/workflows/ci.yml` | Lint, typecheck, test for both Rust and frontend |
| `rustfmt.toml` | Rust formatting rules |
| `clippy.toml` | Clippy lint configuration |
| `.editorconfig` | Consistent editor settings |
| ESLint + Biome config | Frontend linting and formatting |
| Pre-commit hooks | `cargo fmt --check`, `cargo clippy`, `pnpm lint` |
| Verify | CI passes on scaffold commit |

### Step 6: Commit & Validate

| Task | Details |
|------|---------|
| Run dry-guy | Audit scaffold for any premature duplication |
| Update DRY-TRACKER.md | Log the audit |
| Commit | `chore: scaffold monorepo with Rust workspace and React frontend` |

---

## Phase 0 — Platform Skeleton ✅

**Goal:** Establish the three foundational pillars that everything else builds on.
**Milestone:** Database runs, Rust backend serves requests, Design System renders components.

| # | PRD | Title | Effort | Notes | Status |
|---|-----|-------|--------|-------|--------|
| 1 | PRD-00 | Database Normalization & Strict Integrity | M | 3NF schema, lookup tables, FK constraints. Must be first. | **DONE** |
| 2 | PRD-02 | Backend Foundation (Rust/Axum) | L | Axum, SQLx, Tokio. HTTP + WebSocket server shell. | **DONE** |
| 3 | PRD-29 | Design System & Shared Component Library | L | Token architecture, primitives, theme system, Storybook. | **DONE** |

**Parallel tracks:** PRD-00 + PRD-02 (backend team) || PRD-29 (frontend team)
**Dependencies satisfied:** None required.

---

## Phase 1 — Core Services & Playback ✅

**Goal:** Data model, ComfyUI bridge, event backbone, hardware monitoring, video player.
**Milestone:** Can store entities in DB, connect to ComfyUI, emit/subscribe events, play video.

| # | PRD | Title | Effort | Track | Depends On | Status |
|---|-----|-------|--------|-------|------------|--------|
| 4 | PRD-01 | Project, Character & Scene Data Model | L | Backend | PRD-00 | **DONE** |
| 5 | PRD-05 | ComfyUI WebSocket Bridge | M | Backend | PRD-02 | **DONE** |
| 6 | PRD-06 | Hardware Monitoring & Direct Control | M | Backend | PRD-02 | **DONE** |
| 7 | PRD-09 | Multi-Runtime Script Orchestrator | M | Backend | PRD-02 | **DONE** |
| 8 | PRD-10 | Event Bus & Notification System | M | Backend | PRD-02 | **DONE** |
| 9 | PRD-83 | Video Playback Engine & Codec Support | L | Frontend | PRD-29 | **DONE** |

**Parallel tracks:** PRD-01 (data) || PRD-05 + PRD-06 + PRD-09 + PRD-10 (infra) || PRD-83 (frontend)

---

## Phase 2 — Auth, Validation, Assets & UI Framework ✅

**Goal:** User auth, data validation, asset tracking, tags, and the UI shell components.
**Milestone:** Users can log in, data is validated on ingest, assets are tracked, UI layout works.

### Track A — Backend Core

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 10 | PRD-03 | User Identity & RBAC | M | PRD-01, PRD-02 | **DONE** |
| 11 | PRD-07 | Parallel Task Execution Engine | M | PRD-02, PRD-05 | **DONE** |
| 12 | PRD-14 | Data Validation & Import Integrity | M | PRD-00, PRD-01 | **DONE** |
| 13 | PRD-15 | Intelligent & Deferred Disk Reclamation | M | PRD-01 | **DONE** |
| 14 | PRD-17 | Asset Registry & Dependency Mapping | M | PRD-01 | **DONE** |
| 15 | PRD-22 | Source Image Quality Assurance | M | PRD-01 | **DONE** |
| 16 | PRD-47 | Tagging & Custom Labels | S | PRD-01 | **DONE** |
| 17 | PRD-109 | Scene Video Versioning, Import & Soft Delete | L | PRD-00, PRD-01, PRD-02 | **DONE** |
| 18 | PRD-111 | Scene Catalog & Track Management | M | PRD-00, PRD-01, PRD-02, PRD-29 | **DONE** |
| 19 | PRD-113 | Character Ingest Pipeline | L | PRD-00, PRD-01, PRD-02, PRD-14 | **DONE** |
| 20 | PRD-116 | Dynamic File & Entity Naming Engine | M | PRD-01, PRD-02, PRD-29 | **DONE** |

### Track B — UI Framework & Shell

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 17 | PRD-30 | Modular Layout & Panel Management | M | PRD-29 | **DONE** |
| 18 | PRD-32 | Progressive Disclosure & UX Intelligence | S | PRD-29 | **DONE** |
| 19 | PRD-36 | Cinema Mode & Sync-Play Grid | M | PRD-29 | **DONE** |
| 20 | PRD-37 | QA Visual Aids (Ghosting, ROI, Jog Dial) | M | PRD-29, PRD-83 | **DONE** |
| 21 | PRD-52 | Keyboard Shortcut System & Presets | M | PRD-29 | **DONE** |
| 22 | PRD-110 | Admin Platform Settings Panel | M | PRD-00, PRD-02 | **DONE** |
| 23 | PRD-112 | Project Hub & Management | M | PRD-00, PRD-01, PRD-02, PRD-29 | **DONE** |
| 24 | PRD-117 | System Status Footer Bar | M | PRD-02, PRD-10, PRD-29 | **DONE** |

### Track C — Monitoring Dashboards

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 22 | PRD-41 | Performance & Benchmarking Dashboard | M | PRD-10 | **DONE** |
| 23 | PRD-42 | Studio Pulse Dashboard | M | PRD-10 | **DONE** |
| 24 | PRD-54 | Background Job Tray | S | PRD-10 | **DONE** |
| 25 | PRD-85 | UI Plugin / Extension Architecture | L | PRD-02, PRD-10, PRD-29 | **DONE** |
| 26 | PRD-118 | Live Activity Console & Logging System | L | PRD-02, PRD-10, PRD-29 | **DONE** |

---

## Phase 3 — Workspace, Jobs, API & Data Management ✅

**Goal:** Session persistence, job queue, API layer, collaboration, search, image pipeline entry point.
**Milestone:** Jobs can be queued and scheduled, API is accessible, search works, images can be managed.

### Track A — Backend Services

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 26 | PRD-04 | Session & Workspace Persistence | M | PRD-01, PRD-03 | **DONE** |
| 27 | PRD-08 | Queue Management & Job Scheduling | L | PRD-07 | **DONE** |
| 28 | PRD-11 | Real-time Collaboration Layer | M | PRD-02, PRD-03, PRD-10 | **DONE** |
| 29 | PRD-12 | External API & Webhooks | L | PRD-02, PRD-03 | **DONE** |
| 30 | PRD-28 | Pipeline Error Recovery & Checkpointing | M | PRD-07 | **DONE** |
| 31 | PRD-45 | Audit Logging & Compliance | M | PRD-01, PRD-03 | **DONE** |

### Track B — Data & Storage

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 32 | PRD-13 | Dual-Metadata System (JSON) | M | PRD-01, PRD-14 | **DONE** |
| 33 | PRD-16 | Folder-to-Entity Bulk Importer | M | PRD-01, PRD-14 | **DONE** |
| 34 | PRD-20 | Search & Discovery Engine | L | PRD-00, PRD-01, PRD-47 | **DONE** |
| 35 | PRD-21 | Source Image Management & Variant Generation | L | PRD-01, PRD-22 | **DONE** |
| 36 | PRD-66 | Character Metadata Editor | M | PRD-01, PRD-14 | **DONE** |

### Track C — UI

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 37 | PRD-33 | Node-Based Workflow Canvas | L | PRD-29, PRD-05 | **DONE** |
| 38 | PRD-35 | One-Key Approval & Finalization Flow | M | PRD-03, PRD-83 | **DONE** |
| 39 | PRD-44 | Bug Reporting & App Config Export | S | PRD-02, PRD-29 | **DONE** |
| 40 | PRD-53 | First-Run Experience & Onboarding | M | PRD-03, PRD-42 | **DONE** |

---

## Phase 4 — Scene Config, Workers, Embeddings & Collaboration ✅

**Goal:** Scene types defined, worker pool managed, character embeddings, review collaboration.
**Milestone:** Scene types can be configured, workers registered, faces embedded, reviews threaded.

### Track A — Generation Infrastructure

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 41 | PRD-23 | Scene Type Configuration | L | PRD-01, PRD-17, PRD-21 | **DONE** |
| 42 | PRD-46 | Worker Pool Management | L | PRD-02, PRD-07, PRD-08 | **DONE** |
| 43 | PRD-76 | Character Identity Embedding | M | PRD-01, PRD-20, PRD-22 | **DONE** |

### Track B — Data & Storage

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 44 | PRD-48 | External & Tiered Storage | M | PRD-15 | **DONE** |
| 45 | PRD-51 | Undo/Redo Architecture | L | PRD-04, PRD-47 | **DONE** |
| 46 | PRD-60 | Character Library (Cross-Project) | L | PRD-01, PRD-03, PRD-20, PRD-21 | **DONE** |

### Track C — UI & Review

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 47 | PRD-31 | Command Palette & Navigation (Cmd+K) | M | PRD-20, PRD-52 | **DONE** |
| 48 | PRD-34 | Interactive Debugger (Mid-Run Control) | M | PRD-05, PRD-33 | **DONE** |
| 49 | PRD-38 | Collaborative Review (Notes, Memos, Issues) | M | PRD-10, PRD-11 | **DONE** |

---

## Phase 5 — Video Generation Core ✅

**Goal:** The actual video generation pipeline — recursive generation, quality gates, assembly.
**Milestone:** Can generate multi-segment videos, auto-QA runs, scenes assembled for delivery.

### Track A — Pipeline

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 50 | PRD-24 | Recursive Video Generation Loop | XL | PRD-05, PRD-07, PRD-21, PRD-23, PRD-28 | **DONE** |
| 51 | PRD-27 | Template & Preset System | M | PRD-23, PRD-33 | **DONE** |

### Track B — Post-Generation

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 52 | PRD-39 | Scene Assembler & Delivery Packaging | L | PRD-01, PRD-24, PRD-35 | **DONE** |
| 53 | PRD-49 | Automated Quality Gates | L | PRD-24, PRD-28, PRD-10 | **DONE** |

### Track C — Supporting Features

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 54 | PRD-43 | System Integrity & Repair Tools | M | PRD-17, PRD-46 | **DONE** |
| 55 | PRD-56 | Studio Wiki & Contextual Help | M | PRD-20, PRD-42 | **DONE** |
| 56 | PRD-79 | Character Duplicate Detection | M | PRD-01, PRD-20, PRD-76 | **DONE** |
| 57 | PRD-104 | Model & LoRA Download Manager | M | PRD-17, PRD-46 | **DONE** |
| 58 | PRD-114 | Cloud GPU Provider Integration (RunPod) | XL | PRD-02, PRD-05, PRD-07, PRD-08, PRD-46 | **DONE** |

**Critical path:** PRD-24 (Generation Loop) is the highest-risk, highest-effort item in the entire project. Consider starting a spike/prototype in Phase 4.

---

## Phase 6 — Production at Scale ✅

**Goal:** Batch orchestration, scene previews, cost estimation, multi-resolution, storyboards.
**Milestone:** Can run full production batches, estimate costs, preview cheaply, review storyboards.

### Track A — Orchestration

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 58 | PRD-57 | Batch Production Orchestrator | XL | PRD-01, PRD-08, PRD-10, PRD-21, PRD-23, PRD-24, PRD-35, PRD-39, PRD-42, PRD-46 | **DONE** |
| 59 | PRD-25 | Incremental Re-stitching & Smoothing | M | PRD-24 | **DONE** |
| 60 | PRD-26 | Temporal Continuity (Normalization & Sync) | M | PRD-24, PRD-76 | **DONE** |

### Track B — Efficiency

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 61 | PRD-58 | Scene Preview & Quick Test | M | PRD-21, PRD-23, PRD-24, PRD-36 | **DONE** |
| 62 | PRD-59 | Multi-Resolution Pipeline | M | PRD-24, PRD-36, PRD-39 | **DONE** |
| 63 | PRD-61 | Cost & Resource Estimation | M | PRD-08, PRD-41, PRD-46, PRD-57 | **DONE** |

### Track C — Visual Review

| # | PRD | Title | Effort | Depends On | Status |
|---|-----|-------|--------|------------|--------|
| 64 | PRD-62 | Storyboard View & Scene Thumbnails | M | PRD-24, PRD-36, PRD-57 | **DONE** |
| 65 | PRD-69 | Generation Provenance & Asset Versioning | M | PRD-01, PRD-17, PRD-21, PRD-24 | **DONE** |
| 66 | PRD-78 | Segment Trimming & Frame-Level Editing | M | PRD-24, PRD-35 | **DONE** |

---

## Phase 7 — Advanced Pipeline & Workflow Tools ✅

**Goal:** Workflow import/validation, pipeline hooks, prompt editing, project templates.
**Milestone:** Workflows are validated before use, hooks extend the pipeline, prompts are versioned.

| # | PRD | Title | Effort | Track | Depends On | Status |
|---|-----|-------|--------|-------|------------|--------|
| 67 | PRD-63 | Prompt Editor & Versioning | M | Frontend | PRD-23, PRD-58 | **DONE** |
| 68 | PRD-75 | ComfyUI Workflow Import & Validation | L | Backend | PRD-17, PRD-23, PRD-43, PRD-46 | **DONE** |
| 69 | PRD-77 | Pipeline Stage Hooks (Custom Scripts) | M | Backend | PRD-09, PRD-10, PRD-75 | **DONE** |
| 70 | PRD-74 | Project Configuration Templates | M | Backend | PRD-23, PRD-27 | **DONE** |
| 71 | PRD-64 | Failure Pattern Tracking & Insights | M | Data | PRD-17, PRD-41, PRD-49 | **DONE** |
| 72 | PRD-50 | Content Branching & Exploration | L | Backend | PRD-01, PRD-15, PRD-36 | **DONE** |
| 73 | PRD-70 | On-Frame Annotation & Markup | M | Frontend | PRD-38, PRD-29 | **DONE** |
| 74 | PRD-95 | Production Notes & Internal Comments | M | Frontend | PRD-10, PRD-20, PRD-38 | **DONE** |
| 75 | PRD-115 | Generation Strategy & Workflow Prompt Management | L | Full-Stack | PRD-23, PRD-24, PRD-63, PRD-75 | **DONE** 2026-02-28 |

---

## Phase 8 — Onboarding, Bulk Ops & Character Dashboards ✅

**Goal:** Bulk character workflows, batch metadata, character readiness views.
**Milestone:** Can onboard characters in bulk via CSV, see readiness state, manage metadata at scale.

| # | PRD | Title | Effort | Track | Depends On | Status |
|---|-----|-------|--------|-------|------------|--------|
| 75 | PRD-67 | Bulk Character Onboarding Wizard | L | Frontend | PRD-21, PRD-22, PRD-23, PRD-46, PRD-57, PRD-60, PRD-61, PRD-66 | **DONE** |
| 76 | PRD-88 | Batch Metadata Operations | M | Backend | PRD-45, PRD-51, PRD-60, PRD-66 | **DONE** |
| 77 | PRD-86 | Legacy Data Import & Migration Toolkit | L | Backend | PRD-01, PRD-60, PRD-66, PRD-76, PRD-79 | **DONE** |
| 78 | PRD-107 | Character Readiness & State View | M | Frontend | PRD-01, PRD-60 | **DONE** |
| 79 | PRD-108 | Character Settings Dashboard | M | Frontend | PRD-01, PRD-60, PRD-107 | **DONE** |
| 80 | PRD-18 | Bulk Data Maintenance (Search/Replace/Re-path) | M | Backend | PRD-01, PRD-20 | **DONE** |
| 81 | PRD-124 | Speech & TTS Repository | M | Full-Stack | PRD-00, PRD-01, PRD-29, PRD-112 | **DONE** |
| 125 | PRD-125 | LLM-Driven Metadata Refinement Pipeline | L | Full-Stack | PRD-009, PRD-013, PRD-014, PRD-066, PRD-113 | **DONE** |

---

## Phase 9 — Advanced Review & Comparison ✅

**Goal:** Cross-character comparison, batch review, scene type QA, smart retry.
**Milestone:** Can compare scenes across characters, review in bulk, auto-retry failures.

### Track A — Quality & Retry

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 81 | PRD-71 | Smart Auto-Retry | M | PRD-23, PRD-49, PRD-61, PRD-64, PRD-69 | **DONE** 2026-02-28 |
| 82 | PRD-91 | Custom QA Rulesets per Scene Type | M | PRD-23, PRD-49, PRD-77 | **DONE** 2026-02-28 |
| 83 | PRD-100 | Scene Type Inheritance & Composition | M | PRD-23 | **DONE** 2026-02-28 |

### Track B — Review UI

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 84 | PRD-68 | Cross-Character Scene Comparison | M | PRD-23, PRD-35, PRD-36, PRD-57, PRD-62 | **DONE** 2026-02-28 |
| 85 | PRD-96 | Poster Frame & Thumbnail Selection | M | PRD-49, PRD-60, PRD-83 | **DONE** 2026-02-28 |
| 86 | PRD-101 | Segment Regeneration Comparison | M | PRD-35, PRD-49, PRD-50, PRD-83 | **DONE** 2026-02-28 |
| 87 | PRD-82 | Content Sensitivity Controls | M | PRD-29, PRD-35, PRD-39, PRD-52 | **DONE** 2026-02-28 |

### Track C — Workflow Testing

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 88 | PRD-65 | Workflow Regression Testing | L | PRD-23, PRD-27, PRD-36, PRD-49, PRD-59, PRD-63, PRD-08 | **DONE** 2026-02-28 |

---

## Phase 10 — Reporting, Delivery & Lifecycle ✅

**Goal:** Production reports, compliance checks, project lifecycle, external sharing.
**Milestone:** Full production reporting, compliant delivery packages, projects can be archived.

### Track A — Reporting

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 89 | PRD-73 | Production Reporting & Data Export | L | PRD-12, PRD-41, PRD-42, PRD-49, PRD-61 | DONE |
| 90 | PRD-94 | Character Consistency Report | M | PRD-49, PRD-68, PRD-76, PRD-91 | DONE |
| 91 | PRD-103 | Character Face Contact Sheet | M | PRD-49, PRD-76, PRD-94, PRD-96 | DONE |

### Track B — Delivery & Compliance

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 92 | PRD-102 | Video Compliance Checker | M | PRD-01, PRD-23, PRD-39, PRD-59 | DONE |
| 93 | PRD-40 | VFX Sidecar & Dataset Export | M | PRD-39, PRD-13 | DONE |
| 94 | PRD-84 | External Review / Shareable Preview Links | M | PRD-38, PRD-39, PRD-83 | DONE |

### Track C — Lifecycle

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 95 | PRD-72 | Project Lifecycle & Archival | M | PRD-01, PRD-15, PRD-39, PRD-45, PRD-48 | DONE |
| 96 | PRD-92 | Batch Review & Approval Workflows | M | PRD-35, PRD-49, PRD-52, PRD-91 | DONE |

---

## Phase 11 — Advanced Infrastructure & Admin ✅

**Goal:** GPU power management, budgets, advanced scheduling, system health, backups.
**Milestone:** GPU fleet is power-managed, budgets enforced, system health visible, backups automated.

### Track A — GPU & Scheduling

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 97 | PRD-87 | GPU Power Management & Idle Scheduling | M | PRD-08, PRD-46 | DONE |
| 98 | PRD-90 | Render Queue Timeline / Gantt View | M | PRD-08, PRD-46, PRD-61 | DONE |
| 99 | PRD-93 | Generation Budget & Quota Management | M | PRD-08, PRD-10, PRD-57, PRD-61, PRD-90 | DONE |
| 100 | PRD-97 | Job Dependency Chains & Triggered Workflows | M | PRD-08, PRD-10, PRD-12, PRD-45, PRD-57 | DONE |
| 101 | PRD-119 | Time-Based Job Scheduling | M | PRD-07, PRD-08, PRD-10, PRD-03 | DONE |

### Track B — Admin & Health

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 102 | PRD-80 | System Health Page | M | PRD-05, PRD-06, PRD-10, PRD-12, PRD-17, PRD-46 | DONE |
| 103 | PRD-98 | Session Management & Active Users | M | PRD-03, PRD-10, PRD-11, PRD-45 | DONE |
| 104 | PRD-19 | Disk Space Visualizer (Treemap) | S | PRD-01, PRD-15 | DONE |

### Track C — Integration Testing

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 105 | PRD-99 | Webhook & Integration Testing Console | M | PRD-10, PRD-12, PRD-77 | DONE |
| 106 | PRD-106 | API Usage & Observability Dashboard | M | PRD-10, PRD-12, PRD-45 | DONE |

---

## Phase 12 — Polish, Recovery & Final Features ✅

**Goal:** Backup/DR, platform setup wizard, dashboard customization, mobile review, remaining polish.
**Milestone:** Platform is production-hardened with disaster recovery, setup wizard, and full UX polish.

| # | PRD | Title | Effort | Track | Depends On |
|---|-----|-------|--------|-------|------------|
| 107 | PRD-81 | Backup & Disaster Recovery | L | Admin | PRD-00, PRD-44, PRD-74, PRD-77, PRD-80 | DONE |
| 108 | PRD-55 | Director's View (Mobile/Tablet Review) | L | Frontend | PRD-03, PRD-29, PRD-35, PRD-36, PRD-38, PRD-52 | DONE |
| 109 | PRD-89 | Dashboard Widget Customization | M | Frontend | PRD-04, PRD-42, PRD-85 | DONE |
| 110 | PRD-105 | Platform Setup Wizard | M | Admin | PRD-03, PRD-05, PRD-46, PRD-80, PRD-81 | DONE |
| 126 | PRD-126 | Critical Bug Fixes & UX Polish | L | Full-Stack | PRD-112, PRD-113, PRD-108, PRD-109 (all done) |
| 127 | PRD-127 | ComfyUI Output Handling & Artifact Storage | M | Full-Stack | PRD-03, PRD-24, PRD-47, PRD-109 (all done) | **DONE** |
| 128 | PRD-128 | Character Readiness Indicators | S | Full-Stack | PRD-112, PRD-108 (all done) | **DONE** |
| 130 | PRD-130 | Unified Cloud & ComfyUI Orchestration | XL | Backend | PRD-02, PRD-05, PRD-114 (all done) | **DONE** |
| 131 | PRD-131 | Infrastructure Control Panel | L | Full-Stack | PRD-02, PRD-05, PRD-114, PRD-130 | **DONE** |
| 132 | PRD-132 | Queue Manager & Intelligent Job Allocation | L | Full-Stack | PRD-07, PRD-08, PRD-05, PRD-46 (all done) | **DONE** |
| 133 | PRD-133 | Metadata Version Approval | M | Full-Stack | PRD-00, PRD-01, PRD-112 (all done) | **DONE** |
| 134 | PRD-134 | Deferred / Scheduled Generation | L | Full-Stack | PRD-008, PRD-024, PRD-119, PRD-132 (all done) | **DONE** 2026-03-17 |
| 135 | PRD-135 | Character Creator | L | Full-Stack | PRD-112, PRD-113, PRD-066 (all done) | **DONE** 2026-03-17 |
| 136 | PRD-136 | Multilingual Speech & Deliverable System | XL | Full-Stack | PRD-124, PRD-112, PRD-128 (all done) | **DONE** 2026-03-18 |
| 137 | PRD-137 | Output Format Profile Management | M | Full-Stack | PRD-039, PRD-110, PRD-112 (all done) | **DONE** 2026-03-19 |

---

## Phase 13 — Multi-Pipeline Architecture ✅

**Goal:** Evolve from single x121 pipeline to multi-pipeline platform. Pipeline as top-level entity scoping all projects, tracks, workflows, scene types.
**Milestone:** y122 (Speaker) pipeline fully operational alongside existing x121 pipeline, dynamic seed validation, pipeline-scoped delivery.

| # | PRD | Title | Effort | Track | Depends On |
|---|-----|-------|--------|-------|------------|
| 138 | PRD-138 | Multi-Pipeline Architecture | XL | Full-Stack | PRD-01, PRD-05, PRD-24, PRD-75, PRD-111, PRD-113, PRD-116 (all done) | **DONE** 2026-03-22 |
| 139 | PRD-139 | Pipeline Workspace Completeness | L | Full-Stack | PRD-138 (done) | **DONE** 2026-03-22 |
| 140 | PRD-140 | Character to Avatar Rename | XL | Full-Stack | All character PRDs (done) | **DONE** 2026-03-22 |
| 141 | PRD-141 | Pipeline-Scoped Imports and Storage | XL | Full-Stack | PRD-138, PRD-113, PRD-116 (all done) | **DONE** 2026-03-23 |

---

## Standalone — Python Generation Scripts ✅

**Goal:** Improvements to the standalone Python generation scripts (`scripts/python/`). These are independent of the web application and have no Rust/React/DB dependencies. Can be done at any time.

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 120 | PRD-120 | Scene & Workflow Naming Hierarchy | M | None (standalone Python script) |

---

## Deferred Work Queue

When a PRD is completed, some phases may be deferred because they depend on PRDs that haven't been built yet. This table tracks those deferred items so they are picked up when the blocking PRD is completed.

**How to use:** After completing a PRD, check the "Unblocks" column below. If the PRD you just finished appears there, the deferred work is now unblocked and should be scheduled alongside the next task.

| Deferred Work | Source PRD | Blocked By | Unblocks When | Effort | Description | Status |
|---------------|-----------|------------|---------------|--------|-------------|--------|
| PRD-29 Phase 1: Theme DB tables + API | PRD-29 (done) | PRD-01, PRD-03 | Both PRD-01 AND PRD-03 are done | M | `theme_statuses`, `user_theme_preferences`, `custom_themes` tables; Rust models + repository; Axum theme API endpoints (`/user/theme`, `/admin/themes`) | **DONE** — migration 20260221000010, models, repo, handlers, routes all implemented |
| PRD-29 Phase 7: Admin Token Editor UI | PRD-29 (done) | PRD-01, PRD-03 | Both PRD-01 AND PRD-03 are done (also needs Phase 1 above) | M | Color picker, font/spacing adjusters, live preview, save/export to `custom_themes` table, admin RBAC | **DONE** — TokenEditor + TokenSections + tests, wired at `/admin/themes` |
| PRD-29 Phase 8.1: Theme API persistence | PRD-29 (done) | PRD-01, PRD-03 | Both PRD-01 AND PRD-03 are done (also needs Phase 1 above) | S | Connect ThemeProvider to backend API for cross-session persistence (currently localStorage only) | **DONE** — `useThemePersistence` hook syncs with backend API, debounced saves |
| PRD-02 DRY: Router/middleware extraction | PRD-02 (done) | PRD-03 | PRD-03 is done | S | Extract shared router + middleware builder from main.rs and test helper to eliminate ~100 lines of duplication | **DONE** — DRY-017 resolved, `build_app_router()` in `api/src/router.rs` |
| PRD-29: GitHub Primer-style token reskin | PRD-29 (done) | None | Anytime | S | Remap color, shadow, radius, and font-family token values in `colors.css` and spacing/animation token files to match GitHub's Primer design language. Component structure unchanged — token values only. | **DONE** — All 4 themes remapped to Primer-derived palette |
| Port fix_metadata.py to Rust | PRD-113 (done) | None | Anytime | L | Port `scripts/fix_metadata.py` (2,870 lines) to native Rust in `core::metadata_transform`. Currently shelling out to Python for metadata generation. Covers mega-key splitting, compound name joining, embedded value extraction, mixed array parsing, split key-value fixing, and 100+ edge cases. | Pending |

### Quick Reference: What to pick up after each blocking PRD

All deferred work items are now complete (2026-03-01).

---

## Critical Path

The longest dependency chain determines the minimum project duration:

```
PRD-00 → PRD-01 → PRD-22 → PRD-21 → PRD-23 → PRD-24 → PRD-57 → PRD-67
  (DB)    (Model)  (ImgQA)  (ImgMgmt) (Scene)  (GenLoop) (Batch)  (Onboard)
```

Secondary critical paths:
```
PRD-02 → PRD-07 → PRD-08 → PRD-46 → PRD-57
  (Axum)  (Tasks)  (Queue)  (Workers) (Batch)

PRD-02 → PRD-05 → PRD-07 → PRD-28 → PRD-24
  (Axum)  (ComfyUI) (Tasks) (Checkpoint)(GenLoop)

PRD-29 → PRD-83 → PRD-35 → PRD-57
  (Design) (Player) (Review) (Batch)
```

**Highest-risk items to prototype early:**
1. **PRD-24** (Recursive Video Generation Loop) — core value proposition, complex
2. **PRD-05** (ComfyUI WebSocket Bridge) — external system integration
3. **PRD-83** (Video Playback Engine) — codec/performance challenges
4. **PRD-57** (Batch Production Orchestrator) — orchestration complexity

---

## Phase Summary

| Phase | PRDs | Focus | Key Milestone |
|-------|------|-------|---------------|
| 0 | 3 | Foundations | DB + Backend + Design System |
| 1 | 6 | Core Services | Data model, ComfyUI, Events, Video player |
| 2 | 24 | Auth & UI Framework | Login, validation, assets, layout, monitoring, ingest, naming, footer, settings, activity console |
| 3 | 15 | Workspace & Data | Jobs, API, search, image pipeline, collaboration |
| 4 | 9 | Scene Config & Workers | Scene types, worker pool, embeddings, cmd palette |
| 5 | 9 | Generation Core | Video generation loop, QA gates, assembly, cloud GPU |
| 6 | 9 | Production at Scale | Batch orchestrator, multi-res, storyboards |
| 7 | 9 | Pipeline Tools | Workflow import, hooks, prompts, branching, generation strategy |
| 8 | 8 | Bulk Onboarding & LLM Refinement | CSV import, character dashboards, legacy migration, LLM metadata refinement, speech repository |
| 9 | 8 | Advanced Review | Cross-char comparison, QA rulesets, regression testing |
| 10 | 8 | Reporting & Delivery | Production reports, compliance, lifecycle, sharing |
| 11 | 10 | Admin Infrastructure | GPU power, budgets, health, webhooks, observability, time scheduling |
| 12 | 8 | Polish & Hardening | Backup/DR, mobile review, setup wizard, dashboard config, readiness, cloud orchestration, queue manager, scheduled generation, character creator, multilingual speech |
| Standalone | 1 | Python Scripts | Scene naming hierarchy for generation script |
| **Total** | **136** | | |

---

## Recommended Team Allocation

| Track | Skills | Active Phases |
|-------|--------|---------------|
| **Backend/Infra** | Rust, Axum, SQLx, PostgreSQL, WebSocket | 0–12 (continuous) |
| **Pipeline/ML** | ComfyUI, GPU, video processing, embeddings | 1, 4–9 |
| **Frontend/UI** | React/TS, design system, video player, review UI | 0, 2–12 |
| **Data/Storage** | PostgreSQL, pgvector, S3, file management | 1–8 |
| **DevOps/Admin** | Infrastructure, monitoring, backup, deployment | 2, 5, 11–12 |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-19 | Initial build plan created — 109 PRDs across 13 phases |
| 2026-02-20 | Added Deferred Work Queue section — tracks PRD-29 deferred phases (1, 7, 8.1) and PRD-02 DRY extraction, both blocked on PRD-01/PRD-03 |
| 2026-02-20 | Added PRD-109 (Scene Video Versioning, Import & Soft Delete) to Phase 2 Track A. All deps satisfied. Total: 110 PRDs |
| 2026-02-24 | Added PRD-111 (Scene Catalog & Track Management) to Phase 2 Track A as high priority. Replaces variant_applicability with normalized tracks. All deps done (PRD-00, 01, 02, 29). Total: 111 PRDs |
| 2026-02-24 | Added PRD-112 (Project Hub & Management) to Phase 2 Track B as high priority. Frontend-only — all backend CRUD exists. All deps done. Total: 112 PRDs |
| 2026-02-24 | Added PRD-113 (Character Ingest Pipeline) to Phase 2 Track A. Folder scanner, name parser, metadata generation/validation, import wizard. All deps done. Total: 113 PRDs |
| 2026-02-24 | Added PRD-114 (Cloud GPU Provider Integration) to Phase 5 Track C. RunPod Pods + Serverless, provider trait, auto-scaling, S3 transfer, cost tracking. All deps done. Total: 114 PRDs |
| 2026-02-24 | Added PRD-115 (Generation Strategy & Workflow Prompt Management) to Phase 7. Strategy selection, prompt node mapping, character+scene fragments, in-app editing. All deps done. Total: 115 PRDs |
| 2026-02-24 | Added PRD-116 (Dynamic File & Entity Naming Engine) to Phase 2 Track A. Configurable naming templates, token substitution, live preview, project overrides. All deps done. Total: 116 PRDs |
| 2026-02-24 | Added PRD-117 (System Status Footer Bar) to Phase 2 Track B. Persistent IDE-style footer bar, service health, cloud GPU, jobs, workflows. All deps done. Total: 117 PRDs |
| 2026-02-25 | Added PRD-110 (Admin Platform Settings Panel) to Phase 2 Track B. Key/value settings with validation, caching, audit. All deps done. Total: 118 PRDs |
| 2026-02-25 | Added PRD-118 (Live Activity Console & Logging System) to Phase 2 Track C. Terminal-style console, role-based streaming, DB persistence. All deps done. Total: 119 PRDs |
| 2026-02-25 | Added PRD-119 (Time-Based Job Scheduling) to Phase 11 Track A. Cron-style schedules, calendar UI, off-peak selection, timezone handling. All deps done. Total: 119 PRDs |
| 2026-02-27 | Added PRD-120 (Scene & Workflow Naming Hierarchy) to new "Standalone — Python Generation Scripts" section. Independent of web app, no deps. Total: 120 PRDs |
| 2026-03-03 | Added deferred work: Port fix_metadata.py (2,870 lines) to Rust. Currently shelling out to Python subprocess for metadata generation |
| 2026-03-06 | Added PRD-125 (LLM-Driven Metadata Refinement Pipeline) to Phase 8. LLM formatting/enrichment of Bio+ToV, iterative fix_metadata.py execution, diff-based approval, outdated dependency chain, source file protection. All deps done. Total: 121 PRDs |
| 2026-03-06 | Added PRD-126 (Critical Bug Fixes & UX Polish) to Phase 12. 13 items across bug fixes, UX polish, and import validation. All deps done (PRD-112, 113, 108, 109). Total: 126 PRDs |
| 2026-03-06 | Added PRD-124 (Speech & TTS Repository) to Phase 8. Normalized speech text storage, CRUD API, Speech tab, CSV/JSON import/export, read-only VoiceID. All deps done (PRD-00, 01, 29, 112). Total: 122 PRDs in build plan |
| 2026-03-06 | Added PRD-127 (ComfyUI Output Handling & Artifact Storage) to Phase 12. Pipeline output classifier, generation snapshot, version creator, artifacts table, ArtifactTimeline UI. All deps done (PRD-03, 24, 47, 109). Total: 128 PRDs |
| 2026-03-06 | Added PRD-128 (Character Readiness Indicators) to Phase 12. Per-section indicator circles on character cards, extended deliverable query with voice ID, ReadinessIndicators component. All deps done (PRD-112, 108). Total: 129 PRDs |
| 2026-03-10 | Added PRD-130 (Unified Cloud & ComfyUI Orchestration) to Phase 12. Unifies PodOrchestrator with cloud provider DB infrastructure. Full lifecycle automation, multi-instance, auto-scaling. All deps done (PRD-02, 05, 114). Total: 130 PRDs |
| 2026-03-10 | Added PRD-131 (Infrastructure Control Panel) to Phase 12. Unified operational dashboard, bulk ops, orphan cleanup, connection recovery. Deps on PRD-130 (planning). Total: 131 PRDs |
| 2026-03-10 | Added PRD-132 (Queue Manager & Intelligent Job Allocation) to Phase 12. Full queue visibility, job reassignment, drain mode, intelligent allocation. All deps done (PRD-07, 08, 05, 46). Total: 132 PRDs |
| 2026-03-18 | Marked PRD-134 (Deferred/Scheduled Generation) and PRD-135 (Character Creator) as DONE (completed 2026-03-17). Added PRD-136 (Multilingual Speech & Deliverable System) to Phase 12 as planning. Total: 136 PRDs (135 done, 1 planning) |
| 2026-03-19 | Added PRD-137 (Output Format Profile Management) to Phase 12. Admin page for profile CRUD, is_default flag, project-level override, ExportPanel auto-selection, seed profiles. All deps done (PRD-039, 110, 112). Total: 137 PRDs (136 done, 1 planning) |
| 2026-03-22 | Added Phase 13 (Multi-Pipeline Architecture) with PRD-138. Pipeline as top-level entity, projects/tracks/workflows/scene_types scoped to pipeline, dynamic seed slots, pipeline-scoped delivery. x121 + y122 initial pipelines. All deps done. Total: 138 PRDs (137 done, 1 planning) |
| 2026-03-22 | Added PRD-139 (Pipeline Workspace Completeness). Full nav in pipeline workspace, dynamic pipeline list, queue pipeline awareness, naming rules per pipeline. Deps: PRD-138. Total: 139 PRDs (138 done, 1 planning). |
| 2026-03-22 | Completed PRD-139. Full workspace nav, 33 routes, pipeline-filtered repos, hardcoded slug removal, queue/dashboard/naming pipeline awareness, ingest validation. Done count: 139 PRDs. |
| 2026-03-22 | Completed PRD-138. 6 migrations, full backend (model/repo/handlers/routes/core types/pipeline crate), full frontend (feature module, sidebar nav, scoped routing, settings, dynamic seed uploads), 19 tests. Done count: 138 PRDs. |

---

## Future Ideas (Backlog)

Features and improvements to consider for future development. Not yet scoped into PRDs.

| # | Title | Description | Deps |
|---|-------|-------------|------|
| F-01 | Pod Log Streaming | Live log viewer in the infrastructure panel that SSHes into running pods and streams ComfyUI logs to the frontend via SSE/WebSocket | PRD-130, PRD-131 |

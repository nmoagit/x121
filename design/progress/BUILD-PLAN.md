# Trulience Platform — Build Plan

Optimal build order for all 109 PRDs, organized into dependency-ordered phases.
Each phase can begin only after all prior phases are complete. PRDs within a phase
can be built **in parallel** (dependencies are satisfied by earlier phases).

> **Source of truth:** Cross-Reference Map in [`design/design.md`](../design.md) (Appendix)
> **Status tracking:** [`PRD-STATUS.md`](./PRD-STATUS.md)

---

## How to Read This Plan

- **Phase** = a set of PRDs whose dependencies are fully satisfied by earlier phases
- **Track** = a parallel workstream within a phase (Backend / Frontend / Data / Pipeline)
- PRDs listed within a track have no inter-dependencies and can be built simultaneously
- Estimated effort is relative (S/M/L/XL) not calendar time
- The plan covers 109 confirmed PRDs. The 15 "MAYBE" items (M-01 through M-15) are excluded

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

## Phase 0 — Platform Skeleton

**Goal:** Establish the three foundational pillars that everything else builds on.
**Milestone:** Database runs, Rust backend serves requests, Design System renders components.

| # | PRD | Title | Effort | Notes |
|---|-----|-------|--------|-------|
| 1 | PRD-00 | Database Normalization & Strict Integrity | M | 3NF schema, lookup tables, FK constraints. Must be first. |
| 2 | PRD-02 | Backend Foundation (Rust/Axum) | L | Axum, SQLx, Tokio. HTTP + WebSocket server shell. |
| 3 | PRD-29 | Design System & Shared Component Library | L | Token architecture, primitives, theme system, Storybook. |

**Parallel tracks:** PRD-00 + PRD-02 (backend team) || PRD-29 (frontend team)
**Dependencies satisfied:** None required.

---

## Phase 1 — Core Services & Playback

**Goal:** Data model, ComfyUI bridge, event backbone, hardware monitoring, video player.
**Milestone:** Can store entities in DB, connect to ComfyUI, emit/subscribe events, play video.

| # | PRD | Title | Effort | Track | Depends On |
|---|-----|-------|--------|-------|------------|
| 4 | PRD-01 | Project, Character & Scene Data Model | L | Backend | PRD-00 |
| 5 | PRD-05 | ComfyUI WebSocket Bridge | M | Backend | PRD-02 |
| 6 | PRD-06 | Hardware Monitoring & Direct Control | M | Backend | PRD-02 |
| 7 | PRD-09 | Multi-Runtime Script Orchestrator | M | Backend | PRD-02 |
| 8 | PRD-10 | Event Bus & Notification System | M | Backend | PRD-02 |
| 9 | PRD-83 | Video Playback Engine & Codec Support | L | Frontend | PRD-29 |

**Parallel tracks:** PRD-01 (data) || PRD-05 + PRD-06 + PRD-09 + PRD-10 (infra) || PRD-83 (frontend)

---

## Phase 2 — Auth, Validation, Assets & UI Framework

**Goal:** User auth, data validation, asset tracking, tags, and the UI shell components.
**Milestone:** Users can log in, data is validated on ingest, assets are tracked, UI layout works.

### Track A — Backend Core

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 10 | PRD-03 | User Identity & RBAC | M | PRD-01, PRD-02 |
| 11 | PRD-07 | Parallel Task Execution Engine | M | PRD-02, PRD-05 |
| 12 | PRD-14 | Data Validation & Import Integrity | M | PRD-00, PRD-01 |
| 13 | PRD-15 | Intelligent & Deferred Disk Reclamation | M | PRD-01 |
| 14 | PRD-17 | Asset Registry & Dependency Mapping | M | PRD-01 |
| 15 | PRD-22 | Source Image Quality Assurance | M | PRD-01 |
| 16 | PRD-47 | Tagging & Custom Labels | S | PRD-01 |

### Track B — UI Framework & Shell

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 17 | PRD-30 | Modular Layout & Panel Management | M | PRD-29 |
| 18 | PRD-32 | Progressive Disclosure & UX Intelligence | S | PRD-29 |
| 19 | PRD-36 | Cinema Mode & Sync-Play Grid | M | PRD-29 |
| 20 | PRD-37 | QA Visual Aids (Ghosting, ROI, Jog Dial) | M | PRD-29, PRD-83 |
| 21 | PRD-52 | Keyboard Shortcut System & Presets | M | PRD-29 |

### Track C — Monitoring Dashboards

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 22 | PRD-41 | Performance & Benchmarking Dashboard | M | PRD-10 |
| 23 | PRD-42 | Studio Pulse Dashboard | M | PRD-10 |
| 24 | PRD-54 | Background Job Tray | S | PRD-10 |
| 25 | PRD-85 | UI Plugin / Extension Architecture | L | PRD-02, PRD-10, PRD-29 |

---

## Phase 3 — Workspace, Jobs, API & Data Management

**Goal:** Session persistence, job queue, API layer, collaboration, search, image pipeline entry point.
**Milestone:** Jobs can be queued and scheduled, API is accessible, search works, images can be managed.

### Track A — Backend Services

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 26 | PRD-04 | Session & Workspace Persistence | M | PRD-01, PRD-03 |
| 27 | PRD-08 | Queue Management & Job Scheduling | L | PRD-07 |
| 28 | PRD-11 | Real-time Collaboration Layer | M | PRD-02, PRD-03, PRD-10 |
| 29 | PRD-12 | External API & Webhooks | L | PRD-02, PRD-03 |
| 30 | PRD-28 | Pipeline Error Recovery & Checkpointing | M | PRD-07 |
| 31 | PRD-45 | Audit Logging & Compliance | M | PRD-01, PRD-03 |

### Track B — Data & Storage

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 32 | PRD-13 | Dual-Metadata System (JSON) | M | PRD-01, PRD-14 |
| 33 | PRD-16 | Folder-to-Entity Bulk Importer | M | PRD-01, PRD-14 |
| 34 | PRD-20 | Search & Discovery Engine | L | PRD-00, PRD-01, PRD-47 |
| 35 | PRD-21 | Source Image Management & Variant Generation | L | PRD-01, PRD-22 |
| 36 | PRD-66 | Character Metadata Editor | M | PRD-01, PRD-14 |

### Track C — UI

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 37 | PRD-33 | Node-Based Workflow Canvas | L | PRD-29, PRD-05 |
| 38 | PRD-35 | One-Key Approval & Finalization Flow | M | PRD-03, PRD-83 |
| 39 | PRD-44 | Bug Reporting & App Config Export | S | PRD-02, PRD-29 |
| 40 | PRD-53 | First-Run Experience & Onboarding | M | PRD-03, PRD-42 |

---

## Phase 4 — Scene Config, Workers, Embeddings & Collaboration

**Goal:** Scene types defined, worker pool managed, character embeddings, review collaboration.
**Milestone:** Scene types can be configured, workers registered, faces embedded, reviews threaded.

### Track A — Generation Infrastructure

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 41 | PRD-23 | Scene Type Configuration | L | PRD-01, PRD-17, PRD-21 |
| 42 | PRD-46 | Worker Pool Management | L | PRD-02, PRD-07, PRD-08 |
| 43 | PRD-76 | Character Identity Embedding | M | PRD-01, PRD-20, PRD-22 |

### Track B — Data & Storage

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 44 | PRD-48 | External & Tiered Storage | M | PRD-15 |
| 45 | PRD-51 | Undo/Redo Architecture | L | PRD-04, PRD-47 |
| 46 | PRD-60 | Character Library (Cross-Project) | L | PRD-01, PRD-03, PRD-20, PRD-21 |

### Track C — UI & Review

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 47 | PRD-31 | Command Palette & Navigation (Cmd+K) | M | PRD-20, PRD-52 |
| 48 | PRD-34 | Interactive Debugger (Mid-Run Control) | M | PRD-05, PRD-33 |
| 49 | PRD-38 | Collaborative Review (Notes, Memos, Issues) | M | PRD-10, PRD-11 |

---

## Phase 5 — Video Generation Core

**Goal:** The actual video generation pipeline — recursive generation, quality gates, assembly.
**Milestone:** Can generate multi-segment videos, auto-QA runs, scenes assembled for delivery.

### Track A — Pipeline

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 50 | PRD-24 | Recursive Video Generation Loop | XL | PRD-05, PRD-07, PRD-21, PRD-23, PRD-28 |
| 51 | PRD-27 | Template & Preset System | M | PRD-23, PRD-33 |

### Track B — Post-Generation

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 52 | PRD-39 | Scene Assembler & Delivery Packaging | L | PRD-01, PRD-24, PRD-35 |
| 53 | PRD-49 | Automated Quality Gates | L | PRD-24, PRD-28, PRD-10 |

### Track C — Supporting Features

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 54 | PRD-43 | System Integrity & Repair Tools | M | PRD-17, PRD-46 |
| 55 | PRD-56 | Studio Wiki & Contextual Help | M | PRD-20, PRD-42 |
| 56 | PRD-79 | Character Duplicate Detection | M | PRD-01, PRD-20, PRD-76 |
| 57 | PRD-104 | Model & LoRA Download Manager | M | PRD-17, PRD-46 |

**Critical path:** PRD-24 (Generation Loop) is the highest-risk, highest-effort item in the entire project. Consider starting a spike/prototype in Phase 4.

---

## Phase 6 — Production at Scale

**Goal:** Batch orchestration, scene previews, cost estimation, multi-resolution, storyboards.
**Milestone:** Can run full production batches, estimate costs, preview cheaply, review storyboards.

### Track A — Orchestration

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 58 | PRD-57 | Batch Production Orchestrator | XL | PRD-01, PRD-08, PRD-10, PRD-21, PRD-23, PRD-24, PRD-35, PRD-39, PRD-42, PRD-46 |
| 59 | PRD-25 | Incremental Re-stitching & Smoothing | M | PRD-24 |
| 60 | PRD-26 | Temporal Continuity (Normalization & Sync) | M | PRD-24, PRD-76 |

### Track B — Efficiency

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 61 | PRD-58 | Scene Preview & Quick Test | M | PRD-21, PRD-23, PRD-24, PRD-36 |
| 62 | PRD-59 | Multi-Resolution Pipeline | M | PRD-24, PRD-36, PRD-39 |
| 63 | PRD-61 | Cost & Resource Estimation | M | PRD-08, PRD-41, PRD-46, PRD-57 |

### Track C — Visual Review

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 64 | PRD-62 | Storyboard View & Scene Thumbnails | M | PRD-24, PRD-36, PRD-57 |
| 65 | PRD-69 | Generation Provenance & Asset Versioning | M | PRD-01, PRD-17, PRD-21, PRD-24 |
| 66 | PRD-78 | Segment Trimming & Frame-Level Editing | M | PRD-24, PRD-35 |

---

## Phase 7 — Advanced Pipeline & Workflow Tools

**Goal:** Workflow import/validation, pipeline hooks, prompt editing, project templates.
**Milestone:** Workflows are validated before use, hooks extend the pipeline, prompts are versioned.

| # | PRD | Title | Effort | Track | Depends On |
|---|-----|-------|--------|-------|------------|
| 67 | PRD-63 | Prompt Editor & Versioning | M | Frontend | PRD-23, PRD-58 |
| 68 | PRD-75 | ComfyUI Workflow Import & Validation | L | Backend | PRD-17, PRD-23, PRD-43, PRD-46 |
| 69 | PRD-77 | Pipeline Stage Hooks (Custom Scripts) | M | Backend | PRD-09, PRD-10, PRD-75 |
| 70 | PRD-74 | Project Configuration Templates | M | Backend | PRD-23, PRD-27 |
| 71 | PRD-64 | Failure Pattern Tracking & Insights | M | Data | PRD-17, PRD-41, PRD-49 |
| 72 | PRD-50 | Content Branching & Exploration | L | Backend | PRD-01, PRD-15, PRD-36 |
| 73 | PRD-70 | On-Frame Annotation & Markup | M | Frontend | PRD-38, PRD-29 |
| 74 | PRD-95 | Production Notes & Internal Comments | M | Frontend | PRD-10, PRD-20, PRD-38 |

---

## Phase 8 — Onboarding, Bulk Ops & Character Dashboards

**Goal:** Bulk character workflows, batch metadata, character readiness views.
**Milestone:** Can onboard characters in bulk via CSV, see readiness state, manage metadata at scale.

| # | PRD | Title | Effort | Track | Depends On |
|---|-----|-------|--------|-------|------------|
| 75 | PRD-67 | Bulk Character Onboarding Wizard | L | Frontend | PRD-21, PRD-22, PRD-23, PRD-46, PRD-57, PRD-60, PRD-61, PRD-66 |
| 76 | PRD-88 | Batch Metadata Operations | M | Backend | PRD-45, PRD-51, PRD-60, PRD-66 |
| 77 | PRD-86 | Legacy Data Import & Migration Toolkit | L | Backend | PRD-01, PRD-60, PRD-66, PRD-76, PRD-79 |
| 78 | PRD-107 | Character Readiness & State View | M | Frontend | PRD-01, PRD-60 |
| 79 | PRD-108 | Character Settings Dashboard | M | Frontend | PRD-01, PRD-60, PRD-107 |
| 80 | PRD-18 | Bulk Data Maintenance (Search/Replace/Re-path) | M | Backend | PRD-01, PRD-20 |

---

## Phase 9 — Advanced Review & Comparison

**Goal:** Cross-character comparison, batch review, scene type QA, smart retry.
**Milestone:** Can compare scenes across characters, review in bulk, auto-retry failures.

### Track A — Quality & Retry

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 81 | PRD-71 | Smart Auto-Retry | M | PRD-23, PRD-49, PRD-61, PRD-64, PRD-69 |
| 82 | PRD-91 | Custom QA Rulesets per Scene Type | M | PRD-23, PRD-49, PRD-77 |
| 83 | PRD-100 | Scene Type Inheritance & Composition | M | PRD-23 |

### Track B — Review UI

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 84 | PRD-68 | Cross-Character Scene Comparison | M | PRD-23, PRD-35, PRD-36, PRD-57, PRD-62 |
| 85 | PRD-96 | Poster Frame & Thumbnail Selection | M | PRD-49, PRD-60, PRD-83 |
| 86 | PRD-101 | Segment Regeneration Comparison | M | PRD-35, PRD-49, PRD-50, PRD-83 |
| 87 | PRD-82 | Content Sensitivity Controls | M | PRD-29, PRD-35, PRD-39, PRD-52 |

### Track C — Workflow Testing

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 88 | PRD-65 | Workflow Regression Testing | L | PRD-23, PRD-27, PRD-36, PRD-49, PRD-59, PRD-63, PRD-08 |

---

## Phase 10 — Reporting, Delivery & Lifecycle

**Goal:** Production reports, compliance checks, project lifecycle, external sharing.
**Milestone:** Full production reporting, compliant delivery packages, projects can be archived.

### Track A — Reporting

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 89 | PRD-73 | Production Reporting & Data Export | L | PRD-12, PRD-41, PRD-42, PRD-49, PRD-61 |
| 90 | PRD-94 | Character Consistency Report | M | PRD-49, PRD-68, PRD-76, PRD-91 |
| 91 | PRD-103 | Character Face Contact Sheet | M | PRD-49, PRD-76, PRD-94, PRD-96 |

### Track B — Delivery & Compliance

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 92 | PRD-102 | Video Compliance Checker | M | PRD-01, PRD-23, PRD-39, PRD-59 |
| 93 | PRD-40 | VFX Sidecar & Dataset Export | M | PRD-39, PRD-13 |
| 94 | PRD-84 | External Review / Shareable Preview Links | M | PRD-38, PRD-39, PRD-83 |

### Track C — Lifecycle

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 95 | PRD-72 | Project Lifecycle & Archival | M | PRD-01, PRD-15, PRD-39, PRD-45, PRD-48 |
| 96 | PRD-92 | Batch Review & Approval Workflows | M | PRD-35, PRD-49, PRD-52, PRD-91 |

---

## Phase 11 — Advanced Infrastructure & Admin

**Goal:** GPU power management, budgets, advanced scheduling, system health, backups.
**Milestone:** GPU fleet is power-managed, budgets enforced, system health visible, backups automated.

### Track A — GPU & Scheduling

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 97 | PRD-87 | GPU Power Management & Idle Scheduling | M | PRD-08, PRD-46 |
| 98 | PRD-90 | Render Queue Timeline / Gantt View | M | PRD-08, PRD-46, PRD-61 |
| 99 | PRD-93 | Generation Budget & Quota Management | M | PRD-08, PRD-10, PRD-57, PRD-61, PRD-90 |
| 100 | PRD-97 | Job Dependency Chains & Triggered Workflows | M | PRD-08, PRD-10, PRD-12, PRD-45, PRD-57 |

### Track B — Admin & Health

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 101 | PRD-80 | System Health Page | M | PRD-05, PRD-06, PRD-10, PRD-12, PRD-17, PRD-46 |
| 102 | PRD-98 | Session Management & Active Users | M | PRD-03, PRD-10, PRD-11, PRD-45 |
| 103 | PRD-19 | Disk Space Visualizer (Treemap) | S | PRD-01, PRD-15 |

### Track C — Integration Testing

| # | PRD | Title | Effort | Depends On |
|---|-----|-------|--------|------------|
| 104 | PRD-99 | Webhook & Integration Testing Console | M | PRD-10, PRD-12, PRD-77 |
| 105 | PRD-106 | API Usage & Observability Dashboard | M | PRD-10, PRD-12, PRD-45 |

---

## Phase 12 — Polish, Recovery & Final Features

**Goal:** Backup/DR, platform setup wizard, dashboard customization, mobile review, remaining polish.
**Milestone:** Platform is production-hardened with disaster recovery, setup wizard, and full UX polish.

| # | PRD | Title | Effort | Track | Depends On |
|---|-----|-------|--------|-------|------------|
| 106 | PRD-81 | Backup & Disaster Recovery | L | Admin | PRD-00, PRD-44, PRD-74, PRD-77, PRD-80 |
| 107 | PRD-55 | Director's View (Mobile/Tablet Review) | L | Frontend | PRD-03, PRD-29, PRD-35, PRD-36, PRD-38, PRD-52 |
| 108 | PRD-89 | Dashboard Widget Customization | M | Frontend | PRD-04, PRD-42, PRD-85 |
| 109 | PRD-105 | Platform Setup Wizard | M | Admin | PRD-03, PRD-05, PRD-46, PRD-80, PRD-81 |

---

## Deferred Work Queue

When a PRD is completed, some phases may be deferred because they depend on PRDs that haven't been built yet. This table tracks those deferred items so they are picked up when the blocking PRD is completed.

**How to use:** After completing a PRD, check the "Unblocks" column below. If the PRD you just finished appears there, the deferred work is now unblocked and should be scheduled alongside the next task.

| Deferred Work | Source PRD | Blocked By | Unblocks When | Effort | Description |
|---------------|-----------|------------|---------------|--------|-------------|
| PRD-29 Phase 1: Theme DB tables + API | PRD-29 (done) | PRD-01, PRD-03 | Both PRD-01 AND PRD-03 are done | M | `theme_statuses`, `user_theme_preferences`, `custom_themes` tables; Rust models + repository; Axum theme API endpoints (`/user/theme`, `/admin/themes`) |
| PRD-29 Phase 7: Admin Token Editor UI | PRD-29 (done) | PRD-01, PRD-03 | Both PRD-01 AND PRD-03 are done (also needs Phase 1 above) | M | Color picker, font/spacing adjusters, live preview, save/export to `custom_themes` table, admin RBAC |
| PRD-29 Phase 8.1: Theme API persistence | PRD-29 (done) | PRD-01, PRD-03 | Both PRD-01 AND PRD-03 are done (also needs Phase 1 above) | S | Connect ThemeProvider to backend API for cross-session persistence (currently localStorage only) |
| PRD-02 DRY: Router/middleware extraction | PRD-02 (done) | PRD-03 | PRD-03 is done | S | Extract shared router + middleware builder from main.rs and test helper to eliminate ~100 lines of duplication |

### Quick Reference: What to pick up after each blocking PRD

| When this PRD is done... | ...pick up this deferred work |
|--------------------------|-------------------------------|
| PRD-01 | Check if PRD-03 is also done → if yes, PRD-29 Phases 1, 7, 8.1 |
| PRD-03 | PRD-02 DRY (router extraction); Check if PRD-01 is also done → if yes, PRD-29 Phases 1, 7, 8.1 |

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
| 2 | 16 | Auth & UI Framework | Login, validation, assets, layout, monitoring |
| 3 | 15 | Workspace & Data | Jobs, API, search, image pipeline, collaboration |
| 4 | 9 | Scene Config & Workers | Scene types, worker pool, embeddings, cmd palette |
| 5 | 8 | Generation Core | Video generation loop, QA gates, assembly |
| 6 | 9 | Production at Scale | Batch orchestrator, multi-res, storyboards |
| 7 | 8 | Pipeline Tools | Workflow import, hooks, prompts, branching |
| 8 | 6 | Bulk Onboarding | CSV import, character dashboards, legacy migration |
| 9 | 8 | Advanced Review | Cross-char comparison, QA rulesets, regression testing |
| 10 | 8 | Reporting & Delivery | Production reports, compliance, lifecycle, sharing |
| 11 | 9 | Admin Infrastructure | GPU power, budgets, health, webhooks, observability |
| 12 | 4 | Polish & Hardening | Backup/DR, mobile review, setup wizard, dashboard config |
| **Total** | **109** | | |

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

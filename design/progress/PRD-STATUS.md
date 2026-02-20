# PRD Status Tracker

Master tracking file for all PRDs in the Image-to-Video Platform specification.
Source of truth: [`design/design.md`](../design.md)

## Status Legend

| Status | Meaning |
|--------|---------|
| `planning` | Defined in spec, not yet started |
| `planning` | Task list being generated or architecture being designed |
| `in-progress` | Active development underway |
| `review` | Implementation complete, under code review or QA |
| `done` | Shipped, tested, and verified |
| `blocked` | Cannot proceed — see Notes column |
| `deferred` | Intentionally postponed to a later phase |
| `maybe` | Evaluation list — not committed |

## Summary

| Status | Count |
|--------|-------|
| backlog | 0 |
| planning | 105 |
| in-progress | 0 |
| review | 0 |
| done | 3 |
| blocked | 0 |
| deferred | 0 |
| maybe | 15 |
| **Total** | **123** |

---

## Part 0: Architecture & Data Standards

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-00 | Database Normalization & Strict Integrity | — | `done` | 2026-02-20 | Foundation. Status lookup tables, pgvector, conventions, integration tests. |
| PRD-01 | Project, Character & Scene Data Model | — | `planning` | — | Foundation — must be first. Updated v1.1 (2026-02-19): extensible character settings JSONB. Tasks: `tasks/tasks-001-prd-project-character-scene-data-model.md` |

## Part 1: Infrastructure & System Core

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-02 | Backend Foundation (Rust/Axum) | — | `done` | 2026-02-20 | Axum 0.8, middleware stack, WebSocket manager, graceful shutdown, 21 integration tests. |
| PRD-03 | User Identity & RBAC | — | `planning` | — | |
| PRD-04 | Session & Workspace Persistence | — | `planning` | — | |
| PRD-05 | ComfyUI WebSocket Bridge | — | `planning` | — | |
| PRD-06 | Hardware Monitoring & Direct Control | — | `planning` | — | |
| PRD-07 | Parallel Task Execution Engine | — | `planning` | — | |
| PRD-08 | Queue Management & Job Scheduling | — | `planning` | — | |
| PRD-09 | Multi-Runtime Script Orchestrator | — | `planning` | — | |
| PRD-10 | Event Bus & Notification System | — | `planning` | — | |
| PRD-11 | Real-time Collaboration Layer | — | `planning` | — | |
| PRD-12 | External API & Webhooks | — | `planning` | — | |
| PRD-46 | Worker Pool Management | — | `planning` | — | |
| PRD-75 | ComfyUI Workflow Import & Validation | — | `planning` | — | |
| PRD-77 | Pipeline Stage Hooks (Custom Scripts) | — | `planning` | — | |
| PRD-85 | UI Plugin / Extension Architecture | — | `planning` | — | |
| PRD-87 | GPU Power Management & Idle Scheduling | — | `planning` | — | |
| PRD-90 | Render Queue Timeline / Gantt View | — | `planning` | — | |
| PRD-93 | Generation Budget & Quota Management | — | `planning` | — | |
| PRD-99 | Webhook & Integration Testing Console | — | `planning` | — | |
| PRD-106 | API Usage & Observability Dashboard | — | `planning` | — | |

## Part 2: Data & Storage Management

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-13 | Dual-Metadata System (JSON) | — | `planning` | — | |
| PRD-14 | Data Validation & Import Integrity | — | `planning` | — | |
| PRD-15 | Intelligent & Deferred Disk Reclamation | — | `planning` | — | |
| PRD-16 | Folder-to-Entity Bulk Importer | — | `planning` | — | |
| PRD-17 | Asset Registry & Dependency Mapping | — | `planning` | — | |
| PRD-18 | Bulk Data Maintenance (Search/Replace/Re-path) | — | `planning` | — | |
| PRD-19 | Disk Space Visualizer (Treemap) | — | `planning` | — | |
| PRD-20 | Search & Discovery Engine | — | `planning` | — | |
| PRD-47 | Tagging & Custom Labels | — | `planning` | — | |
| PRD-48 | External & Tiered Storage | — | `planning` | — | |
| PRD-66 | Character Metadata Editor | — | `planning` | — | |
| PRD-69 | Generation Provenance & Asset Versioning | — | `planning` | — | |
| PRD-79 | Character Duplicate Detection | — | `planning` | — | |
| PRD-86 | Legacy Data Import & Migration Toolkit | — | `planning` | — | |
| PRD-88 | Batch Metadata Operations | — | `planning` | — | |
| PRD-104 | Model & LoRA Download Manager | — | `planning` | — | |

## Part 3: Generation & Pipeline Core

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-76 | Character Identity Embedding | — | `planning` | — | |
| PRD-21 | Source Image Management & Variant Generation | — | `planning` | — | |
| PRD-22 | Source Image Quality Assurance | — | `planning` | — | |
| PRD-23 | Scene Type Configuration | — | `planning` | — | Updated v1.1 (2026-02-19): clip generation prompt types (full_clip, start_clip, continuation_clip) |
| PRD-24 | Recursive Video Generation Loop | — | `planning` | — | Updated v1.1 (2026-02-19): position-based prompt type selection |
| PRD-25 | Incremental Re-stitching & Smoothing | — | `planning` | — | |
| PRD-26 | Temporal Continuity (Normalization & Sync) | — | `planning` | — | |
| PRD-27 | Template & Preset System | — | `planning` | — | |
| PRD-28 | Pipeline Error Recovery & Checkpointing | — | `planning` | — | |
| PRD-49 | Automated Quality Gates | — | `planning` | — | |
| PRD-50 | Content Branching & Exploration | — | `planning` | — | |
| PRD-57 | Batch Production Orchestrator | — | `planning` | — | |
| PRD-58 | Scene Preview & Quick Test | — | `planning` | — | |
| PRD-59 | Multi-Resolution Pipeline | — | `planning` | — | |
| PRD-60 | Character Library (Cross-Project) | — | `planning` | — | |
| PRD-61 | Cost & Resource Estimation | — | `planning` | — | |
| PRD-62 | Storyboard View & Scene Thumbnails | — | `planning` | — | |
| PRD-63 | Prompt Editor & Versioning | — | `planning` | — | |
| PRD-64 | Failure Pattern Tracking & Insights | — | `planning` | — | |
| PRD-65 | Workflow Regression Testing | — | `planning` | — | |
| PRD-67 | Bulk Character Onboarding Wizard | — | `planning` | — | Updated v1.1 (2026-02-19): CSV/text upload, batch video generation |
| PRD-71 | Smart Auto-Retry | — | `planning` | — | |
| PRD-74 | Project Configuration Templates | — | `planning` | — | |
| PRD-91 | Custom QA Rulesets per Scene Type | — | `planning` | — | |
| PRD-94 | Character Consistency Report | — | `planning` | — | |
| PRD-97 | Job Dependency Chains & Triggered Workflows | — | `planning` | — | |
| PRD-100 | Scene Type Inheritance & Composition | — | `planning` | — | |
| PRD-103 | Character Face Contact Sheet | — | `planning` | — | |
| PRD-107 | Character Readiness & State View | — | `planning` | — | New (2026-02-19). Tasks: `tasks/tasks-107-prd-character-readiness-state-view.md` |
| PRD-108 | Character Settings Dashboard | — | `planning` | — | New (2026-02-19). Tasks: `tasks/tasks-108-prd-character-settings-dashboard.md` |

## Part 4: Design System & UX Patterns

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-29 | Design System & Shared Component Library | — | `done` | 2026-02-20 | Token system (4 themes + high-contrast), 25 components, ThemeProvider, 25 Storybook stories, 76 tests. Phases 1/7/8.1 deferred (need users table from PRD-01/PRD-03). |
| PRD-30 | Modular Layout & Panel Management | — | `planning` | — | |
| PRD-31 | Command Palette & Navigation (Cmd+K) | — | `planning` | — | |
| PRD-32 | Progressive Disclosure & UX Intelligence | — | `planning` | — | |
| PRD-51 | Undo/Redo Architecture | — | `planning` | — | |
| PRD-52 | Keyboard Shortcut System & Presets | — | `planning` | — | |
| PRD-53 | First-Run Experience & Onboarding | — | `planning` | — | |
| PRD-54 | Background Job Tray | — | `planning` | — | |
| PRD-82 | Content Sensitivity Controls | — | `planning` | — | |

## Part 5: Workflow Editor & Review

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-83 | Video Playback Engine & Codec Support | — | `planning` | — | |
| PRD-33 | Node-Based Workflow Canvas | — | `planning` | — | |
| PRD-34 | Interactive Debugger (Mid-Run Control) | — | `planning` | — | |
| PRD-35 | One-Key Approval & Finalization Flow | — | `planning` | — | |
| PRD-36 | Cinema Mode & Sync-Play Grid | — | `planning` | — | |
| PRD-37 | QA Visual Aids (Ghosting, ROI, Jog Dial) | — | `planning` | — | |
| PRD-38 | Collaborative Review (Notes, Memos, Issues) | — | `planning` | — | |
| PRD-55 | Director's View (Mobile/Tablet Review) | — | `planning` | — | |
| PRD-68 | Cross-Character Scene Comparison | — | `planning` | — | |
| PRD-70 | On-Frame Annotation & Markup | — | `planning` | — | |
| PRD-78 | Segment Trimming & Frame-Level Editing | — | `planning` | — | |
| PRD-92 | Batch Review & Approval Workflows | — | `planning` | — | |
| PRD-95 | Production Notes & Internal Comments | — | `planning` | — | |
| PRD-96 | Poster Frame & Thumbnail Selection | — | `planning` | — | |
| PRD-101 | Segment Regeneration Comparison | — | `planning` | — | |

## Part 6: Production & Hand-off

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-39 | Scene Assembler & Delivery Packaging | — | `planning` | — | |
| PRD-40 | VFX Sidecar & Dataset Export | — | `planning` | — | |
| PRD-41 | Performance & Benchmarking Dashboard | — | `planning` | — | |
| PRD-42 | Studio Pulse Dashboard | — | `planning` | — | |
| PRD-72 | Project Lifecycle & Archival | — | `planning` | — | |
| PRD-73 | Production Reporting & Data Export | — | `planning` | — | Updated v1.1 (2026-02-19): video technical reports |
| PRD-84 | External Review / Shareable Preview Links | — | `planning` | — | |
| PRD-89 | Dashboard Widget Customization | — | `planning` | — | |
| PRD-102 | Video Compliance Checker | — | `planning` | — | |

## Part 7: Maintenance & Admin

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-43 | System Integrity & Repair Tools | — | `planning` | — | |
| PRD-44 | Bug Reporting & App Config Export | — | `planning` | — | |
| PRD-45 | Audit Logging & Compliance | — | `planning` | — | |
| PRD-56 | Studio Wiki & Contextual Help | — | `planning` | — | |
| PRD-80 | System Health Page | — | `planning` | — | |
| PRD-81 | Backup & Disaster Recovery | — | `planning` | — | |
| PRD-98 | Session Management & Active Users | — | `planning` | — | |
| PRD-105 | Platform Setup Wizard | — | `planning` | — | |

## Part 8: Evaluation List (MAYBE)

| ID | Title | Status | Promote? | Notes |
|----|-------|--------|----------|-------|
| M-01 | Hero Asset Propagation (Global Template Sync) | `maybe` | Strong Maybe | Consider for V1.1 |
| M-02 | Bulk Metadata Enrichment (AI VLM Scanning) | `maybe` | — | Risk of AI hallucinations |
| M-03 | Visual Workflow Diff (Graph Comparison) | `maybe` | — | High implementation complexity |
| M-04 | Metadata Timeline & Versioning | `maybe` | — | Significant DB overhead |
| M-05 | Conditional Script Nodes (Logic Branching) | `maybe` | — | Risk of logic loops |
| M-06 | Image Variant Evolution (Latent Merging) | `maybe` | — | Mathematically complex |
| M-07 | Variation Heatmaps (Parameter Grids) | `maybe` | — | Massive GPU overhead |
| M-08 | Remote GPU Auto-Scaling (Dynamic Orchestration) | `maybe` | — | Cost-control risks |
| M-09 | Shadow Generation (A/B Blind Testing) | `maybe` | — | Doubles GPU consumption |
| M-10 | Workflow Shadowing (Randomized Traffic) | `maybe` | — | Risks inconsistency |
| M-11 | Metadata Schema Builder (Dynamic Forms) | `maybe` | — | High dev cost |
| M-12 | Multi-Monitor & Detachable Panels | `maybe` | — | Cross-window sync complexity |
| M-13 | In-App Changelog & Platform Version Awareness | `maybe` | — | Slack/meetings suffice initially |
| M-14 | In-Platform Light Image Editor | `maybe` | — | External edit loop covers workflow |
| M-15 | Color Management Pipeline | `maybe` | — | Not needed until broadcast delivery |

---

## Related Tracking Files

| File | Purpose |
|------|---------|
| [`design/tasks/`](../tasks/) | Task list files for each PRD (109 files) |
| [`DRY-TRACKER.md`](./DRY-TRACKER.md) | Components and patterns under DRY watch — check before implementing |
| [`design/prds/`](../prds/) | Individual PRD specification files (109 files) |
| [`design/design.md`](../design.md) | Master specification document |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-18 | Initial creation — 106 PRDs + 15 MAYBEs, all at `backlog` |
| 2026-02-18 | Task files generated for all 106 PRDs → `design/tasks/`. All PRDs moved to `planning`. DRY-TRACKER.md created at `design/progress/DRY-TRACKER.md` |
| 2026-02-19 | Added 2 new PRDs (PRD-107, PRD-108) and updated 4 existing PRDs (PRD-01, PRD-23, PRD-24, PRD-67, PRD-73). New PRDs: Character Readiness & State View (107), Character Settings Dashboard (108). Updates: extensible character settings (01), clip generation prompt types (23, 24), CSV/text upload (67), video technical reports (73). Total PRDs: 108 + 15 MAYBEs = 123 |

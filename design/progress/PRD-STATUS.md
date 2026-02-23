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
| planning | 46 |
| in-progress | 0 |
| review | 0 |
| done | 64 |
| blocked | 0 |
| deferred | 0 |
| maybe | 15 |
| **Total** | **125** |

---

## Part 0: Architecture & Data Standards

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-00 | Database Normalization & Strict Integrity | — | `done` | 2026-02-20 | Foundation. Status lookup tables, pgvector, conventions, integration tests. |
| PRD-01 | Project, Character & Scene Data Model | — | `done` | 2026-02-20 | 8 entity tables, models, repositories, API endpoints, naming engine, delivery ZIP, 27 integration tests. |

## Part 1: Infrastructure & System Core

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-02 | Backend Foundation (Rust/Axum) | — | `done` | 2026-02-20 | Axum 0.8, middleware stack, WebSocket manager, graceful shutdown, 21 integration tests. |
| PRD-03 | User Identity & RBAC | — | `done` | 2026-02-20 | JWT auth (HS256), Argon2id passwords, 3-role RBAC (admin/creator/reviewer), middleware extractors, admin user mgmt API, frontend auth (Zustand store, LoginPage, ProtectedRoute), 12 integration tests. DRY-012/013 resolved. |
| PRD-04 | Session & Workspace Persistence | — | `done` | 2026-02-21 | Workspace states, undo snapshots, auto-save, device detection, Zustand store, 11 tests. |
| PRD-05 | ComfyUI WebSocket Bridge | — | `done` | 2026-02-20 | tokio-tungstenite WS client, reqwest REST API, multi-instance manager with exponential backoff reconnect, message parser (7 ComfyUI types), execution tracking, broadcast event channel, 17 unit tests. |
| PRD-06 | Hardware Monitoring & Direct Control | 1 | `done` | 2026-02-21 | DB schema (gpu_metrics, metric_thresholds, restart_logs/statuses), agent binary (NVML collector, WS push, restart handler), backend API (7 admin endpoints, WS ingestion, threshold engine, retention job), frontend dashboard (gauges, charts, restart UI), 16 tests. DRY-077 flagged, DRY-080 resolved. |
| PRD-07 | Parallel Task Execution Engine | — | `done` | 2026-02-21 | Jobs table, dispatcher, progress tracking, handlers, routes. |
| PRD-08 | Queue Management & Job Scheduling | — | `done` | 2026-02-21 | State machine (9 states, 27 tests), scheduler, GPU quotas, off-peak policies, queue management API, frontend queue view. |
| PRD-09 | Multi-Runtime Script Orchestrator | — | `done` | 2026-02-21 | Script execution layer (shell/python/binary), venv isolation with SHA-256 caching, ScriptOrchestrator service, admin API (8 endpoints), 2 DB migrations, 113 unit tests. |
| PRD-10 | Event Bus & Notification System | — | `done` | 2026-02-20 | EventBus (broadcast channel), EventPersistence, NotificationRouter, 8 notification API endpoints, webhook/email delivery, digest scheduler, 16 event types, 5 DB tables, 12 unit tests. Phase 7 (frontend) deferred. |
| PRD-11 | Real-time Collaboration Layer | — | `done` | 2026-02-21 | Entity locks (partial unique), presence tracking, core collaboration protocol (21 tests), lock/presence repos + handlers, frontend PresenceIndicator + LockStatus (7 tests). |
| PRD-12 | External API & Webhooks | — | `done` | 2026-02-21 | API key management (SHA-256 hash, key rotation, scopes), webhook delivery with retry, API audit log, admin endpoints, frontend managers (20 tests). |
| PRD-46 | Worker Pool Management | — | `done` | 2026-02-22 | 3 migrations (workers, health_log, jobs FK), core module (16 tests), 12 repo methods, 10 API endpoints, frontend dashboard (11 tests). DRY-209 to DRY-218 audited. |
| PRD-75 | ComfyUI Workflow Import & Validation | — | `planning` | — | |
| PRD-77 | Pipeline Stage Hooks (Custom Scripts) | — | `planning` | — | |
| PRD-85 | UI Plugin / Extension Architecture | — | `done` | — | |
| PRD-87 | GPU Power Management & Idle Scheduling | — | `planning` | — | |
| PRD-90 | Render Queue Timeline / Gantt View | — | `planning` | — | |
| PRD-93 | Generation Budget & Quota Management | — | `planning` | — | |
| PRD-99 | Webhook & Integration Testing Console | — | `planning` | — | |
| PRD-106 | API Usage & Observability Dashboard | — | `planning` | — | |

## Part 2: Data & Storage Management

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-13 | Dual-Metadata System (JSON) | — | `done` | 2026-02-21 | Phase 3 Group 4 |
| PRD-14 | Data Validation & Import Integrity | — | `done` | 2026-02-20 | Validation engine (8 rule types), import preview/commit, report export (JSON/CSV), 12 integration tests, 33 unit tests. |
| PRD-15 | Intelligent & Deferred Disk Reclamation | — | `done` | 2026-02-21 | Protection rules, policies, trash queue, reclamation engine, admin dashboard, 6 tests. |
| PRD-16 | Folder-to-Entity Bulk Importer | — | `done` | 2026-02-21 | Phase 3 Group 4 |
| PRD-17 | Asset Registry & Dependency Mapping | — | `done` | 2026-02-21 | Asset registry, dependencies, notes, ratings, impact analysis, browser UI, 8 tests. |
| PRD-18 | Bulk Data Maintenance (Search/Replace/Re-path) | — | `planning` | — | |
| PRD-19 | Disk Space Visualizer (Treemap) | — | `planning` | — | |
| PRD-20 | Search & Discovery Engine | — | `done` | 2026-02-21 | tsvector/GIN indexes, fulltext + typeahead + visual similarity search, faceted aggregation, saved searches, search analytics, frontend SearchBar + FacetPanel (29 tests). |
| PRD-47 | Tagging & Custom Labels | — | `done` | 2026-02-21 | Polymorphic tagging, case-insensitive normalization, bulk ops, 3 frontend components. |
| PRD-48 | External & Tiered Storage | — | `done` | 2026-02-22 | 4 migrations (backends, locations, policies, migrations), core module (14 tests), 4 repos, 10 API endpoints, frontend panel (10 tests). DRY-219 to DRY-226 audited. |
| PRD-66 | Character Metadata Editor | — | `done` | 2026-02-21 | Phase 3 Group 4 |
| PRD-69 | Generation Provenance & Asset Versioning | — | `planning` | — | |
| PRD-79 | Character Duplicate Detection | — | `done` | 2026-02-23 | 2 migrations (duplicate_checks, duplicate_detection_settings), core module (16 tests), 2 repos, 6 API endpoints, frontend feature (10 tests). DRY-251 to DRY-263 audited. |
| PRD-86 | Legacy Data Import & Migration Toolkit | — | `planning` | — | |
| PRD-88 | Batch Metadata Operations | — | `planning` | — | |
| PRD-104 | Model & LoRA Download Manager | — | `done` | 2026-02-23 | 3 migrations (model_downloads, api_tokens, placement_rules), core module (16 tests), 3 repos, 13 API endpoints, frontend feature (9 tests). |
| PRD-109 | Scene Video Versioning, External Import & Soft Delete | — | `done` | — | Implemented (2026-02-20). All 7 phases complete: migrations, models, soft delete infra (9 repos), version repo, version API, trash API, delivery integration, integration tests (30 tests). |

## Part 3: Generation & Pipeline Core

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-76 | Character Identity Embedding | — | `done` | 2026-02-22 | 4 migrations (embedding_statuses, character columns, detected_faces, history), core module (12 tests), 9 repo methods, 5 API endpoints, frontend components (11 tests). |
| PRD-21 | Source Image Management & Variant Generation | — | `done` | 2026-02-21 | Variant lifecycle, hero selection, external edit loop, provenance tracking, variant gallery UI. |
| PRD-22 | Source Image Quality Assurance | — | `done` | 2026-02-20 | 3 DB tables (qa_check_types, image_quality_scores, image_qa_thresholds), 3 repos, 6 API handlers (/qa/*), 3 Python QA scripts (resolution/format, face detection, image quality), QA runner via subprocess. Post-MVP: likeness comparison (PRD-76), batch validation, frontend components. |
| PRD-23 | Scene Type Configuration | — | `done` | 2026-02-22 | Migration (11 new columns), core module (prompt resolver, validation, 21 tests), 3 API endpoints (preview_prompt, generate_matrix, validate), frontend feature (SceneTypeEditor, PromptTemplateEditor, SceneMatrixView, 11 tests), DRY fixes (4 resolved, 4 watch). |
| PRD-24 | Recursive Video Generation Loop | — | `done` | 2026-02-22 | 2 migrations (segment+scene generation state), core module (21 tests), generation DTOs, extended segment/scene repos, 4 API endpoints, frontend progress bar + boundary scrubber (9 tests). DRY-237 to DRY-245 audited. |
| PRD-25 | Incremental Re-stitching & Smoothing | — | `done` | 2026-02-23 | Migration (segment versioning columns), core module (SSIM validation, smoothing methods, boundary classification, 14 tests), segment_version DTOs, segment_version_repo (archive, stale flagging, boundary SSIM), 5 API endpoints (regenerate, check boundary, smooth, versions, clear stale), frontend feature (RegenerateSegmentButton, BoundaryQualityIndicator, SegmentVersionComparison, 8 tests). DRY-270 sync comment added. |
| PRD-26 | Temporal Continuity (Normalization & Sync) | — | `done` | 2026-02-23 | Migration (temporal_metrics, temporal_settings), core module (drift/grain/centering classification, threshold validation, 22 tests), temporal metric/setting DTOs, 2 repos (metrics + settings with upsert), 7 API endpoints (scene/segment/project scoped), 4 Python analysis scripts (drift, grain, normalize, centering), frontend feature (DriftTrendChart with shared chartStyles, GrainComparisonPanel, 5 tests). DRY-271 sync comment added. |
| PRD-27 | Template & Preset System | — | `done` | 2026-02-22 | 3 migrations (templates, presets, preset_ratings), core module (16 tests), 2 repos, 14 API endpoints, frontend marketplace + editor + override dialog (10 tests). |
| PRD-28 | Pipeline Error Recovery & Checkpointing | — | `done` | 2026-02-21 | Checkpoints table, failure diagnostics, stage diagram, resume dialog, 22 tests. DRY-152/153 resolved. |
| PRD-49 | Automated Quality Gates | — | `done` | 2026-02-22 | |
| PRD-50 | Content Branching & Exploration | — | `planning` | — | |
| PRD-57 | Batch Production Orchestrator | — | `done` | 2026-02-23 | Migration (production_runs, production_run_cells), core module (run/cell status constants, matrix validation, delivery readiness, cell status computation, 21 tests), production run DTOs (typed response structs), production_run_repo (batch cell insert via UNNEST, status counting), 9 API endpoints (CRUD, matrix, submit, resubmit, deliver, progress), frontend feature (MatrixGrid, ProductionProgress, 15 tests). DRY-264/265/266 resolved. |
| PRD-58 | Scene Preview & Quick Test | — | `done` | 2026-02-23 | Migration (test_shots table), core module (test shot validation, status enum, 13 tests), DB models+repo (gallery query, promotion, batch), 6 API endpoints (generate, batch, gallery, detail, promote, delete), frontend feature (TestShotGallery, TestShotButton with Modal, 8 tests). DRY-279 fixed (Modal reuse). |
| PRD-59 | Multi-Resolution Pipeline | — | `done` | 2026-02-23 | 2 migrations (resolution_tiers seed + scene tier columns), core module (tier constants, upscale/delivery validation, 13 tests), DB models+repo (tier CRUD, scene tier update), 5 API endpoints (list/get/create tiers, upscale, get scene tier), frontend feature (TierBadge, UpscaleButton, 7 tests). DRY-274/275 fixed. |
| PRD-60 | Character Library (Cross-Project) | — | `done` | 2026-02-22 | 2 migrations (library_characters, project_links), core module (10 tests), 2 repos, 10 API endpoints, frontend browser + import (11 tests). |
| PRD-61 | Cost & Resource Estimation | — | `done` | 2026-02-23 | Migration (generation_metrics with upsert), core module (estimation engine, confidence levels, incremental mean, 22 tests), DB models+repo (upsert with ON CONFLICT incremental mean, batch lookup), 3 API endpoints (estimate, history, record), frontend feature (EstimationCard with breakdown, 7 tests). DRY-277/280 fixed. |
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
| PRD-30 | Modular Layout & Panel Management | — | `done` | 2026-02-21 | Panel system, snap grid, resize, view module registry, presets, role defaults, 22 tests. |
| PRD-31 | Command Palette & Navigation (Cmd+K) | — | `done` | 2026-02-22 | 1 migration (user_recent_items), core module (12 tests), repo, 4 API endpoints, CommandRegistry class, frecency scorer, frontend palette (11 tests). DRY-227 to DRY-236 audited. |
| PRD-32 | Progressive Disclosure & UX Intelligence | — | `done` | 2026-02-21 | AdvancedDrawer, focus mode, parameter visibility, proficiency tracking, 13 tests. |
| PRD-51 | Undo/Redo Architecture | — | `done` | 2026-02-22 | 1 migration (undo_trees), core module (8 tests), upsert repo, 4 API endpoints, UndoTree class, frontend components (14 tests). |
| PRD-52 | Keyboard Shortcut System & Presets | — | `done` | 2026-02-21 | Central registry, 4 industry presets, custom keymaps, context-aware, cheat sheet, 26 tests. |
| PRD-53 | First-Run Experience & Onboarding | — | `done` | 2026-02-21 | User onboarding state, guided tours, contextual hints, checklist, onboarding gate, 10 core tests. DRY-191 to DRY-200 audited. |
| PRD-54 | Background Job Tray | — | `done` | — | |
| PRD-82 | Content Sensitivity Controls | — | `planning` | — | |

## Part 5: Workflow Editor & Review

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-83 | Video Playback Engine & Codec Support | — | `done` | 2026-02-21 | |
| PRD-33 | Node-Based Workflow Canvas | — | `done` | 2026-02-21 | Canvas layout persistence, node graph, telemetry overlay, ComfyUI JSON import. |
| PRD-34 | Interactive Debugger (Mid-Run Control) | — | `done` | 2026-02-22 | 1 migration (job_debug_state), core module (12 tests), 8 repo methods, 6 API endpoints, frontend debugger (11 tests). |
| PRD-35 | One-Key Approval & Finalization Flow | — | `done` | 2026-02-21 | Rejection categories, segment approvals, review queue, structured rejection tracking. |
| PRD-36 | Cinema Mode & Sync-Play Grid | — | `done` | — | |
| PRD-37 | QA Visual Aids (Ghosting, ROI, Jog Dial) | — | `done` | — | |
| PRD-38 | Collaborative Review (Notes, Memos, Issues) | — | `done` | 2026-02-22 | 2 migrations (review_tags, review_notes+note_tags), core module (12 tests), 2 repos, 10 API endpoints, frontend review notes (11 tests). |
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
| PRD-39 | Scene Assembler & Delivery Packaging | — | `done` | 2026-02-22 | |
| PRD-40 | VFX Sidecar & Dataset Export | — | `planning` | — | |
| PRD-41 | Performance & Benchmarking Dashboard | — | `done` | — | |
| PRD-42 | Studio Pulse Dashboard | — | `done` | — | |
| PRD-72 | Project Lifecycle & Archival | — | `planning` | — | |
| PRD-73 | Production Reporting & Data Export | — | `planning` | — | Updated v1.1 (2026-02-19): video technical reports |
| PRD-84 | External Review / Shareable Preview Links | — | `planning` | — | |
| PRD-89 | Dashboard Widget Customization | — | `planning` | — | |
| PRD-102 | Video Compliance Checker | — | `planning` | — | |

## Part 7: Maintenance & Admin

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-43 | System Integrity & Repair Tools | — | `done` | 2026-02-23 | 2 migrations (integrity_scans, model_checksums), core module (18 tests), 2 repos, 10 API endpoints, frontend feature (9 tests). |
| PRD-44 | Bug Reporting & App Config Export | — | `done` | 2026-02-21 | Bug reports, config export/import/validate, admin endpoints. |
| PRD-45 | Audit Logging & Compliance | — | `done` | 2026-02-21 | Immutable audit logs with hash chain, retention policies, dynamic filtering, CSV/JSON export, integrity check, 27 tests. DRY-155/156 resolved. |
| PRD-56 | Studio Wiki & Contextual Help | — | `done` | 2026-02-23 | 2 migrations (wiki_articles, wiki_versions), core module (14 tests), 2 repos, 10 API endpoints, frontend feature (10 tests). |
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
| 2026-02-20 | Added PRD-109 (Scene Video Versioning, External Import & Soft Delete). All dependencies satisfied (PRD-00, 01, 02 done). PRD + task list generated. Total PRDs: 109 + 15 MAYBEs = 124 |

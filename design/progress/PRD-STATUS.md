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
| planning | 0 |
| in-progress | 0 |
| review | 0 |
| done | 140 |
| blocked | 0 |
| deferred | 0 |
| maybe | 15 |
| **Total** | **155** |

---

## Part 0: Architecture & Data Standards

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-00 | Database Normalization & Strict Integrity | — | `done` | 2026-02-20 | Foundation. Status lookup tables, pgvector, conventions, integration tests. |
| PRD-01 | Project, Character & Scene Data Model | — | `done` | 2026-02-20 | 8 entity tables, models, repositories, API endpoints, naming engine, delivery ZIP, 27 integration tests. |
| PRD-138 | Multi-Pipeline Architecture | 1 | `done` | 2026-03-22 |
| PRD-139 | Pipeline Workspace Completeness | 1 | `done` | 2026-03-22 |
| PRD-140 | Character to Avatar Rename | 1 | `done` | 2026-03-22 | Renamed "character"→"avatar" across entire stack. DB: 1 migration renaming 19 tables + FK columns. Backend: 46 files renamed, 258 files updated (all types, repos, handlers, routes, SQL). Frontend: 49 files renamed, 402 files updated (all components, hooks, types, routes, labels). Unified "model"/"character" to "avatar". | Full pipeline workspace nav (42 items, 6 groups), 33 pipeline-scoped routes, dynamic pipeline list in sidebar, pipeline-filtered repos (tracks, scene types, workflows), cross-pipeline validation, hardcoded slug removal (naming_engine, delivery, TrackBadge, import), queue pipeline badges+filtering, pipeline-scoped naming rules page, dashboard pipeline scoping, ingest seed slot validation. Deps: PRD-138. | Pipeline as top-level entity. 6 migrations (pipelines table, seed data, FK additions to projects/tracks/workflows/scene_types). Pipeline model/repo/handlers/routes. Core types (SeedSlot, NamingRules). Pipeline context loading, seed validation, pipeline-scoped naming. Frontend: pipeline feature module, sidebar nav, scoped routing, settings page, dynamic seed uploads. DRY fixes: parse_json_field, ensure_pipeline_exists, shared search validators. Deps: PRD-01, PRD-05, PRD-24, PRD-75, PRD-111, PRD-113, PRD-116. |

## Part 1: Infrastructure & System Core

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-02 | Backend Foundation (Rust/Axum) | — | `done` | 2026-02-20 | Axum 0.8, middleware stack, WebSocket manager, graceful shutdown, 21 integration tests. DRY-017 resolved: `build_app_router()` extracted to shared `router.rs` module. |
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
| PRD-75 | ComfyUI Workflow Import & Validation | — | `done` | 2026-02-23 | Phase 7 Track A |
| PRD-77 | Pipeline Stage Hooks (Custom Scripts) | — | `done` | 2026-02-23 | Phase 7 Track A |
| PRD-85 | UI Plugin / Extension Architecture | — | `done` | — | |
| PRD-87 | GPU Power Management & Idle Scheduling | — | `done` | 2026-03-01 | Migration (power_schedules, worker columns, consumption_log), core (34 tests), models, repo, 9 admin handlers, frontend (6 components, 10s polling), 15 tests. DRY: 5 CRITICAL + 4 HIGH fixed. |
| PRD-90 | Render Queue Timeline / Gantt View | — | `done` | — | |
| PRD-93 | Generation Budget & Quota Management | — | `done` | — | |
| PRD-99 | Webhook & Integration Testing Console | — | `done` | — | |
| PRD-106 | API Usage & Observability Dashboard | — | `done` | — | |
| PRD-114 | Cloud GPU Provider Integration (RunPod) | 1 | `done` | 2026-02-28 | 6 migrations (providers, GPU types, instances, scaling rules, cost events), 5 repos, core domain (provider trait, AES-256-GCM crypto, auto-scaling), new `crates/cloud` (RunPod GraphQL+Serverless, registry, 3 background services, S3 bridge), 29 admin API endpoints, frontend dashboard (5 components, 22 hooks). DRY-539 to DRY-554 audited. |
| PRD-119 | Time-Based Job Scheduling | — | `done` | — | Cron-style schedules (one-time + recurring), calendar UI, smart off-peak slot selection, timezone handling, batch scheduling (PRD-57), schedule executor, execution history. Deps: PRD-08, PRD-07, PRD-10, PRD-03 (all done). Extends PRD-08. Integrates with PRD-87, PRD-57, PRD-54, PRD-97. |

## Part 2: Data & Storage Management

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-13 | Dual-Metadata System (JSON) | — | `done` | 2026-02-21 | Phase 3 Group 4. Amendments A.1–A.4 (2026-03-06): outdated dependency chain (auto-flag on Bio/ToV change), import safeguard (source key protection), age field as text, VoiceID approval gate. |
| PRD-14 | Data Validation & Import Integrity | — | `done` | 2026-02-20 | Validation engine (8 rule types), import preview/commit, report export (JSON/CSV), 12 integration tests, 33 unit tests. |
| PRD-15 | Intelligent & Deferred Disk Reclamation | — | `done` | 2026-02-21 | Protection rules, policies, trash queue, reclamation engine, admin dashboard, 6 tests. Amendment A.1 (2026-03-14): video file purge with DB record preservation, file_purged columns, purge-clips endpoint, 410 Gone guard. |
| PRD-16 | Folder-to-Entity Bulk Importer | — | `done` | 2026-02-21 | Phase 3 Group 4 |
| PRD-17 | Asset Registry & Dependency Mapping | — | `done` | 2026-02-21 | Asset registry, dependencies, notes, ratings, impact analysis, browser UI, 8 tests. |
| PRD-18 | Bulk Data Maintenance (Search/Replace/Re-path) | — | `done` | 2026-02-23 | Migration 000033, core maintenance module (field registry, validators), 7 API endpoints, frontend feature (FindReplacePanel, RePathPanel, OperationsHistory), 36 tests. |
| PRD-19 | Disk Space Visualizer (Treemap) | — | `done` | — | |
| PRD-20 | Search & Discovery Engine | — | `done` | 2026-02-21 | tsvector/GIN indexes, fulltext + typeahead + visual similarity search, faceted aggregation, saved searches, search analytics, frontend SearchBar + FacetPanel (29 tests). |
| PRD-47 | Tagging & Custom Labels | — | `done` | 2026-02-21 | Polymorphic tagging, case-insensitive normalization, bulk ops, 3 frontend components. |
| PRD-48 | External & Tiered Storage | — | `done` | 2026-02-22 | 4 migrations (backends, locations, policies, migrations), core module (14 tests), 4 repos, 10 API endpoints, frontend panel (10 tests). DRY-219 to DRY-226 audited. |
| PRD-66 | Character Metadata Editor | — | `done` | 2026-02-21 | Phase 3 Group 4 |
| PRD-69 | Generation Provenance & Asset Versioning | — | `done` | 2026-02-23 | Phase 6 Track C |
| PRD-79 | Character Duplicate Detection | — | `done` | 2026-02-23 | 2 migrations (duplicate_checks, duplicate_detection_settings), core module (16 tests), 2 repos, 6 API endpoints, frontend feature (10 tests). DRY-251 to DRY-263 audited. |
| PRD-86 | Legacy Data Import & Migration Toolkit | — | `done` | 2026-02-23 | Migrations 000028-000029, core legacy_import module (scanner, mapper, gap analysis), API handlers, frontend feature (legacy-import wizard). |
| PRD-88 | Batch Metadata Operations | — | `done` | 2026-02-23 | Migration 000032, core batch_metadata module (validators, undo logic), status enum, API handlers, frontend feature (batch-metadata panel), 19 tests. |
| PRD-104 | Model & LoRA Download Manager | — | `done` | 2026-02-23 | 3 migrations (model_downloads, api_tokens, placement_rules), core module (16 tests), 3 repos, 13 API endpoints, frontend feature (9 tests). |
| PRD-109 | Scene Video Versioning, External Import & Soft Delete | — | `done` | — | Implemented (2026-02-20). All 7 phases complete: migrations, models, soft delete infra (9 repos), version repo, version API, trash API, delivery integration, integration tests (30 tests). Amendments A.1–A.3 (2026-03-06): generation_snapshot JSONB column, SequencePlayer for clip playback, empty file validation + warning badges. Amendments A.4–A.6 (2026-03-14): newer-than-final indicator, file_purged tracking, snapshot backfill. |
| PRD-113 | Character Ingest Pipeline | 1 | `done` | 2026-02-27 | 3 migrations (5 tables), 4 core modules (name parser, folder scanner, metadata validator, video spec validator), 3 model modules, 3 repo modules, 4 handler modules, 4 route modules, frontend wizard + validation dashboard. 38 core tests. Amendment A.1 (2026-03-14): SHA-256 import hash deduplication. |
| PRD-122 | Storage Configuration (Local & Cloud S3) | 1 | `done` | 2026-03-01 | StorageProvider trait + LocalStorageProvider (core), S3StorageProvider (cloud crate, aws-sdk-s3), runtime hot-swap via RwLock, 5 CoreError variants, 7 settings, seed migration, set_default/test_s3_connection handlers, frontend S3 field toggle. DRY-627 to DRY-634 audited. |
| PRD-124 | Speech & TTS Repository | 1 | `done` | 2026-03-06 | Normalized speech text storage per character (speech_types lookup + character_speeches), CRUD API, Speech tab in Character Detail page, bulk CSV/JSON import/export, read-only VoiceID display. Deps: PRD-00, PRD-01, PRD-29, PRD-112. |
| PRD-125 | LLM-Driven Metadata Refinement Pipeline | 1 | `done` | 2026-03-06 | LLM formatting/enrichment of Bio+ToV, iterative fix_metadata.py execution loop, diff-based approval, outdated dependency chain, source file protection. Deps: PRD-009, PRD-013, PRD-014, PRD-066, PRD-113. |
| PRD-133 | Metadata Version Approval | 1 | `done` | 2026-03-13 | Migration (4 columns), approve/reject/unapprove handlers, reviewer authorization, readiness criterion, delivery gate, frontend approval badges. Amendment A.1 (2026-03-14): unapprove action. |
| PRD-135 | Character Creator | 1 | `done` | 2026-03-17 | Dedicated seed-data provisioning page at /content/characters. Shared group/card module extraction (CharacterGroupSection, CharacterFilterBar), FileAssignmentModal with thumbnails, admin project auto-creation (ProjectConfirmModal), metadata template selection, useCharacterImportBase hook. Deps: PRD-112, PRD-113, PRD-066. |
| PRD-136 | Multilingual Speech & Deliverable System | 1 | `done` | 2026-03-18 | Language infrastructure (languages table), language_id on character_speeches, speech approval workflow, deliverable JSON export, speech completeness tracking, project speech config, bulk multi-character import (greetings.json format), language flag indicators on character cards. Post-MVP: LLM translation, TTS preview, speech generation. Deps: PRD-124, PRD-112, PRD-128. |
| PRD-137 | Output Format Profile Management | 1 | `done` | 2026-03-19 | Admin page at /admin/output-profiles for profile CRUD, is_default flag with unique partial index, project-level default override via default_format_profile_id FK, ExportPanel auto-selection cascade (project → platform → first alphabetical), seed profiles (720p/1080p/4K with 1080p as default). ProfileForm shared between admin page and FormatProfileManager. Deps: PRD-039, PRD-110, PRD-112. |

## Part 3: Generation & Pipeline Core

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-76 | Character Identity Embedding | — | `done` | 2026-02-22 | 4 migrations (embedding_statuses, character columns, detected_faces, history), core module (12 tests), 9 repo methods, 5 API endpoints, frontend components (11 tests). |
| PRD-21 | Source Image Management & Variant Generation | — | `done` | 2026-02-21 | Variant lifecycle, hero selection, external edit loop, provenance tracking, variant gallery UI. Amendment A.1 (2026-03-13): unapprove action for image variants. |
| PRD-22 | Source Image Quality Assurance | — | `done` | 2026-02-20 | 3 DB tables (qa_check_types, image_quality_scores, image_qa_thresholds), 3 repos, 6 API handlers (/qa/*), 3 Python QA scripts (resolution/format, face detection, image quality), QA runner via subprocess. Post-MVP: likeness comparison (PRD-76), batch validation, frontend components. |
| PRD-23 | Scene Type Configuration | — | `done` | 2026-02-22 | Migration (11 new columns), core module (prompt resolver, validation, 21 tests), 3 API endpoints (preview_prompt, generate_matrix, validate), frontend feature (SceneTypeEditor, PromptTemplateEditor, SceneMatrixView, 11 tests), DRY fixes (4 resolved, 4 watch). |
| PRD-24 | Recursive Video Generation Loop | — | `done` | 2026-02-22 | 2 migrations (segment+scene generation state), core module (21 tests), generation DTOs, extended segment/scene repos, 4 API endpoints, frontend progress bar + boundary scrubber (9 tests). DRY-237 to DRY-245 audited. |
| PRD-25 | Incremental Re-stitching & Smoothing | — | `done` | 2026-02-23 | Migration (segment versioning columns), core module (SSIM validation, smoothing methods, boundary classification, 14 tests), segment_version DTOs, segment_version_repo (archive, stale flagging, boundary SSIM), 5 API endpoints (regenerate, check boundary, smooth, versions, clear stale), frontend feature (RegenerateSegmentButton, BoundaryQualityIndicator, SegmentVersionComparison, 8 tests). DRY-270 sync comment added. |
| PRD-26 | Temporal Continuity (Normalization & Sync) | — | `done` | 2026-02-23 | Migration (temporal_metrics, temporal_settings), core module (drift/grain/centering classification, threshold validation, 22 tests), temporal metric/setting DTOs, 2 repos (metrics + settings with upsert), 7 API endpoints (scene/segment/project scoped), 4 Python analysis scripts (drift, grain, normalize, centering), frontend feature (DriftTrendChart with shared chartStyles, GrainComparisonPanel, 5 tests). DRY-271 sync comment added. |
| PRD-27 | Template & Preset System | — | `done` | 2026-02-22 | 3 migrations (templates, presets, preset_ratings), core module (16 tests), 2 repos, 14 API endpoints, frontend marketplace + editor + override dialog (10 tests). |
| PRD-28 | Pipeline Error Recovery & Checkpointing | — | `done` | 2026-02-21 | Checkpoints table, failure diagnostics, stage diagram, resume dialog, 22 tests. DRY-152/153 resolved. |
| PRD-49 | Automated Quality Gates | — | `done` | 2026-02-22 | |
| PRD-50 | Content Branching & Exploration | — | `done` | 2026-02-23 | Phase 7 Track B |
| PRD-57 | Batch Production Orchestrator | — | `done` | 2026-02-23 | Migration (production_runs, production_run_cells), core module (run/cell status constants, matrix validation, delivery readiness, cell status computation, 21 tests), production run DTOs (typed response structs), production_run_repo (batch cell insert via UNNEST, status counting), 9 API endpoints (CRUD, matrix, submit, resubmit, deliver, progress), frontend feature (MatrixGrid, ProductionProgress, 15 tests). DRY-264/265/266 resolved. |
| PRD-58 | Scene Preview & Quick Test | — | `done` | 2026-02-23 | Migration (test_shots table), core module (test shot validation, status enum, 13 tests), DB models+repo (gallery query, promotion, batch), 6 API endpoints (generate, batch, gallery, detail, promote, delete), frontend feature (TestShotGallery, TestShotButton with Modal, 8 tests). DRY-279 fixed (Modal reuse). |
| PRD-59 | Multi-Resolution Pipeline | — | `done` | 2026-02-23 | 2 migrations (resolution_tiers seed + scene tier columns), core module (tier constants, upscale/delivery validation, 13 tests), DB models+repo (tier CRUD, scene tier update), 5 API endpoints (list/get/create tiers, upscale, get scene tier), frontend feature (TierBadge, UpscaleButton, 7 tests). DRY-274/275 fixed. |
| PRD-60 | Character Library (Cross-Project) | — | `done` | 2026-02-22 | 2 migrations (library_characters, project_links), core module (10 tests), 2 repos, 10 API endpoints, frontend browser + import (11 tests). |
| PRD-61 | Cost & Resource Estimation | — | `done` | 2026-02-23 | Migration (generation_metrics with upsert), core module (estimation engine, confidence levels, incremental mean, 22 tests), DB models+repo (upsert with ON CONFLICT incremental mean, batch lookup), 3 API endpoints (estimate, history, record), frontend feature (EstimationCard with breakdown, 7 tests). DRY-277/280 fixed. |
| PRD-62 | Storyboard View & Scene Thumbnails | — | `done` | 2026-02-23 | Phase 6 Track C |
| PRD-63 | Prompt Editor & Versioning | — | `done` | 2026-02-23 | Phase 7 Track A |
| PRD-64 | Failure Pattern Tracking & Insights | — | `done` | 2026-02-23 | Phase 7 Track B |
| PRD-65 | Workflow Regression Testing | — | `done` | 2026-02-28 | Migration (3 tables), core verdict logic reusing segment_comparison (19 tests), 3 models, repo (14 methods), 8 API endpoints, frontend feature (ReferenceManager, RunHistoryPanel, RegressionReport, VerdictBadge, ScoreDiffDisplay), 17 frontend tests. DRY-460/462/463 fixed, DRY-461/464/468 watch. |
| PRD-67 | Bulk Character Onboarding Wizard | — | `done` | 2026-02-23 | Migration 000027, core onboarding_wizard module (step validation), API handlers, frontend feature (onboarding-wizard). Updated v1.1 (2026-02-19): CSV/text upload, batch video generation. |
| PRD-71 | Smart Auto-Retry | — | `done` | 2026-02-28 | Migration (retry_attempts table, 5 policy columns on scene_types), core module (jitter engine, best-of-N selector, retry policy evaluation, 11 tests), retry_attempt model/repo, 7 API endpoints (policy CRUD, attempt CRUD, select), frontend feature (RetryHistoryPanel, RetryPolicyEditor, AttemptRow, 15 tests). |
| PRD-74 | Project Configuration Templates | — | `done` | 2026-02-23 | Phase 7 Track B |
| PRD-91 | Custom QA Rulesets per Scene Type | — | `done` | — | |
| PRD-94 | Character Consistency Report | — | `done` | 2026-02-28 | Migration, core (19 tests), models, repo, handlers, routes, frontend (heatmap, outliers, overview), 10 tests |
| PRD-97 | Job Dependency Chains & Triggered Workflows | — | `done` | — | |
| PRD-100 | Scene Type Inheritance & Composition | — | `done` | 2026-02-28 | Migration (parent/depth on scene_types, overrides table, mixins tables), core inheritance resolver (field-level source tracking, depth validation, cascade detection), repos (MixinRepo, SceneTypeOverrideRepo), 13 API endpoints (children, effective-config, cascade-preview, overrides CRUD, mixins CRUD), frontend (OverrideIndicator, InheritanceTree, 15 hooks), 9 integration + 13 frontend tests. |
| PRD-103 | Character Face Contact Sheet | — | `done` | 2026-02-28 | Migration, core (15 tests), models, repo, handlers, routes, frontend (grid, controls, page), 10 tests |
| PRD-111 | Scene Catalog & Track Management | 1 | `done` | 2026-02-26 | 6 migrations, 4 models, 4 repos (three-level inheritance), 4 handlers, 12 frontend components, 13 tests. Replaces variant_applicability with normalized tracks. |
| PRD-115 | Generation Strategy & Workflow Prompt Management | 1 | `done` | 2026-02-28 | Migration (6 table changes), 5 models, 5 repos, core prompt resolution engine (13 unit tests), 13 API handlers, 5 routers, 7 frontend components, 13 hooks, 22 frontend tests. |
| PRD-107 | Character Readiness & State View | — | `done` | 2026-02-23 | Migrations 000030-000031, core readiness module (criteria evaluation, cache), API handlers (CRUD + batch evaluate), frontend feature (ReadinessStateBadge, CriteriaEditor, SummaryBar), 18+ tests. Amendment A.1 (2026-03-14): readiness % requires metadata approval. |
| PRD-108 | Character Settings Dashboard | — | `done` | 2026-02-23 | Core character_dashboard module (settings merge, label builders), API handlers (get_dashboard, patch_settings), frontend feature (CharacterDashboard, MetadataSummarySection, PipelineSettingsEditor), 27 tests. |
| PRD-120 | Scene & Workflow Naming Hierarchy (Generation Script) | — | `done` | 2026-03-01 | Python generation script only. Three-level hierarchy (WORKFLOWS, SCENE_TYPES, derived SCENES), display names in all output, dual-level filtering (type + scene), --list-scenes flag, 26 unit tests. Independent of web app. |
| PRD-123 | Scene Catalog & Scene Types Unification | 1 | `done` | — | Absorbs scene_catalog into scene_types. Adds slug + has_clothes_off_transition to scene_types, creates scene_type_tracks junction, migrates project_scene_settings and character_scene_overrides FKs, drops scene_catalog tables, unifies frontend to single "Scene Catalog" page. |
| PRD-127 | ComfyUI Output Handling & Artifact Storage | 1 | `done` | 2026-03-06 | Migration (scene_video_version_artifacts), artifact model/repo, output_classifier module (node title convention `[final]`/`[intermediate]`, positional fallback, 7 tests), snapshot builder (2 tests), version_creator, extended completion_handler for multi-output download, generation_snapshot on CreateSceneVideoVersion, artifacts API endpoint, frontend ArtifactTimeline component in ClipCard. Supports all 3 workflow patterns (multi-segment, single-output, single+intermediates). Deps: PRD-005, PRD-024, PRD-001. |
| PRD-128 | Character Readiness Indicators | 1 | `done` | 2026-03-06 | 4 color-coded circle icons (metadata, images, scenes, speech) on project character cards. Added `has_voice_id` to deliverable SQL, frontend `computeSectionReadiness()` pure function, `ReadinessIndicators` component with tooltips and click-to-navigate. No new endpoint — extends existing character-deliverables data. Deps: PRD-112, PRD-108. Amendment A.1 (2026-03-14): character thumbnail tooltip on character name hover. |
| PRD-129 | Character Review Allocation | 1 | `done` | 2026-03-08 | Enterprise character-level review gate with manual assignment and round-robin allocation with load balancing. 4 new DB tables (statuses, assignments, decisions, audit_log) + 2 column additions. Round-robin engine in core crate (pure logic, unit tested). 12 API handlers covering full lifecycle: assign, auto-allocate (preview/execute), start review, approve/reject, rework, re-queue. Frontend: ReviewStatusBadge, MyReviewsPage (reviewer queue), CharacterReviewControls (sticky footer), CharacterReviewAuditLog (timeline), AssignmentDashboard (admin workload), ProjectAuditLogPanel with CSV export. Integrated into CharacterDetailPage with Review tab. Deps: PRD-112, PRD-092. |
| PRD-130 | Unified Cloud & ComfyUI Orchestration | 1 | `done` | 2026-03-10 | Unifies PodOrchestrator (env-based, single pod, SSH startup) with cloud provider DB infrastructure (multi-provider, multi-pod). Moves all RunPod config from .env to cloud_providers.settings JSONB, auto-seeds from env on first boot, automates full lifecycle (provision → SSH startup → ComfyUI verify → WebSocket connect → queue distribution → teardown), multi-instance support, auto-scaling with full lifecycle hooks, admin CRUD API for providers, FK linking comfyui_instances to cloud_instances. Deps: PRD-02, PRD-05, PRD-114. |
| PRD-131 | Infrastructure Control Panel | 1 | `done` | 2026-03-10 | Unified operational dashboard for all cloud instances and ComfyUI connections. Replaces split Infrastructure Panel + Cloud GPU Dashboard. Bulk operations (start/stop/terminate multiple), orphan detection & cleanup (cloud orphans, DB orphans, ComfyUI orphans), failed connection recovery (restart ComfyUI, force reconnect, reset state), inline provider management, instance provisioning wizard, curated activity logging, embedded activity console. Deps: PRD-02, PRD-05, PRD-114, PRD-130. |
| PRD-132 | Queue Manager & Intelligent Job Allocation | 1 | `done` | 2026-03-10 | Full queue visibility (all job states, not just pending), ComfyUI-integrated job cancellation (interrupt GPU), job reassignment between workers, worker drain mode (finish current work before stopping), intelligent load-aware allocation (replace naive first-available), admin queue manipulation (move to front, hold, bulk cancel, redistribute), queue statistics dashboard, curated activity logging. New held state, drain mode on instances, job-instance tracking. Deps: PRD-07, PRD-08, PRD-05, PRD-46. |
| PRD-134 | Deferred / Scheduled Generation | 1 | `done` | 2026-03-17 | Schedule scene generation for future time. Migration (scheduled scene status ID 8), SplitButton component, ScheduleGenerationModal, schedule executor integration, ScheduledGenerationsPanel in queue manager, cancel/remove-scenes endpoints. Deps: PRD-008, PRD-024, PRD-119, PRD-132. |

## Part 4: Design System & UX Patterns

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-29 | Design System & Shared Component Library | — | `done` | 2026-02-20 | Token system (4 themes + high-contrast, Primer palette), 25 components, ThemeProvider, 25 Storybook stories, 76 tests. All deferred phases complete: Phase 1 (theme DB+API), Phase 7 (admin token editor at /admin/themes), Phase 8.1 (API persistence via useThemePersistence), Primer reskin applied. Amendment A.1 (2026-03-14): Tooltip viewport-aware auto-flip. |
| PRD-30 | Modular Layout & Panel Management | — | `done` | 2026-02-21 | Panel system, snap grid, resize, view module registry, presets, role defaults, 22 tests. |
| PRD-31 | Command Palette & Navigation (Cmd+K) | — | `done` | 2026-02-22 | 1 migration (user_recent_items), core module (12 tests), repo, 4 API endpoints, CommandRegistry class, frecency scorer, frontend palette (11 tests). DRY-227 to DRY-236 audited. |
| PRD-32 | Progressive Disclosure & UX Intelligence | — | `done` | 2026-02-21 | AdvancedDrawer, focus mode, parameter visibility, proficiency tracking, 13 tests. |
| PRD-51 | Undo/Redo Architecture | — | `done` | 2026-02-22 | 1 migration (undo_trees), core module (8 tests), upsert repo, 4 API endpoints, UndoTree class, frontend components (14 tests). |
| PRD-52 | Keyboard Shortcut System & Presets | — | `done` | 2026-02-21 | Central registry, 4 industry presets, custom keymaps, context-aware, cheat sheet, 26 tests. |
| PRD-53 | First-Run Experience & Onboarding | — | `done` | 2026-02-21 | User onboarding state, guided tours, contextual hints, checklist, onboarding gate, 10 core tests. DRY-191 to DRY-200 audited. |
| PRD-54 | Background Job Tray | — | `done` | — | |
| PRD-82 | Content Sensitivity Controls | — | `done` | 2026-02-28 | Migration (2 tables), core module (blur level enforcement, 7 tests), model/repo (upsert pattern), 4 API endpoints (user+admin), frontend provider (context+localStorage+API sync), BlurredMedia component, WatermarkOverlay, ScreenShareMode (Ctrl+Shift+S shortcut), admin defaults UI, 18 frontend tests. DRY-453 to DRY-459 watch. |
| PRD-112 | Project Hub & Management | 1 | `done` | 2026-02-27 | 2 migrations (character_groups, group_id FK), character group model/repo/handlers, project stats endpoint, 25 frontend files (project list, detail with 6 tabs, character workstation with 6 tabs, 3 TanStack Query hook files). Amendments A.1–A.5 (2026-03-06): Queue Outstanding modal with blocking reasons, Force Override toggle, archived exclusion from pipeline, show/hide disabled toggle, breadcrumb auto-scroll to group. Amendment A.6 (2026-03-14): character thumbnail tooltip on deliverables grid. |
| PRD-117 | System Status Footer Bar | 1 | `done` | 2026-02-27 | HealthAggregator background service, status handler, 7 frontend components (StatusFooter, FooterSegment, ServiceHealth, CloudGpu, Job, Workflow, Collapsed). |
| PRD-118 | Live Activity Console & Logging System | — | `done` | 2026-02-27 | 1 migration (4 tables), core types, ActivityLogBroadcaster, custom tracing::Layer, batch persistence/retention services, WebSocket handler, REST endpoints, Zustand store, dual-mode UI (panel + page). |
| PRD-126 | Critical Bug Fixes & UX Polish | 1 | `done` | — | 5 bug fixes (import timeout, Select All, empty versions, UTF-8 metadata, DnD groups), 5 UX polish (ignore toggle, show disabled, breadcrumb scroll, header consolidation, wider inputs), 3 import validation fixes (filename mismatch, skip guard, race condition). |

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
| PRD-55 | Director's View (Mobile/Tablet Review) | — | `done` | — | |
| PRD-68 | Cross-Character Scene Comparison | — | `done` | 2026-02-28 | Backend comparison API + frontend gallery with sync play, sort/filter, quick actions |
| PRD-70 | On-Frame Annotation & Markup | — | `done` | 2026-02-23 | Phase 7 |
| PRD-78 | Segment Trimming & Frame-Level Editing | — | `done` | 2026-02-23 | Phase 6 Track C |
| PRD-92 | Batch Review & Approval Workflows | — | `done` | 2026-02-28 | |
| PRD-95 | Production Notes & Internal Comments | — | `done` | 2026-02-23 | Phase 7 |
| PRD-96 | Poster Frame & Thumbnail Selection | — | `done` | 2026-02-28 | Migration, core module (6 tests), model/repo/handler/routes, 6 frontend components (EntityPoster shared), 16 frontend tests. DRY-442 to DRY-450 audited. |
| PRD-101 | Segment Regeneration Comparison | — | `done` | 2026-02-28 | Migration (segment_versions table), core module (score diff logic, 12 tests), model/repo extension (6 new methods), 4 API endpoints, 9 frontend components (dual sync, QA comparison, batch workflow), 18 frontend tests. DRY-451 fixed, DRY-446 to DRY-450 watch. |
| PRD-121 | SVI Clip Management | 1 | `done` | 2026-03-01 | Migration (QA columns), model/DTO updates, soft-delete repo methods, 3 handlers (approve/reject/resume-from), clip_qa constants module, frontend ClipGallery + ClipCard + QA actions + 3 dialogs + useClipManagement hook. DRY-627 to DRY-634 audited. Amendments A.1–A.3 (2026-03-14): newer-than-final blue dot indicator, GenerationSnapshotPanel shared component, clickable workflow link with auto-select. |

## Part 6: Production & Hand-off

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-39 | Scene Assembler & Delivery Packaging | — | `done` | 2026-02-22 | Amendments A.1–A.4 (2026-03-06): delivery destinations (local/S3/Google Drive), auto-deliver on final approval, delivery error logs with viewer, per-character delivery status tracking with badges. |
| PRD-40 | VFX Sidecar & Dataset Export | — | `done` | 2026-02-28 | |
| PRD-41 | Performance & Benchmarking Dashboard | — | `done` | — | |
| PRD-42 | Studio Pulse Dashboard | — | `done` | — | |
| PRD-72 | Project Lifecycle & Archival | — | `done` | 2026-02-28 | |
| PRD-73 | Production Reporting & Data Export | — | `done` | 2026-02-28 | Migration, core, models, repo, handlers, routes, frontend components, tests |
| PRD-84 | External Review / Shareable Preview Links | — | `done` | 2026-02-28 | |
| PRD-89 | Dashboard Widget Customization | — | `done` | — | |
| PRD-102 | Video Compliance Checker | — | `done` | 2026-02-28 | Migration (2 tables), core (24 tests), models, repo, handlers (8), routes, frontend (6 components), 11 tests |

## Part 7: Maintenance & Admin

| PRD | Title | Priority | Status | Owner | Notes |
|-----|-------|----------|--------|-------|-------|
| PRD-43 | System Integrity & Repair Tools | — | `done` | 2026-02-23 | 2 migrations (integrity_scans, model_checksums), core module (18 tests), 2 repos, 10 API endpoints, frontend feature (9 tests). |
| PRD-44 | Bug Reporting & App Config Export | — | `done` | 2026-02-21 | Bug reports, config export/import/validate, admin endpoints. |
| PRD-45 | Audit Logging & Compliance | — | `done` | 2026-02-21 | Immutable audit logs with hash chain, retention policies, dynamic filtering, CSV/JSON export, integrity check, 27 tests. DRY-155/156 resolved. |
| PRD-56 | Studio Wiki & Contextual Help | — | `done` | 2026-02-23 | 2 migrations (wiki_articles, wiki_versions), core module (14 tests), 2 repos, 10 API endpoints, frontend feature (10 tests). |
| PRD-80 | System Health Page | — | `done` | 2026-03-01 | Migration (3 tables), core (28 tests), 3 repo structs, 7 handlers, frontend (6 components, 30s auto-refresh), 21 tests. DRY-530 to DRY-538 audited. |
| PRD-81 | Backup & Disaster Recovery | — | `done` | — | |
| PRD-98 | Session Management & Active Users | — | `done` | — | |
| PRD-105 | Platform Setup Wizard | — | `done` | — | |
| PRD-110 | Admin Platform Settings Panel | 1 | `done` | 2026-02-27 | Platform settings with type-safe validation, caching, DB persistence. Route: `/admin/settings`. |
| PRD-116 | Dynamic File & Entity Naming Engine | 1 | `done` | 2026-02-27 | Configurable naming templates per file category (12 categories), token substitution, live preview, project-level overrides. Route: `/admin/naming`. |

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
| [`design/tasks/`](../tasks/) | Task list files for each PRD |
| [`DRY-TRACKER.md`](./DRY-TRACKER.md) | Components and patterns under DRY watch — check before implementing |
| [`design/prds/`](../prds/) | Individual PRD specification files (134 files) |
| [`design/design.md`](../design.md) | Master specification document |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-18 | Initial creation — 106 PRDs + 15 MAYBEs, all at `backlog` |
| 2026-02-18 | Task files generated for all 106 PRDs → `design/tasks/`. All PRDs moved to `planning`. DRY-TRACKER.md created at `design/progress/DRY-TRACKER.md` |
| 2026-02-19 | Added 2 new PRDs (PRD-107, PRD-108) and updated 4 existing PRDs (PRD-01, PRD-23, PRD-24, PRD-67, PRD-73). New PRDs: Character Readiness & State View (107), Character Settings Dashboard (108). Updates: extensible character settings (01), clip generation prompt types (23, 24), CSV/text upload (67), video technical reports (73). Total PRDs: 108 + 15 MAYBEs = 123 |
| 2026-02-20 | Added PRD-109 (Scene Video Versioning, External Import & Soft Delete). All dependencies satisfied (PRD-00, 01, 02 done). PRD + task list generated. Total PRDs: 109 + 15 MAYBEs = 124 |
| 2026-02-24 | Added PRD-110 (Admin Platform Settings Panel). Dependencies: PRD-00, PRD-02 (both done). Extends PRD-44. Total PRDs: 110 + 15 MAYBEs = 125 |
| 2026-02-24 | Added PRD-111 (Scene Catalog & Track Management). High priority — replaces variant_applicability with normalized tracks. Dependencies: PRD-00, PRD-01, PRD-02, PRD-29 (all done). Total PRDs: 111 + 15 MAYBEs = 126 |
| 2026-02-24 | Added PRD-112 (Project Hub & Management). High priority — frontend-only, all backend exists. Project list + detail page + character grid. Total PRDs: 112 + 15 MAYBEs = 127 |
| 2026-02-24 | Added PRD-113 (Character Ingest Pipeline). High priority — folder scanner, name parser, metadata detection/generation/validation, import wizard. Total PRDs: 113 + 15 MAYBEs = 128 |
| 2026-02-24 | Added PRD-114 (Cloud GPU Provider Integration). RunPod Pods + Serverless, provider trait, auto-scaling, cost tracking, admin UI. Total PRDs: 114 + 15 MAYBEs = 129 |
| 2026-02-24 | Added PRD-115 (Generation Strategy & Workflow Prompt Management). Strategy selection, prompt node mapping, character+scene fragments, fragment library, in-app editing. Total PRDs: 115 + 15 MAYBEs = 130 |
| 2026-02-24 | Added PRD-116 (Dynamic File & Entity Naming Engine). Configurable naming templates per file category, token substitution, live preview, project overrides. Total PRDs: 116 + 15 MAYBEs = 131 |
| 2026-02-24 | Added PRD-117 (System Status Footer Bar). Persistent IDE-style footer bar with service health, cloud GPU, jobs, workflows. Role-filtered. Total PRDs: 117 + 15 MAYBEs = 132 |
| 2026-02-25 | Added PRD-118 (Live Activity Console & Logging System). Terminal-style console for real-time streaming operational logs from all backend services. Dockable panel + dedicated page, role-based visibility, curated/verbose modes, DB persistence with configurable retention. Total PRDs: 118 + 15 MAYBEs = 133 |
| 2026-02-25 | Added PRD-119 (Time-Based Job Scheduling). Cron-style schedules (one-time + recurring), calendar UI with drag-to-reschedule, smart off-peak slot selection, per-user timezone handling, batch scheduling for production runs, schedule executor, execution history. Extends PRD-08. Total PRDs: 119 + 15 MAYBEs = 134 |
| 2026-02-27 | Added PRD-120 (Scene & Workflow Naming Hierarchy). Python generation script restructure: three-level hierarchy (WORKFLOWS, SCENE_TYPES, derived SCENES), display names in output/progress/manifest, dual-level filtering (type + scene), --list-scenes flag, backward-compatible config files. Total PRDs: 120 + 15 MAYBEs = 135 |
| 2026-02-28 | Added PRD-121 (SVI Clip Management). Clip gallery frontend, clip-level QA (approve/reject with reason), resume generation from last good clip, external clip import UI. Extends PRD-109. Total PRDs: 121 + 15 MAYBEs = 136 (+ 1 planning). |
| 2026-02-28 | Added PRD-122 (Storage Configuration — Local & Cloud S3). StorageProvider trait abstraction, LocalStorageProvider + S3StorageProvider implementations, aws-sdk-s3 integration, S3 settings in admin panel, connection testing, runtime backend switching. Extends PRD-48, PRD-110. Total PRDs: 122 + 15 MAYBEs + 1 done = 138 (2 planning). |
| 2026-03-01 | Implemented PRD-121 + PRD-122. Both complete: clip QA workflow, storage provider abstraction with S3, runtime hot-swap, 8 DRY findings fixed (DRY-627–634). |
| 2026-03-01 | Added PRD-123 (Scene Catalog & Scene Types Unification). Absorbs scene_catalog into scene_types: adds slug + has_clothes_off_transition columns, creates scene_type_tracks junction, migrates project_scene_settings/character_scene_overrides FKs from scene_catalog_id to scene_type_id, drops scene_catalog tables, unifies frontend to single "Scene Catalog" page, removes "Scene Types" nav entry. Total PRDs: 124 + 15 MAYBEs = 139. |
| 2026-03-06 | Added PRD-125 (LLM-Driven Metadata Refinement Pipeline). LLM formatting/enrichment of Bio+ToV data, iterative `fix_metadata.py` execution with quality checking, diff-based human approval, "Outdated" dependency chain (Bio/ToV change flags metadata), source file protection (import never overwrites bio.json/tov.json). Deps: PRD-009, PRD-013, PRD-014, PRD-066, PRD-113. Total PRDs: 125 + 15 MAYBEs = 140. |
| 2026-03-06 | Added PRD-126 (Critical Bug Fixes & UX Polish). 13 items: import timeout fix, Select All bug, empty versions, UTF-8 metadata, DnD groups, ignore deliverable toggle, show/hide disabled, breadcrumb scroll, header consolidation, wider inputs, filename mismatch warning, import skip guard, import race condition. Deps: PRD-112, PRD-113, PRD-108, PRD-109. Total PRDs: 126 + 15 MAYBEs = 141. |
| 2026-03-06 | Added PRD-124 (Speech & TTS Repository). Normalized speech text storage per character (speech_types lookup + character_speeches table), CRUD API (8 endpoints), Speech tab in Character Detail page, bulk CSV/JSON import/export, read-only VoiceID display. MVP is text-only; TTS audio generation deferred to post-MVP. Deps: PRD-00, PRD-01, PRD-29, PRD-112. Total PRDs: 127 + 15 MAYBEs = 142. |
| 2026-03-06 | Added + implemented PRD-127 (ComfyUI Output Handling & Artifact Storage). Unified pipeline output handling for all ComfyUI workflow patterns. Migration (artifacts table), output classifier with node title convention, snapshot builder, version creator, multi-output completion handler, artifacts API endpoint, frontend ArtifactTimeline in ClipCard. 18 pipeline tests. Total PRDs: 128 + 15 MAYBEs = 143. |
| 2026-03-06 | Added + implemented PRD-128 (Character Readiness Indicators). 4 per-section indicator circles on character cards (metadata, images, scenes, speech). Extended deliverable SQL with has_voice_id, frontend computeSectionReadiness() function, ReadinessIndicators component with tooltips and click-to-navigate. Total PRDs: 129 + 15 MAYBEs = 144. |
| 2026-03-10 | Added PRD-130 (Unified Cloud & ComfyUI Orchestration). Unifies PodOrchestrator with cloud provider DB infrastructure. Moves config from .env to DB, full pod lifecycle automation (provision → SSH → ComfyUI → WebSocket → queue), multi-instance, auto-scaling with lifecycle hooks, admin provider CRUD. Deps: PRD-02, PRD-05, PRD-114. Total PRDs: 130 + 15 MAYBEs = 145. |
| 2026-03-10 | Added PRD-131 (Infrastructure Control Panel). Unified operational dashboard replacing split Infrastructure Panel + Cloud GPU Dashboard. Bulk ops, orphan detection & cleanup, failed connection recovery, inline provider management, provisioning wizard. Deps: PRD-02, PRD-05, PRD-114, PRD-130. Total PRDs: 131 + 15 MAYBEs = 146. |
| 2026-03-10 | Added PRD-132 (Queue Manager & Intelligent Job Allocation). Full queue visibility, ComfyUI-integrated cancellation, job reassignment, worker drain mode, load-aware allocation, admin queue manipulation (hold, move-to-front, bulk cancel), queue stats dashboard. Deps: PRD-07, PRD-08, PRD-05, PRD-46. Total PRDs: 132 + 15 MAYBEs = 147. |
| 2026-03-13 | Added + implemented PRD-133 (Metadata Version Approval). Formal approval workflow for character metadata versions with reviewer authorization, readiness criterion, delivery gate, unapprove action. Total PRDs: 133 + 15 MAYBEs = 148. |
| 2026-03-14 | Amended 10 PRDs to document post-implementation changes: PRD-015 (video file purge), PRD-021 (unapprove image variants), PRD-029 (tooltip auto-flip), PRD-107 (readiness requires metadata approval), PRD-109 (newer-than-final, file_purged, snapshot backfill), PRD-112 (character thumbnail tooltip), PRD-113 (import hash dedup), PRD-121 (blue dot indicator, snapshot panel, workflow link), PRD-128 (thumbnail on name hover), PRD-133 (unapprove action). |
| 2026-03-16 | Added PRD-134 (Deferred / Scheduled Generation). Schedule scene generation for future time via split-button UX, bulk scheduling, new "Scheduled" scene status, schedule executor integration. Deps: PRD-008, PRD-024, PRD-119, PRD-132. Total PRDs: 135 + 15 MAYBEs = 150. |
| 2026-03-16 | Added PRD-135 (Character Creator). Dedicated seed-data provisioning page at /content/characters with shared group/card module, FileAssignmentModal for unmatched files, admin project auto-creation, metadata template selection. Deps: PRD-112, PRD-113, PRD-066. Total PRDs: 135 + 15 MAYBEs = 150. |
| 2026-03-18 | Marked PRD-134 (Deferred/Scheduled Generation) as done. Migration, SplitButton, ScheduleGenerationModal, schedule executor, ScheduledGenerationsPanel, cancel/remove-scenes endpoints all implemented. Completion date: 2026-03-17. |
| 2026-03-18 | Marked PRD-135 (Character Creator) as done. CharactersPage, shared CharacterGroupSection/CharacterFilterBar, FileAssignmentModal with thumbnails, ProjectConfirmModal, useCharacterImportBase, metadata template selection all implemented. Completion date: 2026-03-17. Done count: 131. |
| 2026-03-18 | Added PRD-136 (Multilingual Speech & Deliverable System). Language infrastructure, speech approval workflow, deliverable JSON export, speech completeness tracking, project speech config, bulk multi-character import, language flags on character cards. Post-MVP: LLM translation, TTS preview, speech generation. Deps: PRD-124, PRD-112, PRD-128. Total PRDs: 136 + 15 MAYBEs = 151. |
| 2026-03-18 | Implemented PRD-136. Migration (languages, speech_statuses, project_speech_config, character_speeches + speech_types alterations), backend models/repos/handlers for language CRUD, speech approval, reorder, deliverable JSON, completeness, project config, bulk import. Frontend: circle-flags, FlagIcon, SpeechStatusBadge, enhanced speech tab with language filter/approval/reorder/deliverable, language flags on cards/detail, SpeechRequirementsEditor, BulkSpeechImportModal. Done count: 136. |
| 2026-03-19 | Added PRD-137 (Output Format Profile Management). Admin page for centralized profile CRUD, is_default flag, project-level default override, ExportPanel auto-selection, seed profiles (720p/1080p/4K). Deps: PRD-039, PRD-110, PRD-112. Total PRDs: 137 + 15 MAYBEs = 152. |
| 2026-03-22 | Added PRD-138 (Multi-Pipeline Architecture). Pipeline as top-level entity scoping projects, tracks, workflows, scene types. Dynamic seed slots (x121: clothed+topless, y122: speaker), pipeline-scoped naming/delivery, pipeline navigation in frontend. Characters pipeline-scoped (no cross-pipeline sharing). DB-driven config, code-driven backend. Deps: PRD-01, PRD-05, PRD-24, PRD-75, PRD-111, PRD-113, PRD-116. Total PRDs: 138 + 15 MAYBEs = 153. |
| 2026-03-22 | Added PRD-139 (Pipeline Workspace Completeness). Full nav in pipeline workspace, dynamic pipeline list in sidebar, queue pipeline awareness, pipeline-scoped naming rules. Deps: PRD-138. Total: 139 + 15 MAYBEs = 154. |
| 2026-03-22 | Implemented PRD-140. DB: 1 migration (19 tables + FK columns renamed). Backend: 46 files renamed, 258 files updated. Frontend: 49 files renamed, 402 files updated. "character"/"model" unified to "avatar" everywhere. Done count: 140. |
| 2026-03-22 | Added PRD-140 (Character to Avatar Rename). Rename character→avatar across DB (19 tables), backend (200+ files), frontend (100+ files). Unify "model"/"character" to "avatar". Total: 140 + 15 MAYBEs = 155. |
| 2026-03-22 | Implemented PRD-139. Full workspace nav (42 items), 33 routes, pipeline-filtered repos (tracks/scene types/workflows), cross-pipeline validation, hardcoded slug removal (6 files), queue pipeline badges, naming rules per pipeline, dashboard scoping, ingest seed slot validation. Done count: 139. |
| 2026-03-22 | Implemented PRD-138. 6 migrations, pipeline model/repo/handlers/routes, core types (SeedSlot, PipelineNamingRules), pipeline context loader, seed validation, pipeline-scoped naming. Frontend: pipeline feature module (hooks, list page, settings page, SeedSlotEditor, JsonConfigPanel), sidebar pipeline nav, scoped routing, pipeline-aware project creation, dynamic seed upload slots. DRY fixes: parse_json_field, ensure_pipeline_exists, shared search validators. 19 unit tests. Done count: 138. |

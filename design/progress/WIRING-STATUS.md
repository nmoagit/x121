# Frontend Wiring Status

Tracks which completed PRDs have frontend features accessible via routes/navigation
versus those that are implemented but need integration into host pages.

**Last updated:** 2026-03-14

**133 of 133 PRDs are complete.** All PRDs implemented.
**All 133 PRDs have frontend navigation or are correctly unrouted.**

## Summary

| Category | Count |
|----------|-------|
| Routed (accessible via sidebar/nav) | 73 |
| Correctly unrouted (overlays/framework/embedded) | 16 |
| Missing routes (need host-page integration) | 29 |
| No frontend (backend/script only) | 15 |
| **Total** | **133** |

---

## Routed Features (Accessible)

These features have routes in `router.tsx` and entries in `navigation.ts`.

| Route | Feature Dir | PRD |
|-------|-------------|-----|
| `/` | `dashboard` | PRD-42 |
| `/performance` | `dashboard` | PRD-41 |
| `/dashboard/customize` | `dashboard-customization` | PRD-89 |
| `/content/scenes` | `scenes` | PRD-01 |
| `/content/characters` | `characters` | PRD-01 |
| `/content/library` | `library` | PRD-60 |
| `/content/storyboard` | `storyboard` | PRD-62 |
| `/content/images` | `images` | PRD-21 |
| `/content/scene-catalog` | `scene-catalog` | PRD-23, PRD-111 |
| `/content/character-dashboard` | `character-dashboard` | PRD-108 |
| `/content/contact-sheet` | `contact-sheet` | PRD-103 |
| `/content/duplicates` | `duplicates` | PRD-79 |
| `/production/queue` | `queue` | PRD-08 |
| `/production/generation` | `generation` | PRD-24 |
| `/production/test-shots` | `test-shots` | PRD-58 |
| `/production/batch` | `production` | PRD-57 |
| `/production/delivery` | `delivery` | PRD-39 |
| `/production/checkpoints` | `checkpoints` | PRD-28 |
| `/production/debugger` | `debugger` | PRD-34 |
| `/production/render-timeline` | `render-timeline` | PRD-90 |
| `/review/annotations` | `annotations` | PRD-70 |
| `/review/notes` | `review-notes` | PRD-38 |
| `/review/production-notes` | `production-notes` | PRD-95 |
| `/review/qa-gates` | `quality-gates` | PRD-49 |
| `/review/cinema` | `cinema` | PRD-36 |
| `/review/temporal` | `temporal` | PRD-26 |
| `/review/share/$token` | `shared-links` | PRD-84 (public, no shell) |
| `/tools/prompts` | `prompt-editor` | PRD-63 |
| `/tools/workflows` | `workflow-canvas` | PRD-33 |
| `/tools/config` | `config-templates` | PRD-74 |
| `/tools/presets` | `presets` | PRD-27 |
| `/tools/search` | `search` | PRD-20 |
| `/tools/branching` | `branching` | PRD-50 |
| `/tools/activity-console` | `activity-console` | PRD-118 |
| `/tools/character-ingest` | `character-ingest` | PRD-113 |
| `/tools/batch-metadata` | `batch-metadata` | PRD-88 |
| `/tools/pipeline-hooks` | `pipeline-hooks` | PRD-77 |
| `/tools/workflow-import` | `workflow-import` | PRD-75 |
| `/tools/undo` | `undo` | PRD-51 |
| `/admin/hardware` | `admin` | PRD-06 |
| `/admin/workers` | `workers` | PRD-46 |
| `/admin/integrity` | `integrity` | PRD-43 |
| `/admin/audit` | `audit` | PRD-45 |
| `/admin/reclamation` | `admin` | PRD-15 |
| `/admin/storage` | `storage` | PRD-48, PRD-122 |
| `/admin/downloads` | `downloads` | PRD-104 |
| `/admin/api-keys` | `api-keys` | PRD-12 |
| `/admin/extensions` | `extensions` | PRD-85 |
| `/admin/maintenance` | `maintenance` | PRD-18 |
| `/admin/onboarding-wizard` | `onboarding-wizard` | PRD-67 |
| `/admin/legacy-import` | `legacy-import` | PRD-86 |
| `/admin/naming` | `naming-rules` | PRD-116 |
| `/admin/readiness` | `readiness` | PRD-107 |
| `/admin/settings` | `settings` | PRD-110 |
| `/admin/themes` | `admin/TokenEditor` | PRD-29 |
| `/admin/infrastructure` | `infrastructure` | PRD-131 |
| `/admin/queue` | `queue` | PRD-132 |
| `/admin/cloud-gpus` | `admin/cloud-gpus` | PRD-114 |
| `/admin/job-scheduling` | `job-scheduling` | PRD-119 |
| `/admin/session-management` | `session-management` | PRD-98 |
| `/admin/webhook-testing` | `webhook-testing` | PRD-99 |
| `/admin/api-observability` | `api-observability` | PRD-106 |
| `/admin/trigger-workflows` | `trigger-workflows` | PRD-97 |
| `/admin/backups` | `backup-recovery` | PRD-81 |
| `/admin/budgets` | `budget-quota` | PRD-93 |
| `/admin/gpu-scheduling` | `gpu-power` | PRD-87 |
| `/admin/disk-usage` | `storage-visualizer` | PRD-19 |
| `/admin/failure-analytics` | `failure-analytics` | PRD-64 |
| `/admin/importer` | `importer` | PRD-16 |
| `/settings/shortcuts` | `shortcuts` | PRD-52 |
| `/settings/wiki` | `wiki` | PRD-56 |
| `/projects` | `projects` | PRD-112 |
| `/projects/$projectId` | `projects` | PRD-112 |
| `/projects/$projectId/characters/$characterId` | `characters` | PRD-112 |

---

## Correctly Unrouted (Overlays / Framework / Embedded Widgets)

These features are designed as overlays, framework-level utilities, or global widgets.
They do NOT need their own routes.

| Feature Dir | PRD | Reason |
|-------------|-----|--------|
| `bug-report` | PRD-44 | Modal/dialog triggered from UI |
| `collaboration` | PRD-11 | Presence indicators and lock badges embedded in entity views |
| `command-palette` | PRD-31 | Global Cmd+K overlay |
| `job-tray` | PRD-54 | Background job notification tray (global overlay) |
| `layout` | PRD-30 | Panel management framework component |
| `onboarding` | PRD-53 | First-run guided tours and contextual hints (overlay) |
| `progressive-disclosure` | PRD-32 | Focus mode, advanced drawers (framework component) |
| `qa-aids` | PRD-37 | Ghosting, ROI, jog dial tools embedded in review player |
| `video-player` | PRD-83 | Video playback engine embedded in review/cinema views |
| `workspace` | PRD-04 | Session/workspace persistence (store/framework) |
| `footer` | PRD-117 | System status footer bar (global widget in AppShell) |
| `setup-wizard` | PRD-105 | Platform setup wizard (first-run overlay flow) |
| — | PRD-126 | Bug fixes & UX polish (cross-cutting, no standalone UI) |
| `scenes` | PRD-127 | ArtifactTimeline embedded in ClipCard (scene detail page) |
| `projects` | PRD-128 | ReadinessIndicators embedded in CharacterCard (project character grid) |
| `characters` | PRD-133 | Metadata approval controls embedded in CharacterMetadataTab |
| `character-review` | PRD-129 | `/review/my-reviews` (MyReviewsPage), `/projects/$projectId/review-assignments` (AssignmentDashboard), Review tab + controls in CharacterDetailPage |

---

## Missing Routes (Need Host-Page Integration)

These features are implemented as embedded components. They need integration into
existing host pages, not standalone routes.

| Feature Dir | PRD | Title | Embed Location |
|-------------|-----|-------|----------------|
| `embedding` | PRD-76 | Character identity embeddings | Character detail / Character Dashboard |
| `estimation` | PRD-61 | Cost & resource estimation | Generation page, Batch production page |
| `metadata` | PRD-13 | Metadata viewer/editor | Scene/character detail views |
| `metadata-editor` | PRD-66 | Character metadata editor | Character detail / Character Dashboard |
| `provenance` | PRD-69 | Generation provenance viewer | Generation page, asset detail views |
| `resolution` | PRD-59 | Multi-resolution tier controls | Generation page, Scene type editor |
| `restitching` | PRD-25 | Segment re-stitching controls | Scene detail, segment views |
| `review` | PRD-35 | Approval/finalization flow | Review Notes, QA Gates pages |
| `trimming` | PRD-78 | Segment trimming editor | Scene detail, segment views |
| `sidecar` | PRD-40 | VFX sidecar & dataset export | Production / delivery pages |
| `directors-view` | PRD-55 | Director's view (mobile/tablet) | Responsive layout variant |
| `regression` | PRD-65 | Workflow regression testing | Tools section |
| `comparison` | PRD-68 | Cross-character scene comparison | Review section |
| `auto-retry` | PRD-71 | Smart auto-retry UI | Job/queue views |
| `project-lifecycle` | PRD-72 | Project lifecycle & archival | Projects pages (extends) |
| `reports` | PRD-73 | Production reporting & data export | Production section |
| `system-health` | PRD-80 | System health page | Admin section |
| `sensitivity` | PRD-82 | Content sensitivity controls | Settings or embedded |
| `qa-rulesets` | PRD-91 | Custom QA rulesets per scene type | Review section |
| `batch-review` | PRD-92 | Batch review & approval workflows | Review section |
| `consistency` | PRD-94 | Character consistency report | Content section |
| `poster-frame` | PRD-96 | Poster frame & thumbnail selection | Scene/video views |
| `scene-types` | PRD-100 | Scene type inheritance & composition | Scene catalog page (extends) |
| `segment-comparison` | PRD-101 | Segment regeneration comparison | Segment views |
| `compliance` | PRD-102 | Video compliance checker | Production section |
| `prompt-management` | PRD-115 | Generation strategy & workflow prompts | Tools section |
| `scenes` | PRD-121 | SVI clip management | Scene detail (ClipGallery embedded) |
| `characters` | PRD-124 | Speech & TTS repository | Character detail page (Speech tab) |
| `characters` | PRD-125 | LLM-driven metadata refinement | Character detail page (Metadata tab) |

---

## No Frontend (Backend / Script Only)

These PRDs have no frontend component or their frontend is entirely contained
within other PRDs' pages.

| PRD | Title | Reason |
|-----|-------|--------|
| PRD-00 | Database Schema | Backend only |
| PRD-02 | REST API Scaffold | Backend only |
| PRD-03 | Video Processing Pipeline | Backend only |
| PRD-05 | Authentication & Authorization | Auth framework (login page is PRD-12) |
| PRD-07 | Event System (SSE) | Backend only |
| PRD-09 | Metadata Engine | Backend only |
| PRD-10 | Storage Layer | Backend only |
| PRD-14 | Character Import Pipeline | Backend only |
| PRD-17 | Seed Image Management | Backend only (UI in PRD-21) |
| PRD-22 | Thumbnail Pipeline | Backend only |
| PRD-47 | ComfyUI Integration | Backend only |
| PRD-109 | Scene Video Version Pipeline | Backend only (UI in PRD-111) |
| PRD-120 | Scene & Workflow Naming Hierarchy | Python generation script only |
| PRD-123 | Scene Catalog & Scene Types Unification | Backend migration + UI absorbed into PRD-111 route |
| PRD-130 | Unified Cloud & ComfyUI Orchestration | Backend only (UI in PRD-131) |

---

## Maintenance Instructions

**When wiring up a missing-route feature:**

1. Add the route to `apps/frontend/src/app/router.tsx`
2. Add the nav entry to `apps/frontend/src/app/navigation.ts`
3. Create a page wrapper in `apps/frontend/src/app/pages/` if needed
4. Move the entry from "Missing Routes" to "Routed Features"
5. Update the Summary counts at the top
6. Update the "Last updated" date

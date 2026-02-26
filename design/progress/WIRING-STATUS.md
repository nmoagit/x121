# Frontend Wiring Status

Tracks which completed PRDs have frontend features that are accessible via routes/navigation
versus those that are implemented but unreachable by users.

**Last updated:** 2026-02-26

## Summary

| Category | Count |
|----------|-------|
| Routed (accessible via sidebar/nav) | 40 |
| Correctly unrouted (overlays/framework/embedded) | 10 |
| Missing routes (should be wired up) | 20 |

---

## Routed Features (Accessible)

These features have routes in `router.tsx` and entries in `navigation.ts`.

| Route | Feature Dir | PRD |
|-------|-------------|-----|
| `/` | `dashboard` | PRD-42 |
| `/performance` | `dashboard` | PRD-41 |
| `/content/scenes` | `scenes` | PRD-01 |
| `/content/characters` | `characters` | PRD-01 |
| `/content/library` | `library` | PRD-60 |
| `/content/storyboard` | `storyboard` | PRD-62 |
| `/content/images` | `images` | PRD-21 |
| `/content/scene-types` | `scene-types` | PRD-23 |
| `/content/character-dashboard` | `character-dashboard` | PRD-108 |
| `/production/queue` | `queue` | PRD-08 |
| `/production/generation` | `generation` | PRD-24 |
| `/production/test-shots` | `test-shots` | PRD-58 |
| `/production/batch` | `production` | PRD-57 |
| `/production/delivery` | `delivery` | PRD-39 |
| `/production/checkpoints` | `checkpoints` | PRD-28 |
| `/review/annotations` | `annotations` | PRD-70 |
| `/review/notes` | `review-notes` | PRD-38 |
| `/review/production-notes` | `production-notes` | PRD-95 |
| `/review/qa-gates` | `quality-gates` | PRD-49 |
| `/review/cinema` | `cinema` | PRD-36 |
| `/tools/prompts` | `prompt-editor` | PRD-63 |
| `/tools/workflows` | `workflow-canvas` | PRD-33 |
| `/tools/config` | `config-templates` | PRD-74 |
| `/tools/presets` | `presets` | PRD-27 |
| `/tools/search` | `search` | PRD-20 |
| `/tools/branching` | `branching` | PRD-50 |
| `/admin/hardware` | `admin` | PRD-06 |
| `/admin/workers` | `workers` | PRD-46 |
| `/admin/integrity` | `integrity` | PRD-43 |
| `/admin/audit` | `audit` | PRD-45 |
| `/admin/reclamation` | `admin` | PRD-15 |
| `/admin/storage` | `storage` | PRD-48 |
| `/admin/downloads` | `downloads` | PRD-104 |
| `/admin/api-keys` | `api-keys` | PRD-12 |
| `/admin/extensions` | `extensions` | PRD-85 |
| `/admin/maintenance` | `maintenance` | PRD-18 |
| `/admin/onboarding-wizard` | `onboarding-wizard` | PRD-67 |
| `/admin/legacy-import` | `legacy-import` | PRD-86 |
| `/admin/readiness` | `readiness` | PRD-107 |
| `/settings/shortcuts` | `shortcuts` | PRD-52 |
| `/settings/wiki` | `wiki` | PRD-56 |
| `/content/scene-catalog` | `scene-catalog` | PRD-111 |

---

## Correctly Unrouted (Overlays / Framework / Embedded Widgets)

These features are designed to be embedded in other views, used as overlays, or provide
framework-level functionality. They do NOT need their own routes.

| Feature Dir | PRD | Reason |
|-------------|-----|--------|
| `bug-report` | PRD-44 | Modal/dialog triggered from UI, not a page |
| `collaboration` | PRD-11 | Presence indicators and lock badges embedded in entity views |
| `command-palette` | PRD-31 | Global Cmd+K overlay |
| `job-tray` | PRD-54 | Background job notification tray (global overlay) |
| `layout` | PRD-30 | Panel management framework component |
| `onboarding` | PRD-53 | First-run guided tours and contextual hints (overlay) |
| `progressive-disclosure` | PRD-32 | Focus mode, advanced drawers (framework component) |
| `qa-aids` | PRD-37 | Ghosting, ROI, jog dial tools embedded in review player |
| `video-player` | PRD-83 | Video playback engine embedded in review/cinema views |
| `workspace` | PRD-04 | Session/workspace persistence (store/framework, not a page) |

---

## Missing Routes (Should Be Wired Up)

These features are implemented but have no route or navigation entry. Each needs either:
- A dedicated route + nav entry, OR
- Integration into an existing page (noted in "Suggested Location" column)

### Standalone pages needed

| Feature Dir | PRD | Title | Suggested Route | Suggested Nav Group | Status |
|-------------|-----|-------|-----------------|---------------------|--------|
| `projects` | PRD-01 | Project list & hub | `/projects` | Dashboard | `todo` |
| `debugger` | PRD-34 | Interactive job debugger | `/production/debugger` | Production | `todo` |
| `batch-metadata` | PRD-88 | Batch metadata operations | `/tools/batch-metadata` | Tools | `todo` |
| `duplicates` | PRD-79 | Character duplicate detection | `/content/duplicates` | Content | `todo` |
| `failure-analytics` | PRD-64 | Failure pattern tracking | `/admin/failure-analytics` | Admin | `todo` |
| `importer` | PRD-16 | Bulk folder importer | `/admin/importer` | Admin | `todo` |
| `pipeline-hooks` | PRD-77 | Pipeline stage hook config | `/tools/pipeline-hooks` | Tools | `todo` |
| `temporal` | PRD-26 | Temporal continuity analysis | `/review/temporal` | Review | `todo` |
| `workflow-import` | PRD-75 | Workflow import uploader | `/tools/workflow-import` | Tools | `todo` |
| `undo` | PRD-51 | Undo tree visualization | `/tools/undo` | Tools | `todo` |

### Embedded in existing pages (need integration, not standalone routes)

| Feature Dir | PRD | Title | Embed Location | Status |
|-------------|-----|-------|----------------|--------|
| `embedding` | PRD-76 | Character identity embeddings | Character detail / Character Dashboard | `todo` |
| `estimation` | PRD-61 | Cost & resource estimation | Generation page, Batch production page | `todo` |
| `metadata` | PRD-13 | Metadata viewer/editor | Scene/character detail views | `todo` |
| `metadata-editor` | PRD-66 | Character metadata editor | Character detail / Character Dashboard | `todo` |
| `provenance` | PRD-69 | Generation provenance viewer | Generation page, asset detail views | `todo` |
| `resolution` | PRD-59 | Multi-resolution tier controls | Generation page, Scene type editor | `todo` |
| `restitching` | PRD-25 | Segment re-stitching controls | Scene detail, segment views | `todo` |
| `review` | PRD-35 | Approval/finalization flow | Review Notes, QA Gates pages | `todo` |
| `trimming` | PRD-78 | Segment trimming editor | Scene detail, segment views | `todo` |

---

## PRDs Still in Planning (No Frontend Yet)

These PRDs are not yet implemented. When completed, their frontend features must be
added to this tracker and wired into the router.

### High Priority

| PRD | Title | Expected Route/Location |
|-----|-------|------------------------|
| ~~PRD-111~~ | ~~Scene Catalog & Track Management~~ | Routed at `/content/scene-catalog` |
| PRD-112 | Project Hub & Management | `/projects` (new page) |
| PRD-113 | Character Ingest Pipeline | `/admin/ingest` or modal wizard |
| PRD-114 | Cloud GPU Provider Integration | `/admin/cloud-gpu` |
| PRD-115 | Generation Strategy & Workflow Prompt Management | `/tools/generation-strategy` |
| PRD-116 | Dynamic File & Entity Naming Engine | `/settings/naming` or `/admin/naming` |
| PRD-117 | System Status Footer Bar | Global footer (no route needed) |
| PRD-118 | Live Activity Console & Logging System | `/tools/activity-console` (dedicated page) + dockable panel (no route needed for panel) |
| PRD-119 | Time-Based Job Scheduling | `/production/schedule` |

### Standard Priority

| PRD | Title | Expected Route/Location |
|-----|-------|------------------------|
| PRD-19 | Disk Space Visualizer (Treemap) | `/admin/disk-usage` |
| PRD-40 | VFX Sidecar & Dataset Export | `/production/export` |
| PRD-55 | Director's View (Mobile/Tablet) | Responsive layout variant |
| PRD-65 | Workflow Regression Testing | `/tools/regression-tests` |
| PRD-68 | Cross-Character Scene Comparison | `/review/comparison` |
| PRD-71 | Smart Auto-Retry | Embedded in job/queue views |
| PRD-72 | Project Lifecycle & Archival | `/projects` (extends) |
| PRD-73 | Production Reporting & Data Export | `/production/reports` |
| PRD-80 | System Health Page | `/admin/health` |
| PRD-81 | Backup & Disaster Recovery | `/admin/backups` |
| PRD-82 | Content Sensitivity Controls | Settings or embedded |
| PRD-84 | External Review / Shareable Preview Links | `/review/share` |
| PRD-87 | GPU Power Management & Idle Scheduling | `/admin/gpu-scheduling` |
| PRD-89 | Dashboard Widget Customization | Dashboard (extends) |
| PRD-90 | Render Queue Timeline / Gantt View | `/production/timeline` |
| PRD-91 | Custom QA Rulesets per Scene Type | `/review/qa-rules` |
| PRD-92 | Batch Review & Approval Workflows | `/review/batch` |
| PRD-93 | Generation Budget & Quota Management | `/admin/budgets` |
| PRD-94 | Character Consistency Report | `/content/consistency` |
| PRD-96 | Poster Frame & Thumbnail Selection | Embedded in scene/video views |
| PRD-97 | Job Dependency Chains & Triggered Workflows | `/production/dependencies` |
| PRD-98 | Session Management & Active Users | `/admin/sessions` |
| PRD-99 | Webhook & Integration Testing Console | `/admin/webhook-testing` |
| PRD-100 | Scene Type Inheritance & Composition | `/content/scene-types` (extends) |
| PRD-101 | Segment Regeneration Comparison | Embedded in segment views |
| PRD-102 | Video Compliance Checker | `/production/compliance` |
| PRD-103 | Character Face Contact Sheet | `/content/contact-sheet` |
| PRD-104 | Model & LoRA Download Manager | Already routed at `/admin/downloads` |
| PRD-105 | Platform Setup Wizard | First-run flow (overlay) |
| PRD-106 | API Usage & Observability Dashboard | `/admin/api-usage` |
| PRD-110 | Admin Platform Settings Panel | `/admin/settings` |

---

## Maintenance Instructions

**When completing a PRD that includes frontend work:**

1. Add the feature to the appropriate section above (Routed, Correctly Unrouted, or Missing Routes)
2. If the feature needs a route, add it to `router.tsx` and `navigation.ts`
3. Move the entry from "PRDs Still in Planning" to the correct wired-up section
4. Update the Summary counts at the top
5. Update the "Last updated" date

**When wiring up a missing route:**

1. Add the route to `apps/frontend/src/app/router.tsx`
2. Add the nav entry to `apps/frontend/src/app/navigation.ts`
3. Create a page wrapper in `apps/frontend/src/app/pages/` if needed
4. Move the entry from "Missing Routes" to "Routed Features"
5. Mark status as `done` and update counts

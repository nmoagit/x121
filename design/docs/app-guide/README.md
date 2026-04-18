# αN2N App Guide

LaTeX → PDF documentation of every page, tab, modal and icon in the app, with screenshots and commentary.

Pattern adapted from `reesets_app/docs/portal-guide/`, with improvements:
- Multiple screenshots per page (per prominent section, not just one hero shot).
- Every tab and every modal screenshotted individually.
- Pipeline workspace (`x121 — adult content`) covered as a dedicated chapter.
- Full icon-semantics appendix.

## Layout

```
app-guide/
├── main.tex               # Master document (imports chapters)
├── preamble.tex           # Packages, colours, custom commands
├── build.sh               # Builds main + per-chapter PDFs
├── README.md              # This file
├── chapters/              # One .tex per chapter
├── screenshots/           # PNG/JPG captures referenced from chapters
│   └── icons/             # Icon glyphs for the icon appendix
└── out/chapters/          # Per-chapter standalone PDFs (generated)
```

## Build

```bash
cd design/docs/app-guide
./build.sh
```

Outputs:
- `main.pdf` — full guide
- `out/chapters/<chapter>.pdf` — one per chapter

Missing screenshots render as "Screenshot pending" boxes so the document builds even before capture is complete.

## Capture workflow

Captures run via Playwright against the live dev DB. The specs are strictly
read-only — they log in, navigate, and screenshot. They do not submit forms or
mutate data.

### Prereqs
- Dev server running at `http://localhost:5173` with basepath `/an2n`.
- A super-admin account in the running dev DB.
- Pipeline `x121` exists (required for the pipeline-pass spec `17-pipeline-workspace-x121`).
- Credentials exported via env:
  ```bash
  export E2E_USERNAME=<super-admin-username>
  export E2E_PASSWORD=<super-admin-password>
  # Optional overrides:
  export E2E_BASE_URL=http://localhost:5173/an2n   # default
  export E2E_PIPELINE_CODE=x121                    # default
  ```

### Run the captures

From the frontend workspace:
```bash
cd apps/frontend
pnpm capture              # all chapters, sequential
pnpm capture:chapter 05   # single chapter by numeric prefix
```

Screenshots land in `design/docs/app-guide/screenshots/` with names matching the
`\screenshot{...}` placeholders in the `.tex` chapters. Missing captures simply
render as "Screenshot pending" boxes in the PDF — the build never fails on
missing art.

### Two passes, one run

The specs cover both passes in one execution:
1. **Global pass** (specs 02–16, A) — walks the global sidebar groups.
2. **Pipeline pass** (spec 17) — walks `x121`'s pipeline-scoped sidebar.

Only `x121` is deep-dived; other pipelines are not captured separately.

### Special cases
- **Appendix B (icons)** is a stub — icon glyphs are captured manually from Storybook (easiest) into `screenshots/icons/<IconName>.png`.
- **External review share link** (`/review/share/$token`) is token-gated and best captured by hand with a valid token.
- **Email templates** and other public flows are out of scope for this edition.

Screenshot file naming: `<chapter>-<slug>[-<variant>].png`. Example: `05-projects-detail-overview-tab.png`. Slugs match the filenames in the `.tex` chapters.

## Conventions

LaTeX commands (see `preamble.tex`):
- `\screenshot{file}{caption}` — single figure with graceful fallback.
- `\screenshotpair{file1}{cap1}{file2}{cap2}` — two side-by-side figures.
- `\pagelement{Name}{Description}` — list entry for a UI element.
- `\route{/content/media}` — formats a route path.
- `\tab{Overview}` — formats a tab name.
- Callout environments: `designnote`, `integritynote`, `rolenote`, `warningnote`, `futureidea`.

Icons reference (`\iconrow`) expects PNGs under `screenshots/icons/<IconName>.png`. Easiest way to produce them:
1. Use Storybook (if wired up) to render each Lucide icon on a white/transparent bg and save at 48×48.
2. Or render a small HTML page of icons and screenshot each glyph.

## Chapter index

See `main.tex` for the canonical order. At a glance:

| # | File | Covers |
|---|------|--------|
| 00 | `00-introduction.tex` | Purpose, audience, how to read this guide |
| 01 | `01-app-shell.tex` | AppShell, Sidebar, Header, UserMenu, StatusFooter, ActivityConsoleDrawer, PageGuideBanner |
| 02 | `02-auth-public.tex` | LoginPage, ExternalReviewPage |
| 03 | `03-pipeline-selector.tex` | `/` pipeline selector grid |
| 04 | `04-dashboard.tex` | Dashboard, Performance, Dashboard Customize |
| 05 | `05-projects.tex` | ProjectListPage, ProjectDetailPage (all tabs), AssignmentDashboard |
| 06 | `06-avatars.tex` | AvatarsPage (browse), AvatarDetailPage (all tabs) |
| 07 | `07-content-media-scenes.tex` | Media, Scenes, Derived Clips |
| 08 | `08-content-library-catalogue.tex` | Library, Scene Catalogue, Storyboard, Avatar Dashboard, Contact Sheet, Duplicates |
| 09 | `09-production.tex` | Queue, Generation, Test Shots, Batch, Delivery, Checkpoints, Debugger, Render Timeline |
| 10 | `10-review.tex` | Annotations, Reviews, Notes, Production Notes, QA Gates, Cinema, Temporal |
| 11 | `11-tools.tex` | Workflows, Prompts, Config, Presets, Search, Branching, Activity Console, Avatar Ingest, Batch Metadata, Pipeline Hooks, Workflow Import, Undo |
| 12 | `12-admin-pipelines-infra.tex` | Pipelines (list/detail), Infrastructure, Cloud GPUs, Storage, Queue Manager, Output Profiles, Hardware, Workers, Health |
| 13 | `13-admin-data.tex` | Naming Rules, Integrity, Audit, Reclamation, Downloads, Backups, Disk Usage, Failure Analytics |
| 14 | `14-admin-config.tex` | API Keys, Extensions, Maintenance, Settings, Themes, Config Import, Importer, Legacy Import |
| 15 | `15-admin-ops.tex` | Job Scheduling, Session Management, Webhook Testing, API Observability, Trigger Workflows, Budgets, GPU Scheduling, Readiness, Onboarding Wizard |
| 16 | `16-settings.tex` | Shortcuts, Wiki |
| 17 | `17-pipeline-workspace-x121.tex` | Pipeline workspace deep-dive using `x121` |
| A | `A-appendix-modals.tex` | Complete modal index (60+) |
| B | `B-appendix-icons.tex` | Complete icon reference (130+) |

## Resolved decisions

1. **Scope.** `x121` is the only pipeline deep-dived.
2. **Capture account.** Super-admin.
3. **Out of scope.** Public email templates and external-share-link variants.
4. **Data source.** Live dev DB (no seed script). Captures are read-only and do not mutate.

These are documented in `chapters/00-introduction.tex`.

# DRY Tracker — Components & Functions Under Watch

Ongoing log of components, functions, patterns, and utilities that the DRY-GUY agent has flagged or that developers have identified as candidates for deduplication, extraction, or sharing.

**Purpose:** Prevent duplication before it happens. When implementing a new PRD, check this list first — if something similar already exists, reuse it instead of building from scratch.

**Process:**
1. After every significant implementation, run the `dry-guy` agent
2. Record any flagged patterns, near-duplicates, or extraction candidates here
3. When a shared utility is created from a DRY finding, move the entry to the "Resolved" section
4. Reference this log in PRs that touch flagged areas

---

## Status Legend

| Status | Meaning |
|--------|---------|
| `watch` | Identified as potential duplication risk — monitor as more PRDs are implemented |
| `flagged` | DRY-GUY has flagged active duplication — extraction needed |
| `in-progress` | Shared utility/component is being extracted |
| `resolved` | Shared utility created and all consumers refactored to use it |

---

## Active Watch List

### Database & Backend Patterns

| ID | Pattern / Component | PRDs Involved | Status | Notes |
|----|---------------------|---------------|--------|-------|
| DRY-001 | `DbId` type alias (`i64`) usage consistency | All PRDs | `watch` | Defined in PRD-000. Every module must use `DbId`, not raw `i64` for IDs |
| DRY-002 | Status lookup table query patterns | All PRDs with status FKs | `watch` | Expect repeated `JOIN {domain}_statuses` patterns — candidate for shared query helpers |
| DRY-003 | CRUD handler boilerplate (list/get/create/update/delete) | PRD-01, PRD-02, and all entity PRDs | `watch` | Axum handlers will repeat the same patterns — candidate for macro or generic handler |
| DRY-004 | Pagination query pattern | PRD-20, PRD-42, PRD-73, all list endpoints | `watch` | `LIMIT/OFFSET` or cursor-based pagination will appear in many handlers |
| DRY-005 | `updated_at` trigger creation in migrations | All PRDs with tables | `watch` | Trigger function defined once in PRD-000; each table just adds the trigger. Watch for copy-paste divergence |
| DRY-006 | Error response formatting | PRD-02 and all API PRDs | `watch` | Constraint violation → user-friendly error translation will be needed everywhere |
| DRY-007 | FK index creation pattern in migrations | All PRDs with tables | `watch` | Every FK needs `CREATE INDEX idx_{table}_{col}` — easy to forget or name inconsistently |

### Frontend Patterns

| ID | Pattern / Component | PRDs Involved | Status | Notes |
|----|---------------------|---------------|--------|-------|
| DRY-020 | Status badge/chip component | PRD-29, PRD-35, PRD-42, PRD-54 | `watch` | Status display (colored badge with lookup name) will appear in many views |
| DRY-021 | Data table with sort/filter/pagination | PRD-29, PRD-20, PRD-42, PRD-73 | `watch` | Reusable table component needed early — many PRDs will need it |
| DRY-022 | Confirmation dialog (destructive actions) | PRD-29, PRD-15, PRD-72 | `watch` | CASCADE deletes require confirmation — shared dialog needed |
| DRY-023 | Image thumbnail/preview component | PRD-21, PRD-62, PRD-83, PRD-96 | `watch` | Multiple PRDs display image/video thumbnails — one component |
| DRY-024 | Progress indicator (job/generation) | PRD-24, PRD-54, PRD-57, PRD-90 | `watch` | Generation progress bars/strips appear across many views |
| DRY-025 | Side-by-side comparison layout | PRD-22, PRD-68, PRD-101 | `watch` | Image and video comparison views share the same layout pattern |
| DRY-026 | Form validation patterns | PRD-14, PRD-23, PRD-66 | `watch` | Input validation with error display will repeat across all forms |

### API & Data Fetching

| ID | Pattern / Component | PRDs Involved | Status | Notes |
|----|---------------------|---------------|--------|-------|
| DRY-040 | React Query / data fetching hooks | All frontend PRDs | `watch` | `useQuery`/`useMutation` patterns will repeat — establish hook conventions early |
| DRY-041 | WebSocket event subscription pattern | PRD-05, PRD-10, PRD-11 | `watch` | Real-time updates from event bus will be consumed by many components |
| DRY-042 | File upload handling | PRD-16, PRD-21, PRD-86 | `watch` | Multiple PRDs accept file uploads — shared upload component + backend handler |
| DRY-043 | CSV/report export pattern | PRD-22, PRD-73, PRD-94 | `watch` | Several PRDs export data as CSV — shared export utility |

### Pipeline & Generation

| ID | Pattern / Component | PRDs Involved | Status | Notes |
|----|---------------------|---------------|--------|-------|
| DRY-060 | FFmpeg command builder | PRD-24, PRD-25, PRD-39, PRD-83 | `watch` | Multiple PRDs call FFmpeg for frame extraction, stitching, transcoding — shared builder |
| DRY-061 | Image quality scoring | PRD-22, PRD-49, PRD-76 | `watch` | Quality assessment (sharpness, face detection) used by multiple QA PRDs |
| DRY-062 | ComfyUI workflow submission pattern | PRD-05, PRD-24, PRD-58 | `watch` | Workflow dispatch to ComfyUI will be called from multiple orchestrators |

---

## Resolved

| ID | Original Pattern | Resolution | Shared Location | Date |
|----|-----------------|------------|-----------------|------|
| — | — | — | — | — |

---

## DRY-GUY Audit Log

Record of every DRY-GUY audit run against the codebase.

| Date | PRD(s) Touched | Files Audited | Findings | Action Taken |
|------|---------------|---------------|----------|--------------|
| 2026-02-20 | Phase -1 scaffold | 33 (11 Rust, 14 Frontend, 8 Infra) | 6 (0 critical, 3 medium, 3 low) | Fixed CI DATABASE_URL dedup, vitest config merge, Storybook color comment. Watch: tracing init, Docker anchors. |

---

## How to Use This File

### When Starting a New PRD Implementation
1. Read the "Active Watch List" section
2. Check if your PRD is mentioned in any existing DRY entry
3. If yes, check whether a shared utility already exists (see "Resolved" section)
4. If a shared utility exists, use it. If not, build one and resolve the DRY entry.

### After Implementing Code
1. Run `dry-guy` agent on all changed files
2. If new patterns are flagged, add them to the "Active Watch List"
3. If existing patterns are resolved, move them to "Resolved" with the shared location

### When Reviewing PRs
1. Check if the PR introduces code that matches any `watch` or `flagged` entries
2. If so, request that the author use the shared utility or extract one
3. Block merge until DRY-GUY audit passes

---

## Version History

- **v1.0** (2026-02-18): Initial creation with pre-identified watch patterns from PRD analysis

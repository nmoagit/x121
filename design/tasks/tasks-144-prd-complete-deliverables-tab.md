# Task List: Complete Deliverables Tab

**PRD Reference:** `design/prds/144-prd-complete-deliverables-tab.md`
**Scope:** Add speech section to deliverables tab, tie initial section selection to blocking_deliverables config.

## Overview

This is a frontend-only change to `AvatarDeliverablesTab.tsx`. We add "speech" as a fourth section using the existing `useSpeechCompleteness` hook, and change the initial `visibleSections` state from "all selected" to "only blocking deliverables selected." No backend changes needed — all APIs already exist.

### What Already Exists
- `useSpeechCompleteness(avatarId)` hook in `use-avatar-speeches.ts` — returns `CompletenessSummary` with `breakdown` entries
- `TerminalSection` component — used by existing sections
- `blocking_deliverables` on the Project record — accessed via `useProject(projectId)`
- `SectionFilter` component — dropdown with checkboxes per section
- `SECTION_KEYS`, `SectionKey`, `SECTION_LABELS` constants
- `ROW_CLASS`, `ROW_ICON_CLASS`, etc. — shared row styling

### What We're Building
1. `SpeechRow` component for individual speech type × language entries
2. Speech section in the tab body
3. Initial selection logic tied to `blocking_deliverables`
4. Visual distinction for non-blocking sections

### Key Design Decisions
1. Speech section uses the same `TerminalSection` + row pattern as other sections
2. Initial visibility derived from project's `blocking_deliverables` array (default: `["metadata", "images", "scenes"]`)
3. "scenes" in blocking_deliverables maps to "scene-videos" section key
4. Section filter dropdown shows blocking status next to each label

---

## Phase 1: Add Speech Section

### Task 1.1: Extend section constants [COMPLETE]
**File:** `apps/frontend/src/features/avatars/tabs/AvatarDeliverablesTab.tsx`

Add "speech" to `SECTION_KEYS` and `SECTION_LABELS`.

```typescript
const SECTION_KEYS = ["metadata", "images", "scene-videos", "speech"] as const;

const SECTION_LABELS: Record<SectionKey, string> = {
  metadata: "Metadata",
  images: "Images",
  "scene-videos": "Scene Videos",
  speech: "Speech",
};
```

**Acceptance Criteria:**
- [x] `SECTION_KEYS` includes "speech"
- [x] `SECTION_LABELS` has "Speech" entry
- [x] `SectionKey` type includes "speech"

### Task 1.2: Create SpeechRow component [COMPLETE]
**File:** `apps/frontend/src/features/avatars/tabs/AvatarDeliverablesTab.tsx`

Add a row component for speech completeness entries. Each row shows: icon, type name, language code, approved/required count, status indicator.

**Acceptance Criteria:**
- [x] `SpeechRow` uses the same `ROW_CLASS` grid as ImageRow/VideoRow
- [x] Shows speech type name, language code/flag, "N/M" approved/required
- [x] Status color: green (complete), orange (partial), red (not_started)
- [x] Follows existing row pattern (icon, title, filename slot shows language, meta shows counts)

### Task 1.3: Add speech section to tab body [COMPLETE]
**File:** `apps/frontend/src/features/avatars/tabs/AvatarDeliverablesTab.tsx`

Add the speech `TerminalSection` after scene-videos, guarded by `visibleSections.has("speech")`.

**Acceptance Criteria:**
- [x] Speech section renders when `visibleSections.has("speech")`
- [x] Uses `useSpeechCompleteness(avatarId)` for data
- [x] Section header shows overall completeness: "Speech (N/M)"
- [x] Renders a `SpeechRow` for each entry in `breakdown`
- [x] Empty state when no speech config
- [x] Loading state while data fetches

---

## Phase 2: Blocking-Based Initial Selection

### Task 2.1: Derive initial visibility from blocking_deliverables [COMPLETE]
**File:** `apps/frontend/src/features/avatars/tabs/AvatarDeliverablesTab.tsx`

Change the initial `visibleSections` state from all-selected to only blocking sections.

**Acceptance Criteria:**
- [x] Fetch project's `blocking_deliverables` via `useProject(projectId)`
- [x] Map blocking keys to section keys: "metadata" → "metadata", "images" → "images", "scenes" → "scene-videos", "speech" → "speech"
- [x] Initial `visibleSections` contains only sections present in `blocking_deliverables`
- [x] If `blocking_deliverables` is null/empty, default to all sections (backward compat)
- [x] User can still toggle any section on/off via the filter dropdown

### Task 2.2: Visual distinction for non-blocking sections [COMPLETE]
**File:** `apps/frontend/src/features/avatars/tabs/AvatarDeliverablesTab.tsx`

Non-blocking (deselected) sections should appear dimmed in the filter dropdown with a "non-blocking" indicator.

**Acceptance Criteria:**
- [x] `SectionFilter` receives `blockingKeys` prop (set of blocking section keys)
- [x] Non-blocking sections show "(optional)" suffix in the filter dropdown
- [x] When a non-blocking section IS toggled on, its `TerminalSection` renders with reduced opacity (0.7) and a small "optional" badge in the header
- [x] Blocking sections render at full opacity with no badge

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/frontend/src/features/avatars/tabs/AvatarDeliverablesTab.tsx` | Main file — all changes here |
| `apps/frontend/src/features/avatars/hooks/use-avatar-speeches.ts` | Existing `useSpeechCompleteness` hook |
| `apps/frontend/src/features/projects/hooks/use-projects.ts` | Existing `useProject` hook for blocking_deliverables |

---

## Dependencies

### Existing Components to Reuse
- `useSpeechCompleteness(avatarId)` from `use-avatar-speeches.ts`
- `useProject(projectId)` from `use-projects.ts`
- `TerminalSection` from `@/components/domain`
- `ROW_CLASS`, `ROW_ICON_CLASS`, `ROW_TITLE_CLASS`, `ROW_META_CLASS` constants
- `Mic` icon from `@/tokens/icons`

### New Infrastructure Needed
- None — all APIs and hooks already exist

---

## Implementation Order

### MVP
1. Phase 1: Add Speech Section — Tasks 1.1-1.3
2. Phase 2: Blocking-Based Initial Selection — Tasks 2.1-2.2

**MVP Success Criteria:**
- Speech completeness visible in deliverables tab
- Non-blocking sections start deselected
- Clear visual distinction between blocking and optional sections

---

## Notes

1. The `blocking_deliverables` array uses "scenes" but the section key is "scene-videos" — need a mapping.
2. `useSpeechCompleteness` returns `CompletenessSummary` with `{ total_slots, filled_slots, completeness_pct, breakdown }`. Each `breakdown` entry has `{ speech_type_name, language_code, required, approved, status }`.
3. The `useSetToggle` hook initializes from an iterable — we need to change it to initialize from the blocking set instead of all keys.

---

## Version History

- **v1.0** (2026-03-23): Initial task list creation from PRD-144

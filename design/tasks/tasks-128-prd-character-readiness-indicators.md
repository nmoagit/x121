# Task List: Character Readiness Indicators on Project Character Cards

**PRD Reference:** `design/prds/128-prd-character-readiness-indicators.md`
**Scope:** Add per-section readiness indicator icons (metadata, images, scenes, speech) to character cards in the project view.

## Overview

The existing `CharacterDeliverableRow` from `GET /projects/{id}/character-deliverables` already returns `images_count`, `images_approved`, `scenes_total`, `scenes_with_video`, and `has_active_metadata`. We only need to add `has_voice_id` to complete the data set. All section readiness computation happens on the frontend using a pure function that maps the deliverable row to per-section states. A new `ReadinessIndicators` component renders 4 vertical icon circles with tooltips and click-to-navigate.

### What Already Exists
- `CharacterDeliverableRow` (backend model + SQL) — has 5 of 6 needed fields
- `CharacterCard.tsx` — target component to add indicators
- `ProjectCharactersTab.tsx` — already fetches `useCharacterDeliverables`, builds `blockingMap`
- `CHARACTER_TABS` constant — tab IDs for navigation
- `Tooltip` design system component — for hover details
- `hasVoiceId()` helper in `characters/types.ts` — speech check logic (frontend only)
- `ReadinessState` type in `readiness/types.ts` — existing state union

### What We're Building
1. Backend: Add `has_voice_id` field to `CharacterDeliverableRow` + SQL query
2. Frontend: `SectionReadiness` type + `computeSectionReadiness()` pure function
3. Frontend: `ReadinessIndicators` component (4 icon circles)
4. Frontend: Wire into `CharacterCard` and `ProjectCharactersTab`

### Key Design Decisions
1. **Frontend-computed readiness** — All section state logic lives in a pure function on the frontend, not a new backend endpoint. The deliverable row already has the raw counts; we just derive states from them.
2. **Extend existing endpoint** — Add `has_voice_id` to the existing `character-deliverables` query rather than creating a new endpoint.
3. **Reuse deliverables data** — `ProjectCharactersTab` already fetches deliverables for `blockingMap`. We extend this to also build a `sectionReadinessMap`.

---

## Phase 1: Backend — Add Voice ID to Deliverable Row

### Task 1.1: Add `has_voice_id` to CharacterDeliverableRow model [COMPLETE]
**File:** `apps/backend/crates/db/src/models/character.rs`

Add `has_voice_id: bool` field to the `CharacterDeliverableRow` struct.

**Acceptance Criteria:**
- [x] `CharacterDeliverableRow` has `pub has_voice_id: bool` field
- [x] Field is positioned after `has_active_metadata`

### Task 1.2: Add voice ID check to deliverable status SQL query [COMPLETE]
**File:** `apps/backend/crates/db/src/repositories/character_repo.rs`

Extend the `list_deliverable_status` SQL query to include a `has_voice_id` column. Use the character's `settings` JSONB to check for a non-empty `elevenlabs_voice` key.

```sql
-- Add to the SELECT clause:
COALESCE(
    c.settings->>'elevenlabs_voice' IS NOT NULL
    AND LENGTH(c.settings->>'elevenlabs_voice') > 0,
    false
) AS has_voice_id
```

**Acceptance Criteria:**
- [x] SQL query returns `has_voice_id` boolean column
- [x] Returns `true` when `settings.elevenlabs_voice` is a non-empty string
- [x] Returns `false` when setting is null, missing, or empty string
- [x] No additional query or JOIN needed (uses existing `c.settings` column)

### Task 1.3: Update frontend CharacterDeliverableRow type [COMPLETE]
**File:** `apps/frontend/src/features/projects/types.ts`

Add `has_voice_id: boolean` to the `CharacterDeliverableRow` interface.

**Acceptance Criteria:**
- [x] `CharacterDeliverableRow` interface includes `has_voice_id: boolean`

---

## Phase 2: Frontend Types & Readiness Computation

### Task 2.1: Define SectionReadiness types and constants [COMPLETE]
**File:** `apps/frontend/src/features/projects/types.ts`

Define the section readiness types, state constants, and display configuration.

```typescript
/** Per-section readiness state. */
export type SectionState = "not_started" | "partial" | "complete" | "error";

/** Readiness data for a single section. */
export interface SectionReadiness {
  state: SectionState;
  label: string;
  current: number;
  total: number;
  tooltip: string;
}

/** The four tracked sections in workflow order. */
export type SectionKey = "metadata" | "images" | "scenes" | "speech";

/** Color CSS variable for each section state. */
export const SECTION_STATE_COLOR: Record<SectionState, string> = {
  not_started: "var(--color-text-muted)",
  partial: "var(--color-status-warning)",
  complete: "var(--color-status-success)",
  error: "var(--color-status-danger)",
};
```

**Acceptance Criteria:**
- [x] `SectionState`, `SectionReadiness`, `SectionKey` types exported
- [x] `SECTION_STATE_COLOR` mapping exported
- [x] Types are in `projects/types.ts` alongside existing `CharacterDeliverableRow`

### Task 2.2: Implement computeSectionReadiness pure function [COMPLETE]
**File:** `apps/frontend/src/features/projects/types.ts`

Create a pure function that computes per-section readiness from a `CharacterDeliverableRow`.

```typescript
export function computeSectionReadiness(
  row: CharacterDeliverableRow,
): Record<SectionKey, SectionReadiness> {
  // Metadata: binary (has_active_metadata)
  const metadata: SectionReadiness = row.has_active_metadata
    ? { state: "complete", label: "Metadata", current: 1, total: 1, tooltip: "Metadata: Complete" }
    : { state: "not_started", label: "Metadata", current: 0, total: 1, tooltip: "Metadata: Not started" };

  // Images: not_started (0 images), partial (images but 0 approved), complete (1+ approved)
  const images: SectionReadiness = row.images_count === 0
    ? { state: "not_started", label: "Images", current: 0, total: 0, tooltip: "Images: No seed images" }
    : row.images_approved === 0
      ? { state: "partial", label: "Images", current: 0, total: row.images_count, tooltip: `Images: ${row.images_count} uploaded, 0 approved` }
      : { state: "complete", label: "Images", current: row.images_approved, total: row.images_count, tooltip: `Images: ${row.images_approved}/${row.images_count} approved` };

  // Scenes: not_started (0 assignments), partial (some without video), complete (all have video)
  const scenes: SectionReadiness = row.scenes_total === 0
    ? { state: "not_started", label: "Scenes", current: 0, total: 0, tooltip: "Scenes: No scenes assigned" }
    : row.scenes_with_video < row.scenes_total
      ? { state: "partial", label: "Scenes", current: row.scenes_with_video, total: row.scenes_total, tooltip: `Scenes: ${row.scenes_with_video}/${row.scenes_total} with video` }
      : { state: "complete", label: "Scenes", current: row.scenes_with_video, total: row.scenes_total, tooltip: `Scenes: ${row.scenes_with_video}/${row.scenes_total} complete` };

  // Speech: binary (has_voice_id)
  const speech: SectionReadiness = row.has_voice_id
    ? { state: "complete", label: "Speech", current: 1, total: 1, tooltip: "Speech: Voice configured" }
    : { state: "not_started", label: "Speech", current: 0, total: 1, tooltip: "Speech: Not configured" };

  return { metadata, images, scenes, speech };
}
```

**Acceptance Criteria:**
- [x] Function is pure (no side effects, no hooks)
- [x] Returns correct state for all section combinations
- [x] Tooltip strings include progress counts where applicable
- [x] Section order in returned object matches workflow order

---

## Phase 3: Frontend — ReadinessIndicators Component

### Task 3.1: Register missing icons in icon tokens [COMPLETE]
**File:** `apps/frontend/src/tokens/icons.ts`

Verify and add any missing icons needed for the indicators. Required: `FileText`, `ImageIcon` (note: Lucide exports `Image` as `ImageIcon` to avoid conflict), `Film`, `Mic`.

**Acceptance Criteria:**
- [x] All four icons are exported from `@/tokens/icons`
- [x] No direct `lucide-react` imports needed in the component

### Task 3.2: Build ReadinessIndicators component [COMPLETE]
**File:** `apps/frontend/src/features/projects/components/ReadinessIndicators.tsx`

Create a component that renders 4 vertically-stacked circle icons with tooltips.

```typescript
interface ReadinessIndicatorsProps {
  readiness: Record<SectionKey, SectionReadiness>;
  projectId: number;
  characterId: number;
}
```

**Implementation details:**
- 4 circles in `flex-col gap-1`, each 24px with 12px icon
- Circle background color from `SECTION_STATE_COLOR[state]`
- Icon color: white for colored states, muted for grey
- Each circle wrapped in `Tooltip` with the section's tooltip text
- Click handler: `navigate({ to: /projects/{pid}/characters/{cid}, search: { tab: sectionKey } })` with `e.stopPropagation()` to prevent card click
- Hover: `cursor-pointer`, slight opacity/scale change
- Section icons (top to bottom): `FileText` (metadata), `ImageIcon` (images), `Film` (scenes), `Mic` (speech)

**Acceptance Criteria:**
- [x] Renders 4 circles vertically with correct icons
- [x] Circle background color reflects section state
- [x] Tooltip shows on hover with progress detail
- [x] Click navigates to character detail page with correct tab
- [x] Click does not bubble to parent card
- [x] Uses design system `Tooltip` component
- [x] Icons imported from `@/tokens/icons`
- [x] Uses `useNavigate` from TanStack Router

---

## Phase 4: Frontend — Integration into CharacterCard

### Task 4.1: Add sectionReadiness prop to CharacterCard [COMPLETE]
**File:** `apps/frontend/src/features/projects/components/CharacterCard.tsx`

Add an optional `sectionReadiness` prop and render `ReadinessIndicators` on the right side of the card info area.

```typescript
interface CharacterCardProps {
  // ... existing props
  sectionReadiness?: Record<SectionKey, SectionReadiness>;
  projectId?: number;  // needed for navigation
}
```

**Layout adjustment:** Add the indicators as an absolute-positioned or flex-aligned element on the right side of the info area, vertically centered.

**Acceptance Criteria:**
- [x] `CharacterCard` accepts optional `sectionReadiness` and `projectId` props
- [x] When `sectionReadiness` is provided, renders `ReadinessIndicators` on the right
- [x] When not provided, card renders identically to before (backward compatible)
- [x] Indicators do not overlap avatar, name, badges, or blocking reasons
- [x] Card layout works at all responsive breakpoints

### Task 4.2: Wire readiness data in ProjectCharactersTab [COMPLETE]
**File:** `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx`

Build a `sectionReadinessMap` from the existing `deliverables` data and pass it through to `CharacterCard`.

**Implementation:**
1. In `ProjectCharactersTab`, add a `useMemo` that builds `Map<number, Record<SectionKey, SectionReadiness>>` from `deliverables` using `computeSectionReadiness()`
2. Pass the map through `GroupSection` to `CharacterCard`
3. Also pass `projectId` to `CharacterCard`

**Acceptance Criteria:**
- [x] `sectionReadinessMap` computed from existing `deliverables` data (no new fetch)
- [x] Map is memoized with `useMemo`
- [x] `GroupSection` props extended to accept and forward readiness map
- [x] Each `CharacterCard` receives its readiness data from the map
- [x] `projectId` passed to `CharacterCard` for navigation

### Task 4.3: TypeScript verification [COMPLETE]
**Files:** All modified files

Run `npx tsc --noEmit` to verify zero TypeScript errors.

**Acceptance Criteria:**
- [x] `npx tsc --noEmit` exits with 0 errors
- [x] No unused imports or variables
- [x] All new types are properly exported and imported

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/backend/crates/db/src/models/character.rs` | Add `has_voice_id` to `CharacterDeliverableRow` |
| `apps/backend/crates/db/src/repositories/character_repo.rs` | Extend SQL query with voice ID check |
| `apps/frontend/src/features/projects/types.ts` | `SectionReadiness` types, `computeSectionReadiness()` |
| `apps/frontend/src/tokens/icons.ts` | Verify/add icon exports |
| `apps/frontend/src/features/projects/components/ReadinessIndicators.tsx` | NEW: 4-circle indicator component |
| `apps/frontend/src/features/projects/components/CharacterCard.tsx` | Add readiness prop + render indicators |
| `apps/frontend/src/features/projects/tabs/ProjectCharactersTab.tsx` | Build readiness map, pass through |

---

## Dependencies

### Existing Components to Reuse
- `Tooltip` from `@/components/primitives`
- `useNavigate` from `@tanstack/react-router`
- `FileText`, `ImageIcon`, `Film`, `Mic` from `@/tokens/icons`
- `CHARACTER_TABS` from `features/projects/types.ts`
- `useCharacterDeliverables` hook (already fetched in tab)
- `CharacterDeliverableRow` type (already defined)

### New Infrastructure Needed
- `SectionState` type
- `SectionReadiness` interface
- `SectionKey` type
- `SECTION_STATE_COLOR` constant
- `computeSectionReadiness()` function
- `ReadinessIndicators` component

---

## Implementation Order

### MVP (Minimum for Feature)
1. Phase 1: Backend — Tasks 1.1-1.3 (add `has_voice_id`)
2. Phase 2: Types & Computation — Tasks 2.1-2.2
3. Phase 3: Component — Tasks 3.1-3.2
4. Phase 4: Integration — Tasks 4.1-4.3

**MVP Success Criteria:**
- Four color-coded indicator circles visible on every character card
- Tooltip shows section name + progress on hover
- Click navigates to correct tab on character detail page
- No additional API calls (reuses existing deliverables fetch)
- Zero TypeScript errors

### Post-MVP Enhancements
- Animated transitions on state change (PRD Req 2.1)
- Aggregate readiness summary row above grid (PRD Req 2.2)

---

## Notes

1. **No new API endpoint** — We extend the existing `character-deliverables` response with one field (`has_voice_id`). All readiness computation is frontend-side.
2. **Backend change is minimal** — One boolean field added to model + one SQL expression. No migration needed.
3. **Backward compatibility** — `sectionReadiness` prop is optional on `CharacterCard`, so all existing usages continue to work without changes.
4. The `GroupSection` internal component in `ProjectCharactersTab.tsx` needs its props interface updated to pass through the readiness map — this is part of Task 4.2.

---

## Version History

- **v1.0** (2026-03-06): Initial task list creation from PRD-128

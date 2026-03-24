# Task List: Dynamic Avatar Card Indicators

**PRD Reference:** `design/prds/148-prd-dynamic-avatar-card-indicators.md`
**Scope:** Replace hardcoded seed indicators with dynamic pipeline-aware system driven by blocking_deliverables config.

## Overview

Replace the hardcoded `SeedDataStatus` (clothed/topless/bio/tov) with a dynamic `IndicatorDot[]` array built from the pipeline's seed_slots and the project's blocking_deliverables. Frontend-only — no backend changes.

### What Already Exists
- `SeedDataStatus` interface with hardcoded boolean fields — **replace**
- `SEED_SECTIONS` constant with 4 hardcoded items — **remove**
- `SeedDataIndicators` component — **replace with `AvatarIndicators`**
- `blocking_deliverables` on projects + `useSetting("blocking_deliverables")` — **use for filtering**
- Pipeline `seed_slots` JSONB — **use for dynamic seed dots**
- `SeedSummary` from PRD-146 — **use for assignment status**

### What We're Building
1. `IndicatorDot` type and `buildIndicatorDots()` utility
2. `AvatarIndicators` component
3. Pipeline-aware indicator computation in AvatarsPage
4. Blocking deliverables filtering

### Key Design Decisions
1. Keep `ReadinessIndicators` (project context) separate for MVP — only replace `SeedDataIndicators`
2. Use browse query variant_type matching against pipeline seed_slot names (no new API)
3. Fall back to `["metadata", "images", "scenes"]` when blocking_deliverables is null

---

## Phase 1: Types & Utility

### Task 1.1: Create IndicatorDot type and buildIndicatorDots utility
**File:** `apps/frontend/src/features/projects/utils/build-indicator-dots.ts` (NEW)

```typescript
export interface IndicatorDot {
  key: string;
  label: string;
  present: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tab: string; // avatar detail tab to navigate to on click
}

export function buildIndicatorDots(opts: {
  pipelineSeedSlots: { name: string }[];
  blockingDeliverables: string[];
  /** variant_types present for this avatar (lowercase) */
  avatarVariantTypes: Set<string>;
  avatarMetadata: Record<string, unknown> | null;
  /** Whether avatar has any scene video versions */
  hasScenes?: boolean;
  /** Whether avatar has any speech entries */
  hasSpeech?: boolean;
}): IndicatorDot[]
```

Logic:
- If `"images"` in blockingDeliverables: one dot per `pipelineSeedSlots` entry. `present` = avatarVariantTypes has the slot name (case-insensitive).
- If `"metadata"` in blockingDeliverables: Bio dot + ToV dot based on metadata keys.
- If `"scenes"` in blockingDeliverables: one Scenes dot.
- If `"speech"` in blockingDeliverables: one Speech dot.
- Sections not in blockingDeliverables produce zero dots.
- Order: images → metadata → scenes → speech.

**Acceptance Criteria:**
- [ ] Pure function, no hooks or side effects
- [ ] Zero hardcoded "clothed"/"topless" references
- [ ] Returns empty array when blockingDeliverables is empty
- [ ] Falls back to default `["metadata", "images", "scenes"]` when null passed

---

## Phase 2: Component

### Task 2.1: Create AvatarIndicators component
**File:** `apps/frontend/src/features/projects/components/AvatarIndicators.tsx` (NEW)

Renders an array of `IndicatorDot[]` as colored circles with tooltips. Visual style matches existing `SeedDataIndicators` (18px circles, vertical stack, backdrop blur).

**Acceptance Criteria:**
- [ ] Accepts `dots: IndicatorDot[]`
- [ ] Green circle for `present: true`, muted grey for `false`
- [ ] Tooltip shows `"{label}: Present"` or `"{label}: Missing"`
- [ ] All-complete state fades to 30% opacity
- [ ] Icon rendered inside each circle

---

## Phase 3: Integration

### Task 3.1: Update AvatarsPage to build dynamic indicators
**File:** `apps/frontend/src/app/pages/AvatarsPage.tsx`

Replace the hardcoded `seedDataStatusMap` computation with `buildIndicatorDots()`.

- Fetch `useSetting("blocking_deliverables")` for platform default
- Resolve blocking deliverables per project (project override → platform default → hardcoded fallback)
- Build dots using pipeline seed_slot names + variant_type browse data
- Pass `indicatorDots` to AvatarCard instead of `seedDataStatus`

**Acceptance Criteria:**
- [ ] No hardcoded "clothed"/"topless" in status computation
- [ ] Indicators respect project's blocking_deliverables
- [ ] Pipeline seed_slots drive seed image dots
- [ ] Bio/ToV dots only shown when "metadata" is blocking

### Task 3.2: Update AvatarCard props
**File:** `apps/frontend/src/features/projects/components/AvatarCard.tsx`

- Remove `SeedDataStatus` interface
- Remove `SEED_SECTIONS` constant
- Remove `SeedDataIndicators` inline component
- Replace `seedDataStatus?: SeedDataStatus` prop with `indicatorDots?: IndicatorDot[]`
- Render `AvatarIndicators` when `indicatorDots` is provided

**Acceptance Criteria:**
- [ ] Old hardcoded types and components removed
- [ ] `AvatarCard` renders `AvatarIndicators` from dots prop
- [ ] All call sites updated
- [ ] `npx tsc --noEmit` passes

### Task 3.3: Update any other call sites
Check `ProjectAvatarsTab` or other pages that use `SeedDataStatus` and update them.

**Acceptance Criteria:**
- [ ] All references to `SeedDataStatus` removed
- [ ] No TypeScript errors
- [ ] y122 avatars show correct pipeline indicators
- [ ] x121 avatars unchanged in appearance

---

## Relevant Files

| File | Description |
|------|-------------|
| `apps/frontend/src/features/projects/utils/build-indicator-dots.ts` | NEW: pure utility |
| `apps/frontend/src/features/projects/components/AvatarIndicators.tsx` | NEW: indicator component |
| `apps/frontend/src/features/projects/components/AvatarCard.tsx` | Remove hardcoded, add dots prop |
| `apps/frontend/src/app/pages/AvatarsPage.tsx` | Pipeline-aware dot building |

---

## Implementation Order

1. Task 1.1: Types + utility function
2. Task 2.1: AvatarIndicators component
3. Task 3.1: AvatarsPage integration
4. Task 3.2: AvatarCard prop update
5. Task 3.3: Other call sites

**MVP Success Criteria:**
- y122 shows "Reference" seed dot (not clothed/topless)
- Dots hidden for sections not in blocking_deliverables
- x121 appearance unchanged

---

## Version History

- **v1.0** (2026-03-24): Initial task list from PRD-148

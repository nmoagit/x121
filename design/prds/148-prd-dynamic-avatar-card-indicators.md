# PRD-148: Dynamic Avatar Card Indicators

**Document ID:** 148-prd-dynamic-avatar-card-indicators
**Status:** Draft
**Author:** AI Product Manager
**Created:** 2026-03-24
**Last Updated:** 2026-03-24

---

## 1. Introduction/Overview

The avatar card indicator system (seed data dots and readiness indicators) is currently hardcoded to expect exactly two seed image types ("clothed" and "topless") plus bio and tone-of-voice metadata. This breaks for pipelines with different seed slot configurations (e.g., y122 which uses "reference" instead of clothed/topless) and shows indicators for sections that may not be configured as blocking deliverables for the project.

This PRD replaces the hardcoded `SeedDataStatus` interface and `SEED_SECTIONS` array with a dynamic indicator system driven by the pipeline's `seed_slots` configuration and the project's `blocking_deliverables` setting. It unifies the two separate indicator overlays (`SeedDataIndicators` and `ReadinessIndicators`) into a single component that respects the settings hierarchy.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-128**: Section readiness indicators (current `ReadinessIndicators` component)
- **PRD-135**: Seed data completeness (current `SeedDataIndicators` component)
- **PRD-138**: Multi-pipeline architecture (pipeline `seed_slots` definition)
- **PRD-146**: Dynamic generation seeds (seed summary API, `useAvatarSeedSummary`)

### Extends
- **PRD-112**: Project hub and avatar grid (where avatar cards are rendered)

## 3. Goals

### Primary Goals
1. Remove all hardcoded seed slot references ("clothed", "topless") from indicator logic.
2. Drive indicator visibility by the resolved `blocking_deliverables` configuration.
3. Use pipeline `seed_slots` to determine how many seed indicator dots to show.
4. Use PRD-146 seed summary data to check assignment status instead of variant_type string matching.

### Secondary Goals
1. Unify `SeedDataIndicators` and `ReadinessIndicators` into a single indicator component.
2. Support the full settings hierarchy (platform > pipeline > project > group > avatar).

## 4. User Stories

- **US-1**: As a studio operator using the y122 pipeline, I see seed indicator dots that match my pipeline's seed slots (e.g., one "reference" dot), not hardcoded clothed/topless dots.
- **US-2**: As a project manager who has configured `blocking_deliverables: ["images", "metadata"]`, I only see indicator dots for images and metadata sections, not scenes or speech.
- **US-3**: As a user viewing the avatars page (non-project context), I see seed completeness dots driven by the active pipeline's seed slots.
- **US-4**: As a user viewing the project avatars tab (project context), I see readiness indicators filtered to only the project's blocking deliverables.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Replace SeedDataStatus with dynamic type

**Description:** Remove the hardcoded `SeedDataStatus` interface with its `hasClothedImage`/`hasToplessImage` boolean fields. Replace with a dynamic structure.

**Acceptance Criteria:**
- [ ] New `IndicatorDot` type: `{ key: string; label: string; present: boolean; icon: ComponentType; tab: string }`
- [ ] New `AvatarIndicatorStatus` type: `{ dots: IndicatorDot[] }` replaces `SeedDataStatus`
- [ ] No references to "clothed" or "topless" remain in indicator logic
- [ ] `SEED_SECTIONS` constant is removed

**Technical Notes:**
- The `IndicatorDot` array is built dynamically based on blocking_deliverables and pipeline seed_slots.

#### Requirement 1.2: Build indicator dots from blocking_deliverables + seed_slots

**Description:** Create a utility function that builds the indicator dot array from the resolved blocking deliverables and pipeline seed slots.

**Acceptance Criteria:**
- [ ] Function signature: `buildIndicatorDots(pipeline: Pipeline, blockingDeliverables: string[], seedSummary: SeedSummary | undefined, avatarMetadata: Record<string, unknown> | null) => IndicatorDot[]`
- [ ] When `"images"` is in blocking_deliverables: one dot per pipeline `seed_slot`, labeled with the slot name, green if the seed summary shows an assignment for that slot, grey if missing
- [ ] When `"metadata"` is in blocking_deliverables: one "Bio" dot (green if bio exists in metadata), one "ToV" dot (green if tov exists in metadata)
- [ ] When `"scenes"` is in blocking_deliverables: one "Scenes" dot (green if avatar has scene video versions, grey if none) -- status derived from deliverable row data when available
- [ ] When `"speech"` is in blocking_deliverables: one "Speech" dot (green if avatar has speech entries, grey if none)
- [ ] Sections not in blocking_deliverables produce no dots
- [ ] Dots are ordered: images (seed slots) > metadata > scenes > speech

**Technical Notes:**
- Seed slot assignment status comes from `SeedSummary.slots` -- a slot is "assigned" when its `assignment` field is non-null.
- Bio/ToV presence checks use the existing `SOURCE_KEY_BIO` / `SOURCE_KEY_TOV` metadata keys.
- For the AvatarsPage (non-project context), scenes and speech data may not be available; omit those dots.

#### Requirement 1.3: Unified indicator component

**Description:** Merge `SeedDataIndicators` and `ReadinessIndicators` into a single `AvatarIndicators` component that renders from the `IndicatorDot[]` array.

**Acceptance Criteria:**
- [ ] Single component `AvatarIndicators` accepts `dots: IndicatorDot[]` plus navigation props (`projectId`, `avatarId`)
- [ ] Each dot renders as a colored circle (green = present, muted grey = missing) with tooltip showing `"${label}: Present"` or `"${label}: Missing"`
- [ ] Clicking a dot navigates to the avatar detail page with `?tab=` matching the dot's tab value
- [ ] Visual style matches existing indicators (18px circles, rounded-full bg with backdrop blur)
- [ ] "All complete" state (all dots green) fades the indicator overlay to 30% opacity
- [ ] Old `SeedDataIndicators` and the `SeedDataStatus`-based code path in `AvatarCard` are removed

**Technical Notes:**
- The existing `ReadinessIndicators` component uses multi-state colors (error, partial, info, complete, not_started). For MVP, the unified component can support both modes: the simple binary (present/missing) for seed-only context, and the richer state machine for project-deliverable context. Alternatively, the `ReadinessIndicators` can remain as-is for the project context where `AvatarDeliverableRow` data is available, and only the `SeedDataIndicators` path is replaced. The simpler option (keeping ReadinessIndicators separate) is recommended for MVP.

#### Requirement 1.4: Update AvatarsPage seed status computation

**Description:** Replace the hardcoded variant_type matching in `AvatarsPage` (lines 259-282) with pipeline-aware seed summary logic.

**Acceptance Criteria:**
- [ ] AvatarsPage reads the active pipeline from context (`usePipelineContext`)
- [ ] Seed indicator dots are built using `buildIndicatorDots()` with the pipeline's seed_slots
- [ ] The `allVariants` browse query and `variantTypes` map logic for "clothed"/"topless" string matching is removed
- [ ] Blocking deliverables resolution uses the same hierarchy as ProjectDetailPage: `useSetting("blocking_deliverables")` as platform default
- [ ] When no pipeline is active, fall back to showing no seed image dots (or a generic "has any images" dot)

**Technical Notes:**
- The AvatarsPage currently fetches `allVariantsBrowse` with limit 500 to build the variant type map. This can be replaced with per-avatar seed summary data, but fetching seed summaries for all visible avatars may be expensive. Two options:
  - **Option A (recommended):** Keep the browse query but match against pipeline seed_slot names instead of hardcoded strings. A variant's `variant_type` already maps to seed slot names.
  - **Option B:** Batch-fetch seed summaries. Requires a new batch endpoint (out of scope for this PRD).
- Option A is recommended for MVP since it requires no backend changes.

#### Requirement 1.5: Update AvatarCard props

**Description:** Replace the `seedDataStatus?: SeedDataStatus` prop with the new dynamic type.

**Acceptance Criteria:**
- [ ] `AvatarCard` accepts `indicatorDots?: IndicatorDot[]` instead of `seedDataStatus?: SeedDataStatus`
- [ ] The `speechLanguages` prop remains unchanged (language flags are separate from indicators)
- [ ] All call sites are updated: `AvatarsPage`, `ProjectAvatarsTab`

**Technical Notes:**
- `ProjectAvatarsTab` already uses `ReadinessIndicators` via `sectionReadiness` prop. That path remains unchanged for MVP. The `indicatorDots` prop replaces only the `seedDataStatus` path used by `AvatarsPage`.

### Phase 2: Enhancements (Post-MVP)

- **Pipeline-level blocking_deliverables**: Add `blocking_deliverables` column to `pipelines` table, slot it into the resolution hierarchy between platform and project.
- **Batch seed summary endpoint**: `GET /api/v1/avatars/batch-seed-summary?ids=1,2,3` to efficiently fetch summaries for the grid view.
- **Full unification**: Merge `ReadinessIndicators` into `AvatarIndicators` so both project and non-project contexts use one component with the same data model.
- **Animated transitions**: Dot color transitions when data loads asynchronously.

## 6. Non-Functional Requirements

### Performance
- Building indicator dots for 100 avatars must complete in under 50ms (simple array mapping).
- No additional API calls per avatar beyond what is already fetched (use browse query data).

### Security
- No new endpoints or permissions required.

## 7. Non-Goals (Out of Scope)

- Backend changes (all data is already available via existing APIs).
- Changing the `ReadinessIndicators` multi-state color system for the project deliverables context.
- Batch seed summary API endpoint.
- Pipeline-level `blocking_deliverables` column (future enhancement).
- Changing how `blocking_deliverables` is stored or configured in settings UI.

## 8. Design Considerations

- Indicator dots maintain the same visual style: 18px circles, vertically stacked, rounded-full container with `bg-black/20 backdrop-blur-sm`.
- Seed slot dots use the `Image` icon. Metadata dots use `FileText`. Scenes use `Film`. Speech uses `Mic`.
- The number of dots varies per pipeline (a pipeline with 3 seed slots + metadata blocking = 5 dots).
- Tooltip text uses the seed slot's `name` field (capitalized), e.g., "Reference: Present", "Clothed: Missing".

## 9. Technical Considerations

### Existing Code to Reuse
- `ReadinessIndicators` component (`features/projects/components/ReadinessIndicators.tsx`) -- visual pattern reference.
- `SeedDataIndicators` in `AvatarCard.tsx` -- to be replaced, but visual style preserved.
- `usePipelineContext` hook -- for accessing active pipeline and its seed_slots.
- `useSetting("blocking_deliverables")` -- for platform default resolution.
- `SOURCE_KEY_BIO`, `SOURCE_KEY_TOV` constants -- for metadata presence checks.
- `SeedSummary` / `SeedSlotWithAssignment` types from `use-media-assignments.ts`.
- `variantThumbnailUrl` and browse query from AvatarsPage.

### Database Changes
None. Frontend-only refactor.

### API Changes
None. All data already available.

### New Files
- `apps/frontend/src/features/projects/utils/build-indicator-dots.ts` -- pure function, no side effects, easily testable.

### Modified Files
- `apps/frontend/src/features/projects/components/AvatarCard.tsx` -- remove `SeedDataStatus`, `SEED_SECTIONS`, `SeedDataIndicators`; add `indicatorDots` prop.
- `apps/frontend/src/features/projects/components/AvatarIndicators.tsx` -- new component (or inline in AvatarCard).
- `apps/frontend/src/app/pages/AvatarsPage.tsx` -- replace hardcoded variant_type matching with pipeline-aware dot building.
- `apps/frontend/src/features/projects/types.ts` -- add `IndicatorDot` type export if shared.

## 10. Edge Cases & Error Handling

| Scenario | Behavior |
|----------|----------|
| Pipeline has no seed_slots defined | Show zero seed image dots; metadata/scenes/speech still shown if in blocking_deliverables |
| No pipeline context available (e.g., "All Pipelines" view) | Show only metadata dots (bio/tov); skip seed image dots |
| blocking_deliverables is empty array | Show no indicator dots at all |
| blocking_deliverables is null at all levels | Fall back to hardcoded default `["metadata", "images", "scenes"]` |
| Avatar has no metadata object | Bio and ToV dots show as grey (missing) |
| Seed summary not yet loaded (loading state) | Show dots as grey until data arrives; no loading spinner on dots |
| Pipeline seed_slot name contains special characters | Use slot name as-is for key; capitalize first letter for display label |

## 11. Success Metrics

- Zero hardcoded references to "clothed" or "topless" in indicator-related code.
- y122 pipeline avatars show correct seed slot indicators matching their pipeline config.
- Indicators respect blocking_deliverables: disabling "speech" hides speech dots.
- No regression in x121 pipeline avatar card appearance (same dots, same colors, same behavior).

## 12. Testing Requirements

- Unit test `buildIndicatorDots()` with x121 pipeline (2 seed slots: clothed, topless) and blocking `["images", "metadata"]` -- expect 4 dots.
- Unit test `buildIndicatorDots()` with y122 pipeline (1 seed slot: reference) and blocking `["images"]` -- expect 1 dot.
- Unit test with empty blocking_deliverables -- expect 0 dots.
- Unit test with all sections blocking and full data -- expect all dots green.
- Visual regression: x121 project avatar cards look identical before and after.

## 13. Open Questions

None -- requirements are fully specified.

## 14. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-03-24 | AI PM | Initial draft |

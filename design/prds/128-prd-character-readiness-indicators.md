# PRD-128: Character Readiness Indicators on Project Character Cards

## 1. Introduction / Overview

Project character cards currently show a status badge and optional delivery status, but offer no at-a-glance visibility into *which* sections of a character are complete. Users must click into each character to discover whether metadata, images, scenes, or speech are ready.

This feature adds four small, color-coded circle icons to the right side of each character card. Each icon represents one of the four required completion sections (metadata, images, scenes, speech) and communicates its state through color. Hovering shows a tooltip with progress detail; clicking navigates directly to the corresponding tab on the character detail page.

## 2. Related PRDs & Dependencies

### Depends On
- **PRD-00** — Database schema (characters, scene assignments, metadata versions)
- **PRD-01** — Character management (character model, tabs)
- **PRD-112** — Projects & character cards (`CharacterCard.tsx`, project character grid)
- **PRD-107** — Readiness system (ReadinessState, ReadinessStateBadge, missing items)
- **PRD-108** — Character dashboard (dashboard endpoint with readiness snapshot)

### Extends
- **PRD-112** — Adds readiness indicator icons to existing `CharacterCard` component
- **PRD-108** — Extends character dashboard endpoint to return per-section readiness

### Conflicts With
- None

## 3. Goals

1. Give users instant per-section readiness visibility without leaving the project character grid
2. Reduce navigation overhead — users can jump directly to the section that needs attention
3. Maintain consistency with existing readiness patterns (colors, badges, tooltips)

## 4. User Stories

1. **As a project manager**, I want to see at a glance which sections of each character are complete so that I can prioritize work on incomplete characters without clicking into each one.

2. **As a content creator**, I want to click a section indicator on a character card to jump directly to that tab so that I can quickly address missing content.

3. **As a production lead**, I want to scan the character grid and immediately identify which characters are blocked on metadata vs images vs scenes vs speech so that I can assign work efficiently.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Per-Section Readiness Data

**Description:** The backend must return per-section readiness status for each character, covering the four sections: metadata, images, scenes, speech.

**Section definitions:**
- **Metadata**: Complete when all required metadata fields are populated (non-null, non-empty). Use existing `ReadinessSnapshot.missing_items` to detect `metadata_complete` absence.
- **Images**: Based on source image count and approved variant count. Not started = 0 source images. Partial = has source images but 0 approved variants. Complete = at least 1 approved variant.
- **Scenes**: Based on scene assignment count and scenes with final video. Not started = 0 scene assignments. Partial = has assignments but not all have final video. Complete = all assigned scenes have final video.
- **Speech**: Based on `elevenlabs_voice` setting presence. Not started = no voice ID. Complete = voice ID is set. (Binary — no partial state for MVP.)

**Acceptance Criteria:**
- [ ] Backend returns a `section_readiness` object with keys `metadata`, `images`, `scenes`, `speech`
- [ ] Each key maps to a state: `"not_started"`, `"partial"`, `"complete"`, or `"error"`
- [ ] Data is included in the existing `GET /projects/{id}/characters` or a new batch endpoint
- [ ] Response includes progress counts per section (e.g., `{ state: "partial", current: 3, total: 5 }`)

#### Requirement 1.2: Section Readiness Computation

**Description:** The backend must compute section readiness efficiently for all characters in a project in a single query or minimal queries (not N+1).

**Acceptance Criteria:**
- [ ] Section readiness for all characters in a project is computed in O(1) or O(few) queries, not per-character
- [ ] Computation reuses existing dashboard/readiness logic where possible
- [ ] Results are consistent with what the character detail page shows

#### Requirement 1.3: Readiness Indicator Icons on Character Card

**Description:** The `CharacterCard` component displays four vertically-stacked circle icons on the right side of the card. Each circle contains a small icon representing a section.

**Section order (top to bottom, following workflow):**
1. Metadata — `FileText` icon
2. Images — `Image` icon
3. Scenes — `Film` icon
4. Speech — `Mic` icon

**Color mapping:**
| State | Color | CSS Variable |
|-------|-------|-------------|
| Not started | Grey | `--color-text-muted` |
| Partial | Amber | `--color-status-warning` |
| Complete | Green | `--color-status-success` |
| Error | Red | `--color-status-danger` |

**Acceptance Criteria:**
- [ ] Four circle icons are rendered vertically on the right side of the character card
- [ ] Each circle contains the correct section icon (FileText, Image, Film, Mic)
- [ ] Circle background color reflects the section's readiness state
- [ ] Icons are sized appropriately (12-14px icons in ~24px circles)
- [ ] Icons do not interfere with existing card interactions (selection, edit, click)
- [ ] Icons are visible on all card states (default, hover, selected)

#### Requirement 1.4: Tooltip on Hover

**Description:** Hovering over a readiness indicator circle shows a tooltip with the section name and progress count.

**Tooltip format examples:**
- `"Metadata: Complete"`
- `"Images: 3/5 approved"`
- `"Scenes: 2/4 with video"`
- `"Speech: Not configured"`

**Acceptance Criteria:**
- [ ] Each indicator circle shows a tooltip on hover
- [ ] Tooltip includes section name and progress detail
- [ ] Tooltip uses the existing design system Tooltip component
- [ ] Tooltip does not interfere with the card's click handler

#### Requirement 1.5: Click to Navigate

**Description:** Clicking a readiness indicator circle navigates to the character detail page with the corresponding tab selected.

**Tab mapping:**
| Section | Tab Index | Route |
|---------|-----------|-------|
| Metadata | 3 | `/projects/{pid}/characters/{cid}?tab=metadata` |
| Images | 1 | `/projects/{pid}/characters/{cid}?tab=images` |
| Scenes | 2 | `/projects/{pid}/characters/{cid}?tab=scenes` |
| Speech | 4 | `/projects/{pid}/characters/{cid}?tab=speech` |

**Acceptance Criteria:**
- [ ] Clicking an indicator navigates to the character detail page
- [ ] The correct tab is selected on arrival
- [ ] Click event does not bubble to the parent card's onClick handler
- [ ] Navigation uses TanStack Router's `useNavigate` or `Link` component

### Phase 2: Enhancements (Post-MVP)

#### Requirement 2.1: Animated Transitions

**[OPTIONAL — Post-MVP]** Readiness indicators animate when state changes (e.g., after a background refresh shows a section moved from partial to complete).

#### Requirement 2.2: Aggregate Readiness Row

**[OPTIONAL — Post-MVP]** A summary row above the character grid shows aggregate section readiness across all characters (e.g., "Metadata: 12/15 complete, Images: 8/15 complete").

## 6. Non-Goals (Out of Scope)

- **Editing section data from the card** — Indicators are read-only; users click through to edit
- **Custom section definitions** — The four sections are fixed; no user configuration
- **Per-field metadata breakdown** — Metadata is a single complete/incomplete signal, not per-field
- **QA status per section** — This tracks completeness, not approval workflow status
- **Deliverables section indicator** — Deliverables are already shown via the existing delivery status badge

## 7. Design Considerations

- **Vertical stack placement**: Icons should be right-aligned within the card, vertically centered or bottom-aligned depending on card height. Use `flex-col gap-1` for spacing.
- **Circle sizing**: 24px circles with 12-14px icons inside. Small enough to not dominate the card but large enough to be clickable (meets 24px minimum touch target).
- **Color consistency**: Reuse existing CSS variables from the design system (`--color-status-success`, `--color-status-warning`, `--color-status-danger`, `--color-text-muted`).
- **Icon source**: Import from `@/tokens/icons` (Lucide icons: `FileText`, `ImageIcon`, `Film`, `Mic`).
- **Hover state**: Circle slightly scales or brightens on hover to indicate clickability. Cursor changes to `pointer`.
- **Existing `ReadinessStateBadge`**: The existing badge in the character detail page header shows overall readiness. The new per-section indicators complement this with granular detail.

## 8. Technical Considerations

### Existing Code to Reuse
- **`CharacterCard.tsx`** (`features/projects/components/`) — Add indicators to existing component
- **`ReadinessState` type** (`features/readiness/types.ts`) — Reuse `"ready" | "partially_ready" | "not_started"` pattern
- **`CHARACTER_TABS`** (`features/characters/types.ts`) — Tab name constants for navigation
- **`useCharacterDashboard`** hook — Existing dashboard data fetching pattern
- **`completenessVariant()`** (`features/characters/types.ts`) — Percentage-to-badge-variant mapping
- **`hasVoiceId()`** (`features/characters/types.ts`) — Speech readiness check
- **Tooltip component** (`components/composite/Tooltip`) — Design system tooltip
- **`SETTING_KEY_VOICE`** constant — Voice ID setting key

### New Infrastructure Needed
- **`SectionReadiness` type** — Frontend type for per-section readiness state + counts
- **`ReadinessIndicators` component** — Small component rendering the 4 circles (extracted from CharacterCard for reusability)
- **Backend batch readiness query** — SQL joining characters with their metadata, images, scenes, speech data

### Database Changes
- None — All data already exists in `characters`, `character_variants`, `character_scene_assignments`, `scene_video_versions`, `character_metadata_versions`, `character_settings`

### API Changes
- **Option A (preferred)**: Extend `GET /projects/{id}/characters` response to include `section_readiness` per character
- **Option B**: New `GET /projects/{id}/character-readiness` batch endpoint returning readiness for all characters

## 9. Success Metrics

- Users can identify incomplete sections without clicking into character detail pages
- Click-through from indicator to tab works correctly for all 4 sections
- No additional N+1 queries — readiness data is batch-loaded with the character list
- Character grid load time does not increase noticeably (< 50ms additional)

## 10. Open Questions

None — all design decisions resolved during pre-PRD discussion.

## 11. Version History

- **v1.0** (2026-03-06): Initial PRD creation
- **v1.1** (2026-03-14): Amendment — Character thumbnail tooltip on character name hover (Req A.1).

---

## Amendment (2026-03-14): Character Thumbnail Tooltip on Character Name Hover

### Requirement A.1: Hero Image Thumbnail on Character Name Hover

**Description:** In the deliverables grid (readiness table and matrix), hovering over a character name shows a thumbnail preview of their hero variant image. This complements the readiness indicators with visual character identification.

**Acceptance Criteria:**
- [ ] Character names in the deliverables grid are wrapped in a `CharacterNameWithThumb` component
- [ ] On hover, a `Tooltip` shows a 128px × 128px rounded thumbnail of the character's hero variant
- [ ] Uses `variantThumbnailUrl(heroVariantId, 256)` for the image source
- [ ] Characters without a `hero_variant_id` show the name without a tooltip
- [ ] Tooltip delay is 150ms with `side="bottom"` (auto-flips per PRD-029 Amendment A.1)
- [ ] `hero_variant_id` is provided by the backend `list_deliverable_status` LATERAL join (see PRD-112 Amendment A.6)

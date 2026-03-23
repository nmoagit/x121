# PRD-144: Complete Deliverables Tab

## 1. Introduction/Overview

The avatar deliverables tab currently shows three sections (Metadata, Images, Scene Videos) but omits Speech — a key deliverable for both pipelines. Additionally, the "ignored" concept is confusing: deliverables that aren't in the project's `blocking_deliverables` list should start deselected by default, clearly indicating they won't block delivery. This PRD adds speech as a fourth deliverable section and ties the initial selection state to the project's blocking deliverables configuration.

## 2. Related PRDs & Dependencies

- **Depends on:**
  - PRD-136 (Multilingual Speech System) — `avatar_speeches`, `speech_types`, `languages`, speech completeness API
  - PRD-143 (Pipeline-Scoped Metadata & Speech) — pipeline-scoped speech types and config
  - PRD-112 (Avatar Detail Page) — existing deliverables tab structure

- **Extends:**
  - PRD-137 (Output Format Profiles) — delivery readiness checks

## 3. Goals

1. Add a Speech section to the deliverables tab showing speech completeness per type × language
2. Non-blocking deliverable sections start deselected (ignored) by default
3. Users can toggle any section on/off regardless of blocking status
4. Blocking vs non-blocking status is visually clear

## 4. User Stories

- **As a content manager**, I want to see speech completeness in the deliverables tab so I can track all deliverables in one place.
- **As a project manager**, I want non-blocking deliverables to be deselected by default so I can focus on what actually blocks delivery.
- **As a content operator**, I want to toggle any deliverable section on/off so I can customize my view.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Add Speech Section to Deliverables Tab
**Description:** Add a fourth section to the deliverables tab showing speech completeness.

**Acceptance Criteria:**
- [ ] Speech section appears after Scene Videos in the deliverables tab
- [ ] Shows speech types grouped by type, with language breakdown
- [ ] Each row shows: speech type name, language flag/code, approved count / required count
- [ ] Uses the speech completeness API (`GET /avatars/{id}/speeches/completeness`)
- [ ] Progress indicator per type × language (green = complete, amber = partial, red = missing)
- [ ] Section header shows overall speech completeness percentage

#### Requirement 1.2: Initial Selection Based on Blocking Deliverables
**Description:** Sections that are NOT in the project's `blocking_deliverables` list should start deselected.

**Acceptance Criteria:**
- [ ] On initial load, each section's selected state matches whether it's in `blocking_deliverables`
- [ ] Blocking sections (e.g., metadata, images, scenes) start selected
- [ ] Non-blocking sections (e.g., speech if not in blocking list) start deselected
- [ ] Deselected sections appear dimmed with an "optional" or "not blocking" indicator
- [ ] Users can toggle any section regardless of blocking status
- [ ] Toggle state persists during the tab session (not across page loads)

#### Requirement 1.3: Visual Distinction for Blocking vs Optional
**Description:** Clear visual separation between blocking and optional deliverables.

**Acceptance Criteria:**
- [ ] Blocking sections have normal styling
- [ ] Non-blocking sections have reduced opacity and a label like "optional" or "non-blocking"
- [ ] Section toggle is a checkbox or toggle that controls visibility/selection
- [ ] The section key list uses: "metadata", "images", "scene-videos", "speech"

## 6. Non-Goals (Out of Scope)

- Changing the `blocking_deliverables` configuration from this tab (done in project settings)
- Per-speech download/export (future enhancement)
- Speech file playback within the deliverables tab

## 7. Design Considerations

- Speech section follows the same `TerminalSection` pattern as metadata/images/scene-videos
- Speech completeness data comes from the existing API — no new backend endpoints needed
- The section order should be: Metadata, Images, Scene Videos, Speech (matching the workflow order)

## 8. Technical Considerations

### Existing Code to Reuse
- `useSpeechCompleteness(avatarId)` hook — already exists in `use-avatar-speeches.ts`
- `CompletenessSummary` type — already defined
- `TerminalSection` component — used by existing sections
- `blocking_deliverables` from project settings — already available via `useProject`

### Frontend Changes
- `AvatarDeliverablesTab.tsx` — add speech section, change initial section selection logic
- `SECTION_KEYS` constant — add "speech"

### No Backend Changes Required
- Speech completeness API already exists
- `blocking_deliverables` is already on the project record

## 9. Success Metrics

- All four deliverable types visible in one tab
- Non-blocking sections clearly distinguished from blocking ones
- Zero additional API calls beyond what already exists

## 10. Open Questions

None.

## 11. Version History

- **v1.0** (2026-03-23): Initial PRD creation

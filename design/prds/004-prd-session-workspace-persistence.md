# PRD-004: Session & Workspace Persistence

## 1. Introduction/Overview
Professional users must be able to log out and return to the exact same visual state. This PRD implements database-backed storage of UI state including open files, panel layouts, scroll positions, zoom level, and undo tree position. It covers four distinct categories of persisted state: layout persistence, navigation state, undo tree snapshots, and per-device profiles. This ensures that switching devices or resuming work after a break is seamless.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model for entity references in navigation state), PRD-03 (User Identity for per-user storage)
- **Depended on by:** PRD-51 (Undo/Redo Architecture)
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Persist all UI state (panels, navigation, scroll, zoom) per user in the database.
- Restore workspace state on login so users resume exactly where they left off.
- Support per-device profiles so desktop and tablet layouts are independent.
- Serialize and restore undo tree state across sessions.

## 4. User Stories
- As a Creator, I want to close my browser and reopen it to find my exact panel layout, open project, and scroll position restored so that I don't waste time re-navigating.
- As a Reviewer, I want my tablet layout to be different from my desktop layout so that each device is optimized for its use case.
- As a Creator, I want my undo history preserved across sessions so that I can undo changes I made yesterday.
- As an Admin, I want workspace persistence to be automatic so that users don't need to manually save their layout.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Layout Persistence
**Description:** Panel sizes, positions, and visibility are saved per user and restored on load.
**Acceptance Criteria:**
- [ ] Panel arrangement (which panels are open, their positions, and sizes) is saved on every change
- [ ] Layout is restored on page load within 500ms of authentication completing
- [ ] Users can reset to the default layout with a single action
- [ ] Layout changes are debounced to avoid excessive database writes during resize

#### Requirement 1.2: Navigation State
**Description:** Which project, scene, and segment the user had open, including playback position.
**Acceptance Criteria:**
- [ ] The currently viewed project, character, scene, and segment are persisted
- [ ] Scroll positions in list views are restored
- [ ] Video playback position is restored to within 1 second of where the user left off
- [ ] Zoom level in canvas/editor views is restored

#### Requirement 1.3: Undo Tree Snapshot
**Description:** Serialized undo/redo history so users can resume mid-edit.
**Acceptance Criteria:**
- [ ] Undo tree state is serialized to JSON and stored per user per entity
- [ ] Snapshot is updated on each undoable action (debounced)
- [ ] Undo tree is deserialized and restored when the entity is re-opened
- [ ] Maximum snapshot size is bounded to prevent storage bloat (configurable limit)

#### Requirement 1.4: Per-Device Profiles
**Description:** Separate workspace states for desktop vs. tablet.
**Acceptance Criteria:**
- [ ] Device type is detected on login (desktop, tablet, mobile)
- [ ] Each device type stores its own independent layout and navigation state
- [ ] Switching devices loads the appropriate profile automatically
- [ ] Users can manually switch profiles if needed

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Named Workspace Presets
**Description:** Users can save and switch between named workspace configurations.
**Acceptance Criteria:**
- [ ] Users can save current state as a named preset (e.g., "Review Mode", "Generation Mode")
- [ ] Switching presets restores the full layout and panel configuration

## 6. Non-Goals (Out of Scope)
- User authentication (covered by PRD-03)
- Undo/redo logic and action definitions (covered by PRD-51)
- Dashboard widget customization (covered by PRD-89)
- Theme preferences (covered by PRD-29)

## 7. Design Considerations
- State restoration should be invisible — the user should not see a flash of default layout before their saved state loads.
- A loading spinner or skeleton screen should appear during state restoration.
- The "Reset Layout" action should confirm before executing since it's destructive.

## 8. Technical Considerations
- **Stack:** React state management (Zustand or similar), PostgreSQL for persistence, debounced API calls
- **Existing Code to Reuse:** PRD-02 API infrastructure, PRD-03 user session
- **New Infrastructure Needed:** `workspace_states` table with JSONB column for flexible state storage
- **Database Changes:** `workspace_states` table (user_id, device_type, state_json, updated_at)
- **API Changes:** GET /workspace/state, PUT /workspace/state (auto-saved, not user-triggered)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Workspace state restores in <500ms after authentication
- 100% of panel layouts, navigation states, and scroll positions are correctly restored
- Per-device profiles correctly isolate desktop and tablet configurations
- Undo tree survives full browser close and reopen cycle

## 11. Open Questions
- How large can a serialized undo tree get, and what is the practical storage limit?
- Should workspace state sync across tabs in real time (broadcast channel)?
- What happens when the data model changes and saved navigation references become invalid (e.g., deleted project)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

# PRD-030: Modular Layout & Panel Management

## 1. Introduction/Overview
Different roles need different screen layouts: a Reviewer needs a large video player with minimal controls, while a Creator needs access to workflow parameters, metadata, and generation controls simultaneously. This PRD provides a Blender-style snappable and resizable panel system that maximizes screen real estate for each user's workflow, with saveable layout presets per role.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-29 (Design System for layout components)
- **Depended on by:** All frontend PRDs that render in panels
- **Part:** Part 4 — Design System & UX Patterns

## 3. Goals
- Provide snappable, resizable, drag-and-drop panel management.
- Support role-optimized default layouts (Reviewer vs. Creator vs. Admin).
- Enable saveable and shareable layout presets.
- Maximize screen real estate through collapsible panels and focus modes.

## 4. User Stories
- As a Creator, I want to resize and rearrange panels so that I can optimize my workspace for the current task.
- As a Reviewer, I want a layout preset with a maximized video player and minimal controls so that I can focus on review.
- As an Admin, I want to define default layouts per role so that new users start with an appropriate workspace configuration.
- As a Creator, I want to save my custom layout and switch between saved layouts so that I can have task-specific workspaces.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Panel System
**Description:** Snappable, resizable panels with drag-and-drop.
**Acceptance Criteria:**
- [ ] Panels can be resized by dragging borders
- [ ] Panels snap to grid positions when dragged
- [ ] Panels can be collapsed/expanded with a single click
- [ ] Panel minimum and maximum size constraints prevent unusable layouts

#### Requirement 1.2: Role-Based Defaults
**Description:** Optimized default layouts per user role.
**Acceptance Criteria:**
- [ ] Admin layout: system health, worker status, and configuration panels prominent
- [ ] Creator layout: workflow canvas, generation controls, and library panels prominent
- [ ] Reviewer layout: video player maximized with review controls and approval panel

#### Requirement 1.3: Layout Presets
**Description:** Saveable and switchable layout configurations.
**Acceptance Criteria:**
- [ ] Users can save current layout as a named preset
- [ ] Switch between saved presets with a single click
- [ ] Admin can share presets studio-wide for all users
- [ ] Layouts persist across sessions via PRD-04

#### Requirement 1.4: Panel Content Routing
**Description:** Any panel can host any view module.
**Acceptance Criteria:**
- [ ] Panels accept any registered view module (Library, Review, Workflow, Dashboard, etc.)
- [ ] Drag a view module into any panel slot
- [ ] Same view module can appear in multiple panels simultaneously (e.g., two library views with different filters)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Multi-Monitor Support
**Description:** Detach panels to separate browser windows.
**Acceptance Criteria:**
- [ ] Right-click panel header to detach into a new browser window
- [ ] Detached panels maintain real-time sync with the main window

## 6. Non-Goals (Out of Scope)
- Component styling and theming (covered by PRD-29)
- Dashboard widget customization (covered by PRD-89)
- Focus mode / progressive disclosure (covered by PRD-32)

## 7. Design Considerations
- Panel borders should provide clear visual resize affordances.
- Snapping should feel responsive with visual feedback during drag.
- Collapsed panels should show a minimal icon strip for quick identification.

## 8. Technical Considerations
- **Stack:** React with a panel management library (e.g., react-mosaic or custom), CSS Grid/Flexbox
- **Existing Code to Reuse:** PRD-29 layout components (Panel, Sidebar, Stack, Grid)
- **New Infrastructure Needed:** Panel state manager, snap grid engine, layout serializer
- **Database Changes:** `user_layouts` table (user_id, layout_name, layout_json, is_default)
- **API Changes:** CRUD /user/layouts, GET /admin/layout-presets, POST /admin/layout-presets

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Panel resize and snap operations complete in <50ms (no visible lag)
- Layout preset switching completes in <200ms
- Users can create and save a custom layout in under 30 seconds

## 11. Open Questions
- Should panel arrangements be screen-resolution-aware (different layouts for 1080p vs. 4K monitors)?
- How should the system handle layout presets when new panel types are added in future PRDs?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

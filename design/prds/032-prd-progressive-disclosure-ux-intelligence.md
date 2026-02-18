# PRD-032: Progressive Disclosure & UX Intelligence

## 1. Introduction/Overview
A platform with 106 PRDs of functionality risks overwhelming users with an "airplane cockpit" of controls. This PRD provides progressive disclosure patterns that surface essential controls by default while keeping advanced functionality accessible through "Power Knobs," Advanced Drawers, Focus Mode, and Non-Linear History — preventing information overload while maintaining deep technical control for expert users.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-29 (Design System)
- **Depended on by:** All feature PRDs that expose configurable parameters
- **Part:** Part 4 — Design System & UX Patterns

## 3. Goals
- Surface essential controls by default; hide advanced options in expandable drawers.
- Provide Focus Mode to minimize distractions during specific tasks.
- Track user proficiency and gradually reveal advanced features.
- Support non-linear history for exploring parameter variations.

## 4. User Stories
- As a Creator, I want only essential parameters visible by default so that I am not overwhelmed by rarely-used options.
- As a Creator, I want an "Advanced" drawer for power-user controls so that I can access deep settings when needed without them cluttering the default view.
- As a Reviewer, I want Focus Mode to hide everything except the video player and approval controls so that I can review without distractions.
- As a Creator, I want non-linear parameter history so that I can explore variations and return to earlier configurations.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Power Knobs vs. Advanced Drawers
**Description:** Two-tier parameter exposure.
**Acceptance Criteria:**
- [ ] Essential parameters ("Power Knobs") visible by default on every configuration screen
- [ ] Advanced parameters grouped in collapsible "Advanced" drawers
- [ ] Drawer state persists per user per view (via PRD-04)
- [ ] Clear visual distinction between essential and advanced sections

#### Requirement 1.2: Focus Mode
**Description:** Distraction-free task mode.
**Acceptance Criteria:**
- [ ] Single-click activation hides all panels except the primary task panel
- [ ] Review Focus: video player + approval controls only
- [ ] Generation Focus: workflow canvas + generation parameters only
- [ ] Keyboard shortcut to toggle focus mode (registered with PRD-52)

#### Requirement 1.3: Contextual Parameter Visibility
**Description:** Show/hide parameters based on context.
**Acceptance Criteria:**
- [ ] Parameters that don't apply to the current configuration are hidden, not disabled
- [ ] Dependencies between parameters are visually linked (changing one reveals/hides related options)
- [ ] Tooltip explanations for each parameter describing what it does and when to change it

#### Requirement 1.4: User Proficiency Tracking
**Description:** Gradually reveal features as users gain experience.
**Acceptance Criteria:**
- [ ] Track feature usage to determine user proficiency level (beginner, intermediate, expert)
- [ ] Beginner: minimal controls, prominent help links
- [ ] Expert: all controls visible by default, help links subdued
- [ ] User can manually override their proficiency level

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Non-Linear History
**Description:** Explore and revisit parameter variations.
**Acceptance Criteria:**
- [ ] Track parameter changes as a branching history tree
- [ ] Visual timeline showing parameter snapshots at each branch point
- [ ] Click any snapshot to restore that parameter configuration

## 6. Non-Goals (Out of Scope)
- Panel layout and resizing (covered by PRD-30)
- Undo/redo of data changes (covered by PRD-51)
- First-run onboarding experience (covered by PRD-53)

## 7. Design Considerations
- Advanced drawers should use subtle visual cues (muted colors, smaller text) to signal secondary importance.
- Focus Mode transition should be animated and reversible with a clear "exit focus" affordance.
- Proficiency indicators should be non-judgmental (no "beginner" labels visible to users).

## 8. Technical Considerations
- **Stack:** React context for proficiency state, CSS transitions for drawer animations
- **Existing Code to Reuse:** PRD-29 design tokens for visual hierarchy, PRD-04 session persistence
- **New Infrastructure Needed:** Proficiency tracker, parameter visibility engine, focus mode controller
- **Database Changes:** `user_proficiency` table (user_id, feature_area, proficiency_level, usage_count)
- **API Changes:** GET/PUT /user/proficiency, GET/PUT /user/focus-mode-preferences

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Default views show <8 essential parameters (measurable reduction from full parameter set)
- Focus Mode activates/deactivates in <200ms
- New users complete their first task without accessing the Advanced drawer

## 11. Open Questions
- Should proficiency levels be per-feature-area or global?
- How should the system handle parameters that are "essential" for some scene types but "advanced" for others?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

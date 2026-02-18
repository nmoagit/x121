# PRD-052: Keyboard Shortcut System & Presets

## 1. Introduction/Overview
A professional production tool without comprehensive keyboard shortcuts forces users back to mouse-clicking through menus, which is unacceptable for speed-critical workflows like segment review. This PRD provides a unified, customizable keyboard shortcut infrastructure with industry-standard preset profiles (Premiere, Resolve, Avid), context-aware shortcuts, a discoverable cheat sheet, and a one-handed review mode — acknowledging that editors bring muscle memory from their primary NLE.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-29 (Design System for UI integration)
- **Depended on by:** PRD-31 (Command Palette shortcut hints), PRD-55 (Director's View)
- **Part:** Part 4 — Design System & UX Patterns

## 3. Goals
- Provide a single centralized shortcut registry — no scattered `addEventListener` calls.
- Offer industry-standard preset profiles for immediate familiarity.
- Support full customization with export/import for team sharing.
- Enable context-aware shortcuts and a discoverable cheat sheet.

## 4. User Stories
- As a Creator, I want to select the "Premiere" shortcut preset so that my muscle memory transfers directly to this platform.
- As a Creator, I want to rebind any shortcut so that I can customize the platform to my personal workflow.
- As a Reviewer, I want a one-handed review mode so that I can approve/reject segments with one hand on the keyboard and the other on a jog dial.
- As a Creator, I want to press `?` to see all available shortcuts for the current context so that I can discover new shortcuts while working.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Shortcut Registry
**Description:** Centralized registry for all keyboard shortcuts.
**Acceptance Criteria:**
- [ ] Single source of truth for all keyboard shortcuts across the platform
- [ ] Every shortcut-enabled action registers through the central registry
- [ ] No scattered `addEventListener` calls — all shortcuts go through the registry

#### Requirement 1.2: Preset Profiles
**Description:** Built-in keymap presets modeled after industry tools.
**Acceptance Criteria:**
- [ ] Default: platform-native shortcuts optimized for the Trulience workflow
- [ ] Premiere: familiar to Adobe Premiere Pro editors
- [ ] Resolve: familiar to DaVinci Resolve colorists
- [ ] Avid: familiar to Avid Media Composer editors
- [ ] User selects active preset from settings

#### Requirement 1.3: Custom Keymaps
**Description:** User-rebindable shortcuts.
**Acceptance Criteria:**
- [ ] Users can rebind any shortcut
- [ ] Custom bindings override the active preset
- [ ] Export/import keymaps as JSON for team sharing
- [ ] Conflict detection: warn when a new binding conflicts with an existing one

#### Requirement 1.4: Context-Aware Shortcuts
**Description:** Same key does different things depending on active panel.
**Acceptance Criteria:**
- [ ] `Space` plays video in the Review panel but toggles selection in the Library
- [ ] Context is determined by the currently focused panel
- [ ] Cheat sheet groups shortcuts by context

#### Requirement 1.5: Cheat Sheet Overlay
**Description:** Discoverable shortcut reference.
**Acceptance Criteria:**
- [ ] Press `?` to see all available shortcuts for the current context
- [ ] Shortcuts grouped by category (navigation, playback, review, generation, etc.)
- [ ] Customized bindings highlighted to distinguish from defaults

#### Requirement 1.6: One-Handed Review Mode
**Description:** Dedicated shortcut cluster for single-hand review.
**Acceptance Criteria:**
- [ ] `1` = Approve, `2` = Reject, `3` = Flag
- [ ] `J/K/L` = shuttle controls (rewind/pause/forward)
- [ ] Optimized for one hand on keyboard, other on mouse/jog dial

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Shortcut Recording
**Description:** Record macro sequences from keyboard actions.
**Acceptance Criteria:**
- [ ] Record a sequence of shortcut actions as a named macro
- [ ] Assign a shortcut to the macro for one-key execution

## 6. Non-Goals (Out of Scope)
- Command palette implementation (covered by PRD-31)
- Video playback transport controls (covered by PRD-83)
- Approval workflow logic (covered by PRD-35)

## 7. Design Considerations
- Cheat sheet overlay should be translucent to avoid fully obscuring the workspace.
- Conflict resolution should offer clear options: override, cancel, or rebind the conflicting shortcut.
- Preset selection should be prominently placed in the onboarding flow (PRD-53).

## 8. Technical Considerations
- **Stack:** React with a centralized keyboard event manager, JSON configuration files for presets
- **Existing Code to Reuse:** PRD-29 design system components for overlay UI
- **New Infrastructure Needed:** Shortcut registry, keymap manager, conflict detector, cheat sheet renderer
- **Database Changes:** `user_keymaps` table (user_id, active_preset, custom_bindings_json)
- **API Changes:** GET/PUT /user/keymap, GET /keymaps/presets, POST /keymaps/export, POST /keymaps/import

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- All platform actions that have shortcuts are registered in the central registry (zero orphan shortcuts)
- Preset switching applies new keymap instantly (<100ms)
- Cheat sheet accurately reflects the user's current active bindings (including customizations)

## 11. Open Questions
- Which specific shortcuts should map to each preset (Premiere, Resolve, Avid)?
- Should multi-key chord shortcuts be supported (e.g., Ctrl+K followed by Ctrl+S)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

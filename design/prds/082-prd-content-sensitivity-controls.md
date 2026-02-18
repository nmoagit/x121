# PRD-082: Content Sensitivity Controls

## 1. Introduction/Overview
The platform handles content that may not be appropriate for all viewing contexts — office environments, screen shares, client demos. Without sensitivity controls, users must either avoid using the platform in certain contexts or risk exposure. This PRD provides configurable content visibility settings including thumbnail blur levels, per-view overrides, preview watermarking, and a one-click Screen-Share Mode that makes the entire UI safe for sharing.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-29 (Design System), PRD-35 (Review Interface for per-view override context), PRD-39 (Scene Assembler for watermarking distinction), PRD-52 (Keyboard Shortcuts for Screen-Share Mode toggle)
- **Depended on by:** None
- **Part:** Part 4 — Design System & UX Patterns

## 3. Goals
- Provide configurable thumbnail blur/redaction levels per user.
- Enable per-view overrides for context-appropriate visibility.
- Support preview watermarking for in-platform playback (distinct from delivery watermarking).
- Deliver one-click Screen-Share Mode for instant platform-wide safety.
- Enforce admin-defined minimum sensitivity levels.

## 4. User Stories
- As a Creator, I want configurable thumbnail blur so that I can use the platform in shared office environments without concern.
- As a Reviewer, I want to override blur in the Review Interface so that I can inspect pixel-level detail during review while keeping library views blurred.
- As a Creator, I want a one-click Screen-Share Mode so that I can instantly make the entire UI safe when sharing my screen.
- As an Admin, I want to set a studio-wide minimum sensitivity level so that users can increase but not decrease below the studio minimum.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Thumbnail Blur
**Description:** Configurable per-user thumbnail visibility.
**Acceptance Criteria:**
- [ ] Four levels: Full (unblurred), Soft Blur (recognizable but muted), Heavy Blur (unrecognizable), Placeholder Icon (generic silhouette)
- [ ] Applies to all image and video thumbnails platform-wide (library views, search results, dashboard widgets)
- [ ] Setting persists per user via PRD-04

#### Requirement 1.2: Per-View Overrides
**Description:** Override the global blur setting per view.
**Acceptance Criteria:**
- [ ] Users can set a different blur level per view (e.g., blur in library, full in Review Interface)
- [ ] Overrides take precedence over the global setting for that view only
- [ ] Override settings persist per user per view

#### Requirement 1.3: Preview Watermarking
**Description:** Configurable on-screen watermark for in-platform preview playback.
**Acceptance Criteria:**
- [ ] Options: username, timestamp, project name, or custom text
- [ ] Does not affect source files — applied as a compositing layer during playback only
- [ ] Distinct from PRD-39 delivery watermarking which burns into exported files
- [ ] Configurable position (center/corner) and opacity

#### Requirement 1.4: Screen-Share Mode
**Description:** One-click platform-wide safety mode.
**Acceptance Criteria:**
- [ ] Keyboard shortcut toggle (registered with PRD-52)
- [ ] Activates maximum blur/redaction across all views simultaneously
- [ ] Disables video autoplay and mutes audio
- [ ] Clear visual indicator that Screen-Share Mode is active
- [ ] Single shortcut to deactivate and return to previous settings

#### Requirement 1.5: Admin Defaults
**Description:** Studio-wide minimum sensitivity level.
**Acceptance Criteria:**
- [ ] Admins set studio-wide default sensitivity level
- [ ] Individual users can increase but not decrease below the studio minimum
- [ ] Example: if Admin sets "Soft Blur" as minimum, users can choose "Heavy Blur" but not "Full"

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Scheduled Sensitivity
**Description:** Time-based sensitivity adjustments.
**Acceptance Criteria:**
- [ ] Configure sensitivity by time of day (e.g., "Office Hours" mode with higher blur, "After Hours" mode with lower blur)

## 6. Non-Goals (Out of Scope)
- Delivery watermarking (covered by PRD-39 Scene Assembler)
- Content moderation or classification (not in scope)
- Access control based on content type (covered by PRD-03 RBAC)

## 7. Design Considerations
- Blur levels should be visually distinct so users can immediately tell which level is active.
- Screen-Share Mode indicator should be prominent but not obstructive (e.g., colored border around the viewport).
- Watermark should be clearly visible but not obscure critical review areas.

## 8. Technical Considerations
- **Stack:** CSS filters for blur, Canvas/WebGL overlay for watermarking, React context for sensitivity state
- **Existing Code to Reuse:** PRD-29 design system for visual consistency, PRD-52 shortcut registry for Screen-Share Mode hotkey
- **New Infrastructure Needed:** Sensitivity state manager, blur renderer, watermark compositor, admin sensitivity config
- **Database Changes:** `user_sensitivity_settings` table (user_id, global_level, view_overrides_json), `studio_sensitivity_config` (min_level)
- **API Changes:** GET/PUT /user/sensitivity, GET/PUT /admin/sensitivity-defaults

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Screen-Share Mode activates in <200ms (instant feel)
- Blur rendering adds no perceptible lag to library/dashboard browsing
- Zero incidents of unblurred content displayed when blur is active

## 11. Open Questions
- Should Screen-Share Mode also blur the browser tab favicon/title to prevent information leakage?
- How should watermarking interact with the video playback engine's performance targets (PRD-83)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

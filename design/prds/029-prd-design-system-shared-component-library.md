# PRD-029: Design System & Shared Component Library

## 1. Introduction/Overview
A 106-PRD platform will inevitably diverge in visual style without enforced consistency: three different button styles, inconsistent spacing, colors defined in 50 places. This PRD provides a centralized, token-driven design system that enforces visual consistency and component reuse across every module. All UI is built from a single shared component library with lint-enforced import restrictions, ensuring that changing the platform's primary color or font is a single-line edit.

## 2. Related PRDs & Dependencies
- **Depends on:** None (foundational UI infrastructure)
- **Depended on by:** All frontend PRDs (PRD-30 through PRD-74)
- **Part:** Part 4 — Design System & UX Patterns

## 3. Goals
- Establish a token-driven design system covering color, typography, spacing, icons, and animation.
- Provide a shared component library (primitives, composites, layout, domain components) used by all features.
- Enforce consistency through lint rules, import restrictions, and Storybook documentation.
- Support multi-axis theming (Dark/Light x Obsidian/Neon/Custom) with runtime switching.

## 4. User Stories
- As a Creator, I want a consistent, visually coherent UI across all platform views so that I can focus on content, not interface inconsistencies.
- As an Admin, I want to customize the studio's brand palette through a Token Editor so that the platform reflects our brand without code changes.
- As a Creator, I want to switch between Dark and Light modes instantly so that I can optimize for my working environment.
- As an Admin, I want lint rules enforcing shared component usage so that developers cannot introduce one-off implementations.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Token Architecture
**Description:** Centralized design tokens for all visual properties.
**Acceptance Criteria:**
- [ ] Color tokens use semantic naming (`surface-primary`, `action-danger`, `text-muted`) mapped to raw values; no hex/rgb literals in feature code
- [ ] Typography tokens define font family, size scale (12px-32px in named steps `text-xs` through `text-3xl`), weight, line-height, and letter-spacing
- [ ] Spacing & layout tokens use a consistent 4px base unit scale, border radii, shadow elevations, and responsive breakpoints
- [ ] Icon tokens provide a centralized registry (single import source); adding/swapping an icon happens in one file
- [ ] Animation tokens define durations, easing curves, and transition presets

#### Requirement 1.2: Shared Component Library
**Description:** Reusable component set used by all feature modules.
**Acceptance Criteria:**
- [ ] Primitive components: Button, Input, Select, Checkbox, Toggle, Badge, Tooltip, Avatar — no raw HTML `<button>` or `<input>` outside the library
- [ ] Composite components: Card, Modal, Drawer, Dropdown, Table, Tabs, Accordion, Toast — built from primitives
- [ ] Layout components: Stack, Grid, Divider, Spacer, Panel, Sidebar — encapsulate spacing and responsive behavior
- [ ] Domain components: ThumbnailCard, StatusBadge, TimelineEntry, MetadataField — shared across Library, Review, and Dashboard views

#### Requirement 1.3: Enforcement Mechanisms
**Description:** Automated enforcement of design system usage.
**Acceptance Criteria:**
- [ ] ESLint/Stylelint rules flag raw color values, inline styles, and direct HTML elements where a shared component exists
- [ ] CI fails on lint violations
- [ ] Import restrictions: all shared components exported from a single barrel (`@/components`); lint rules prevent importing internal implementation files
- [ ] New component review process: requires usage by 2+ features before adding to the shared library

#### Requirement 1.4: Storybook Catalog
**Description:** Living documentation of all shared components.
**Acceptance Criteria:**
- [ ] Every shared component has a Storybook entry with all variants, states, and usage examples
- [ ] Storybook serves as source of truth for what exists — developers check here before building anything new

#### Requirement 1.5: Theme System
**Description:** Multi-axis theming with runtime switching.
**Acceptance Criteria:**
- [ ] Two-axis model: color scheme (Dark/Light) x brand palette (Obsidian/Neon/Custom) — any combination works
- [ ] Dark mode: low-luminance surfaces, high-contrast text, optimized for extended studio sessions
- [ ] Light mode: high-luminance surfaces for bright environments or accessibility preference
- [ ] Obsidian palette: cool, neutral, slate grays, muted accents, professional tone
- [ ] Neon palette: vibrant, high-energy, electric accents on dark surfaces
- [ ] System preference detection via `prefers-color-scheme` on first visit; remembers user choice via PRD-04
- [ ] Runtime switching by swapping CSS custom property sets on `:root` — no page reload, no re-render, no flash
- [ ] High Contrast Mode: accessibility variant increasing contrast ratios beyond WCAG AA to AAA thresholds

#### Requirement 1.6: Token Editor (Admin)
**Description:** UI for adjusting design tokens.
**Acceptance Criteria:**
- [ ] Admins can adjust color palette, font family, font size scale, icon set, and spacing scale
- [ ] Changes preview live in a split-pane before committing
- [ ] Persists to the theme configuration file
- [ ] Brand export: export current token set as JSON or CSS custom properties for external tools

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Custom Themes
**Description:** Admin-created brand palettes.
**Acceptance Criteria:**
- [ ] Admins create new brand palettes by duplicating an existing token set and adjusting values
- [ ] Custom themes appear in the theme picker alongside built-ins

## 6. Non-Goals (Out of Scope)
- Layout management and panel system (covered by PRD-30)
- Keyboard shortcuts and navigation (covered by PRD-31, PRD-52)
- Content sensitivity controls (covered by PRD-82)

## 7. Design Considerations
- The design system is infrastructure, not a "nice to have" — enforcement (lint rules, import restrictions) makes it a system rather than a suggestion.
- Changing the entire platform's primary color or switching fonts should be a single-line edit.
- Components should be documented with clear usage guidelines in Storybook.

## 8. Technical Considerations
- **Stack:** React (TypeScript), CSS Custom Properties for theming, Storybook for documentation
- **Existing Code to Reuse:** None (foundational)
- **New Infrastructure Needed:** Token system, component library, Storybook catalog, lint rules, Token Editor UI
- **Database Changes:** `theme_configurations` table (id, user_id, scheme, palette, custom_tokens_json)
- **API Changes:** GET/PUT /user/theme, CRUD /admin/themes, GET /admin/themes/export

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- 100% of UI elements use shared components (zero raw HTML elements for interactive controls)
- CI lint enforcement catches 100% of token/component violations before merge
- Theme switching completes in <100ms with no visual flash
- Storybook coverage matches the full component library (no undocumented components)

## 11. Open Questions
- Should the design system support third-party theme packages (e.g., community-created palettes)?
- What is the migration strategy for existing UI that predates the design system?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

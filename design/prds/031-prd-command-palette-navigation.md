# PRD-031: Command Palette & Navigation (Cmd+K)

## 1. Introduction/Overview
Power users need to jump between projects, characters, scenes, and trigger bulk actions without clicking through menus. This PRD provides a global search and command interface activated via Cmd+K (or Ctrl+K), integrating with PRD-20 for instant entity search and PRD-52 for displaying shortcut hints alongside every action.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-20 (Search & Discovery Engine), PRD-52 (Keyboard Shortcuts)
- **Depended on by:** None
- **Part:** Part 4 — Design System & UX Patterns

## 3. Goals
- Provide instant access to any entity (project, character, scene, segment) via fuzzy search.
- Enable command execution (navigation, bulk actions, settings) from a single interface.
- Show keyboard shortcut hints next to every action for discoverability.
- Support recent history and frecency-based result ranking.

## 4. User Stories
- As a Creator, I want to press Cmd+K and type a character name to navigate directly to that character so that I avoid clicking through project hierarchies.
- As a Creator, I want to see available commands (e.g., "Submit Batch", "Export ZIP") in the palette so that I can trigger actions without finding the menu.
- As a Reviewer, I want the palette to show recently accessed items first so that I can quickly return to what I was reviewing.
- As an Admin, I want shortcut hints displayed next to each command so that I learn shortcuts organically.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Search Integration
**Description:** Fuzzy search across all platform entities.
**Acceptance Criteria:**
- [ ] Searches projects, characters, scenes, segments, scene types, and wiki articles
- [ ] Fuzzy matching with ranked results (exact match first, then fuzzy)
- [ ] Results appear within 100ms of typing (PRD-20 search engine integration)
- [ ] Result items show entity type icon, name, and parent context (e.g., "Jane > Dance Scene")

#### Requirement 1.2: Command Registry
**Description:** Actionable commands available through the palette.
**Acceptance Criteria:**
- [ ] Navigation commands: Go to project, character, scene, settings, dashboard
- [ ] Action commands: Submit batch, export ZIP, run QA, approve all, reject all
- [ ] Settings commands: Switch theme, change layout, toggle sensitivity mode
- [ ] Each command shows its keyboard shortcut (from PRD-52 registry) if one exists

#### Requirement 1.3: Recent & Frecency
**Description:** Prioritize recently and frequently accessed items.
**Acceptance Criteria:**
- [ ] Recently accessed entities appear first when palette opens (before typing)
- [ ] Frecency scoring combines recency and frequency for ranking
- [ ] Configurable: number of recent items to display (default: 10)

#### Requirement 1.4: Keyboard Navigation
**Description:** Full keyboard control within the palette.
**Acceptance Criteria:**
- [ ] Arrow keys to navigate results
- [ ] Enter to select/execute
- [ ] Escape to dismiss
- [ ] Tab to switch between search categories (All, Commands, Entities)

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Scoped Command Contexts
**Description:** Context-aware commands based on active view.
**Acceptance Criteria:**
- [ ] When viewing a character, palette shows character-specific commands first (e.g., "Generate Scenes", "View Consistency Report")
- [ ] Context commands appear in a separate section above global commands

## 6. Non-Goals (Out of Scope)
- Full search engine implementation (covered by PRD-20)
- Keyboard shortcut configuration (covered by PRD-52)
- Full-text content search (covered by PRD-20)

## 7. Design Considerations
- Palette should appear centered, overlaying the current view with a subtle backdrop.
- Results should update live as the user types (no submit button).
- Category tabs (All, Commands, Entities) should be clearly differentiated.

## 8. Technical Considerations
- **Stack:** React modal component, PRD-20 search API for entity lookup, PRD-52 shortcut registry for hints
- **Existing Code to Reuse:** PRD-20 search engine, PRD-52 shortcut registry
- **New Infrastructure Needed:** Command registry, frecency scorer, palette UI component
- **Database Changes:** `user_recent_items` table (user_id, entity_type, entity_id, access_count, last_accessed)
- **API Changes:** GET /search/palette?q=query, GET /user/recent-items

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Palette opens in <100ms after keyboard shortcut
- Search results appear within 100ms of keystroke
- Users can navigate to any entity in <3 seconds from palette activation

## 11. Open Questions
- Should the palette support chained commands (e.g., "Go to Project X > Character Y")?
- How should the palette handle commands that require parameters (e.g., "Set quality threshold to [value]")?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

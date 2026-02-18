# PRD-089: Dashboard Widget Customization

## 1. Introduction/Overview
PRD-42 defines what the Studio Pulse Dashboard shows, but treats it as a fixed layout. An Admin monitoring GPU health wants a different dashboard from a Creator tracking active jobs, and a Reviewer wants their review queue front and center. This PRD extends PRD-42 with user-configurable dashboard layouts, drag-and-drop widget placement, a widget library, per-widget configuration, role-based defaults, and saveable presets — ensuring everyone's primary information is prominently placed.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-04 (Session Persistence for layout storage), PRD-42 (Studio Pulse Dashboard for base widget framework), PRD-85 (UI Plugin Architecture for extension widgets)
- **Depended on by:** None
- **Part:** Part 6 — Production & Hand-off

## 3. Goals
- Enable drag-and-drop widget placement and resizing.
- Provide a widget library catalog with native and extension widgets.
- Support per-widget configuration for personalized data views.
- Deliver role-based defaults with per-user customization.

## 4. User Stories
- As an Admin, I want to rearrange my dashboard to show GPU utilization and system health prominently so that my most critical metrics are visible first.
- As a Creator, I want to add a "My Jobs" widget and remove system-health widgets I don't need so that my dashboard reflects my workflow.
- As a Reviewer, I want the review queue widget front and center so that I see pending reviews immediately on login.
- As an Admin, I want to define default dashboard layouts per role so that new users get a sensible starting configuration.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Widget Library
**Description:** Catalog of available dashboard widgets.
**Acceptance Criteria:**
- [ ] Catalog includes: Active Jobs, Recent Approvals, My Review Queue, Disk Health, Project Progress, GPU Utilization, Pinned Characters, Quick Links, Activity Feed, Calendar/Schedule, Quality Trends
- [ ] Each widget has a description and preview in the catalog
- [ ] Extension widgets from PRD-85 plugins appear alongside native widgets

#### Requirement 1.2: Drag-and-Drop Layout
**Description:** Interactive layout editing.
**Acceptance Criteria:**
- [ ] "Edit Mode" toggle to enter layout editing
- [ ] Drag widgets to rearrange positions
- [ ] Resize widgets (span 1-4 columns, configurable row height)
- [ ] Add and remove widgets
- [ ] Snap-to-grid layout with responsive columns

#### Requirement 1.3: Per-Widget Configuration
**Description:** Widget-level settings.
**Acceptance Criteria:**
- [ ] Each widget instance has configurable settings
- [ ] Example: "Project Progress" widget can show a specific project or all projects
- [ ] Example: "Active Jobs" widget can filter to "My jobs" or "All jobs"
- [ ] Settings accessible via a gear icon on the widget header

#### Requirement 1.4: Per-User Persistence
**Description:** Personal dashboard layouts.
**Acceptance Criteria:**
- [ ] Dashboard layouts saved per user via PRD-04 session persistence
- [ ] Each user sees their own arrangement
- [ ] Changes don't affect other users

#### Requirement 1.5: Role-Based Defaults
**Description:** Sensible starting layouts per role.
**Acceptance Criteria:**
- [ ] Admin default: system health and GPU utilization prominent
- [ ] Creator default: job queue and review status prominent
- [ ] Reviewer default: review queue and recent submissions prominent
- [ ] Users can customize from the role default

#### Requirement 1.6: Dashboard Presets
**Description:** Saveable named layouts.
**Acceptance Criteria:**
- [ ] Save and name multiple dashboard layouts
- [ ] Switch between presets: "Production Mode," "Review Mode," "Admin Mode"
- [ ] Share presets with other users

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Widget Templates
**Description:** Pre-configured widget bundles.
**Acceptance Criteria:**
- [ ] Admin creates widget bundles (e.g., "QA Dashboard": review queue + quality trends + recent rejections)
- [ ] Users can add entire bundles to their dashboard in one click

## 6. Non-Goals (Out of Scope)
- Core widget data and content (covered by PRD-42)
- Performance metrics visualization (covered by PRD-41)
- Plugin architecture (covered by PRD-85)

## 7. Design Considerations
- Edit Mode should be clearly distinguishable from normal viewing mode (dashed borders, drag handles visible).
- Widget resize handles should be intuitive (corner and edge handles).
- The widget library should be filterable and searchable.

## 8. Technical Considerations
- **Stack:** React with drag-and-drop library (e.g., react-grid-layout), PRD-04 persistence
- **Existing Code to Reuse:** PRD-42 widget components, PRD-04 session persistence, PRD-85 plugin registry
- **New Infrastructure Needed:** Layout editor, widget catalog UI, preset manager, per-widget settings engine
- **Database Changes:** Extends PRD-42 `dashboard_config` table with: presets array, widget settings per instance
- **API Changes:** GET/PUT /user/dashboard, CRUD /user/dashboard/presets, GET /dashboard/widget-catalog, POST /admin/dashboard/role-defaults

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Drag-and-drop operations render at >30fps (smooth interaction)
- Layout saves persist correctly across sessions 100% of the time
- Preset switching completes in <500ms
- Users customize their dashboard within the first week (>60% adoption)

## 11. Open Questions
- Should widget layouts be screen-resolution-adaptive (different layouts for different screen sizes)?
- How should the system handle widget catalog updates when new widgets are added by plugins?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

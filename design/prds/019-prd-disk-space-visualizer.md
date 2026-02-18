# PRD-019: Disk Space Visualizer (Treemap)

## 1. Introduction/Overview
Studios generating terabytes of video content need instant visibility into which projects and scenes are consuming the most storage. This PRD provides a Sunburst/Treemap chart of storage usage broken down by project, character, and scene, enabling admins to quickly identify storage hogs and make informed cleanup decisions.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model for hierarchy), PRD-00 (Database for size tracking)
- **Depended on by:** None directly (complements PRD-15 Disk Reclamation)
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Visualize storage usage as an interactive treemap or sunburst chart.
- Break down usage by project > character > scene > segment.
- Enable click-through navigation from visualization to entity detail views.
- Integrate with reclamation tools for actionable cleanup.

## 4. User Stories
- As an Admin, I want a visual treemap of storage usage so that I can instantly see which projects are consuming the most disk space.
- As an Admin, I want to click on a segment in the treemap to navigate to its detail view so that I can investigate large files.
- As an Admin, I want to see which file types (videos, images, intermediates) consume the most space so that I can target cleanup policies.
- As a Creator, I want to see my project's storage footprint so that I can be mindful of disk usage.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Treemap Visualization
**Description:** Interactive hierarchical storage visualization.
**Acceptance Criteria:**
- [ ] Treemap shows storage usage with nested rectangles: project > character > scene
- [ ] Rectangle size proportional to disk usage
- [ ] Color coding by entity type or status (approved/unapproved)
- [ ] Hover shows: entity name, disk size, file count

#### Requirement 1.2: Drill-Down Navigation
**Description:** Click to explore deeper levels of the hierarchy.
**Acceptance Criteria:**
- [ ] Click a project to see character-level breakdown
- [ ] Click a character to see scene-level breakdown
- [ ] Click a scene to see segment-level breakdown with individual file sizes
- [ ] Breadcrumb navigation to return to higher levels

#### Requirement 1.3: File Type Breakdown
**Description:** Show storage distribution by file type.
**Acceptance Criteria:**
- [ ] Breakdown by: video files, image files, intermediate/temporary files, metadata
- [ ] Pie chart or stacked bar showing proportions
- [ ] Filterable: show only videos, only intermediates, etc.

#### Requirement 1.4: Reclamation Integration
**Description:** Link to cleanup actions from the visualization.
**Acceptance Criteria:**
- [ ] "Clean up" action available on any entity in the treemap
- [ ] Links to PRD-15 reclamation preview for the selected entity
- [ ] Shows reclaimable space estimate in the tooltip

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Sunburst View
**Description:** Alternative circular visualization for hierarchy.
**Acceptance Criteria:**
- [ ] Sunburst chart as an alternative to treemap
- [ ] Same drill-down and interaction capabilities

## 6. Non-Goals (Out of Scope)
- Disk reclamation execution (covered by PRD-15)
- External storage management (covered by PRD-48)
- System-level disk monitoring (covered by PRD-80)

## 7. Design Considerations
- The treemap should use warm-to-cool color gradients (red for large, blue for small).
- Animations should smooth transitions during drill-down.
- The visualization should be embeddable as a PRD-89 dashboard widget.

## 8. Technical Considerations
- **Stack:** React with D3.js or Recharts for treemap rendering
- **Existing Code to Reuse:** PRD-01 entity hierarchy for data structure
- **New Infrastructure Needed:** Storage size aggregation service, cached size summaries
- **Database Changes:** Add size tracking columns to entity tables or create a `storage_usage` materialized view
- **API Changes:** GET /admin/storage/treemap (hierarchical size data)

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Treemap renders within 2 seconds for studios with up to 1000 entities
- Storage sizes are accurate to within 1% of actual filesystem usage
- Drill-down transitions complete in <500ms
- Click-through correctly navigates to the entity detail view

## 11. Open Questions
- How frequently should storage sizes be recalculated (real-time vs. periodic)?
- Should the treemap include deleted/trashed files in a separate visual layer?
- What is the minimum rectangle size before it becomes unreadable?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

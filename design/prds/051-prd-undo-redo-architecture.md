# PRD-051: Undo/Redo Architecture

## 1. Introduction/Overview
Creative tools live and die by their undo system. This PRD provides a structured, tree-based undo/redo system that tracks all reversible actions across the platform with per-entity scoping and persistent state. The tree model (vs. linear stack) is essential because creators frequently explore variations ("try this, undo, try that") and need to revisit earlier branches without losing any history.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-04 (Session Persistence for undo tree serialization), PRD-47 (Tagging for tag add/remove undo)
- **Depended on by:** None
- **Part:** Part 4 — Design System & UX Patterns

## 3. Goals
- Implement tree-based (not linear) undo history preserving all branches.
- Scope undo operations per entity (character, scene, segment) — not globally.
- Define clear boundaries between undoable and non-undoable actions.
- Persist undo state across sessions.

## 4. User Stories
- As a Creator, I want tree-based undo so that when I explore a parameter variation and want to go back, my previous exploration branch is preserved.
- As a Creator, I want per-entity undo so that undoing a metadata change on Character A doesn't affect unrelated work on Character B.
- As a Creator, I want a visual history browser so that I can see all my undo branches and click any point to preview the state.
- As a Creator, I want undo state to survive logout/login so that I can resume exploration in my next session.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Tree-Based History
**Description:** Undo history forms a tree, not a linear stack.
**Acceptance Criteria:**
- [ ] When a user undoes several steps and performs a new action, the old forward path is preserved as a branch
- [ ] Branches are navigable — user can switch to any branch at any time
- [ ] No history is ever destroyed by branching

#### Requirement 1.2: Per-Entity Scope
**Description:** Undo operates at the entity level.
**Acceptance Criteria:**
- [ ] Each entity (character, scene, segment) maintains its own undo tree
- [ ] Undoing on one entity does not affect other entities
- [ ] Entity-level scope prevents cross-entity confusion in multi-entity workflows

#### Requirement 1.3: Undoable Actions
**Description:** Define which actions support undo.
**Acceptance Criteria:**
- [ ] Metadata edits (character traits, scene parameters, segment settings)
- [ ] Approval/rejection decisions (with confirmation, since these may have triggered downstream events via PRD-97)
- [ ] Parameter changes on pending/queued generation jobs
- [ ] Tag additions/removals (PRD-47)
- [ ] Template application (PRD-27) — revert to pre-template state

#### Requirement 1.4: Non-Undoable Actions
**Description:** Explicitly define actions that cannot be undone.
**Acceptance Criteria:**
- [ ] Completed GPU generation (too expensive — use re-generation instead)
- [ ] Disk reclamation (PRD-15 — deleted files cannot be restored from undo)
- [ ] Audit log entries (PRD-45 — immutable by definition)
- [ ] Clear messaging when a non-undoable action is performed

#### Requirement 1.5: Persistence
**Description:** Undo tree survives sessions.
**Acceptance Criteria:**
- [ ] Undo tree state serialized per user per entity
- [ ] Stored via PRD-04 session persistence
- [ ] Survives logout/login

#### Requirement 1.6: Visual History Browser
**Description:** Visual representation of the undo tree.
**Acceptance Criteria:**
- [ ] Scrollable timeline showing the undo tree with branch points
- [ ] Click any node to preview the state at that point before committing
- [ ] Current position clearly indicated
- [ ] Branch labels showing the action that created each branch

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Undo History Sharing
**Description:** Share undo branches with collaborators.
**Acceptance Criteria:**
- [ ] Export a specific branch of the undo tree as a named "exploration"
- [ ] Another user can import and apply the exploration to their entity

## 6. Non-Goals (Out of Scope)
- Non-linear parameter history for progressive disclosure (covered by PRD-32)
- Content branching for generated outputs (covered by PRD-50)
- Audit logging of actions (covered by PRD-45)

## 7. Design Considerations
- The visual history browser should use a tree/graph visualization, not a flat list.
- Branch points should be visually distinct from linear steps.
- Preview of historical states should be non-destructive (view only) until the user commits.

## 8. Technical Considerations
- **Stack:** React state management (zustand or similar) with tree-structured history, serialized to JSON
- **Existing Code to Reuse:** PRD-04 session persistence for storage, PRD-47 tag data for tag undo operations
- **New Infrastructure Needed:** Undo tree data structure, action serializer/deserializer, visual tree renderer
- **Database Changes:** `undo_trees` table (user_id, entity_type, entity_id, tree_json, updated_at)
- **API Changes:** GET/PUT /user/undo-tree/:entity_type/:entity_id

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Undo/redo operations execute in <50ms (instant feel)
- Undo tree correctly preserves all branches without data loss
- Undo state successfully persists across logout/login cycles
- Per-entity scoping prevents cross-entity undo interference

## 11. Open Questions
- What is the maximum undo tree depth/size before pruning old branches?
- Should undo trees be purgeable by the user (e.g., "Clear all undo history for this character")?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

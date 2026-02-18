# PRD-100: Scene Type Inheritance & Composition

## 1. Introduction/Overview
Studios typically have 3-5 base scene types with 2-4 variations each. Without inheritance, updating a shared LoRA means editing 15 scene types instead of 5 parents. This PRD provides hierarchical scene type definitions where children inherit from a parent and override only what differs, plus mixin compositions for reusable parameter bundles. Cascade updates make configuration changes O(parents) instead of O(total scene types).

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-23 (Scene Type Configuration)
- **Depended on by:** PRD-91, PRD-97
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Support parent-child scene type hierarchy with selective override.
- Cascade parent changes to children that haven't overridden those fields.
- Provide visual distinction between inherited and overridden values.
- Support mixin compositions for reusable parameter bundles.

## 4. User Stories
- As a Creator, I want "Dance Slow" to inherit from "Dance" and only override duration so that shared settings are maintained centrally.
- As a Creator, I want parent LoRA updates to cascade to all dance variants so that I update once instead of N times.
- As a Creator, I want to see which values are inherited vs. overridden so that I understand the configuration source.
- As a Creator, I want "High Quality Settings" mixin that applies across scene types.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Parent-Child Hierarchy
**Description:** Children inherit all settings from parent.
**Acceptance Criteria:**
- [ ] Define parent scene type with base settings
- [ ] Create children that inherit everything from parent
- [ ] Children override specific fields only
- [ ] Max depth configurable (default: 3 levels)

#### Requirement 1.2: Selective Override
**Description:** Children specify only what's different.
**Acceptance Criteria:**
- [ ] Override any individual field (duration, prompt modifier, LoRA weight)
- [ ] Non-overridden fields remain linked to parent
- [ ] One-click revert: remove override to re-inherit

#### Requirement 1.3: Cascade Updates
**Description:** Parent changes propagate to non-overridden children.
**Acceptance Criteria:**
- [ ] When parent changes, children without explicit overrides inherit the change
- [ ] Children with overrides are unaffected
- [ ] Impact preview shown before applying parent changes

#### Requirement 1.4: Override Indicators
**Description:** Visual distinction between inherited and overridden values.
**Acceptance Criteria:**
- [ ] Inherited values: greyed, with "inherited from [Parent]" label
- [ ] Overridden values: bold, with "overridden" label
- [ ] One-click toggle between inherited and overridden

#### Requirement 1.5: Mixins
**Description:** Reusable parameter bundles applied to scene types.
**Acceptance Criteria:**
- [ ] Create named parameter bundles (e.g., "High Quality": higher steps, lower denoise)
- [ ] Apply mixins to scene types (override parent, overridden by child)
- [ ] Multiple mixins per scene type

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Multi-Level Cascade Preview
**Description:** Visualize the full inheritance chain.
**Acceptance Criteria:**
- [ ] Tree view showing parent -> children -> grandchildren with effective values

## 6. Non-Goals (Out of Scope)
- Scene type creation basics (covered by PRD-23)
- Template system (covered by PRD-27)

## 7. Design Considerations
- Inheritance tree should be visible in the scene type browser.
- Override indicators should be inline in the scene type editor.

## 8. Technical Considerations
- **Stack:** Rust for inheritance resolver, React for editor UI
- **Existing Code to Reuse:** PRD-23 scene type data
- **New Infrastructure Needed:** Inheritance resolver, mixin engine, cascade update propagator
- **Database Changes:** `parent_scene_type_id` column, `scene_type_overrides` table, `mixins` table
- **API Changes:** POST /scene-types/:id/children, GET /scene-types/:id/effective-config, CRUD /mixins

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Cascade updates propagate correctly to all non-overridden children
- Override indicators correctly distinguish inherited from overridden values
- Effective configuration correctly resolves parent + mixin + child overrides

## 11. Open Questions
- What should happen when a parent is deleted — promote children to root, or block deletion?
- Should mixin ordering matter (last wins)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

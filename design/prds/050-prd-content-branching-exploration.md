# PRD-050: Content Branching & Exploration

## 1. Introduction/Overview
Different from undo (linear reversal) and re-rolling (in-place replacement), branching enables concurrent creative exploration. This PRD provides git-like branching for scenes and character configurations, allowing parallel versions without affecting the main line. Creators can explore "What if we tried a completely different LoRA?" while keeping the approved main line safe.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model), PRD-15 (Disk Reclamation for branch cleanup), PRD-36 (Sync-Play for comparison)
- **Depended on by:** None
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Enable branch creation from any scene or character configuration.
- Provide side-by-side comparison of branches using Sync-Play Grid.
- Support merge/promote to replace the main line with a branch.
- Integrate with disk reclamation for cleaning up abandoned branches.

## 4. User Stories
- As a Creator, I want to branch a scene and try a different LoRA so that I can compare results without risking the approved version.
- As a Creator, I want to compare branches side-by-side so that I can make an informed decision about which direction is better.
- As a Creator, I want to promote a branch to become the new main line so that the best version becomes the official output.
- As an Admin, I want to clean up abandoned branches so that experimental data doesn't consume disk space indefinitely.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Branch Creation
**Description:** Fork a scene into a named branch.
**Acceptance Criteria:**
- [ ] Branch from any scene at any point (pre-generation, mid-generation, post-approval)
- [ ] Branch gets an independent copy of parameters
- [ ] Branch can diverge freely (different LoRA, prompt, workflow)
- [ ] Branches are named and described

#### Requirement 1.2: Branch Comparison
**Description:** Side-by-side review of branch outputs.
**Acceptance Criteria:**
- [ ] Compare segments from different branches using PRD-36 Sync-Play Grid
- [ ] Quality scores (PRD-49) shown for both versions
- [ ] Visual diff highlighting differences between versions

#### Requirement 1.3: Merge / Promote
**Description:** Make a branch the new main line.
**Acceptance Criteria:**
- [ ] Promote a branch to replace the current main line
- [ ] Cherry-pick specific segments from a branch back into main
- [ ] Previous main line preserved as a branch (not deleted)
- [ ] Merge action logged in audit trail

#### Requirement 1.4: Branch Cleanup
**Description:** Discard experimental branches and reclaim space.
**Acceptance Criteria:**
- [ ] Delete a branch and its associated files
- [ ] Deletion goes through PRD-15 reclamation policies
- [ ] Bulk cleanup of branches older than configurable threshold
- [ ] Confirmation required for branch deletion

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Branch Timeline
**Description:** Visual timeline showing branches as parallel tracks.
**Acceptance Criteria:**
- [ ] Scene timeline shows main line and branches as parallel tracks
- [ ] Branch points and merge points clearly marked

## 6. Non-Goals (Out of Scope)
- Undo/redo system (covered by PRD-51)
- Segment regeneration comparison (covered by PRD-101)
- Version control for code or workflows (handled externally)

## 7. Design Considerations
- Branches should be visually represented as parallel timelines.
- The active branch should be clearly indicated in the scene header.
- Branch comparison should be accessible from the scene detail view.

## 8. Technical Considerations
- **Stack:** React for branch UI, Rust for branch management, PostgreSQL for branch metadata
- **Existing Code to Reuse:** PRD-36 Sync-Play, PRD-15 reclamation
- **New Infrastructure Needed:** Branch manager, merge service, branch-aware scene navigation
- **Database Changes:** `branches` table (id, scene_id, name, parent_branch_id, created_at), branch_id on segments
- **API Changes:** POST /scenes/:id/branch, POST /branches/:id/promote, DELETE /branches/:id

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Branch creation completes in <2 seconds
- Branch comparison loads both versions simultaneously for Sync-Play
- Promote/merge correctly replaces the main line without data loss
- Branch cleanup correctly reclaims disk space

## 11. Open Questions
- How deep should branch nesting be allowed (branches of branches)?
- Should branch metadata (parameters, prompt changes) be diffable?
- How should branches be handled during delivery packaging?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

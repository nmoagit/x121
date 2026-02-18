# PRD-097: Job Dependency Chains & Triggered Workflows

## 1. Introduction/Overview
PRD-57 orchestrates a fixed batch flow, but real production workflows have conditional progressions. "Auto-generate scenes when variants are approved" or "auto-package when everything's done" require manual intervention without configurable triggers. This PRD provides "when X completes, automatically start Y" rules that turn a supervised pipeline into a self-advancing one where humans only intervene at explicit approval gates.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-08, PRD-10, PRD-12, PRD-45, PRD-57
- **Depended on by:** None
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Define trigger rules: "When [event] on [entity scope], automatically [action]."
- Provide a visual condition builder for trigger configuration.
- Visualize dependency chains as directed graphs.
- Include safety controls (max chain depth, dry-run, admin approval for costly triggers).

## 4. User Stories
- As a Creator, I want auto-scene-generation when variants are approved so that the pipeline advances without manual clicking.
- As a Creator, I want auto-delivery-packaging when all scenes are approved so that the final step is automatic.
- As an Admin, I want safety controls so that triggers can't create infinite loops or runaway GPU consumption.
- As an Admin, I want a trigger log so that I can see what was triggered, when, and why.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Trigger Rules
**Description:** Configurable event-to-action rules.
**Acceptance Criteria:**
- [ ] Event types: completed, approved, failed
- [ ] Entity scope: specific character, all characters, project-wide
- [ ] Actions: submit job, trigger QA, start concatenation, package delivery, send notification, call webhook
- [ ] Multiple actions per trigger (sequential or parallel)

#### Requirement 1.2: Condition Builder
**Description:** Visual interface for trigger conditions.
**Acceptance Criteria:**
- [ ] Visual builder: event type, entity scope, optional filters
- [ ] Filters: resolution tier, scene type, variant
- [ ] Preview: "If this trigger fires, here's what would happen"

#### Requirement 1.3: Chain Visualization
**Description:** Directed graph of the dependency chain.
**Acceptance Criteria:**
- [ ] Graph shows: trigger events -> actions -> downstream triggers
- [ ] Distinguishes automated steps from human approval gates
- [ ] Navigable: click to edit any trigger in the chain

#### Requirement 1.4: Safety Controls
**Description:** Prevent infinite loops and runaway costs.
**Acceptance Criteria:**
- [ ] Maximum chain depth configurable (default: 10)
- [ ] Dry-run mode: show what would happen without executing
- [ ] Admin approval required for triggers that submit generation jobs
- [ ] Trigger disable switch for emergency halt

#### Requirement 1.5: Trigger Log
**Description:** Complete audit trail of trigger firings.
**Acceptance Criteria:**
- [ ] Logged: what event caused it, what action taken, result, downstream effects
- [ ] Visible in job detail view and PRD-45 audit trail

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Conditional Logic in Triggers
**Description:** If/else branching in trigger rules.
**Acceptance Criteria:**
- [ ] "If QA pass rate > 80%, auto-approve; else flag for review"

## 6. Non-Goals (Out of Scope)
- Batch orchestration (covered by PRD-57)
- Job scheduling (covered by PRD-08)
- Smart auto-retry (covered by PRD-71)

## 7. Design Considerations
- The condition builder should be intuitive for non-technical users.
- Chain visualization should resemble a flowchart.

## 8. Technical Considerations
- **Stack:** Rust trigger engine, React for visual builder and graph
- **Existing Code to Reuse:** PRD-10 event bus for event detection, PRD-08 job submission
- **New Infrastructure Needed:** Trigger engine, condition evaluator, chain depth tracker
- **Database Changes:** `triggers` table (id, event_type, scope, conditions, actions, max_depth, enabled)
- **API Changes:** CRUD /triggers, POST /triggers/:id/dry-run, GET /triggers/chain-graph

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Triggers fire within 10 seconds of the triggering event
- Zero infinite loops in production
- Dry-run correctly predicts the trigger chain outcome

## 11. Open Questions
- Should triggers be project-scoped or global?
- How should trigger ordering work when multiple triggers fire from the same event?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

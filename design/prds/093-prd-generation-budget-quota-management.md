# PRD-093: Generation Budget & Quota Management

## 1. Introduction/Overview
PRD-61 estimates cost before submission, but estimates are informational — they don't enforce limits. Without budgets, a batch submission of 160 scenes can consume all available GPU time for days, blocking other projects. This PRD implements per-project and per-user GPU hour budgets with configurable warning thresholds and hard limits, turning cost awareness from "FYI" into enforceable policy.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-08 (Queue Management), PRD-10 (Event Bus for notifications), PRD-57 (Batch Orchestrator), PRD-61 (Cost Estimation), PRD-90 (Gantt View)
- **Depended on by:** PRD-73, PRD-97
- **Part:** Part 1 — Infrastructure & System Core

## 3. Goals
- Assign GPU hour budgets to projects and optional quotas to individual users.
- Provide warning thresholds at configurable percentage levels.
- Enforce hard limits that block new submissions when budget is exhausted.
- Support budget exemptions for specific job types (regression tests, draft-resolution).

## 4. User Stories
- As an Admin, I want to assign GPU hour budgets per project so that resource consumption is predictable and controlled.
- As a Creator, I want to see how much of my project's budget remains before submitting a large batch so that I can plan accordingly.
- As an Admin, I want per-user daily quotas so that one creator cannot monopolize the fleet during peak hours.
- As a Creator, I want regression tests and draft-resolution jobs to not count against my budget so that experimentation is not discouraged.
- As an Admin, I want budget trend projections so that I can see when a project will exhaust its allocation.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Project Budgets
**Description:** Assign GPU hour budgets to projects with consumption tracking.
**Acceptance Criteria:**
- [ ] Each project can have a GPU hour budget assigned by Admin
- [ ] Cumulative GPU hours consumed are tracked across all jobs in the project
- [ ] Budget visible in PRD-57 batch orchestrator and PRD-42 dashboard
- [ ] Budget remaining is shown on the job submission screen

#### Requirement 1.2: User Quotas
**Description:** Optional per-user daily or weekly GPU hour quotas.
**Acceptance Criteria:**
- [ ] Admin can set daily or weekly quotas per user
- [ ] Quota consumption resets on the configured schedule
- [ ] Users see their current quota utilization
- [ ] Users approaching their quota are warned before submission

#### Requirement 1.3: Warning Thresholds
**Description:** Configurable notifications at budget percentage milestones.
**Acceptance Criteria:**
- [ ] Warnings fire at configurable thresholds (e.g., 75%, 90%)
- [ ] Warnings delivered via PRD-10 Event Bus
- [ ] Warning appears on the job submission screen before new jobs are queued
- [ ] Warning includes current consumption and remaining budget

#### Requirement 1.4: Hard Limits
**Description:** Block new submissions when budget is exhausted.
**Acceptance Criteria:**
- [ ] At 100% budget consumption, new job submissions are blocked
- [ ] In-progress jobs complete (not killed), but no new ones start
- [ ] Admin override available to increase budget or allow additional jobs
- [ ] Clear message shown to users explaining why submission is blocked

#### Requirement 1.5: Budget Exemptions
**Description:** Mark specific job types as exempt from budget tracking.
**Acceptance Criteria:**
- [ ] Regression test jobs (PRD-65) can be marked exempt
- [ ] Draft-resolution jobs (PRD-59) can be marked exempt
- [ ] Admin configures which job types are exempt
- [ ] Exempt jobs are tracked separately (visible but not counted against budget)

#### Requirement 1.6: Budget Dashboard
**Description:** Visual budget consumption and trend tracking.
**Acceptance Criteria:**
- [ ] Per-project and per-user budget shown as progress bars with trend lines
- [ ] Projection: "At current rate, budget will be exhausted in N days"
- [ ] Integrated into PRD-42 and PRD-73 reporting
- [ ] Historical budget consumption visible by time period

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Rollover & Reset
**Description:** Budget reset on schedule with optional rollover.
**Acceptance Criteria:**
- [ ] Budgets can reset weekly or monthly on a configurable schedule
- [ ] Unused budget rollover is configurable (default: no rollover)
- [ ] Budget can be manually adjusted at any time

## 6. Non-Goals (Out of Scope)
- Cost estimation logic (covered by PRD-61)
- Job scheduling and queue management (covered by PRD-08)
- Fair scheduling quotas (covered by PRD-08)
- Production reporting (covered by PRD-73)

## 7. Design Considerations
- Budget utilization should be visible on every job submission screen as a progress bar.
- The "blocked" state should provide clear guidance: "Contact your Admin to increase the budget."
- Budget trend projections should use clear language, not just charts.

## 8. Technical Considerations
- **Stack:** Rust budget tracking service, PostgreSQL for budget storage, React for dashboard
- **Existing Code to Reuse:** PRD-61 cost tracking data, PRD-10 notification delivery
- **New Infrastructure Needed:** Budget ledger table, quota tracking, threshold alerting
- **Database Changes:** `project_budgets` table, `user_quotas` table, `budget_consumption` table
- **API Changes:** GET /budgets/:project_id, PUT /admin/budgets/:project_id, GET /quotas/:user_id

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Budget consumption tracking is accurate to within 1% of actual GPU hours
- Hard limits correctly block submissions at 100% consumption
- Warning notifications fire within 1 minute of threshold breach
- Exempt jobs are correctly excluded from budget calculations

## 11. Open Questions
- Should budgets be denominated in GPU hours, or in a more abstract "compute units" to account for different GPU tiers?
- How should budget be allocated when a job spans multiple projects?
- Should users be able to see other projects' budget utilization, or only their own?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

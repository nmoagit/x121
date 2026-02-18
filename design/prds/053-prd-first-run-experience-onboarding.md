# PRD-053: First-Run Experience & Onboarding

## 1. Introduction/Overview
A 106-PRD platform is complex by nature. Without guided onboarding, new users face a blank canvas with dozens of panels and no idea where to start. This PRD provides a guided introduction with an interactive welcome tour, a pre-loaded sample project, contextual hints, progressive feature reveal, role-specific onboarding paths, and a getting-started checklist — letting users experience the workflow immediately and build confidence before investing in their own data.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-03 (RBAC for role-specific onboarding paths), PRD-42 (Studio Pulse Dashboard for checklist widget)
- **Depended on by:** None
- **Part:** Part 4 — Design System & UX Patterns

## 3. Goals
- Guide new users through the platform's main areas without overwhelming them.
- Provide a sample project for immediate hands-on experience.
- Deliver role-specific onboarding (Admin, Creator, Reviewer).
- Progressively reveal advanced features as users gain confidence.

## 4. User Stories
- As a Creator, I want a guided welcome tour on first login so that I understand the main navigation areas immediately.
- As a Creator, I want a pre-loaded sample project so that I can experience the review-approve-regenerate workflow before setting up my own data.
- As a Reviewer, I want a reviewer-specific onboarding path so that I see only the features relevant to my role.
- As an Admin, I want an onboarding checklist on the dashboard so that new team members have a clear path to productivity.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Welcome Tour
**Description:** Interactive walkthrough on first login.
**Acceptance Criteria:**
- [ ] Highlights main navigation areas: Library, Workflow Editor, Review, Dashboard
- [ ] Step-by-step with highlights and explanatory text
- [ ] Skippable at any point
- [ ] Re-accessible from the Help menu

#### Requirement 1.2: Sample Project
**Description:** Pre-loaded demo project for immediate exploration.
**Acceptance Criteria:**
- [ ] Includes a character with seed images and generated segments
- [ ] Users can explore the full workflow: review, approve, regenerate
- [ ] Clearly labeled as "Demo Project" to distinguish from real work
- [ ] Deletable once the user is ready to work with their own data

#### Requirement 1.3: Contextual Hints
**Description:** Non-intrusive tooltip hints on first encounter.
**Acceptance Criteria:**
- [ ] Appear once per feature on first encounter (e.g., first time opening the Workflow Editor)
- [ ] Dismissible individually or all at once ("Don't show tips")
- [ ] Content is concise and actionable (e.g., "Drag nodes from the sidebar to build a pipeline")

#### Requirement 1.4: Progressive Feature Reveal
**Description:** Advanced features subdued until basic workflows are completed.
**Acceptance Criteria:**
- [ ] Advanced features (Worker Pool, Branching, Custom Themes) visually subdued during early sessions
- [ ] Not hidden — accessible if explicitly sought, just not competing for attention
- [ ] Features "unlock" visually after the user completes basic workflows

#### Requirement 1.5: Role-Specific Onboarding
**Description:** Different tour paths per role.
**Acceptance Criteria:**
- [ ] Admin path: infrastructure setup, worker configuration, user management
- [ ] Creator path: generation workflow, parameter tuning, batch operations
- [ ] Reviewer path: approval workflow, review shortcuts, annotation tools
- [ ] Role determined from PRD-03 RBAC assignment

#### Requirement 1.6: Onboarding Checklist
**Description:** Getting Started card on the Dashboard.
**Acceptance Criteria:**
- [ ] Completion tracking: "Upload your first portrait," "Run your first generation," "Approve your first segment"
- [ ] Displayed as a widget on the PRD-42 Dashboard
- [ ] Dismissible once completed or manually hidden
- [ ] Progress persists across sessions

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Video Tutorials
**Description:** Embedded tutorial videos for complex workflows.
**Acceptance Criteria:**
- [ ] Short video walkthroughs embedded in the onboarding flow
- [ ] Accessible from the Help menu and contextual help links

## 6. Non-Goals (Out of Scope)
- Platform setup and infrastructure configuration (covered by PRD-105)
- Studio wiki and documentation system (covered by PRD-56)
- Progressive disclosure of parameters (covered by PRD-32)

## 7. Design Considerations
- Tour overlays should not block the entire UI — users should still see the real interface.
- Hints should feel helpful, not patronizing — professional tone, concise text.
- The sample project should demonstrate a realistic workflow, not a toy example.

## 8. Technical Considerations
- **Stack:** React with a tour/tooltip library (e.g., react-joyride), PRD-04 session persistence for state
- **Existing Code to Reuse:** PRD-42 dashboard widget system for checklist, PRD-03 role data for path selection
- **New Infrastructure Needed:** Tour engine, hint tracker, sample project seed data, checklist tracker
- **Database Changes:** `user_onboarding` table (user_id, tour_completed, hints_dismissed_json, checklist_progress_json)
- **API Changes:** GET/PUT /user/onboarding, POST /user/onboarding/reset

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- New users complete the welcome tour in <3 minutes
- Users who interact with the sample project complete their first real task 40% faster than those who skip it
- Onboarding checklist completion rate >70% within the first week

## 11. Open Questions
- Should the sample project be refreshable (reset to initial state for re-exploration)?
- How should onboarding adapt when new PRDs add features after the user completed initial onboarding?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

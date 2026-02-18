# PRD-067: Bulk Character Onboarding Wizard

## 1. Introduction/Overview
Onboarding 10 characters through general-purpose UI means navigating to the character page 10 times, uploading images 10 times, triggering variant generation 10 times. This PRD provides a guided step-by-step wizard for onboarding multiple characters simultaneously, with batch operations at each step: upload, variant generation, variant review, metadata entry, scene type selection, and submission.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-21, PRD-22, PRD-23, PRD-46, PRD-57, PRD-60, PRD-61, PRD-66
- **Depended on by:** None
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Consolidate character onboarding into one guided flow with batch operations at each step.
- Ensure nothing is skipped (metadata before generation, variants before scenes).
- Support resume and partial progress (wizard saves state after each step).
- Reduce per-character setup overhead from minutes to seconds.

## 4. User Stories
- As a Creator, I want to upload all source images at once and have characters created automatically.
- As a Creator, I want batch variant generation for all uploaded characters in one action.
- As a Creator, I want a variant review gallery where I can bulk-approve good variants.
- As a Creator, I want to close the wizard and resume later where I left off.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Batch Image Upload (Step 1)
**Description:** Upload all source images at once.
**Acceptance Criteria:**
- [ ] Drop all source images; one character created per image
- [ ] Filename used as initial character name
- [ ] Preview character list before confirming
- [ ] Duplicate detection (PRD-79) runs across batch

#### Requirement 1.2: Batch Variant Generation (Step 2)
**Description:** Trigger variant generation for all characters at once.
**Acceptance Criteria:**
- [ ] One-click variant generation for all uploaded characters
- [ ] Parallel generation across available workers (PRD-46)
- [ ] Progress tracking per character

#### Requirement 1.3: Variant Review Gallery (Step 3)
**Description:** Review and approve variants in a grid.
**Acceptance Criteria:**
- [ ] Grid of all variants alongside source images
- [ ] Per-character: approve, reject, or mark for external editing
- [ ] Bulk-approve all that look good

#### Requirement 1.4: Bulk Metadata Entry (Step 4)
**Description:** Spreadsheet-style metadata editing.
**Acceptance Criteria:**
- [ ] Opens PRD-66 spreadsheet view pre-populated with new characters
- [ ] Fill common fields across all, then per-character specifics

#### Requirement 1.5: Scene Type Selection (Step 5)
**Description:** Choose scene types for the batch.
**Acceptance Criteria:**
- [ ] Select from PRD-23 scene type registry
- [ ] Select variant applicability (clothed, topless, both, clothes_off)
- [ ] Scene matrix preview via PRD-57

#### Requirement 1.6: Review & Submit (Step 6)
**Description:** Summary and submission.
**Acceptance Criteria:**
- [ ] Summary: N characters, M scene types, estimated GPU time (PRD-61), disk space
- [ ] Submit to begin generation or save as draft
- [ ] Resume & partial progress: saves state after each step

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Template-Based Onboarding
**Description:** Apply a saved onboarding template for consistent setup.
**Acceptance Criteria:**
- [ ] Pre-select scene types and metadata defaults from a template

## 6. Non-Goals (Out of Scope)
- Individual character editing workflows (covered by PRD-21, PRD-66)
- Scene generation logic (covered by PRD-24)

## 7. Design Considerations
- Wizard should have clear step indicators (1 of 6, with completed steps checked).
- Each step should allow going back without losing progress.

## 8. Technical Considerations
- **Stack:** React for wizard UI, Rust for batch orchestration
- **Existing Code to Reuse:** PRD-21, PRD-22, PRD-46, PRD-57, PRD-61, PRD-66
- **New Infrastructure Needed:** Wizard state manager, batch coordinator
- **Database Changes:** `onboarding_sessions` table for wizard state persistence
- **API Changes:** CRUD /onboarding-sessions, POST /onboarding-sessions/:id/advance

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Onboarding 10 characters through the wizard takes <15 minutes (excluding GPU generation time)
- Wizard state persists correctly across browser sessions
- Zero characters skipped or misconfigured through the wizard flow

## 11. Open Questions
- Should the wizard support different configurations per character within the same batch?
- What is the maximum batch size the wizard should support?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

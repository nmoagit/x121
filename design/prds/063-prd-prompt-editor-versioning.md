# PRD-063: Prompt Editor & Versioning

## 1. Introduction/Overview
Prompts are the most-iterated parameter in the pipeline, yet they're typically managed as raw text with no history. When a prompt change breaks something, there's no way to answer "what was the prompt two versions ago?" This PRD provides a dedicated editor with syntax highlighting for placeholders, version history with diff, a prompt library, live preview with metadata substitution, and A/B annotations linking test shots to specific prompt versions.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-23 (Scene Type Configuration), PRD-58 (Scene Preview)
- **Depended on by:** PRD-65 (Regression Testing)
- **Part:** Part 3 — Generation & Pipeline Core

## 3. Goals
- Provide a rich editor for prompt templates with placeholder syntax support.
- Track every prompt version with diff and restore capabilities.
- Build a prompt library for sharing proven prompts across the team.
- Link prompt versions to test shot results for data-driven prompt development.

## 4. User Stories
- As a Creator, I want syntax highlighting for placeholders so that I can see which parts are dynamic.
- As a Creator, I want version history so that I can compare and restore previous prompts.
- As a Creator, I want a live preview showing the resolved prompt for a specific character.
- As a Creator, I want to save proven prompts to a shared library so that the team can benefit.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Template Editor
**Description:** Rich text editor with placeholder support.
**Acceptance Criteria:**
- [ ] Syntax highlighting for `{placeholder}` tokens
- [ ] Auto-complete for available metadata field names
- [ ] Positive/negative prompt sections
- [ ] Character count and token estimate display

#### Requirement 1.2: Version History
**Description:** Every save creates a version with diff and restore.
**Acceptance Criteria:**
- [ ] Automatic versioning on every save
- [ ] Side-by-side diff between any two versions
- [ ] One-click restore to any previous version
- [ ] Version notes: explain what changed and why

#### Requirement 1.3: Prompt Library
**Description:** Shared library of proven prompts.
**Acceptance Criteria:**
- [ ] Save prompts as named library entries
- [ ] Taggable by model, LoRA, and scene type
- [ ] Searchable and browsable by the team
- [ ] Usage count and quality ratings per entry

#### Requirement 1.4: Live Preview
**Description:** Show resolved prompt for a selected character.
**Acceptance Criteria:**
- [ ] Select a character to see placeholder substitution results
- [ ] Preview updates in real time as the template is edited
- [ ] Unresolvable placeholders highlighted as warnings

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: A/B Annotations
**Description:** Link test shots to prompt versions.
**Acceptance Criteria:**
- [ ] Test shots (PRD-58) linked to the specific prompt version used
- [ ] Builds a record: "Prompt v3 + LoRA X = good result"

## 6. Non-Goals (Out of Scope)
- Scene type configuration (covered by PRD-23)
- Test shot generation (covered by PRD-58)

## 7. Design Considerations
- Editor should feel like a code editor (VS Code-like) with prompt-specific features.
- Version history should use a timeline UI with clickable versions.

## 8. Technical Considerations
- **Stack:** React with CodeMirror or Monaco for editor, Rust for versioning
- **Existing Code to Reuse:** PRD-23 prompt template storage
- **New Infrastructure Needed:** Version storage, diff engine, library service
- **Database Changes:** `prompt_versions` table, `prompt_library` table
- **API Changes:** CRUD /prompts, GET /prompts/:id/versions, POST /prompts/library

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Editor loads in <500ms
- Version diff renders in <200ms
- Live preview updates within 300ms of edit
- Prompt library search returns results in <100ms

## 11. Open Questions
- Should the editor support prompt weighting syntax (e.g., `(word:1.3)`)?
- Should prompt versions be linked to generation receipts (PRD-69)?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

# PRD-095: Production Notes & Internal Comments

## 1. Introduction/Overview
PRD-38 handles QA-specific notes tied to the approval workflow. But studios need a separate layer for operational communications: "this character's source image is being re-shot next week — hold off on generation," "client requested all dance scenes use the new LoRA," or "this workflow crashes on Worker 3." This PRD provides freeform sticky notes attachable to any platform entity with rich text, categories, threading, and visibility scoping — persistent internal communication that lives alongside the entities they describe.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-10 (Event Bus for @mention notifications), PRD-20 (Search Engine for note indexing), PRD-38 (Collaborative Review for distinction of purpose)
- **Depended on by:** None
- **Part:** Part 5 — Workflow Editor & Review

## 3. Goals
- Enable notes attachable to any entity (project, character, scene, segment, scene type, workflow).
- Support rich text with @mentions, inline images, and entity deep-links.
- Provide categorization (Instruction, Blocker, FYI, Custom) and thread replies.
- Control visibility: Private, Team, or Role-specific.

## 4. User Stories
- As a Creator, I want to pin a note to a character saying "hold off on generation until new source images arrive" so that the team knows to skip this character.
- As an Admin, I want to attach a blocker note to a workflow saying "crashes on Worker 3" so that Creators avoid using that worker.
- As a Creator, I want @mentions in notes so that relevant team members are notified immediately.
- As a Creator, I want to search across all notes so that I can find past instructions about a specific topic.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Entity Attachment
**Description:** Notes attachable to any platform entity.
**Acceptance Criteria:**
- [ ] Attach notes to: projects, characters, scenes, segments, scene types, workflows
- [ ] Notes appear in a collapsible panel on the entity's detail view
- [ ] Notes count indicator on entity cards/thumbnails

#### Requirement 1.2: Rich Text
**Description:** Markdown-formatted notes with embedded content.
**Acceptance Criteria:**
- [ ] Markdown formatting support
- [ ] @mentions triggering PRD-10 notifications
- [ ] Inline images and links to other platform entities (deep-links to character, scene, segment)

#### Requirement 1.3: Pinned Notes
**Description:** Critical notes pinned for visibility.
**Acceptance Criteria:**
- [ ] Pin notes to the top of the entity's note list
- [ ] Pinned notes display as a banner when navigating to the entity
- [ ] Example: "Note: This character needs manual face correction before scene generation"

#### Requirement 1.4: Note Categories
**Description:** Categorized notes for filtering.
**Acceptance Criteria:**
- [ ] Categories: Instruction (how-to), Blocker (preventing progress), FYI (informational), Custom
- [ ] Filter notes by category
- [ ] Category indicated by color-coded badge

#### Requirement 1.5: Thread Replies
**Description:** Discussion threads within notes.
**Acceptance Criteria:**
- [ ] Reply to notes to create discussion threads
- [ ] Grouped conversation keeps related discussion together
- [ ] Resolve/close threads when the issue is addressed

#### Requirement 1.6: Note Search
**Description:** Notes indexed for search.
**Acceptance Criteria:**
- [ ] Notes indexed by PRD-20 Search Engine
- [ ] "Find all notes mentioning 'face correction'" returns results across all entities
- [ ] Search results link directly to the entity with the note

#### Requirement 1.7: Visibility Scope
**Description:** Access control for notes.
**Acceptance Criteria:**
- [ ] Private: only the author sees it
- [ ] Team: all platform users
- [ ] Role-specific: only Admins, only Creators, etc.
- [ ] Default: Team

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Note Templates
**Description:** Pre-defined note templates for common communications.
**Acceptance Criteria:**
- [ ] Admin creates note templates (e.g., "Character Hold Notice," "Workflow Warning")
- [ ] Users select a template and fill in specifics

## 6. Non-Goals (Out of Scope)
- QA review notes tied to the approval workflow (covered by PRD-38)
- Frame-level annotations (covered by PRD-70)
- Audit logging (covered by PRD-45)

## 7. Design Considerations
- Pinned note banners should be attention-grabbing but dismissible.
- Notes panel should be collapsible to avoid taking space from the main content.
- Blocker notes should use a distinct visual treatment (e.g., red border, warning icon).

## 8. Technical Considerations
- **Stack:** React Markdown editor, PRD-10 WebSocket for @mention notifications, PRD-20 search indexer
- **Existing Code to Reuse:** PRD-10 event bus for notifications, PRD-20 search engine for indexing
- **New Infrastructure Needed:** Notes storage, category manager, thread engine, visibility filter
- **Database Changes:** `production_notes` table (id, entity_type, entity_id, user_id, content_md, category, visibility, pinned, parent_note_id, created_at, resolved_at)
- **API Changes:** CRUD /notes, GET /notes?entity_type=character&entity_id=123, GET /notes/search?q=face+correction, PUT /notes/:id/pin, PUT /notes/:id/resolve

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Notes are searchable within 5 seconds of creation (PRD-20 indexing)
- @mention notifications delivered within 3 seconds
- Pinned note banners correctly display on entity navigation 100% of the time

## 11. Open Questions
- Should notes be archivable (hidden but not deleted) when no longer relevant?
- How should notes transfer when an entity is moved between projects?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

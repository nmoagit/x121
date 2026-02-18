# PRD-056: Studio Wiki & Contextual Help

## 1. Introduction/Overview
A 106-PRD platform needs embedded documentation, not an external wiki users will never visit. Contextual help — right where the user encounters the concept — is the difference between "I'll figure it out later" and "I understand this now." This PRD provides an integrated documentation system with context-aware help links throughout the platform, built-in platform docs, a studio knowledge base for tribal knowledge, and searchable, versioned wiki articles.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-20 (Search Engine for article indexing), PRD-42 (Studio Pulse for pinned articles)
- **Depended on by:** None
- **Part:** Part 7 — Maintenance & Admin

## 3. Goals
- Provide contextual help links throughout the platform (right-click, hover tooltips).
- Ship built-in platform documentation that updates with each release.
- Enable studio-specific knowledge articles with markdown editing.
- Index all wiki content in the platform search engine.

## 4. User Stories
- As a Creator, I want to right-click any parameter to see its documentation so that I understand what it does without leaving the workflow.
- As a Creator, I want studio-specific knowledge articles so that tribal knowledge is captured and accessible to the whole team.
- As an Admin, I want to pin important articles to the Dashboard so that everyone sees critical information.
- As a Creator, I want wiki articles searchable from the Command Palette so that I can find documentation alongside entities.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Contextual Help Links
**Description:** In-context documentation access.
**Acceptance Criteria:**
- [ ] Right-click any node type, parameter, or panel header to see "View Docs"
- [ ] Links to the relevant wiki article
- [ ] Hover tooltips show parameter descriptions pulled from the wiki
- [ ] Available throughout all platform views

#### Requirement 1.2: Built-in Platform Docs
**Description:** Pre-loaded documentation for all features.
**Acceptance Criteria:**
- [ ] Documentation for every panel, parameter, and workflow concept
- [ ] Ships with the platform and updates with each release
- [ ] Organized by feature area with table of contents

#### Requirement 1.3: Studio Knowledge Base
**Description:** User-created articles for studio-specific knowledge.
**Acceptance Criteria:**
- [ ] Markdown editor with image/video embedding
- [ ] Examples: "Our LoRA naming conventions," "How to set up a new character," "Color correction checklist"
- [ ] Categorized by topic with tagging support
- [ ] Any user can create articles; Admins can restrict editing

#### Requirement 1.4: Searchable
**Description:** Wiki content indexed in the search engine.
**Acceptance Criteria:**
- [ ] Articles indexed by PRD-20 Search Engine
- [ ] Searching "LoRA" in the Command Palette (PRD-31) returns both entities and relevant wiki articles
- [ ] Search results distinguish wiki articles from platform entities

#### Requirement 1.5: Version History
**Description:** Article versioning with diff view.
**Acceptance Criteria:**
- [ ] Wiki articles are versioned on every edit
- [ ] Diff view between any two versions
- [ ] Any user can edit; Admins can revert to previous versions

#### Requirement 1.6: Pinned Articles
**Description:** Prominent display of important articles.
**Acceptance Criteria:**
- [ ] Admins can pin articles to the Dashboard (PRD-42)
- [ ] Admins can pin articles to specific panel headers
- [ ] Example: pin "Studio Style Guide" to the Dashboard for all users

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Article Feedback
**Description:** User ratings and improvement requests.
**Acceptance Criteria:**
- [ ] "Was this helpful?" feedback on each article
- [ ] "Request improvement" button that creates a task for documentation updates

## 6. Non-Goals (Out of Scope)
- First-run onboarding experience (covered by PRD-53)
- Progressive disclosure of features (covered by PRD-32)
- Production notes attached to entities (covered by PRD-95)

## 7. Design Considerations
- Contextual help should be unobtrusive — a subtle icon, not a banner.
- The wiki editor should support live preview (side-by-side markdown + rendered).
- Article navigation should support breadcrumbs and sidebar table of contents.

## 8. Technical Considerations
- **Stack:** React Markdown renderer, PRD-20 search API for indexing, versioned content storage
- **Existing Code to Reuse:** PRD-20 search engine for indexing, PRD-42 widget framework for pinned articles
- **New Infrastructure Needed:** Wiki content store, markdown editor, version control for articles, contextual help resolver
- **Database Changes:** `wiki_articles` table (id, title, content_md, category, tags, created_by, updated_at), `wiki_versions` table (article_id, version, content_md, edited_by, edited_at)
- **API Changes:** CRUD /wiki/articles, GET /wiki/articles/search?q=query, GET /wiki/articles/:id/versions, POST /wiki/articles/:id/revert/:version

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Contextual help links are present on >90% of configurable parameters
- Wiki articles appear in search results within 5 seconds of creation
- Article version history correctly tracks all edits with accurate diffs

## 11. Open Questions
- Should the wiki support embedding interactive components (e.g., a parameter configurator within a how-to article)?
- How should built-in docs handle features from optional/unused PRDs?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

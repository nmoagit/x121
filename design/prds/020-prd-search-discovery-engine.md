# PRD-020: Search & Discovery Engine

## 1. Introduction/Overview
A studio with hundreds of characters and thousands of segments becomes unusable without robust search. This PRD provides unified search infrastructure supporting full-text search, metadata faceted filtering, visual similarity queries (via pgvector), and saved searches. It powers the Library Viewer, Command Palette integration, and all list view filtering across the platform.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-00 (pgvector for visual search), PRD-01 (Data Model), PRD-47 (Tagging for facets)
- **Depended on by:** PRD-31, PRD-56, PRD-60
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Provide full-text search across character names, metadata, project descriptions, review notes, and tags.
- Enable faceted filtering by project, character, status, date, approval state, creator, and tags.
- Support visual similarity search using pgvector for face/image matching.
- Integrate search-as-you-type into the Command Palette (PRD-31).

## 4. User Stories
- As a Creator, I want to search for characters by name and metadata so that I can find specific characters quickly in a large library.
- As a Reviewer, I want to filter segments by approval status and date range so that I can see all unapproved segments from the last week.
- As a Creator, I want to find characters visually similar to a reference image so that I can identify potential duplicates or related characters.
- As a Creator, I want to save my frequently used search filters as bookmarks so that I can access them with one click.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Full-Text Search
**Description:** Search across all text fields in the platform.
**Acceptance Criteria:**
- [ ] Searches character names, metadata fields, project descriptions, review notes, and tags
- [ ] Results ranked by relevance
- [ ] Search highlights matching terms in results
- [ ] Search completes in <200ms for typical queries

#### Requirement 1.2: Faceted Filtering
**Description:** Filter results by structured metadata.
**Acceptance Criteria:**
- [ ] Filter by: project, character, status, date range, approval state, creator, tags
- [ ] Facets show available values with counts
- [ ] Multiple facets combinable (AND logic)
- [ ] Facet state preserved in URL for sharing/bookmarking

#### Requirement 1.3: Visual Similarity Search
**Description:** pgvector-powered search for similar images.
**Acceptance Criteria:**
- [ ] Upload or select a reference image to find similar portraits/frames
- [ ] Results sorted by similarity score
- [ ] Configurable similarity threshold
- [ ] Uses embeddings from PRD-76 for face matching

#### Requirement 1.4: Saved Searches
**Description:** Persist and share filtered views.
**Acceptance Criteria:**
- [ ] Save current filter configuration as a named bookmark
- [ ] Saved searches accessible from the sidebar or Command Palette
- [ ] Saved searches can be shared with other users
- [ ] Auto-updating results (saved search shows current matching entities)

#### Requirement 1.5: Search-as-you-type
**Description:** Integrated into Command Palette for instant results.
**Acceptance Criteria:**
- [ ] Results appear as user types with <100ms latency per keystroke
- [ ] Results grouped by entity type (projects, characters, scenes, segments)
- [ ] Keyboard-navigable result list
- [ ] Enter to navigate to selected result

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Search Analytics
**Description:** Track popular searches and zero-result queries.
**Acceptance Criteria:**
- [ ] Dashboard showing most common search terms
- [ ] Zero-result queries identified for content gap analysis

## 6. Non-Goals (Out of Scope)
- Tag management (covered by PRD-47)
- Command Palette UI (covered by PRD-31)
- Wiki/help content search integration (covered by PRD-56)

## 7. Design Considerations
- Search should be accessible from every page via a persistent search bar or Cmd+K shortcut.
- Facet panel should be collapsible to maximize content area.
- Visual similarity results should show the reference image alongside each result with similarity score.

## 8. Technical Considerations
- **Stack:** PostgreSQL full-text search (tsvector/tsquery), pgvector for similarity, Rust search service
- **Existing Code to Reuse:** PRD-00 pgvector infrastructure, PRD-47 tag data
- **New Infrastructure Needed:** Search index management, facet aggregation, saved search storage
- **Database Changes:** Full-text search indexes on text columns, `saved_searches` table
- **API Changes:** GET /search (unified search endpoint), POST /search/saved, GET /search/similar

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Full-text search returns results in <200ms for queries across 10,000+ entities
- Visual similarity search returns top 10 results in <500ms
- Search-as-you-type latency <100ms per keystroke
- Faceted filtering correctly counts available values

## 11. Open Questions
- Should we use PostgreSQL full-text search or an external engine (Meilisearch, Typesense)?
- What embedding model should be used for visual similarity?
- How should search rankings weight different entity types?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

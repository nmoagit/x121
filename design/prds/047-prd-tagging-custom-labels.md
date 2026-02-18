# PRD-047: Tagging & Custom Labels

## 1. Introduction/Overview
The hierarchical data model (PRD-01) provides structural organization, but creative workflows need cross-cutting labels. "All segments needing color correction across all characters" or "all reference material for the art director" don't fit into the hierarchy. This PRD provides a user-defined tagging system with freeform tags, optional namespaces, bulk operations, and color coding that works across all entity types.

## 2. Related PRDs & Dependencies
- **Depends on:** PRD-01 (Data Model for entity types)
- **Depended on by:** PRD-20 (Search facets), PRD-51 (Undo for tag operations)
- **Part:** Part 2 — Data & Storage Management

## 3. Goals
- Enable freeform tagging across all entity types (projects, characters, scenes, segments, workflows).
- Support optional tag namespaces for structured categorization.
- Provide bulk tagging and tag-based filtering in all list views.
- Prevent tag duplication through autocomplete suggestions.

## 4. User Stories
- As a Creator, I want to tag segments with `needs-color-correction` so that I can filter all segments needing post-processing across all characters.
- As a Reviewer, I want to tag scenes with `priority:urgent` so that the review queue can be filtered by priority.
- As a Creator, I want tag autocomplete so that I don't accidentally create `nightscene` when `night-scene` already exists.
- As an Admin, I want color-coded tags so that visual distinction helps identify tagged items quickly in list views.

## 5. Functional Requirements

### Phase 1: MVP Implementation

#### Requirement 1.1: Freeform Tags
**Description:** Any user can create and apply tags to any entity.
**Acceptance Criteria:**
- [ ] Tags are strings with validation (alphanumeric, hyphens, underscores)
- [ ] Tags can be applied to projects, characters, scenes, segments, and workflows
- [ ] Multiple tags per entity supported
- [ ] Tags are created on first use (no pre-registration required)

#### Requirement 1.2: Tag Namespaces
**Description:** Optional structured tagging with prefixes.
**Acceptance Criteria:**
- [ ] Namespace syntax: `namespace:value` (e.g., `status:blocked`, `style:cinematic`)
- [ ] Namespaces are user-defined and not enforced
- [ ] Filtering supports namespace-based queries
- [ ] Namespace is optional — plain tags work without prefix

#### Requirement 1.3: Bulk Tagging
**Description:** Apply/remove tags to multiple entities at once.
**Acceptance Criteria:**
- [ ] Select multiple entities in any list view
- [ ] Apply one or more tags to all selected entities
- [ ] Remove tags from all selected entities
- [ ] Bulk operations integrated with PRD-51 undo system

#### Requirement 1.4: Tag-Based Views
**Description:** Filter any list by tag combination.
**Acceptance Criteria:**
- [ ] Tags appear as filter facets in PRD-20 search and all list views
- [ ] Filter by tag combination with AND/OR logic
- [ ] Tag filter chips show active filters with one-click removal
- [ ] Tag filters combinable with other facets (status, date, etc.)

#### Requirement 1.5: Tag Suggestions
**Description:** Autocomplete to prevent duplicates.
**Acceptance Criteria:**
- [ ] Typing a tag shows existing tags that match the prefix
- [ ] Suggestions sorted by usage frequency
- [ ] Visual indicator when a tag is new (not yet used)
- [ ] Case-insensitive matching

#### Requirement 1.6: Color-Coded Tags
**Description:** Optional color assignment per tag.
**Acceptance Criteria:**
- [ ] Each tag can have an assigned color (from a palette)
- [ ] Color appears as a dot or badge background in list views
- [ ] Color assignment is optional (default: neutral)
- [ ] Colors visible in search results, timelines, and filters

### Phase 2: Enhancements (Post-MVP)

#### **[OPTIONAL - Post-MVP]** Requirement 2.1: Tag Analytics
**Description:** Usage statistics and cleanup tools for tags.
**Acceptance Criteria:**
- [ ] Dashboard showing tag usage counts, recently created tags, unused tags
- [ ] Merge duplicate tags (e.g., merge `nightscene` into `night-scene`)

## 6. Non-Goals (Out of Scope)
- Tag-based automation (if tag X then do Y)
- Mandatory tags or tag policies (tags are always optional)
- Search infrastructure (covered by PRD-20)

## 7. Design Considerations
- Tag input should use a chips/token interface (type, press enter, tag appears as a chip).
- Tags in list views should be compact badges that don't consume excessive space.
- Color palette should be limited (8-12 colors) to avoid visual noise.

## 8. Technical Considerations
- **Stack:** React for tag UI components, PostgreSQL for tag storage
- **Existing Code to Reuse:** PRD-29 design system for badge/chip components
- **New Infrastructure Needed:** Tags table, entity_tags junction table, tag suggestion service
- **Database Changes:** `tags` table (id, name, namespace, color), `entity_tags` table (entity_type, entity_id, tag_id)
- **API Changes:** GET/POST /tags, POST /entities/:type/:id/tags, DELETE /entities/:type/:id/tags/:tag_id

## 9. Quality Assurance

### DRY-GUY Agent Enforcement
**MANDATORY:** After any significant code implementation for this PRD, the `dry-guy` agent MUST be invoked to audit for:
- Code duplication across the codebase
- Redundant implementations of similar functionality
- Missed opportunities for sharing components, functions, utilities, or hooks
- Patterns that should be extracted into shared modules

This check is **blocking** — no PR should be merged without a DRY-GUY audit of the changed files.

## 10. Success Metrics
- Tag autocomplete returns suggestions in <50ms
- Bulk tagging of 100 entities completes in <2 seconds
- Tag-based filtering adds <100ms to search queries
- Zero duplicate tag creation when autocomplete is used

## 11. Open Questions
- Should tags be scoped to a project or global across the studio?
- Should there be a tag admin role, or can any user create/modify tags?
- What is the maximum number of tags per entity?

## 12. Version History
- **v1.0** (2026-02-18): Initial PRD generation from master specification

# Task List: Studio Wiki & Contextual Help

**PRD Reference:** `design/prds/056-prd-studio-wiki-contextual-help.md`
**Scope:** Build an integrated documentation system with contextual help links throughout the platform, built-in platform docs, a studio knowledge base for user-created articles, and searchable, versioned wiki content.

## Overview

A 106-PRD platform needs embedded documentation. This feature provides context-aware help links (right-click any parameter to see its docs), built-in platform documentation that ships with each release, a studio knowledge base for tribal knowledge, and integration with the PRD-20 Search Engine so wiki articles appear alongside entities in search results. Articles are versioned with diff views, and Admins can pin important articles to the Dashboard.

### What Already Exists
- PRD-20 Search Engine for article indexing
- PRD-42 Studio Pulse Dashboard for pinned article display

### What We're Building
1. Database tables for wiki articles and versions
2. Rust CRUD and version management for articles
3. Search engine integration for article indexing
4. Contextual help resolver mapping UI elements to articles
5. Markdown editor with live preview
6. API endpoints for article CRUD, search, versioning, and pinning
7. React wiki viewer, editor, and contextual help components

### Key Design Decisions
1. **Markdown for content** -- All articles are stored as Markdown. Rendering happens client-side for speed and flexibility.
2. **Versioned on every save** -- Every edit creates a new version. No auto-save drafts in MVP.
3. **Built-in docs are regular articles** -- Platform documentation is stored as wiki articles with an `is_builtin` flag. They update with each release via migration.
4. **Contextual help via mapping** -- A JSON mapping file connects UI element identifiers to wiki article IDs.

---

## Phase 1: Database Schema

### Task 1.1: Wiki Articles Table
**File:** `migrations/YYYYMMDDHHMMSS_create_wiki_articles.sql`

```sql
CREATE TABLE wiki_articles (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content_md TEXT NOT NULL,
    category TEXT,
    tags TEXT[],                       -- PostgreSQL text array
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    pin_location TEXT,                 -- 'dashboard', 'panel:workflow_editor', etc.
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_wiki_articles_slug ON wiki_articles(slug);
CREATE INDEX idx_wiki_articles_category ON wiki_articles(category);
CREATE INDEX idx_wiki_articles_tags ON wiki_articles USING gin(tags);
CREATE INDEX idx_wiki_articles_created_by ON wiki_articles(created_by);
CREATE INDEX idx_wiki_articles_is_pinned ON wiki_articles(is_pinned) WHERE is_pinned = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON wiki_articles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Slug is unique for URL-friendly article addressing
- [ ] Tags stored as PostgreSQL array with GIN index for fast lookup
- [ ] `is_builtin` distinguishes platform docs from user articles
- [ ] `is_pinned` and `pin_location` for Dashboard/panel pinning

### Task 1.2: Wiki Versions Table
**File:** `migrations/YYYYMMDDHHMMSS_create_wiki_versions.sql`

```sql
CREATE TABLE wiki_versions (
    id BIGSERIAL PRIMARY KEY,
    article_id BIGINT NOT NULL REFERENCES wiki_articles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    version INTEGER NOT NULL,
    content_md TEXT NOT NULL,
    edited_by BIGINT REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    edit_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wiki_versions_article_id ON wiki_versions(article_id);
CREATE UNIQUE INDEX uq_wiki_versions_article_version ON wiki_versions(article_id, version);
CREATE INDEX idx_wiki_versions_edited_by ON wiki_versions(edited_by);
```

**Acceptance Criteria:**
- [ ] Every edit creates a new version row
- [ ] Unique constraint on (article_id, version) pair
- [ ] `edit_summary` for optional change description
- [ ] No `updated_at` -- versions are immutable once created

---

## Phase 2: Rust Backend

### Task 2.1: Wiki Article Model & CRUD
**File:** `src/models/wiki_article.rs`

```rust
#[derive(Debug, FromRow)]
pub struct WikiArticle {
    pub id: DbId,
    pub title: String,
    pub slug: String,
    pub content_md: String,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub is_builtin: bool,
    pub is_pinned: bool,
    pub pin_location: Option<String>,
    pub created_by: Option<DbId>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
```

**Acceptance Criteria:**
- [ ] CRUD: create (with first version), update (creates new version), delete, list
- [ ] Get by slug for URL-based access
- [ ] Filter by category, tags, built-in status
- [ ] Auto-generate slug from title on create

### Task 2.2: Wiki Version Service
**File:** `src/services/wiki_version.rs`

**Acceptance Criteria:**
- [ ] List versions for an article
- [ ] Get specific version content
- [ ] Revert to a previous version (creates a new version with old content)
- [ ] Diff computation between two versions (line-level diff)

### Task 2.3: Search Engine Integration
**File:** `src/services/wiki_search_indexer.rs`

Index wiki articles in the PRD-20 search engine.

**Acceptance Criteria:**
- [ ] Articles indexed on create and update
- [ ] Articles removed from index on delete
- [ ] Search results distinguish wiki articles from platform entities
- [ ] Index update completes within 5 seconds of article save

### Task 2.4: Contextual Help Resolver
**File:** `src/services/contextual_help.rs`

Maps UI element identifiers to wiki articles.

```rust
pub struct ContextualHelpMapping {
    pub element_id: String,            // "workflow_editor.seed_parameter"
    pub article_slug: String,          // "parameters/seed"
    pub tooltip_text: Option<String>,  // short description for hover
}
```

**Acceptance Criteria:**
- [ ] Mapping stored as configuration (JSON file or database table)
- [ ] API endpoint returns article slug for a given element ID
- [ ] Supports hierarchical fallback: specific element -> panel -> feature area
- [ ] Mappings updateable by Admins

---

## Phase 3: API Endpoints

### Task 3.1: Wiki Article CRUD Routes
**File:** `src/routes/wiki.rs`

```
GET    /wiki/articles                  -- List articles (filterable)
POST   /wiki/articles                  -- Create article
GET    /wiki/articles/:slug            -- Get article by slug
PUT    /wiki/articles/:slug            -- Update article (creates version)
DELETE /wiki/articles/:slug            -- Delete article
```

**Acceptance Criteria:**
- [ ] List supports filtering by category, tags, built-in, pinned
- [ ] Create auto-generates slug and creates first version
- [ ] Update creates a new version record
- [ ] Delete protected for built-in articles

### Task 3.2: Wiki Version Routes
**File:** `src/routes/wiki.rs`

```
GET  /wiki/articles/:slug/versions         -- List versions
GET  /wiki/articles/:slug/versions/:version -- Get specific version
POST /wiki/articles/:slug/revert/:version  -- Revert to version
GET  /wiki/articles/:slug/diff?v1=X&v2=Y  -- Diff between versions
```

**Acceptance Criteria:**
- [ ] Version list includes editor, timestamp, and summary
- [ ] Revert creates a new version with old content (Admin only)
- [ ] Diff returns line-level additions/deletions

### Task 3.3: Wiki Search Route
**File:** `src/routes/wiki.rs`

```
GET /wiki/articles/search?q=query
```

**Acceptance Criteria:**
- [ ] Searches title, content, and tags
- [ ] Returns relevant articles ranked by relevance
- [ ] Integrates with PRD-20 for unified search results

### Task 3.4: Contextual Help Route
**File:** `src/routes/wiki.rs`

```
GET /wiki/help/:element_id
```

**Acceptance Criteria:**
- [ ] Returns article slug and tooltip for a given UI element
- [ ] Returns 404 if no mapping exists (graceful degradation)

---

## Phase 4: React Frontend

### Task 4.1: Wiki Article Viewer
**File:** `frontend/src/pages/WikiArticle.tsx`

**Acceptance Criteria:**
- [ ] Renders Markdown content with syntax highlighting for code blocks
- [ ] Sidebar table of contents from headings
- [ ] Breadcrumb navigation by category
- [ ] Version info: "Last edited by X on Y"
- [ ] Edit button (for authorized users)

### Task 4.2: Wiki Article Editor
**File:** `frontend/src/components/wiki/WikiEditor.tsx`

**Acceptance Criteria:**
- [ ] Side-by-side Markdown editor + live preview
- [ ] Image/video embedding support
- [ ] Category selector and tag editor
- [ ] Optional edit summary field
- [ ] Save creates a new version

### Task 4.3: Version History & Diff View
**File:** `frontend/src/components/wiki/VersionHistory.tsx`

**Acceptance Criteria:**
- [ ] List of versions with editor, date, and summary
- [ ] Select two versions for side-by-side diff
- [ ] Diff highlights additions (green) and deletions (red)
- [ ] Revert button (Admin only) with confirmation

### Task 4.4: Contextual Help Component
**File:** `frontend/src/components/wiki/ContextualHelp.tsx`

**Acceptance Criteria:**
- [ ] Right-click or hover on any registered element shows "View Docs" option
- [ ] Hover tooltip shows short parameter description
- [ ] Click opens the wiki article in a side panel or new tab
- [ ] Graceful degradation: no help available = no UI element

### Task 4.5: Wiki Search Integration
**File:** `frontend/src/components/wiki/WikiSearchResult.tsx`

**Acceptance Criteria:**
- [ ] Wiki articles appear in Command Palette (PRD-31) search results
- [ ] Visually distinguished from entity results (article icon)
- [ ] Click navigates to the wiki article

### Task 4.6: Pinned Articles Widget
**File:** `frontend/src/components/dashboard/PinnedArticlesWidget.tsx`

Widget for PRD-42 Dashboard showing pinned wiki articles.

**Acceptance Criteria:**
- [ ] Lists all articles pinned to the dashboard
- [ ] Click opens the article
- [ ] Admin can pin/unpin from the article page

---

## Phase 5: Testing

### Task 5.1: Wiki CRUD & Versioning Tests
**File:** `tests/wiki_test.rs`

**Acceptance Criteria:**
- [ ] Test article create, update, delete cycle
- [ ] Test version creation on every update
- [ ] Test revert creates new version with old content
- [ ] Test slug uniqueness enforcement
- [ ] Test diff computation accuracy

### Task 5.2: Search Integration Tests
**File:** `tests/wiki_search_test.rs`

**Acceptance Criteria:**
- [ ] Test articles appear in search within 5 seconds of creation
- [ ] Test deleted articles are removed from search
- [ ] Test search ranking relevance

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/YYYYMMDDHHMMSS_create_wiki_articles.sql` | Article storage table |
| `migrations/YYYYMMDDHHMMSS_create_wiki_versions.sql` | Version tracking table |
| `src/models/wiki_article.rs` | Article model and CRUD |
| `src/services/wiki_version.rs` | Version management and diffing |
| `src/services/wiki_search_indexer.rs` | Search engine integration |
| `src/services/contextual_help.rs` | UI element to article mapping |
| `src/routes/wiki.rs` | Wiki API endpoints |
| `frontend/src/pages/WikiArticle.tsx` | Article viewer page |
| `frontend/src/components/wiki/WikiEditor.tsx` | Markdown editor |
| `frontend/src/components/wiki/VersionHistory.tsx` | Version diff view |
| `frontend/src/components/wiki/ContextualHelp.tsx` | Right-click help component |
| `frontend/src/components/dashboard/PinnedArticlesWidget.tsx` | Dashboard widget |

## Dependencies

### Upstream PRDs
- PRD-20: Search Engine for article indexing
- PRD-42: Studio Pulse Dashboard for pinned articles

### Downstream PRDs
- None (terminal PRD)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.2)
2. Phase 2: Rust Backend (Tasks 2.1-2.4)
3. Phase 3: API Endpoints (Tasks 3.1-3.4)
4. Phase 4: React Frontend (Tasks 4.1-4.6)

**MVP Success Criteria:**
- Contextual help links present on >90% of configurable parameters
- Articles appear in search within 5 seconds of creation
- Version history correctly tracks all edits with accurate diffs

### Post-MVP Enhancements
1. Phase 5: Testing (Tasks 5.1-5.2)
2. Article feedback and improvement requests (PRD Requirement 2.1)

## Notes

1. **Markdown renderer** -- Use `react-markdown` with `remark-gfm` for GitHub Flavored Markdown support (tables, task lists, strikethrough).
2. **Built-in docs updates** -- Built-in articles update via migration scripts that upsert by slug. This preserves user edits to non-builtin articles.
3. **Contextual help coverage** -- Start with the most complex UI areas (workflow editor parameters, QA configuration) and expand coverage incrementally.
4. **Image storage** -- Wiki images should be stored in a dedicated directory and served via a static file route. Consider using the PRD-17 asset registry.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD-056

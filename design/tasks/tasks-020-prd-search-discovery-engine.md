# Task List: Search & Discovery Engine

**PRD Reference:** `design/prds/020-prd-search-discovery-engine.md`
**Scope:** Build a unified search infrastructure with PostgreSQL full-text search, faceted filtering, pgvector visual similarity queries, saved searches, and search-as-you-type integration for the platform.

## Overview

This PRD creates the search backbone for the entire platform. It uses PostgreSQL's built-in full-text search (tsvector/tsquery) for text queries, pgvector for visual similarity, and custom aggregation queries for faceted filtering. The unified search API serves multiple consumers: the main search bar, Command Palette (PRD-031), Library Viewer (PRD-060), and all list views. Saved searches are persisted for quick access and sharing.

### What Already Exists
- PRD-000: pgvector extension installed, database conventions
- PRD-001: Entity tables with text fields to index
- PRD-047: Tagging system (tags as a search facet)

### What We're Building
1. Full-text search indexes on entity text fields (tsvector/GIN)
2. Unified search service that queries across entity types
3. Faceted filtering with aggregated counts
4. Visual similarity search using pgvector
5. Saved searches table and management
6. Search-as-you-type API optimized for low latency
7. Search results UI components

### Key Design Decisions
1. **PostgreSQL full-text over external engine** — For MVP, PostgreSQL's tsvector is sufficient and avoids an external dependency. If search complexity grows, Meilisearch can be added later as a drop-in replacement behind the same API.
2. **Weighted search vectors** — Character names get weight A (highest), descriptions get B, tags get C, metadata fields get D. This ensures name matches rank above tag matches.
3. **Unified search endpoint** — One API returns results from all entity types, grouped and ranked. Entity-specific filtering is done via facets, not separate endpoints.
4. **Vector search is opt-in** — Visual similarity requires embeddings to be generated (PRD-076). The search endpoint gracefully degrades if embeddings are not available.

---

## Phase 1: Database Schema & Indexes

### Task 1.1: Full-Text Search Indexes
**File:** `migrations/{timestamp}_create_search_indexes.sql`

Add tsvector columns and GIN indexes to searchable entity tables.

```sql
-- Characters: searchable name, description, and metadata
ALTER TABLE characters ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION characters_search_vector_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER characters_search_vector_trigger
    BEFORE INSERT OR UPDATE ON characters
    FOR EACH ROW EXECUTE FUNCTION characters_search_vector_update();

CREATE INDEX idx_characters_search ON characters USING GIN(search_vector);

-- Projects: searchable name and description
ALTER TABLE projects ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION projects_search_vector_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_search_vector_trigger
    BEFORE INSERT OR UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION projects_search_vector_update();

CREATE INDEX idx_projects_search ON projects USING GIN(search_vector);

-- Scene types: searchable name and prompt template
ALTER TABLE scene_types ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION scene_types_search_vector_update() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.prompt_template, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scene_types_search_vector_trigger
    BEFORE INSERT OR UPDATE ON scene_types
    FOR EACH ROW EXECUTE FUNCTION scene_types_search_vector_update();

CREATE INDEX idx_scene_types_search ON scene_types USING GIN(search_vector);

-- Backfill existing rows
UPDATE characters SET search_vector = search_vector;
UPDATE projects SET search_vector = search_vector;
UPDATE scene_types SET search_vector = search_vector;
```

**Acceptance Criteria:**
- [ ] tsvector columns added to characters, projects, scene_types
- [ ] Triggers auto-update search vectors on INSERT and UPDATE
- [ ] Weighted vectors: name=A, description=B, tags=C, other=D
- [ ] GIN indexes created for fast full-text queries
- [ ] Existing rows backfilled
- [ ] Migration applies cleanly

### Task 1.2: Saved Searches Table
**File:** `migrations/{timestamp}_create_saved_searches.sql`

```sql
CREATE TABLE saved_searches (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    query_text TEXT,                      -- free text search term
    filters JSONB NOT NULL DEFAULT '{}',  -- structured facet filters
    entity_types TEXT[] NOT NULL DEFAULT '{}', -- which types to search
    is_shared BOOLEAN NOT NULL DEFAULT false,
    owner_id BIGINT NULL,                -- FK to users when available
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saved_searches_owner_id ON saved_searches(owner_id);
CREATE INDEX idx_saved_searches_shared ON saved_searches(is_shared) WHERE is_shared = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON saved_searches
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Saved searches store query text, structured filters, entity type scope
- [ ] `is_shared` flag for public saved searches
- [ ] `use_count` and `last_used_at` for popularity tracking
- [ ] Migration applies cleanly

### Task 1.3: Search Analytics Table (Post-MVP prep)
**File:** `migrations/{timestamp}_create_search_analytics.sql`

```sql
CREATE TABLE search_queries (
    id BIGSERIAL PRIMARY KEY,
    query_text TEXT NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}',
    result_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    user_id BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_search_queries_created_at ON search_queries(created_at);
CREATE INDEX idx_search_queries_result_count ON search_queries(result_count)
    WHERE result_count = 0;
```

**Acceptance Criteria:**
- [ ] Tracks every search query with result count and duration
- [ ] Partial index for zero-result queries (for content gap analysis)
- [ ] No updated_at needed (append-only log)
- [ ] Migration applies cleanly

---

## Phase 2: Search Engine (Core)

### Task 2.1: Search Query Types
**File:** `src/search/types.rs`

Define search request and result types.

```rust
use crate::types::DbId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct SearchRequest {
    pub query: String,
    pub entity_types: Option<Vec<String>>,  // filter to specific types
    pub filters: SearchFilters,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize, Default)]
pub struct SearchFilters {
    pub project_id: Option<DbId>,
    pub status: Option<String>,
    pub date_from: Option<chrono::NaiveDate>,
    pub date_to: Option<chrono::NaiveDate>,
    pub approval_status: Option<String>,
    pub tags: Option<Vec<String>>,
    pub creator_id: Option<DbId>,
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub total_count: i64,
    pub results: Vec<SearchResult>,
    pub facets: SearchFacets,
    pub query_duration_ms: i64,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub entity_type: String,
    pub entity_id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub rank: f64,
    pub highlights: Vec<String>,         -- matching text fragments
    pub metadata: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct SearchFacets {
    pub entity_types: Vec<FacetValue>,
    pub projects: Vec<FacetValue>,
    pub statuses: Vec<FacetValue>,
    pub tags: Vec<FacetValue>,
}

#[derive(Debug, Serialize)]
pub struct FacetValue {
    pub value: String,
    pub count: i64,
}
```

**Acceptance Criteria:**
- [ ] `SearchRequest` supports free text, entity type filter, structured facets
- [ ] `SearchResponse` includes results, facets, and timing
- [ ] `SearchResult` includes entity info, rank, and highlighted matches
- [ ] `SearchFacets` provides aggregated counts for filter UI

### Task 2.2: Full-Text Search Service
**File:** `src/search/fulltext.rs`

Execute full-text search across entity tables.

```rust
pub async fn search_fulltext(
    pool: &PgPool,
    req: &SearchRequest,
) -> Result<Vec<SearchResult>, SearchError> {
    let tsquery = build_tsquery(&req.query)?;
    let mut results = Vec::new();

    // Search characters
    if should_search_type(req, "character") {
        let chars = sqlx::query_as!(
            SearchResultRow,
            r#"
            SELECT 'character' as entity_type, id as entity_id, name,
                   description, ts_rank(search_vector, $1::tsquery) as rank,
                   ts_headline('english', COALESCE(name, '') || ' ' || COALESCE(description, ''),
                               $1::tsquery, 'MaxWords=50, MinWords=10') as headline
            FROM characters
            WHERE search_vector @@ $1::tsquery
              AND ($2::BIGINT IS NULL OR project_id = $2)
            ORDER BY rank DESC
            LIMIT $3
            "#,
            tsquery, req.filters.project_id, req.limit.unwrap_or(20)
        )
        .fetch_all(pool)
        .await?;

        results.extend(chars.into_iter().map(|r| r.into()));
    }

    // Search projects
    if should_search_type(req, "project") {
        // Similar query for projects table
    }

    // Search scene types
    if should_search_type(req, "scene_type") {
        // Similar query for scene_types table
    }

    // Sort all results by rank
    results.sort_by(|a, b| b.rank.partial_cmp(&a.rank).unwrap_or(std::cmp::Ordering::Equal));

    Ok(results)
}

fn build_tsquery(query: &str) -> Result<String, SearchError> {
    // Convert user input to tsquery format
    // "john dance" -> "john & dance" (AND by default)
    // "john | dance" -> "john | dance" (explicit OR)
    let terms: Vec<&str> = query.split_whitespace().collect();
    Ok(terms.join(" & "))
}
```

**Acceptance Criteria:**
- [ ] Searches across characters, projects, scene_types
- [ ] Uses ts_rank for relevance scoring
- [ ] ts_headline provides matching text fragments for highlighting
- [ ] Respects entity_type filter
- [ ] Respects project_id facet filter
- [ ] Results in <200ms for typical queries (per success metric)

### Task 2.3: Faceted Aggregation Service
**File:** `src/search/facets.rs`

Compute facet counts for the current search context.

```rust
pub async fn compute_facets(
    pool: &PgPool,
    req: &SearchRequest,
) -> Result<SearchFacets, SearchError> {
    let tsquery = build_tsquery(&req.query)?;

    // Count by entity type
    let entity_type_facets = vec![
        FacetValue { value: "character".to_string(), count: count_character_matches(pool, &tsquery, &req.filters).await? },
        FacetValue { value: "project".to_string(), count: count_project_matches(pool, &tsquery, &req.filters).await? },
        FacetValue { value: "scene_type".to_string(), count: count_scene_type_matches(pool, &tsquery, &req.filters).await? },
    ];

    // Count by project
    let project_facets = sqlx::query_as!(
        FacetValue,
        r#"
        SELECT p.name as value, COUNT(*) as count
        FROM characters c
        JOIN projects p ON p.id = c.project_id
        WHERE c.search_vector @@ $1::tsquery
        GROUP BY p.name
        ORDER BY count DESC
        "#,
        tsquery
    )
    .fetch_all(pool)
    .await?;

    // Count by status, tags, etc.

    Ok(SearchFacets {
        entity_types: entity_type_facets,
        projects: project_facets,
        statuses: vec![], // compute similarly
        tags: vec![],     // compute from PRD-047 tagging data
    })
}
```

**Acceptance Criteria:**
- [ ] Computes counts per entity type matching the query
- [ ] Computes counts per project, status, tag
- [ ] Facet counts reflect current filter state (narrowing)
- [ ] All facet queries are efficient (indexed)

### Task 2.4: Visual Similarity Search
**File:** `src/search/similarity.rs`

pgvector-powered image similarity search.

```rust
pub async fn search_similar_images(
    pool: &PgPool,
    query_embedding: &[f32],
    threshold: f64,
    limit: i64,
) -> Result<Vec<SimilarityResult>, SearchError> {
    // Assumes embeddings table exists from PRD-076
    let results = sqlx::query_as!(
        SimilarityResult,
        r#"
        SELECT entity_type, entity_id, entity_name,
               1 - (embedding <=> $1::vector) as similarity_score,
               image_path
        FROM image_embeddings
        WHERE 1 - (embedding <=> $1::vector) >= $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3
        "#,
        query_embedding as &[f32], threshold, limit
    )
    .fetch_all(pool)
    .await?;

    Ok(results)
}
```

**Acceptance Criteria:**
- [ ] Queries pgvector using cosine distance
- [ ] Configurable similarity threshold
- [ ] Returns top N results sorted by similarity
- [ ] Gracefully handles missing embeddings (returns empty, not error)
- [ ] Top 10 results in <500ms (per success metric)

### Task 2.5: Search-as-You-Type Service
**File:** `src/search/typeahead.rs`

Optimized fast search for Command Palette integration.

```rust
pub async fn typeahead_search(
    pool: &PgPool,
    query: &str,
    limit: i64,
) -> Result<Vec<TypeaheadResult>, SearchError> {
    // Use prefix matching for speed: to_tsquery(query:*)
    let prefix_query = format!("{}:*", query.split_whitespace().collect::<Vec<_>>().join(" & "));

    let results = sqlx::query_as!(
        TypeaheadResult,
        r#"
        SELECT 'character' as entity_type, id as entity_id, name,
               ts_rank(search_vector, $1::tsquery) as rank
        FROM characters
        WHERE search_vector @@ $1::tsquery
        UNION ALL
        SELECT 'project', id, name, ts_rank(search_vector, $1::tsquery)
        FROM projects
        WHERE search_vector @@ $1::tsquery
        UNION ALL
        SELECT 'scene_type', id, name, ts_rank(search_vector, $1::tsquery)
        FROM scene_types
        WHERE search_vector @@ $1::tsquery
        ORDER BY rank DESC
        LIMIT $2
        "#,
        prefix_query, limit
    )
    .fetch_all(pool)
    .await?;

    Ok(results)
}
```

**Acceptance Criteria:**
- [ ] Prefix matching (`query:*`) for instant results as user types
- [ ] Results from all entity types in a single query
- [ ] Sorted by relevance
- [ ] <100ms latency per keystroke (per success metric)
- [ ] Limited to top N results for speed

---

## Phase 3: Saved Searches

### Task 3.1: Saved Search Service
**File:** `src/search/saved.rs`

CRUD for saved searches.

```rust
pub async fn save_search(
    pool: &PgPool,
    name: &str,
    query_text: Option<&str>,
    filters: &SearchFilters,
    entity_types: &[String],
    owner_id: Option<DbId>,
    is_shared: bool,
) -> Result<DbId, SearchError> {
    let id = sqlx::query_scalar!(
        r#"
        INSERT INTO saved_searches (name, query_text, filters, entity_types, owner_id, is_shared)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        "#,
        name, query_text, serde_json::to_value(filters).unwrap(),
        entity_types, owner_id, is_shared
    )
    .fetch_one(pool)
    .await?;
    Ok(id)
}

pub async fn list_saved_searches(
    pool: &PgPool,
    owner_id: Option<DbId>,
) -> Result<Vec<SavedSearchRow>, sqlx::Error> {
    sqlx::query_as!(
        SavedSearchRow,
        r#"
        SELECT * FROM saved_searches
        WHERE owner_id = $1 OR is_shared = true
        ORDER BY use_count DESC, name
        "#,
        owner_id
    )
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] Save current query + filters as a named search
- [ ] List user's own searches + shared searches
- [ ] Track use_count and last_used_at
- [ ] Delete saved search by ID

---

## Phase 4: API Endpoints

### Task 4.1: Unified Search Endpoint
**File:** `src/routes/search.rs`

```rust
pub async fn search(
    State(pool): State<PgPool>,
    Query(params): Query<SearchRequest>,
) -> Result<impl IntoResponse, AppError> {
    let start = std::time::Instant::now();

    let results = crate::search::fulltext::search_fulltext(&pool, &params).await?;
    let facets = crate::search::facets::compute_facets(&pool, &params).await?;

    let duration_ms = start.elapsed().as_millis() as i64;

    // Log search analytics
    log_search_query(&pool, &params, results.len(), duration_ms).await?;

    Ok(Json(SearchResponse {
        total_count: results.len() as i64,
        results,
        facets,
        query_duration_ms: duration_ms,
    }))
}
```

**Acceptance Criteria:**
- [ ] `GET /api/search` unified search with query params
- [ ] Returns results, facets, and timing
- [ ] Logs query for analytics
- [ ] Supports all filter combinations

### Task 4.2: Typeahead Endpoint
**File:** `src/routes/search.rs`

**Acceptance Criteria:**
- [ ] `GET /api/search/typeahead?q=...` returns fast prefix matches
- [ ] Results grouped by entity type
- [ ] <100ms response time

### Task 4.3: Visual Similarity Endpoint
**File:** `src/routes/search.rs`

**Acceptance Criteria:**
- [ ] `POST /api/search/similar` accepts image upload or embedding vector
- [ ] Returns similar images with similarity scores
- [ ] Configurable threshold and limit

### Task 4.4: Saved Searches Endpoints
**File:** `src/routes/search.rs`

**Acceptance Criteria:**
- [ ] `POST /api/search/saved` creates a saved search
- [ ] `GET /api/search/saved` lists saved searches
- [ ] `DELETE /api/search/saved/:id` deletes a saved search
- [ ] `GET /api/search/saved/:id/execute` runs a saved search

### Task 4.5: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All search endpoints registered
- [ ] Routes use correct HTTP methods

---

## Phase 5: Frontend — Search UI

### Task 5.1: Search Bar Component
**File:** `frontend/src/components/search/SearchBar.tsx`

Global search bar with typeahead.

```typescript
export const SearchBar: React.FC<{ onResultSelect: (result: SearchResult) => void }> = ({
  onResultSelect,
}) => {
  const [query, setQuery] = useState('');
  const [typeaheadResults, setTypeaheadResults] = useState<TypeaheadResult[]>([]);

  useEffect(() => {
    if (query.length < 2) { setTypeaheadResults([]); return; }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/search/typeahead?q=${encodeURIComponent(query)}`);
      setTypeaheadResults(await res.json());
    }, 100); // debounce 100ms
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="search-bar">
      <input
        placeholder="Search characters, projects, scenes..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {typeaheadResults.length > 0 && (
        <div className="typeahead-results">
          {typeaheadResults.map(r => (
            <div key={`${r.entity_type}-${r.entity_id}`} onClick={() => onResultSelect(r)}>
              <span className="type-badge">{r.entity_type}</span>
              <span className="name">{r.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] Debounced typeahead (100ms delay)
- [ ] Results appear below search bar grouped by type
- [ ] Keyboard navigation (up/down arrows, Enter to select)
- [ ] Esc to dismiss, click-away to close

### Task 5.2: Faceted Filter Panel
**File:** `frontend/src/components/search/FacetPanel.tsx`

Collapsible facet panel for structured filtering.

```typescript
interface FacetPanelProps {
  facets: SearchFacets;
  activeFilters: SearchFilters;
  onFilterChange: (filters: SearchFilters) => void;
}

export const FacetPanel: React.FC<FacetPanelProps> = ({ facets, activeFilters, onFilterChange }) => (
  <div className="facet-panel">
    <FacetGroup title="Entity Type" values={facets.entity_types} />
    <FacetGroup title="Project" values={facets.projects} />
    <FacetGroup title="Status" values={facets.statuses} />
    <FacetGroup title="Tags" values={facets.tags} />
  </div>
);
```

**Acceptance Criteria:**
- [ ] Facet groups for entity type, project, status, tags
- [ ] Each value shows count of matching records
- [ ] Clicking a facet value adds it as a filter
- [ ] Active filters shown as removable chips
- [ ] Collapsible panel to save screen space
- [ ] Filter state reflected in URL for sharing

### Task 5.3: Search Results List
**File:** `frontend/src/components/search/SearchResults.tsx`

**Acceptance Criteria:**
- [ ] Displays results with entity type badge, name, description snippet
- [ ] Highlighted matching terms in results
- [ ] Click navigates to entity detail view
- [ ] Pagination or infinite scroll

### Task 5.4: Saved Searches Panel
**File:** `frontend/src/components/search/SavedSearches.tsx`

**Acceptance Criteria:**
- [ ] List of saved searches with name and use count
- [ ] Click to execute a saved search
- [ ] Save current search as new saved search
- [ ] Delete saved searches

---

## Phase 6: Testing

### Task 6.1: Full-Text Search Tests
**File:** `tests/search_fulltext_tests.rs`

**Acceptance Criteria:**
- [ ] Search by character name returns correct results
- [ ] Search ranks name matches above description matches
- [ ] Multi-word queries use AND logic
- [ ] Empty query returns no results (not all)
- [ ] Project filter restricts results correctly

### Task 6.2: Facet Tests
**File:** `tests/search_facet_tests.rs`

**Acceptance Criteria:**
- [ ] Entity type facet counts are accurate
- [ ] Project facet counts match actual data
- [ ] Facets narrow correctly when filters applied

### Task 6.3: Typeahead Tests
**File:** `tests/search_typeahead_tests.rs`

**Acceptance Criteria:**
- [ ] Prefix matching returns results
- [ ] Results from multiple entity types
- [ ] Response time <100ms for indexed data

### Task 6.4: Similarity Search Tests
**File:** `tests/search_similarity_tests.rs`

**Acceptance Criteria:**
- [ ] Similar embeddings return high similarity scores
- [ ] Threshold filtering works
- [ ] Graceful handling of no embeddings

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_search_indexes.sql` | tsvector columns and GIN indexes |
| `migrations/{timestamp}_create_saved_searches.sql` | Saved searches table |
| `migrations/{timestamp}_create_search_analytics.sql` | Search query logging |
| `src/search/mod.rs` | Module root |
| `src/search/types.rs` | Search request/response types |
| `src/search/fulltext.rs` | Full-text search service |
| `src/search/facets.rs` | Faceted aggregation |
| `src/search/similarity.rs` | pgvector visual similarity |
| `src/search/typeahead.rs` | Search-as-you-type |
| `src/search/saved.rs` | Saved search CRUD |
| `src/routes/search.rs` | API endpoints |
| `frontend/src/components/search/SearchBar.tsx` | Global search with typeahead |
| `frontend/src/components/search/FacetPanel.tsx` | Faceted filter panel |
| `frontend/src/components/search/SearchResults.tsx` | Results list |
| `frontend/src/components/search/SavedSearches.tsx` | Saved search management |

## Dependencies

### Existing Components to Reuse
- PRD-000: pgvector extension, `DbId`, migration framework
- PRD-001: Entity tables being searched
- PRD-047: Tag data for tag facet

### New Infrastructure Needed
- PostgreSQL full-text search (built-in, no extensions)
- pgvector for similarity (already installed via PRD-000)

## Implementation Order

### MVP
1. Phase 1: Database Schema & Indexes (Tasks 1.1-1.2)
2. Phase 2: Search Engine Core (Tasks 2.1-2.5)
3. Phase 3: Saved Searches (Task 3.1)
4. Phase 4: API Endpoints (Tasks 4.1-4.5)

**MVP Success Criteria:**
- Full-text search returns results in <200ms for 10,000+ entities
- Visual similarity top 10 in <500ms
- Typeahead <100ms per keystroke
- Facet counts are accurate

### Post-MVP Enhancements
1. Phase 5: Frontend UI (Tasks 5.1-5.4)
2. Phase 6: Testing (Tasks 6.1-6.4)
3. Search analytics dashboard (PRD Phase 2)

---

## Notes

1. **Index maintenance:** tsvector triggers run on every INSERT/UPDATE. For bulk imports (PRD-016), consider disabling triggers during import and backfilling vectors after.
2. **Scaling beyond PostgreSQL:** If search latency exceeds requirements at scale, Meilisearch or Typesense can be added. The search service interface should be abstracted to allow swapping backends.
3. **Embedding generation:** Visual similarity search depends on PRD-076 generating embeddings. The search endpoint should return a helpful message ("Visual search not available — embeddings not generated") rather than an error.
4. **URL-encoded filters:** All search state (query, facets, pagination) should be serializable to URL query parameters so search results pages can be bookmarked and shared.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

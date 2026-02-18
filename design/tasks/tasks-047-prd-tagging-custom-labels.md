# Task List: Tagging & Custom Labels

**PRD Reference:** `design/prds/047-prd-tagging-custom-labels.md`
**Scope:** Build a cross-cutting tagging system with freeform tags, optional namespaces, color coding, bulk operations, autocomplete suggestions, and integration with PRD-020 search facets.

## Overview

This PRD creates a polymorphic tagging system that works across all entity types (projects, characters, scenes, segments, workflows). Tags are freeform strings with optional namespace prefixes (e.g., `priority:urgent`), optional colors, and full autocomplete. The junction table design (entity_type + entity_id + tag_id) avoids per-entity-type tag tables while keeping queries efficient via indexes. Tags integrate with PRD-020 as search facets.

### What Already Exists
- PRD-000: Database conventions, migration framework
- PRD-001: Entity tables that tags will be applied to
- PRD-020: Search engine that will consume tags as facets

### What We're Building
1. Tags table with name, optional namespace, optional color
2. Polymorphic entity_tags junction table
3. Tag CRUD service with autocomplete
4. Bulk tag apply/remove operations
5. Tag suggestion service (prefix matching, frequency-sorted)
6. Tag chips UI components with color support

### Key Design Decisions
1. **Polymorphic junction table** — Single `entity_tags` table with `entity_type` + `entity_id` rather than per-entity junction tables. Simpler schema, slightly more complex queries.
2. **Tags created on first use** — No pre-registration required. Typing a new tag and applying it creates the tag record.
3. **Case-insensitive uniqueness** — Tags are stored lowercase. `NightScene` and `nightscene` resolve to the same tag.
4. **Namespace is just a convention** — The colon separator is stored as part of the tag name. No separate namespace table. Filtering by namespace uses prefix matching.

---

## Phase 1: Database Schema

### Task 1.1: Tags Table
**File:** `migrations/{timestamp}_create_tags.sql`

```sql
CREATE TABLE tags (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,                  -- lowercase, normalized
    display_name TEXT NOT NULL,          -- original casing for display
    namespace TEXT,                      -- extracted namespace prefix (e.g., 'priority' from 'priority:urgent')
    color TEXT,                          -- hex color code (e.g., '#FF5733')
    usage_count INTEGER NOT NULL DEFAULT 0, -- denormalized for fast sorting
    created_by BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_tags_name ON tags(name);
CREATE INDEX idx_tags_namespace ON tags(namespace);
CREATE INDEX idx_tags_usage_count ON tags(usage_count DESC);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Tags stored with lowercase `name` and original `display_name`
- [ ] Unique constraint on lowercase name prevents duplicates
- [ ] `namespace` extracted from name on insert (before the colon)
- [ ] `color` is optional hex color code
- [ ] `usage_count` denormalized for fast autocomplete sorting
- [ ] Migration applies cleanly

### Task 1.2: Entity Tags Junction Table
**File:** `migrations/{timestamp}_create_entity_tags.sql`

```sql
CREATE TABLE entity_tags (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,           -- 'project', 'character', 'scene', 'segment', 'workflow'
    entity_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE ON UPDATE CASCADE,
    applied_by BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_entity_tags ON entity_tags(entity_type, entity_id, tag_id);
CREATE INDEX idx_entity_tags_tag_id ON entity_tags(tag_id);
CREATE INDEX idx_entity_tags_entity ON entity_tags(entity_type, entity_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON entity_tags
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

**Acceptance Criteria:**
- [ ] Polymorphic: entity_type + entity_id links to any entity
- [ ] Unique constraint prevents duplicate tag-entity pairs
- [ ] CASCADE delete: removing a tag removes all its associations
- [ ] Indexes on both tag_id and entity for bidirectional queries
- [ ] Migration applies cleanly

---

## Phase 2: Tag Service

### Task 2.1: Tag CRUD
**File:** `src/tags/service.rs`

```rust
use sqlx::PgPool;
use crate::types::DbId;

pub async fn create_or_get_tag(
    pool: &PgPool,
    display_name: &str,
    color: Option<&str>,
    created_by: Option<DbId>,
) -> Result<DbId, TagError> {
    let normalized = normalize_tag_name(display_name);
    let namespace = extract_namespace(&normalized);

    let id = sqlx::query_scalar!(
        r#"
        INSERT INTO tags (name, display_name, namespace, color, created_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name
        RETURNING id
        "#,
        normalized, display_name, namespace, color, created_by
    )
    .fetch_one(pool)
    .await?;

    Ok(id)
}

fn normalize_tag_name(name: &str) -> String {
    name.trim().to_lowercase()
}

fn extract_namespace(name: &str) -> Option<String> {
    name.split_once(':').map(|(ns, _)| ns.to_string())
}

pub async fn apply_tag(
    pool: &PgPool,
    entity_type: &str,
    entity_id: DbId,
    tag_id: DbId,
    applied_by: Option<DbId>,
) -> Result<(), TagError> {
    sqlx::query!(
        r#"
        INSERT INTO entity_tags (entity_type, entity_id, tag_id, applied_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (entity_type, entity_id, tag_id) DO NOTHING
        "#,
        entity_type, entity_id, tag_id, applied_by
    )
    .execute(pool)
    .await?;

    // Increment usage count
    sqlx::query!("UPDATE tags SET usage_count = usage_count + 1 WHERE id = $1", tag_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn remove_tag(
    pool: &PgPool,
    entity_type: &str,
    entity_id: DbId,
    tag_id: DbId,
) -> Result<(), TagError> {
    let deleted = sqlx::query!(
        "DELETE FROM entity_tags WHERE entity_type = $1 AND entity_id = $2 AND tag_id = $3",
        entity_type, entity_id, tag_id
    )
    .execute(pool)
    .await?;

    if deleted.rows_affected() > 0 {
        sqlx::query!("UPDATE tags SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = $1", tag_id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

pub async fn get_entity_tags(
    pool: &PgPool,
    entity_type: &str,
    entity_id: DbId,
) -> Result<Vec<TagInfo>, sqlx::Error> {
    sqlx::query_as!(
        TagInfo,
        r#"
        SELECT t.id, t.name, t.display_name, t.namespace, t.color
        FROM entity_tags et
        JOIN tags t ON t.id = et.tag_id
        WHERE et.entity_type = $1 AND et.entity_id = $2
        ORDER BY t.name
        "#,
        entity_type, entity_id
    )
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] Tags created on first use (create_or_get_tag)
- [ ] Case-insensitive normalization prevents duplicates
- [ ] Namespace extracted from colon-separated names
- [ ] Apply is idempotent (ON CONFLICT DO NOTHING)
- [ ] Usage count tracked for autocomplete sorting
- [ ] Get entity tags returns all tags for an entity

### Task 2.2: Tag Autocomplete
**File:** `src/tags/autocomplete.rs`

```rust
pub async fn suggest_tags(
    pool: &PgPool,
    prefix: &str,
    limit: i64,
) -> Result<Vec<TagSuggestion>, sqlx::Error> {
    let normalized = prefix.trim().to_lowercase();

    sqlx::query_as!(
        TagSuggestion,
        r#"
        SELECT id, name, display_name, namespace, color, usage_count
        FROM tags
        WHERE name LIKE $1 || '%'
        ORDER BY usage_count DESC, name
        LIMIT $2
        "#,
        normalized, limit
    )
    .fetch_all(pool)
    .await
}
```

**Acceptance Criteria:**
- [ ] Prefix matching on normalized name
- [ ] Sorted by usage frequency (most used first)
- [ ] Returns in <50ms (per success metric)
- [ ] Case-insensitive matching

### Task 2.3: Bulk Tagging Service
**File:** `src/tags/bulk.rs`

```rust
pub async fn bulk_apply_tags(
    pool: &PgPool,
    entity_type: &str,
    entity_ids: &[DbId],
    tag_names: &[String],
    applied_by: Option<DbId>,
) -> Result<BulkTagResult, TagError> {
    let mut result = BulkTagResult::default();

    for tag_name in tag_names {
        let tag_id = create_or_get_tag(pool, tag_name, None, applied_by).await?;
        for &entity_id in entity_ids {
            apply_tag(pool, entity_type, entity_id, tag_id, applied_by).await?;
            result.applied += 1;
        }
    }

    Ok(result)
}

pub async fn bulk_remove_tags(
    pool: &PgPool,
    entity_type: &str,
    entity_ids: &[DbId],
    tag_ids: &[DbId],
) -> Result<BulkTagResult, TagError> {
    let mut result = BulkTagResult::default();

    for &tag_id in tag_ids {
        for &entity_id in entity_ids {
            remove_tag(pool, entity_type, entity_id, tag_id).await?;
            result.removed += 1;
        }
    }

    Ok(result)
}
```

**Acceptance Criteria:**
- [ ] Apply multiple tags to multiple entities in one call
- [ ] Remove multiple tags from multiple entities
- [ ] 100 entities in <2 seconds (per success metric)
- [ ] Reports counts of applied/removed

### Task 2.4: Tag-Based Filtering
**File:** `src/tags/filter.rs`

Query entities by tag combination.

```rust
pub async fn filter_entities_by_tags(
    pool: &PgPool,
    entity_type: &str,
    tag_ids: &[DbId],
    logic: TagFilterLogic, // AND or OR
    limit: i64,
    offset: i64,
) -> Result<Vec<DbId>, sqlx::Error> {
    match logic {
        TagFilterLogic::And => {
            // Entity must have ALL specified tags
            sqlx::query_scalar!(
                r#"
                SELECT entity_id
                FROM entity_tags
                WHERE entity_type = $1 AND tag_id = ANY($2)
                GROUP BY entity_id
                HAVING COUNT(DISTINCT tag_id) = $3
                LIMIT $4 OFFSET $5
                "#,
                entity_type, tag_ids, tag_ids.len() as i64, limit, offset
            )
            .fetch_all(pool)
            .await
        }
        TagFilterLogic::Or => {
            // Entity must have ANY of the specified tags
            sqlx::query_scalar!(
                r#"
                SELECT DISTINCT entity_id
                FROM entity_tags
                WHERE entity_type = $1 AND tag_id = ANY($2)
                LIMIT $3 OFFSET $4
                "#,
                entity_type, tag_ids, limit, offset
            )
            .fetch_all(pool)
            .await
        }
    }
}
```

**Acceptance Criteria:**
- [ ] AND logic: entity must have all specified tags
- [ ] OR logic: entity must have any specified tag
- [ ] Tag filter adds <100ms to search queries (per success metric)
- [ ] Paginated results

---

## Phase 3: API Endpoints

### Task 3.1: Tag CRUD Endpoints
**File:** `src/routes/tags.rs`

```rust
pub async fn list_tags(State(pool): State<PgPool>, Query(params): Query<TagListParams>) -> Result<impl IntoResponse, AppError> {
    // List all tags, optionally filtered by namespace
}

pub async fn suggest_tags_endpoint(State(pool): State<PgPool>, Query(params): Query<SuggestParams>) -> Result<impl IntoResponse, AppError> {
    let suggestions = crate::tags::autocomplete::suggest_tags(&pool, &params.prefix, params.limit.unwrap_or(10)).await?;
    Ok(Json(suggestions))
}

pub async fn update_tag_color(State(pool): State<PgPool>, Path(tag_id): Path<DbId>, Json(body): Json<UpdateColorRequest>) -> Result<impl IntoResponse, AppError> {
    // Update tag color
}
```

**Acceptance Criteria:**
- [ ] `GET /api/tags` lists all tags with counts
- [ ] `GET /api/tags/suggest?prefix=...` returns autocomplete suggestions
- [ ] `PUT /api/tags/:id` updates tag color/display name
- [ ] `DELETE /api/tags/:id` deletes a tag and all associations

### Task 3.2: Entity Tag Endpoints
**File:** `src/routes/tags.rs`

**Acceptance Criteria:**
- [ ] `GET /api/entities/:type/:id/tags` lists tags for an entity
- [ ] `POST /api/entities/:type/:id/tags` applies tag(s) to an entity
- [ ] `DELETE /api/entities/:type/:id/tags/:tag_id` removes a tag
- [ ] `POST /api/tags/bulk-apply` applies tags to multiple entities
- [ ] `POST /api/tags/bulk-remove` removes tags from multiple entities

### Task 3.3: Route Registration
**File:** `src/routes/mod.rs`

**Acceptance Criteria:**
- [ ] All tag endpoints registered
- [ ] Routes use correct HTTP methods

---

## Phase 4: Frontend — Tag UI

### Task 4.1: Tag Input Component
**File:** `frontend/src/components/tags/TagInput.tsx`

Chips-style tag input with autocomplete.

```typescript
interface TagInputProps {
  entityType: string;
  entityId: number;
  existingTags: TagInfo[];
  onTagsChange: (tags: TagInfo[]) => void;
}

export const TagInput: React.FC<TagInputProps> = ({ entityType, entityId, existingTags, onTagsChange }) => {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);

  useEffect(() => {
    if (input.length < 1) { setSuggestions([]); return; }
    fetch(`/api/tags/suggest?prefix=${encodeURIComponent(input)}`)
      .then(r => r.json())
      .then(setSuggestions);
  }, [input]);

  const handleAddTag = async (tagName: string) => {
    await fetch(`/api/entities/${entityType}/${entityId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tagName }),
    });
    setInput('');
    // Refresh tags
  };

  return (
    <div className="tag-input">
      {existingTags.map(tag => (
        <TagChip key={tag.id} tag={tag} onRemove={() => removeTag(tag.id)} />
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleAddTag(input)}
        placeholder="Add tag..."
      />
      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map(s => (
            <div key={s.id} onClick={() => handleAddTag(s.display_name)}>
              {s.display_name} ({s.usage_count})
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

**Acceptance Criteria:**
- [ ] Chips-style display of existing tags
- [ ] Type and press Enter to add a tag
- [ ] Autocomplete suggestions as user types
- [ ] New tags indicated with visual marker
- [ ] Click X on a chip to remove a tag

### Task 4.2: Tag Chip Component
**File:** `frontend/src/components/tags/TagChip.tsx`

```typescript
export const TagChip: React.FC<{ tag: TagInfo; onRemove?: () => void }> = ({ tag, onRemove }) => (
  <span
    className="tag-chip"
    style={{ backgroundColor: tag.color || '#e0e0e0' }}
  >
    {tag.display_name}
    {onRemove && <button className="remove" onClick={onRemove}>x</button>}
  </span>
);
```

**Acceptance Criteria:**
- [ ] Displays tag name with optional color background
- [ ] Optional remove button
- [ ] Compact design for list views
- [ ] Namespace shown as subtle prefix

### Task 4.3: Tag Filter Panel
**File:** `frontend/src/components/tags/TagFilter.tsx`

Tag filter for list views and search.

**Acceptance Criteria:**
- [ ] Shows available tags with counts
- [ ] Click to toggle tag filter on/off
- [ ] AND/OR logic toggle
- [ ] Active tag filters shown as removable chips
- [ ] Integrates with PRD-020 search facet panel

### Task 4.4: Bulk Tag Dialog
**File:** `frontend/src/components/tags/BulkTagDialog.tsx`

Dialog for applying/removing tags to selected entities.

**Acceptance Criteria:**
- [ ] Appears when entities are selected in a list view
- [ ] Tag input with autocomplete for adding tags
- [ ] Remove existing tags from selection
- [ ] Confirmation before applying

---

## Phase 5: Testing

### Task 5.1: Tag CRUD Tests
**File:** `tests/tag_crud_tests.rs`

**Acceptance Criteria:**
- [ ] Create tag normalizes to lowercase
- [ ] Duplicate names resolve to same tag (case-insensitive)
- [ ] Namespace extracted correctly from colon-separated names
- [ ] Apply and remove update usage count

### Task 5.2: Bulk Tagging Tests
**File:** `tests/tag_bulk_tests.rs`

**Acceptance Criteria:**
- [ ] Bulk apply adds tags to all selected entities
- [ ] Bulk remove removes tags from all selected entities
- [ ] Idempotent: re-applying same tag does not error

### Task 5.3: Autocomplete Tests
**File:** `tests/tag_autocomplete_tests.rs`

**Acceptance Criteria:**
- [ ] Prefix matching returns correct suggestions
- [ ] Sorted by usage count descending
- [ ] Response time <50ms for indexed data

### Task 5.4: Filter Tests
**File:** `tests/tag_filter_tests.rs`

**Acceptance Criteria:**
- [ ] AND filter returns entities with all specified tags
- [ ] OR filter returns entities with any specified tag
- [ ] Empty tag list returns all entities
- [ ] Filter adds <100ms to queries

---

## Relevant Files

| File | Description |
|------|-------------|
| `migrations/{timestamp}_create_tags.sql` | Tags table |
| `migrations/{timestamp}_create_entity_tags.sql` | Entity-tag junction table |
| `src/tags/mod.rs` | Module root |
| `src/tags/service.rs` | Tag CRUD operations |
| `src/tags/autocomplete.rs` | Tag suggestion service |
| `src/tags/bulk.rs` | Bulk tag operations |
| `src/tags/filter.rs` | Tag-based entity filtering |
| `src/routes/tags.rs` | API endpoints |
| `frontend/src/components/tags/TagInput.tsx` | Chips-style tag input |
| `frontend/src/components/tags/TagChip.tsx` | Individual tag chip |
| `frontend/src/components/tags/TagFilter.tsx` | Tag filter panel |
| `frontend/src/components/tags/BulkTagDialog.tsx` | Bulk tag dialog |

## Dependencies

### Existing Components to Reuse
- PRD-000: `DbId`, migration framework, `trigger_set_updated_at()`
- PRD-001: Entity tables that tags apply to
- PRD-020: Search engine (tags as facets)

### New Infrastructure Needed
- None (uses PostgreSQL features only)

## Implementation Order

### MVP
1. Phase 1: Database Schema (Tasks 1.1-1.2)
2. Phase 2: Tag Service (Tasks 2.1-2.4)
3. Phase 3: API Endpoints (Tasks 3.1-3.3)

**MVP Success Criteria:**
- Autocomplete in <50ms
- Bulk tag 100 entities in <2 seconds
- Tag filter adds <100ms to queries
- Zero duplicate tags from autocomplete usage

### Post-MVP Enhancements
1. Phase 4: Frontend UI (Tasks 4.1-4.4)
2. Phase 5: Testing (Tasks 5.1-5.4)
3. Tag analytics (PRD Phase 2)

---

## Notes

1. **Usage count accuracy:** The denormalized `usage_count` can drift if tags are removed outside the normal flow. A periodic job should reconcile counts: `UPDATE tags SET usage_count = (SELECT COUNT(*) FROM entity_tags WHERE tag_id = tags.id)`.
2. **Tag scope:** Currently tags are global (studio-wide). If project-scoped tags are needed, add a `project_id` column to `tags` with a modified unique constraint.
3. **PRD-020 integration:** The search engine should join with `entity_tags` and `tags` tables to include tag values in faceted filtering. The tsvector could also include tag names for full-text relevance.
4. **Color palette:** Limit the color picker to 12 predefined colors to maintain visual consistency. Store as hex codes.

## Version History
- **v1.0** (2026-02-18): Initial task list creation from PRD

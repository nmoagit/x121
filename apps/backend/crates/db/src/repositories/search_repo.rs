//! Repository for search & discovery (PRD-20).
//!
//! Provides full-text search, faceted aggregation, typeahead,
//! saved search CRUD, visual similarity search, and analytics logging.

use sqlx::PgPool;
use x121_core::search::{
    build_prefix_tsquery, build_tsquery, clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT,
    DEFAULT_SEARCH_SIMILARITY, DEFAULT_SIMILARITY_LIMIT, DEFAULT_TYPEAHEAD_LIMIT, MAX_SEARCH_LIMIT,
    MAX_SIMILARITY_LIMIT, MAX_TYPEAHEAD_LIMIT,
};
use x121_core::types::DbId;

use crate::models::search::{
    FacetValue, SavedSearch, SearchFacets, SearchParams, SearchResultRow, SimilarityResult,
    TypeaheadResult,
};

/// Column list for `saved_searches` queries.
const SAVED_SEARCH_COLUMNS: &str = "\
    id, name, description, query_text, filters, entity_types, \
    is_shared, owner_id, use_count, last_used_at, created_at, updated_at";

/// Provides search operations across entity tables.
pub struct SearchRepo;

impl SearchRepo {
    // -----------------------------------------------------------------------
    // Full-text search
    // -----------------------------------------------------------------------

    /// Execute a full-text search across characters, projects, and scene_types.
    ///
    /// Results are ranked by `ts_rank` and merged from all entity types.
    pub async fn search_fulltext(
        pool: &PgPool,
        params: &SearchParams,
    ) -> Result<Vec<SearchResultRow>, sqlx::Error> {
        let query_text = match params.q.as_deref() {
            Some(q) if !q.trim().is_empty() => q.trim(),
            _ => return Ok(Vec::new()),
        };

        let tsquery = match build_tsquery(query_text) {
            Some(q) => q,
            None => return Ok(Vec::new()),
        };

        let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset = clamp_offset(params.offset);

        let entity_types = parse_entity_types(params.entity_types.as_deref());

        let mut all_results: Vec<SearchResultRow> = Vec::new();

        // Search characters
        if should_search(&entity_types, "character") {
            let sql = "\
                SELECT 'character'::text AS entity_type, id AS entity_id, name, \
                       metadata ->> 'description' AS description, \
                       ts_rank(search_vector, to_tsquery('english', $1)) AS rank, \
                       ts_headline('english', \
                           COALESCE(name, '') || ' ' || COALESCE(metadata ->> 'description', ''), \
                           to_tsquery('english', $1), 'MaxWords=50, MinWords=10') AS headline \
                FROM characters \
                WHERE search_vector @@ to_tsquery('english', $1) \
                  AND deleted_at IS NULL \
                  AND ($2::BIGINT IS NULL OR project_id = $2) \
                ORDER BY rank DESC \
                LIMIT $3";

            let rows = sqlx::query_as::<_, SearchResultRow>(sql)
                .bind(&tsquery)
                .bind(params.project_id)
                .bind(limit)
                .fetch_all(pool)
                .await?;
            all_results.extend(rows);
        }

        // Search projects
        if should_search(&entity_types, "project") {
            let sql = "\
                SELECT 'project'::text AS entity_type, id AS entity_id, name, \
                       description, \
                       ts_rank(search_vector, to_tsquery('english', $1)) AS rank, \
                       ts_headline('english', \
                           COALESCE(name, '') || ' ' || COALESCE(description, ''), \
                           to_tsquery('english', $1), 'MaxWords=50, MinWords=10') AS headline \
                FROM projects \
                WHERE search_vector @@ to_tsquery('english', $1) \
                  AND deleted_at IS NULL \
                ORDER BY rank DESC \
                LIMIT $2";

            let rows = sqlx::query_as::<_, SearchResultRow>(sql)
                .bind(&tsquery)
                .bind(limit)
                .fetch_all(pool)
                .await?;
            all_results.extend(rows);
        }

        // Search scene types
        if should_search(&entity_types, "scene_type") {
            let sql = "\
                SELECT 'scene_type'::text AS entity_type, id AS entity_id, name, \
                       prompt_template AS description, \
                       ts_rank(search_vector, to_tsquery('english', $1)) AS rank, \
                       ts_headline('english', \
                           COALESCE(name, '') || ' ' || COALESCE(prompt_template, ''), \
                           to_tsquery('english', $1), 'MaxWords=50, MinWords=10') AS headline \
                FROM scene_types \
                WHERE search_vector @@ to_tsquery('english', $1) \
                  AND deleted_at IS NULL \
                  AND ($2::BIGINT IS NULL OR project_id = $2) \
                ORDER BY rank DESC \
                LIMIT $3";

            let rows = sqlx::query_as::<_, SearchResultRow>(sql)
                .bind(&tsquery)
                .bind(params.project_id)
                .bind(limit)
                .fetch_all(pool)
                .await?;
            all_results.extend(rows);
        }

        // Sort merged results by rank (descending)
        all_results.sort_by(|a, b| {
            b.rank
                .partial_cmp(&a.rank)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Apply offset and limit to merged results
        let results: Vec<SearchResultRow> = all_results
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .collect();

        Ok(results)
    }

    // -----------------------------------------------------------------------
    // Faceted aggregation
    // -----------------------------------------------------------------------

    /// Compute facet counts for the current search query.
    pub async fn compute_facets(
        pool: &PgPool,
        params: &SearchParams,
    ) -> Result<SearchFacets, sqlx::Error> {
        let query_text = match params.q.as_deref() {
            Some(q) if !q.trim().is_empty() => q.trim(),
            _ => return Ok(SearchFacets::default()),
        };

        let tsquery = match build_tsquery(query_text) {
            Some(q) => q,
            None => return Ok(SearchFacets::default()),
        };

        // Entity type facets
        let character_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM characters \
             WHERE search_vector @@ to_tsquery('english', $1) AND deleted_at IS NULL",
        )
        .bind(&tsquery)
        .fetch_one(pool)
        .await?;

        let project_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM projects \
             WHERE search_vector @@ to_tsquery('english', $1) AND deleted_at IS NULL",
        )
        .bind(&tsquery)
        .fetch_one(pool)
        .await?;

        let scene_type_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM scene_types \
             WHERE search_vector @@ to_tsquery('english', $1) AND deleted_at IS NULL",
        )
        .bind(&tsquery)
        .fetch_one(pool)
        .await?;

        let entity_types = vec![
            FacetValue {
                value: "character".to_string(),
                count: character_count,
            },
            FacetValue {
                value: "project".to_string(),
                count: project_count,
            },
            FacetValue {
                value: "scene_type".to_string(),
                count: scene_type_count,
            },
        ];

        // Project facets (from matching characters grouped by project)
        let projects = sqlx::query_as::<_, FacetValue>(
            "SELECT p.name AS value, COUNT(*)::BIGINT AS count \
             FROM characters c \
             JOIN projects p ON p.id = c.project_id \
             WHERE c.search_vector @@ to_tsquery('english', $1) AND c.deleted_at IS NULL \
             GROUP BY p.name \
             ORDER BY count DESC \
             LIMIT 20",
        )
        .bind(&tsquery)
        .fetch_all(pool)
        .await?;

        Ok(SearchFacets {
            entity_types,
            projects,
            statuses: vec![],
            tags: vec![],
        })
    }

    // -----------------------------------------------------------------------
    // Typeahead (search-as-you-type)
    // -----------------------------------------------------------------------

    /// Fast prefix-matching search for the search bar / command palette.
    pub async fn typeahead(
        pool: &PgPool,
        query: &str,
        limit: Option<i64>,
    ) -> Result<Vec<TypeaheadResult>, sqlx::Error> {
        let prefix_query = match build_prefix_tsquery(query) {
            Some(q) => q,
            None => return Ok(Vec::new()),
        };

        let limit = clamp_limit(limit, DEFAULT_TYPEAHEAD_LIMIT, MAX_TYPEAHEAD_LIMIT);

        let sql = "\
            SELECT entity_type, entity_id, name, rank FROM ( \
                SELECT 'character'::text AS entity_type, id AS entity_id, name, \
                       ts_rank(search_vector, to_tsquery('english', $1)) AS rank \
                FROM characters \
                WHERE search_vector @@ to_tsquery('english', $1) AND deleted_at IS NULL \
                UNION ALL \
                SELECT 'project'::text, id, name, \
                       ts_rank(search_vector, to_tsquery('english', $1)) \
                FROM projects \
                WHERE search_vector @@ to_tsquery('english', $1) AND deleted_at IS NULL \
                UNION ALL \
                SELECT 'scene_type'::text, id, name, \
                       ts_rank(search_vector, to_tsquery('english', $1)) \
                FROM scene_types \
                WHERE search_vector @@ to_tsquery('english', $1) AND deleted_at IS NULL \
            ) sub \
            ORDER BY rank DESC \
            LIMIT $2";

        sqlx::query_as::<_, TypeaheadResult>(sql)
            .bind(&prefix_query)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Visual similarity search
    // -----------------------------------------------------------------------

    /// Search for visually similar images using pgvector cosine distance.
    ///
    /// Gracefully returns an empty vec if the `image_embeddings` table does not
    /// exist (PRD-076 may not be implemented yet).
    pub async fn search_similar(
        pool: &PgPool,
        embedding: &[f32],
        threshold: Option<f64>,
        limit: Option<i64>,
    ) -> Result<Vec<SimilarityResult>, sqlx::Error> {
        let threshold = threshold.unwrap_or(DEFAULT_SEARCH_SIMILARITY);
        let limit = clamp_limit(limit, DEFAULT_SIMILARITY_LIMIT, MAX_SIMILARITY_LIMIT);

        // Check if the image_embeddings table exists before querying.
        let table_exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS ( \
                 SELECT 1 FROM information_schema.tables \
                 WHERE table_name = 'image_embeddings' \
             )",
        )
        .fetch_one(pool)
        .await?;

        if !table_exists {
            return Ok(Vec::new());
        }

        let sql = "\
            SELECT entity_type, entity_id, entity_name, \
                   1.0 - (embedding <=> $1::vector) AS similarity_score, \
                   image_path \
            FROM image_embeddings \
            WHERE 1.0 - (embedding <=> $1::vector) >= $2 \
            ORDER BY embedding <=> $1::vector \
            LIMIT $3";

        sqlx::query_as::<_, SimilarityResult>(sql)
            .bind(embedding)
            .bind(threshold)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Saved search CRUD
    // -----------------------------------------------------------------------

    /// Create a new saved search.
    pub async fn create_saved_search(
        pool: &PgPool,
        name: &str,
        description: Option<&str>,
        query_text: Option<&str>,
        filters: &serde_json::Value,
        entity_types: &[String],
        owner_id: Option<DbId>,
        is_shared: bool,
    ) -> Result<SavedSearch, sqlx::Error> {
        let sql = format!(
            "INSERT INTO saved_searches \
                 (name, description, query_text, filters, entity_types, owner_id, is_shared) \
             VALUES ($1, $2, $3, $4, $5, $6, $7) \
             RETURNING {SAVED_SEARCH_COLUMNS}"
        );

        sqlx::query_as::<_, SavedSearch>(&sql)
            .bind(name)
            .bind(description)
            .bind(query_text)
            .bind(filters)
            .bind(entity_types)
            .bind(owner_id)
            .bind(is_shared)
            .fetch_one(pool)
            .await
    }

    /// List saved searches visible to the given user (own + shared).
    pub async fn list_saved_searches(
        pool: &PgPool,
        owner_id: Option<DbId>,
    ) -> Result<Vec<SavedSearch>, sqlx::Error> {
        let sql = format!(
            "SELECT {SAVED_SEARCH_COLUMNS} FROM saved_searches \
             WHERE owner_id = $1 OR is_shared = true \
             ORDER BY use_count DESC, name"
        );

        sqlx::query_as::<_, SavedSearch>(&sql)
            .bind(owner_id)
            .fetch_all(pool)
            .await
    }

    /// Find a saved search by ID.
    pub async fn find_saved_search_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<SavedSearch>, sqlx::Error> {
        let sql = format!("SELECT {SAVED_SEARCH_COLUMNS} FROM saved_searches WHERE id = $1");

        sqlx::query_as::<_, SavedSearch>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a saved search by ID. Returns `true` if a row was deleted.
    pub async fn delete_saved_search(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM saved_searches WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Increment use_count and update last_used_at for a saved search.
    pub async fn record_saved_search_use(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE saved_searches \
             SET use_count = use_count + 1, last_used_at = NOW() \
             WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Search analytics logging
    // -----------------------------------------------------------------------

    /// Log a search query for analytics.
    pub async fn log_search_query(
        pool: &PgPool,
        query_text: &str,
        filters: &serde_json::Value,
        result_count: i32,
        duration_ms: i32,
        user_id: Option<DbId>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO search_queries \
                 (query_text, filters, result_count, duration_ms, user_id) \
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(query_text)
        .bind(filters)
        .bind(result_count)
        .bind(duration_ms)
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse a comma-separated entity_types string into a list.
fn parse_entity_types(entity_types: Option<&str>) -> Vec<String> {
    match entity_types {
        Some(s) if !s.trim().is_empty() => s
            .split(',')
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

/// Check whether a given entity type should be searched.
///
/// If the filter list is empty, search all types.
fn should_search(entity_types: &[String], target: &str) -> bool {
    entity_types.is_empty() || entity_types.iter().any(|t| t == target)
}

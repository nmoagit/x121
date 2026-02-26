//! Repository for the `tags` and `entity_tags` tables (PRD-47).
//!
//! Provides tag CRUD, entity-tag associations, autocomplete suggestions,
//! bulk operations, and tag-based entity filtering.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::tag::{
    BulkTagResult, Tag, TagFilterLogic, TagInfo, TagListParams, TagSuggestion,
};

/// Column list for `tags` queries.
const TAG_COLUMNS: &str = "\
    id, name, display_name, namespace, color, usage_count, \
    created_by, created_at, updated_at";

/// Default page size for tag listing.
const DEFAULT_LIMIT: i64 = 100;

/// Maximum page size for tag listing.
const MAX_LIMIT: i64 = 500;

/// Default suggestion count for autocomplete.
const DEFAULT_SUGGEST_LIMIT: i64 = 10;

/// Maximum suggestion count for autocomplete.
const MAX_SUGGEST_LIMIT: i64 = 50;

/// Provides CRUD operations for tags and entity-tag associations.
pub struct TagRepo;

impl TagRepo {
    // -----------------------------------------------------------------------
    // Tag CRUD
    // -----------------------------------------------------------------------

    /// Create a tag or return the existing one if the normalized name already exists.
    ///
    /// Uses `ON CONFLICT` for idempotent creation. The `display_name` is updated
    /// on conflict so the most recent casing is preserved.
    pub async fn create_or_get(
        pool: &PgPool,
        display_name: &str,
        color: Option<&str>,
        created_by: Option<DbId>,
    ) -> Result<Tag, sqlx::Error> {
        let normalized = normalize_tag_name(display_name);
        let namespace = extract_namespace(&normalized);

        let query = format!(
            "INSERT INTO tags (name, display_name, namespace, color, created_by) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name \
             RETURNING {TAG_COLUMNS}"
        );
        sqlx::query_as::<_, Tag>(&query)
            .bind(&normalized)
            .bind(display_name)
            .bind(namespace.as_deref())
            .bind(color)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// Find a tag by its ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Tag>, sqlx::Error> {
        let query = format!("SELECT {TAG_COLUMNS} FROM tags WHERE id = $1");
        sqlx::query_as::<_, Tag>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all tags, optionally filtered by namespace, with pagination.
    pub async fn list_all(pool: &PgPool, params: &TagListParams) -> Result<Vec<Tag>, sqlx::Error> {
        let limit = params.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT);
        let offset = params.offset.unwrap_or(0);

        match &params.namespace {
            Some(ns) => {
                let query = format!(
                    "SELECT {TAG_COLUMNS} FROM tags \
                     WHERE namespace = $1 \
                     ORDER BY usage_count DESC, name \
                     LIMIT $2 OFFSET $3"
                );
                sqlx::query_as::<_, Tag>(&query)
                    .bind(ns)
                    .bind(limit)
                    .bind(offset)
                    .fetch_all(pool)
                    .await
            }
            None => {
                let query = format!(
                    "SELECT {TAG_COLUMNS} FROM tags \
                     ORDER BY usage_count DESC, name \
                     LIMIT $1 OFFSET $2"
                );
                sqlx::query_as::<_, Tag>(&query)
                    .bind(limit)
                    .bind(offset)
                    .fetch_all(pool)
                    .await
            }
        }
    }

    /// Autocomplete suggestions: prefix-match on normalized name, sorted by popularity.
    pub async fn suggest(
        pool: &PgPool,
        prefix: &str,
        limit: Option<i64>,
    ) -> Result<Vec<TagSuggestion>, sqlx::Error> {
        let normalized = normalize_tag_name(prefix);
        let limit = limit
            .unwrap_or(DEFAULT_SUGGEST_LIMIT)
            .min(MAX_SUGGEST_LIMIT);
        let pattern = format!("{normalized}%");

        sqlx::query_as::<_, TagSuggestion>(
            "SELECT id, name, display_name, namespace, color, usage_count \
             FROM tags \
             WHERE name LIKE $1 \
             ORDER BY usage_count DESC, name \
             LIMIT $2",
        )
        .bind(&pattern)
        .bind(limit)
        .fetch_all(pool)
        .await
    }

    /// Update a tag's `display_name` and/or `color`.
    ///
    /// Returns `None` if no tag with the given ID exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        display_name: Option<&str>,
        color: Option<&str>,
    ) -> Result<Option<Tag>, sqlx::Error> {
        let query = format!(
            "UPDATE tags SET \
                 display_name = COALESCE($2, display_name), \
                 color = COALESCE($3, color) \
             WHERE id = $1 \
             RETURNING {TAG_COLUMNS}"
        );
        sqlx::query_as::<_, Tag>(&query)
            .bind(id)
            .bind(display_name)
            .bind(color)
            .fetch_optional(pool)
            .await
    }

    /// Delete a tag by ID. Cascade deletes all entity-tag associations.
    ///
    /// Returns `true` if a tag was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM tags WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Entity-tag associations
    // -----------------------------------------------------------------------

    /// Apply a tag to an entity. Idempotent: does nothing if already applied.
    ///
    /// Increments the tag's `usage_count` only when a new association is created.
    pub async fn apply(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
        tag_id: DbId,
        applied_by: Option<DbId>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "INSERT INTO entity_tags (entity_type, entity_id, tag_id, applied_by) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (entity_type, entity_id, tag_id) DO NOTHING",
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(tag_id)
        .bind(applied_by)
        .execute(pool)
        .await?;

        let was_inserted = result.rows_affected() > 0;

        if was_inserted {
            sqlx::query("UPDATE tags SET usage_count = usage_count + 1 WHERE id = $1")
                .bind(tag_id)
                .execute(pool)
                .await?;
        }

        Ok(was_inserted)
    }

    /// Remove a tag from an entity.
    ///
    /// Decrements the tag's `usage_count` only when an association is actually removed.
    pub async fn remove(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
        tag_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM entity_tags \
             WHERE entity_type = $1 AND entity_id = $2 AND tag_id = $3",
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(tag_id)
        .execute(pool)
        .await?;

        let was_deleted = result.rows_affected() > 0;

        if was_deleted {
            sqlx::query("UPDATE tags SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = $1")
                .bind(tag_id)
                .execute(pool)
                .await?;
        }

        Ok(was_deleted)
    }

    /// List all tags for a specific entity.
    pub async fn get_entity_tags(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<Vec<TagInfo>, sqlx::Error> {
        sqlx::query_as::<_, TagInfo>(
            "SELECT t.id, t.name, t.display_name, t.namespace, t.color \
             FROM entity_tags et \
             JOIN tags t ON t.id = et.tag_id \
             WHERE et.entity_type = $1 AND et.entity_id = $2 \
             ORDER BY t.name",
        )
        .bind(entity_type)
        .bind(entity_id)
        .fetch_all(pool)
        .await
    }

    // -----------------------------------------------------------------------
    // Bulk operations
    // -----------------------------------------------------------------------

    /// Apply multiple tags (by name) to multiple entities. Creates tags on first use.
    pub async fn bulk_apply(
        pool: &PgPool,
        entity_type: &str,
        entity_ids: &[DbId],
        tag_names: &[String],
        applied_by: Option<DbId>,
    ) -> Result<BulkTagResult, sqlx::Error> {
        let mut result = BulkTagResult::default();

        for tag_name in tag_names {
            let tag = Self::create_or_get(pool, tag_name, None, applied_by).await?;
            for &entity_id in entity_ids {
                let was_applied =
                    Self::apply(pool, entity_type, entity_id, tag.id, applied_by).await?;
                if was_applied {
                    result.applied += 1;
                }
            }
        }

        Ok(result)
    }

    /// Remove multiple tags from multiple entities.
    pub async fn bulk_remove(
        pool: &PgPool,
        entity_type: &str,
        entity_ids: &[DbId],
        tag_ids: &[DbId],
    ) -> Result<BulkTagResult, sqlx::Error> {
        let mut result = BulkTagResult::default();

        for &tag_id in tag_ids {
            for &entity_id in entity_ids {
                let was_removed = Self::remove(pool, entity_type, entity_id, tag_id).await?;
                if was_removed {
                    result.removed += 1;
                }
            }
        }

        Ok(result)
    }

    // -----------------------------------------------------------------------
    // Tag-based entity filtering
    // -----------------------------------------------------------------------

    /// Filter entities by tag combination (AND or OR logic).
    ///
    /// Returns entity IDs matching the specified tags for the given entity type.
    pub async fn filter_entities(
        pool: &PgPool,
        entity_type: &str,
        tag_ids: &[DbId],
        logic: TagFilterLogic,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<DbId>, sqlx::Error> {
        let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT);
        let offset = offset.unwrap_or(0);
        let tag_count = tag_ids.len() as i64;

        match logic {
            TagFilterLogic::And => {
                // Entity must have ALL specified tags.
                sqlx::query_scalar::<_, DbId>(
                    "SELECT entity_id \
                     FROM entity_tags \
                     WHERE entity_type = $1 AND tag_id = ANY($2) \
                     GROUP BY entity_id \
                     HAVING COUNT(DISTINCT tag_id) = $3 \
                     LIMIT $4 OFFSET $5",
                )
                .bind(entity_type)
                .bind(tag_ids)
                .bind(tag_count)
                .bind(limit)
                .bind(offset)
                .fetch_all(pool)
                .await
            }
            TagFilterLogic::Or => {
                // Entity must have ANY of the specified tags.
                sqlx::query_scalar::<_, DbId>(
                    "SELECT DISTINCT entity_id \
                     FROM entity_tags \
                     WHERE entity_type = $1 AND tag_id = ANY($2) \
                     LIMIT $3 OFFSET $4",
                )
                .bind(entity_type)
                .bind(tag_ids)
                .bind(limit)
                .bind(offset)
                .fetch_all(pool)
                .await
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Normalize a tag name: trim whitespace and lowercase.
fn normalize_tag_name(name: &str) -> String {
    name.trim().to_lowercase()
}

/// Extract the namespace prefix from a tag name (text before the first colon).
///
/// Returns `None` if the name does not contain a colon.
fn extract_namespace(name: &str) -> Option<String> {
    name.split_once(':').map(|(ns, _)| ns.to_string())
}

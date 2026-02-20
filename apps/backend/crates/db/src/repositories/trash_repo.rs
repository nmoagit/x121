//! Repository for cross-table trash / bin operations.
//!
//! Provides a unified view of soft-deleted rows across all entity tables,
//! plus bulk and single-item purge (hard delete) and parent-status checks
//! needed by the restore flow.

use serde::Serialize;
use sqlx::PgPool;
use trulience_core::types::{DbId, Timestamp};

/// Known entity types that support soft-delete.
const KNOWN_ENTITY_TYPES: &[&str] = &[
    "projects",
    "characters",
    "scenes",
    "segments",
    "source_images",
    "derived_images",
    "image_variants",
    "scene_types",
    "scene_video_versions",
];

/// A single soft-deleted item surfaced in the trash list.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct TrashedItem {
    pub id: DbId,
    pub entity_type: String,
    pub name_or_label: Option<String>,
    pub deleted_at: Timestamp,
}

/// Summary returned by [`TrashRepo::list_trashed`].
#[derive(Debug, Clone, Serialize)]
pub struct TrashSummary {
    pub items: Vec<TrashedItem>,
    pub total_count: i64,
}

/// Preview of what a purge-all would remove.
#[derive(Debug, Clone, Serialize)]
pub struct PurgePreview {
    pub counts_by_type: Vec<PurgeCount>,
    pub total_count: i64,
    pub estimated_bytes: Option<i64>,
}

/// Per-entity-type count of soft-deleted rows.
#[derive(Debug, Clone, Serialize)]
pub struct PurgeCount {
    pub entity_type: String,
    pub count: i64,
}

/// Returns `true` if `entity_type` is one of the known types.
pub fn is_known_entity_type(entity_type: &str) -> bool {
    KNOWN_ENTITY_TYPES.contains(&entity_type)
}

/// Provides cross-table trash operations.
pub struct TrashRepo;

impl TrashRepo {
    // ── Listing ───────────────────────────────────────────────────────

    /// List all soft-deleted items across entity tables.
    ///
    /// When `entity_type` is `Some`, only that single table is queried.
    /// Results are ordered by `deleted_at DESC`.
    pub async fn list_trashed(
        pool: &PgPool,
        entity_type: Option<&str>,
    ) -> Result<TrashSummary, sqlx::Error> {
        let items = match entity_type {
            Some(et) => Self::list_trashed_single(pool, et).await?,
            None => Self::list_trashed_all(pool).await?,
        };
        let total_count = items.len() as i64;
        Ok(TrashSummary { items, total_count })
    }

    /// Query a single entity table for soft-deleted rows.
    async fn list_trashed_single(
        pool: &PgPool,
        entity_type: &str,
    ) -> Result<Vec<TrashedItem>, sqlx::Error> {
        let (table, name_expr) = table_and_name_expr(entity_type);
        let sql = format!(
            "SELECT id, '{entity_type}' AS entity_type, {name_expr} AS name_or_label, \
             deleted_at FROM {table} WHERE deleted_at IS NOT NULL \
             ORDER BY deleted_at DESC"
        );
        sqlx::query_as::<_, TrashedItem>(&sql).fetch_all(pool).await
    }

    /// UNION ALL across every entity table for soft-deleted rows.
    async fn list_trashed_all(pool: &PgPool) -> Result<Vec<TrashedItem>, sqlx::Error> {
        let unions: Vec<String> = KNOWN_ENTITY_TYPES
            .iter()
            .map(|et| {
                let (table, name_expr) = table_and_name_expr(et);
                format!(
                    "SELECT id, '{et}' AS entity_type, {name_expr} AS name_or_label, \
                     deleted_at FROM {table} WHERE deleted_at IS NOT NULL"
                )
            })
            .collect();
        let sql = format!("{} ORDER BY deleted_at DESC", unions.join(" UNION ALL "));
        sqlx::query_as::<_, TrashedItem>(&sql).fetch_all(pool).await
    }

    // ── Purge preview ─────────────────────────────────────────────────

    /// Preview what a purge-all would remove: counts per entity type and
    /// estimated bytes from file-bearing tables.
    pub async fn purge_preview(pool: &PgPool) -> Result<PurgePreview, sqlx::Error> {
        let mut counts_by_type = Vec::new();
        let mut total_count: i64 = 0;

        for et in KNOWN_ENTITY_TYPES {
            let (table, _) = table_and_name_expr(et);
            let sql = format!("SELECT COUNT(*) FROM {table} WHERE deleted_at IS NOT NULL");
            let count: (i64,) = sqlx::query_as(&sql).fetch_one(pool).await?;
            if count.0 > 0 {
                counts_by_type.push(PurgeCount {
                    entity_type: (*et).to_string(),
                    count: count.0,
                });
                total_count += count.0;
            }
        }

        // Estimate bytes from scene_video_versions (has file_size_bytes column).
        let bytes: (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(file_size_bytes), 0) \
             FROM scene_video_versions WHERE deleted_at IS NOT NULL",
        )
        .fetch_one(pool)
        .await?;
        let estimated_bytes = if bytes.0 > 0 { Some(bytes.0) } else { None };

        Ok(PurgePreview {
            counts_by_type,
            total_count,
            estimated_bytes,
        })
    }

    // ── Purge (hard delete) ───────────────────────────────────────────

    /// Hard-delete all soft-deleted records across every entity table.
    ///
    /// Deletes leaf entities first to respect foreign-key constraints.
    pub async fn purge_all(pool: &PgPool) -> Result<u64, sqlx::Error> {
        // FK-safe deletion order: leaves first, roots last.
        const PURGE_ORDER: &[&str] = &[
            "segments",
            "scene_video_versions",
            "image_variants",
            "derived_images",
            "source_images",
            "scenes",
            "characters",
            "scene_types",
            "projects",
        ];

        let mut total: u64 = 0;
        for table in PURGE_ORDER {
            let sql = format!("DELETE FROM {table} WHERE deleted_at IS NOT NULL");
            let result = sqlx::query(&sql).execute(pool).await?;
            total += result.rows_affected();
        }
        Ok(total)
    }

    /// Hard-delete a single soft-deleted record.
    ///
    /// Returns `true` if a row was removed, `false` if no matching
    /// soft-deleted row exists.
    pub async fn purge_one(
        pool: &PgPool,
        entity_type: &str,
        id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let (table, _) = table_and_name_expr(entity_type);
        let sql = format!("DELETE FROM {table} WHERE id = $1 AND deleted_at IS NOT NULL");
        let result = sqlx::query(&sql).bind(id).execute(pool).await?;
        Ok(result.rows_affected() > 0)
    }

    // ── Lookup helpers ────────────────────────────────────────────────

    /// Find an entity by id regardless of deleted status.
    ///
    /// Returns a [`TrashedItem`] projection so callers get the id,
    /// entity type, and deleted_at without needing every column.
    pub async fn find_by_id_include_deleted(
        pool: &PgPool,
        entity_type: &str,
        id: DbId,
    ) -> Result<Option<TrashedItem>, sqlx::Error> {
        let (table, name_expr) = table_and_name_expr(entity_type);
        let sql = format!(
            "SELECT id, '{entity_type}' AS entity_type, {name_expr} AS name_or_label, \
             deleted_at FROM {table} WHERE id = $1"
        );
        sqlx::query_as::<_, TrashedItem>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Check whether the parent of a given entity is itself trashed.
    ///
    /// Returns `Some(description)` if the parent is trashed (has a non-NULL
    /// `deleted_at`), or `None` if the parent is live or the entity type
    /// has no parent.
    pub async fn check_parent_trashed(
        pool: &PgPool,
        entity_type: &str,
        id: DbId,
    ) -> Result<Option<String>, sqlx::Error> {
        let check = match entity_type {
            "characters" => Some(("characters", "project_id", "projects", "project")),
            "scenes" => Some(("scenes", "character_id", "characters", "character")),
            "segments" => Some(("segments", "scene_id", "scenes", "scene")),
            "source_images" => Some(("source_images", "character_id", "characters", "character")),
            "derived_images" => Some((
                "derived_images",
                "source_image_id",
                "source_images",
                "source image",
            )),
            "image_variants" => Some((
                "image_variants",
                "derived_image_id",
                "derived_images",
                "derived image",
            )),
            "scene_video_versions" => Some(("scene_video_versions", "scene_id", "scenes", "scene")),
            "scene_types" => Some(("scene_types", "project_id", "projects", "project")),
            // projects have no parent
            _ => None,
        };

        let (child_table, fk_col, parent_table, parent_label) = match check {
            Some(c) => c,
            None => return Ok(None),
        };

        // scene_types.project_id is nullable; if NULL there is no parent to check.
        let sql = format!(
            "SELECT p.deleted_at \
             FROM {child_table} c \
             JOIN {parent_table} p ON p.id = c.{fk_col} \
             WHERE c.id = $1"
        );

        let row: Option<(Option<Timestamp>,)> =
            sqlx::query_as(&sql).bind(id).fetch_optional(pool).await?;

        match row {
            // No parent row found (e.g. scene_types with NULL project_id)
            None => Ok(None),
            // Parent exists but is not trashed
            Some((None,)) => Ok(None),
            // Parent is trashed
            Some((Some(_),)) => Ok(Some(format!(
                "Cannot restore: parent {parent_label} is trashed. Restore the parent first."
            ))),
        }
    }
}

// ── Private helpers ──────────────────────────────────────────────────────

/// Map an entity type name to its database table name and the SQL
/// expression that yields a human-readable name/label column.
fn table_and_name_expr(entity_type: &str) -> (&str, &str) {
    match entity_type {
        "projects" => ("projects", "name"),
        "characters" => ("characters", "name"),
        "scenes" => ("scenes", "NULL::text"),
        "segments" => ("segments", "NULL::text"),
        "source_images" => ("source_images", "description"),
        "derived_images" => ("derived_images", "description"),
        "image_variants" => ("image_variants", "variant_label"),
        "scene_types" => ("scene_types", "name"),
        "scene_video_versions" => ("scene_video_versions", "notes"),
        // Unreachable when callers validate entity_type first
        _ => ("projects", "NULL::text"),
    }
}

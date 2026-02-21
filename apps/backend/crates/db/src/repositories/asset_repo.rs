//! Repository for asset registry tables (PRD-17).
//!
//! Provides CRUD operations for assets, dependency mapping, compatibility notes,
//! and ratings.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::asset::{
    Asset, AssetDependency, AssetNote, AssetRating, AssetSearchParams, AssetStatus, AssetType,
    AssetWithStats, CreateAsset, CreateDependency, CreateNote, RateAsset, RatingSummary,
    UpdateAsset,
};

/// Column list for `assets` queries.
const ASSET_COLUMNS: &str = "\
    id, name, version, asset_type_id, status_id, \
    file_path, file_size_bytes, checksum_sha256, \
    description, metadata, registered_by, \
    created_at, updated_at";

/// Column list for `asset_dependencies` queries.
const DEP_COLUMNS: &str = "\
    id, asset_id, dependent_entity_type, dependent_entity_id, \
    dependency_role, created_at, updated_at";

/// Column list for `asset_notes` queries.
const NOTE_COLUMNS: &str = "\
    id, asset_id, related_asset_id, note_text, severity, \
    author_id, created_at, updated_at";

/// Column list for `asset_ratings` queries.
const RATING_COLUMNS: &str = "\
    id, asset_id, rating, review_text, reviewer_id, \
    created_at, updated_at";

/// Default page size for asset listing.
const DEFAULT_LIMIT: i64 = 50;

/// Maximum page size for asset listing.
const MAX_LIMIT: i64 = 100;

/// Provides CRUD operations for the asset registry.
pub struct AssetRepo;

impl AssetRepo {
    // -----------------------------------------------------------------------
    // Asset CRUD
    // -----------------------------------------------------------------------

    /// Register a new asset. The default status is 'active' (id = 1).
    pub async fn create(
        pool: &PgPool,
        input: &CreateAsset,
        file_size_bytes: i64,
        checksum: &str,
        registered_by: Option<DbId>,
    ) -> Result<Asset, sqlx::Error> {
        let metadata = input
            .metadata
            .as_ref()
            .cloned()
            .unwrap_or(serde_json::json!({}));

        let query = format!(
            "INSERT INTO assets (\
                name, version, asset_type_id, status_id, \
                file_path, file_size_bytes, checksum_sha256, \
                description, metadata, registered_by\
             ) VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9) \
             RETURNING {ASSET_COLUMNS}"
        );
        sqlx::query_as::<_, Asset>(&query)
            .bind(&input.name)
            .bind(&input.version)
            .bind(input.asset_type_id)
            .bind(&input.file_path)
            .bind(file_size_bytes)
            .bind(checksum)
            .bind(input.description.as_deref())
            .bind(&metadata)
            .bind(registered_by)
            .fetch_one(pool)
            .await
    }

    /// Find an asset by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Asset>, sqlx::Error> {
        let query = format!("SELECT {ASSET_COLUMNS} FROM assets WHERE id = $1");
        sqlx::query_as::<_, Asset>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Search assets with optional filters and pagination.
    /// Returns enriched results with aggregate stats.
    pub async fn search(
        pool: &PgPool,
        params: &AssetSearchParams,
    ) -> Result<Vec<AssetWithStats>, sqlx::Error> {
        let limit = params.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT);
        let offset = params.offset.unwrap_or(0);

        // Build dynamic WHERE clauses.
        let mut conditions = Vec::new();
        let mut bind_idx = 1u32;

        if params.name.is_some() {
            conditions.push(format!("a.name ILIKE ${bind_idx}"));
            bind_idx += 1;
        }
        if params.asset_type_id.is_some() {
            conditions.push(format!("a.asset_type_id = ${bind_idx}"));
            bind_idx += 1;
        }
        if params.status_id.is_some() {
            conditions.push(format!("a.status_id = ${bind_idx}"));
            bind_idx += 1;
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let query = format!(
            "SELECT \
                a.id, a.name, a.version, a.asset_type_id, a.status_id, \
                a.file_path, a.file_size_bytes, a.checksum_sha256, \
                a.description, a.metadata, a.registered_by, \
                a.created_at, a.updated_at, \
                COALESCE(AVG(ar.rating)::float8, 0.0) AS avg_rating, \
                COUNT(DISTINCT ar.id) AS rating_count, \
                COUNT(DISTINCT ad.id) AS dependency_count, \
                at.name AS type_name, \
                ast.name AS status_name \
             FROM assets a \
             JOIN asset_types at ON at.id = a.asset_type_id \
             JOIN asset_statuses ast ON ast.id = a.status_id \
             LEFT JOIN asset_ratings ar ON ar.asset_id = a.id \
             LEFT JOIN asset_dependencies ad ON ad.asset_id = a.id \
             {where_clause} \
             GROUP BY a.id, at.name, ast.name \
             ORDER BY a.name, a.version \
             LIMIT ${bind_idx} OFFSET ${next_idx}",
            where_clause = where_clause,
            bind_idx = bind_idx,
            next_idx = bind_idx + 1,
        );

        let mut q = sqlx::query_as::<_, AssetWithStats>(&query);

        // Bind dynamic parameters in order.
        if let Some(ref name) = params.name {
            q = q.bind(format!("%{name}%"));
        }
        if let Some(type_id) = params.asset_type_id {
            q = q.bind(type_id);
        }
        if let Some(status_id) = params.status_id {
            q = q.bind(status_id);
        }

        q = q.bind(limit).bind(offset);
        q.fetch_all(pool).await
    }

    /// Update an existing asset.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateAsset,
    ) -> Result<Option<Asset>, sqlx::Error> {
        let query = format!(
            "UPDATE assets SET \
                name = COALESCE($2, name), \
                version = COALESCE($3, version), \
                status_id = COALESCE($4, status_id), \
                description = COALESCE($5, description), \
                metadata = COALESCE($6, metadata) \
             WHERE id = $1 \
             RETURNING {ASSET_COLUMNS}"
        );
        sqlx::query_as::<_, Asset>(&query)
            .bind(id)
            .bind(input.name.as_deref())
            .bind(input.version.as_deref())
            .bind(input.status_id)
            .bind(input.description.as_deref())
            .bind(input.metadata.as_ref())
            .fetch_optional(pool)
            .await
    }

    /// Delete an asset by ID. Returns true if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM assets WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Verify that an asset exists by ID.
    pub async fn verify_exists(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM assets WHERE id = $1")
            .bind(id)
            .fetch_one(pool)
            .await?;
        Ok(count.0 > 0)
    }

    /// List all asset types.
    pub async fn list_types(pool: &PgPool) -> Result<Vec<AssetType>, sqlx::Error> {
        sqlx::query_as::<_, AssetType>(
            "SELECT id, name, description, created_at, updated_at \
             FROM asset_types ORDER BY name",
        )
        .fetch_all(pool)
        .await
    }

    /// List all asset statuses.
    pub async fn list_statuses(pool: &PgPool) -> Result<Vec<AssetStatus>, sqlx::Error> {
        sqlx::query_as::<_, AssetStatus>(
            "SELECT id, name, description, created_at, updated_at \
             FROM asset_statuses ORDER BY id",
        )
        .fetch_all(pool)
        .await
    }

    // -----------------------------------------------------------------------
    // Dependencies
    // -----------------------------------------------------------------------

    /// Add a dependency link between an asset and an entity.
    pub async fn add_dependency(
        pool: &PgPool,
        asset_id: DbId,
        input: &CreateDependency,
    ) -> Result<AssetDependency, sqlx::Error> {
        let role = input.dependency_role.as_deref().unwrap_or("required");

        let query = format!(
            "INSERT INTO asset_dependencies (\
                asset_id, dependent_entity_type, dependent_entity_id, dependency_role\
             ) VALUES ($1, $2, $3, $4) \
             RETURNING {DEP_COLUMNS}"
        );
        sqlx::query_as::<_, AssetDependency>(&query)
            .bind(asset_id)
            .bind(&input.dependent_entity_type)
            .bind(input.dependent_entity_id)
            .bind(role)
            .fetch_one(pool)
            .await
    }

    /// Get all dependency links for a given asset.
    pub async fn get_dependents(
        pool: &PgPool,
        asset_id: DbId,
    ) -> Result<Vec<AssetDependency>, sqlx::Error> {
        let query = format!(
            "SELECT {DEP_COLUMNS} FROM asset_dependencies \
             WHERE asset_id = $1 ORDER BY created_at"
        );
        sqlx::query_as::<_, AssetDependency>(&query)
            .bind(asset_id)
            .fetch_all(pool)
            .await
    }

    /// Get all assets linked to a specific entity.
    pub async fn get_entity_assets(
        pool: &PgPool,
        entity_type: &str,
        entity_id: DbId,
    ) -> Result<Vec<AssetDependency>, sqlx::Error> {
        let query = format!(
            "SELECT {DEP_COLUMNS} FROM asset_dependencies \
             WHERE dependent_entity_type = $1 AND dependent_entity_id = $2 \
             ORDER BY created_at"
        );
        sqlx::query_as::<_, AssetDependency>(&query)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_all(pool)
            .await
    }

    /// Remove a single dependency link by ID. Returns true if deleted.
    pub async fn remove_dependency(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM asset_dependencies WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Count the number of dependency links for a given asset.
    pub async fn count_dependents(pool: &PgPool, asset_id: DbId) -> Result<i64, sqlx::Error> {
        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM asset_dependencies WHERE asset_id = $1")
                .bind(asset_id)
                .fetch_one(pool)
                .await?;
        Ok(count.0)
    }

    // -----------------------------------------------------------------------
    // Notes
    // -----------------------------------------------------------------------

    /// Add a compatibility note to an asset.
    pub async fn add_note(
        pool: &PgPool,
        asset_id: DbId,
        input: &CreateNote,
        author_id: Option<DbId>,
    ) -> Result<AssetNote, sqlx::Error> {
        let severity = input.severity.as_deref().unwrap_or("info");

        let query = format!(
            "INSERT INTO asset_notes (\
                asset_id, related_asset_id, note_text, severity, author_id\
             ) VALUES ($1, $2, $3, $4, $5) \
             RETURNING {NOTE_COLUMNS}"
        );
        sqlx::query_as::<_, AssetNote>(&query)
            .bind(asset_id)
            .bind(input.related_asset_id)
            .bind(&input.note_text)
            .bind(severity)
            .bind(author_id)
            .fetch_one(pool)
            .await
    }

    /// Get all notes for a specific asset.
    pub async fn get_notes(pool: &PgPool, asset_id: DbId) -> Result<Vec<AssetNote>, sqlx::Error> {
        let query = format!(
            "SELECT {NOTE_COLUMNS} FROM asset_notes \
             WHERE asset_id = $1 ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, AssetNote>(&query)
            .bind(asset_id)
            .fetch_all(pool)
            .await
    }

    /// Get compatibility warnings for a set of asset IDs.
    /// Returns notes with severity 'warning' or 'error'.
    pub async fn get_compatibility_warnings(
        pool: &PgPool,
        asset_ids: &[DbId],
    ) -> Result<Vec<AssetNote>, sqlx::Error> {
        let query = format!(
            "SELECT {NOTE_COLUMNS} FROM asset_notes \
             WHERE asset_id = ANY($1) AND severity IN ('warning', 'error') \
             ORDER BY severity DESC, created_at DESC"
        );
        sqlx::query_as::<_, AssetNote>(&query)
            .bind(asset_ids)
            .fetch_all(pool)
            .await
    }

    /// Delete a note by ID. Returns true if deleted.
    pub async fn delete_note(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM asset_notes WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Ratings
    // -----------------------------------------------------------------------

    /// Rate an asset. Uses upsert so authenticated users can update their rating.
    pub async fn rate(
        pool: &PgPool,
        asset_id: DbId,
        input: &RateAsset,
        reviewer_id: Option<DbId>,
    ) -> Result<AssetRating, sqlx::Error> {
        // For authenticated users, upsert on (asset_id, reviewer_id).
        // For anonymous, always insert.
        if let Some(rid) = reviewer_id {
            let query = format!(
                "INSERT INTO asset_ratings (asset_id, rating, review_text, reviewer_id) \
                 VALUES ($1, $2, $3, $4) \
                 ON CONFLICT (asset_id, reviewer_id) WHERE reviewer_id IS NOT NULL \
                 DO UPDATE SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text \
                 RETURNING {RATING_COLUMNS}"
            );
            sqlx::query_as::<_, AssetRating>(&query)
                .bind(asset_id)
                .bind(input.rating)
                .bind(input.review_text.as_deref())
                .bind(rid)
                .fetch_one(pool)
                .await
        } else {
            let query = format!(
                "INSERT INTO asset_ratings (asset_id, rating, review_text, reviewer_id) \
                 VALUES ($1, $2, $3, NULL) \
                 RETURNING {RATING_COLUMNS}"
            );
            sqlx::query_as::<_, AssetRating>(&query)
                .bind(asset_id)
                .bind(input.rating)
                .bind(input.review_text.as_deref())
                .fetch_one(pool)
                .await
        }
    }

    /// Get rating summary (average + count) for an asset.
    pub async fn get_rating_summary(
        pool: &PgPool,
        asset_id: DbId,
    ) -> Result<RatingSummary, sqlx::Error> {
        let row: (f64, i64) = sqlx::query_as(
            "SELECT COALESCE(AVG(rating)::float8, 0.0), COUNT(*) \
             FROM asset_ratings WHERE asset_id = $1",
        )
        .bind(asset_id)
        .fetch_one(pool)
        .await?;

        Ok(RatingSummary {
            asset_id,
            avg_rating: row.0,
            total_ratings: row.1,
        })
    }

    /// List all ratings for an asset.
    pub async fn list_ratings(
        pool: &PgPool,
        asset_id: DbId,
    ) -> Result<Vec<AssetRating>, sqlx::Error> {
        let query = format!(
            "SELECT {RATING_COLUMNS} FROM asset_ratings \
             WHERE asset_id = $1 ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, AssetRating>(&query)
            .bind(asset_id)
            .fetch_all(pool)
            .await
    }
}

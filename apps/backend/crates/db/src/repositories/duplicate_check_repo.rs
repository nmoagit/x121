//! Repository for the `duplicate_checks` table (PRD-79).

use sqlx::PgPool;
use trulience_core::duplicate_detection;
use trulience_core::types::DbId;

use crate::models::duplicate_check::{CreateDuplicateCheck, DuplicateCheck};
use crate::models::status::StatusId;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "\
    id, status_id, source_character_id, matched_character_id, \
    similarity_score, threshold_used, check_type, resolution, \
    resolved_by, resolved_at, created_at, updated_at";

/// Provides CRUD operations for duplicate checks.
pub struct DuplicateCheckRepo;

impl DuplicateCheckRepo {
    /// Create a new duplicate check record.
    pub async fn create(
        pool: &PgPool,
        body: &CreateDuplicateCheck,
    ) -> Result<DuplicateCheck, sqlx::Error> {
        let status_id = body.status_id.unwrap_or(1); // default: no_match
        let query = format!(
            "INSERT INTO duplicate_checks
                (status_id, source_character_id, matched_character_id,
                 similarity_score, threshold_used, check_type)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DuplicateCheck>(&query)
            .bind(status_id)
            .bind(body.source_character_id)
            .bind(body.matched_character_id)
            .bind(body.similarity_score)
            .bind(body.threshold_used)
            .bind(&body.check_type)
            .fetch_one(pool)
            .await
    }

    /// Find a duplicate check by its primary key.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<DuplicateCheck, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM duplicate_checks WHERE id = $1"
        );
        sqlx::query_as::<_, DuplicateCheck>(&query)
            .bind(id)
            .fetch_one(pool)
            .await
    }

    /// List duplicate checks for a specific source character.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
        limit: i64,
    ) -> Result<Vec<DuplicateCheck>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM duplicate_checks
             WHERE source_character_id = $1
             ORDER BY created_at DESC
             LIMIT $2"
        );
        sqlx::query_as::<_, DuplicateCheck>(&query)
            .bind(character_id)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// List pending duplicate checks (status = match_found).
    pub async fn list_pending(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<DuplicateCheck>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM duplicate_checks
             WHERE status_id = $1
             ORDER BY created_at DESC
             LIMIT $2"
        );
        sqlx::query_as::<_, DuplicateCheck>(&query)
            .bind(duplicate_detection::STATUS_MATCH_FOUND_ID)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// Resolve a duplicate check (set resolution, status, and resolver).
    pub async fn resolve(
        pool: &PgPool,
        id: DbId,
        resolution: &str,
        status_id: StatusId,
        resolved_by: DbId,
    ) -> Result<DuplicateCheck, sqlx::Error> {
        let query = format!(
            "UPDATE duplicate_checks SET
                resolution  = $1,
                status_id   = $2,
                resolved_by = $3,
                resolved_at = NOW(),
                updated_at  = NOW()
             WHERE id = $4
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DuplicateCheck>(&query)
            .bind(resolution)
            .bind(status_id)
            .bind(resolved_by)
            .bind(id)
            .fetch_one(pool)
            .await
    }

    /// List duplicate check history with pagination.
    pub async fn list_history(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<DuplicateCheck>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM duplicate_checks
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, DuplicateCheck>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }
}

//! Repository for the `refinement_jobs` table (PRD-125).

use sqlx::PgPool;
use x121_core::llm_refinement::{STATUS_QUEUED, STATUS_RUNNING};
use x121_core::types::DbId;

use crate::models::refinement_job::{CreateRefinementJob, RefinementJob};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "\
    id, uuid, character_id, status, source_bio, source_tov, \
    llm_provider, llm_model, enrich, iterations, \
    final_metadata, final_report, error, metadata_version_id, \
    created_at, updated_at, deleted_at";

/// Provides CRUD operations for LLM refinement jobs.
pub struct RefinementJobRepo;

impl RefinementJobRepo {
    /// Insert a new refinement job in `queued` status.
    pub async fn create(
        pool: &PgPool,
        input: &CreateRefinementJob,
    ) -> Result<RefinementJob, sqlx::Error> {
        let query = format!(
            "INSERT INTO refinement_jobs \
                (character_id, source_bio, source_tov, llm_provider, llm_model, enrich) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, RefinementJob>(&query)
            .bind(input.character_id)
            .bind(&input.source_bio)
            .bind(&input.source_tov)
            .bind(&input.llm_provider)
            .bind(&input.llm_model)
            .bind(input.enrich)
            .fetch_one(pool)
            .await
    }

    /// Find a refinement job by internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<RefinementJob>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM refinement_jobs WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, RefinementJob>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a refinement job by UUID. Excludes soft-deleted rows.
    pub async fn find_by_uuid(
        pool: &PgPool,
        uuid: sqlx::types::Uuid,
    ) -> Result<Option<RefinementJob>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM refinement_jobs WHERE uuid = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, RefinementJob>(&query)
            .bind(uuid)
            .fetch_optional(pool)
            .await
    }

    /// List all refinement jobs for a character, ordered by created_at DESC.
    /// Excludes soft-deleted rows.
    pub async fn list_for_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<RefinementJob>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM refinement_jobs \
             WHERE character_id = $1 AND deleted_at IS NULL \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, RefinementJob>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// Check whether a `queued` or `running` job already exists for a character.
    pub async fn has_active_job(pool: &PgPool, character_id: DbId) -> Result<bool, sqlx::Error> {
        let row: (bool,) = sqlx::query_as(
            "SELECT EXISTS(\
                SELECT 1 FROM refinement_jobs \
                WHERE character_id = $1 \
                  AND status IN ($2, $3) \
                  AND deleted_at IS NULL\
            )",
        )
        .bind(character_id)
        .bind(STATUS_QUEUED)
        .bind(STATUS_RUNNING)
        .fetch_one(pool)
        .await?;
        Ok(row.0)
    }

    /// Update the status of a refinement job, optionally setting an error message.
    /// Returns `true` if a row was updated.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status: &str,
        error: Option<&str>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE refinement_jobs \
             SET status = $2, error = COALESCE($3, error) \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(status)
        .bind(error)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Store the final result of a refinement run.
    /// Returns `true` if a row was updated.
    pub async fn set_result(
        pool: &PgPool,
        id: DbId,
        final_metadata: &serde_json::Value,
        final_report: &serde_json::Value,
        metadata_version_id: Option<DbId>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE refinement_jobs \
             SET final_metadata = $2, final_report = $3, \
                 metadata_version_id = $4, status = $5 \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(final_metadata)
        .bind(final_report)
        .bind(metadata_version_id)
        .bind(x121_core::llm_refinement::STATUS_COMPLETED)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Append an iteration object to the `iterations` JSONB array.
    /// Returns `true` if a row was updated.
    pub async fn append_iteration(
        pool: &PgPool,
        id: DbId,
        iteration: &serde_json::Value,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE refinement_jobs \
             SET iterations = iterations || $2::jsonb \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(iteration)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Soft-delete a refinement job. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE refinement_jobs SET deleted_at = NOW() \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}

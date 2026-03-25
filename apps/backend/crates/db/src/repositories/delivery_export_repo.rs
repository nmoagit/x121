//! Repository for the `delivery_exports` table (PRD-39).

use sqlx::PgPool;
use x121_core::assembly::{EXPORT_STATUS_ID_COMPLETED, EXPORT_STATUS_ID_FAILED};
use x121_core::types::DbId;

use crate::models::delivery_export::{CreateDeliveryExport, DeliveryExport};
use crate::models::status::StatusId;

const COLUMNS: &str = "id, project_id, format_profile_id, status_id, exported_by, \
     include_watermark, characters_json, file_path, file_size_bytes, \
     validation_results_json, error_message, started_at, completed_at, \
     created_at, updated_at";

/// Provides CRUD operations for delivery exports.
pub struct DeliveryExportRepo;

impl DeliveryExportRepo {
    /// Insert a new delivery export record.
    pub async fn create(
        pool: &PgPool,
        input: &CreateDeliveryExport,
    ) -> Result<DeliveryExport, sqlx::Error> {
        let query = format!(
            "INSERT INTO delivery_exports \
                (project_id, format_profile_id, exported_by, include_watermark, characters_json) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DeliveryExport>(&query)
            .bind(input.project_id)
            .bind(input.format_profile_id)
            .bind(input.exported_by)
            .bind(input.include_watermark)
            .bind(&input.avatars_json)
            .fetch_one(pool)
            .await
    }

    /// Atomically claim the oldest pending export by setting its status to assembling.
    ///
    /// Uses `FOR UPDATE SKIP LOCKED` to prevent double-processing when multiple
    /// server instances are running.
    pub async fn claim_next_pending(pool: &PgPool) -> Result<Option<DeliveryExport>, sqlx::Error> {
        let pending = x121_core::assembly::EXPORT_STATUS_ID_PENDING;
        let assembling = x121_core::assembly::EXPORT_STATUS_ID_ASSEMBLING;
        let query = format!(
            "UPDATE delivery_exports SET status_id = {assembling}, started_at = NOW() \
             WHERE id = ( \
                SELECT id FROM delivery_exports \
                WHERE status_id = {pending} \
                ORDER BY created_at ASC \
                LIMIT 1 \
                FOR UPDATE SKIP LOCKED \
             ) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DeliveryExport>(&query)
            .fetch_optional(pool)
            .await
    }

    /// Find a delivery export by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<DeliveryExport>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM delivery_exports WHERE id = $1");
        sqlx::query_as::<_, DeliveryExport>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List delivery exports for a project, ordered by most recent first.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<DeliveryExport>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM delivery_exports \
             WHERE project_id = $1 \
             ORDER BY created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, DeliveryExport>(&query)
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Update the status of a delivery export, optionally setting an error message.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
        error_message: Option<&str>,
    ) -> Result<Option<DeliveryExport>, sqlx::Error> {
        let query = format!(
            "UPDATE delivery_exports SET \
                status_id = $2, \
                error_message = COALESCE($3, error_message), \
                started_at = CASE WHEN started_at IS NULL AND $2 > 1 THEN NOW() ELSE started_at END \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DeliveryExport>(&query)
            .bind(id)
            .bind(status_id)
            .bind(error_message)
            .fetch_optional(pool)
            .await
    }

    /// Mark a delivery export as completed with the output file info.
    pub async fn mark_completed(
        pool: &PgPool,
        id: DbId,
        file_path: &str,
        file_size_bytes: i64,
    ) -> Result<Option<DeliveryExport>, sqlx::Error> {
        let completed = EXPORT_STATUS_ID_COMPLETED;
        let query = format!(
            "UPDATE delivery_exports SET \
                status_id = {completed}, \
                file_path = $2, \
                file_size_bytes = $3, \
                completed_at = NOW() \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DeliveryExport>(&query)
            .bind(id)
            .bind(file_path)
            .bind(file_size_bytes)
            .fetch_optional(pool)
            .await
    }

    /// Mark a delivery export as failed with an error message.
    pub async fn mark_failed(
        pool: &PgPool,
        id: DbId,
        error_message: &str,
    ) -> Result<Option<DeliveryExport>, sqlx::Error> {
        let failed = EXPORT_STATUS_ID_FAILED;
        let query = format!(
            "UPDATE delivery_exports SET \
                status_id = {failed}, \
                error_message = $2, \
                completed_at = NOW() \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DeliveryExport>(&query)
            .bind(id)
            .bind(error_message)
            .fetch_optional(pool)
            .await
    }

    /// Compute per-avatar delivery status for a project.
    ///
    /// Joins avatars with completed delivery exports to determine
    /// which avatars have been delivered, which need re-delivery
    /// (updated_at > last export), and which have never been delivered.
    ///
    /// Only considers exports where the avatar was actually included
    /// (`avatars_json IS NULL` means all, otherwise checks the JSON array).
    pub async fn delivery_status_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<crate::models::delivery_export::AvatarDeliveryStatus>, sqlx::Error> {
        let completed = EXPORT_STATUS_ID_COMPLETED;
        sqlx::query_as::<_, crate::models::delivery_export::AvatarDeliveryStatus>(&format!(
            "SELECT \
                    c.id AS avatar_id, \
                    c.name AS avatar_name, \
                    CASE \
                        WHEN de.completed_at IS NULL THEN 'not_delivered' \
                        WHEN c.updated_at > de.completed_at THEN 'needs_redelivery' \
                        ELSE 'delivered' \
                    END AS status, \
                    de.completed_at AS last_delivered_at, \
                    de.id AS export_id \
                 FROM avatars c \
                 LEFT JOIN LATERAL ( \
                    SELECT id, completed_at \
                    FROM delivery_exports \
                    WHERE project_id = $1 \
                      AND status_id = {completed} \
                      AND (characters_json IS NULL OR characters_json @> to_jsonb(c.id)) \
                    ORDER BY completed_at DESC \
                    LIMIT 1 \
                 ) de ON TRUE \
                 WHERE c.project_id = $1 AND c.deleted_at IS NULL \
                 ORDER BY c.name"
        ))
        .bind(project_id)
        .fetch_all(pool)
        .await
    }

    /// Store validation results JSON on a delivery export.
    pub async fn set_validation_results(
        pool: &PgPool,
        id: DbId,
        results_json: &serde_json::Value,
    ) -> Result<Option<DeliveryExport>, sqlx::Error> {
        let query = format!(
            "UPDATE delivery_exports SET \
                validation_results_json = $2 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DeliveryExport>(&query)
            .bind(id)
            .bind(results_json)
            .fetch_optional(pool)
            .await
    }
}

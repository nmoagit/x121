//! Repository for the `delivery_destinations` table (PRD-039 Amendment A.1).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::delivery_destination::{
    CreateDeliveryDestination, DeliveryDestination, UpdateDeliveryDestination,
};

const COLUMNS: &str = "id, project_id, destination_type_id, label, config, \
     is_enabled, deleted_at, created_at, updated_at";

/// Provides CRUD operations for delivery destinations.
pub struct DeliveryDestinationRepo;

impl DeliveryDestinationRepo {
    /// List active (non-deleted) destinations for a project.
    pub async fn list_for_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<DeliveryDestination>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM delivery_destinations \
             WHERE project_id = $1 AND deleted_at IS NULL \
             ORDER BY created_at ASC"
        );
        sqlx::query_as::<_, DeliveryDestination>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Find a single destination by ID (excludes soft-deleted).
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<DeliveryDestination>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM delivery_destinations \
             WHERE id = $1 AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, DeliveryDestination>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Insert a new delivery destination.
    pub async fn create(
        pool: &PgPool,
        input: &CreateDeliveryDestination,
    ) -> Result<DeliveryDestination, sqlx::Error> {
        let query = format!(
            "INSERT INTO delivery_destinations \
                (project_id, destination_type_id, label, config, is_enabled) \
             VALUES ($1, $2, $3, COALESCE($4, '{{}}'::jsonb), COALESCE($5, true)) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DeliveryDestination>(&query)
            .bind(input.project_id)
            .bind(input.destination_type_id)
            .bind(&input.label)
            .bind(&input.config)
            .bind(input.is_enabled)
            .fetch_one(pool)
            .await
    }

    /// Update a delivery destination. Only non-`None` fields are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateDeliveryDestination,
    ) -> Result<Option<DeliveryDestination>, sqlx::Error> {
        let query = format!(
            "UPDATE delivery_destinations SET \
                label = COALESCE($2, label), \
                destination_type_id = COALESCE($3, destination_type_id), \
                config = COALESCE($4, config), \
                is_enabled = COALESCE($5, is_enabled), \
                updated_at = NOW() \
             WHERE id = $1 AND deleted_at IS NULL \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DeliveryDestination>(&query)
            .bind(id)
            .bind(&input.label)
            .bind(input.destination_type_id)
            .bind(&input.config)
            .bind(input.is_enabled)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a delivery destination. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE delivery_destinations SET deleted_at = NOW() \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}

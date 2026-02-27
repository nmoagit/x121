//! Repository for the `video_spec_requirements` table (PRD-113).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::video_spec::{
    CreateVideoSpecRequirement, UpdateVideoSpecRequirement, VideoSpecRequirement,
};

/// Column list shared across queries.
const COLUMNS: &str =
    "id, project_id, scene_type_id, name, framerate, min_duration_secs, max_duration_secs, \
     width, height, codec, container, max_file_size_bytes, is_active, created_at, updated_at";

/// CRUD operations for video spec requirements.
pub struct VideoSpecRequirementRepo;

impl VideoSpecRequirementRepo {
    /// Insert a new spec requirement, returning the created row.
    ///
    /// Numeric `f64` inputs are cast to text then to NUMERIC to avoid
    /// needing the `bigdecimal` feature.
    pub async fn create(
        pool: &PgPool,
        input: &CreateVideoSpecRequirement,
    ) -> Result<VideoSpecRequirement, sqlx::Error> {
        let framerate_str = input.framerate.map(|v| v.to_string());
        let min_dur_str = input.min_duration_secs.map(|v| v.to_string());
        let max_dur_str = input.max_duration_secs.map(|v| v.to_string());

        let query = format!(
            "INSERT INTO video_spec_requirements
                 (project_id, scene_type_id, name, framerate, min_duration_secs, max_duration_secs,
                  width, height, codec, container, max_file_size_bytes)
             VALUES ($1, $2, $3,
                     $4::TEXT::NUMERIC, $5::TEXT::NUMERIC, $6::TEXT::NUMERIC,
                     $7, $8, $9, $10, $11)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, VideoSpecRequirement>(&query)
            .bind(input.project_id)
            .bind(input.scene_type_id)
            .bind(&input.name)
            .bind(&framerate_str)
            .bind(&min_dur_str)
            .bind(&max_dur_str)
            .bind(input.width)
            .bind(input.height)
            .bind(&input.codec)
            .bind(&input.container)
            .bind(input.max_file_size_bytes)
            .fetch_one(pool)
            .await
    }

    /// Find a spec requirement by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<VideoSpecRequirement>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM video_spec_requirements WHERE id = $1");
        sqlx::query_as::<_, VideoSpecRequirement>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List active specs, optionally filtered by project and/or scene type.
    pub async fn list_active(
        pool: &PgPool,
        project_id: Option<DbId>,
        scene_type_id: Option<DbId>,
    ) -> Result<Vec<VideoSpecRequirement>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM video_spec_requirements
             WHERE is_active = true
               AND ($1::BIGINT IS NULL OR project_id = $1 OR project_id IS NULL)
               AND ($2::BIGINT IS NULL OR scene_type_id = $2 OR scene_type_id IS NULL)
             ORDER BY name ASC"
        );
        sqlx::query_as::<_, VideoSpecRequirement>(&query)
            .bind(project_id)
            .bind(scene_type_id)
            .fetch_all(pool)
            .await
    }

    /// Update a spec requirement. Only non-`None` fields are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateVideoSpecRequirement,
    ) -> Result<Option<VideoSpecRequirement>, sqlx::Error> {
        let framerate_str = input.framerate.map(|v| v.to_string());
        let min_dur_str = input.min_duration_secs.map(|v| v.to_string());
        let max_dur_str = input.max_duration_secs.map(|v| v.to_string());

        let query = format!(
            "UPDATE video_spec_requirements SET
                name = COALESCE($2, name),
                framerate = COALESCE($3::TEXT::NUMERIC, framerate),
                min_duration_secs = COALESCE($4::TEXT::NUMERIC, min_duration_secs),
                max_duration_secs = COALESCE($5::TEXT::NUMERIC, max_duration_secs),
                width = COALESCE($6, width),
                height = COALESCE($7, height),
                codec = COALESCE($8, codec),
                container = COALESCE($9, container),
                max_file_size_bytes = COALESCE($10, max_file_size_bytes),
                is_active = COALESCE($11, is_active)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, VideoSpecRequirement>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&framerate_str)
            .bind(&min_dur_str)
            .bind(&max_dur_str)
            .bind(input.width)
            .bind(input.height)
            .bind(&input.codec)
            .bind(&input.container)
            .bind(input.max_file_size_bytes)
            .bind(input.is_active)
            .fetch_optional(pool)
            .await
    }

    /// Delete a spec requirement by ID. Returns true if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM video_spec_requirements WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

//! Repository for the `output_format_profiles` table (PRD-39).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::output_format_profile::{
    CreateOutputFormatProfile, OutputFormatProfile, UpdateOutputFormatProfile,
};

const COLUMNS: &str = "id, name, description, resolution, codec, container, \
     bitrate_kbps, framerate, pixel_format, extra_ffmpeg_args, created_at, updated_at";

/// Provides CRUD operations for output format profiles.
pub struct OutputFormatProfileRepo;

impl OutputFormatProfileRepo {
    /// Insert a new output format profile, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateOutputFormatProfile,
    ) -> Result<OutputFormatProfile, sqlx::Error> {
        let query = format!(
            "INSERT INTO output_format_profiles \
                (name, description, resolution, codec, container, \
                 bitrate_kbps, framerate, pixel_format, extra_ffmpeg_args) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, OutputFormatProfile>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.resolution)
            .bind(&input.codec)
            .bind(&input.container)
            .bind(input.bitrate_kbps)
            .bind(input.framerate)
            .bind(&input.pixel_format)
            .bind(&input.extra_ffmpeg_args)
            .fetch_one(pool)
            .await
    }

    /// Find an output format profile by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<OutputFormatProfile>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM output_format_profiles WHERE id = $1");
        sqlx::query_as::<_, OutputFormatProfile>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find an output format profile by name.
    pub async fn find_by_name(
        pool: &PgPool,
        name: &str,
    ) -> Result<Option<OutputFormatProfile>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM output_format_profiles WHERE name = $1");
        sqlx::query_as::<_, OutputFormatProfile>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    /// List all output format profiles, ordered by name.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<OutputFormatProfile>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM output_format_profiles ORDER BY name ASC");
        sqlx::query_as::<_, OutputFormatProfile>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update a profile. Only non-`None` fields are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateOutputFormatProfile,
    ) -> Result<Option<OutputFormatProfile>, sqlx::Error> {
        let query = format!(
            "UPDATE output_format_profiles SET \
                name = COALESCE($2, name), \
                description = COALESCE($3, description), \
                resolution = COALESCE($4, resolution), \
                codec = COALESCE($5, codec), \
                container = COALESCE($6, container), \
                bitrate_kbps = COALESCE($7, bitrate_kbps), \
                framerate = COALESCE($8, framerate), \
                pixel_format = COALESCE($9, pixel_format), \
                extra_ffmpeg_args = COALESCE($10, extra_ffmpeg_args) \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, OutputFormatProfile>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.resolution)
            .bind(&input.codec)
            .bind(&input.container)
            .bind(input.bitrate_kbps)
            .bind(input.framerate)
            .bind(&input.pixel_format)
            .bind(&input.extra_ffmpeg_args)
            .fetch_optional(pool)
            .await
    }

    /// Hard-delete a profile by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM output_format_profiles WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

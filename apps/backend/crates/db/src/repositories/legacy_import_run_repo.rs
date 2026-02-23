//! Repository for the `legacy_import_runs` table (PRD-86).

use sqlx::PgPool;
use trulience_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use trulience_core::types::DbId;

use crate::models::legacy_import_run::{
    CreateLegacyImportRun, LegacyImportRun, UpdateLegacyImportRun,
};

/// Column list for legacy_import_runs queries.
const COLUMNS: &str = "id, status_id, source_path, project_id, mapping_config, match_key, \
    total_files, characters_created, characters_updated, scenes_registered, \
    images_registered, duplicates_found, errors, gap_report, initiated_by, \
    created_at, updated_at";

/// Provides CRUD operations for legacy import runs.
pub struct LegacyImportRunRepo;

impl LegacyImportRunRepo {
    /// Create a new import run, returning the created row.
    ///
    /// The initial status is set to "scanning" (status_id looked up by name).
    pub async fn create(
        pool: &PgPool,
        user_id: DbId,
        input: &CreateLegacyImportRun,
    ) -> Result<LegacyImportRun, sqlx::Error> {
        let mapping_config = input
            .mapping_config
            .clone()
            .unwrap_or_else(|| serde_json::json!({}));
        let match_key = input.match_key.as_deref().unwrap_or("name");

        let query = format!(
            "INSERT INTO legacy_import_runs
                (status_id, source_path, project_id, mapping_config, match_key, initiated_by)
             VALUES (
                (SELECT id FROM legacy_import_run_statuses WHERE name = 'scanning'),
                $1, $2, $3, $4, $5
             )
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, LegacyImportRun>(&query)
            .bind(&input.source_path)
            .bind(input.project_id)
            .bind(&mapping_config)
            .bind(match_key)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }

    /// Find an import run by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<LegacyImportRun>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM legacy_import_runs WHERE id = $1");
        sqlx::query_as::<_, LegacyImportRun>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Update the status of an import run by name.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_name: &str,
    ) -> Result<Option<LegacyImportRun>, sqlx::Error> {
        let query = format!(
            "UPDATE legacy_import_runs SET
                status_id = (SELECT id FROM legacy_import_run_statuses WHERE name = $2)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, LegacyImportRun>(&query)
            .bind(id)
            .bind(status_name)
            .fetch_optional(pool)
            .await
    }

    /// Update the counter fields of an import run.
    pub async fn update_counts(
        pool: &PgPool,
        id: DbId,
        total_files: i32,
        characters_created: i32,
        characters_updated: i32,
        scenes_registered: i32,
        images_registered: i32,
        duplicates_found: i32,
        errors: i32,
    ) -> Result<Option<LegacyImportRun>, sqlx::Error> {
        let query = format!(
            "UPDATE legacy_import_runs SET
                total_files = $2,
                characters_created = $3,
                characters_updated = $4,
                scenes_registered = $5,
                images_registered = $6,
                duplicates_found = $7,
                errors = $8
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, LegacyImportRun>(&query)
            .bind(id)
            .bind(total_files)
            .bind(characters_created)
            .bind(characters_updated)
            .bind(scenes_registered)
            .bind(images_registered)
            .bind(duplicates_found)
            .bind(errors)
            .fetch_optional(pool)
            .await
    }

    /// Update the gap report JSON for an import run.
    pub async fn update_gap_report(
        pool: &PgPool,
        id: DbId,
        gap_report: &serde_json::Value,
    ) -> Result<Option<LegacyImportRun>, sqlx::Error> {
        let query = format!(
            "UPDATE legacy_import_runs SET gap_report = $2
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, LegacyImportRun>(&query)
            .bind(id)
            .bind(gap_report)
            .fetch_optional(pool)
            .await
    }

    /// Update mapping config and match key.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateLegacyImportRun,
    ) -> Result<Option<LegacyImportRun>, sqlx::Error> {
        let query = format!(
            "UPDATE legacy_import_runs SET
                mapping_config = COALESCE($2, mapping_config),
                match_key = COALESCE($3, match_key)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, LegacyImportRun>(&query)
            .bind(id)
            .bind(&input.mapping_config)
            .bind(&input.match_key)
            .fetch_optional(pool)
            .await
    }

    /// List import runs for a project, newest first.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<LegacyImportRun>, sqlx::Error> {
        let limit = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset = clamp_offset(offset);
        let query = format!(
            "SELECT {COLUMNS} FROM legacy_import_runs
             WHERE project_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, LegacyImportRun>(&query)
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }
}

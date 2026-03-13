//! Repository for the `production_runs` and `production_run_cells` tables (PRD-57).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::production_run::{
    CreateProductionRun, CreateProductionRunCell, ProductionRun, ProductionRunCell,
    ProductionRunMatrixCell,
};

const COLUMNS: &str = "id, project_id, name, description, matrix_config, status_id, \
     total_cells, completed_cells, failed_cells, estimated_gpu_hours, estimated_disk_gb, \
     created_by_id, started_at, completed_at, created_at, updated_at";

const CELL_COLUMNS: &str = "id, run_id, character_id, scene_type_id, track_id, variant_label, \
     status_id, scene_id, job_id, blocking_reason, error_message, created_at, updated_at";

/// Provides CRUD operations for production runs and cells.
pub struct ProductionRunRepo;

impl ProductionRunRepo {
    // -----------------------------------------------------------------------
    // Production Run CRUD
    // -----------------------------------------------------------------------

    /// Insert a new production run.
    pub async fn create(
        pool: &PgPool,
        input: &CreateProductionRun,
    ) -> Result<ProductionRun, sqlx::Error> {
        let query = format!(
            "INSERT INTO production_runs \
                (project_id, name, description, matrix_config, total_cells, \
                 estimated_gpu_hours, estimated_disk_gb, created_by_id) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(input.project_id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.matrix_config)
            .bind(input.total_cells)
            .bind(input.estimated_gpu_hours)
            .bind(input.estimated_disk_gb)
            .bind(input.created_by_id)
            .fetch_one(pool)
            .await
    }

    /// Find a production run by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<ProductionRun>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM production_runs WHERE id = $1");
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List production runs for a project, ordered by most recent first.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ProductionRun>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM production_runs \
             WHERE project_id = $1 \
             ORDER BY created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Count production runs that are in-progress across all projects.
    pub async fn active_run_count(pool: &PgPool) -> Result<i64, sqlx::Error> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM production_runs WHERE status_id = $1")
                .bind(x121_core::batch_production::RUN_STATUS_ID_IN_PROGRESS)
                .fetch_one(pool)
                .await?;
        Ok(row.0)
    }

    /// Count production runs for a project.
    pub async fn count_by_project(pool: &PgPool, project_id: DbId) -> Result<i64, sqlx::Error> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM production_runs WHERE project_id = $1")
                .bind(project_id)
                .fetch_one(pool)
                .await?;
        Ok(row.0)
    }

    /// Update the status of a production run.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: DbId,
    ) -> Result<Option<ProductionRun>, sqlx::Error> {
        let query = format!(
            "UPDATE production_runs SET \
                status_id = $2, \
                started_at = CASE WHEN started_at IS NULL AND $2 > 1 THEN NOW() ELSE started_at END \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(id)
            .bind(status_id)
            .fetch_optional(pool)
            .await
    }

    /// Mark a production run as completed.
    pub async fn mark_completed(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ProductionRun>, sqlx::Error> {
        let query = format!(
            "UPDATE production_runs SET \
                status_id = $2, \
                completed_at = NOW() \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(id)
            .bind(x121_core::batch_production::RUN_STATUS_ID_COMPLETED)
            .fetch_optional(pool)
            .await
    }

    /// Delete a production run by ID. Returns true if deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM production_runs WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Set the total_cells count to an exact value.
    pub async fn set_total_cells(pool: &PgPool, id: DbId, count: i32) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE production_runs SET total_cells = $2 WHERE id = $1")
            .bind(id)
            .bind(count)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Update the matrix_config JSON on a production run.
    pub async fn update_matrix_config(
        pool: &PgPool,
        id: DbId,
        config: serde_json::Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE production_runs SET matrix_config = $2 WHERE id = $1")
            .bind(id)
            .bind(config)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Set the completed_cells count to an exact value.
    pub async fn set_completed_cells(
        pool: &PgPool,
        id: DbId,
        count: i32,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE production_runs SET completed_cells = $2 WHERE id = $1")
            .bind(id)
            .bind(count)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Increment the completed_cells count by 1 and return the updated run.
    pub async fn increment_completed(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ProductionRun>, sqlx::Error> {
        let query = format!(
            "UPDATE production_runs SET \
                completed_cells = completed_cells + 1 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Increment the failed_cells count by 1 and return the updated run.
    pub async fn increment_failed(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ProductionRun>, sqlx::Error> {
        let query = format!(
            "UPDATE production_runs SET \
                failed_cells = failed_cells + 1 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRun>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Production Run Cell CRUD
    // -----------------------------------------------------------------------

    /// Insert a new production run cell.
    pub async fn create_cell(
        pool: &PgPool,
        input: &CreateProductionRunCell,
    ) -> Result<ProductionRunCell, sqlx::Error> {
        let query = format!(
            "INSERT INTO production_run_cells \
                (run_id, character_id, scene_type_id, track_id, variant_label) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {CELL_COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(input.run_id)
            .bind(input.character_id)
            .bind(input.scene_type_id)
            .bind(input.track_id)
            .bind(&input.variant_label)
            .fetch_one(pool)
            .await
    }

    /// Batch-insert multiple cells for a production run.
    pub async fn create_cells_batch(
        pool: &PgPool,
        cells: &[CreateProductionRunCell],
    ) -> Result<Vec<ProductionRunCell>, sqlx::Error> {
        if cells.is_empty() {
            return Ok(vec![]);
        }

        // Build a multi-row INSERT using unnest for efficiency.
        let run_ids: Vec<DbId> = cells.iter().map(|c| c.run_id).collect();
        let char_ids: Vec<DbId> = cells.iter().map(|c| c.character_id).collect();
        let st_ids: Vec<DbId> = cells.iter().map(|c| c.scene_type_id).collect();
        let track_ids: Vec<Option<DbId>> = cells.iter().map(|c| c.track_id).collect();
        let labels: Vec<String> = cells.iter().map(|c| c.variant_label.clone()).collect();

        let query = format!(
            "INSERT INTO production_run_cells \
                (run_id, character_id, scene_type_id, track_id, variant_label) \
             SELECT * FROM UNNEST($1::bigint[], $2::bigint[], $3::bigint[], $4::bigint[], $5::text[]) \
             RETURNING {CELL_COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(&run_ids)
            .bind(&char_ids)
            .bind(&st_ids)
            .bind(&track_ids)
            .bind(&labels)
            .fetch_all(pool)
            .await
    }

    /// List all cells for a production run.
    pub async fn list_cells_by_run(
        pool: &PgPool,
        run_id: DbId,
    ) -> Result<Vec<ProductionRunCell>, sqlx::Error> {
        let query = format!(
            "SELECT {CELL_COLUMNS} FROM production_run_cells \
             WHERE run_id = $1 \
             ORDER BY character_id, scene_type_id, variant_label"
        );
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(run_id)
            .fetch_all(pool)
            .await
    }

    /// List cells for a production run with scene type and track names (for matrix view).
    pub async fn list_matrix_cells(
        pool: &PgPool,
        run_id: DbId,
    ) -> Result<Vec<ProductionRunMatrixCell>, sqlx::Error> {
        sqlx::query_as::<_, ProductionRunMatrixCell>(
            "SELECT prc.id, prc.run_id, prc.character_id, prc.scene_type_id, prc.track_id, \
                    prc.variant_label, prc.status_id, prc.scene_id, prc.job_id, \
                    prc.blocking_reason, prc.error_message, prc.created_at, prc.updated_at, \
                    st.name AS scene_type_name, \
                    t.name AS track_name, \
                    CASE WHEN prc.track_id IS NOT NULL THEN \
                        EXISTS ( \
                            SELECT 1 FROM image_variants iv \
                            WHERE iv.character_id = prc.character_id \
                              AND LOWER(iv.variant_type) = LOWER(t.slug) \
                              AND iv.deleted_at IS NULL \
                        ) \
                    ELSE \
                        EXISTS ( \
                            SELECT 1 FROM image_variants iv \
                            WHERE iv.character_id = prc.character_id \
                              AND iv.deleted_at IS NULL \
                        ) \
                    END AS has_seed, \
                    st.has_clothes_off_transition \
             FROM production_run_cells prc \
             JOIN scene_types st ON st.id = prc.scene_type_id \
             LEFT JOIN tracks t ON t.id = prc.track_id \
             WHERE prc.run_id = $1 \
             ORDER BY prc.character_id, st.name, t.name NULLS FIRST",
        )
        .bind(run_id)
        .fetch_all(pool)
        .await
    }

    /// Find a single cell by ID.
    pub async fn find_cell_by_id(
        pool: &PgPool,
        cell_id: DbId,
    ) -> Result<Option<ProductionRunCell>, sqlx::Error> {
        let query = format!("SELECT {CELL_COLUMNS} FROM production_run_cells WHERE id = $1");
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(cell_id)
            .fetch_optional(pool)
            .await
    }

    /// Update the status of a cell, optionally setting blocking reason or error.
    pub async fn update_cell_status(
        pool: &PgPool,
        cell_id: DbId,
        status_id: DbId,
        blocking_reason: Option<&str>,
        error_message: Option<&str>,
    ) -> Result<Option<ProductionRunCell>, sqlx::Error> {
        let query = format!(
            "UPDATE production_run_cells SET \
                status_id = $2, \
                blocking_reason = COALESCE($3, blocking_reason), \
                error_message = COALESCE($4, error_message) \
             WHERE id = $1 \
             RETURNING {CELL_COLUMNS}"
        );
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(cell_id)
            .bind(status_id)
            .bind(blocking_reason)
            .bind(error_message)
            .fetch_optional(pool)
            .await
    }

    /// List cells by run filtered to specific cell IDs (for partial submission).
    pub async fn list_cells_by_ids(
        pool: &PgPool,
        run_id: DbId,
        cell_ids: &[DbId],
    ) -> Result<Vec<ProductionRunCell>, sqlx::Error> {
        let query = format!(
            "SELECT {CELL_COLUMNS} FROM production_run_cells \
             WHERE run_id = $1 AND id = ANY($2) \
             ORDER BY character_id, scene_type_id, variant_label"
        );
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(run_id)
            .bind(cell_ids)
            .fetch_all(pool)
            .await
    }

    /// List failed cells for a run (for resubmission).
    pub async fn list_failed_cells(
        pool: &PgPool,
        run_id: DbId,
    ) -> Result<Vec<ProductionRunCell>, sqlx::Error> {
        let query = format!(
            "SELECT {CELL_COLUMNS} FROM production_run_cells \
             WHERE run_id = $1 AND status_id = $2 \
             ORDER BY character_id, scene_type_id, variant_label"
        );
        sqlx::query_as::<_, ProductionRunCell>(&query)
            .bind(run_id)
            .bind(x121_core::batch_production::RUN_STATUS_ID_FAILED)
            .fetch_all(pool)
            .await
    }

    /// Find cells in a run whose (character_id, scene_type_id) have an existing
    /// scene with at least one approved video version. Returns cell IDs and the
    /// matching scene IDs.
    pub async fn find_cells_with_approved_scenes(
        pool: &PgPool,
        run_id: DbId,
    ) -> Result<Vec<(DbId, DbId)>, sqlx::Error> {
        // Returns (cell_id, scene_id) for cells that have a matching scene
        // with at least one approved (non-deleted) video version.
        sqlx::query_as::<_, (DbId, DbId)>(
            "SELECT prc.id AS cell_id, s.id AS scene_id \
             FROM production_run_cells prc \
             JOIN scenes s \
               ON s.character_id = prc.character_id \
              AND s.scene_type_id = prc.scene_type_id \
              AND s.track_id IS NOT DISTINCT FROM prc.track_id \
              AND s.deleted_at IS NULL \
             WHERE prc.run_id = $1 \
               AND EXISTS ( \
                   SELECT 1 FROM scene_video_versions svv \
                   WHERE svv.scene_id = s.id \
                     AND svv.qa_status = 'approved' \
                     AND svv.deleted_at IS NULL \
               )",
        )
        .bind(run_id)
        .fetch_all(pool)
        .await
    }

    /// Find cells that have a matching scene with any video version (in-progress, not yet approved).
    /// Returns (cell_id, scene_id) for cells where the scene exists and has at least one
    /// non-approved video version but no approved ones.
    pub async fn find_cells_with_in_progress_scenes(
        pool: &PgPool,
        run_id: DbId,
    ) -> Result<Vec<(DbId, DbId)>, sqlx::Error> {
        sqlx::query_as::<_, (DbId, DbId)>(
            "SELECT prc.id AS cell_id, s.id AS scene_id \
             FROM production_run_cells prc \
             JOIN scenes s \
               ON s.character_id = prc.character_id \
              AND s.scene_type_id = prc.scene_type_id \
              AND s.track_id IS NOT DISTINCT FROM prc.track_id \
              AND s.deleted_at IS NULL \
             WHERE prc.run_id = $1 \
               AND EXISTS ( \
                   SELECT 1 FROM scene_video_versions svv \
                   WHERE svv.scene_id = s.id \
                     AND svv.deleted_at IS NULL \
               ) \
               AND NOT EXISTS ( \
                   SELECT 1 FROM scene_video_versions svv \
                   WHERE svv.scene_id = s.id \
                     AND svv.qa_status = 'approved' \
                     AND svv.deleted_at IS NULL \
               )",
        )
        .bind(run_id)
        .fetch_all(pool)
        .await
    }

    /// Batch-update cell statuses and link scene_ids.
    ///
    /// Sets `status_id` to the given value and links each cell to its scene.
    /// Used by both retrospective matching (completed) and in-progress promotion.
    async fn mark_cells_with_scene(
        pool: &PgPool,
        updates: &[(DbId, DbId)], // (cell_id, scene_id)
        status_id: DbId,
    ) -> Result<u64, sqlx::Error> {
        if updates.is_empty() {
            return Ok(0);
        }
        let cell_ids: Vec<DbId> = updates.iter().map(|(cid, _)| *cid).collect();
        let scene_ids: Vec<DbId> = updates.iter().map(|(_, sid)| *sid).collect();

        let result = sqlx::query(
            "UPDATE production_run_cells AS prc SET \
                status_id = $3, \
                scene_id = v.scene_id \
             FROM UNNEST($1::bigint[], $2::bigint[]) AS v(cell_id, scene_id) \
             WHERE prc.id = v.cell_id",
        )
        .bind(&cell_ids)
        .bind(&scene_ids)
        .bind(status_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Batch-update cell statuses to in-progress and link scene_id.
    pub async fn mark_cells_in_progress_with_scene(
        pool: &PgPool,
        updates: &[(DbId, DbId)],
    ) -> Result<u64, sqlx::Error> {
        Self::mark_cells_with_scene(
            pool,
            updates,
            x121_core::batch_production::RUN_STATUS_ID_IN_PROGRESS,
        )
        .await
    }

    /// Batch-update cell statuses to completed and link scene_id.
    pub async fn mark_cells_completed_with_scene(
        pool: &PgPool,
        updates: &[(DbId, DbId)],
    ) -> Result<u64, sqlx::Error> {
        Self::mark_cells_with_scene(
            pool,
            updates,
            x121_core::batch_production::RUN_STATUS_ID_COMPLETED,
        )
        .await
    }

    /// Live-refresh stale not_started cells by checking current scene state.
    /// Promotes cells to completed (approved video exists) or in-progress (video exists but not approved).
    /// Returns (completed_count, in_progress_count).
    pub async fn refresh_stale_cells(
        pool: &PgPool,
        run_id: DbId,
    ) -> Result<(u64, u64), sqlx::Error> {
        // Find not_started cells that now have an approved scene
        let approved = sqlx::query_as::<_, (DbId, DbId)>(
            "SELECT prc.id AS cell_id, s.id AS scene_id \
             FROM production_run_cells prc \
             JOIN scenes s \
               ON s.character_id = prc.character_id \
              AND s.scene_type_id = prc.scene_type_id \
              AND s.track_id IS NOT DISTINCT FROM prc.track_id \
              AND s.deleted_at IS NULL \
             WHERE prc.run_id = $1 \
               AND prc.status_id = $2 \
               AND EXISTS ( \
                   SELECT 1 FROM scene_video_versions svv \
                   WHERE svv.scene_id = s.id \
                     AND svv.qa_status = 'approved' \
                     AND svv.deleted_at IS NULL \
               )",
        )
        .bind(run_id)
        .bind(x121_core::batch_production::RUN_STATUS_ID_DRAFT)
        .fetch_all(pool)
        .await?;

        let completed_count = if !approved.is_empty() {
            Self::mark_cells_completed_with_scene(pool, &approved).await?
        } else {
            0
        };

        // Find remaining not_started cells that now have any video version (in-progress)
        let in_progress = sqlx::query_as::<_, (DbId, DbId)>(
            "SELECT prc.id AS cell_id, s.id AS scene_id \
             FROM production_run_cells prc \
             JOIN scenes s \
               ON s.character_id = prc.character_id \
              AND s.scene_type_id = prc.scene_type_id \
              AND s.track_id IS NOT DISTINCT FROM prc.track_id \
              AND s.deleted_at IS NULL \
             WHERE prc.run_id = $1 \
               AND prc.status_id = $2 \
               AND EXISTS ( \
                   SELECT 1 FROM scene_video_versions svv \
                   WHERE svv.scene_id = s.id \
                     AND svv.deleted_at IS NULL \
               ) \
               AND NOT EXISTS ( \
                   SELECT 1 FROM scene_video_versions svv \
                   WHERE svv.scene_id = s.id \
                     AND svv.qa_status = 'approved' \
                     AND svv.deleted_at IS NULL \
               )",
        )
        .bind(run_id)
        .bind(x121_core::batch_production::RUN_STATUS_ID_DRAFT)
        .fetch_all(pool)
        .await?;

        let in_progress_count = if !in_progress.is_empty() {
            Self::mark_cells_in_progress_with_scene(pool, &in_progress).await?
        } else {
            0
        };

        Ok((completed_count, in_progress_count))
    }

    /// Delete specific cells from a production run. Returns count deleted.
    pub async fn delete_cells(
        pool: &PgPool,
        run_id: DbId,
        cell_ids: &[DbId],
    ) -> Result<u64, sqlx::Error> {
        let result =
            sqlx::query("DELETE FROM production_run_cells WHERE run_id = $1 AND id = ANY($2)")
                .bind(run_id)
                .bind(cell_ids)
                .execute(pool)
                .await?;
        Ok(result.rows_affected())
    }

    /// Cancel all cells for a specific character in a production run. Returns count cancelled.
    pub async fn cancel_character_cells(
        pool: &PgPool,
        run_id: DbId,
        character_id: DbId,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE production_run_cells SET status_id = $3 \
             WHERE run_id = $1 AND character_id = $2 AND status_id NOT IN ($3)",
        )
        .bind(run_id)
        .bind(character_id)
        .bind(x121_core::batch_production::RUN_STATUS_ID_CANCELLED)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Delete all cells for a specific character in a production run. Returns count deleted.
    pub async fn delete_character_cells(
        pool: &PgPool,
        run_id: DbId,
        character_id: DbId,
    ) -> Result<u64, sqlx::Error> {
        let result =
            sqlx::query("DELETE FROM production_run_cells WHERE run_id = $1 AND character_id = $2")
                .bind(run_id)
                .bind(character_id)
                .execute(pool)
                .await?;
        Ok(result.rows_affected())
    }

    /// Count cells by status for a production run (for progress tracking).
    pub async fn count_cells_by_status(
        pool: &PgPool,
        run_id: DbId,
    ) -> Result<Vec<(DbId, i64)>, sqlx::Error> {
        sqlx::query_as::<_, (DbId, i64)>(
            "SELECT status_id, COUNT(*) FROM production_run_cells \
             WHERE run_id = $1 \
             GROUP BY status_id \
             ORDER BY status_id",
        )
        .bind(run_id)
        .fetch_all(pool)
        .await
    }
}

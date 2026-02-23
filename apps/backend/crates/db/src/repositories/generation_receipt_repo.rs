//! Repository for the `generation_receipts` table (PRD-69).

use sqlx::PgPool;
use trulience_core::types::{DbId, Timestamp};

use crate::models::generation_receipt::{
    AssetUsageEntry, CreateGenerationReceipt, GenerationReceipt, StalenessReportEntry,
};

/// Column list for generation_receipts queries.
const COLUMNS: &str = "id, segment_id, source_image_hash, variant_image_hash, \
    workflow_version, workflow_hash, model_asset_id, model_version, model_hash, \
    lora_configs, prompt_text, negative_prompt, cfg_scale, seed, \
    resolution_width, resolution_height, steps, sampler, additional_params, \
    inputs_hash, generation_started_at, generation_completed_at, \
    generation_duration_ms, created_at";

/// Provides CRUD operations for generation receipts (immutable provenance records).
pub struct GenerationReceiptRepo;

impl GenerationReceiptRepo {
    /// Insert a new generation receipt, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateGenerationReceipt,
    ) -> Result<GenerationReceipt, sqlx::Error> {
        let query = format!(
            "INSERT INTO generation_receipts
                (segment_id, source_image_hash, variant_image_hash,
                 workflow_version, workflow_hash, model_asset_id,
                 model_version, model_hash, lora_configs,
                 prompt_text, negative_prompt, cfg_scale, seed,
                 resolution_width, resolution_height, steps, sampler,
                 additional_params, inputs_hash, generation_started_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                     $12, $13, $14, $15, $16, $17, $18, $19, $20)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, GenerationReceipt>(&query)
            .bind(input.segment_id)
            .bind(&input.source_image_hash)
            .bind(&input.variant_image_hash)
            .bind(&input.workflow_version)
            .bind(&input.workflow_hash)
            .bind(input.model_asset_id)
            .bind(&input.model_version)
            .bind(&input.model_hash)
            .bind(&input.lora_configs)
            .bind(&input.prompt_text)
            .bind(&input.negative_prompt)
            .bind(input.cfg_scale)
            .bind(input.seed)
            .bind(input.resolution_width)
            .bind(input.resolution_height)
            .bind(input.steps)
            .bind(&input.sampler)
            .bind(&input.additional_params)
            .bind(&input.inputs_hash)
            .bind(input.generation_started_at)
            .fetch_one(pool)
            .await
    }

    /// Complete a receipt by setting timing fields.
    /// Returns `true` if a row was updated.
    pub async fn complete(
        pool: &PgPool,
        receipt_id: DbId,
        completed_at: Timestamp,
        duration_ms: i32,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE generation_receipts SET
                generation_completed_at = $1,
                generation_duration_ms = $2
             WHERE id = $3"
        )
            .bind(completed_at)
            .bind(duration_ms)
            .bind(receipt_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Find a receipt by its primary key.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<GenerationReceipt>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM generation_receipts WHERE id = $1"
        );
        sqlx::query_as::<_, GenerationReceipt>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find the most recent receipt for a segment.
    pub async fn find_for_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Option<GenerationReceipt>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM generation_receipts
             WHERE segment_id = $1
             ORDER BY created_at DESC
             LIMIT 1"
        );
        sqlx::query_as::<_, GenerationReceipt>(&query)
            .bind(segment_id)
            .fetch_optional(pool)
            .await
    }

    /// List all receipts for a segment, newest first.
    pub async fn list_for_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Vec<GenerationReceipt>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM generation_receipts
             WHERE segment_id = $1
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, GenerationReceipt>(&query)
            .bind(segment_id)
            .fetch_all(pool)
            .await
    }

    /// Find segments whose model hash no longer matches the current asset version.
    ///
    /// Optionally scoped to a single project via the segment->scene->character->project chain.
    pub async fn find_stale_by_model(
        pool: &PgPool,
        project_id: Option<DbId>,
    ) -> Result<Vec<StalenessReportEntry>, sqlx::Error> {
        if let Some(pid) = project_id {
            sqlx::query_as::<_, StalenessReportEntry>(
                "SELECT gr.segment_id, s.scene_id, gr.id AS receipt_id,
                        gr.model_version,
                        a.version_number::TEXT AS current_model_version
                 FROM generation_receipts gr
                 JOIN segments s ON s.id = gr.segment_id
                 JOIN scenes sc ON sc.id = s.scene_id
                 JOIN characters c ON c.id = sc.character_id
                 LEFT JOIN assets a ON a.id = gr.model_asset_id
                 WHERE (a.id IS NOT NULL AND gr.model_hash != COALESCE(a.name, ''))
                    OR (a.is_current_version = false)
                 AND c.project_id = $1
                 ORDER BY gr.created_at DESC"
            )
                .bind(pid)
                .fetch_all(pool)
                .await
        } else {
            sqlx::query_as::<_, StalenessReportEntry>(
                "SELECT gr.segment_id, s.scene_id, gr.id AS receipt_id,
                        gr.model_version,
                        a.version_number::TEXT AS current_model_version
                 FROM generation_receipts gr
                 JOIN segments s ON s.id = gr.segment_id
                 LEFT JOIN assets a ON a.id = gr.model_asset_id
                 WHERE (a.id IS NOT NULL AND gr.model_hash != COALESCE(a.name, ''))
                    OR (a.is_current_version = false)
                 ORDER BY gr.created_at DESC"
            )
                .fetch_all(pool)
                .await
        }
    }

    /// Find which segments used a given asset (reverse provenance).
    ///
    /// Optionally filters by model version string.
    pub async fn find_usage_by_asset(
        pool: &PgPool,
        asset_id: DbId,
        version: Option<&str>,
    ) -> Result<Vec<AssetUsageEntry>, sqlx::Error> {
        if let Some(ver) = version {
            sqlx::query_as::<_, AssetUsageEntry>(
                "SELECT gr.segment_id, s.scene_id,
                        gr.model_version, gr.created_at
                 FROM generation_receipts gr
                 JOIN segments s ON s.id = gr.segment_id
                 WHERE gr.model_asset_id = $1 AND gr.model_version = $2
                 ORDER BY gr.created_at DESC"
            )
                .bind(asset_id)
                .bind(ver)
                .fetch_all(pool)
                .await
        } else {
            sqlx::query_as::<_, AssetUsageEntry>(
                "SELECT gr.segment_id, s.scene_id,
                        gr.model_version, gr.created_at
                 FROM generation_receipts gr
                 JOIN segments s ON s.id = gr.segment_id
                 WHERE gr.model_asset_id = $1
                 ORDER BY gr.created_at DESC"
            )
                .bind(asset_id)
                .fetch_all(pool)
                .await
        }
    }

    /// Count the number of receipts for a segment.
    pub async fn count_for_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM generation_receipts WHERE segment_id = $1")
                .bind(segment_id)
                .fetch_one(pool)
                .await?;
        Ok(row.0)
    }
}

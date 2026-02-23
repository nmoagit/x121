//! Repository for the `placement_rules` table (PRD-104).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::placement_rule::{CreatePlacementRule, PlacementRule, UpdatePlacementRule};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, model_type, base_model, target_directory, priority, \
    is_active, created_at, updated_at";

/// Provides CRUD operations for placement rules.
pub struct PlacementRuleRepo;

impl PlacementRuleRepo {
    /// Insert a new placement rule.
    pub async fn create(
        pool: &PgPool,
        input: &CreatePlacementRule,
    ) -> Result<PlacementRule, sqlx::Error> {
        let query = format!(
            "INSERT INTO placement_rules (model_type, base_model, target_directory, priority, is_active)
             VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, true))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PlacementRule>(&query)
            .bind(&input.model_type)
            .bind(&input.base_model)
            .bind(&input.target_directory)
            .bind(input.priority)
            .bind(input.is_active)
            .fetch_one(pool)
            .await
    }

    /// Find a placement rule by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<PlacementRule>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM placement_rules WHERE id = $1");
        sqlx::query_as::<_, PlacementRule>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all placement rules, ordered by priority descending.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<PlacementRule>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM placement_rules ORDER BY priority DESC, model_type");
        sqlx::query_as::<_, PlacementRule>(&query)
            .fetch_all(pool)
            .await
    }

    /// List only active placement rules, ordered by priority descending.
    pub async fn list_active(pool: &PgPool) -> Result<Vec<PlacementRule>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM placement_rules WHERE is_active = true ORDER BY priority DESC, model_type"
        );
        sqlx::query_as::<_, PlacementRule>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update a placement rule. Only non-`None` fields in `input` are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdatePlacementRule,
    ) -> Result<Option<PlacementRule>, sqlx::Error> {
        let query = format!(
            "UPDATE placement_rules SET
                model_type = COALESCE($2, model_type),
                base_model = COALESCE($3, base_model),
                target_directory = COALESCE($4, target_directory),
                priority = COALESCE($5, priority),
                is_active = COALESCE($6, is_active)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PlacementRule>(&query)
            .bind(id)
            .bind(&input.model_type)
            .bind(&input.base_model)
            .bind(&input.target_directory)
            .bind(input.priority)
            .bind(input.is_active)
            .fetch_optional(pool)
            .await
    }

    /// Delete a placement rule. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM placement_rules WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Resolve the target path for a given model type and optional base model.
    /// Returns the best matching directory from active rules, falling back to
    /// `/models/{model_type}/` if no rules match.
    pub async fn resolve_path(
        pool: &PgPool,
        model_type: &str,
        base_model: Option<&str>,
    ) -> Result<String, sqlx::Error> {
        let rules = Self::list_active(pool).await?;
        let rule_tuples: Vec<(String, Option<String>, String, i32)> = rules
            .into_iter()
            .map(|r| (r.model_type, r.base_model, r.target_directory, r.priority))
            .collect();
        Ok(trulience_core::download_manager::resolve_target_directory(
            model_type, base_model, &rule_tuples,
        ))
    }
}

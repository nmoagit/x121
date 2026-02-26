//! Repository for validation rules and rule types.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::validation::{
    CreateValidationRule, UpdateValidationRule, ValidationRuleRow, ValidationRuleType,
};

/// Column list for `validation_rules` queries (joined with `validation_rule_types`).
const RULE_COLUMNS: &str = "vr.id, vr.entity_type, vr.field_name, vrt.name AS rule_type, \
     vr.config, vr.error_message, vr.severity, vr.is_active, \
     vr.project_id, vr.sort_order, vr.created_at, vr.updated_at";

/// Provides CRUD operations for validation rules.
pub struct ValidationRuleRepo;

impl ValidationRuleRepo {
    /// List all rule types, ordered by name.
    pub async fn list_rule_types(pool: &PgPool) -> Result<Vec<ValidationRuleType>, sqlx::Error> {
        sqlx::query_as::<_, ValidationRuleType>(
            "SELECT id, name, description, created_at, updated_at \
             FROM validation_rule_types ORDER BY name",
        )
        .fetch_all(pool)
        .await
    }

    /// Load active rules for an entity type, including global (`project_id IS NULL`)
    /// and optionally project-specific rules, ordered by `sort_order`.
    pub async fn load_rules(
        pool: &PgPool,
        entity_type: &str,
        project_id: Option<DbId>,
    ) -> Result<Vec<ValidationRuleRow>, sqlx::Error> {
        Self::query_rules(pool, entity_type, project_id, true).await
    }

    /// List all rules for an entity type (regardless of active state),
    /// optionally filtered by project.
    pub async fn list_by_entity_type(
        pool: &PgPool,
        entity_type: &str,
        project_id: Option<DbId>,
    ) -> Result<Vec<ValidationRuleRow>, sqlx::Error> {
        Self::query_rules(pool, entity_type, project_id, false).await
    }

    /// Shared query for loading rules with optional active-only filter.
    async fn query_rules(
        pool: &PgPool,
        entity_type: &str,
        project_id: Option<DbId>,
        active_only: bool,
    ) -> Result<Vec<ValidationRuleRow>, sqlx::Error> {
        let active_clause = if active_only {
            "AND vr.is_active = true "
        } else {
            ""
        };
        let sql = format!(
            "SELECT {RULE_COLUMNS} \
             FROM validation_rules vr \
             JOIN validation_rule_types vrt ON vrt.id = vr.rule_type_id \
             WHERE vr.entity_type = $1 \
               {active_clause}\
               AND (vr.project_id IS NULL OR vr.project_id = $2) \
             ORDER BY vr.sort_order, vr.id"
        );
        sqlx::query_as::<_, ValidationRuleRow>(&sql)
            .bind(entity_type)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Create a new validation rule, returning the inserted row with resolved rule type name.
    pub async fn create(
        pool: &PgPool,
        input: &CreateValidationRule,
    ) -> Result<ValidationRuleRow, sqlx::Error> {
        let sql = format!(
            "WITH inserted AS ( \
                INSERT INTO validation_rules \
                    (entity_type, field_name, rule_type_id, config, error_message, \
                     severity, is_active, project_id, sort_order) \
                VALUES ($1, $2, $3, COALESCE($4, '{{}}'), $5, \
                        COALESCE($6, 'error'), COALESCE($7, true), $8, COALESCE($9, 0)) \
                RETURNING * \
             ) \
             SELECT {RULE_COLUMNS} \
             FROM inserted vr \
             JOIN validation_rule_types vrt ON vrt.id = vr.rule_type_id"
        );
        sqlx::query_as::<_, ValidationRuleRow>(&sql)
            .bind(&input.entity_type)
            .bind(&input.field_name)
            .bind(input.rule_type_id)
            .bind(&input.config)
            .bind(&input.error_message)
            .bind(&input.severity)
            .bind(input.is_active)
            .bind(input.project_id)
            .bind(input.sort_order)
            .fetch_one(pool)
            .await
    }

    /// Update an existing validation rule. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateValidationRule,
    ) -> Result<Option<ValidationRuleRow>, sqlx::Error> {
        let sql = format!(
            "WITH updated AS ( \
                UPDATE validation_rules SET \
                    config = COALESCE($2, config), \
                    error_message = COALESCE($3, error_message), \
                    severity = COALESCE($4, severity), \
                    is_active = COALESCE($5, is_active), \
                    sort_order = COALESCE($6, sort_order) \
                WHERE id = $1 \
                RETURNING * \
             ) \
             SELECT {RULE_COLUMNS} \
             FROM updated vr \
             JOIN validation_rule_types vrt ON vrt.id = vr.rule_type_id"
        );
        sqlx::query_as::<_, ValidationRuleRow>(&sql)
            .bind(id)
            .bind(&input.config)
            .bind(&input.error_message)
            .bind(&input.severity)
            .bind(input.is_active)
            .bind(input.sort_order)
            .fetch_optional(pool)
            .await
    }

    /// Delete a validation rule by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM validation_rules WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

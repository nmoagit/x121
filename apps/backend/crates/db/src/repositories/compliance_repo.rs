//! Repository for `compliance_rules` and `compliance_checks` tables (PRD-102).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::compliance::{
    ComplianceCheck, ComplianceCheckSummary, ComplianceRule, CreateComplianceCheck,
    CreateComplianceRule, UpdateComplianceRule,
};

/// Column list for compliance_rules queries.
const RULE_COLUMNS: &str = "id, name, description, rule_type, config_json, is_global, \
    project_id, created_by, created_at, updated_at";

/// Column list for compliance_checks queries.
const CHECK_COLUMNS: &str = "id, scene_id, rule_id, passed, actual_value, expected_value, \
    message, checked_at, created_at, updated_at";

/// Provides CRUD operations for compliance rules and checks.
pub struct ComplianceRepo;

impl ComplianceRepo {
    // -----------------------------------------------------------------------
    // Rules
    // -----------------------------------------------------------------------

    /// Insert a new compliance rule, returning the created row.
    pub async fn create_rule(
        pool: &PgPool,
        input: &CreateComplianceRule,
        created_by: DbId,
    ) -> Result<ComplianceRule, sqlx::Error> {
        let query = format!(
            "INSERT INTO compliance_rules
                (name, description, rule_type, config_json, is_global, project_id, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING {RULE_COLUMNS}"
        );
        sqlx::query_as::<_, ComplianceRule>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.rule_type)
            .bind(&input.config_json)
            .bind(input.is_global)
            .bind(input.project_id)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// Find a compliance rule by its ID.
    pub async fn get_rule(pool: &PgPool, id: DbId) -> Result<Option<ComplianceRule>, sqlx::Error> {
        let query = format!("SELECT {RULE_COLUMNS} FROM compliance_rules WHERE id = $1");
        sqlx::query_as::<_, ComplianceRule>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List compliance rules, optionally filtered by project_id.
    ///
    /// When `project_id` is `None`, returns all rules. When provided, returns
    /// rules that belong to that project or are global.
    pub async fn list_rules(
        pool: &PgPool,
        project_id: Option<DbId>,
    ) -> Result<Vec<ComplianceRule>, sqlx::Error> {
        match project_id {
            Some(pid) => {
                let query = format!(
                    "SELECT {RULE_COLUMNS} FROM compliance_rules
                     WHERE project_id = $1 OR is_global = true
                     ORDER BY created_at DESC"
                );
                sqlx::query_as::<_, ComplianceRule>(&query)
                    .bind(pid)
                    .fetch_all(pool)
                    .await
            }
            None => {
                let query = format!(
                    "SELECT {RULE_COLUMNS} FROM compliance_rules
                     ORDER BY created_at DESC"
                );
                sqlx::query_as::<_, ComplianceRule>(&query)
                    .fetch_all(pool)
                    .await
            }
        }
    }

    /// List only global compliance rules.
    pub async fn list_global_rules(pool: &PgPool) -> Result<Vec<ComplianceRule>, sqlx::Error> {
        let query = format!(
            "SELECT {RULE_COLUMNS} FROM compliance_rules
             WHERE is_global = true
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ComplianceRule>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update a compliance rule. Only non-None fields are applied.
    pub async fn update_rule(
        pool: &PgPool,
        id: DbId,
        input: &UpdateComplianceRule,
    ) -> Result<Option<ComplianceRule>, sqlx::Error> {
        let query = format!(
            "UPDATE compliance_rules SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                rule_type = COALESCE($3, rule_type),
                config_json = COALESCE($4, config_json),
                is_global = COALESCE($5, is_global),
                project_id = COALESCE($6, project_id)
             WHERE id = $7
             RETURNING {RULE_COLUMNS}"
        );
        sqlx::query_as::<_, ComplianceRule>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.rule_type)
            .bind(&input.config_json)
            .bind(input.is_global)
            .bind(input.project_id)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a compliance rule by its ID. Returns true if a row was deleted.
    pub async fn delete_rule(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM compliance_rules WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Checks
    // -----------------------------------------------------------------------

    /// Insert a new compliance check record.
    pub async fn create_check(
        pool: &PgPool,
        input: &CreateComplianceCheck,
    ) -> Result<ComplianceCheck, sqlx::Error> {
        let query = format!(
            "INSERT INTO compliance_checks
                (scene_id, rule_id, passed, actual_value, expected_value, message)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {CHECK_COLUMNS}"
        );
        sqlx::query_as::<_, ComplianceCheck>(&query)
            .bind(input.scene_id)
            .bind(input.rule_id)
            .bind(input.passed)
            .bind(&input.actual_value)
            .bind(&input.expected_value)
            .bind(&input.message)
            .fetch_one(pool)
            .await
    }

    /// List all compliance checks for a given scene.
    pub async fn list_checks_by_scene(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Vec<ComplianceCheck>, sqlx::Error> {
        let query = format!(
            "SELECT {CHECK_COLUMNS} FROM compliance_checks
             WHERE scene_id = $1
             ORDER BY checked_at DESC"
        );
        sqlx::query_as::<_, ComplianceCheck>(&query)
            .bind(scene_id)
            .fetch_all(pool)
            .await
    }

    /// List all compliance checks for a given rule.
    pub async fn list_checks_by_rule(
        pool: &PgPool,
        rule_id: DbId,
    ) -> Result<Vec<ComplianceCheck>, sqlx::Error> {
        let query = format!(
            "SELECT {CHECK_COLUMNS} FROM compliance_checks
             WHERE rule_id = $1
             ORDER BY checked_at DESC"
        );
        sqlx::query_as::<_, ComplianceCheck>(&query)
            .bind(rule_id)
            .fetch_all(pool)
            .await
    }

    /// Get a summary of compliance checks for a scene (total, passed, failed).
    pub async fn get_scene_compliance_summary(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<ComplianceCheckSummary, sqlx::Error> {
        let row = sqlx::query_as::<_, (i64, i64, i64)>(
            "SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE passed = true) AS passed,
                COUNT(*) FILTER (WHERE passed = false) AS failed
             FROM compliance_checks
             WHERE scene_id = $1",
        )
        .bind(scene_id)
        .fetch_one(pool)
        .await?;

        Ok(ComplianceCheckSummary {
            total: row.0,
            passed: row.1,
            failed: row.2,
        })
    }
}

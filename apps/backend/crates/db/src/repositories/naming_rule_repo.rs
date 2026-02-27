//! Repository for the `naming_rules` and `naming_categories` tables (PRD-116).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::naming_rule::{CreateNamingRule, NamingCategory, NamingRule, UpdateNamingRule};

const RULE_COLUMNS: &str =
    "id, category_id, project_id, template, description, is_active, changelog, \
     created_by, created_at, updated_at";

/// Provides CRUD operations for naming categories and naming rules.
pub struct NamingRuleRepo;

impl NamingRuleRepo {
    // -- Categories --------------------------------------------------------

    /// List all naming categories ordered by id.
    pub async fn list_categories(pool: &PgPool) -> Result<Vec<NamingCategory>, sqlx::Error> {
        sqlx::query_as::<_, NamingCategory>(
            "SELECT id, name, description, example_output \
             FROM naming_categories ORDER BY id ASC",
        )
        .fetch_all(pool)
        .await
    }

    /// Find a single naming category by its unique name.
    pub async fn find_category_by_name(
        pool: &PgPool,
        name: &str,
    ) -> Result<Option<NamingCategory>, sqlx::Error> {
        sqlx::query_as::<_, NamingCategory>(
            "SELECT id, name, description, example_output \
             FROM naming_categories WHERE name = $1",
        )
        .bind(name)
        .fetch_optional(pool)
        .await
    }

    // -- Rules -------------------------------------------------------------

    /// List naming rules, optionally filtered by project_id.
    ///
    /// When `project_id` is `None`, returns all rules (global + project-scoped).
    /// When `Some`, returns only rules for that project plus global rules.
    pub async fn list_rules(
        pool: &PgPool,
        project_id: Option<DbId>,
    ) -> Result<Vec<NamingRule>, sqlx::Error> {
        if let Some(pid) = project_id {
            let query = format!(
                "SELECT {RULE_COLUMNS} FROM naming_rules \
                 WHERE project_id IS NULL OR project_id = $1 \
                 ORDER BY category_id ASC, project_id ASC NULLS FIRST"
            );
            sqlx::query_as::<_, NamingRule>(&query)
                .bind(pid)
                .fetch_all(pool)
                .await
        } else {
            let query = format!(
                "SELECT {RULE_COLUMNS} FROM naming_rules \
                 ORDER BY category_id ASC, project_id ASC NULLS FIRST"
            );
            sqlx::query_as::<_, NamingRule>(&query)
                .fetch_all(pool)
                .await
        }
    }

    /// Find a single naming rule by its id.
    pub async fn find_rule_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<NamingRule>, sqlx::Error> {
        let query = format!("SELECT {RULE_COLUMNS} FROM naming_rules WHERE id = $1");
        sqlx::query_as::<_, NamingRule>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find the active rule for a category, with project-level fallback to global.
    ///
    /// Resolution order:
    /// 1. Project-scoped active rule for the given category
    /// 2. Global active rule (project_id IS NULL) for the given category
    pub async fn find_active_rule(
        pool: &PgPool,
        category_name: &str,
        project_id: Option<DbId>,
    ) -> Result<Option<NamingRule>, sqlx::Error> {
        let query = format!(
            "SELECT r.{RULE_COLUMNS} \
             FROM naming_rules r \
             JOIN naming_categories c ON c.id = r.category_id \
             WHERE c.name = $1 \
               AND r.is_active = true \
               AND (r.project_id IS NULL OR r.project_id = $2) \
             ORDER BY r.project_id DESC NULLS LAST \
             LIMIT 1",
            RULE_COLUMNS = RULE_COLUMNS
                .split(", ")
                .map(|col| format!("r.{col}"))
                .collect::<Vec<_>>()
                .join(", ")
        );
        sqlx::query_as::<_, NamingRule>(&query)
            .bind(category_name)
            .bind(project_id)
            .fetch_optional(pool)
            .await
    }

    /// Create a new naming rule.
    pub async fn create_rule(
        pool: &PgPool,
        input: &CreateNamingRule,
        created_by: DbId,
    ) -> Result<NamingRule, sqlx::Error> {
        let query = format!(
            "INSERT INTO naming_rules (category_id, project_id, template, description, created_by) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {RULE_COLUMNS}"
        );
        sqlx::query_as::<_, NamingRule>(&query)
            .bind(input.category_id)
            .bind(input.project_id)
            .bind(&input.template)
            .bind(&input.description)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// Update an existing naming rule and append the old template to the changelog.
    ///
    /// The changelog is a JSONB array where each entry records the previous
    /// template value, who changed it, and when.
    pub async fn update_rule(
        pool: &PgPool,
        id: DbId,
        input: &UpdateNamingRule,
        changed_by: DbId,
    ) -> Result<Option<NamingRule>, sqlx::Error> {
        // Build SET clauses dynamically to only update provided fields.
        let mut sets = Vec::new();
        let mut param_idx = 3u32; // $1 = id, $2 = changed_by

        // We always append to changelog when template changes.
        // First, fetch current rule to get old template for changelog.
        let current = Self::find_rule_by_id(pool, id).await?;
        let current = match current {
            Some(r) => r,
            None => return Ok(None),
        };

        // Build changelog entry
        let changelog_entry = serde_json::json!({
            "old_template": current.template,
            "old_description": current.description,
            "changed_by": changed_by,
            "changed_at": chrono::Utc::now().to_rfc3339(),
        });

        if input.template.is_some() {
            sets.push(format!("template = ${param_idx}"));
            param_idx += 1;
        }
        if input.description.is_some() {
            sets.push(format!("description = ${param_idx}"));
            param_idx += 1;
        }
        if input.is_active.is_some() {
            sets.push(format!("is_active = ${param_idx}"));
            param_idx += 1;
        }

        // Always append changelog entry
        sets.push(format!("changelog = changelog || ${param_idx}::jsonb"));
        let _ = param_idx; // suppress unused warning

        if sets.is_empty() {
            return Ok(Some(current));
        }

        let query = format!(
            "UPDATE naming_rules SET {} WHERE id = $1 RETURNING {RULE_COLUMNS}",
            sets.join(", ")
        );

        let mut q = sqlx::query_as::<_, NamingRule>(&query)
            .bind(id)
            .bind(changed_by);

        if let Some(ref template) = input.template {
            q = q.bind(template);
        }
        if let Some(ref description) = input.description {
            q = q.bind(description);
        }
        if let Some(is_active) = input.is_active {
            q = q.bind(is_active);
        }

        // Bind changelog entry as JSONB
        q = q.bind(serde_json::json!([changelog_entry]));

        q.fetch_optional(pool).await
    }

    /// Delete a naming rule by id.
    ///
    /// Returns `true` if a row was deleted. Callers should verify the rule
    /// is project-scoped before calling — global rules should not be deleted.
    pub async fn delete_rule(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM naming_rules WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

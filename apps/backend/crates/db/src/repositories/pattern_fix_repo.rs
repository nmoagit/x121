//! Repository for the `pattern_fixes` table (PRD-64).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::pattern_fix::{CreatePatternFix, PatternFix};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str =
    "id, pattern_id, fix_description, fix_parameters, effectiveness, reported_by_id, created_at, updated_at";

/// Provides CRUD operations for pattern fixes.
pub struct PatternFixRepo;

impl PatternFixRepo {
    /// Create a new pattern fix record.
    pub async fn create(
        pool: &PgPool,
        pattern_id: DbId,
        input: &CreatePatternFix,
        user_id: DbId,
    ) -> Result<PatternFix, sqlx::Error> {
        let query = format!(
            "INSERT INTO pattern_fixes
                (pattern_id, fix_description, fix_parameters, effectiveness, reported_by_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PatternFix>(&query)
            .bind(pattern_id)
            .bind(&input.fix_description)
            .bind(&input.fix_parameters)
            .bind(&input.effectiveness)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }

    /// List all fixes for a specific pattern, ordered by creation time.
    pub async fn list_by_pattern(
        pool: &PgPool,
        pattern_id: DbId,
    ) -> Result<Vec<PatternFix>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM pattern_fixes
             WHERE pattern_id = $1
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, PatternFix>(&query)
            .bind(pattern_id)
            .fetch_all(pool)
            .await
    }

    /// Update the effectiveness rating of a fix.
    pub async fn update_effectiveness(
        pool: &PgPool,
        id: DbId,
        effectiveness: &str,
    ) -> Result<Option<PatternFix>, sqlx::Error> {
        let query = format!(
            "UPDATE pattern_fixes SET effectiveness = $1
             WHERE id = $2
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PatternFix>(&query)
            .bind(effectiveness)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a fix by ID.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM pattern_fixes WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

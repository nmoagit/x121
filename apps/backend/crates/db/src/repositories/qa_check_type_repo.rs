//! Repository for the `qa_check_types` lookup table.

use sqlx::PgPool;

use crate::models::image_qa::QaCheckType;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, name, category, description, created_at, updated_at";

/// Provides read operations for QA check type lookups.
pub struct QaCheckTypeRepo;

impl QaCheckTypeRepo {
    /// List all check types, ordered by category then name.
    pub async fn list(pool: &PgPool) -> Result<Vec<QaCheckType>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM qa_check_types
             ORDER BY category, name"
        );
        sqlx::query_as::<_, QaCheckType>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a check type by its unique name.
    pub async fn find_by_name(
        pool: &PgPool,
        name: &str,
    ) -> Result<Option<QaCheckType>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM qa_check_types WHERE name = $1");
        sqlx::query_as::<_, QaCheckType>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }
}

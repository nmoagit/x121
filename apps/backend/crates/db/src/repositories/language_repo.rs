//! Repository for the `languages` lookup table (PRD-136).

use sqlx::PgPool;

use crate::models::language::Language;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, code, name, flag_code, created_at";

/// Provides CRUD operations for languages.
pub struct LanguageRepo;

impl LanguageRepo {
    /// List all languages, ordered by name.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<Language>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM languages ORDER BY name");
        sqlx::query_as::<_, Language>(&query).fetch_all(pool).await
    }

    /// Find a language by its primary key.
    pub async fn find_by_id(pool: &PgPool, id: i16) -> Result<Option<Language>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM languages WHERE id = $1");
        sqlx::query_as::<_, Language>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a language by its ISO code (exact match).
    pub async fn find_by_code(pool: &PgPool, code: &str) -> Result<Option<Language>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM languages WHERE code = $1");
        sqlx::query_as::<_, Language>(&query)
            .bind(code)
            .fetch_optional(pool)
            .await
    }

    /// Find a language by name (case-insensitive).
    pub async fn find_by_name_insensitive(
        pool: &PgPool,
        name: &str,
    ) -> Result<Option<Language>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM languages WHERE LOWER(name) = LOWER($1)");
        sqlx::query_as::<_, Language>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    /// Create a new language. Returns the created language.
    pub async fn create(
        pool: &PgPool,
        code: &str,
        name: &str,
        flag_code: &str,
    ) -> Result<Language, sqlx::Error> {
        let query = format!(
            "INSERT INTO languages (code, name, flag_code) VALUES ($1, $2, $3) RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Language>(&query)
            .bind(code)
            .bind(name)
            .bind(flag_code)
            .fetch_one(pool)
            .await
    }
}

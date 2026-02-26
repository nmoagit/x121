//! Repository for the `wiki_versions` table (PRD-56).
//!
//! Wiki versions are immutable snapshots created on article creation and updates.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::wiki_version::WikiVersion;

/// Column list for wiki_versions queries.
const COLUMNS: &str = "id, article_id, version, content_md, edited_by, edit_summary, created_at";

/// Provides read and create operations for wiki article versions.
pub struct WikiVersionRepo;

impl WikiVersionRepo {
    /// Create a new version snapshot.
    pub async fn create(
        pool: &PgPool,
        article_id: DbId,
        version: i32,
        content_md: &str,
        edited_by: Option<DbId>,
        edit_summary: Option<&str>,
    ) -> Result<WikiVersion, sqlx::Error> {
        let query = format!(
            "INSERT INTO wiki_versions (article_id, version, content_md, edited_by, edit_summary)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, WikiVersion>(&query)
            .bind(article_id)
            .bind(version)
            .bind(content_md)
            .bind(edited_by)
            .bind(edit_summary)
            .fetch_one(pool)
            .await
    }

    /// List all versions for an article, ordered newest first.
    pub async fn list_by_article(
        pool: &PgPool,
        article_id: DbId,
    ) -> Result<Vec<WikiVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM wiki_versions
             WHERE article_id = $1
             ORDER BY version DESC"
        );
        sqlx::query_as::<_, WikiVersion>(&query)
            .bind(article_id)
            .fetch_all(pool)
            .await
    }

    /// Find a specific version of an article.
    pub async fn find_by_article_and_version(
        pool: &PgPool,
        article_id: DbId,
        version: i32,
    ) -> Result<Option<WikiVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM wiki_versions
             WHERE article_id = $1 AND version = $2"
        );
        sqlx::query_as::<_, WikiVersion>(&query)
            .bind(article_id)
            .bind(version)
            .fetch_optional(pool)
            .await
    }

    /// Get the latest version number for an article (0 if none exist).
    pub async fn get_latest_version_number(
        pool: &PgPool,
        article_id: DbId,
    ) -> Result<i32, sqlx::Error> {
        let result: Option<(i32,)> = sqlx::query_as(
            "SELECT COALESCE(MAX(version), 0) FROM wiki_versions WHERE article_id = $1",
        )
        .bind(article_id)
        .fetch_optional(pool)
        .await?;

        Ok(result.map(|(v,)| v).unwrap_or(0))
    }
}

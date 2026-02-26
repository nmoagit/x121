//! Repository for the `wiki_articles` table (PRD-56).
//!
//! Also manages version creation on article create/update.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::wiki_article::{CreateWikiArticle, UpdateWikiArticle, WikiArticle};
use crate::models::wiki_version::WikiVersion;
use crate::repositories::wiki_version_repo::WikiVersionRepo;

/// Column list for wiki_articles queries.
const COLUMNS: &str = "id, title, slug, content_md, category, tags, \
    is_builtin, is_pinned, pin_location, created_by, created_at, updated_at";

/// Provides CRUD operations for wiki articles.
pub struct WikiArticleRepo;

impl WikiArticleRepo {
    /// Create a new wiki article and its first version.
    pub async fn create(
        pool: &PgPool,
        input: &CreateWikiArticle,
        slug: &str,
        user_id: Option<DbId>,
    ) -> Result<WikiArticle, sqlx::Error> {
        let is_pinned = input.is_pinned.unwrap_or(false);
        let query = format!(
            "INSERT INTO wiki_articles
                (title, slug, content_md, category, tags, is_pinned, pin_location, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING {COLUMNS}"
        );
        let article = sqlx::query_as::<_, WikiArticle>(&query)
            .bind(&input.title)
            .bind(slug)
            .bind(&input.content_md)
            .bind(&input.category)
            .bind(&input.tags)
            .bind(is_pinned)
            .bind(&input.pin_location)
            .bind(user_id)
            .fetch_one(pool)
            .await?;

        // Create the first version.
        WikiVersionRepo::create(
            pool,
            article.id,
            1,
            &input.content_md,
            user_id,
            Some("Initial version"),
        )
        .await?;

        Ok(article)
    }

    /// Find a wiki article by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<WikiArticle>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM wiki_articles WHERE id = $1");
        sqlx::query_as::<_, WikiArticle>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a wiki article by slug.
    pub async fn find_by_slug(
        pool: &PgPool,
        slug: &str,
    ) -> Result<Option<WikiArticle>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM wiki_articles WHERE slug = $1");
        sqlx::query_as::<_, WikiArticle>(&query)
            .bind(slug)
            .fetch_optional(pool)
            .await
    }

    /// List wiki articles with optional category and pinned filters.
    pub async fn list(
        pool: &PgPool,
        category: Option<&str>,
        is_pinned: Option<bool>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<WikiArticle>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM wiki_articles
             WHERE ($1::TEXT IS NULL OR category = $1)
               AND ($2::BOOL IS NULL OR is_pinned = $2)
             ORDER BY updated_at DESC
             LIMIT $3 OFFSET $4"
        );
        sqlx::query_as::<_, WikiArticle>(&query)
            .bind(category)
            .bind(is_pinned)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Update a wiki article and create a new version if content changed.
    pub async fn update(
        pool: &PgPool,
        slug: &str,
        input: &UpdateWikiArticle,
        user_id: Option<DbId>,
    ) -> Result<WikiArticle, sqlx::Error> {
        let query = format!(
            "UPDATE wiki_articles SET
                title = COALESCE($1, title),
                content_md = COALESCE($2, content_md),
                category = COALESCE($3, category),
                tags = COALESCE($4, tags),
                is_pinned = COALESCE($5, is_pinned),
                pin_location = COALESCE($6, pin_location)
             WHERE slug = $7
             RETURNING {COLUMNS}"
        );
        let article = sqlx::query_as::<_, WikiArticle>(&query)
            .bind(&input.title)
            .bind(&input.content_md)
            .bind(&input.category)
            .bind(&input.tags)
            .bind(input.is_pinned)
            .bind(&input.pin_location)
            .bind(slug)
            .fetch_one(pool)
            .await?;

        // Create a new version if content was changed.
        if input.content_md.is_some() {
            let next_version =
                WikiVersionRepo::get_latest_version_number(pool, article.id).await? + 1;
            WikiVersionRepo::create(
                pool,
                article.id,
                next_version,
                &article.content_md,
                user_id,
                input.edit_summary.as_deref(),
            )
            .await?;
        }

        Ok(article)
    }

    /// Delete a wiki article by slug.
    pub async fn delete(pool: &PgPool, slug: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM wiki_articles WHERE slug = $1")
            .bind(slug)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Full-text search across title and content_md using ILIKE.
    pub async fn search(
        pool: &PgPool,
        query_str: &str,
        limit: i64,
    ) -> Result<Vec<WikiArticle>, sqlx::Error> {
        let pattern = format!("%{query_str}%");
        let query = format!(
            "SELECT {COLUMNS} FROM wiki_articles
             WHERE title ILIKE $1 OR content_md ILIKE $1
             ORDER BY updated_at DESC
             LIMIT $2"
        );
        sqlx::query_as::<_, WikiArticle>(&query)
            .bind(&pattern)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// List all pinned wiki articles.
    pub async fn list_pinned(pool: &PgPool) -> Result<Vec<WikiArticle>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM wiki_articles
             WHERE is_pinned = true
             ORDER BY title ASC"
        );
        sqlx::query_as::<_, WikiArticle>(&query)
            .fetch_all(pool)
            .await
    }

    /// Revert an article to a previous version's content, creating a new version.
    pub async fn revert_to_version(
        pool: &PgPool,
        article_id: DbId,
        old_version: &WikiVersion,
        user_id: Option<DbId>,
    ) -> Result<WikiArticle, sqlx::Error> {
        // Update article content.
        let query =
            format!("UPDATE wiki_articles SET content_md = $1 WHERE id = $2 RETURNING {COLUMNS}");
        let article = sqlx::query_as::<_, WikiArticle>(&query)
            .bind(&old_version.content_md)
            .bind(article_id)
            .fetch_one(pool)
            .await?;

        // Create a new version for the revert.
        let next_version = WikiVersionRepo::get_latest_version_number(pool, article_id).await? + 1;
        let summary = format!("Reverted to version {}", old_version.version);
        WikiVersionRepo::create(
            pool,
            article_id,
            next_version,
            &old_version.content_md,
            user_id,
            Some(&summary),
        )
        .await?;

        Ok(article)
    }
}

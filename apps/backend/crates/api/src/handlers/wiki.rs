//! Handlers for the Studio Wiki & Contextual Help feature (PRD-56).
//!
//! Provides article CRUD, version history, diff, search, contextual help,
//! and pinned article endpoints.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::error::CoreError;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::wiki::{
    compute_line_diff, generate_slug, validate_category, validate_content, validate_pin_location,
    validate_slug, validate_tags, validate_title, DiffLineType,
};
use x121_db::models::wiki_article::{
    ContextualHelpResponse, CreateWikiArticle, DiffLineDto, DiffRequest, DiffResponse,
    UpdateWikiArticle, WikiArticle,
};
use x121_db::repositories::{WikiArticleRepo, WikiVersionRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/* --------------------------------------------------------------------------
Query param types
-------------------------------------------------------------------------- */

#[derive(Debug, serde::Deserialize)]
pub struct ListArticlesParams {
    pub category: Option<String>,
    pub is_pinned: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, serde::Deserialize)]
pub struct SearchParams {
    pub q: Option<String>,
    pub limit: Option<i64>,
}

/* --------------------------------------------------------------------------
Helpers
-------------------------------------------------------------------------- */

/// Fetch an article by slug or return 404.
async fn ensure_article_by_slug(pool: &sqlx::PgPool, slug: &str) -> AppResult<WikiArticle> {
    WikiArticleRepo::find_by_slug(pool, slug)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::Validation(format!(
                "Wiki article with slug '{}' not found",
                slug
            )))
        })
}

/* --------------------------------------------------------------------------
Article CRUD
-------------------------------------------------------------------------- */

/// GET /wiki/articles
///
/// List wiki articles with optional category/pinned filtering.
pub async fn list_articles(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ListArticlesParams>,
) -> AppResult<impl IntoResponse> {
    // Validate category if provided.
    if let Some(ref cat) = params.category {
        validate_category(cat).map_err(AppError::Core)?;
    }

    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let articles = WikiArticleRepo::list(
        &state.pool,
        params.category.as_deref(),
        params.is_pinned,
        limit,
        offset,
    )
    .await?;

    Ok(Json(DataResponse { data: articles }))
}

/// POST /wiki/articles
///
/// Create a new wiki article. Generates slug from title if not provided.
pub async fn create_article(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateWikiArticle>,
) -> AppResult<impl IntoResponse> {
    validate_title(&input.title).map_err(AppError::Core)?;
    validate_content(&input.content_md).map_err(AppError::Core)?;

    if let Some(ref cat) = input.category {
        validate_category(cat).map_err(AppError::Core)?;
    }
    if let Some(ref tags) = input.tags {
        validate_tags(tags).map_err(AppError::Core)?;
    }
    if let Some(ref loc) = input.pin_location {
        validate_pin_location(loc).map_err(AppError::Core)?;
    }

    // Generate or validate slug.
    let slug = match &input.slug {
        Some(s) => {
            validate_slug(s).map_err(AppError::Core)?;
            s.clone()
        }
        None => generate_slug(&input.title),
    };

    let article = WikiArticleRepo::create(&state.pool, &input, &slug, Some(auth.user_id)).await?;

    tracing::info!(
        user_id = auth.user_id,
        article_id = article.id,
        slug = %article.slug,
        "Wiki article created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: article })))
}

/// GET /wiki/articles/{slug}
///
/// Fetch a single article by its slug.
pub async fn get_article_by_slug(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> AppResult<impl IntoResponse> {
    let article = ensure_article_by_slug(&state.pool, &slug).await?;
    Ok(Json(DataResponse { data: article }))
}

/// PUT /wiki/articles/{slug}
///
/// Update a wiki article. Creates a new version if content changes.
pub async fn update_article(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(input): Json<UpdateWikiArticle>,
) -> AppResult<impl IntoResponse> {
    ensure_article_by_slug(&state.pool, &slug).await?;

    if let Some(ref title) = input.title {
        validate_title(title).map_err(AppError::Core)?;
    }
    if let Some(ref content) = input.content_md {
        validate_content(content).map_err(AppError::Core)?;
    }
    if let Some(ref cat) = input.category {
        validate_category(cat).map_err(AppError::Core)?;
    }
    if let Some(ref tags) = input.tags {
        validate_tags(tags).map_err(AppError::Core)?;
    }
    if let Some(ref loc) = input.pin_location {
        validate_pin_location(loc).map_err(AppError::Core)?;
    }

    let article = WikiArticleRepo::update(&state.pool, &slug, &input, Some(auth.user_id)).await?;

    tracing::info!(
        user_id = auth.user_id,
        article_id = article.id,
        slug = %slug,
        "Wiki article updated"
    );

    Ok(Json(DataResponse { data: article }))
}

/// DELETE /wiki/articles/{slug}
///
/// Delete a wiki article. Built-in articles cannot be deleted.
pub async fn delete_article(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> AppResult<impl IntoResponse> {
    let article = ensure_article_by_slug(&state.pool, &slug).await?;

    if article.is_builtin {
        return Err(AppError::Core(CoreError::Forbidden(
            "Built-in wiki articles cannot be deleted".into(),
        )));
    }

    WikiArticleRepo::delete(&state.pool, &slug).await?;

    tracing::info!(
        user_id = auth.user_id,
        article_id = article.id,
        slug = %slug,
        "Wiki article deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}

/* --------------------------------------------------------------------------
Versions
-------------------------------------------------------------------------- */

/// GET /wiki/articles/{slug}/versions
///
/// List all versions of a wiki article.
pub async fn list_versions(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> AppResult<impl IntoResponse> {
    let article = ensure_article_by_slug(&state.pool, &slug).await?;
    let versions = WikiVersionRepo::list_by_article(&state.pool, article.id).await?;
    Ok(Json(DataResponse { data: versions }))
}

/// GET /wiki/articles/{slug}/versions/{version}
///
/// Get a specific version of a wiki article.
pub async fn get_version(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path((slug, version)): Path<(String, i32)>,
) -> AppResult<impl IntoResponse> {
    let article = ensure_article_by_slug(&state.pool, &slug).await?;
    let ver = WikiVersionRepo::find_by_article_and_version(&state.pool, article.id, version)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::Validation(format!(
                "Version {} not found for article '{}'",
                version, slug
            )))
        })?;
    Ok(Json(DataResponse { data: ver }))
}

/// POST /wiki/articles/{slug}/revert/{version}
///
/// Revert an article to a previous version, creating a new version.
pub async fn revert_to_version(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((slug, version)): Path<(String, i32)>,
) -> AppResult<impl IntoResponse> {
    let article = ensure_article_by_slug(&state.pool, &slug).await?;
    let old_version =
        WikiVersionRepo::find_by_article_and_version(&state.pool, article.id, version)
            .await?
            .ok_or_else(|| {
                AppError::Core(CoreError::Validation(format!(
                    "Version {} not found for article '{}'",
                    version, slug
                )))
            })?;

    let updated = WikiArticleRepo::revert_to_version(
        &state.pool,
        article.id,
        &old_version,
        Some(auth.user_id),
    )
    .await?;

    tracing::info!(
        user_id = auth.user_id,
        article_id = article.id,
        reverted_to = version,
        "Wiki article reverted"
    );

    Ok(Json(DataResponse { data: updated }))
}

/* --------------------------------------------------------------------------
Diff
-------------------------------------------------------------------------- */

/// GET /wiki/articles/{slug}/diff?v1=X&v2=Y
///
/// Compute a line-level diff between two versions of an article.
pub async fn diff_versions(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Query(params): Query<DiffRequest>,
) -> AppResult<impl IntoResponse> {
    let article = ensure_article_by_slug(&state.pool, &slug).await?;

    let v1 = WikiVersionRepo::find_by_article_and_version(&state.pool, article.id, params.v1)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::Validation(format!(
                "Version {} not found",
                params.v1
            )))
        })?;
    let v2 = WikiVersionRepo::find_by_article_and_version(&state.pool, article.id, params.v2)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::Validation(format!(
                "Version {} not found",
                params.v2
            )))
        })?;

    let diff = compute_line_diff(&v1.content_md, &v2.content_md);
    let lines: Vec<DiffLineDto> = diff
        .into_iter()
        .map(|d| DiffLineDto {
            line_type: match d.line_type {
                DiffLineType::Added => "added".to_string(),
                DiffLineType::Removed => "removed".to_string(),
                DiffLineType::Unchanged => "unchanged".to_string(),
            },
            content: d.content,
        })
        .collect();

    let response = DiffResponse {
        article_id: article.id,
        slug: article.slug,
        v1: params.v1,
        v2: params.v2,
        lines,
    };

    Ok(Json(DataResponse { data: response }))
}

/* --------------------------------------------------------------------------
Search
-------------------------------------------------------------------------- */

/// GET /wiki/articles/search?q=query&limit=N
///
/// Search wiki articles by title and content.
pub async fn search_articles(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> AppResult<impl IntoResponse> {
    let q = params.q.unwrap_or_default();
    if q.trim().is_empty() {
        return Ok(Json(DataResponse {
            data: Vec::<WikiArticle>::new(),
        }));
    }

    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let articles = WikiArticleRepo::search(&state.pool, &q, limit).await?;
    Ok(Json(DataResponse { data: articles }))
}

/* --------------------------------------------------------------------------
Contextual help
-------------------------------------------------------------------------- */

/// GET /wiki/articles/help/{element_id}
///
/// Look up a wiki article associated with a UI element by slug convention.
/// The element_id is used as a slug to find the matching article.
pub async fn get_contextual_help(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(element_id): Path<String>,
) -> AppResult<impl IntoResponse> {
    let article = WikiArticleRepo::find_by_slug(&state.pool, &element_id).await?;
    let response = ContextualHelpResponse {
        element_id,
        article,
    };
    Ok(Json(DataResponse { data: response }))
}

/* --------------------------------------------------------------------------
Pinned articles
-------------------------------------------------------------------------- */

/// GET /wiki/articles/pinned
///
/// List all pinned wiki articles.
pub async fn list_pinned(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let articles = WikiArticleRepo::list_pinned(&state.pool).await?;
    Ok(Json(DataResponse { data: articles }))
}

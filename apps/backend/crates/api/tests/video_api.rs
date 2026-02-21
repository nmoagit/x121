mod common;

use axum::http::StatusCode;

/// Video stream endpoint returns 404 for nonexistent source.
#[sqlx::test]
async fn stream_nonexistent_returns_404(pool: sqlx::PgPool) {
    let app = common::build_test_app(pool).await;
    let response = common::get(app, "/api/v1/videos/segment/999999/stream").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

/// Video metadata endpoint returns 404 for nonexistent source.
#[sqlx::test]
async fn metadata_nonexistent_returns_404(pool: sqlx::PgPool) {
    let app = common::build_test_app(pool).await;
    let response = common::get(app, "/api/v1/videos/segment/999999/metadata").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

/// Video thumbnail endpoint returns 404 for nonexistent source.
#[sqlx::test]
async fn thumbnail_nonexistent_returns_404(pool: sqlx::PgPool) {
    let app = common::build_test_app(pool).await;
    let response = common::get(app, "/api/v1/videos/segment/999999/thumbnails/0").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

/// Invalid source type returns 400.
#[sqlx::test]
async fn invalid_source_type_returns_400(pool: sqlx::PgPool) {
    let app = common::build_test_app(pool).await;
    let response = common::get(app, "/api/v1/videos/invalid/1/stream").await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

//! HTTP-level integration tests for the `/validation` and `/imports` API
//! endpoints.
//!
//! Uses Axum's `tower::ServiceExt` to send requests directly to the router.
//! Validation rules and rule types are pre-seeded by migrations, so these
//! tests run against realistic data.

mod common;

use axum::http::StatusCode;
use common::{body_json, build_test_app, delete, get, post_json, put_json};
use serde_json::json;
use sqlx::PgPool;

// ---------------------------------------------------------------------------
// Test: GET /api/v1/validation/rule-types returns seeded types
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_rule_types(pool: PgPool) {
    let app = build_test_app(pool).await;
    let response = get(app, "/api/v1/validation/rule-types").await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    let data = json["data"].as_array().expect("data should be an array");
    assert!(
        data.len() >= 10,
        "should have at least 10 seeded rule types, got {}",
        data.len()
    );
    assert!(
        data.iter().any(|t| t["name"] == "required"),
        "should include 'required' rule type"
    );
}

// ---------------------------------------------------------------------------
// Test: GET /api/v1/validation/rules returns seeded rules for entity type
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_rules_by_entity_type(pool: PgPool) {
    let app = build_test_app(pool).await;
    let response = get(app, "/api/v1/validation/rules?entity_type=characters").await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    let data = json["data"].as_array().expect("data should be an array");
    assert!(
        data.len() >= 3,
        "should have at least 3 seeded character rules, got {}",
        data.len()
    );
}

// ---------------------------------------------------------------------------
// Test: POST /api/v1/validation/validate with valid records
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_validate_valid_records(pool: PgPool) {
    let app = build_test_app(pool).await;
    let response = post_json(
        app,
        "/api/v1/validation/validate",
        json!({
            "entity_type": "characters",
            "records": [
                {"name": "Alice", "project_id": 1}
            ]
        }),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert!(json["data"]["report_id"].as_i64().is_some());
    let preview = &json["data"]["preview"];
    assert_eq!(preview["total_records"], 1);
    assert_eq!(preview["to_create"].as_array().unwrap().len(), 1);
    assert!(preview["invalid"].as_array().unwrap().is_empty());
}

// ---------------------------------------------------------------------------
// Test: POST /api/v1/validation/validate with invalid records
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_validate_invalid_records(pool: PgPool) {
    let app = build_test_app(pool).await;
    let response = post_json(
        app,
        "/api/v1/validation/validate",
        json!({
            "entity_type": "characters",
            "records": [
                {"name": null, "project_id": null}
            ]
        }),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    let preview = &json["data"]["preview"];
    assert!(
        !preview["invalid"].as_array().unwrap().is_empty(),
        "records with null required fields should be invalid"
    );
    assert!(
        preview["to_create"].as_array().unwrap().is_empty(),
        "invalid records should not be in to_create"
    );
}

// ---------------------------------------------------------------------------
// Test: POST /api/v1/validation/validate with empty records returns 400
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_validate_empty_records_returns_400(pool: PgPool) {
    let app = build_test_app(pool).await;
    let response = post_json(
        app,
        "/api/v1/validation/validate",
        json!({
            "entity_type": "characters",
            "records": []
        }),
    )
    .await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

// ---------------------------------------------------------------------------
// Test: GET /api/v1/imports/{id}/report returns the report
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_import_report(pool: PgPool) {
    // First create a report via validate.
    let app = build_test_app(pool.clone()).await;
    let response = post_json(
        app,
        "/api/v1/validation/validate",
        json!({
            "entity_type": "characters",
            "records": [{"name": "Bob", "project_id": 1}]
        }),
    )
    .await;
    let json = body_json(response).await;
    let report_id = json["data"]["report_id"].as_i64().unwrap();

    // Fetch the report.
    let app = build_test_app(pool).await;
    let response = get(app, &format!("/api/v1/imports/{report_id}/report")).await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert!(json["data"]["report"].is_object());
    assert!(json["data"]["entries"].is_array());
}

// ---------------------------------------------------------------------------
// Test: GET /api/v1/imports/{id}/report/csv returns CSV
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_import_report_csv(pool: PgPool) {
    // Create a report.
    let app = build_test_app(pool.clone()).await;
    let response = post_json(
        app,
        "/api/v1/validation/validate",
        json!({
            "entity_type": "characters",
            "records": [{"name": "Carol", "project_id": 1}]
        }),
    )
    .await;
    let json = body_json(response).await;
    let report_id = json["data"]["report_id"].as_i64().unwrap();

    // Fetch CSV.
    let app = build_test_app(pool).await;
    let response = get(app, &format!("/api/v1/imports/{report_id}/report/csv")).await;
    assert_eq!(response.status(), StatusCode::OK);

    // Check Content-Type header.
    let content_type = response
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert_eq!(content_type, "text/csv");
}

// ---------------------------------------------------------------------------
// Test: POST /api/v1/imports/{id}/commit changes status
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_commit_import(pool: PgPool) {
    // Create a preview report.
    let app = build_test_app(pool.clone()).await;
    let response = post_json(
        app,
        "/api/v1/validation/validate",
        json!({
            "entity_type": "characters",
            "records": [{"name": "Dave", "project_id": 1}]
        }),
    )
    .await;
    let json = body_json(response).await;
    let report_id = json["data"]["report_id"].as_i64().unwrap();

    // Commit the import.
    let app = build_test_app(pool).await;
    let response = post_json(
        app,
        &format!("/api/v1/imports/{report_id}/commit"),
        json!({}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
}

// ---------------------------------------------------------------------------
// Test: POST /api/v1/imports/{id}/commit on already-committed returns 409
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_commit_already_committed_returns_409(pool: PgPool) {
    // Create a preview report.
    let app = build_test_app(pool.clone()).await;
    let response = post_json(
        app,
        "/api/v1/validation/validate",
        json!({
            "entity_type": "characters",
            "records": [{"name": "Eve", "project_id": 1}]
        }),
    )
    .await;
    let json = body_json(response).await;
    let report_id = json["data"]["report_id"].as_i64().unwrap();

    // Commit once.
    let app = build_test_app(pool.clone()).await;
    let first_commit = post_json(
        app,
        &format!("/api/v1/imports/{report_id}/commit"),
        json!({}),
    )
    .await;
    assert_eq!(first_commit.status(), StatusCode::OK);

    // Try to commit again -- should fail.
    let app = build_test_app(pool).await;
    let response = post_json(
        app,
        &format!("/api/v1/imports/{report_id}/commit"),
        json!({}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CONFLICT);
}

// ---------------------------------------------------------------------------
// Test: GET /api/v1/imports/{nonexistent}/report returns 404
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_get_nonexistent_report_returns_404(pool: PgPool) {
    let app = build_test_app(pool).await;
    let response = get(app, "/api/v1/imports/99999/report").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// Test: CRUD validation rules
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_crud_validation_rule(pool: PgPool) {
    // Get the "required" rule type ID.
    let app = build_test_app(pool.clone()).await;
    let response = get(app, "/api/v1/validation/rule-types").await;
    let json = body_json(response).await;
    let rule_type_id = json["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["name"] == "required")
        .expect("'required' rule type should exist")["id"]
        .as_i64()
        .unwrap();

    // Create a rule.
    let app = build_test_app(pool.clone()).await;
    let response = post_json(
        app,
        "/api/v1/validation/rules",
        json!({
            "entity_type": "characters",
            "field_name": "custom_field",
            "rule_type_id": rule_type_id,
            "error_message": "Custom field is required"
        }),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let json = body_json(response).await;
    let rule_id = json["data"]["id"].as_i64().unwrap();

    // Update the rule.
    let app = build_test_app(pool.clone()).await;
    let response = put_json(
        app,
        &format!("/api/v1/validation/rules/{rule_id}"),
        json!({"error_message": "Updated message"}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["data"]["error_message"], "Updated message");

    // Delete the rule.
    let app = build_test_app(pool.clone()).await;
    let response = delete(app, &format!("/api/v1/validation/rules/{rule_id}")).await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    // Verify it's gone (delete again should return 404).
    let app = build_test_app(pool).await;
    let response = delete(app, &format!("/api/v1/validation/rules/{rule_id}")).await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// Test: GET /api/v1/imports lists reports
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_imports(pool: PgPool) {
    // Create a report via validate.
    let app = build_test_app(pool.clone()).await;
    post_json(
        app,
        "/api/v1/validation/validate",
        json!({
            "entity_type": "characters",
            "records": [{"name": "Frank", "project_id": 1}]
        }),
    )
    .await;

    // List imports.
    let app = build_test_app(pool).await;
    let response = get(app, "/api/v1/imports").await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    let data = json["data"].as_array().expect("data should be an array");
    assert!(
        !data.is_empty(),
        "should have at least one import report after validation"
    );
}

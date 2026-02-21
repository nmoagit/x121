//! Integration tests for the script orchestrator API (PRD-09, Phase 6).
//!
//! Tests cover script registration, listing, retrieval, deactivation,
//! test execution, and execution history via the admin API endpoints.

mod common;

use axum::http::StatusCode;
use common::{body_json, delete_auth, get_auth, post_json_auth};
use sqlx::PgPool;

// ---------------------------------------------------------------------------
// Test 1: Register a shell script via POST /admin/scripts
// ---------------------------------------------------------------------------

/// Admin registers a shell script and receives 201 with the script details.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn register_shell_script(pool: PgPool) {
    let (_admin, password) = common::create_test_user(&pool, "script_admin1", 1).await;

    let app = common::build_test_app(pool.clone()).await;
    let token = common::login_for_token(app, "script_admin1", &password).await;

    let body = serde_json::json!({
        "name": "test_echo_script",
        "description": "A simple echo script for testing",
        "script_type_id": 1,
        "file_path": "/tmp/echo_test.sh",
        "timeout_secs": 30,
        "version": "1.0.0"
    });

    let app = common::build_test_app(pool).await;
    let response = post_json_auth(app, "/api/v1/admin/scripts", body, &token).await;

    assert_eq!(response.status(), StatusCode::CREATED);
    let json = body_json(response).await;
    let data = &json["data"];
    assert_eq!(data["name"], "test_echo_script");
    assert_eq!(data["description"], "A simple echo script for testing");
    assert_eq!(data["script_type_name"], "shell");
    assert_eq!(data["file_path"], "/tmp/echo_test.sh");
    assert_eq!(data["timeout_secs"], 30);
    assert_eq!(data["is_enabled"], true);
    assert_eq!(data["version"], "1.0.0");
}

// ---------------------------------------------------------------------------
// Test 2: List scripts via GET /admin/scripts
// ---------------------------------------------------------------------------

/// After registering a script, listing returns it in the response.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn list_scripts_includes_registered(pool: PgPool) {
    let (_admin, password) = common::create_test_user(&pool, "script_admin2", 1).await;

    // Login.
    let app = common::build_test_app(pool.clone()).await;
    let token = common::login_for_token(app, "script_admin2", &password).await;

    // Register a script.
    let body = serde_json::json!({
        "name": "list_test_script",
        "script_type_id": 1,
        "file_path": "/tmp/list_test.sh"
    });
    let app = common::build_test_app(pool.clone()).await;
    let create_resp = post_json_auth(app, "/api/v1/admin/scripts", body, &token).await;
    assert_eq!(create_resp.status(), StatusCode::CREATED);

    // List scripts.
    let app = common::build_test_app(pool).await;
    let response = get_auth(app, "/api/v1/admin/scripts", &token).await;

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    let scripts = json["data"].as_array().expect("data should be an array");
    assert!(
        scripts.iter().any(|s| s["name"] == "list_test_script"),
        "registered script should appear in the list"
    );
}

// ---------------------------------------------------------------------------
// Test 3: Get script by ID via GET /admin/scripts/:id
// ---------------------------------------------------------------------------

/// Retrieve a specific script by its ID and verify the details.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn get_script_by_id(pool: PgPool) {
    let (_admin, password) = common::create_test_user(&pool, "script_admin3", 1).await;

    let app = common::build_test_app(pool.clone()).await;
    let token = common::login_for_token(app, "script_admin3", &password).await;

    // Register.
    let body = serde_json::json!({
        "name": "get_by_id_script",
        "description": "Detailed description",
        "script_type_id": 1,
        "file_path": "/tmp/get_by_id.sh"
    });
    let app = common::build_test_app(pool.clone()).await;
    let create_resp = post_json_auth(app, "/api/v1/admin/scripts", body, &token).await;
    assert_eq!(create_resp.status(), StatusCode::CREATED);
    let create_json = body_json(create_resp).await;
    let script_id = create_json["data"]["id"]
        .as_i64()
        .expect("id should be a number");

    // Get by ID.
    let app = common::build_test_app(pool).await;
    let uri = format!("/api/v1/admin/scripts/{script_id}");
    let response = get_auth(app, &uri, &token).await;

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    let data = &json["data"];
    assert_eq!(data["id"], script_id);
    assert_eq!(data["name"], "get_by_id_script");
    assert_eq!(data["description"], "Detailed description");
    assert_eq!(data["script_type_name"], "shell");
}

// ---------------------------------------------------------------------------
// Test 4: Deactivate a script via DELETE /admin/scripts/:id
// ---------------------------------------------------------------------------

/// Deactivate a script and verify it is disabled (is_enabled = false).
#[sqlx::test(migrations = "../../../db/migrations")]
async fn deactivate_script(pool: PgPool) {
    let (_admin, password) = common::create_test_user(&pool, "script_admin4", 1).await;

    let app = common::build_test_app(pool.clone()).await;
    let token = common::login_for_token(app, "script_admin4", &password).await;

    // Register.
    let body = serde_json::json!({
        "name": "deactivate_test_script",
        "script_type_id": 1,
        "file_path": "/tmp/deactivate_test.sh"
    });
    let app = common::build_test_app(pool.clone()).await;
    let create_resp = post_json_auth(app, "/api/v1/admin/scripts", body, &token).await;
    assert_eq!(create_resp.status(), StatusCode::CREATED);
    let create_json = body_json(create_resp).await;
    let script_id = create_json["data"]["id"]
        .as_i64()
        .expect("id should be a number");

    // Deactivate.
    let app = common::build_test_app(pool.clone()).await;
    let uri = format!("/api/v1/admin/scripts/{script_id}");
    let response = delete_auth(app, &uri, &token).await;

    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    // Verify it is disabled by fetching it again.
    let app = common::build_test_app(pool).await;
    let get_resp = get_auth(app, &uri, &token).await;
    assert_eq!(get_resp.status(), StatusCode::OK);
    let json = body_json(get_resp).await;
    assert_eq!(json["data"]["is_enabled"], false);
}

// ---------------------------------------------------------------------------
// Test 5: Test script execution via POST /admin/scripts/:id/test
// ---------------------------------------------------------------------------

/// Execute a shell script via the test endpoint and verify output is captured.
///
/// Creates a temporary shell script on disk, registers it, then runs it
/// through the orchestrator test endpoint.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_script_execution(pool: PgPool) {
    use std::io::Write;

    let (_admin, password) = common::create_test_user(&pool, "script_admin5", 1).await;

    // Create a real shell script on disk that echoes its stdin.
    let mut script_file = tempfile::Builder::new()
        .suffix(".sh")
        .tempfile()
        .expect("create temp script file");
    writeln!(script_file, "#!/bin/bash").expect("write shebang");
    writeln!(script_file, "cat").expect("write body");
    let script_path = script_file
        .path()
        .to_str()
        .expect("path should be valid UTF-8")
        .to_string();

    // Login.
    let app = common::build_test_app(pool.clone()).await;
    let token = common::login_for_token(app, "script_admin5", &password).await;

    // Register the script.
    let body = serde_json::json!({
        "name": "exec_test_echo",
        "script_type_id": 1,
        "file_path": script_path,
        "timeout_secs": 10
    });
    let app = common::build_test_app(pool.clone()).await;
    let create_resp = post_json_auth(app, "/api/v1/admin/scripts", body, &token).await;
    assert_eq!(create_resp.status(), StatusCode::CREATED);
    let create_json = body_json(create_resp).await;
    let script_id = create_json["data"]["id"]
        .as_i64()
        .expect("id should be a number");

    // Execute the script via the test endpoint (needs orchestrator).
    let app = common::build_test_app_with_orchestrator(pool).await;
    let uri = format!("/api/v1/admin/scripts/{script_id}/test");
    let test_body = serde_json::json!({
        "test_data": { "hello": "world" }
    });
    let response = post_json_auth(app, &uri, test_body, &token).await;

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    let data = &json["data"];
    assert_eq!(data["exit_code"], 0);
    assert!(
        data["stdout"].as_str().unwrap_or("").contains("hello"),
        "stdout should contain the echoed input, got: {}",
        data["stdout"]
    );
}

// ---------------------------------------------------------------------------
// Test 6: Execution history via GET /admin/scripts/:id/executions
// ---------------------------------------------------------------------------

/// After running a script, the execution record appears in the history list.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn execution_history_contains_run(pool: PgPool) {
    use std::io::Write;

    let (_admin, password) = common::create_test_user(&pool, "script_admin6", 1).await;

    // Create a real shell script on disk.
    let mut script_file = tempfile::Builder::new()
        .suffix(".sh")
        .tempfile()
        .expect("create temp script file");
    writeln!(script_file, "#!/bin/bash").expect("write shebang");
    writeln!(script_file, "echo done").expect("write body");
    let script_path = script_file
        .path()
        .to_str()
        .expect("path should be valid UTF-8")
        .to_string();

    // Login.
    let app = common::build_test_app(pool.clone()).await;
    let token = common::login_for_token(app, "script_admin6", &password).await;

    // Register.
    let body = serde_json::json!({
        "name": "history_test_script",
        "script_type_id": 1,
        "file_path": script_path,
        "timeout_secs": 10
    });
    let app = common::build_test_app(pool.clone()).await;
    let create_resp = post_json_auth(app, "/api/v1/admin/scripts", body, &token).await;
    assert_eq!(create_resp.status(), StatusCode::CREATED);
    let create_json = body_json(create_resp).await;
    let script_id = create_json["data"]["id"]
        .as_i64()
        .expect("id should be a number");

    // Execute via test endpoint.
    let app = common::build_test_app_with_orchestrator(pool.clone()).await;
    let uri = format!("/api/v1/admin/scripts/{script_id}/test");
    let test_body = serde_json::json!({ "test_data": {} });
    let exec_resp = post_json_auth(app, &uri, test_body, &token).await;
    assert_eq!(exec_resp.status(), StatusCode::OK);

    // Fetch execution history.
    let app = common::build_test_app(pool).await;
    let history_uri = format!("/api/v1/admin/scripts/{script_id}/executions");
    let history_resp = get_auth(app, &history_uri, &token).await;

    assert_eq!(history_resp.status(), StatusCode::OK);
    let json = body_json(history_resp).await;
    let executions = json["data"].as_array().expect("data should be an array");
    assert!(
        !executions.is_empty(),
        "execution history should contain at least one record"
    );
    // The most recent execution should be for our script.
    assert_eq!(executions[0]["script_id"], script_id);
    // It should be completed (status_name = "completed").
    assert_eq!(executions[0]["status_name"], "completed");
}

// ---------------------------------------------------------------------------
// Test 7: Unauthenticated access to script endpoints returns 401
// ---------------------------------------------------------------------------

/// Script endpoints require admin authentication.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn script_endpoints_require_auth(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = common::get(app, "/api/v1/admin/scripts").await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// Test 8: Non-admin user is forbidden from script endpoints
// ---------------------------------------------------------------------------

/// A creator-role user (role_id=2) cannot access script admin endpoints.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn script_endpoints_require_admin_role(pool: PgPool) {
    let (_user, password) = common::create_test_user(&pool, "script_creator", 2).await;

    let app = common::build_test_app(pool.clone()).await;
    let token = common::login_for_token(app, "script_creator", &password).await;

    let app = common::build_test_app(pool).await;
    let response = get_auth(app, "/api/v1/admin/scripts", &token).await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

// ---------------------------------------------------------------------------
// Test 9: Register script with missing name returns 400
// ---------------------------------------------------------------------------

/// Validation: an empty name is rejected.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn register_script_missing_name_returns_400(pool: PgPool) {
    let (_admin, password) = common::create_test_user(&pool, "script_admin_val", 1).await;

    let app = common::build_test_app(pool.clone()).await;
    let token = common::login_for_token(app, "script_admin_val", &password).await;

    let body = serde_json::json!({
        "name": "",
        "script_type_id": 1,
        "file_path": "/tmp/empty_name.sh"
    });
    let app = common::build_test_app(pool).await;
    let response = post_json_auth(app, "/api/v1/admin/scripts", body, &token).await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

// ---------------------------------------------------------------------------
// Test 10: Get nonexistent script returns 404
// ---------------------------------------------------------------------------

/// Fetching a script ID that does not exist returns 404.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn get_nonexistent_script_returns_404(pool: PgPool) {
    let (_admin, password) = common::create_test_user(&pool, "script_admin_404", 1).await;

    let app = common::build_test_app(pool.clone()).await;
    let token = common::login_for_token(app, "script_admin_404", &password).await;

    let app = common::build_test_app(pool).await;
    let response = get_auth(app, "/api/v1/admin/scripts/999999", &token).await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

//! HTTP-level integration tests for PRD-03 auth and admin API endpoints.
//!
//! Tests cover login, token refresh, logout, RBAC enforcement,
//! admin user management, and account lockout.

mod common;

use axum::http::StatusCode;
use common::{body_json, get, get_auth, post_json, post_json_auth};
use sqlx::PgPool;
use trulience_api::auth::password::hash_password;
use trulience_db::models::user::CreateUser;
use trulience_db::repositories::UserRepo;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Create a test user directly in the database and return the user row plus
/// the plaintext password used.
async fn create_test_user(
    pool: &PgPool,
    username: &str,
    role_id: i64,
) -> (trulience_db::models::user::User, String) {
    let password = "test_password_123!";
    let hashed = hash_password(password).expect("hashing should succeed");
    let input = CreateUser {
        username: username.to_string(),
        email: format!("{username}@test.com"),
        password_hash: hashed,
        role_id,
    };
    let user = UserRepo::create(pool, &input)
        .await
        .expect("user creation should succeed");
    (user, password.to_string())
}

/// Log in a user via the API and return the JSON response containing
/// `access_token`, `refresh_token`, and `user` info.
async fn login_user(
    app: axum::Router,
    username: &str,
    password: &str,
) -> serde_json::Value {
    let body = serde_json::json!({ "username": username, "password": password });
    let response = post_json(app, "/api/v1/auth/login", body).await;
    assert_eq!(response.status(), StatusCode::OK);
    body_json(response).await
}

// ---------------------------------------------------------------------------
// Auth flow tests
// ---------------------------------------------------------------------------

/// Successful login returns 200 with access_token, refresh_token, and user info.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_login_success(pool: PgPool) {
    let (user, password) = create_test_user(&pool, "loginuser", 1).await;
    let app = common::build_test_app(pool).await;

    let json = login_user(app, "loginuser", &password).await;

    assert!(json["access_token"].is_string(), "response must contain access_token");
    assert!(json["refresh_token"].is_string(), "response must contain refresh_token");
    assert!(json["expires_in"].is_number(), "response must contain expires_in");
    assert_eq!(json["user"]["id"], user.id);
    assert_eq!(json["user"]["username"], "loginuser");
    assert_eq!(json["user"]["email"], "loginuser@test.com");
    assert_eq!(json["user"]["role"], "admin");
}

/// Login with an incorrect password returns 401.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_login_wrong_password(pool: PgPool) {
    let (_user, _password) = create_test_user(&pool, "wrongpw", 1).await;
    let app = common::build_test_app(pool).await;

    let body = serde_json::json!({ "username": "wrongpw", "password": "incorrect_password" });
    let response = post_json(app, "/api/v1/auth/login", body).await;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

/// Login with a nonexistent username returns 401.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_login_nonexistent_user(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    let body = serde_json::json!({ "username": "ghost", "password": "whatever" });
    let response = post_json(app, "/api/v1/auth/login", body).await;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

/// Login to a deactivated account returns 403.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_login_inactive_user(pool: PgPool) {
    let (user, password) = create_test_user(&pool, "inactive", 1).await;
    UserRepo::deactivate(&pool, user.id)
        .await
        .expect("deactivation should succeed");

    let app = common::build_test_app(pool).await;

    let body = serde_json::json!({ "username": "inactive", "password": password });
    let response = post_json(app, "/api/v1/auth/login", body).await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

/// A valid refresh token returns new tokens.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_token_refresh(pool: PgPool) {
    let (_user, password) = create_test_user(&pool, "refresher", 1).await;

    let app = common::build_test_app(pool.clone()).await;
    let login_json = login_user(app, "refresher", &password).await;
    let refresh_token = login_json["refresh_token"].as_str().unwrap();

    let app = common::build_test_app(pool).await;
    let body = serde_json::json!({ "refresh_token": refresh_token });
    let response = post_json(app, "/api/v1/auth/refresh", body).await;

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert!(json["access_token"].is_string(), "refreshed response must contain access_token");
    assert!(json["refresh_token"].is_string(), "refreshed response must contain refresh_token");
    // Token rotation: the new refresh token must differ from the original.
    assert_ne!(
        json["refresh_token"].as_str().unwrap(),
        refresh_token,
        "refresh token must rotate on use"
    );
}

/// Refreshing with a garbage token returns 401.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_refresh_with_invalid_token(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    let body = serde_json::json!({ "refresh_token": "not-a-real-token" });
    let response = post_json(app, "/api/v1/auth/refresh", body).await;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

/// Logout revokes sessions and returns 204 No Content.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_logout(pool: PgPool) {
    let (_user, password) = create_test_user(&pool, "logoutuser", 1).await;

    let app = common::build_test_app(pool.clone()).await;
    let login_json = login_user(app, "logoutuser", &password).await;
    let access_token = login_json["access_token"].as_str().unwrap();

    let app = common::build_test_app(pool).await;
    let body = serde_json::json!({});
    let response = post_json_auth(app, "/api/v1/auth/logout", body, access_token).await;

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

// ---------------------------------------------------------------------------
// RBAC enforcement tests
// ---------------------------------------------------------------------------

/// Admin endpoints require authentication -- missing token returns 401.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_admin_endpoint_requires_auth(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = get(app, "/api/v1/admin/users").await;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

/// A non-admin user (creator, role_id=2) is forbidden from admin endpoints.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_admin_endpoint_requires_admin_role(pool: PgPool) {
    let (_user, password) = create_test_user(&pool, "creatoruser", 2).await;

    let app = common::build_test_app(pool.clone()).await;
    let login_json = login_user(app, "creatoruser", &password).await;
    let token = login_json["access_token"].as_str().unwrap();

    let app = common::build_test_app(pool).await;
    let response = get_auth(app, "/api/v1/admin/users", token).await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

// ---------------------------------------------------------------------------
// Admin user management tests
// ---------------------------------------------------------------------------

/// Admin can create a new user via POST /admin/users and receives 201.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_admin_create_user(pool: PgPool) {
    let (_admin, admin_pw) = create_test_user(&pool, "adminmgr", 1).await;

    let app = common::build_test_app(pool.clone()).await;
    let login_json = login_user(app, "adminmgr", &admin_pw).await;
    let token = login_json["access_token"].as_str().unwrap();

    let app = common::build_test_app(pool).await;
    let new_user_body = serde_json::json!({
        "username": "newuser",
        "email": "newuser@test.com",
        "password": "strong_password_123!",
        "role_id": 2
    });
    let response =
        post_json_auth(app, "/api/v1/admin/users", new_user_body, token).await;

    assert_eq!(response.status(), StatusCode::CREATED);
    let json = body_json(response).await;
    assert_eq!(json["username"], "newuser");
    assert_eq!(json["email"], "newuser@test.com");
    assert_eq!(json["role"], "creator");
    assert_eq!(json["role_id"], 2);
    assert!(json["is_active"].as_bool().unwrap());
}

/// Admin can list users via GET /admin/users.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_admin_list_users(pool: PgPool) {
    let (_admin, admin_pw) = create_test_user(&pool, "listadmin", 1).await;
    // Create a second user so the list has more than one entry.
    let (_user2, _) = create_test_user(&pool, "listuser2", 2).await;

    let app = common::build_test_app(pool.clone()).await;
    let login_json = login_user(app, "listadmin", &admin_pw).await;
    let token = login_json["access_token"].as_str().unwrap();

    let app = common::build_test_app(pool).await;
    let response = get_auth(app, "/api/v1/admin/users", token).await;

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    let users = json.as_array().expect("response body should be an array");
    assert!(
        users.len() >= 2,
        "list should contain at least the two created users"
    );
}

/// Account lockout: after 5 failed login attempts the account is locked.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_account_lockout(pool: PgPool) {
    let (_user, _password) = create_test_user(&pool, "lockme", 1).await;

    // Fail login 5 times with the wrong password to trigger the lock.
    for _ in 0..5 {
        let app = common::build_test_app(pool.clone()).await;
        let body = serde_json::json!({ "username": "lockme", "password": "wrong_pass" });
        let response = post_json(app, "/api/v1/auth/login", body).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    // The 6th attempt (even with the wrong password) should return 403 (locked).
    let app = common::build_test_app(pool).await;
    let body = serde_json::json!({ "username": "lockme", "password": "wrong_pass" });
    let response = post_json(app, "/api/v1/auth/login", body).await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let json = body_json(response).await;
    let error_msg = json["error"].as_str().unwrap_or("");
    assert!(
        error_msg.contains("locked"),
        "error message should mention the account is locked, got: {error_msg}"
    );
}

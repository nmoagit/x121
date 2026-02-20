//! HTTP-level integration tests for the `/trash` API endpoints.
//!
//! Uses Axum's tower::ServiceExt to send requests directly to the router.
//! Entities are created and soft-deleted via the repository layer to set up
//! test scenarios, then verified through the HTTP API.

mod common;

use axum::http::StatusCode;
use common::{body_json, build_test_app, delete, get, post_json};
use sqlx::PgPool;
use trulience_db::models::character::CreateCharacter;
use trulience_db::models::project::CreateProject;
use trulience_db::repositories::{CharacterRepo, ProjectRepo};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn new_project(name: &str) -> CreateProject {
    CreateProject {
        name: name.to_string(),
        description: None,
        status_id: None,
        retention_days: None,
    }
}

fn new_character(project_id: i64, name: &str) -> CreateCharacter {
    CreateCharacter {
        project_id,
        name: name.to_string(),
        status_id: None,
        metadata: None,
        settings: None,
    }
}

// ---------------------------------------------------------------------------
// Test: GET /api/v1/trash returns empty list when nothing is trashed
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_trash_empty(pool: PgPool) {
    let app = build_test_app(pool).await;
    let response = get(app, "/api/v1/trash").await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert!(
        json["items"].as_array().unwrap().is_empty(),
        "items should be empty when nothing is trashed"
    );
    assert_eq!(json["total_count"], 0);
}

// ---------------------------------------------------------------------------
// Test: GET /api/v1/trash shows soft-deleted project
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_trash_after_soft_delete(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Trash List Test"))
        .await
        .unwrap();
    ProjectRepo::soft_delete(&pool, project.id).await.unwrap();

    let app = build_test_app(pool).await;
    let response = get(app, "/api/v1/trash").await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    let items = json["items"].as_array().unwrap();
    assert!(
        items.iter().any(|item| {
            item["id"].as_i64() == Some(project.id) && item["entity_type"] == "projects"
        }),
        "trashed project should appear in trash list"
    );
    assert!(json["total_count"].as_i64().unwrap() >= 1);
}

// ---------------------------------------------------------------------------
// Test: GET /api/v1/trash?type=projects filters by entity type
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_trash_filtered_by_type(pool: PgPool) {
    // Create and soft-delete a project.
    let project = ProjectRepo::create(&pool, &new_project("Filter Project"))
        .await
        .unwrap();
    ProjectRepo::soft_delete(&pool, project.id).await.unwrap();

    // Create and soft-delete a character (under a different project that stays alive).
    let project2 = ProjectRepo::create(&pool, &new_project("Filter CharProject"))
        .await
        .unwrap();
    let character = CharacterRepo::create(&pool, &new_character(project2.id, "Filter Char"))
        .await
        .unwrap();
    CharacterRepo::soft_delete(&pool, character.id)
        .await
        .unwrap();

    // Filter by projects -- should only see the project, not the character.
    let app = build_test_app(pool).await;
    let response = get(app, "/api/v1/trash?type=projects").await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    let items = json["items"].as_array().unwrap();
    assert!(
        items.iter().all(|item| item["entity_type"] == "projects"),
        "all items should be of type 'projects' when filtered"
    );
    assert!(
        items
            .iter()
            .any(|item| item["id"].as_i64() == Some(project.id)),
        "the trashed project should be in the filtered list"
    );
    // Note: we cannot check by character.id alone because each table has its
    // own BIGSERIAL sequence — character.id may equal a project.id numerically.
    // The entity_type assertion above already proves no characters are present.
    assert_eq!(
        items.len(),
        1,
        "should only contain the one trashed project, not the character"
    );
}

// ---------------------------------------------------------------------------
// Test: POST /api/v1/trash/projects/{id}/restore restores a trashed project
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_restore_trashed_item(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Restore API Test"))
        .await
        .unwrap();
    ProjectRepo::soft_delete(&pool, project.id).await.unwrap();

    // Restore via API.
    let app = build_test_app(pool.clone()).await;
    let response = post_json(
        app,
        &format!("/api/v1/trash/projects/{}/restore", project.id),
        serde_json::json!({}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert_eq!(json["restored"], true);
    assert_eq!(json["entity_type"], "projects");
    assert_eq!(json["id"], project.id);

    // Verify the project is visible again via the normal GET endpoint.
    let app = build_test_app(pool).await;
    let response = get(app, &format!("/api/v1/projects/{}", project.id)).await;
    assert_eq!(response.status(), StatusCode::OK);
}

// ---------------------------------------------------------------------------
// Test: restoring a child whose parent is trashed returns 409
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_restore_child_with_trashed_parent_409(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Parent Trashed"))
        .await
        .unwrap();
    let character = CharacterRepo::create(&pool, &new_character(project.id, "Orphan"))
        .await
        .unwrap();

    // Soft-delete both.
    ProjectRepo::soft_delete(&pool, project.id).await.unwrap();
    CharacterRepo::soft_delete(&pool, character.id)
        .await
        .unwrap();

    // Try to restore the character -- should fail because parent project is trashed.
    let app = build_test_app(pool).await;
    let response = post_json(
        app,
        &format!("/api/v1/trash/characters/{}/restore", character.id),
        serde_json::json!({}),
    )
    .await;
    assert_eq!(
        response.status(),
        StatusCode::CONFLICT,
        "restoring child with trashed parent should return 409"
    );
}

// ---------------------------------------------------------------------------
// Test: GET /api/v1/trash/purge-preview returns counts
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_purge_preview(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Purge Preview"))
        .await
        .unwrap();
    ProjectRepo::soft_delete(&pool, project.id).await.unwrap();

    let app = build_test_app(pool).await;
    let response = get(app, "/api/v1/trash/purge-preview").await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    assert!(
        json["total_count"].as_i64().unwrap() >= 1,
        "total_count should be at least 1"
    );
    let counts = json["counts_by_type"].as_array().unwrap();
    assert!(
        counts
            .iter()
            .any(|c| c["entity_type"] == "projects" && c["count"].as_i64().unwrap() >= 1),
        "counts_by_type should include projects with count >= 1"
    );
}

// ---------------------------------------------------------------------------
// Test: DELETE /api/v1/trash/projects/{id}/purge permanently removes one item
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_purge_single_item(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Purge One"))
        .await
        .unwrap();
    ProjectRepo::soft_delete(&pool, project.id).await.unwrap();

    // Purge the single item.
    let app = build_test_app(pool.clone()).await;
    let response = delete(app, &format!("/api/v1/trash/projects/{}/purge", project.id)).await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    // Verify it is gone from the trash.
    let app = build_test_app(pool).await;
    let response = get(app, "/api/v1/trash").await;
    let json = body_json(response).await;
    let items = json["items"].as_array().unwrap();
    assert!(
        !items
            .iter()
            .any(|item| item["id"].as_i64() == Some(project.id)),
        "purged project should not appear in trash"
    );
}

// ---------------------------------------------------------------------------
// Test: DELETE /api/v1/trash/purge permanently removes all trashed items
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_purge_all(pool: PgPool) {
    // Create and soft-delete 2 projects.
    let p1 = ProjectRepo::create(&pool, &new_project("Purge All 1"))
        .await
        .unwrap();
    let p2 = ProjectRepo::create(&pool, &new_project("Purge All 2"))
        .await
        .unwrap();
    ProjectRepo::soft_delete(&pool, p1.id).await.unwrap();
    ProjectRepo::soft_delete(&pool, p2.id).await.unwrap();

    // Purge all.
    let app = build_test_app(pool.clone()).await;
    let response = delete(app, "/api/v1/trash/purge").await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    // Verify trash is empty.
    let app = build_test_app(pool).await;
    let response = get(app, "/api/v1/trash").await;
    let json = body_json(response).await;
    assert_eq!(
        json["total_count"], 0,
        "trash should be empty after purge all"
    );
    assert!(json["items"].as_array().unwrap().is_empty());
}

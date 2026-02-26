//! HTTP-level integration tests for PRD-111: Scene Catalog & Track Management API.
//!
//! Uses Axum's tower::ServiceExt to send requests directly to the router.
//! Seed data (2 tracks, 26 catalog entries) is created by migrations.
//! Prerequisite entities (project, character) are created via the repository
//! layer to keep tests focused on HTTP behaviour.

mod common;

use axum::http::StatusCode;
use common::{body_json, build_test_app, delete, get, post_json, put_json};
use sqlx::PgPool;
use x121_db::models::character::CreateCharacter;
use x121_db::models::project::CreateProject;
use x121_db::repositories::{CharacterRepo, ProjectRepo, ProjectSceneSettingRepo};

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
// Test: GET /api/v1/scene-catalog returns entries with tracks
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_list_scene_catalog(pool: PgPool) {
    let app = build_test_app(pool).await;
    let response = get(app, "/api/v1/scene-catalog").await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    let data = json["data"].as_array().expect("data should be an array");
    assert_eq!(data.len(), 26, "should return all 26 seeded catalog entries");

    // Each entry should have tracks array
    let first = &data[0];
    assert!(first["tracks"].is_array(), "entry should have tracks array");
    assert!(first["name"].is_string(), "entry should have name");
    assert!(first["slug"].is_string(), "entry should have slug");
}

// ---------------------------------------------------------------------------
// Test: POST + GET roundtrip for scene catalog
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_create_and_get_scene_catalog(pool: PgPool) {
    // Get a track ID from the seeded data
    let app = build_test_app(pool.clone()).await;
    let tracks_resp = get(app, "/api/v1/tracks").await;
    let tracks_json = body_json(tracks_resp).await;
    let clothed_id = tracks_json["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["slug"] == "clothed")
        .unwrap()["id"]
        .as_i64()
        .unwrap();

    // POST create
    let app = build_test_app(pool.clone()).await;
    let create_resp = post_json(
        app,
        "/api/v1/scene-catalog",
        serde_json::json!({
            "name": "API Test Scene",
            "slug": "api_test_scene",
            "description": "Created via API",
            "has_clothes_off_transition": true,
            "sort_order": 200,
            "track_ids": [clothed_id]
        }),
    )
    .await;
    assert_eq!(create_resp.status(), StatusCode::CREATED);

    let created = body_json(create_resp).await;
    let id = created["data"]["id"].as_i64().unwrap();
    assert_eq!(created["data"]["name"], "API Test Scene");
    assert_eq!(created["data"]["slug"], "api_test_scene");
    assert_eq!(created["data"]["has_clothes_off_transition"], true);
    let tracks = created["data"]["tracks"].as_array().unwrap();
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0]["slug"], "clothed");

    // GET by id
    let app = build_test_app(pool).await;
    let get_resp = get(app, &format!("/api/v1/scene-catalog/{id}")).await;
    assert_eq!(get_resp.status(), StatusCode::OK);

    let fetched = body_json(get_resp).await;
    assert_eq!(fetched["data"]["id"], id);
    assert_eq!(fetched["data"]["name"], "API Test Scene");
    assert_eq!(fetched["data"]["tracks"].as_array().unwrap().len(), 1);
}

// ---------------------------------------------------------------------------
// Test: PUT update scene catalog with track replacement
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_update_scene_catalog(pool: PgPool) {
    // Get track IDs
    let app = build_test_app(pool.clone()).await;
    let tracks_resp = get(app, "/api/v1/tracks").await;
    let tracks_json = body_json(tracks_resp).await;
    let tracks_arr = tracks_json["data"].as_array().unwrap();
    let clothed_id = tracks_arr
        .iter()
        .find(|t| t["slug"] == "clothed")
        .unwrap()["id"]
        .as_i64()
        .unwrap();
    let topless_id = tracks_arr
        .iter()
        .find(|t| t["slug"] == "topless")
        .unwrap()["id"]
        .as_i64()
        .unwrap();

    // Create entry with clothed only
    let app = build_test_app(pool.clone()).await;
    let create_resp = post_json(
        app,
        "/api/v1/scene-catalog",
        serde_json::json!({
            "name": "Update Test",
            "slug": "update_test",
            "track_ids": [clothed_id]
        }),
    )
    .await;
    let created = body_json(create_resp).await;
    let id = created["data"]["id"].as_i64().unwrap();

    // Update: change name, replace tracks with both
    let app = build_test_app(pool.clone()).await;
    let update_resp = put_json(
        app,
        &format!("/api/v1/scene-catalog/{id}"),
        serde_json::json!({
            "name": "Update Test V2",
            "track_ids": [clothed_id, topless_id]
        }),
    )
    .await;
    assert_eq!(update_resp.status(), StatusCode::OK);

    let updated = body_json(update_resp).await;
    assert_eq!(updated["data"]["name"], "Update Test V2");
    assert_eq!(
        updated["data"]["tracks"].as_array().unwrap().len(),
        2,
        "should now have both tracks"
    );
}

// ---------------------------------------------------------------------------
// Test: DELETE (deactivate) scene catalog returns 204
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_deactivate_scene_catalog(pool: PgPool) {
    // Create an entry
    let app = build_test_app(pool.clone()).await;
    let create_resp = post_json(
        app,
        "/api/v1/scene-catalog",
        serde_json::json!({
            "name": "Deactivate Me",
            "slug": "deactivate_me"
        }),
    )
    .await;
    let created = body_json(create_resp).await;
    let id = created["data"]["id"].as_i64().unwrap();

    // DELETE (deactivate)
    let app = build_test_app(pool.clone()).await;
    let response = delete(app, &format!("/api/v1/scene-catalog/{id}")).await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    // GET should still return the entry (it is deactivated, not deleted)
    // But list without include_inactive should not include it
    let app = build_test_app(pool.clone()).await;
    let list_resp = get(app, "/api/v1/scene-catalog").await;
    let list_json = body_json(list_resp).await;
    let entries = list_json["data"].as_array().unwrap();
    assert!(
        !entries.iter().any(|e| e["id"] == id),
        "deactivated entry should not appear in default list"
    );

    // With include_inactive=true, should appear
    let app = build_test_app(pool).await;
    let list_resp = get(app, "/api/v1/scene-catalog?include_inactive=true").await;
    let list_json = body_json(list_resp).await;
    let entries = list_json["data"].as_array().unwrap();
    assert!(
        entries.iter().any(|e| e["id"] == id),
        "deactivated entry should appear with include_inactive=true"
    );
}

// ---------------------------------------------------------------------------
// Test: Track CRUD API (GET list, POST create, PUT update)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_track_crud_api(pool: PgPool) {
    // GET /api/v1/tracks - should return seeded tracks
    let app = build_test_app(pool.clone()).await;
    let response = get(app, "/api/v1/tracks").await;
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    let data = json["data"].as_array().unwrap();
    assert!(data.len() >= 2, "should have at least 2 seeded tracks");

    // POST /api/v1/tracks
    let app = build_test_app(pool.clone()).await;
    let create_resp = post_json(
        app,
        "/api/v1/tracks",
        serde_json::json!({
            "name": "Bikini",
            "slug": "bikini",
            "sort_order": 3
        }),
    )
    .await;
    assert_eq!(create_resp.status(), StatusCode::CREATED);
    let created = body_json(create_resp).await;
    let track_id = created["data"]["id"].as_i64().unwrap();
    assert_eq!(created["data"]["name"], "Bikini");
    assert_eq!(created["data"]["slug"], "bikini");
    assert_eq!(created["data"]["sort_order"], 3);

    // PUT /api/v1/tracks/{id}
    let app = build_test_app(pool.clone()).await;
    let update_resp = put_json(
        app,
        &format!("/api/v1/tracks/{track_id}"),
        serde_json::json!({
            "name": "Bikini V2",
            "sort_order": 5
        }),
    )
    .await;
    assert_eq!(update_resp.status(), StatusCode::OK);
    let updated = body_json(update_resp).await;
    assert_eq!(updated["data"]["name"], "Bikini V2");
    assert_eq!(updated["data"]["sort_order"], 5);

    // PUT non-existent returns 404
    let app = build_test_app(pool).await;
    let not_found_resp = put_json(
        app,
        "/api/v1/tracks/999999",
        serde_json::json!({"name": "Ghost"}),
    )
    .await;
    assert_eq!(not_found_resp.status(), StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// Test: Project scene settings API (effective list, bulk update, toggle)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_project_scene_settings_api(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("API PSS"))
        .await
        .unwrap();
    let pid = project.id;

    // GET /api/v1/projects/{pid}/scene-settings
    let app = build_test_app(pool.clone()).await;
    let response = get(app, &format!("/api/v1/projects/{pid}/scene-settings")).await;
    assert_eq!(response.status(), StatusCode::OK);

    let json = body_json(response).await;
    let data = json["data"].as_array().unwrap();
    assert_eq!(data.len(), 26, "should return all 26 effective settings");
    // All should have source "catalog" initially
    assert!(data.iter().all(|s| s["source"] == "catalog"));

    // Find the intro scene_catalog_id
    let intro = data.iter().find(|s| s["slug"] == "intro").unwrap();
    let intro_id = intro["scene_catalog_id"].as_i64().unwrap();

    // PUT /{scene_catalog_id} - toggle single
    let app = build_test_app(pool.clone()).await;
    let toggle_resp = put_json(
        app,
        &format!("/api/v1/projects/{pid}/scene-settings/{intro_id}"),
        serde_json::json!({"scene_catalog_id": intro_id, "is_enabled": false}),
    )
    .await;
    assert_eq!(toggle_resp.status(), StatusCode::OK);
    let toggled = body_json(toggle_resp).await;
    assert_eq!(toggled["data"]["is_enabled"], false);

    // Verify effective list shows source=project for intro
    let app = build_test_app(pool.clone()).await;
    let response = get(app, &format!("/api/v1/projects/{pid}/scene-settings")).await;
    let json = body_json(response).await;
    let data = json["data"].as_array().unwrap();
    let intro_updated = data
        .iter()
        .find(|s| s["scene_catalog_id"] == intro_id)
        .unwrap();
    assert_eq!(intro_updated["source"], "project");
    assert_eq!(intro_updated["is_enabled"], false);

    // PUT / (bulk update) - find another scene to update
    let idle = data.iter().find(|s| s["slug"] == "idle").unwrap();
    let idle_id = idle["scene_catalog_id"].as_i64().unwrap();

    let app = build_test_app(pool.clone()).await;
    let bulk_resp = put_json(
        app,
        &format!("/api/v1/projects/{pid}/scene-settings"),
        serde_json::json!({
            "settings": [
                {"scene_catalog_id": intro_id, "is_enabled": true},
                {"scene_catalog_id": idle_id, "is_enabled": false}
            ]
        }),
    )
    .await;
    assert_eq!(bulk_resp.status(), StatusCode::OK);
    let bulk_json = body_json(bulk_resp).await;
    let bulk_data = bulk_json["data"].as_array().unwrap();
    assert_eq!(bulk_data.len(), 2, "bulk response should return 2 settings");
}

// ---------------------------------------------------------------------------
// Test: Character scene overrides API (three-level effective, bulk, toggle, delete)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_character_scene_overrides_api(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("API CSO"))
        .await
        .unwrap();
    let character = CharacterRepo::create(&pool, &new_character(project.id, "Override API Char"))
        .await
        .unwrap();
    let cid = character.id;

    // GET /api/v1/characters/{cid}/scene-settings (no overrides = all catalog)
    let app = build_test_app(pool.clone()).await;
    let response = get(app, &format!("/api/v1/characters/{cid}/scene-settings")).await;
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    let data = json["data"].as_array().unwrap();
    assert_eq!(data.len(), 26);
    assert!(data.iter().all(|s| s["source"] == "catalog"));

    // Set up a project-level override first
    let intro = data.iter().find(|s| s["slug"] == "intro").unwrap();
    let intro_id = intro["scene_catalog_id"].as_i64().unwrap();
    ProjectSceneSettingRepo::upsert(&pool, project.id, intro_id, false)
        .await
        .unwrap();

    // Character effective should show intro as source=project
    let app = build_test_app(pool.clone()).await;
    let response = get(app, &format!("/api/v1/characters/{cid}/scene-settings")).await;
    let json = body_json(response).await;
    let data = json["data"].as_array().unwrap();
    let intro_setting = data
        .iter()
        .find(|s| s["scene_catalog_id"] == intro_id)
        .unwrap();
    assert_eq!(intro_setting["source"], "project");
    assert_eq!(intro_setting["is_enabled"], false);

    // PUT /{scene_catalog_id} - character override
    let app = build_test_app(pool.clone()).await;
    let toggle_resp = put_json(
        app,
        &format!("/api/v1/characters/{cid}/scene-settings/{intro_id}"),
        serde_json::json!({"scene_catalog_id": intro_id, "is_enabled": true}),
    )
    .await;
    assert_eq!(toggle_resp.status(), StatusCode::OK);

    // Verify effective shows source=character
    let app = build_test_app(pool.clone()).await;
    let response = get(app, &format!("/api/v1/characters/{cid}/scene-settings")).await;
    let json = body_json(response).await;
    let data = json["data"].as_array().unwrap();
    let intro_char = data
        .iter()
        .find(|s| s["scene_catalog_id"] == intro_id)
        .unwrap();
    assert_eq!(intro_char["source"], "character");
    assert_eq!(intro_char["is_enabled"], true);

    // DELETE /{scene_catalog_id} - remove character override
    let app = build_test_app(pool.clone()).await;
    let del_resp = delete(
        app,
        &format!("/api/v1/characters/{cid}/scene-settings/{intro_id}"),
    )
    .await;
    assert_eq!(del_resp.status(), StatusCode::NO_CONTENT);

    // After delete, should fall back to project level
    let app = build_test_app(pool.clone()).await;
    let response = get(app, &format!("/api/v1/characters/{cid}/scene-settings")).await;
    let json = body_json(response).await;
    let data = json["data"].as_array().unwrap();
    let intro_fallback = data
        .iter()
        .find(|s| s["scene_catalog_id"] == intro_id)
        .unwrap();
    assert_eq!(intro_fallback["source"], "project");
    assert_eq!(intro_fallback["is_enabled"], false);

    // PUT / (bulk update)
    let idle = data.iter().find(|s| s["slug"] == "idle").unwrap();
    let idle_id = idle["scene_catalog_id"].as_i64().unwrap();

    let app = build_test_app(pool.clone()).await;
    let bulk_resp = put_json(
        app,
        &format!("/api/v1/characters/{cid}/scene-settings"),
        serde_json::json!({
            "overrides": [
                {"scene_catalog_id": intro_id, "is_enabled": true},
                {"scene_catalog_id": idle_id, "is_enabled": false}
            ]
        }),
    )
    .await;
    assert_eq!(bulk_resp.status(), StatusCode::OK);
    let bulk_json = body_json(bulk_resp).await;
    let bulk_data = bulk_json["data"].as_array().unwrap();
    assert_eq!(bulk_data.len(), 2);

    // DELETE non-existent override returns 404
    let app = build_test_app(pool).await;
    let del_404 = delete(
        app,
        &format!("/api/v1/characters/{cid}/scene-settings/999999"),
    )
    .await;
    assert_eq!(del_404.status(), StatusCode::NOT_FOUND);
}

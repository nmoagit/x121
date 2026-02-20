//! Integration tests for soft-delete, restore, and hard-delete behaviour.
//!
//! Exercises the repository layer against a real database to verify that:
//! - Soft-deleted entities are hidden from `find_by_id` and list queries
//! - Restoring a soft-deleted entity makes it visible again
//! - Hard-delete permanently removes a record
//! - Soft-delete is idempotent (second call returns `false`)
//! - The pattern is consistent across entity types (project, character, scene)

use sqlx::PgPool;
use trulience_db::models::character::CreateCharacter;
use trulience_db::models::image::CreateImageVariant;
use trulience_db::models::project::CreateProject;
use trulience_db::models::scene::CreateScene;
use trulience_db::models::scene_type::CreateSceneType;
use trulience_db::repositories::{
    CharacterRepo, ImageVariantRepo, ProjectRepo, SceneRepo, SceneTypeRepo,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn new_project(name: &str) -> CreateProject {
    CreateProject {
        name: name.to_string(),
        description: Some("soft delete test".to_string()),
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

fn new_scene_type(project_id: Option<i64>, name: &str) -> CreateSceneType {
    CreateSceneType {
        project_id,
        name: name.to_string(),
        status_id: None,
        workflow_json: None,
        lora_config: None,
        prompt_template: None,
        target_duration_secs: None,
        segment_duration_secs: None,
        variant_applicability: None,
        transition_segment_index: None,
        is_studio_level: None,
    }
}

fn new_image_variant(character_id: i64, label: &str, path: &str) -> CreateImageVariant {
    CreateImageVariant {
        character_id,
        source_image_id: None,
        derived_image_id: None,
        variant_label: label.to_string(),
        status_id: None,
        file_path: path.to_string(),
    }
}

fn new_scene(character_id: i64, scene_type_id: i64, image_variant_id: i64) -> CreateScene {
    CreateScene {
        character_id,
        scene_type_id,
        image_variant_id,
        status_id: None,
        transition_mode: None,
    }
}

// ---------------------------------------------------------------------------
// Test: soft_delete hides entity from find_by_id
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_soft_delete_hides_from_find_by_id(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Hidden Project"))
        .await
        .unwrap();

    let deleted = ProjectRepo::soft_delete(&pool, project.id).await.unwrap();
    assert!(deleted, "soft_delete should return true on first call");

    let found = ProjectRepo::find_by_id(&pool, project.id).await.unwrap();
    assert!(
        found.is_none(),
        "find_by_id should return None for soft-deleted project"
    );
}

// ---------------------------------------------------------------------------
// Test: soft_delete hides entity from list
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_soft_delete_hides_from_list(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Listed Then Deleted"))
        .await
        .unwrap();

    // Verify it shows up in list before deletion.
    let before = ProjectRepo::list(&pool).await.unwrap();
    assert!(
        before.iter().any(|p| p.id == project.id),
        "project should appear in list before soft delete"
    );

    ProjectRepo::soft_delete(&pool, project.id).await.unwrap();

    let after = ProjectRepo::list(&pool).await.unwrap();
    assert!(
        !after.iter().any(|p| p.id == project.id),
        "project should not appear in list after soft delete"
    );
}

// ---------------------------------------------------------------------------
// Test: restore makes entity visible again
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_restore_makes_visible_again(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Restore Me"))
        .await
        .unwrap();

    ProjectRepo::soft_delete(&pool, project.id).await.unwrap();
    assert!(
        ProjectRepo::find_by_id(&pool, project.id)
            .await
            .unwrap()
            .is_none(),
        "should be hidden after soft delete"
    );

    let restored = ProjectRepo::restore(&pool, project.id).await.unwrap();
    assert!(restored, "restore should return true");

    let found = ProjectRepo::find_by_id(&pool, project.id).await.unwrap();
    assert!(
        found.is_some(),
        "find_by_id should return Some after restore"
    );
    assert_eq!(found.unwrap().name, "Restore Me");
}

// ---------------------------------------------------------------------------
// Test: hard_delete permanently removes record
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_hard_delete_permanently_removes(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Gone Forever"))
        .await
        .unwrap();

    let deleted = ProjectRepo::hard_delete(&pool, project.id).await.unwrap();
    assert!(deleted, "hard_delete should return true");

    // find_by_id (excludes deleted) should return None.
    let found = ProjectRepo::find_by_id(&pool, project.id).await.unwrap();
    assert!(found.is_none(), "find_by_id should return None after hard delete");

    // find_by_id_include_deleted should also return None -- row is truly gone.
    let found_inc = ProjectRepo::find_by_id_include_deleted(&pool, project.id)
        .await
        .unwrap();
    assert!(
        found_inc.is_none(),
        "find_by_id_include_deleted should return None after hard delete"
    );
}

// ---------------------------------------------------------------------------
// Test: soft_delete is idempotent on already-deleted entity
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_soft_delete_idempotent_on_already_deleted(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("Delete Twice"))
        .await
        .unwrap();

    let first = ProjectRepo::soft_delete(&pool, project.id).await.unwrap();
    assert!(first, "first soft_delete should return true");

    let second = ProjectRepo::soft_delete(&pool, project.id).await.unwrap();
    assert!(
        !second,
        "second soft_delete should return false (already deleted)"
    );
}

// ---------------------------------------------------------------------------
// Test: soft_delete works consistently for Scene entity type
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_soft_delete_scene_also_works(pool: PgPool) {
    // Build the prerequisite hierarchy: project -> character -> scene_type -> image_variant -> scene
    let project = ProjectRepo::create(&pool, &new_project("Scene SD"))
        .await
        .unwrap();
    let character = CharacterRepo::create(&pool, &new_character(project.id, "SceneChar"))
        .await
        .unwrap();
    let scene_type = SceneTypeRepo::create(&pool, &new_scene_type(Some(project.id), "Walk"))
        .await
        .unwrap();
    let variant = ImageVariantRepo::create(
        &pool,
        &new_image_variant(character.id, "clothed", "/img/scene_sd.png"),
    )
    .await
    .unwrap();
    let scene = SceneRepo::create(
        &pool,
        &new_scene(character.id, scene_type.id, variant.id),
    )
    .await
    .unwrap();

    // Soft-delete the scene.
    let deleted = SceneRepo::soft_delete(&pool, scene.id).await.unwrap();
    assert!(deleted, "soft_delete on scene should return true");

    let found = SceneRepo::find_by_id(&pool, scene.id).await.unwrap();
    assert!(
        found.is_none(),
        "find_by_id should return None for soft-deleted scene"
    );

    // Restore the scene.
    let restored = SceneRepo::restore(&pool, scene.id).await.unwrap();
    assert!(restored, "restore on scene should return true");

    let found = SceneRepo::find_by_id(&pool, scene.id).await.unwrap();
    assert!(
        found.is_some(),
        "find_by_id should return Some after restoring scene"
    );
}

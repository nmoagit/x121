//! Integration tests for PRD-111: Scene Catalog & Track Management.
//!
//! Exercises the repository layer against a real database:
//! - Track CRUD (create, find_by_id, list, update, deactivate)
//! - Scene catalog CRUD with track associations
//! - Junction table management (add_track, remove_track, set_tracks)
//! - Project scene settings (three-level merge: catalog -> project -> character)
//! - Character scene overrides (leaf tier of the inheritance chain)
//! - Seed data verification (2 tracks, 26 catalog entries, junction rows)

use sqlx::PgPool;
use x121_db::models::character::CreateCharacter;
use x121_db::models::project::CreateProject;
use x121_db::models::scene_catalog::CreateSceneCatalogEntry;
use x121_db::models::track::CreateTrack;
use x121_db::repositories::{
    CharacterRepo, CharacterSceneOverrideRepo, ProjectRepo, ProjectSceneSettingRepo,
    SceneCatalogRepo, TrackRepo,
};

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

fn new_track(name: &str, slug: &str) -> CreateTrack {
    CreateTrack {
        name: name.to_string(),
        slug: slug.to_string(),
        sort_order: None,
        is_active: None,
    }
}

fn new_catalog_entry(name: &str, slug: &str) -> CreateSceneCatalogEntry {
    CreateSceneCatalogEntry {
        name: name.to_string(),
        slug: slug.to_string(),
        description: None,
        has_clothes_off_transition: None,
        sort_order: None,
        is_active: None,
        track_ids: vec![],
    }
}

// ---------------------------------------------------------------------------
// Test: Track CRUD
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_track_crud(pool: PgPool) {
    // Create
    let track = TrackRepo::create(&pool, &new_track("Lingerie", "lingerie"))
        .await
        .unwrap();
    assert_eq!(track.name, "Lingerie");
    assert_eq!(track.slug, "lingerie");
    assert_eq!(track.sort_order, 0); // default
    assert!(track.is_active);

    // Find by id
    let found = TrackRepo::find_by_id(&pool, track.id)
        .await
        .unwrap()
        .expect("track should exist");
    assert_eq!(found.id, track.id);
    assert_eq!(found.name, "Lingerie");

    // List active only (should include seeded tracks + our new one)
    let active_tracks = TrackRepo::list(&pool, false).await.unwrap();
    assert!(
        active_tracks.iter().any(|t| t.id == track.id),
        "new track should appear in active list"
    );

    // Update
    let updated = TrackRepo::update(
        &pool,
        track.id,
        &x121_db::models::track::UpdateTrack {
            name: Some("Lingerie V2".to_string()),
            sort_order: Some(99),
            is_active: None,
        },
    )
    .await
    .unwrap()
    .expect("update should return the row");
    assert_eq!(updated.name, "Lingerie V2");
    assert_eq!(updated.sort_order, 99);
    assert!(updated.is_active); // unchanged

    // Deactivate
    let deactivated = TrackRepo::deactivate(&pool, track.id).await.unwrap();
    assert!(deactivated, "deactivate should return true");

    // After deactivation, list active should not include it
    let active_after = TrackRepo::list(&pool, false).await.unwrap();
    assert!(
        !active_after.iter().any(|t| t.id == track.id),
        "deactivated track should not appear in active list"
    );

    // List with include_inactive should still include it
    let all_tracks = TrackRepo::list(&pool, true).await.unwrap();
    assert!(
        all_tracks.iter().any(|t| t.id == track.id),
        "deactivated track should appear in include_inactive list"
    );

    // Deactivate again should return false (already inactive)
    let deactivated_again = TrackRepo::deactivate(&pool, track.id).await.unwrap();
    assert!(
        !deactivated_again,
        "deactivating an already-inactive track should return false"
    );
}

// ---------------------------------------------------------------------------
// Test: Scene catalog CRUD
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_scene_catalog_crud(pool: PgPool) {
    // Get track IDs from seeded data
    let tracks = TrackRepo::list(&pool, false).await.unwrap();
    let clothed_id = tracks.iter().find(|t| t.slug == "clothed").unwrap().id;
    let topless_id = tracks.iter().find(|t| t.slug == "topless").unwrap().id;

    // Create with tracks
    let entry = SceneCatalogRepo::create(
        &pool,
        &CreateSceneCatalogEntry {
            name: "Test Scene".to_string(),
            slug: "test_scene".to_string(),
            description: Some("A test scene".to_string()),
            has_clothes_off_transition: Some(true),
            sort_order: Some(100),
            is_active: Some(true),
            track_ids: vec![clothed_id, topless_id],
        },
    )
    .await
    .unwrap();
    assert_eq!(entry.name, "Test Scene");
    assert_eq!(entry.slug, "test_scene");
    assert_eq!(entry.description.as_deref(), Some("A test scene"));
    assert!(entry.has_clothes_off_transition);
    assert_eq!(entry.sort_order, 100);
    assert!(entry.is_active);

    // Find by id
    let found = SceneCatalogRepo::find_by_id(&pool, entry.id)
        .await
        .unwrap()
        .expect("entry should exist");
    assert_eq!(found.id, entry.id);

    // Find by id with tracks
    let with_tracks = SceneCatalogRepo::find_by_id_with_tracks(&pool, entry.id)
        .await
        .unwrap()
        .expect("entry should exist");
    assert_eq!(with_tracks.tracks.len(), 2);

    // List (active only)
    let list = SceneCatalogRepo::list(&pool, false).await.unwrap();
    assert!(
        list.iter().any(|e| e.id == entry.id),
        "new entry should appear in list"
    );

    // Update
    let updated = SceneCatalogRepo::update(
        &pool,
        entry.id,
        &x121_db::models::scene_catalog::UpdateSceneCatalogEntry {
            name: Some("Test Scene Updated".to_string()),
            description: None,
            has_clothes_off_transition: Some(false),
            sort_order: None,
            is_active: None,
            track_ids: Some(vec![clothed_id]), // remove topless
        },
    )
    .await
    .unwrap()
    .expect("update should return the row");
    assert_eq!(updated.name, "Test Scene Updated");
    assert!(!updated.has_clothes_off_transition);

    // Verify tracks were replaced
    let tracks_after = SceneCatalogRepo::get_tracks_for_scene(&pool, entry.id)
        .await
        .unwrap();
    assert_eq!(tracks_after.len(), 1);
    assert_eq!(tracks_after[0].id, clothed_id);

    // Deactivate
    let deactivated = SceneCatalogRepo::deactivate(&pool, entry.id).await.unwrap();
    assert!(deactivated);

    // After deactivation, list active should not include it
    let active_list = SceneCatalogRepo::list(&pool, false).await.unwrap();
    assert!(
        !active_list.iter().any(|e| e.id == entry.id),
        "deactivated entry should not appear in active list"
    );

    // include_inactive should still show it
    let all_list = SceneCatalogRepo::list(&pool, true).await.unwrap();
    assert!(
        all_list.iter().any(|e| e.id == entry.id),
        "deactivated entry should appear with include_inactive"
    );
}

// ---------------------------------------------------------------------------
// Test: Scene catalog track management
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_scene_catalog_track_management(pool: PgPool) {
    // Create a custom track for this test
    let custom_track = TrackRepo::create(&pool, &new_track("Custom Track", "custom_track"))
        .await
        .unwrap();

    let tracks = TrackRepo::list(&pool, false).await.unwrap();
    let clothed_id = tracks.iter().find(|t| t.slug == "clothed").unwrap().id;

    // Create catalog entry without tracks
    let entry = SceneCatalogRepo::create(&pool, &new_catalog_entry("Track Mgmt", "track_mgmt"))
        .await
        .unwrap();

    // Initially no tracks
    let entry_tracks = SceneCatalogRepo::get_tracks_for_scene(&pool, entry.id)
        .await
        .unwrap();
    assert_eq!(entry_tracks.len(), 0, "no tracks initially");

    // add_track
    SceneCatalogRepo::add_track(&pool, entry.id, clothed_id)
        .await
        .unwrap();
    let entry_tracks = SceneCatalogRepo::get_tracks_for_scene(&pool, entry.id)
        .await
        .unwrap();
    assert_eq!(entry_tracks.len(), 1);
    assert_eq!(entry_tracks[0].id, clothed_id);

    // add_track is idempotent
    SceneCatalogRepo::add_track(&pool, entry.id, clothed_id)
        .await
        .unwrap();
    let entry_tracks = SceneCatalogRepo::get_tracks_for_scene(&pool, entry.id)
        .await
        .unwrap();
    assert_eq!(
        entry_tracks.len(),
        1,
        "idempotent add should not create duplicate"
    );

    // Add another track
    SceneCatalogRepo::add_track(&pool, entry.id, custom_track.id)
        .await
        .unwrap();
    let entry_tracks = SceneCatalogRepo::get_tracks_for_scene(&pool, entry.id)
        .await
        .unwrap();
    assert_eq!(entry_tracks.len(), 2);

    // remove_track
    let removed = SceneCatalogRepo::remove_track(&pool, entry.id, custom_track.id)
        .await
        .unwrap();
    assert!(removed, "remove_track should return true");
    let entry_tracks = SceneCatalogRepo::get_tracks_for_scene(&pool, entry.id)
        .await
        .unwrap();
    assert_eq!(entry_tracks.len(), 1);

    // remove_track returns false for non-existent association
    let removed_again = SceneCatalogRepo::remove_track(&pool, entry.id, custom_track.id)
        .await
        .unwrap();
    assert!(
        !removed_again,
        "removing non-existent association should return false"
    );

    // set_tracks replaces all associations
    SceneCatalogRepo::set_tracks(&pool, entry.id, &[custom_track.id])
        .await
        .unwrap();
    let entry_tracks = SceneCatalogRepo::get_tracks_for_scene(&pool, entry.id)
        .await
        .unwrap();
    assert_eq!(entry_tracks.len(), 1);
    assert_eq!(entry_tracks[0].id, custom_track.id);

    // set_tracks to empty clears all associations
    SceneCatalogRepo::set_tracks(&pool, entry.id, &[]).await.unwrap();
    let entry_tracks = SceneCatalogRepo::get_tracks_for_scene(&pool, entry.id)
        .await
        .unwrap();
    assert_eq!(entry_tracks.len(), 0, "set_tracks with empty should clear");

    // list_with_tracks includes track data
    SceneCatalogRepo::set_tracks(&pool, entry.id, &[clothed_id, custom_track.id])
        .await
        .unwrap();
    let with_tracks = SceneCatalogRepo::list_with_tracks(&pool, false).await.unwrap();
    let our_entry = with_tracks
        .iter()
        .find(|e| e.entry.id == entry.id)
        .expect("entry should be in list");
    assert_eq!(our_entry.tracks.len(), 2);
}

// ---------------------------------------------------------------------------
// Test: Project scene settings (catalog -> project two-level merge)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_project_scene_settings(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("PSS Test"))
        .await
        .unwrap();

    // list_effective with no project overrides should return all 26 catalog
    // entries, each with source = "catalog"
    let effective = ProjectSceneSettingRepo::list_effective(&pool, project.id)
        .await
        .unwrap();
    assert_eq!(
        effective.len(),
        26,
        "should return all 26 active catalog entries"
    );
    assert!(
        effective.iter().all(|s| s.source == "catalog"),
        "all sources should be 'catalog' with no project overrides"
    );
    assert!(
        effective.iter().all(|s| s.is_enabled),
        "all should be enabled by default (catalog.is_active = true)"
    );

    // Upsert an override to disable a scene
    let intro = effective
        .iter()
        .find(|s| s.slug == "intro")
        .expect("intro should be in catalog");
    let intro_id = intro.scene_catalog_id;

    ProjectSceneSettingRepo::upsert(&pool, project.id, intro_id, false)
        .await
        .unwrap();

    // Verify source changes to "project"
    let effective_after = ProjectSceneSettingRepo::list_effective(&pool, project.id)
        .await
        .unwrap();
    let intro_setting = effective_after
        .iter()
        .find(|s| s.scene_catalog_id == intro_id)
        .unwrap();
    assert_eq!(intro_setting.source, "project");
    assert!(!intro_setting.is_enabled, "intro should be disabled");

    // Delete override -> should revert to catalog default
    let deleted = ProjectSceneSettingRepo::delete(&pool, project.id, intro_id)
        .await
        .unwrap();
    assert!(deleted, "delete should return true");

    let effective_reverted = ProjectSceneSettingRepo::list_effective(&pool, project.id)
        .await
        .unwrap();
    let intro_reverted = effective_reverted
        .iter()
        .find(|s| s.scene_catalog_id == intro_id)
        .unwrap();
    assert_eq!(intro_reverted.source, "catalog");
    assert!(intro_reverted.is_enabled, "should revert to catalog default");

    // Delete non-existent override should return false
    let deleted_again = ProjectSceneSettingRepo::delete(&pool, project.id, intro_id)
        .await
        .unwrap();
    assert!(
        !deleted_again,
        "deleting non-existent override should return false"
    );
}

// ---------------------------------------------------------------------------
// Test: Character scene overrides (three-level merge)
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_character_scene_overrides(pool: PgPool) {
    let project = ProjectRepo::create(&pool, &new_project("CSO Test"))
        .await
        .unwrap();
    let character = CharacterRepo::create(&pool, &new_character(project.id, "Override Char"))
        .await
        .unwrap();

    // Step 1: list_effective with no overrides -> all "catalog" source
    let effective = CharacterSceneOverrideRepo::list_effective(&pool, character.id, project.id)
        .await
        .unwrap();
    assert_eq!(effective.len(), 26);
    assert!(
        effective.iter().all(|s| s.source == "catalog"),
        "all sources should be 'catalog' initially"
    );

    // Step 2: Add a project-level override for "idle" -> disable it
    let idle = effective
        .iter()
        .find(|s| s.slug == "idle")
        .expect("idle should be in catalog");
    let idle_id = idle.scene_catalog_id;

    ProjectSceneSettingRepo::upsert(&pool, project.id, idle_id, false)
        .await
        .unwrap();

    // Character effective should now show idle as source="project", is_enabled=false
    let effective2 = CharacterSceneOverrideRepo::list_effective(&pool, character.id, project.id)
        .await
        .unwrap();
    let idle_setting = effective2
        .iter()
        .find(|s| s.scene_catalog_id == idle_id)
        .unwrap();
    assert_eq!(idle_setting.source, "project");
    assert!(!idle_setting.is_enabled, "idle should be disabled at project level");

    // Step 3: Add a character-level override for "idle" -> re-enable it
    CharacterSceneOverrideRepo::upsert(&pool, character.id, idle_id, true)
        .await
        .unwrap();

    let effective3 = CharacterSceneOverrideRepo::list_effective(&pool, character.id, project.id)
        .await
        .unwrap();
    let idle_char = effective3
        .iter()
        .find(|s| s.scene_catalog_id == idle_id)
        .unwrap();
    assert_eq!(idle_char.source, "character");
    assert!(idle_char.is_enabled, "idle should be re-enabled at character level");

    // Step 4: Delete character override -> should fall back to project level (disabled)
    let deleted = CharacterSceneOverrideRepo::delete(&pool, character.id, idle_id)
        .await
        .unwrap();
    assert!(deleted);

    let effective4 = CharacterSceneOverrideRepo::list_effective(&pool, character.id, project.id)
        .await
        .unwrap();
    let idle_fallback = effective4
        .iter()
        .find(|s| s.scene_catalog_id == idle_id)
        .unwrap();
    assert_eq!(
        idle_fallback.source, "project",
        "should fall back to project override after character delete"
    );
    assert!(
        !idle_fallback.is_enabled,
        "should inherit project-level disabled state"
    );

    // Step 5: delete_all with multiple overrides
    let bj = effective
        .iter()
        .find(|s| s.slug == "bj")
        .expect("bj should be in catalog");
    CharacterSceneOverrideRepo::upsert(&pool, character.id, idle_id, true)
        .await
        .unwrap();
    CharacterSceneOverrideRepo::upsert(&pool, character.id, bj.scene_catalog_id, false)
        .await
        .unwrap();

    let deleted_count = CharacterSceneOverrideRepo::delete_all(&pool, character.id)
        .await
        .unwrap();
    assert_eq!(deleted_count, 2, "delete_all should remove 2 overrides");

    // After delete_all, no character-level sources should remain
    let effective5 = CharacterSceneOverrideRepo::list_effective(&pool, character.id, project.id)
        .await
        .unwrap();
    assert!(
        !effective5.iter().any(|s| s.source == "character"),
        "no character-level overrides should remain after delete_all"
    );
}

// ---------------------------------------------------------------------------
// Test: Seed data verification
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_seed_data(pool: PgPool) {
    // Verify 2 tracks seeded
    let tracks = TrackRepo::list(&pool, false).await.unwrap();
    let clothed = tracks.iter().find(|t| t.slug == "clothed");
    let topless = tracks.iter().find(|t| t.slug == "topless");
    assert!(clothed.is_some(), "clothed track should be seeded");
    assert!(topless.is_some(), "topless track should be seeded");
    let clothed = clothed.unwrap();
    let topless = topless.unwrap();
    assert_eq!(clothed.sort_order, 1);
    assert_eq!(topless.sort_order, 2);

    // Verify 26 catalog entries seeded
    let catalog = SceneCatalogRepo::list(&pool, false).await.unwrap();
    assert_eq!(catalog.len(), 26, "should have 26 seeded catalog entries");

    // Verify expected slugs are present
    let expected_slugs = [
        "intro",
        "idle",
        "boobs_fondle",
        "bj",
        "boobs_jumping",
        "bottom",
        "cowgirl",
        "cumshot",
        "dance",
        "deal",
        "doggy",
        "feet",
        "from_behind",
        "gloryhole_blowjob",
        "handjob",
        "kiss",
        "masturbation",
        "missionary",
        "orgasm",
        "pussy",
        "pussy_finger",
        "reverse_cowgirl",
        "sex",
        "side_fuck",
        "titwank",
        "twerking",
    ];
    for slug in expected_slugs {
        assert!(
            catalog.iter().any(|e| e.slug == slug),
            "catalog should contain slug '{slug}'"
        );
    }

    // Verify clothed track is assigned to all 26 entries
    let catalog_with_tracks = SceneCatalogRepo::list_with_tracks(&pool, false).await.unwrap();
    for entry in &catalog_with_tracks {
        assert!(
            entry.tracks.iter().any(|t| t.slug == "clothed"),
            "entry '{}' should have clothed track",
            entry.entry.slug
        );
    }

    // Verify topless track is assigned to the correct subset
    let topless_slugs = [
        "idle",
        "bj",
        "bottom",
        "cumshot",
        "dance",
        "deal",
        "feet",
        "from_behind",
        "handjob",
        "kiss",
        "orgasm",
        "pussy",
        "sex",
        "titwank",
    ];
    for entry in &catalog_with_tracks {
        let has_topless = entry.tracks.iter().any(|t| t.slug == "topless");
        let should_have_topless = topless_slugs.contains(&entry.entry.slug.as_str());
        assert_eq!(
            has_topless, should_have_topless,
            "entry '{}': has_topless={has_topless} but should_have_topless={should_have_topless}",
            entry.entry.slug
        );
    }
}

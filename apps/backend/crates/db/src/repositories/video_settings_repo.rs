//! Repository for the hierarchical video settings tables:
//! `project_video_settings`, `group_video_settings`, `character_video_settings`.

use sqlx::PgPool;
use x121_core::types::DbId;
use x121_core::video_settings::VideoSettingsLayer;

use crate::models::video_settings::{
    CharacterVideoSettings, GroupVideoSettings, ProjectVideoSettings, UpsertVideoSettings,
};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

const PROJECT_COLUMNS: &str = "id, project_id, scene_type_id, target_duration_secs, target_fps, \
     target_resolution, created_at, updated_at";

const GROUP_COLUMNS: &str = "id, group_id, scene_type_id, target_duration_secs, target_fps, \
     target_resolution, created_at, updated_at";

const CHARACTER_COLUMNS: &str =
    "id, character_id, scene_type_id, target_duration_secs, target_fps, \
     target_resolution, created_at, updated_at";

/// Provides CRUD operations for video settings at all hierarchy levels.
pub struct VideoSettingsRepo;

impl VideoSettingsRepo {
    // -----------------------------------------------------------------------
    // Project
    // -----------------------------------------------------------------------

    /// Upsert video settings for a project + scene type pair.
    pub async fn upsert_project(
        pool: &PgPool,
        project_id: DbId,
        scene_type_id: DbId,
        input: &UpsertVideoSettings,
    ) -> Result<ProjectVideoSettings, sqlx::Error> {
        let query = format!(
            "INSERT INTO project_video_settings
                (project_id, scene_type_id, target_duration_secs, target_fps, target_resolution)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (project_id, scene_type_id)
             DO UPDATE SET target_duration_secs = EXCLUDED.target_duration_secs,
                           target_fps = EXCLUDED.target_fps,
                           target_resolution = EXCLUDED.target_resolution
             RETURNING {PROJECT_COLUMNS}"
        );
        sqlx::query_as::<_, ProjectVideoSettings>(&query)
            .bind(project_id)
            .bind(scene_type_id)
            .bind(input.target_duration_secs)
            .bind(input.target_fps)
            .bind(&input.target_resolution)
            .fetch_one(pool)
            .await
    }

    /// Find video settings for a project + scene type pair.
    pub async fn find_project(
        pool: &PgPool,
        project_id: DbId,
        scene_type_id: DbId,
    ) -> Result<Option<ProjectVideoSettings>, sqlx::Error> {
        let query = format!(
            "SELECT {PROJECT_COLUMNS} FROM project_video_settings \
             WHERE project_id = $1 AND scene_type_id = $2"
        );
        sqlx::query_as::<_, ProjectVideoSettings>(&query)
            .bind(project_id)
            .bind(scene_type_id)
            .fetch_optional(pool)
            .await
    }

    /// List all video settings for a project, ordered by scene type.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<ProjectVideoSettings>, sqlx::Error> {
        let query = format!(
            "SELECT {PROJECT_COLUMNS} FROM project_video_settings \
             WHERE project_id = $1 ORDER BY scene_type_id"
        );
        sqlx::query_as::<_, ProjectVideoSettings>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Delete a project video settings row by ID. Returns `true` if removed.
    pub async fn delete_project(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM project_video_settings WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete project video settings by composite key. Returns `true` if removed.
    pub async fn delete_project_by_key(
        pool: &PgPool,
        project_id: DbId,
        scene_type_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM project_video_settings \
             WHERE project_id = $1 AND scene_type_id = $2",
        )
        .bind(project_id)
        .bind(scene_type_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Group
    // -----------------------------------------------------------------------

    /// Upsert video settings for a group + scene type pair.
    pub async fn upsert_group(
        pool: &PgPool,
        group_id: DbId,
        scene_type_id: DbId,
        input: &UpsertVideoSettings,
    ) -> Result<GroupVideoSettings, sqlx::Error> {
        let query = format!(
            "INSERT INTO group_video_settings
                (group_id, scene_type_id, target_duration_secs, target_fps, target_resolution)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (group_id, scene_type_id)
             DO UPDATE SET target_duration_secs = EXCLUDED.target_duration_secs,
                           target_fps = EXCLUDED.target_fps,
                           target_resolution = EXCLUDED.target_resolution
             RETURNING {GROUP_COLUMNS}"
        );
        sqlx::query_as::<_, GroupVideoSettings>(&query)
            .bind(group_id)
            .bind(scene_type_id)
            .bind(input.target_duration_secs)
            .bind(input.target_fps)
            .bind(&input.target_resolution)
            .fetch_one(pool)
            .await
    }

    /// Find video settings for a group + scene type pair.
    pub async fn find_group(
        pool: &PgPool,
        group_id: DbId,
        scene_type_id: DbId,
    ) -> Result<Option<GroupVideoSettings>, sqlx::Error> {
        let query = format!(
            "SELECT {GROUP_COLUMNS} FROM group_video_settings \
             WHERE group_id = $1 AND scene_type_id = $2"
        );
        sqlx::query_as::<_, GroupVideoSettings>(&query)
            .bind(group_id)
            .bind(scene_type_id)
            .fetch_optional(pool)
            .await
    }

    /// List all video settings for a group, ordered by scene type.
    pub async fn list_by_group(
        pool: &PgPool,
        group_id: DbId,
    ) -> Result<Vec<GroupVideoSettings>, sqlx::Error> {
        let query = format!(
            "SELECT {GROUP_COLUMNS} FROM group_video_settings \
             WHERE group_id = $1 ORDER BY scene_type_id"
        );
        sqlx::query_as::<_, GroupVideoSettings>(&query)
            .bind(group_id)
            .fetch_all(pool)
            .await
    }

    /// Delete a group video settings row by ID. Returns `true` if removed.
    pub async fn delete_group(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM group_video_settings WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete group video settings by composite key. Returns `true` if removed.
    pub async fn delete_group_by_key(
        pool: &PgPool,
        group_id: DbId,
        scene_type_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM group_video_settings \
             WHERE group_id = $1 AND scene_type_id = $2",
        )
        .bind(group_id)
        .bind(scene_type_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Character
    // -----------------------------------------------------------------------

    /// Upsert video settings for a character + scene type pair.
    pub async fn upsert_character(
        pool: &PgPool,
        character_id: DbId,
        scene_type_id: DbId,
        input: &UpsertVideoSettings,
    ) -> Result<CharacterVideoSettings, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_video_settings
                (character_id, scene_type_id, target_duration_secs, target_fps, target_resolution)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (character_id, scene_type_id)
             DO UPDATE SET target_duration_secs = EXCLUDED.target_duration_secs,
                           target_fps = EXCLUDED.target_fps,
                           target_resolution = EXCLUDED.target_resolution
             RETURNING {CHARACTER_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterVideoSettings>(&query)
            .bind(character_id)
            .bind(scene_type_id)
            .bind(input.target_duration_secs)
            .bind(input.target_fps)
            .bind(&input.target_resolution)
            .fetch_one(pool)
            .await
    }

    /// Find video settings for a character + scene type pair.
    pub async fn find_character(
        pool: &PgPool,
        character_id: DbId,
        scene_type_id: DbId,
    ) -> Result<Option<CharacterVideoSettings>, sqlx::Error> {
        let query = format!(
            "SELECT {CHARACTER_COLUMNS} FROM character_video_settings \
             WHERE character_id = $1 AND scene_type_id = $2"
        );
        sqlx::query_as::<_, CharacterVideoSettings>(&query)
            .bind(character_id)
            .bind(scene_type_id)
            .fetch_optional(pool)
            .await
    }

    /// List all video settings for a character, ordered by scene type.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<CharacterVideoSettings>, sqlx::Error> {
        let query = format!(
            "SELECT {CHARACTER_COLUMNS} FROM character_video_settings \
             WHERE character_id = $1 ORDER BY scene_type_id"
        );
        sqlx::query_as::<_, CharacterVideoSettings>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// Delete a character video settings row by ID. Returns `true` if removed.
    pub async fn delete_character(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM character_video_settings WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete character video settings by composite key. Returns `true` if removed.
    pub async fn delete_character_by_key(
        pool: &PgPool,
        character_id: DbId,
        scene_type_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM character_video_settings \
             WHERE character_id = $1 AND scene_type_id = $2",
        )
        .bind(character_id)
        .bind(scene_type_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Hierarchy helpers
    // -----------------------------------------------------------------------

    /// Load override layers for all three levels (project, group, character)
    /// in a single call. Returns `(project_layer, group_layer, char_layer)`.
    ///
    /// This is the CANONICAL way to fetch the hierarchy. Do NOT inline
    /// three separate `find_*` calls + manual `VideoSettingsLayer` construction.
    pub async fn load_hierarchy_layers(
        pool: &PgPool,
        project_id: DbId,
        group_id: Option<DbId>,
        character_id: DbId,
        scene_type_id: DbId,
    ) -> Result<
        (
            Option<VideoSettingsLayer>,
            Option<VideoSettingsLayer>,
            Option<VideoSettingsLayer>,
        ),
        sqlx::Error,
    > {
        let project_layer = Self::find_project(pool, project_id, scene_type_id)
            .await?
            .map(VideoSettingsLayer::from);

        let group_layer = if let Some(gid) = group_id {
            Self::find_group(pool, gid, scene_type_id)
                .await?
                .map(VideoSettingsLayer::from)
        } else {
            None
        };

        let char_layer = Self::find_character(pool, character_id, scene_type_id)
            .await?
            .map(VideoSettingsLayer::from);

        Ok((project_layer, group_layer, char_layer))
    }
}

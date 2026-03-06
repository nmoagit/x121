//! Repository for the `character_deliverable_ignores` table (PRD-126).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::character_deliverable_ignore::{
    CharacterDeliverableIgnore, CreateDeliverableIgnore,
};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str =
    "id, uuid, character_id, scene_type_id, track_id, ignored_by, reason, created_at";

/// Provides CRUD operations for character deliverable ignores.
pub struct CharacterDeliverableIgnoreRepo;

impl CharacterDeliverableIgnoreRepo {
    /// List all ignored deliverables for a character.
    pub async fn list_for_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<CharacterDeliverableIgnore>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_deliverable_ignores \
             WHERE character_id = $1 \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, CharacterDeliverableIgnore>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// Add a deliverable ignore entry. Uses ON CONFLICT DO NOTHING and returns
    /// the existing row if a duplicate constraint is hit.
    pub async fn add_ignore(
        pool: &PgPool,
        input: &CreateDeliverableIgnore,
    ) -> Result<CharacterDeliverableIgnore, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_deliverable_ignores \
                (character_id, scene_type_id, track_id, ignored_by, reason) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT ON CONSTRAINT uq_char_deliverable_ignore DO NOTHING \
             RETURNING {COLUMNS}"
        );
        let maybe = sqlx::query_as::<_, CharacterDeliverableIgnore>(&query)
            .bind(input.character_id)
            .bind(input.scene_type_id)
            .bind(input.track_id)
            .bind(&input.ignored_by)
            .bind(&input.reason)
            .fetch_optional(pool)
            .await?;

        // If ON CONFLICT fired, fetch the existing row.
        match maybe {
            Some(row) => Ok(row),
            None => {
                let fetch_query = format!(
                    "SELECT {COLUMNS} FROM character_deliverable_ignores \
                     WHERE character_id = $1 AND scene_type_id = $2 \
                       AND track_id IS NOT DISTINCT FROM $3"
                );
                sqlx::query_as::<_, CharacterDeliverableIgnore>(&fetch_query)
                    .bind(input.character_id)
                    .bind(input.scene_type_id)
                    .bind(input.track_id)
                    .fetch_one(pool)
                    .await
            }
        }
    }

    /// Remove a deliverable ignore by its UUID. Returns `true` if a row was deleted.
    pub async fn remove_by_uuid(
        pool: &PgPool,
        uuid: sqlx::types::Uuid,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM character_deliverable_ignores WHERE uuid = $1")
            .bind(uuid)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Check whether a specific deliverable is ignored for a character.
    pub async fn is_ignored(
        pool: &PgPool,
        character_id: DbId,
        scene_type_id: DbId,
        track_id: Option<DbId>,
    ) -> Result<bool, sqlx::Error> {
        let row: (bool,) = sqlx::query_as(
            "SELECT EXISTS( \
                SELECT 1 FROM character_deliverable_ignores \
                WHERE character_id = $1 AND scene_type_id = $2 \
                  AND track_id IS NOT DISTINCT FROM $3 \
            )",
        )
        .bind(character_id)
        .bind(scene_type_id)
        .bind(track_id)
        .fetch_one(pool)
        .await?;
        Ok(row.0)
    }
}

//! Repository for the `character_speeches` table (PRD-124).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::character_speech::{
    CharacterSpeech, CreateCharacterSpeech, UpdateCharacterSpeech,
};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, character_id, speech_type_id, version, text, \
                        created_at, updated_at, deleted_at";

/// Provides CRUD operations for character speech entries.
pub struct CharacterSpeechRepo;

impl CharacterSpeechRepo {
    /// List all non-deleted speeches for a character, ordered by type then version.
    pub async fn list_for_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<CharacterSpeech>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_speeches \
             WHERE character_id = $1 AND deleted_at IS NULL \
             ORDER BY speech_type_id, version"
        );
        sqlx::query_as::<_, CharacterSpeech>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// List non-deleted speeches for a character filtered by speech type.
    pub async fn list_for_character_by_type(
        pool: &PgPool,
        character_id: DbId,
        speech_type_id: i16,
    ) -> Result<Vec<CharacterSpeech>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_speeches \
             WHERE character_id = $1 AND speech_type_id = $2 AND deleted_at IS NULL \
             ORDER BY version"
        );
        sqlx::query_as::<_, CharacterSpeech>(&query)
            .bind(character_id)
            .bind(speech_type_id)
            .fetch_all(pool)
            .await
    }

    /// Create a new speech entry with auto-assigned version.
    ///
    /// Version is computed as `MAX(version) + 1` across all rows (including
    /// soft-deleted) for the same `(character_id, speech_type_id)` pair to
    /// prevent version number reuse.
    pub async fn create(
        pool: &PgPool,
        character_id: DbId,
        input: &CreateCharacterSpeech,
    ) -> Result<CharacterSpeech, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_speeches (character_id, speech_type_id, version, text) \
             VALUES ($1, $2, \
                 (SELECT COALESCE(MAX(version), 0) + 1 \
                  FROM character_speeches \
                  WHERE character_id = $1 AND speech_type_id = $2), \
                 $3) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterSpeech>(&query)
            .bind(character_id)
            .bind(input.speech_type_id)
            .bind(&input.text)
            .fetch_one(pool)
            .await
    }

    /// Update the text of an existing speech entry. Returns `None` if not found
    /// or already soft-deleted.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateCharacterSpeech,
    ) -> Result<Option<CharacterSpeech>, sqlx::Error> {
        let query = format!(
            "UPDATE character_speeches SET text = $1 \
             WHERE id = $2 AND deleted_at IS NULL \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterSpeech>(&query)
            .bind(&input.text)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a speech entry. Returns `true` if a row was affected.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE character_speeches SET deleted_at = now() \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Bulk-create speech entries in a transaction, auto-assigning versions per type.
    ///
    /// Each entry in `entries` is a `(speech_type_id, text)` tuple.
    pub async fn bulk_create(
        pool: &PgPool,
        character_id: DbId,
        entries: &[(i16, String)],
    ) -> Result<Vec<CharacterSpeech>, sqlx::Error> {
        let mut tx = pool.begin().await?;
        let mut results = Vec::with_capacity(entries.len());

        let query = format!(
            "INSERT INTO character_speeches (character_id, speech_type_id, version, text) \
             VALUES ($1, $2, \
                 (SELECT COALESCE(MAX(version), 0) + 1 \
                  FROM character_speeches \
                  WHERE character_id = $1 AND speech_type_id = $2), \
                 $3) \
             RETURNING {COLUMNS}"
        );

        for (speech_type_id, text) in entries {
            let row = sqlx::query_as::<_, CharacterSpeech>(&query)
                .bind(character_id)
                .bind(speech_type_id)
                .bind(text)
                .fetch_one(&mut *tx)
                .await?;
            results.push(row);
        }

        tx.commit().await?;
        Ok(results)
    }
}

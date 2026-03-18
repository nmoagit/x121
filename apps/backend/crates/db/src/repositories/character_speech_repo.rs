//! Repository for the `character_speeches` table (PRD-124, PRD-136).

use serde::Serialize;
use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::character_speech::{
    CharacterSpeech, CreateCharacterSpeech, UpdateCharacterSpeech,
};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, character_id, speech_type_id, version, text, \
                        language_id, status_id, sort_order, \
                        created_at, updated_at, deleted_at";

/// Provides CRUD operations for character speech entries.
pub struct CharacterSpeechRepo;

impl CharacterSpeechRepo {
    /// List all non-deleted speeches for a character, ordered by type then sort_order then version.
    pub async fn list_for_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<CharacterSpeech>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_speeches \
             WHERE character_id = $1 AND deleted_at IS NULL \
             ORDER BY speech_type_id, sort_order, version"
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
             ORDER BY sort_order, version"
        );
        sqlx::query_as::<_, CharacterSpeech>(&query)
            .bind(character_id)
            .bind(speech_type_id)
            .fetch_all(pool)
            .await
    }

    /// List non-deleted speeches for a character filtered by language.
    pub async fn list_for_character_by_language(
        pool: &PgPool,
        character_id: DbId,
        language_id: i16,
    ) -> Result<Vec<CharacterSpeech>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_speeches \
             WHERE character_id = $1 AND language_id = $2 AND deleted_at IS NULL \
             ORDER BY speech_type_id, sort_order, version"
        );
        sqlx::query_as::<_, CharacterSpeech>(&query)
            .bind(character_id)
            .bind(language_id)
            .fetch_all(pool)
            .await
    }

    /// List non-deleted speeches for a character filtered by type and language.
    pub async fn list_for_character_by_type_and_language(
        pool: &PgPool,
        character_id: DbId,
        speech_type_id: i16,
        language_id: i16,
    ) -> Result<Vec<CharacterSpeech>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_speeches \
             WHERE character_id = $1 AND speech_type_id = $2 AND language_id = $3 \
                   AND deleted_at IS NULL \
             ORDER BY sort_order, version"
        );
        sqlx::query_as::<_, CharacterSpeech>(&query)
            .bind(character_id)
            .bind(speech_type_id)
            .bind(language_id)
            .fetch_all(pool)
            .await
    }

    /// List only approved speeches for a character, ordered by type sort_order,
    /// language, then variant sort_order.
    pub async fn list_approved_for_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<CharacterSpeech>, sqlx::Error> {
        let query = format!(
            "SELECT cs.{COLUMNS_PREFIXED} \
             FROM character_speeches cs \
             JOIN speech_types st ON st.id = cs.speech_type_id \
             WHERE cs.character_id = $1 AND cs.deleted_at IS NULL AND cs.status_id = 2 \
             ORDER BY st.sort_order, cs.language_id, cs.sort_order, cs.version",
        );
        sqlx::query_as::<_, CharacterSpeech>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// Create a new speech entry with auto-assigned version and sort_order.
    ///
    /// Version is computed as `MAX(version) + 1` across all rows (including
    /// soft-deleted) for the same `(character_id, speech_type_id, language_id)` pair.
    /// Sort order is computed similarly for non-deleted rows.
    pub async fn create(
        pool: &PgPool,
        character_id: DbId,
        input: &CreateCharacterSpeech,
    ) -> Result<CharacterSpeech, sqlx::Error> {
        let language_id = input.language_id.unwrap_or(1);
        let query = format!(
            "INSERT INTO character_speeches \
                 (character_id, speech_type_id, language_id, version, text, sort_order) \
             VALUES ($1, $2, $3, \
                 (SELECT COALESCE(MAX(version), 0) + 1 \
                  FROM character_speeches \
                  WHERE character_id = $1 AND speech_type_id = $2 AND language_id = $3), \
                 $4, \
                 (SELECT COALESCE(MAX(sort_order), 0) + 1 \
                  FROM character_speeches \
                  WHERE character_id = $1 AND speech_type_id = $2 AND language_id = $3 \
                        AND deleted_at IS NULL)) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterSpeech>(&query)
            .bind(character_id)
            .bind(input.speech_type_id)
            .bind(language_id)
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

    /// Update the approval status of a speech entry.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: i16,
    ) -> Result<Option<CharacterSpeech>, sqlx::Error> {
        let query = format!(
            "UPDATE character_speeches SET status_id = $1 \
             WHERE id = $2 AND deleted_at IS NULL \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterSpeech>(&query)
            .bind(status_id)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Bulk approve speeches for a character, optionally filtered by language and/or type.
    ///
    /// Returns the number of rows updated.
    pub async fn bulk_approve(
        pool: &PgPool,
        character_id: DbId,
        language_id: Option<i16>,
        type_id: Option<i16>,
    ) -> Result<u64, sqlx::Error> {
        let mut sql = String::from(
            "UPDATE character_speeches SET status_id = 2 \
             WHERE character_id = $1 AND deleted_at IS NULL AND status_id != 2",
        );
        let mut param_idx = 2u32;

        if language_id.is_some() {
            sql.push_str(&format!(" AND language_id = ${param_idx}"));
            param_idx += 1;
        }
        if type_id.is_some() {
            sql.push_str(&format!(" AND speech_type_id = ${param_idx}"));
        }

        let mut query = sqlx::query(&sql).bind(character_id);
        if let Some(lid) = language_id {
            query = query.bind(lid);
        }
        if let Some(tid) = type_id {
            query = query.bind(tid);
        }

        let result = query.execute(pool).await?;
        Ok(result.rows_affected())
    }

    /// Reorder speeches by updating sort_order based on position in the provided ID list.
    ///
    /// Each speech in `speech_ids` gets `sort_order = index + 1`.
    pub async fn reorder(pool: &PgPool, speech_ids: &[DbId]) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;
        for (i, id) in speech_ids.iter().enumerate() {
            sqlx::query(
                "UPDATE character_speeches SET sort_order = $1 WHERE id = $2 AND deleted_at IS NULL",
            )
            .bind((i + 1) as i32)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
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

    /// Bulk-create speech entries in a transaction, auto-assigning versions per type and language.
    ///
    /// Each entry in `entries` is a `(speech_type_id, text)` tuple. All entries
    /// default to language_id = 1 (English).
    pub async fn bulk_create(
        pool: &PgPool,
        character_id: DbId,
        entries: &[(i16, String)],
    ) -> Result<Vec<CharacterSpeech>, sqlx::Error> {
        let mut tx = pool.begin().await?;
        let mut results = Vec::with_capacity(entries.len());

        let query = format!(
            "INSERT INTO character_speeches \
                 (character_id, speech_type_id, language_id, version, text, sort_order) \
             VALUES ($1, $2, 1, \
                 (SELECT COALESCE(MAX(version), 0) + 1 \
                  FROM character_speeches \
                  WHERE character_id = $1 AND speech_type_id = $2 AND language_id = 1), \
                 $3, \
                 (SELECT COALESCE(MAX(sort_order), 0) + 1 \
                  FROM character_speeches \
                  WHERE character_id = $1 AND speech_type_id = $2 AND language_id = 1 \
                        AND deleted_at IS NULL)) \
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

    /// Bulk-create speech entries with language support.
    ///
    /// Each entry is `(speech_type_id, language_id, text)`.
    pub async fn bulk_create_with_language(
        pool: &PgPool,
        character_id: DbId,
        entries: &[(i16, i16, String)],
    ) -> Result<Vec<CharacterSpeech>, sqlx::Error> {
        let mut tx = pool.begin().await?;
        let mut results = Vec::with_capacity(entries.len());

        let query = format!(
            "INSERT INTO character_speeches \
                 (character_id, speech_type_id, language_id, version, text, sort_order) \
             VALUES ($1, $2, $3, \
                 (SELECT COALESCE(MAX(version), 0) + 1 \
                  FROM character_speeches \
                  WHERE character_id = $1 AND speech_type_id = $2 AND language_id = $3), \
                 $4, \
                 (SELECT COALESCE(MAX(sort_order), 0) + 1 \
                  FROM character_speeches \
                  WHERE character_id = $1 AND speech_type_id = $2 AND language_id = $3 \
                        AND deleted_at IS NULL)) \
             RETURNING {COLUMNS}"
        );

        for (speech_type_id, language_id, text) in entries {
            let row = sqlx::query_as::<_, CharacterSpeech>(&query)
                .bind(character_id)
                .bind(speech_type_id)
                .bind(language_id)
                .bind(text)
                .fetch_one(&mut *tx)
                .await?;
            results.push(row);
        }

        tx.commit().await?;
        Ok(results)
    }

    /// Count speeches per language for a character.
    ///
    /// Returns `(language_id, code, flag_code, count)` tuples.
    pub async fn count_by_language(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<LanguageCount>, sqlx::Error> {
        sqlx::query_as::<_, LanguageCount>(
            "SELECT l.id AS language_id, l.code, l.flag_code, \
                    COUNT(cs.id)::BIGINT AS count \
             FROM languages l \
             LEFT JOIN character_speeches cs \
                 ON cs.language_id = l.id \
                 AND cs.character_id = $1 \
                 AND cs.deleted_at IS NULL \
             GROUP BY l.id, l.code, l.flag_code \
             HAVING COUNT(cs.id) > 0 \
             ORDER BY l.name",
        )
        .bind(character_id)
        .fetch_all(pool)
        .await
    }
}

/// Count of speeches per language for a character.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct LanguageCount {
    pub language_id: i16,
    pub code: String,
    pub flag_code: String,
    pub count: i64,
}

/// Summary of speech completeness for a character against project config.
#[derive(Debug, Serialize)]
pub struct CompletenessSummary {
    pub total_slots: i32,
    pub filled_slots: i32,
    pub completeness_pct: i32,
    pub breakdown: Vec<CompletenessEntry>,
}

/// A single entry in the completeness breakdown.
#[derive(Debug, Serialize)]
pub struct CompletenessEntry {
    pub speech_type_id: i16,
    pub speech_type_name: String,
    pub language_id: i16,
    pub language_code: String,
    pub required: i32,
    pub approved: i32,
    pub status: String,
}

/// Prefixed column list for queries that join other tables.
const COLUMNS_PREFIXED: &str = "id, character_id, speech_type_id, version, text, \
                                 language_id, status_id, sort_order, \
                                 created_at, updated_at, deleted_at";

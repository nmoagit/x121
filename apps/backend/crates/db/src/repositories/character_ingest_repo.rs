//! Repository for the `character_ingest_sessions` and `character_ingest_entries`
//! tables (PRD-113).

use serde::Serialize;
use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::character_ingest::{
    CharacterIngestEntry, CharacterIngestSession, CreateCharacterIngestEntry,
    CreateCharacterIngestSession, UpdateCharacterIngestEntry,
};
use crate::models::status::StatusId;

/// Column list for `character_ingest_sessions`.
const SESSION_COLUMNS: &str =
    "id, project_id, status_id, source_type, source_name, target_group_id, \
     total_entries, ready_count, error_count, excluded_count, created_by, \
     created_at, updated_at";

/// Column list for `character_ingest_entries`.
const ENTRY_COLUMNS: &str =
    "id, session_id, folder_name, parsed_name, confirmed_name, name_confidence, \
     detected_images, image_classifications, metadata_status, metadata_json, metadata_source, \
     tov_json, bio_json, metadata_errors, validation_status, validation_errors, \
     validation_warnings, is_included, created_character_id, script_execution_id, \
     created_at, updated_at";

/// Aggregate counts for entries within a session.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct IngestEntryCounts {
    pub total: i64,
    pub included: i64,
    pub excluded: i64,
    pub ready: i64,
    pub warning: i64,
    pub failed: i64,
    pub pending: i64,
}

/// CRUD operations for character ingest sessions.
pub struct CharacterIngestSessionRepo;

impl CharacterIngestSessionRepo {
    /// Insert a new session, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateCharacterIngestSession,
    ) -> Result<CharacterIngestSession, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_ingest_sessions
                 (project_id, source_type, source_name, target_group_id, created_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {SESSION_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterIngestSession>(&query)
            .bind(input.project_id)
            .bind(&input.source_type)
            .bind(&input.source_name)
            .bind(input.target_group_id)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// Find a session by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<CharacterIngestSession>, sqlx::Error> {
        let query =
            format!("SELECT {SESSION_COLUMNS} FROM character_ingest_sessions WHERE id = $1");
        sqlx::query_as::<_, CharacterIngestSession>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List sessions for a project, ordered by most recent first.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<CharacterIngestSession>, sqlx::Error> {
        let query = format!(
            "SELECT {SESSION_COLUMNS} FROM character_ingest_sessions
             WHERE project_id = $1
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, CharacterIngestSession>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Update a session's status.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
    ) -> Result<Option<CharacterIngestSession>, sqlx::Error> {
        let query = format!(
            "UPDATE character_ingest_sessions SET status_id = $2
             WHERE id = $1
             RETURNING {SESSION_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterIngestSession>(&query)
            .bind(id)
            .bind(status_id)
            .fetch_optional(pool)
            .await
    }

    /// Refresh session counters by aggregating entries.
    pub async fn update_counts(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<CharacterIngestSession>, sqlx::Error> {
        let query = format!(
            "UPDATE character_ingest_sessions SET
                total_entries = (SELECT COUNT(*) FROM character_ingest_entries WHERE session_id = $1)::int,
                ready_count = (SELECT COUNT(*) FROM character_ingest_entries
                               WHERE session_id = $1 AND is_included = true
                                 AND validation_status IN ('pass', 'warning'))::int,
                error_count = (SELECT COUNT(*) FROM character_ingest_entries
                               WHERE session_id = $1 AND validation_status = 'fail')::int,
                excluded_count = (SELECT COUNT(*) FROM character_ingest_entries
                                  WHERE session_id = $1 AND is_included = false)::int
             WHERE id = $1
             RETURNING {SESSION_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterIngestSession>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a session by ID. Returns true if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM character_ingest_sessions WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

/// CRUD operations for character ingest entries.
pub struct CharacterIngestEntryRepo;

impl CharacterIngestEntryRepo {
    /// Insert a single entry, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateCharacterIngestEntry,
    ) -> Result<CharacterIngestEntry, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_ingest_entries
                 (session_id, folder_name, parsed_name, name_confidence,
                  detected_images, image_classifications,
                  metadata_status, metadata_json, metadata_source, tov_json, bio_json)
             VALUES ($1, $2, $3, $4,
                     COALESCE($5, '[]'::jsonb), COALESCE($6, '{{}}'::jsonb),
                     $7, $8, $9, $10, $11)
             RETURNING {ENTRY_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterIngestEntry>(&query)
            .bind(input.session_id)
            .bind(&input.folder_name)
            .bind(&input.parsed_name)
            .bind(&input.name_confidence)
            .bind(&input.detected_images)
            .bind(&input.image_classifications)
            .bind(&input.metadata_status)
            .bind(&input.metadata_json)
            .bind(&input.metadata_source)
            .bind(&input.tov_json)
            .bind(&input.bio_json)
            .fetch_one(pool)
            .await
    }

    /// Insert multiple entries in a loop. Returns the created rows.
    pub async fn create_batch(
        pool: &PgPool,
        inputs: &[CreateCharacterIngestEntry],
    ) -> Result<Vec<CharacterIngestEntry>, sqlx::Error> {
        let mut results = Vec::with_capacity(inputs.len());
        for input in inputs {
            results.push(Self::create(pool, input).await?);
        }
        Ok(results)
    }

    /// Find an entry by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<CharacterIngestEntry>, sqlx::Error> {
        let query = format!("SELECT {ENTRY_COLUMNS} FROM character_ingest_entries WHERE id = $1");
        sqlx::query_as::<_, CharacterIngestEntry>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List entries for a session, ordered by ID.
    pub async fn list_by_session(
        pool: &PgPool,
        session_id: DbId,
    ) -> Result<Vec<CharacterIngestEntry>, sqlx::Error> {
        let query = format!(
            "SELECT {ENTRY_COLUMNS} FROM character_ingest_entries
             WHERE session_id = $1
             ORDER BY id ASC"
        );
        sqlx::query_as::<_, CharacterIngestEntry>(&query)
            .bind(session_id)
            .fetch_all(pool)
            .await
    }

    /// Update an entry. Only non-`None` fields are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateCharacterIngestEntry,
    ) -> Result<Option<CharacterIngestEntry>, sqlx::Error> {
        let query = format!(
            "UPDATE character_ingest_entries SET
                confirmed_name = COALESCE($2, confirmed_name),
                image_classifications = COALESCE($3, image_classifications),
                metadata_json = COALESCE($4, metadata_json),
                is_included = COALESCE($5, is_included)
             WHERE id = $1
             RETURNING {ENTRY_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterIngestEntry>(&query)
            .bind(id)
            .bind(&input.confirmed_name)
            .bind(&input.image_classifications)
            .bind(&input.metadata_json)
            .bind(input.is_included)
            .fetch_optional(pool)
            .await
    }

    /// Update the metadata status and related fields for an entry.
    pub async fn update_metadata_status(
        pool: &PgPool,
        id: DbId,
        status: &str,
        metadata_json: Option<&serde_json::Value>,
        metadata_source: Option<&str>,
        errors: Option<&serde_json::Value>,
    ) -> Result<Option<CharacterIngestEntry>, sqlx::Error> {
        let query = format!(
            "UPDATE character_ingest_entries SET
                metadata_status = $2,
                metadata_json = COALESCE($3, metadata_json),
                metadata_source = COALESCE($4, metadata_source),
                metadata_errors = COALESCE($5, metadata_errors)
             WHERE id = $1
             RETURNING {ENTRY_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterIngestEntry>(&query)
            .bind(id)
            .bind(status)
            .bind(metadata_json)
            .bind(metadata_source)
            .bind(errors)
            .fetch_optional(pool)
            .await
    }

    /// Update validation status and errors/warnings for an entry.
    pub async fn update_validation(
        pool: &PgPool,
        id: DbId,
        validation_status: &str,
        errors: &serde_json::Value,
        warnings: &serde_json::Value,
    ) -> Result<Option<CharacterIngestEntry>, sqlx::Error> {
        let query = format!(
            "UPDATE character_ingest_entries SET
                validation_status = $2,
                validation_errors = $3,
                validation_warnings = $4
             WHERE id = $1
             RETURNING {ENTRY_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterIngestEntry>(&query)
            .bind(id)
            .bind(validation_status)
            .bind(errors)
            .bind(warnings)
            .fetch_optional(pool)
            .await
    }

    /// Link an entry to the character that was created from it.
    pub async fn set_created_character(
        pool: &PgPool,
        id: DbId,
        character_id: DbId,
    ) -> Result<Option<CharacterIngestEntry>, sqlx::Error> {
        let query = format!(
            "UPDATE character_ingest_entries SET created_character_id = $2
             WHERE id = $1
             RETURNING {ENTRY_COLUMNS}"
        );
        sqlx::query_as::<_, CharacterIngestEntry>(&query)
            .bind(id)
            .bind(character_id)
            .fetch_optional(pool)
            .await
    }

    /// Aggregate entry counts by status for a session.
    pub async fn count_by_status(
        pool: &PgPool,
        session_id: DbId,
    ) -> Result<IngestEntryCounts, sqlx::Error> {
        let query = r#"
            SELECT
                COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE is_included = true)::bigint AS included,
                COUNT(*) FILTER (WHERE is_included = false)::bigint AS excluded,
                COUNT(*) FILTER (WHERE validation_status = 'pass' OR validation_status = 'warning')::bigint AS ready,
                COUNT(*) FILTER (WHERE validation_status = 'warning')::bigint AS warning,
                COUNT(*) FILTER (WHERE validation_status = 'fail')::bigint AS failed,
                COUNT(*) FILTER (WHERE validation_status = 'pending' OR validation_status IS NULL)::bigint AS pending
            FROM character_ingest_entries
            WHERE session_id = $1
        "#;
        sqlx::query_as::<_, IngestEntryCounts>(query)
            .bind(session_id)
            .fetch_one(pool)
            .await
    }
}

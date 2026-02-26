//! Repository for import sessions and mapping entries (PRD-016).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::importer::{
    CreateImportMappingEntry, CreateImportSession, ImportMappingEntry, ImportSession,
    ImportSessionStatus,
};

/// Column list for `import_session_statuses`.
const STATUS_COLUMNS: &str = "id, name, description, created_at, updated_at";

/// Column list for `import_sessions`.
const SESSION_COLUMNS: &str = "id, status_id, project_id, staging_path, source_name, total_files, \
     total_size_bytes, mapped_entities, validation_report_id, created_by, \
     created_at, updated_at";

/// Column list for `import_mapping_entries`.
const ENTRY_COLUMNS: &str =
    "id, session_id, source_path, file_name, file_size_bytes, file_extension, \
     derived_entity_type, derived_entity_name, derived_category, target_entity_id, \
     action, conflict_details, validation_errors, validation_warnings, is_selected, \
     created_at, updated_at";

// ── ImportSessionRepo ────────────────────────────────────────────────

/// Provides CRUD operations for import sessions.
pub struct ImportSessionRepo;

impl ImportSessionRepo {
    /// Create a new import session in 'uploading' status.
    pub async fn create(
        pool: &PgPool,
        input: &CreateImportSession,
    ) -> Result<ImportSession, sqlx::Error> {
        let sql = format!(
            "INSERT INTO import_sessions \
                (status_id, project_id, staging_path, source_name, created_by) \
             VALUES ( \
                (SELECT id FROM import_session_statuses WHERE name = 'uploading'), \
                $1, $2, $3, $4 \
             ) \
             RETURNING {SESSION_COLUMNS}"
        );
        sqlx::query_as::<_, ImportSession>(&sql)
            .bind(input.project_id)
            .bind(&input.staging_path)
            .bind(&input.source_name)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// Find an import session by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<ImportSession>, sqlx::Error> {
        let sql = format!("SELECT {SESSION_COLUMNS} FROM import_sessions WHERE id = $1");
        sqlx::query_as::<_, ImportSession>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Update a session's status by name.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status: &str,
    ) -> Result<Option<ImportSession>, sqlx::Error> {
        let sql = format!(
            "UPDATE import_sessions SET \
                status_id = (SELECT s.id FROM import_session_statuses s WHERE s.name = $2) \
             WHERE id = $1 \
             RETURNING {SESSION_COLUMNS}"
        );
        sqlx::query_as::<_, ImportSession>(&sql)
            .bind(id)
            .bind(status)
            .fetch_optional(pool)
            .await
    }

    /// Update file/entity counts after parsing.
    pub async fn update_counts(
        pool: &PgPool,
        id: DbId,
        total_files: i32,
        total_size_bytes: i64,
        mapped_entities: i32,
    ) -> Result<Option<ImportSession>, sqlx::Error> {
        let sql = format!(
            "UPDATE import_sessions SET \
                total_files = $2, \
                total_size_bytes = $3, \
                mapped_entities = $4 \
             WHERE id = $1 \
             RETURNING {SESSION_COLUMNS}"
        );
        sqlx::query_as::<_, ImportSession>(&sql)
            .bind(id)
            .bind(total_files)
            .bind(total_size_bytes)
            .bind(mapped_entities)
            .fetch_optional(pool)
            .await
    }

    /// List all session statuses.
    pub async fn list_statuses(pool: &PgPool) -> Result<Vec<ImportSessionStatus>, sqlx::Error> {
        let sql = format!("SELECT {STATUS_COLUMNS} FROM import_session_statuses ORDER BY id");
        sqlx::query_as::<_, ImportSessionStatus>(&sql)
            .fetch_all(pool)
            .await
    }
}

// ── ImportMappingEntryRepo ───────────────────────────────────────────

/// Provides CRUD operations for import mapping entries.
pub struct ImportMappingEntryRepo;

impl ImportMappingEntryRepo {
    /// Insert a batch of mapping entries for a session.
    pub async fn batch_insert(
        pool: &PgPool,
        entries: &[CreateImportMappingEntry],
    ) -> Result<Vec<ImportMappingEntry>, sqlx::Error> {
        let mut results = Vec::with_capacity(entries.len());
        for entry in entries {
            let sql = format!(
                "INSERT INTO import_mapping_entries \
                    (session_id, source_path, file_name, file_size_bytes, file_extension, \
                     derived_entity_type, derived_entity_name, derived_category, \
                     target_entity_id, action, conflict_details, \
                     validation_errors, validation_warnings) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) \
                 RETURNING {ENTRY_COLUMNS}"
            );
            let row = sqlx::query_as::<_, ImportMappingEntry>(&sql)
                .bind(entry.session_id)
                .bind(&entry.source_path)
                .bind(&entry.file_name)
                .bind(entry.file_size_bytes)
                .bind(&entry.file_extension)
                .bind(&entry.derived_entity_type)
                .bind(&entry.derived_entity_name)
                .bind(&entry.derived_category)
                .bind(entry.target_entity_id)
                .bind(&entry.action)
                .bind(&entry.conflict_details)
                .bind(&entry.validation_errors)
                .bind(&entry.validation_warnings)
                .fetch_one(pool)
                .await?;
            results.push(row);
        }
        Ok(results)
    }

    /// List all mapping entries for a session, ordered by source path.
    pub async fn list_by_session(
        pool: &PgPool,
        session_id: DbId,
    ) -> Result<Vec<ImportMappingEntry>, sqlx::Error> {
        let sql = format!(
            "SELECT {ENTRY_COLUMNS} FROM import_mapping_entries \
             WHERE session_id = $1 ORDER BY source_path"
        );
        sqlx::query_as::<_, ImportMappingEntry>(&sql)
            .bind(session_id)
            .fetch_all(pool)
            .await
    }

    /// Update the `is_selected` flag for a set of entry IDs.
    pub async fn update_selection(
        pool: &PgPool,
        entry_ids: &[DbId],
        is_selected: bool,
    ) -> Result<u64, sqlx::Error> {
        if entry_ids.is_empty() {
            return Ok(0);
        }
        // Build a parameterised IN clause.
        let placeholders: Vec<String> = (1..=entry_ids.len())
            .map(|i| format!("${}", i + 1))
            .collect();
        let sql = format!(
            "UPDATE import_mapping_entries SET is_selected = $1 WHERE id IN ({})",
            placeholders.join(", ")
        );
        let mut query = sqlx::query(&sql).bind(is_selected);
        for id in entry_ids {
            query = query.bind(*id);
        }
        let result = query.execute(pool).await?;
        Ok(result.rows_affected())
    }

    /// List only selected entries for a session (for commit).
    pub async fn list_selected(
        pool: &PgPool,
        session_id: DbId,
    ) -> Result<Vec<ImportMappingEntry>, sqlx::Error> {
        let sql = format!(
            "SELECT {ENTRY_COLUMNS} FROM import_mapping_entries \
             WHERE session_id = $1 AND is_selected = true \
             ORDER BY source_path"
        );
        sqlx::query_as::<_, ImportMappingEntry>(&sql)
            .bind(session_id)
            .fetch_all(pool)
            .await
    }
}

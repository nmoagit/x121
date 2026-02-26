//! Repository for import reports and report entries.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::validation::{
    CreateImportReport, CreateImportReportEntry, ImportReport, ImportReportEntry,
};

/// Column list for `import_reports` queries.
const REPORT_COLUMNS: &str =
    "id, status_id, source_type, source_reference, entity_type, project_id, \
     total_records, accepted, rejected, auto_corrected, skipped, report_data, \
     created_by, created_at, updated_at";

/// Column list for `import_report_entries` queries.
const ENTRY_COLUMNS: &str =
    "id, report_id, record_index, entity_id, action, field_errors, field_warnings, \
     field_diffs, conflict_resolutions, created_at, updated_at";

/// Provides CRUD operations for import reports and their entries.
pub struct ImportReportRepo;

impl ImportReportRepo {
    /// Create a new import report. The `status` field is resolved by name
    /// from the `import_report_statuses` lookup table.
    pub async fn create(
        pool: &PgPool,
        input: &CreateImportReport,
    ) -> Result<ImportReport, sqlx::Error> {
        let sql = format!(
            "INSERT INTO import_reports \
                (status_id, source_type, source_reference, entity_type, project_id, \
                 total_records, accepted, rejected, auto_corrected, skipped, \
                 report_data, created_by) \
             VALUES ( \
                (SELECT id FROM import_report_statuses WHERE name = $1), \
                $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12 \
             ) \
             RETURNING {REPORT_COLUMNS}"
        );
        sqlx::query_as::<_, ImportReport>(&sql)
            .bind(&input.status)
            .bind(&input.source_type)
            .bind(&input.source_reference)
            .bind(&input.entity_type)
            .bind(input.project_id)
            .bind(input.total_records)
            .bind(input.accepted)
            .bind(input.rejected)
            .bind(input.auto_corrected)
            .bind(input.skipped)
            .bind(&input.report_data)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// Find a report by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<ImportReport>, sqlx::Error> {
        let sql = format!("SELECT {REPORT_COLUMNS} FROM import_reports WHERE id = $1");
        sqlx::query_as::<_, ImportReport>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List reports, optionally filtered by `entity_type` and/or `project_id`.
    pub async fn list(
        pool: &PgPool,
        entity_type: Option<&str>,
        project_id: Option<DbId>,
    ) -> Result<Vec<ImportReport>, sqlx::Error> {
        let sql = format!(
            "SELECT {REPORT_COLUMNS} FROM import_reports \
             WHERE ($1::TEXT IS NULL OR entity_type = $1) \
               AND ($2::BIGINT IS NULL OR project_id = $2) \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ImportReport>(&sql)
            .bind(entity_type)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Update a report's status by name. Returns `None` if no row with the given `id` exists.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status: &str,
    ) -> Result<Option<ImportReport>, sqlx::Error> {
        let sql = format!(
            "UPDATE import_reports SET \
                status_id = (SELECT id FROM import_report_statuses WHERE name = $2) \
             WHERE id = $1 \
             RETURNING {REPORT_COLUMNS}"
        );
        sqlx::query_as::<_, ImportReport>(&sql)
            .bind(id)
            .bind(status)
            .fetch_optional(pool)
            .await
    }

    // ── Report Entries ───────────────────────────────────────────────

    /// Insert a single report entry, returning the created row.
    pub async fn create_entry(
        pool: &PgPool,
        input: &CreateImportReportEntry,
    ) -> Result<ImportReportEntry, sqlx::Error> {
        let sql = format!(
            "INSERT INTO import_report_entries \
                (report_id, record_index, entity_id, action, field_errors, \
                 field_warnings, field_diffs, conflict_resolutions) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             RETURNING {ENTRY_COLUMNS}"
        );
        sqlx::query_as::<_, ImportReportEntry>(&sql)
            .bind(input.report_id)
            .bind(input.record_index)
            .bind(input.entity_id)
            .bind(&input.action)
            .bind(&input.field_errors)
            .bind(&input.field_warnings)
            .bind(&input.field_diffs)
            .bind(&input.conflict_resolutions)
            .fetch_one(pool)
            .await
    }

    /// Insert multiple report entries in a batch.
    pub async fn create_entries_batch(
        pool: &PgPool,
        entries: &[CreateImportReportEntry],
    ) -> Result<Vec<ImportReportEntry>, sqlx::Error> {
        let mut results = Vec::with_capacity(entries.len());
        for entry in entries {
            results.push(Self::create_entry(pool, entry).await?);
        }
        Ok(results)
    }

    /// List all entries for a report, ordered by `record_index`.
    pub async fn list_entries(
        pool: &PgPool,
        report_id: DbId,
    ) -> Result<Vec<ImportReportEntry>, sqlx::Error> {
        let sql = format!(
            "SELECT {ENTRY_COLUMNS} FROM import_report_entries \
             WHERE report_id = $1 ORDER BY record_index"
        );
        sqlx::query_as::<_, ImportReportEntry>(&sql)
            .bind(report_id)
            .fetch_all(pool)
            .await
    }

    /// Export a full report as JSON (report metadata + all entries).
    ///
    /// Returns `None` if the report does not exist.
    pub async fn export_json(
        pool: &PgPool,
        report_id: DbId,
    ) -> Result<Option<serde_json::Value>, sqlx::Error> {
        let report = match Self::find_by_id(pool, report_id).await? {
            Some(r) => r,
            None => return Ok(None),
        };
        let entries = Self::list_entries(pool, report_id).await?;
        Ok(Some(serde_json::json!({
            "report": report,
            "entries": entries,
        })))
    }

    /// Export a report's entries as a CSV string.
    ///
    /// Returns `None` if the report does not exist.
    pub async fn export_csv(pool: &PgPool, report_id: DbId) -> Result<Option<String>, sqlx::Error> {
        let entries = Self::list_entries(pool, report_id).await?;
        if entries.is_empty() {
            // Check if report exists at all
            if Self::find_by_id(pool, report_id).await?.is_none() {
                return Ok(None);
            }
        }

        let mut csv = String::from("record_index,entity_id,action,errors,warnings\n");
        for entry in &entries {
            let errors = entry.field_errors.as_array().map(|a| a.len()).unwrap_or(0);
            let warnings = entry
                .field_warnings
                .as_array()
                .map(|a| a.len())
                .unwrap_or(0);
            let entity_id = entry.entity_id.map(|id| id.to_string()).unwrap_or_default();
            csv.push_str(&format!(
                "{},{},{},{},{}\n",
                entry.record_index, entity_id, entry.action, errors, warnings
            ));
        }
        Ok(Some(csv))
    }
}

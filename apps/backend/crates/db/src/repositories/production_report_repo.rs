//! Repository for production report tables (PRD-73).
//!
//! Provides CRUD operations for `report_types`, `reports`, and `report_schedules`.

use sqlx::PgPool;
use x121_core::production_report::REPORT_STATUS_ID_PENDING;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;

use crate::models::production_report::{
    CreateReport, CreateReportSchedule, Report, ReportSchedule, ReportType, UpdateReportSchedule,
};

/// Column list for `report_types` queries.
const REPORT_TYPE_COLUMNS: &str =
    "id, name, description, config_schema_json, created_at, updated_at";

/// Column list for `reports` queries.
const REPORT_COLUMNS: &str = "id, report_type_id, config_json, data_json, file_path, \
    format, generated_by, status_id, started_at, completed_at, created_at, updated_at";

/// Column list for `report_schedules` queries.
const SCHEDULE_COLUMNS: &str = "id, report_type_id, config_json, format, schedule, \
    recipients_json, enabled, last_run_at, next_run_at, created_by, created_at, updated_at";

/// Provides data access for production reports, report types, and schedules.
pub struct ProductionReportRepo;

impl ProductionReportRepo {
    // -----------------------------------------------------------------------
    // Report types
    // -----------------------------------------------------------------------

    /// List all report types.
    pub async fn list_report_types(pool: &PgPool) -> Result<Vec<ReportType>, sqlx::Error> {
        let query = format!("SELECT {REPORT_TYPE_COLUMNS} FROM report_types ORDER BY id");
        sqlx::query_as::<_, ReportType>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a report type by its ID.
    pub async fn get_report_type_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ReportType>, sqlx::Error> {
        let query = format!("SELECT {REPORT_TYPE_COLUMNS} FROM report_types WHERE id = $1");
        sqlx::query_as::<_, ReportType>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a report type by name.
    pub async fn get_report_type_by_name(
        pool: &PgPool,
        name: &str,
    ) -> Result<Option<ReportType>, sqlx::Error> {
        let query = format!("SELECT {REPORT_TYPE_COLUMNS} FROM report_types WHERE name = $1");
        sqlx::query_as::<_, ReportType>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Reports
    // -----------------------------------------------------------------------

    /// Create a new report, returning the created row.
    pub async fn create_report(
        pool: &PgPool,
        user_id: DbId,
        input: &CreateReport,
    ) -> Result<Report, sqlx::Error> {
        let query = format!(
            "INSERT INTO reports
                (report_type_id, config_json, format, generated_by, status_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {REPORT_COLUMNS}"
        );
        sqlx::query_as::<_, Report>(&query)
            .bind(input.report_type_id)
            .bind(&input.config_json)
            .bind(&input.format)
            .bind(user_id)
            .bind(REPORT_STATUS_ID_PENDING)
            .fetch_one(pool)
            .await
    }

    /// Find a report by its ID.
    pub async fn get_report(pool: &PgPool, id: DbId) -> Result<Option<Report>, sqlx::Error> {
        let query = format!("SELECT {REPORT_COLUMNS} FROM reports WHERE id = $1");
        sqlx::query_as::<_, Report>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List reports with pagination, newest first.
    pub async fn list_reports(
        pool: &PgPool,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<Report>, sqlx::Error> {
        let limit = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset = clamp_offset(offset);
        let query = format!(
            "SELECT {REPORT_COLUMNS} FROM reports ORDER BY created_at DESC LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, Report>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Update a report's status_id, returning the updated row.
    pub async fn update_report_status(
        pool: &PgPool,
        id: DbId,
        status_id: DbId,
    ) -> Result<Option<Report>, sqlx::Error> {
        let query =
            format!("UPDATE reports SET status_id = $2 WHERE id = $1 RETURNING {REPORT_COLUMNS}");
        sqlx::query_as::<_, Report>(&query)
            .bind(id)
            .bind(status_id)
            .fetch_optional(pool)
            .await
    }

    /// Update a report's data payload and optional file path, returning the updated row.
    pub async fn update_report_data(
        pool: &PgPool,
        id: DbId,
        data_json: &serde_json::Value,
        file_path: Option<&str>,
    ) -> Result<Option<Report>, sqlx::Error> {
        let query = format!(
            "UPDATE reports SET data_json = $2, file_path = COALESCE($3, file_path), \
             completed_at = NOW() \
             WHERE id = $1 RETURNING {REPORT_COLUMNS}"
        );
        sqlx::query_as::<_, Report>(&query)
            .bind(id)
            .bind(data_json)
            .bind(file_path)
            .fetch_optional(pool)
            .await
    }

    // -----------------------------------------------------------------------
    // Report schedules
    // -----------------------------------------------------------------------

    /// Create a new report schedule, returning the created row.
    pub async fn create_schedule(
        pool: &PgPool,
        user_id: DbId,
        input: &CreateReportSchedule,
    ) -> Result<ReportSchedule, sqlx::Error> {
        let query = format!(
            "INSERT INTO report_schedules
                (report_type_id, config_json, format, schedule, recipients_json, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {SCHEDULE_COLUMNS}"
        );
        sqlx::query_as::<_, ReportSchedule>(&query)
            .bind(input.report_type_id)
            .bind(&input.config_json)
            .bind(&input.format)
            .bind(&input.schedule)
            .bind(&input.recipients_json)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }

    /// Find a report schedule by its ID.
    pub async fn get_schedule(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ReportSchedule>, sqlx::Error> {
        let query = format!("SELECT {SCHEDULE_COLUMNS} FROM report_schedules WHERE id = $1");
        sqlx::query_as::<_, ReportSchedule>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all report schedules, ordered by creation date descending.
    pub async fn list_schedules(pool: &PgPool) -> Result<Vec<ReportSchedule>, sqlx::Error> {
        let query =
            format!("SELECT {SCHEDULE_COLUMNS} FROM report_schedules ORDER BY created_at DESC");
        sqlx::query_as::<_, ReportSchedule>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update a report schedule by ID, returning the updated row.
    pub async fn update_schedule(
        pool: &PgPool,
        id: DbId,
        input: &UpdateReportSchedule,
    ) -> Result<Option<ReportSchedule>, sqlx::Error> {
        let query = format!(
            "UPDATE report_schedules SET
                config_json = COALESCE($2, config_json),
                format = COALESCE($3, format),
                schedule = COALESCE($4, schedule),
                recipients_json = COALESCE($5, recipients_json),
                enabled = COALESCE($6, enabled)
             WHERE id = $1
             RETURNING {SCHEDULE_COLUMNS}"
        );
        sqlx::query_as::<_, ReportSchedule>(&query)
            .bind(id)
            .bind(&input.config_json)
            .bind(&input.format)
            .bind(&input.schedule)
            .bind(&input.recipients_json)
            .bind(input.enabled)
            .fetch_optional(pool)
            .await
    }

    /// Delete a report schedule by ID. Returns `true` if a row was deleted.
    pub async fn delete_schedule(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM report_schedules WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List schedules that are enabled and due for execution (next_run_at <= NOW()).
    pub async fn list_due_schedules(pool: &PgPool) -> Result<Vec<ReportSchedule>, sqlx::Error> {
        let query = format!(
            "SELECT {SCHEDULE_COLUMNS} FROM report_schedules \
             WHERE enabled = true AND next_run_at IS NOT NULL AND next_run_at <= NOW() \
             ORDER BY next_run_at ASC"
        );
        sqlx::query_as::<_, ReportSchedule>(&query)
            .fetch_all(pool)
            .await
    }
}

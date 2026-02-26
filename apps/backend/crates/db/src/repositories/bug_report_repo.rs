//! Repository for the `bug_reports` table (PRD-44).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::bug_report::{BugReport, CreateBugReport};

/// Column list for `bug_reports` queries.
const COLUMNS: &str = "\
    id, user_id, description, url, browser_info, \
    console_errors_json, action_history_json, context_json, \
    recording_path, screenshot_path, status, created_at, updated_at";

/// Provides CRUD operations for bug reports.
pub struct BugReportRepo;

impl BugReportRepo {
    /// Create a new bug report, returning the full row.
    pub async fn create(
        pool: &PgPool,
        user_id: DbId,
        input: &CreateBugReport,
    ) -> Result<BugReport, sqlx::Error> {
        let query = format!(
            "INSERT INTO bug_reports \
                (user_id, description, url, browser_info, \
                 console_errors_json, action_history_json, context_json) \
             VALUES ($1, $2, $3, $4, $5, $6, $7) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, BugReport>(&query)
            .bind(user_id)
            .bind(&input.description)
            .bind(&input.url)
            .bind(&input.browser_info)
            .bind(&input.console_errors_json)
            .bind(&input.action_history_json)
            .bind(&input.context_json)
            .fetch_one(pool)
            .await
    }

    /// Find a bug report by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<BugReport>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM bug_reports WHERE id = $1");
        sqlx::query_as::<_, BugReport>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List bug reports with optional filters for status and user_id.
    ///
    /// Results are ordered newest-first.
    pub async fn list_filtered(
        pool: &PgPool,
        status: Option<&str>,
        user_id: Option<DbId>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<BugReport>, sqlx::Error> {
        let mut conditions: Vec<String> = Vec::new();
        let mut param_idx: usize = 1;

        if status.is_some() {
            conditions.push(format!("status = ${param_idx}"));
            param_idx += 1;
        }
        if user_id.is_some() {
            conditions.push(format!("user_id = ${param_idx}"));
            param_idx += 1;
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let query = format!(
            "SELECT {COLUMNS} FROM bug_reports {where_clause} \
             ORDER BY created_at DESC \
             LIMIT ${param_idx} OFFSET ${}",
            param_idx + 1
        );

        let mut q = sqlx::query_as::<_, BugReport>(&query);

        if let Some(s) = status {
            q = q.bind(s);
        }
        if let Some(uid) = user_id {
            q = q.bind(uid);
        }
        q = q.bind(limit).bind(offset);

        q.fetch_all(pool).await
    }

    /// Update the status of a bug report. Returns the updated row if found.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        new_status: &str,
    ) -> Result<Option<BugReport>, sqlx::Error> {
        let query = format!("UPDATE bug_reports SET status = $1 WHERE id = $2 RETURNING {COLUMNS}");
        sqlx::query_as::<_, BugReport>(&query)
            .bind(new_status)
            .bind(id)
            .fetch_optional(pool)
            .await
    }
}

//! Route definitions for Backup & Disaster Recovery (PRD-81).
//!
//! ```text
//! ADMIN BACKUPS:
//! GET    /                          list_backups (?backup_type, status, limit, offset)
//! GET    /summary                   get_backup_summary
//! GET    /recovery-runbook          download_runbook
//! POST   /                          trigger_backup
//! GET    /{id}                      get_backup
//! POST   /{id}/verify               verify_backup
//! DELETE /{id}                      delete_backup
//!
//! ADMIN BACKUP SCHEDULES:
//! GET    /                          list_schedules (?limit, offset)
//! POST   /                          create_schedule
//! GET    /{id}                      get_schedule
//! PUT    /{id}                      update_schedule
//! DELETE /{id}                      delete_schedule
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::backup_recovery;
use crate::state::AppState;

/// Admin backup routes -- mounted at `/admin/backups`.
pub fn backup_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(backup_recovery::list_backups).post(backup_recovery::trigger_backup),
        )
        .route("/summary", get(backup_recovery::get_backup_summary))
        .route("/recovery-runbook", get(backup_recovery::download_runbook))
        .route(
            "/{id}",
            get(backup_recovery::get_backup).delete(backup_recovery::delete_backup),
        )
        .route("/{id}/verify", post(backup_recovery::verify_backup))
}

/// Admin backup schedule routes -- mounted at `/admin/backup-schedules`.
pub fn backup_schedule_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(backup_recovery::list_schedules).post(backup_recovery::create_schedule),
        )
        .route(
            "/{id}",
            get(backup_recovery::get_schedule)
                .put(backup_recovery::update_schedule)
                .delete(backup_recovery::delete_schedule),
        )
}

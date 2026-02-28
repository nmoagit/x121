//! Route definitions for Generation Budget & Quota Management (PRD-93).
//!
//! ```text
//! ADMIN BUDGETS:
//! GET    /                          admin_list_budgets (?limit, offset)
//! GET    /{project_id}             admin_get_budget
//! PUT    /{project_id}             admin_upsert_budget
//! DELETE /{project_id}             admin_delete_budget
//! GET    /{project_id}/history     admin_budget_history (?period=30d)
//!
//! ADMIN QUOTAS:
//! GET    /                          admin_list_quotas (?limit, offset)
//! GET    /{user_id}                admin_get_quota
//! PUT    /{user_id}                admin_upsert_quota
//! DELETE /{user_id}                admin_delete_quota
//! GET    /{user_id}/history        admin_quota_history (?period=7d)
//!
//! ADMIN EXEMPTIONS:
//! GET    /                          admin_list_exemptions
//! POST   /                          admin_create_exemption
//! PUT    /{id}                     admin_update_exemption
//! DELETE /{id}                     admin_delete_exemption
//!
//! USER BUDGETS:
//! GET    /my-project/{project_id}  user_project_budget
//! GET    /my-quota                 user_my_quota
//! GET    /check                    user_budget_check (?project_id, estimated_hours)
//! ```

use axum::routing::get;
use axum::Router;

use crate::handlers::budget_quota;
use crate::state::AppState;

/// Admin budget routes -- mounted at `/admin/budgets`.
pub fn admin_budget_router() -> Router<AppState> {
    Router::new()
        .route("/", get(budget_quota::admin_list_budgets))
        .route(
            "/{project_id}",
            get(budget_quota::admin_get_budget)
                .put(budget_quota::admin_upsert_budget)
                .delete(budget_quota::admin_delete_budget),
        )
        .route(
            "/{project_id}/history",
            get(budget_quota::admin_budget_history),
        )
}

/// Admin quota routes -- mounted at `/admin/quotas`.
pub fn admin_quota_router() -> Router<AppState> {
    Router::new()
        .route("/", get(budget_quota::admin_list_quotas))
        .route(
            "/{user_id}",
            get(budget_quota::admin_get_quota)
                .put(budget_quota::admin_upsert_quota)
                .delete(budget_quota::admin_delete_quota),
        )
        .route("/{user_id}/history", get(budget_quota::admin_quota_history))
}

/// Admin exemption routes -- mounted at `/admin/budget-exemptions`.
pub fn admin_exemption_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(budget_quota::admin_list_exemptions).post(budget_quota::admin_create_exemption),
        )
        .route(
            "/{id}",
            axum::routing::put(budget_quota::admin_update_exemption)
                .delete(budget_quota::admin_delete_exemption),
        )
}

/// User-facing budget routes -- mounted at `/budgets`.
pub fn user_router() -> Router<AppState> {
    Router::new()
        .route(
            "/my-project/{project_id}",
            get(budget_quota::user_project_budget),
        )
        .route("/my-quota", get(budget_quota::user_my_quota))
        .route("/check", get(budget_quota::user_budget_check))
}

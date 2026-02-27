//! Handlers for the `/admin/naming` resource (PRD-116).
//!
//! All handlers require the `admin` role via [`RequireAdmin`].

use axum::extract::{Path, Query, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::naming_engine::{self, NamingContext, NamingError, ValidationResult};
use x121_core::types::DbId;
use x121_db::models::audit::CreateAuditLog;
use x121_db::models::naming_rule::{
    CreateNamingRule, NamingCategory, NamingRule, UpdateNamingRule,
};
use x121_db::repositories::{AuditLogRepo, NamingRuleRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query filter for listing rules.
#[derive(Debug, Deserialize)]
pub struct ListRulesQuery {
    pub project_id: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

/// Request body for creating a naming rule.
#[derive(Debug, Deserialize)]
pub struct CreateRuleRequest {
    pub category_id: i16,
    pub project_id: Option<DbId>,
    pub template: String,
    pub description: Option<String>,
}

/// Request body for updating a naming rule.
#[derive(Debug, Deserialize)]
pub struct UpdateRuleRequest {
    pub template: Option<String>,
    pub description: Option<String>,
    pub is_active: Option<bool>,
}

/// Request body for template preview.
#[derive(Debug, Deserialize)]
pub struct PreviewRequest {
    pub template: String,
    pub category: Option<String>,
    pub variant_label: Option<String>,
    pub scene_type_name: Option<String>,
    pub is_clothes_off: Option<bool>,
    pub index: Option<u32>,
    pub character_name: Option<String>,
    pub project_name: Option<String>,
    pub date_compact: Option<String>,
    pub version: Option<u32>,
    pub ext: Option<String>,
    pub frame_number: Option<u64>,
    pub metadata_type: Option<String>,
    pub sequence: Option<u32>,
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Response for a category with its default template.
#[derive(Debug, Serialize)]
pub struct CategoryResponse {
    #[serde(flatten)]
    pub category: NamingCategory,
    pub tokens: Vec<&'static str>,
}

/// Response for token listing.
#[derive(Debug, Serialize)]
pub struct TokensResponse {
    pub category_id: i16,
    pub category_name: String,
    pub tokens: Vec<&'static str>,
}

/// Response for preview operation.
#[derive(Debug, Serialize)]
pub struct PreviewResponse {
    pub filename: String,
    pub unresolved_tokens: Vec<String>,
    pub validation: Option<ValidationResult>,
}

/// Response for rule history.
#[derive(Debug, Serialize)]
pub struct HistoryResponse {
    pub rule_id: DbId,
    pub changelog: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/naming/categories
///
/// List all naming categories with their available tokens.
pub async fn list_categories(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<Json<DataResponse<Vec<CategoryResponse>>>> {
    let categories = NamingRuleRepo::list_categories(&state.pool).await?;

    let response: Vec<CategoryResponse> = categories
        .into_iter()
        .map(|cat| {
            let tokens = naming_engine::tokens_for_category(&cat.name);
            CategoryResponse {
                category: cat,
                tokens,
            }
        })
        .collect();

    Ok(Json(DataResponse { data: response }))
}

/// GET /api/v1/admin/naming/categories/{id}/tokens
///
/// List available tokens for a specific category.
pub async fn list_category_tokens(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<i16>,
) -> AppResult<Json<DataResponse<TokensResponse>>> {
    let categories = NamingRuleRepo::list_categories(&state.pool).await?;

    let category = categories.into_iter().find(|c| c.id == id).ok_or_else(|| {
        AppError::Core(x121_core::error::CoreError::Validation(format!(
            "Naming category with id {id} not found"
        )))
    })?;

    let tokens = naming_engine::tokens_for_category(&category.name);

    Ok(Json(DataResponse {
        data: TokensResponse {
            category_id: category.id,
            category_name: category.name,
            tokens,
        },
    }))
}

/// GET /api/v1/admin/naming/rules
///
/// List naming rules, optionally filtered by project_id.
pub async fn list_rules(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<ListRulesQuery>,
) -> AppResult<Json<DataResponse<Vec<NamingRule>>>> {
    let rules = NamingRuleRepo::list_rules(&state.pool, params.project_id).await?;
    Ok(Json(DataResponse { data: rules }))
}

/// GET /api/v1/admin/naming/rules/{id}
///
/// Get a single naming rule by id.
pub async fn get_rule(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<NamingRule>>> {
    let rule = NamingRuleRepo::find_rule_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(x121_core::error::CoreError::NotFound {
                entity: "naming_rule",
                id,
            })
        })?;
    Ok(Json(DataResponse { data: rule }))
}

/// POST /api/v1/admin/naming/rules
///
/// Create a new naming rule. Validates the template tokens before saving.
pub async fn create_rule(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Json(input): Json<CreateRuleRequest>,
) -> AppResult<Json<DataResponse<NamingRule>>> {
    // Resolve category name for validation
    let category_name = resolve_category_name(&state, input.category_id).await?;

    // Validate template tokens
    let validation = naming_engine::validate_template(&input.template, &category_name);
    if !validation.valid {
        return Err(AppError::Core(x121_core::error::CoreError::Validation(
            format!(
                "Template contains unknown tokens: {}",
                validation.unknown_tokens.join(", ")
            ),
        )));
    }

    let create_dto = CreateNamingRule {
        category_id: input.category_id,
        project_id: input.project_id,
        template: input.template.clone(),
        description: input.description.clone(),
    };

    let rule = NamingRuleRepo::create_rule(&state.pool, &create_dto, admin.user_id).await?;

    // Audit log
    let _ = AuditLogRepo::batch_insert(
        &state.pool,
        &[CreateAuditLog {
            user_id: Some(admin.user_id),
            session_id: None,
            action_type: "naming_rule.created".to_string(),
            entity_type: Some("naming_rule".to_string()),
            entity_id: Some(rule.id),
            details_json: Some(serde_json::json!({
                "category_id": input.category_id,
                "project_id": input.project_id,
                "template": input.template,
            })),
            ip_address: None,
            user_agent: None,
            integrity_hash: None,
        }],
    )
    .await;

    Ok(Json(DataResponse { data: rule }))
}

/// PUT /api/v1/admin/naming/rules/{id}
///
/// Update an existing naming rule. Validates the new template and appends
/// the old state to the changelog.
pub async fn update_rule(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateRuleRequest>,
) -> AppResult<Json<DataResponse<NamingRule>>> {
    // Fetch existing rule to get category for validation
    let existing = NamingRuleRepo::find_rule_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(x121_core::error::CoreError::NotFound {
                entity: "naming_rule",
                id,
            })
        })?;

    // Validate new template if provided
    if let Some(ref new_template) = input.template {
        let category_name = resolve_category_name(&state, existing.category_id).await?;
        let validation = naming_engine::validate_template(new_template, &category_name);
        if !validation.valid {
            return Err(AppError::Core(x121_core::error::CoreError::Validation(
                format!(
                    "Template contains unknown tokens: {}",
                    validation.unknown_tokens.join(", ")
                ),
            )));
        }
    }

    let update_dto = UpdateNamingRule {
        template: input.template.clone(),
        description: input.description.clone(),
        is_active: input.is_active,
    };

    let rule = NamingRuleRepo::update_rule(&state.pool, id, &update_dto, admin.user_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(x121_core::error::CoreError::NotFound {
                entity: "naming_rule",
                id,
            })
        })?;

    // Audit log
    let _ = AuditLogRepo::batch_insert(
        &state.pool,
        &[CreateAuditLog {
            user_id: Some(admin.user_id),
            session_id: None,
            action_type: "naming_rule.updated".to_string(),
            entity_type: Some("naming_rule".to_string()),
            entity_id: Some(id),
            details_json: Some(serde_json::json!({
                "old_template": existing.template,
                "new_template": input.template,
                "new_description": input.description,
                "new_is_active": input.is_active,
            })),
            ip_address: None,
            user_agent: None,
            integrity_hash: None,
        }],
    )
    .await;

    Ok(Json(DataResponse { data: rule }))
}

/// DELETE /api/v1/admin/naming/rules/{id}
///
/// Delete a naming rule. Rejects deletion of global rules (project_id IS NULL).
pub async fn delete_rule(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<serde_json::Value>>> {
    // Fetch existing to check scope
    let existing = NamingRuleRepo::find_rule_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(x121_core::error::CoreError::NotFound {
                entity: "naming_rule",
                id,
            })
        })?;

    if existing.project_id.is_none() {
        return Err(AppError::Core(x121_core::error::CoreError::Validation(
            "Cannot delete global naming rules. Use update to modify them instead.".to_string(),
        )));
    }

    NamingRuleRepo::delete_rule(&state.pool, id).await?;

    // Audit log
    let _ = AuditLogRepo::batch_insert(
        &state.pool,
        &[CreateAuditLog {
            user_id: Some(admin.user_id),
            session_id: None,
            action_type: "naming_rule.deleted".to_string(),
            entity_type: Some("naming_rule".to_string()),
            entity_id: Some(id),
            details_json: Some(serde_json::json!({
                "category_id": existing.category_id,
                "project_id": existing.project_id,
                "template": existing.template,
            })),
            ip_address: None,
            user_agent: None,
            integrity_hash: None,
        }],
    )
    .await;

    Ok(Json(DataResponse {
        data: serde_json::json!({ "deleted": true }),
    }))
}

/// POST /api/v1/admin/naming/preview
///
/// Resolve a template with sample context and return the resulting filename.
pub async fn preview(
    State(_state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Json(input): Json<PreviewRequest>,
) -> AppResult<Json<DataResponse<PreviewResponse>>> {
    let ctx = NamingContext {
        variant_label: input.variant_label,
        scene_type_name: input.scene_type_name,
        is_clothes_off: input.is_clothes_off.unwrap_or(false),
        index: input.index,
        character_name: input.character_name,
        project_name: input.project_name,
        date_compact: input.date_compact,
        version: input.version,
        ext: input.ext,
        frame_number: input.frame_number,
        metadata_type: input.metadata_type,
        sequence: input.sequence,
    };

    let validation = input
        .category
        .as_deref()
        .map(|cat| naming_engine::validate_template(&input.template, cat));

    let resolved = naming_engine::resolve_template(&input.template, &ctx).map_err(|e| match e {
        NamingError::EmptyResult => AppError::Core(x121_core::error::CoreError::Validation(
            "Template resolved to an empty filename".to_string(),
        )),
        NamingError::UnknownTokens(tokens) => {
            AppError::Core(x121_core::error::CoreError::Validation(format!(
                "Unknown tokens: {}",
                tokens.join(", ")
            )))
        }
        NamingError::RuleNotFound(cat) => AppError::Core(x121_core::error::CoreError::Validation(
            format!("No active rule for category: {cat}"),
        )),
    })?;

    Ok(Json(DataResponse {
        data: PreviewResponse {
            filename: resolved.filename,
            unresolved_tokens: resolved.unresolved_tokens,
            validation,
        },
    }))
}

/// GET /api/v1/admin/naming/rules/{id}/history
///
/// Return the changelog array for a naming rule.
pub async fn rule_history(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<HistoryResponse>>> {
    let rule = NamingRuleRepo::find_rule_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(x121_core::error::CoreError::NotFound {
                entity: "naming_rule",
                id,
            })
        })?;

    Ok(Json(DataResponse {
        data: HistoryResponse {
            rule_id: rule.id,
            changelog: rule.changelog,
        },
    }))
}

// ---------------------------------------------------------------------------
// Service function: resolve_filename
// ---------------------------------------------------------------------------

/// Resolve a filename using the naming engine.
///
/// Loads the active rule from the database for the given category (with
/// project-level fallback to global), then calls the pure resolution function.
/// This is the primary entry point for other handlers that need to generate
/// filenames.
pub async fn resolve_filename(
    pool: &sqlx::PgPool,
    category: &str,
    project_id: Option<DbId>,
    ctx: &NamingContext,
) -> Result<String, AppError> {
    let rule = NamingRuleRepo::find_active_rule(pool, category, project_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(x121_core::error::CoreError::Validation(format!(
                "No active naming rule for category '{category}'"
            )))
        })?;

    let resolved = naming_engine::resolve_template(&rule.template, ctx).map_err(|e| match e {
        NamingError::EmptyResult => AppError::Core(x121_core::error::CoreError::Validation(
            "Naming template resolved to an empty filename".to_string(),
        )),
        NamingError::UnknownTokens(tokens) => {
            AppError::Core(x121_core::error::CoreError::Validation(format!(
                "Naming template contains unknown tokens: {}",
                tokens.join(", ")
            )))
        }
        NamingError::RuleNotFound(cat) => AppError::Core(x121_core::error::CoreError::Validation(
            format!("No active naming rule for category: {cat}"),
        )),
    })?;

    Ok(resolved.filename)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Look up the category name by its integer id.
async fn resolve_category_name(state: &AppState, category_id: i16) -> Result<String, AppError> {
    let categories = NamingRuleRepo::list_categories(&state.pool).await?;
    let cat = categories
        .into_iter()
        .find(|c| c.id == category_id)
        .ok_or_else(|| {
            AppError::Core(x121_core::error::CoreError::Validation(format!(
                "Naming category with id {category_id} not found"
            )))
        })?;
    Ok(cat.name)
}

pub mod admin;
pub mod auth;
pub mod character;
pub mod hardware;
pub mod health;
pub mod image_qa;
pub mod jobs;
pub mod keymaps;
pub mod layouts;
pub mod notification;
pub mod proficiency;
pub mod project;
pub mod scene;
pub mod scene_type;
pub mod scripts;
pub mod tags;
pub mod themes;
pub mod trash;
pub mod validation;
pub mod video;

use axum::routing::get;
use axum::Router;

use crate::handlers;
use crate::state::AppState;
use crate::ws;

/// Build the `/api/v1` route tree.
///
/// Route hierarchy:
///
/// ```text
/// /ws                                              WebSocket
///
/// /auth/login                                      login (public)
/// /auth/refresh                                    refresh (public)
/// /auth/logout                                     logout (requires auth)
///
/// /admin/users                                     list, create (admin only)
/// /admin/users/{id}                                get, update, deactivate
/// /admin/users/{id}/reset-password                 reset password
///
/// /admin/hardware/workers/metrics/current           latest metrics per worker
/// /admin/hardware/workers/{id}/metrics              worker metric history
/// /admin/hardware/workers/{id}/restart              restart service (POST)
/// /admin/hardware/workers/{id}/restarts             restart history
/// /admin/hardware/thresholds                        list all thresholds
/// /admin/hardware/workers/{id}/thresholds           update worker thresholds (PUT)
/// /admin/hardware/thresholds/global                 update global thresholds (PUT)
///
/// /admin/scripts                                    list, register (admin only)
/// /admin/scripts/{id}                               get, update, deactivate
/// /admin/scripts/{id}/test                          test execution (POST)
/// /admin/scripts/{id}/executions                    execution history (GET)
/// /admin/scripts/executions/{id}                    execution detail (GET)
///
/// /admin/themes                                     list, create (admin only)
/// /admin/themes/{id}                                get, update, delete
/// /admin/themes/{id}/export                         export tokens (GET)
///
/// /user/theme                                       get, update (auth required)
///
/// /user/keymap                                      get, update (auth required)
///
/// /keymaps/presets                                   list presets (auth required)
/// /keymaps/export                                    export keymap (POST)
/// /keymaps/import                                    import keymap (POST)
///
/// /user/proficiency                                 list, set (auth required)
/// /user/proficiency/record-usage                    record usage (POST)
/// /user/proficiency/focus-mode                      get, set focus mode
///
/// /user/layouts                                     list, create (auth required)
/// /user/layouts/{id}                                get, update, delete
///
/// /admin/layout-presets                             list, create (admin only)
/// /admin/layout-presets/{id}                        update, delete
///
/// /ws/metrics                                       agent metrics WebSocket
///
/// /projects                                        list, create
/// /projects/{id}                                   get, update, delete
/// /projects/{project_id}/characters                list, create
/// /projects/{project_id}/characters/{id}           get, update, delete
/// /projects/{project_id}/characters/{id}/settings  get, put, patch
/// /projects/{project_id}/scene-types               list, create
/// /projects/{project_id}/scene-types/{id}          get, update, delete
///
/// /characters/{character_id}/source-images         list, create
/// /characters/{character_id}/source-images/{id}    get, update, delete
/// /characters/{character_id}/derived-images        list, create
/// /characters/{character_id}/derived-images/{id}   get, update, delete
/// /characters/{character_id}/image-variants        list, create
/// /characters/{character_id}/image-variants/{id}   get, update, delete
/// /characters/{character_id}/scenes                list, create
/// /characters/{character_id}/scenes/{id}           get, update, delete
///
/// /scenes/{scene_id}/segments                      list, create
/// /scenes/{scene_id}/segments/{id}                 get, update, delete
///
/// /scenes/{scene_id}/versions                      list
/// /scenes/{scene_id}/versions/import               import (multipart)
/// /scenes/{scene_id}/versions/{id}                 get, delete
/// /scenes/{scene_id}/versions/{id}/set-final       set-final
///
/// /scene-types                                     list (studio-level), create
/// /scene-types/{id}                                get, update, delete
///
/// /trash                                           list (?type=entity_type)
/// /trash/purge                                     purge all (DELETE)
/// /trash/purge-preview                             purge preview (GET)
/// /trash/{entity_type}/{id}/restore                restore (POST)
/// /trash/{entity_type}/{id}/purge                  purge one (DELETE)
///
/// /notifications                                   list (?unread_only, limit, offset)
/// /notifications/read-all                          mark all read (POST)
/// /notifications/unread-count                      unread count (GET)
/// /notifications/{id}/read                         mark read (POST)
/// /notifications/preferences                       list preferences (GET)
/// /notifications/preferences/{event_type_id}       update preference (PUT)
/// /notifications/settings                          get/update settings (GET, PUT)
///
/// /qa/check-types                                  list check types
/// /qa/run                                          run QA checks (POST)
/// /qa/image-variants/{id}/results                  get QA results
/// /qa/characters/{character_id}/source-qa-results  get source QA results
/// /qa/projects/{project_id}/thresholds             get, update thresholds
///
/// /validation/rule-types                            list rule types (GET)
/// /validation/rules                                 list, create rules (GET, POST)
/// /validation/rules/{id}                            update, delete rule (PUT, DELETE)
/// /validation/validate                              dry-run validation (POST)
///
/// /imports                                          list import reports (GET)
/// /imports/{id}/commit                              commit import (POST)
/// /imports/{id}/report                              get report as JSON (GET)
/// /imports/{id}/report/csv                          get report as CSV (GET)
///
/// /videos/{source_type}/{source_id}/stream           stream video (GET, range)
/// /videos/{source_type}/{source_id}/metadata         video metadata (GET)
/// /videos/{source_type}/{source_id}/thumbnails/{f}   get thumbnail (GET)
/// /videos/{source_type}/{source_id}/thumbnails       generate thumbnails (POST)
///
/// /jobs                                              list, submit (GET, POST)
/// /jobs/{id}                                         get job (GET)
/// /jobs/{id}/cancel                                  cancel job (POST)
/// /jobs/{id}/retry                                   retry failed job (POST)
///
/// /tags                                              list tags (GET)
/// /tags/suggest                                      autocomplete (GET)
/// /tags/{id}                                         update, delete (PUT, DELETE)
/// /tags/bulk-apply                                   bulk apply (POST)
/// /tags/bulk-remove                                  bulk remove (POST)
///
/// /entities/{type}/{id}/tags                         list, apply (GET, POST)
/// /entities/{type}/{id}/tags/{tag_id}                remove (DELETE)
/// ```
pub fn api_routes() -> Router<AppState> {
    Router::new()
        // WebSocket endpoints.
        .route("/ws", get(ws::ws_handler))
        .route("/ws/metrics", get(handlers::hardware::metrics_ws_handler))
        // Authentication routes (login, refresh, logout).
        .nest("/auth", auth::router())
        // Admin routes (user management + hardware monitoring + themes).
        .nest("/admin", admin::router())
        .nest("/admin/hardware", hardware::router())
        .nest("/admin/scripts", scripts::router())
        .nest("/admin/themes", themes::admin_router())
        // User-facing theme preference.
        .nest("/user/theme", themes::user_router())
        // User-facing keymap preference (PRD-52).
        .nest("/user/keymap", keymaps::user_router())
        // Keymap presets and export/import (PRD-52).
        .nest("/keymaps", keymaps::preset_router())
        // User proficiency & focus mode (PRD-32).
        .nest("/user/proficiency", proficiency::router())
        // User-facing layout management (PRD-30).
        .nest("/user/layouts", layouts::user_router())
        // Admin layout preset management (PRD-30).
        .nest("/admin/layout-presets", layouts::admin_router())
        // Project routes (also nests characters and project-scoped scene types).
        .nest("/projects", project::router())
        // Character-scoped sub-resources (images, scenes).
        .nest("/characters", character::router())
        // Scene-scoped sub-resources (segments).
        .nest("/scenes", scene::router())
        // Studio-level scene types.
        .nest("/scene-types", scene_type::studio_router())
        // Trash / bin management.
        .nest("/trash", trash::router())
        // Notifications, preferences, and settings.
        .nest("/notifications", notification::router())
        // Image quality assurance (check types, QA runs, thresholds).
        .nest("/qa", image_qa::router())
        // Validation engine (rule types, rules, dry-run validation).
        .nest("/validation", validation::validation_router())
        // Import reports and commit.
        .nest("/imports", validation::imports_router())
        // Video streaming, metadata, and thumbnails.
        .nest("/videos", video::router())
        // Background job execution engine (PRD-07).
        .nest("/jobs", jobs::router())
        // Tag system: tag CRUD, suggestions, bulk ops (PRD-47).
        .nest("/tags", tags::router())
        // Entity-scoped tag associations (PRD-47).
        .nest("/entities", tags::entity_tags_router())
}

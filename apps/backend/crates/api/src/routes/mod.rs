pub mod admin;
pub mod approval;
pub mod assets;
pub mod audit;
pub mod auth;
pub mod bug_reports;
pub mod character;
pub mod character_metadata;
pub mod checkpoints;
pub mod collaboration;
pub mod config_management;
pub mod dashboard;
pub mod delivery;
pub mod downloads;
pub mod duplicates;
pub mod embedding;
pub mod extensions;
pub mod generation;
pub mod external_api;
pub mod hardware;
pub mod health;
pub mod image_qa;
pub mod importer;
pub mod integrity;
pub mod job_debug;
pub mod jobs;
pub mod keymaps;
pub mod layouts;
pub mod library;
pub mod metadata;
pub mod notification;
pub mod onboarding;
pub mod palette;
pub mod performance;
pub mod presets;
pub mod proficiency;
pub mod project;
pub mod quality_gates;
pub mod queue;
pub mod reclamation;
pub mod review_notes;
pub mod scene;
pub mod scene_type;
pub mod scripts;
pub mod search;
pub mod storage;
pub mod tags;
pub mod themes;
pub mod trash;
pub mod undo_tree;
pub mod validation;
pub mod video;
pub mod wiki;
pub mod workflow_canvas;
pub mod workers;
pub mod workspace;

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
/// /admin/reclamation/preview                        preview reclaimable space (GET)
/// /admin/reclamation/run                            trigger cleanup (POST)
/// /admin/reclamation/trash                          list trash queue (GET)
/// /admin/reclamation/trash/{id}/restore             restore entry (POST)
/// /admin/reclamation/history                        cleanup history (GET)
/// /admin/reclamation/protection-rules               list, create (GET, POST)
/// /admin/reclamation/protection-rules/{id}          update, delete (PUT, DELETE)
/// /admin/reclamation/policies                       list, create (GET, POST)
/// /admin/reclamation/policies/{id}                  update, delete (PUT, DELETE)
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
/// /dashboard/widgets/active-tasks                   active tasks widget (GET)
/// /dashboard/widgets/project-progress               project progress widget (GET)
/// /dashboard/widgets/disk-health                    disk health widget (GET)
/// /dashboard/widgets/activity-feed                  activity feed widget (GET)
/// /user/dashboard                                   get, save dashboard config
///
/// /user/onboarding                                  get, update (auth required, PRD-53)
/// /user/onboarding/reset                            reset onboarding (POST, PRD-53)
///
/// /user/recent-items                                list, record, clear (GET, POST, DELETE, PRD-31)
///
/// /search/palette                                   command palette search (GET, PRD-31)
///
/// /ws/metrics                                       agent metrics WebSocket
///
/// /projects                                        list, create
/// /projects/{id}                                   get, update, delete
/// /projects/{project_id}/characters                list, create
/// /projects/{project_id}/characters/{id}           get, update, delete
/// /projects/{project_id}/characters/{id}/settings  get, put, patch
/// /projects/{project_id}/characters/metadata             all metadata (PRD-66)
/// /projects/{project_id}/characters/metadata/completeness project completeness (PRD-66)
/// /projects/{project_id}/characters/metadata/csv         export/import CSV (PRD-66)
/// /projects/{project_id}/scene-types               list, create
/// /projects/{project_id}/scene-types/{id}          get, update, delete
/// /projects/{project_id}/qa-thresholds             list, upsert (GET, POST, PRD-49)
/// /projects/{project_id}/qa-thresholds/{id}        delete (DELETE, PRD-49)
///
/// /characters/{character_id}/source-images         list, create
/// /characters/{character_id}/source-images/{id}    get, update, delete
/// /characters/{character_id}/derived-images        list, create
/// /characters/{character_id}/derived-images/{id}   get, update, delete
/// /characters/{character_id}/image-variants        list, create
/// /characters/{character_id}/image-variants/{id}   get, update, delete
/// /characters/{character_id}/metadata               get, update (PRD-66)
/// /characters/{character_id}/metadata/completeness  completeness status (PRD-66)
/// /characters/{character_id}/scenes                list, create
/// /characters/{character_id}/scenes/{id}           get, update, delete
///
/// /characters/{character_id}/extract-embedding     trigger extraction (POST, PRD-76)
/// /characters/{character_id}/embedding-status      get status (GET, PRD-76)
/// /characters/{character_id}/detected-faces        list faces (GET, PRD-76)
/// /characters/{character_id}/select-face           select face (POST, PRD-76)
/// /characters/{character_id}/embedding-history     history (GET, PRD-76)
///
/// /scenes/{scene_id}/segments                      list, create
/// /scenes/{scene_id}/segments/{id}                 get, update, delete
/// /scenes/{scene_id}/review-queue                  review queue (GET, PRD-35)
/// /scenes/{id}/generate                            start generation (POST, PRD-24)
/// /scenes/{id}/progress                            generation progress (GET, PRD-24)
/// /scenes/batch-generate                           batch generate (POST, PRD-24)
/// /scenes/{scene_id}/qa-summary                    scene QA summary (GET, PRD-49)
///
/// /segments/{segment_id}/approve                   approve segment (POST, PRD-35)
/// /segments/{segment_id}/reject                    reject segment (POST, PRD-35)
/// /segments/{segment_id}/flag                      flag segment (POST, PRD-35)
/// /segments/{segment_id}/approvals                 list approvals (GET, PRD-35)
/// /segments/{id}/notes                             list, create (GET, POST, PRD-38)
/// /segments/{id}/notes/{note_id}                   update, delete (PUT, DELETE, PRD-38)
/// /segments/{id}/notes/{note_id}/resolve           resolve note (PUT, PRD-38)
/// /segments/{id}/notes/{note_id}/tags              assign tags (POST, PRD-38)
/// /segments/{id}/notes/{note_id}/tags/{tag_id}     remove tag (DELETE, PRD-38)
/// /segments/{id}/select-boundary-frame             select boundary (POST, PRD-24)
/// /segments/{segment_id}/qa-scores                 per-segment QA scores (GET, PRD-49)
///
/// /rejection-categories                            list categories (GET, PRD-35)
///
/// /review-tags                                     list, create (GET, POST, PRD-38)
/// /review-tags/{id}                                delete (DELETE, PRD-38)
///
/// /scenes/{scene_id}/versions                      list
/// /scenes/{scene_id}/versions/import               import (multipart)
/// /scenes/{scene_id}/versions/{id}                 get, delete
/// /scenes/{scene_id}/versions/{id}/set-final       set-final
///
/// /scene-types                                     list (studio-level), create
/// /scene-types/{id}                                get, update, delete
/// /scene-types/{id}/preview-prompt/{character_id}  preview prompt (GET, PRD-23)
/// /scene-types/matrix                              generate matrix (POST, PRD-23)
/// /scene-types/validate                            validate config (POST, PRD-23)
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
/// /qa/quality-gates/defaults                       studio QA defaults (GET, PRD-49)
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
/// /jobs/{id}/pause                                   pause job (POST, PRD-08)
/// /jobs/{id}/resume                                  resume job (POST, PRD-08)
/// /jobs/{id}/transitions                             job audit trail (GET, PRD-08)
/// /jobs/{id}/checkpoints                             list checkpoints (GET, PRD-28)
/// /jobs/{id}/checkpoints/{checkpoint_id}             get checkpoint (GET, PRD-28)
/// /jobs/{id}/resume-from-checkpoint                  resume from checkpoint (POST, PRD-28)
/// /jobs/{id}/diagnostics                             failure diagnostics (GET, PRD-28)
/// /jobs/{id}/debug                                   debug state (GET, PRD-34)
/// /jobs/{id}/debug/pause                             debug pause (POST, PRD-34)
/// /jobs/{id}/debug/resume                            debug resume (POST, PRD-34)
/// /jobs/{id}/debug/params                            update mid-run params (PUT, PRD-34)
/// /jobs/{id}/debug/preview                           intermediate previews (GET, PRD-34)
/// /jobs/{id}/debug/abort                             abort with reason (POST, PRD-34)
///
/// /queue                                              queue status (GET, PRD-08)
/// /quota/status                                       user quota status (GET, PRD-08)
///
/// /admin/queue/reorder                                reorder job (PUT, PRD-08)
/// /admin/users/{id}/quota                             set user quota (PUT, PRD-08)
/// /admin/scheduling/policies                          list, create (GET, POST, PRD-08)
/// /admin/scheduling/policies/{id}                     update (PUT, PRD-08)
///
/// /search                                             unified search (GET, PRD-20)
/// /search/typeahead                                   typeahead (GET, PRD-20)
/// /search/similar                                     visual similarity (POST, PRD-20)
/// /search/saved                                       list, create (GET, POST, PRD-20)
/// /search/saved/{id}                                  delete (DELETE, PRD-20)
/// /search/saved/{id}/execute                          execute saved (GET, PRD-20)
///
/// /tags                                              list tags (GET)
/// /tags/suggest                                      autocomplete (GET)
/// /tags/{id}                                         update, delete (PUT, DELETE)
/// /tags/bulk-apply                                   bulk apply (POST)
/// /tags/bulk-remove                                  bulk remove (POST)
///
/// /entities/{type}/{id}/tags                         list, apply (GET, POST)
/// /entities/{type}/{id}/tags/{tag_id}                remove (DELETE)
///
/// /assets                                             list, create (GET, POST)
/// /assets/{id}                                        get, update, delete
/// /assets/{id}/dependencies                           list, add (GET, POST)
/// /assets/{id}/impact                                 impact analysis (GET)
/// /assets/{id}/notes                                  list, add (GET, POST)
/// /assets/{id}/rating                                 rate (PUT)
/// /assets/{id}/ratings                                list ratings (GET)
///
/// /performance/overview                                aggregated overview (GET)
/// /performance/trend                                   global trend (GET)
/// /performance/workflow/{id}                           per-workflow metrics (GET)
/// /performance/workflow/{id}/trend                     workflow trend (GET)
/// /performance/worker/{id}                             per-worker metrics (GET)
/// /performance/workers/comparison                      compare workers (GET)
/// /performance/comparison                              compare workflows (GET)
/// /performance/metrics                                 record metric (POST)
/// /performance/alerts/thresholds                       list, create (GET, POST)
/// /performance/alerts/thresholds/{id}                  update, delete (PUT, DELETE)
///
/// /admin/extensions                                     list, install (GET, POST)
/// /admin/extensions/{id}                                get, update, uninstall
/// /admin/extensions/{id}/enable                         enable (POST)
/// /admin/extensions/{id}/disable                        disable (POST)
///
/// /extensions/registry                                  enabled extensions (GET)
///
/// /admin/audit-logs                                      query logs (GET, PRD-45)
/// /admin/audit-logs/export                               export logs (GET, PRD-45)
/// /admin/audit-logs/integrity-check                      integrity check (GET, PRD-45)
/// /admin/audit-logs/retention                            list policies (GET, PRD-45)
/// /admin/audit-logs/retention/{category}                 update policy (PUT, PRD-45)
///
/// /extension-api/projects                               ext proxy: list projects (GET)
/// /extension-api/characters/{id}                        ext proxy: get character (GET)
///
/// /workspace                                             get, update (GET, PUT, PRD-04)
/// /workspace/reset                                       reset to defaults (POST, PRD-04)
/// /workspace/undo/{entity_type}/{entity_id}              get, save snapshot (GET, PUT, PRD-04)
///
/// /user/undo-tree/{entity_type}/{entity_id}              get, save, delete (GET, PUT, DELETE, PRD-51)
/// /user/undo-trees                                       list all trees (GET, PRD-51)
///
/// /collaboration/locks/acquire                            acquire lock (POST, PRD-11)
/// /collaboration/locks/release                            release lock (POST, PRD-11)
/// /collaboration/locks/extend                             extend lock (POST, PRD-11)
/// /collaboration/locks/{entity_type}/{entity_id}          lock status (GET, PRD-11)
/// /collaboration/presence/{entity_type}/{entity_id}       who is viewing (GET, PRD-11)
///
/// /admin/api-keys                                         list, create (GET, POST, PRD-12)
/// /admin/api-keys/scopes                                  list scopes (GET, PRD-12)
/// /admin/api-keys/{id}                                    update (PUT, PRD-12)
/// /admin/api-keys/{id}/rotate                             rotate key (POST, PRD-12)
/// /admin/api-keys/{id}/revoke                             revoke key (POST, PRD-12)
///
/// /admin/webhooks                                         list, create (GET, POST, PRD-12)
/// /admin/webhooks/{id}                                    update, delete (PUT, DELETE, PRD-12)
/// /admin/webhooks/{id}/deliveries                         delivery history (GET, PRD-12)
/// /admin/webhooks/{id}/test                               test webhook (POST, PRD-12)
/// /admin/webhooks/deliveries/{id}/replay                  replay delivery (POST, PRD-12)
///
/// /workflows/{id}/canvas                                   get, save canvas (GET, PUT, PRD-33)
/// /workflows/{id}/telemetry                                node timing data (GET, PRD-33)
/// /workflows/import-comfyui                                import ComfyUI JSON (POST, PRD-33)
///
/// /bug-reports                                              submit, list (POST, GET, PRD-44)
/// /bug-reports/{id}                                         get report (GET, PRD-44)
/// /bug-reports/{id}/status                                  update status (PUT, PRD-44)
///
/// /admin/config/export                                      export config (POST, PRD-44)
/// /admin/config/validate                                    validate config (POST, PRD-44)
/// /admin/config/import                                      import config (POST, PRD-44)
///
/// /admin/workers                                             list, register (GET, POST, PRD-46)
/// /admin/workers/stats                                       fleet statistics (GET, PRD-46)
/// /admin/workers/{id}                                        get, update (GET, PUT, PRD-46)
/// /admin/workers/{id}/approve                                approve worker (POST, PRD-46)
/// /admin/workers/{id}/drain                                  drain worker (POST, PRD-46)
/// /admin/workers/{id}/decommission                           decommission worker (POST, PRD-46)
/// /admin/workers/{id}/health-log                             health log (GET, PRD-46)
///
/// /workers/register                                          agent self-register (POST, PRD-46)
///
/// /library/characters                                          list, create (GET, POST, PRD-60)
/// /library/characters/{id}                                     get, update, delete (PRD-60)
/// /library/characters/{id}/usage                               cross-project usage (GET, PRD-60)
/// /library/characters/{id}/import                              import to project (POST, PRD-60)
/// /library/characters/projects/{project_id}/links              list links (GET, PRD-60)
/// /library/characters/links/{link_id}                          update, delete link (PUT, DELETE, PRD-60)
///
/// /admin/storage/backends                                      list, create (GET, POST, PRD-48)
/// /admin/storage/backends/{id}                                 update (PUT, PRD-48)
/// /admin/storage/backends/{id}/decommission                    decommission (POST, PRD-48)
/// /admin/storage/policies                                      list, create (GET, POST, PRD-48)
/// /admin/storage/policies/simulate                             simulate policy (POST, PRD-48)
/// /admin/storage/migrations                                    start migration (POST, PRD-48)
/// /admin/storage/migrations/{id}                               get migration (GET, PRD-48)
/// /admin/storage/migrations/{id}/rollback                      rollback migration (POST, PRD-48)
///
/// /templates                                                    list, create (GET, POST, PRD-27)
/// /templates/{id}                                               get, update, delete (PRD-27)
///
/// /presets                                                      list, create (GET, POST, PRD-27)
/// /presets/marketplace                                          marketplace (GET, PRD-27)
/// /presets/{id}                                                 get, update, delete (PRD-27)
/// /presets/{id}/rate                                            rate preset (POST, PRD-27)
/// /presets/{id}/diff/{scene_type_id}                            preview apply (GET, PRD-27)
/// /presets/{id}/apply/{scene_type_id}                           apply preset (POST, PRD-27)
///
/// /output-format-profiles                                       list, create (GET, POST, PRD-39)
/// /output-format-profiles/{id}                                  get, update, delete (PRD-39)
///
/// /projects/{project_id}/assemble                               start assembly (POST, PRD-39)
/// /projects/{project_id}/delivery-validation                    validate delivery (GET, PRD-39)
/// /projects/{project_id}/exports                                list exports (GET, PRD-39)
/// /projects/{project_id}/exports/{export_id}                    get export (GET, PRD-39)
///
/// /watermark-settings                                           list, create (GET, POST, PRD-39)
/// /watermark-settings/{id}                                      get, update, delete (PRD-39)
///
/// /admin/integrity-scans                                        list, start scan (GET, POST, PRD-43)
/// /admin/integrity-scans/{worker_id}                            worker report, start worker scan (GET, POST, PRD-43)
/// /admin/repair/{worker_id}                                     full repair (POST, PRD-43)
/// /admin/repair/{worker_id}/sync-models                         sync models (POST, PRD-43)
/// /admin/repair/{worker_id}/install-nodes                       install nodes (POST, PRD-43)
/// /admin/model-checksums                                        list, create (GET, POST, PRD-43)
/// /admin/model-checksums/{id}                                   update, delete (PUT, DELETE, PRD-43)
///
/// /wiki/articles                                                 list, create (GET, POST, PRD-56)
/// /wiki/articles/search                                          search articles (GET, PRD-56)
/// /wiki/articles/pinned                                          list pinned (GET, PRD-56)
/// /wiki/articles/help/{element_id}                               contextual help (GET, PRD-56)
/// /wiki/articles/{slug}                                          get, update, delete (PRD-56)
/// /wiki/articles/{slug}/versions                                 list versions (GET, PRD-56)
/// /wiki/articles/{slug}/versions/{version}                       get version (GET, PRD-56)
/// /wiki/articles/{slug}/revert/{version}                         revert (POST, PRD-56)
/// /wiki/articles/{slug}/diff                                     diff versions (GET, PRD-56)
///
/// /characters/duplicates/check                                   check single (POST, PRD-79)
/// /characters/duplicates/batch                                   batch check (POST, PRD-79)
/// /characters/duplicates/history                                 check history (GET, PRD-79)
/// /characters/duplicates/{id}/resolve                            resolve match (POST, PRD-79)
/// /characters/duplicates/{id}/dismiss                            dismiss match (POST, PRD-79)
/// /admin/duplicate-settings                                      get, update settings (GET, PUT, PRD-79)
///
/// /downloads                                                      list, create (GET, POST, PRD-104)
/// /downloads/{id}                                                 get download (GET, PRD-104)
/// /downloads/{id}/pause                                           pause download (POST, PRD-104)
/// /downloads/{id}/resume                                          resume download (POST, PRD-104)
/// /downloads/{id}/cancel                                          cancel download (POST, PRD-104)
/// /downloads/{id}/retry                                           retry download (POST, PRD-104)
///
/// /admin/placement-rules                                          list, create (GET, POST, PRD-104)
/// /admin/placement-rules/{id}                                     update, delete (PUT, DELETE, PRD-104)
///
/// /user/api-tokens                                                list, store (GET, POST, PRD-104)
/// /user/api-tokens/{service}                                      delete token (DELETE, PRD-104)
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
        // Disk reclamation: protection rules, policies, trash queue (PRD-15).
        .nest("/admin/reclamation", reclamation::router())
        // Audit logging & compliance (PRD-45).
        .nest("/admin/audit-logs", audit::router())
        // External API & Webhooks admin management (PRD-12).
        .nest("/admin/api-keys", external_api::api_keys_router())
        .nest("/admin/webhooks", external_api::webhooks_router())
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
        // Studio Pulse Dashboard: widget data endpoints (PRD-42).
        .nest("/dashboard", dashboard::router())
        // User-facing dashboard configuration (PRD-42).
        .nest("/user/dashboard", dashboard::user_router())
        // User onboarding state (PRD-53).
        .nest("/user/onboarding", onboarding::router())
        // User recent items for command palette (PRD-31).
        .nest("/user/recent-items", palette::recent_items_router())
        // Undo/redo tree persistence (PRD-51).
        .nest("/user/undo-tree", undo_tree::router())
        .nest("/user/undo-trees", undo_tree::user_router())
        // Workspace state persistence (PRD-04).
        .nest("/workspace", workspace::router())
        // Real-time collaboration: entity locks and presence (PRD-11).
        .nest("/collaboration", collaboration::router())
        // Performance & benchmarking dashboard (PRD-41).
        .nest("/performance", performance::router())
        // Project routes (also nests characters and project-scoped scene types).
        .nest("/projects", project::router()
            .merge(metadata::project_metadata_router())
            .merge(delivery::export_router())
            .merge(quality_gates::threshold_router())
            .nest("/{project_id}/characters", character_metadata::project_router()))
        // Character-scoped sub-resources (images, scenes, metadata editor, face embedding).
        .nest("/characters", character::router()
            .merge(metadata::character_metadata_router())
            .merge(character_metadata::character_router())
            .merge(embedding::embedding_router()))
        // Scene-scoped sub-resources (segments, review queue, generation PRD-24, QA PRD-49).
        .nest("/scenes", scene::router()
            .merge(metadata::scene_metadata_router())
            .merge(approval::scene_review_router())
            .merge(generation::generation_scene_router())
            .merge(quality_gates::scene_qa_router()))
        // Segment-scoped approval actions (approve, reject, flag) (PRD-35).
        // Segment-scoped review notes and tags (PRD-38).
        // Segment-scoped boundary frame selection (PRD-24).
        // Segment-scoped QA scores (PRD-49).
        .nest("/segments", approval::segment_router()
            .merge(review_notes::segment_notes_router())
            .merge(generation::generation_segment_router())
            .merge(quality_gates::segment_qa_router()))
        // Rejection categories for structured rejection tracking (PRD-35).
        .nest("/rejection-categories", approval::rejection_categories_router())
        // Review tags for collaborative review (PRD-38).
        .nest("/review-tags", review_notes::review_tags_router())
        // Studio-level scene types.
        .nest("/scene-types", scene_type::studio_router())
        // Trash / bin management.
        .nest("/trash", trash::router())
        // Notifications, preferences, and settings.
        .nest("/notifications", notification::router())
        // Image quality assurance (check types, QA runs, thresholds).
        .nest("/qa", image_qa::router())
        // Automated Quality Gates: studio-level defaults (PRD-49).
        .nest("/qa/quality-gates", quality_gates::studio_qa_router())
        // Validation engine (rule types, rules, dry-run validation).
        .nest("/validation", validation::validation_router())
        // Import reports and commit.
        .nest("/imports", validation::imports_router())
        // Folder-to-entity bulk importer (PRD-016).
        .nest("/import", importer::router())
        // Video streaming, metadata, and thumbnails.
        .nest("/videos", video::router())
        // Background job execution engine (PRD-07, PRD-08, PRD-28, PRD-34).
        .nest("/jobs", jobs::router()
            .merge(checkpoints::checkpoint_routes())
            .merge(job_debug::debug_routes()))
        // Queue management & scheduling (PRD-08).
        .nest("/queue", queue::router())
        .nest("/quota", queue::quota_router())
        .nest("/admin/queue", queue::admin_router())
        .nest("/admin/scheduling", queue::scheduling_admin_router())
        .route(
            "/admin/users/{id}/quota",
            axum::routing::put(crate::handlers::queue::set_user_quota),
        )
        // Search & discovery engine (PRD-20).
        .nest("/search", search::router())
        // Command palette search (PRD-31).
        .nest("/search/palette", palette::search_router())
        // Tag system: tag CRUD, suggestions, bulk ops (PRD-47).
        .nest("/tags", tags::router())
        // Entity-scoped tag associations (PRD-47).
        .nest("/entities", tags::entity_tags_router())
        // Asset registry: CRUD, dependencies, notes, ratings (PRD-17).
        .nest("/assets", assets::router())
        // Extension admin management (PRD-85).
        .nest("/admin/extensions", extensions::admin_router())
        // Extension registry for authenticated clients (PRD-85).
        .nest("/extensions", extensions::registry_router())
        // Sandboxed extension API bridge (PRD-85).
        .nest("/extension-api", extensions::ext_api_router())
        // Workflow canvas: layout persistence, telemetry, ComfyUI import (PRD-33).
        .nest("/workflows", workflow_canvas::router())
        // Bug reporting (PRD-44).
        .nest("/bug-reports", bug_reports::router())
        // Configuration export/import (PRD-44).
        .nest("/admin/config", config_management::router())
        // Worker pool management: admin endpoints (PRD-46).
        .nest("/admin/workers", workers::admin_router())
        // Worker pool management: agent self-registration (PRD-46).
        .nest("/workers", workers::agent_router())
        // External & tiered storage management (PRD-48).
        .nest("/admin/storage", storage::router())
        // Character library: cross-project character sharing (PRD-60).
        .nest("/library/characters", library::router())
        // Template & preset system (PRD-27).
        .nest("/templates", presets::template_router())
        .nest("/presets", presets::preset_router())
        // Output format profiles (PRD-39).
        .nest("/output-format-profiles", delivery::profile_router())
        // Watermark settings (PRD-39).
        .nest("/watermark-settings", delivery::watermark_router())
        // System integrity & repair tools (PRD-43).
        .nest("/admin/integrity-scans", integrity::scan_router())
        .nest("/admin/repair", integrity::repair_router())
        .nest("/admin/model-checksums", integrity::checksum_router())
        // Studio Wiki & Contextual Help (PRD-56).
        .nest("/wiki/articles", wiki::router())
        // Character duplicate detection (PRD-79).
        .nest("/characters/duplicates", duplicates::router())
        .nest("/admin/duplicate-settings", duplicates::settings_router())
        // Model & LoRA download manager (PRD-104).
        .nest("/downloads", downloads::download_router())
        .nest("/admin/placement-rules", downloads::placement_router())
        .nest("/user/api-tokens", downloads::token_router())
}

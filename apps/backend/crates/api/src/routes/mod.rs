pub mod activity_log;
pub mod admin;
pub mod annotation;
pub mod api_observability;
pub mod approval;
pub mod assets;
pub mod audit;
pub mod auth;
pub mod auto_retry;
pub mod avatar;
pub mod avatar_dashboard;
pub mod avatar_deliverable_ignore;
pub mod avatar_ingest;
pub mod avatar_metadata;
pub mod avatar_metadata_version;
pub mod avatar_review;
pub mod avatar_scene_overrides;
pub mod avatar_speech;
pub mod backup_recovery;
pub mod batch_metadata;
pub mod batch_review;
pub mod branching;
pub mod budget_quota;
pub mod bug_reports;
pub mod checkpoints;
pub mod cloud_providers;
pub mod collaboration;
pub mod comparison;
pub mod compliance;
pub mod config_management;
pub mod consistency_report;
pub mod contact_sheet;
pub mod dashboard;
pub mod dashboard_customization;
pub mod delivery;
pub mod delivery_destination;
pub mod directors_view;
pub mod downloads;
pub mod duplicates;
pub mod embedding;
pub mod estimation;
pub mod extensions;
pub mod external_api;
pub mod failure_analytics;
pub mod generation;
pub mod gpu_power;
pub mod group_scene_settings;
pub mod hardware;
pub mod health;
pub mod image_qa;
pub mod importer;
pub mod infrastructure;
pub mod integrity;
pub mod job_debug;
pub mod job_scheduling;
pub mod jobs;
pub mod keymaps;
pub mod language;
pub mod layouts;
pub mod legacy_import;
pub mod library;
pub mod maintenance;
pub mod metadata;
pub mod metadata_template;
pub mod naming;
pub mod notification;
pub mod onboarding;
pub mod onboarding_wizard;
pub mod palette;
pub mod performance;
pub mod pipeline_hooks;
pub mod pipelines;
pub mod platform_settings;
pub mod poster_frame;
pub mod presets;
pub mod production_notes;
pub mod production_report;
pub mod production_run;
pub mod proficiency;
pub mod project;
pub mod project_config;
pub mod project_lifecycle;
pub mod project_scene_settings;
pub mod project_speech_config;
pub mod project_speech_import;
pub mod prompt_editor;
pub mod prompt_management;
pub mod provenance;
pub mod qa_rulesets;
pub mod quality_gates;
pub mod queue;
pub mod readiness;
pub mod reclamation;
pub mod refinement;
pub mod regression;
pub mod render_timeline;
pub mod resolution;
pub mod restitching;
pub mod review_notes;
pub mod scene;
pub mod scene_type;
pub mod scene_type_inheritance;
pub mod scripts;
pub mod search;
pub mod segment_comparison;
pub mod sensitivity;
pub mod session_management;
pub mod setup_wizard;
pub mod shared_link;
pub mod sidecar;
pub mod speech_type;
pub mod status;
pub mod storage;
pub mod storage_visualizer;
pub mod storyboard;
pub mod system_health;
pub mod tags;
pub mod temporal;
pub mod test_shot;
pub mod themes;
pub mod track;
pub mod trash;
pub mod trigger_workflow;
pub mod trimming;
pub mod undo_tree;
pub mod validation;
pub mod validation_dashboard;
pub mod video;
pub mod video_settings;
pub mod video_spec;
pub mod webhook_testing;
pub mod wiki;
pub mod workers;
pub mod workflow_canvas;
pub mod workflow_import;
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
/// /admin/health/statuses                            all service statuses (GET, PRD-80)
/// /admin/health/services/{service}                  service detail (GET, PRD-80)
/// /admin/health/uptime                              uptime percentages (GET, PRD-80)
/// /admin/health/startup                             startup checklist (GET, PRD-80)
/// /admin/health/recheck/{service}                   recheck service (POST, PRD-80)
/// /admin/health/alerts                              list alert configs (GET, PRD-80)
/// /admin/health/alerts/{service}                    update alert config (PUT, PRD-80)
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
/// /admin/storage/treemap                            treemap hierarchy (GET, PRD-19)
/// /admin/storage/breakdown                          file type distribution (GET, PRD-19)
/// /admin/storage/summary                            total storage summary (GET, PRD-19)
/// /admin/storage/refresh                            trigger snapshot refresh (POST, PRD-19)
/// /admin/storage/categories                         file type categories (GET, PRD-19)
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
/// /user/review-queue                                get review queue (GET, PRD-55)
/// /user/review-queue/{segment_id}/action            submit review action (POST, PRD-55)
/// /user/push-subscription                           register, delete push sub (POST, DELETE, PRD-55)
/// /user/sync                                        sync offline actions (POST, PRD-55)
/// /user/activity-feed                               mobile activity feed (GET, PRD-55)
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
/// /projects/{id}/stats                             project stats (GET, PRD-112)
/// /projects/{project_id}/avatars                list, create
/// /projects/{project_id}/avatars/{id}           get, update, delete
/// /projects/{project_id}/avatars/{id}/settings  get, put, patch
/// /projects/{project_id}/avatars/{id}/group     assign group (PUT, PRD-112)
/// /projects/{project_id}/groups                    list, create (PRD-112)
/// /projects/{project_id}/groups/{id}               update, delete (PRD-112)
/// /projects/{project_id}/avatars/metadata             all metadata (PRD-66)
/// /projects/{project_id}/avatars/metadata/completeness project completeness (PRD-66)
/// /projects/{project_id}/avatars/metadata/csv         export/import CSV (PRD-66)
/// /projects/{project_id}/scene-comparison            scene comparison gallery (GET, PRD-68)
/// /projects/{project_id}/avatars/{id}/all-scenes avatar all-scenes view (GET, PRD-68)
/// /projects/{project_id}/scene-types               list, create
/// /projects/{project_id}/scene-types/{id}          get, update, delete
/// /projects/{project_id}/qa-thresholds             list, upsert (GET, POST, PRD-49)
/// /projects/{project_id}/qa-thresholds/{id}        delete (DELETE, PRD-49)
///
/// /projects/{id}/poster-gallery                    project poster gallery (GET, PRD-96)
/// /projects/{id}/auto-select-posters               auto-select poster frames (POST, PRD-96)
///
/// /projects/{project_id}/consistency-overview       consistency overview (GET, PRD-94)
/// /projects/{project_id}/batch-consistency          batch generate reports (POST, PRD-94)
///
/// /projects/{id}/validation-summary                validation summary (GET, PRD-113)
/// /projects/{id}/validate                          revalidate project (POST, PRD-113)
/// /projects/{project_id}/ingest                    list sessions (GET, PRD-113)
/// /projects/{project_id}/ingest/text               ingest from text (POST, PRD-113)
/// /projects/{project_id}/ingest/{id}               get, cancel session (GET, DELETE, PRD-113)
/// /projects/{project_id}/ingest/{id}/entries       list entries (GET, PRD-113)
/// /projects/{project_id}/ingest/{id}/entries/{eid} update entry (PUT, PRD-113)
/// /projects/{project_id}/ingest/{id}/validate      validate session (POST, PRD-113)
/// /projects/{project_id}/ingest/{id}/generate-metadata  generate metadata (POST, PRD-113)
/// /projects/{project_id}/ingest/{id}/confirm       confirm import (POST, PRD-113)
///
/// /avatars/{avatar_id}/source-images         list, create
/// /avatars/{avatar_id}/source-images/{id}    get, update, delete
/// /avatars/{avatar_id}/derived-images        list, create
/// /avatars/{avatar_id}/derived-images/{id}   get, update, delete
/// /avatars/{avatar_id}/image-variants        list, create
/// /avatars/{avatar_id}/image-variants/{id}   get, update, delete
/// /avatars/{avatar_id}/metadata               get, update (PRD-66)
/// /avatars/{avatar_id}/metadata/completeness  completeness status (PRD-66)
/// /avatars/{avatar_id}/scenes                list, create
/// /avatars/{avatar_id}/scenes/{id}           get, update, delete
///
/// /avatars/{avatar_id}/readiness              get readiness (GET, PRD-107)
/// /avatars/{avatar_id}/readiness/invalidate   invalidate cache (POST, PRD-107)
/// /avatars/readiness/batch-evaluate              batch evaluate (POST, PRD-107)
///
/// /avatars/{avatar_id}/dashboard              avatar dashboard (GET, PRD-108)
/// /avatars/{avatar_id}/settings               patch settings (PATCH, PRD-108)
///
/// /avatars/{avatar_id}/consistency-report     generate, get latest (POST, GET, PRD-94)
///
/// /avatars/{id}/poster-frame                    get, set poster frame (GET, POST, PRD-96)
///
/// /avatars/{avatar_id}/extract-embedding     trigger extraction (POST, PRD-76)
/// /avatars/{avatar_id}/embedding-status      get status (GET, PRD-76)
/// /avatars/{avatar_id}/detected-faces        list faces (GET, PRD-76)
/// /avatars/{avatar_id}/select-face           select face (POST, PRD-76)
/// /avatars/{avatar_id}/embedding-history     history (GET, PRD-76)
///
/// /scenes/{scene_id}/segments                      list, create
/// /scenes/{scene_id}/segments/{id}                 get, update, delete
/// /scenes/{scene_id}/review-queue                  review queue (GET, PRD-35)
/// /scenes/{id}/generate                            start generation (POST, PRD-24)
/// /scenes/{id}/progress                            generation progress (GET, PRD-24)
/// /scenes/batch-generate                           batch generate (POST, PRD-24)
/// /scenes/{scene_id}/qa-summary                    scene QA summary (GET, PRD-49)
/// /scenes/{id}/poster-frame                         get, set poster frame (GET, POST, PRD-96)
///
/// /segments/{segment_id}/approve                   approve segment (POST, PRD-35)
/// /segments/{segment_id}/reject                    reject segment (POST, PRD-35)
/// /segments/{segment_id}/flag                      flag segment (POST, PRD-35)
/// /segments/{segment_id}/approvals                 list approvals (GET, PRD-35)
/// /segments/{id}/annotations                       list, create (GET, POST, PRD-70)
/// /segments/{id}/annotations/summary               annotation summary (GET, PRD-70)
/// /segments/{id}/annotations/export/{frame}        export frame annotations (GET, PRD-70)
/// /segments/{id}/annotations/{ann_id}              get, update, delete (GET, PUT, DELETE, PRD-70)
///
/// /segments/{id}/notes                             list, create (GET, POST, PRD-38)
/// /segments/{id}/notes/{note_id}                   update, delete (PUT, DELETE, PRD-38)
/// /segments/{id}/notes/{note_id}/resolve           resolve note (PUT, PRD-38)
/// /segments/{id}/notes/{note_id}/tags              assign tags (POST, PRD-38)
/// /segments/{id}/notes/{note_id}/tags/{tag_id}     remove tag (DELETE, PRD-38)
/// /segments/{id}/select-boundary-frame             select boundary (POST, PRD-24)
/// /segments/{segment_id}/qa-scores                 per-segment QA scores (GET, PRD-49)
/// /segments/{id}/regenerate                     regenerate segment (POST, PRD-25)
/// /segments/{id}/boundary-check                 boundary SSIM check (GET, PRD-25)
/// /segments/{id}/smooth-boundary                apply smoothing (POST, PRD-25)
/// /segments/{id}/versions                       version history (GET, PRD-25)
/// /segments/{id}/clear-stale                    clear stale flag (PATCH, PRD-25)
/// /segments/{id}/version-history                version history (GET, PRD-101)
/// /segments/{id}/compare?v1={n}&v2={n}          compare versions (GET, PRD-101)
/// /segments/{id}/versions/{version_id}/select   select active version (POST, PRD-101)
/// /segments/{id}/versions/{version_id}          get single version (GET, PRD-101)
/// /segments/{id}/retry-attempts                 list, create (GET, POST, PRD-71)
/// /segments/{id}/retry-attempts/{aid}           get, update (GET, PUT, PRD-71)
/// /segments/{id}/retry-attempts/{aid}/select    select best-of-N (POST, PRD-71)
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
/// /scene-types/{id}/preview-prompt/{avatar_id}  preview prompt (GET, PRD-23)
/// /scene-types/matrix                              generate matrix (POST, PRD-23)
/// /scene-types/validate                            validate config (POST, PRD-23)
/// /scene-types/{id}/children                       create child (POST), list children (GET, PRD-100)
/// /scene-types/{id}/effective-config               resolved config (GET, PRD-100)
/// /scene-types/{id}/cascade-preview/{field}        cascade preview (GET, PRD-100)
/// /scene-types/{id}/overrides                      list (GET), upsert (PUT, PRD-100)
/// /scene-types/{id}/overrides/{field}              delete override (DELETE, PRD-100)
/// /scene-types/{id}/mixins                         list (GET), apply (POST, PRD-100)
/// /scene-types/{id}/mixins/{mixin_id}              remove mixin (DELETE, PRD-100)
/// /scene-types/{id}/retry-policy                   get, update (GET, PUT, PRD-71)
///
/// /mixins                                          list (GET), create (POST, PRD-100)
/// /mixins/{id}                                     get (GET), update (PUT), delete (DELETE, PRD-100)
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
/// /qa/avatars/{avatar_id}/source-qa-results  get source QA results
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
/// /extension-api/avatars/{id}                        ext proxy: get avatar (GET)
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
/// /library/avatars                                          list, create (GET, POST, PRD-60)
/// /library/avatars/{id}                                     get, update, delete (PRD-60)
/// /library/avatars/{id}/usage                               cross-project usage (GET, PRD-60)
/// /library/avatars/{id}/import                              import to project (POST, PRD-60)
/// /library/avatars/projects/{project_id}/links              list links (GET, PRD-60)
/// /library/avatars/links/{link_id}                          update, delete link (PUT, DELETE, PRD-60)
/// /library/avatars/readiness-summary                        readiness summary (GET, PRD-107)
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
/// /avatars/duplicates/check                                   check single (POST, PRD-79)
/// /avatars/duplicates/batch                                   batch check (POST, PRD-79)
/// /avatars/duplicates/history                                 check history (GET, PRD-79)
/// /avatars/duplicates/{id}/resolve                            resolve match (POST, PRD-79)
/// /avatars/duplicates/{id}/dismiss                            dismiss match (POST, PRD-79)
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
///
/// /production-runs                                              list, create (GET, POST, PRD-57)
/// /production-runs/{id}                                         get, delete (GET, DELETE, PRD-57)
/// /production-runs/{id}/matrix                                  matrix cells (GET, PRD-57)
/// /production-runs/{id}/submit                                  submit cells (POST, PRD-57)
/// /production-runs/{id}/resubmit-failed                         resubmit failed (POST, PRD-57)
/// /production-runs/{id}/deliver                                 deliver run (POST, PRD-57)
/// /production-runs/{id}/progress                                progress stats (GET, PRD-57)
///
/// /test-shots                                                  generate, list gallery (POST, GET, PRD-58)
/// /test-shots/batch                                            batch generate (POST, PRD-58)
/// /test-shots/{id}                                             get, delete (GET, DELETE, PRD-58)
/// /test-shots/{id}/promote                                     promote to scene (POST, PRD-58)
///
/// /resolution-tiers                                            list, create (GET, POST, PRD-59)
/// /resolution-tiers/{id}                                       get tier (GET, PRD-59)
/// /scenes/{id}/upscale                                         upscale scene (POST, PRD-59)
/// /scenes/{id}/tier                                            get scene tier (GET, PRD-59)
///
/// /estimates                                                   compute batch estimate (POST, PRD-61)
/// /estimates/history                                           calibration data (GET, PRD-61)
/// /estimates/record                                            record metric (POST, PRD-61)
///
/// /scenes/{scene_id}/storyboard                                scene storyboard (GET, PRD-62)
///
/// /keyframes                                                   create keyframe (POST, PRD-62)
/// /keyframes/segment/{segment_id}                              list, delete segment keyframes (GET, DELETE, PRD-62)
///
/// /provenance/receipts                                         create receipt (POST, PRD-69)
/// /provenance/receipts/{id}/complete                           complete receipt (PATCH, PRD-69)
/// /provenance/staleness                                        staleness report (GET, PRD-69)
/// /segments/{segment_id}/provenance                            segment provenance (GET, PRD-69)
/// /assets/{asset_id}/usage                                     asset usage (GET, PRD-69)
///
/// /scenes/{scene_id}/temporal-metrics                          scene temporal metrics (GET, PRD-26)
/// /segments/{id}/temporal-metric                               segment temporal metric (GET, PRD-26)
/// /segments/{id}/analyze-drift                                 analyze drift (POST, PRD-26)
/// /segments/{id}/analyze-grain                                 analyze grain (POST, PRD-26)
/// /segments/{id}/normalize-grain                               normalize grain (POST, PRD-26)
/// /projects/{project_id}/temporal-settings                     get, update settings (GET, PUT, PRD-26)
///
/// /segments/{id}/trim                                        create, get, revert trim (POST, GET, DELETE, PRD-78)
/// /segments/{id}/trim/seed-impact                            seed frame impact (GET, PRD-78)
/// /trims/batch                                               batch trim (POST, PRD-78)
/// /trims/preset                                              apply preset (POST, PRD-78)
///
/// /scene-types/{id}/prompt-versions                          list, save (GET, POST, PRD-63)
/// /prompt-versions/{id_a}/diff/{id_b}                        diff versions (GET, PRD-63)
/// /prompt-versions/{id}/restore                              restore version (POST, PRD-63)
/// /prompt-library                                            list, create (GET, POST, PRD-63)
/// /prompt-library/{id}                                       get, update, delete (GET, PUT, DELETE, PRD-63)
/// /prompt-library/{id}/rate                                  rate entry (POST, PRD-63)
///
/// /hooks                                                     list, create (GET, POST, PRD-77)
/// /hooks/{id}                                                get, update, delete (GET, PUT, DELETE, PRD-77)
/// /hooks/{id}/toggle                                         toggle enabled (PATCH, PRD-77)
/// /hooks/{id}/test                                           test hook (POST, PRD-77)
/// /hooks/{id}/logs                                           execution logs (GET, PRD-77)
/// /hooks/effective/{scope_type}/{scope_id}                    effective hooks (GET, PRD-77)
/// /jobs/{id}/hook-logs                                        job hook logs (GET, PRD-77)
///
/// /project-configs                                            list, create (GET, POST, PRD-74)
/// /project-configs/recommended                                recommended configs (GET, PRD-74)
/// /project-configs/{id}                                       get, update, delete (GET, PUT, DELETE, PRD-74)
/// /project-configs/import                                     import config (POST, PRD-74)
/// /project-configs/{id}/diff/{project_id}                     diff config (POST, PRD-74)
/// /projects/{id}/export-config                                export project config (POST, PRD-74)
///
/// /analytics/failure-patterns                                  list patterns (GET, PRD-64)
/// /analytics/failure-patterns/{id}                             get pattern (GET, PRD-64)
/// /analytics/failure-heatmap                                   heatmap data (GET, PRD-64)
/// /analytics/failure-trends                                    trend data (GET, PRD-64)
/// /analytics/failure-alerts                                    alert check (GET, PRD-64)
/// /failure-patterns/{id}/fixes                                 create, list fixes (POST, GET, PRD-64)
/// /failure-patterns/fixes/{id}/effectiveness                   update effectiveness (PATCH, PRD-64)
///
/// /scenes/{scene_id}/branches                                  list branches (GET, PRD-50)
/// /scenes/{scene_id}/branch                                    create branch (POST, PRD-50)
/// /branches/stale                                              stale branches (GET, PRD-50)
/// /branches/{id}                                               get, update, delete (GET, PUT, DELETE, PRD-50)
/// /branches/{id}/promote                                       promote to default (POST, PRD-50)
/// /branches/{id}/compare/{other_id}                            compare branches (GET, PRD-50)
///
/// /notes                                                        list, create (GET, POST, PRD-95)
/// /notes/search                                                 search notes (GET, PRD-95)
/// /notes/pinned                                                 list pinned (GET, PRD-95)
/// /notes/{id}                                                   get, update, delete (GET, PUT, DELETE, PRD-95)
/// /notes/{id}/pin                                               toggle pin (PATCH, PRD-95)
/// /notes/{id}/resolve                                           resolve note (PATCH, PRD-95)
/// /notes/{id}/unresolve                                         unresolve note (PATCH, PRD-95)
/// /notes/{id}/thread                                            list thread (GET, PRD-95)
///
/// /note-categories                                              list, create (GET, POST, PRD-95)
/// /note-categories/{id}                                         update, delete (PUT, DELETE, PRD-95)
///
/// /onboarding-sessions                                          list, create (GET, POST, PRD-67)
/// /onboarding-sessions/{id}                                     get session (GET, PRD-67)
/// /onboarding-sessions/{id}/advance                             advance step (POST, PRD-67)
/// /onboarding-sessions/{id}/go-back                             go back (POST, PRD-67)
/// /onboarding-sessions/{id}/step-data                           update step data (PUT, PRD-67)
/// /onboarding-sessions/{id}/abandon                             abandon session (POST, PRD-67)
/// /onboarding-sessions/{id}/complete                            complete session (POST, PRD-67)
///
/// /admin/import/legacy/runs                                     list, create (GET, POST, PRD-86)
/// /admin/import/legacy/runs/{id}                                get run (GET, PRD-86)
/// /admin/import/legacy/runs/{id}/scan                           scan folder (POST, PRD-86)
/// /admin/import/legacy/runs/{id}/preview                        preview import (POST, PRD-86)
/// /admin/import/legacy/runs/{id}/commit                         commit import (POST, PRD-86)
/// /admin/import/legacy/runs/{id}/report                         run report (GET, PRD-86)
/// /admin/import/legacy/runs/{id}/gap-report                     gap analysis (GET, PRD-86)
/// /admin/import/legacy/runs/{id}/csv                            CSV import (POST, PRD-86)
/// /admin/import/legacy/runs/{id}/entities                       entity logs (GET, PRD-86)
///
/// /readiness-criteria                                           list, create (GET, POST, PRD-107)
/// /readiness-criteria/{id}                                      update, delete (PUT, DELETE, PRD-107)
///
/// /admin/batch-metadata                                          list, create preview (GET, POST, PRD-88)
/// /admin/batch-metadata/{id}                                     get operation (GET, PRD-88)
/// /admin/batch-metadata/{id}/execute                             execute operation (POST, PRD-88)
/// /admin/batch-metadata/{id}/undo                                undo operation (POST, PRD-88)
///
/// /admin/maintenance/find-replace/preview                       preview find/replace (POST, PRD-18)
/// /admin/maintenance/find-replace/{id}/execute                  execute find/replace (POST, PRD-18)
/// /admin/maintenance/repath/preview                             preview re-path (POST, PRD-18)
/// /admin/maintenance/repath/{id}/execute                        execute re-path (POST, PRD-18)
/// /admin/maintenance/{id}/undo                                  undo operation (POST, PRD-18)
/// /admin/maintenance/history                                    list operations (GET, PRD-18)
/// /admin/maintenance/{id}                                       get operation (GET, PRD-18)
///
/// /metadata-templates                                            list, create (GET, POST, PRD-113)
/// /metadata-templates/{id}                                       get, update, delete (PRD-113)
/// /metadata-templates/{id}/fields                                list, create (GET, POST, PRD-113)
/// /metadata-templates/{id}/fields/{field_id}                     delete (DELETE, PRD-113)
///
/// /video-specs                                                   list, create (GET, POST, PRD-113)
/// /video-specs/{id}                                              get, update, delete (PRD-113)
///
/// /workflows/{id}/prompt-slots                                   list prompt slots (GET, PRD-115)
/// /workflows/{id}/prompt-slots/{slot_id}                         update prompt slot (PUT, PRD-115)
/// /scene-types/{id}/prompt-defaults                              list prompt defaults (GET, PRD-115)
/// /scene-types/{id}/prompt-defaults/{slot_id}                    upsert prompt default (PUT, PRD-115)
/// /avatars/{id}/scenes/{scene_type_id}/prompt-overrides       get, upsert overrides (GET, PUT, PRD-115)
/// /projects/{id}/scenes/{scene_type_id}/prompt-overrides         get, upsert project overrides (GET, PUT, PRD-115)
/// /projects/{pid}/groups/{gid}/scenes/{stid}/prompt-overrides    get, upsert group overrides (GET, PUT, PRD-115)
/// /prompts/resolve                                               resolve prompt preview (POST, PRD-115)
/// /prompt-fragments                                              list, create (GET, POST, PRD-115)
/// /prompt-fragments/{id}                                         update, delete (PUT, DELETE, PRD-115)
/// /prompt-fragments/{id}/pin/{scene_type_id}                     pin, unpin (POST, DELETE, PRD-115)
///
/// /reports                                                        list reports (GET, PRD-73)
/// /reports/generate                                               generate report (POST, PRD-73)
/// /reports/templates                                              list report types (GET, PRD-73)
/// /reports/{id}                                                   get report (GET, PRD-73)
/// /reports/{id}/download                                          download report (GET, PRD-73)
///
/// /report-schedules                                               list, create (GET, POST, PRD-73)
/// /report-schedules/{id}                                          update, delete (PUT, DELETE, PRD-73)
///
/// /consistency-reports/{id}                                        get report (GET, PRD-94)
///
/// /compliance-rules                                                list, create (GET, POST, PRD-102)
/// /compliance-rules/{id}                                           get, update, delete (GET, PUT, DELETE, PRD-102)
/// /scenes/{scene_id}/compliance-check                              run compliance check (POST, PRD-102)
/// /scenes/{scene_id}/compliance-checks                             list checks (GET, PRD-102)
/// /scenes/{scene_id}/compliance-summary                            check summary (GET, PRD-102)
/// ```
pub fn api_routes() -> Router<AppState> {
    Router::new()
        // WebSocket endpoints.
        .route("/ws", get(ws::ws_handler))
        .route("/ws/metrics", get(handlers::hardware::metrics_ws_handler))
        .route("/ws/activity-logs", get(handlers::activity_log::ws_activity_logs))
        // Authentication routes (login, refresh, logout).
        .nest("/auth", auth::router())
        // Admin routes (user management + hardware monitoring + themes).
        .nest("/admin", admin::router())
        .nest("/admin/hardware", hardware::router())
        .nest("/admin/cloud-providers", cloud_providers::router())
        .nest("/admin/scripts", scripts::router())
        .nest("/admin/themes", themes::admin_router())
        // Studio-wide sensitivity defaults (PRD-82).
        .nest("/admin/sensitivity-defaults", sensitivity::admin_router())
        // Storage visualizer: treemap, breakdown, summary (PRD-19).
        .nest("/admin/storage", storage_visualizer::router())
        // Disk reclamation: protection rules, policies, trash queue (PRD-15).
        .nest("/admin/reclamation", reclamation::router())
        // Audit logging & compliance (PRD-45).
        .nest("/admin/audit-logs", audit::router())
        // External API & Webhooks admin management (PRD-12).
        .nest("/admin/api-keys", external_api::api_keys_router())
        .nest("/admin/webhooks", external_api::webhooks_router())
        // User-facing theme preference.
        .nest("/user/theme", themes::user_router())
        // User-facing sensitivity preference (PRD-82).
        .nest("/user/sensitivity", sensitivity::user_router())
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
        // Studio Pulse Dashboard: widget data endpoints (PRD-42) + widget catalogue (PRD-89).
        .nest("/dashboard", dashboard::router()
            .merge(dashboard_customization::dashboard_catalog_router()))
        // User-facing dashboard configuration (PRD-42) + presets & customization (PRD-89).
        .nest("/user/dashboard", dashboard::user_router()
            .merge(dashboard_customization::user_dashboard_router()))
        // Admin dashboard role defaults (PRD-89).
        .nest("/admin/dashboard", dashboard_customization::admin_dashboard_router())
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
        // Project routes (also nests avatars and project-scoped scene types).
        .nest("/projects", project::router()
            .merge(metadata::project_metadata_router())
            .merge(delivery::export_router())
            .merge(delivery_destination::router())
            .merge(quality_gates::threshold_router())
            .merge(temporal::project_temporal_router())
            .merge(project_config::project_export_router())
            .merge(validation_dashboard::router())
            .merge(comparison::router())
            .merge(poster_frame::project_poster_router())
            .merge(consistency_report::project_consistency_router())
            .merge(sidecar::dataset_export_project_router())
            .merge(project_lifecycle::project_lifecycle_router())
            .merge(project_lifecycle::bulk_lifecycle_router())
            .merge(prompt_management::project_prompt_override_router())
            .merge(video_settings::project_video_settings_router())
            .nest("/{project_id}/avatars", avatar_metadata::project_router())
            .nest("/{project_id}/ingest", avatar_ingest::router())
            .nest("/{project_id}/scene-settings", project_scene_settings::router())
            .nest("/{project_id}/speech-config", project_speech_config::router())
            .nest("/{project_id}/review", avatar_review::project_review_router())
            .merge(project_speech_import::router()))
        // Avatar-scoped sub-resources (images, scenes, metadata editor, face embedding, readiness, dashboard PRD-108, prompt overrides PRD-115).
        .nest("/avatars", avatar::router()
            .merge(metadata::avatar_metadata_router())
            .merge(avatar_metadata::avatar_router())
            .merge(avatar_metadata_version::router())
            .merge(embedding::embedding_router())
            .merge(readiness::readiness_router())
            .merge(avatar_dashboard::dashboard_router())
            .merge(prompt_management::avatar_prompt_override_router())
            .merge(poster_frame::avatar_poster_router())
            .merge(consistency_report::avatar_consistency_router())
            .merge(contact_sheet::avatar_contact_sheet_router())
            .merge(refinement::avatar_refinement_router())
            .merge(avatar_review::avatar_review_router())
            .merge(video_settings::avatar_video_settings_router())
            .nest("/{avatar_id}/scene-settings", avatar_scene_overrides::router())
            .nest("/{avatar_id}/deliverable-ignores", avatar_deliverable_ignore::router())
            .nest("/{avatar_id}/speeches", avatar_speech::router()))
        // Scene-scoped sub-resources (segments, review queue, generation PRD-24, QA PRD-49, resolution PRD-59, storyboard PRD-62, branching PRD-50).
        .nest("/scenes", scene::router()
            .merge(metadata::scene_metadata_router())
            .merge(approval::scene_review_router())
            .merge(generation::generation_scene_router())
            .merge(quality_gates::scene_qa_router())
            .merge(temporal::scene_temporal_router())
            .merge(resolution::scene_resolution_router())
            .merge(storyboard::scene_storyboard_router())
            .merge(branching::scene_branch_router())
            .merge(poster_frame::scene_poster_router())
            .merge(compliance::compliance_check_router()))
        // Segment-scoped approval actions (approve, reject, flag) (PRD-35).
        // Segment-scoped review notes and tags (PRD-38).
        // Segment-scoped boundary frame selection (PRD-24).
        // Segment-scoped QA scores (PRD-49).
        // Segment-scoped re-stitching: regenerate, boundary-check, smooth, versions, clear-stale (PRD-25).
        // Segment-scoped version comparison: history, compare, select, get (PRD-101).
        .nest("/segments", approval::segment_router()
            .merge(review_notes::segment_notes_router())
            .merge(annotation::segment_annotation_router())
            .merge(generation::generation_segment_router())
            .merge(quality_gates::segment_qa_router())
            .merge(restitching::segment_restitching_router())
            .merge(segment_comparison::segment_comparison_router())
            .merge(temporal::segment_temporal_router())
            .merge(provenance::segment_provenance_router())
            .merge(trimming::segment_trim_router())
            .merge(auto_retry::retry_attempt_router()))
        // Rejection categories for structured rejection tracking (PRD-35).
        .nest("/rejection-categories", approval::rejection_categories_router())
        // Review tags for collaborative review (PRD-38).
        .nest("/review-tags", review_notes::review_tags_router())
        // Studio-level scene types + prompt versioning (PRD-63) + inheritance (PRD-100) + prompt defaults (PRD-115) + retry policy (PRD-71) + QA rulesets (PRD-91).
        .nest("/scene-types", scene_type::studio_router()
            .merge(prompt_editor::scene_type_prompt_router())
            .merge(scene_type_inheritance::inheritance_router())
            .merge(prompt_management::scene_type_prompt_default_router())
            .merge(auto_retry::retry_policy_router())
            .merge(qa_rulesets::qa_override_router())
            .merge(video_settings::scene_type_video_settings_router()))
        // Mixin CRUD (PRD-100).
        .nest("/mixins", scene_type_inheritance::mixin_router())
        // Tracks (PRD-111).
        .nest("/tracks", track::router())
        // Pipelines (PRD-138).
        .nest("/pipelines", pipelines::router())
        // Speech types (PRD-124).
        .nest("/speech-types", speech_type::router())
        // Languages (PRD-136).
        .nest("/languages", language::router())
        // Trash / bin management.
        .nest("/trash", trash::router())
        // Clip browsing (cross-project scene video version overview).
        .route("/scene-video-versions/browse", axum::routing::get(crate::handlers::scene_video_version::browse_clips))
        // Annotation browsing (cross-project annotation overview).
        .nest("/annotations", annotation::annotation_browse_router())
        // Notifications, preferences, and settings.
        .nest("/notifications", notification::router())
        // Image quality assurance (check types, QA runs, thresholds).
        .nest("/qa", image_qa::router())
        // Automated Quality Gates: studio-level defaults (PRD-49).
        .nest("/qa/quality-gates", quality_gates::studio_qa_router())
        // QA Profiles: named threshold bundles (PRD-91).
        .nest("/qa-profiles", qa_rulesets::qa_profile_router())
        // Validation engine (rule types, rules, dry-run validation).
        .nest("/validation", validation::validation_router())
        // Import reports and commit.
        .nest("/imports", validation::imports_router())
        // Folder-to-entity bulk importer (PRD-016).
        .nest("/import", importer::router())
        // Video streaming, metadata, and thumbnails.
        .nest("/videos", video::router())
        // Image variant utilities.
        .route("/image-variants/browse", axum::routing::get(crate::handlers::image_variant::browse_variants))
        .route("/image-variants/check-hashes", axum::routing::post(crate::handlers::image_variant::check_hashes))
        .route("/image-variants/backfill-metadata", axum::routing::post(crate::handlers::image_variant::backfill_image_metadata))
        .route("/image-variants/backfill-hashes", axum::routing::post(crate::handlers::image_variant::backfill_hashes))
        .route("/image-variants/backfill-video-hashes", axum::routing::post(crate::handlers::image_variant::backfill_video_hashes))
        .route("/image-variants/backfill-thumbnails", axum::routing::post(crate::handlers::image_variant::backfill_thumbnails))
        .route("/image-variants/{id}/thumbnail", axum::routing::get(crate::handlers::image_variant::thumbnail))
        // Background job execution engine (PRD-07, PRD-08, PRD-28, PRD-34, PRD-77).
        .nest("/jobs", jobs::router()
            .merge(checkpoints::checkpoint_routes())
            .merge(job_debug::debug_routes())
            .merge(pipeline_hooks::job_hooks_router()))
        // Queue management & scheduling (PRD-08).
        .nest("/queue", queue::router())
        .nest("/quota", queue::quota_router())
        .nest("/admin/queue", queue::admin_router())
        .nest("/admin/scheduling", queue::scheduling_admin_router())
        .route(
            "/admin/users/{id}/quota",
            axum::routing::put(crate::handlers::queue::set_user_quota),
        )
        // Render queue timeline / Gantt view (PRD-90).
        // Reorder uses existing PUT /admin/queue/reorder from queue.rs (PRD-08).
        .nest("/queue/timeline", render_timeline::router())
        // Search & discovery engine (PRD-20).
        .nest("/search", search::router())
        // Command palette search (PRD-31).
        .nest("/search/palette", palette::search_router())
        // Tag system: tag CRUD, suggestions, bulk ops (PRD-47).
        .nest("/tags", tags::router())
        // Entity-scoped tag associations (PRD-47).
        .nest("/entities", tags::entity_tags_router())
        // Asset registry: CRUD, dependencies, notes, ratings (PRD-17).
        // Asset provenance: reverse usage tracking (PRD-69).
        .nest("/assets", assets::router()
            .merge(provenance::asset_provenance_router()))
        // Extension admin management (PRD-85).
        .nest("/admin/extensions", extensions::admin_router())
        // Extension registry for authenticated clients (PRD-85).
        .nest("/extensions", extensions::registry_router())
        // Sandboxed extension API bridge (PRD-85).
        .nest("/extension-api", extensions::ext_api_router())
        // Workflow canvas (PRD-33) + Workflow Import & Validation (PRD-75) + Prompt Slots (PRD-115).
        .nest("/workflows", workflow_canvas::router()
            .merge(workflow_import::workflow_import_router())
            .merge(prompt_management::workflow_prompt_slot_router()))
        // Bug reporting (PRD-44).
        .nest("/bug-reports", bug_reports::router())
        // Configuration export/import (PRD-44).
        .nest("/admin/config", config_management::router())
        // Worker pool management: admin endpoints (PRD-46).
        .nest("/admin/workers", workers::admin_router())
        // Worker pool management: agent self-registration (PRD-46).
        .nest("/workers", workers::agent_router())
        // GPU power management & idle scheduling (PRD-87).
        .nest("/admin/power", gpu_power::router())
        // External & tiered storage management (PRD-48).
        .nest("/admin/storage", storage::router())
        // Avatar library: cross-project avatar sharing (PRD-60) + readiness summary (PRD-107).
        .nest("/library/avatars", library::router()
            .merge(readiness::readiness_library_router()))
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
        // Avatar duplicate detection (PRD-79).
        .nest("/avatars/duplicates", duplicates::router())
        .nest("/admin/duplicate-settings", duplicates::settings_router())
        // Model & LoRA download manager (PRD-104).
        .nest("/downloads", downloads::download_router())
        .nest("/admin/placement-rules", downloads::placement_router())
        .nest("/user/api-tokens", downloads::token_router())
        // Batch Production Orchestrator (PRD-57).
        .nest("/production-runs", production_run::router())
        // Scene Preview & Quick Test (PRD-58).
        .nest("/test-shots", test_shot::test_shot_router())
        // Workflow regression testing (PRD-65).
        .nest("/regression", regression::regression_router())
        // Multi-Resolution Pipeline (PRD-59).
        .nest("/resolution-tiers", resolution::resolution_router())
        // Storyboard View & Scene Thumbnails (PRD-62).
        .nest("/keyframes", storyboard::storyboard_router())
        // Cost & Resource Estimation (PRD-61).
        .nest("/estimates", estimation::estimation_router())
        // Generation Provenance & Asset Versioning (PRD-69).
        .nest("/provenance", provenance::provenance_router())
        // Segment Trimming & Frame-Level Editing: batch operations (PRD-78).
        .nest("/trims", trimming::batch_trim_router())
        // Prompt Editor & Versioning (PRD-63).
        .nest("/prompt-versions", prompt_editor::prompt_version_router())
        .nest("/prompt-library", prompt_editor::prompt_library_router())
        // Prompt Resolution Preview (PRD-115).
        .nest("/prompts", prompt_management::prompt_resolve_router())
        // Prompt Fragment Library (PRD-115).
        .nest("/prompt-fragments", prompt_management::prompt_fragment_router())
        // Pipeline Stage Hooks (PRD-77).
        .nest("/hooks", pipeline_hooks::hooks_router())
        // Project Configuration Templates (PRD-74).
        .nest("/project-configs", project_config::project_config_router()
            .merge(project_config::project_config_diff_router()))
        // Failure Pattern Tracking & Insights (PRD-64).
        .nest("/analytics", failure_analytics::analytics_router())
        .nest("/failure-patterns", failure_analytics::pattern_fixes_router())
        // Content Branching & Exploration (PRD-50).
        .nest("/branches", branching::branch_router())
        // Production Notes & Internal Comments (PRD-95).
        .nest("/notes", production_notes::notes_router())
        .nest("/note-categories", production_notes::note_categories_router())
        // Production Reporting & Data Export (PRD-73).
        .nest("/reports", production_report::report_router())
        .nest("/report-schedules", production_report::report_schedule_router())
        // Avatar Consistency Reports (PRD-94).
        .nest("/consistency-reports", consistency_report::consistency_report_router())
        // Contact Sheet Image delete (PRD-103).
        .nest("/contact-sheet-images", contact_sheet::contact_sheet_image_router())
        // Bulk Avatar Onboarding Wizard (PRD-67).
        .nest("/onboarding-sessions", onboarding_wizard::router())
        // Legacy Data Import & Migration Toolkit (PRD-86).
        .nest("/admin/import/legacy", legacy_import::legacy_import_router())
        // Bulk Data Maintenance: find/replace, re-path, undo (PRD-18).
        .nest("/admin/maintenance", maintenance::maintenance_router())
        // Batch Metadata Operations (PRD-88).
        .nest("/admin/batch-metadata", batch_metadata::batch_metadata_router())
        // Avatar Readiness & State View: criteria configuration (PRD-107).
        .nest("/readiness-criteria", readiness::readiness_criteria_router())
        // System status footer (PRD-117).
        .nest("/status", status::router())
        // Generation infrastructure: RunPod pods, ComfyUI instances.
        .nest("/admin/infrastructure", infrastructure::router())
        // Job management admin: reassign, drain, instances (PRD-132).
        .nest("/admin", jobs::admin_router())
        // System Health Page: service health, uptime, alerts (PRD-80).
        .nest("/admin/health", system_health::router())
        // API Observability Dashboard: metrics, alerts, rate limits (PRD-106).
        .nest("/admin/api-metrics", api_observability::metrics_router())
        .nest("/admin/api-alerts", api_observability::alerts_router())
        // Platform settings (PRD-110).
        .nest("/admin/settings", platform_settings::router())
        // Dynamic naming engine (PRD-116).
        .nest("/admin/naming", naming::router())
        // Global generation logs (all scenes) for the activity console.
        .route("/generation-logs", get(handlers::generation::list_all_generation_logs))
        // Activity logs: query and export (PRD-118).
        .nest("/activity-logs", activity_log::router())
        // Activity logs: admin settings and purge (PRD-118).
        .nest("/admin/activity-logs", activity_log::admin_router())
        // Metadata templates: template CRUD and field management (PRD-113).
        .nest("/metadata-templates", metadata_template::router())
        // Video spec requirements: CRUD (PRD-113).
        .nest("/video-specs", video_spec::router())
        // Video Compliance Checker: rule management (PRD-102).
        .nest("/compliance-rules", compliance::compliance_rule_router())
        // VFX Sidecar Templates & Dataset Export (PRD-40).
        .nest("/sidecar-templates", sidecar::sidecar_template_router())
        .nest("/datasets", sidecar::dataset_export_router())
        // Shareable Preview Links: authenticated management (PRD-84).
        .nest("/shared-links", shared_link::authenticated_router())
        // Batch Review & Approval Workflows (PRD-92).
        .nest("/batch-review", batch_review::batch_review_router())
        // Avatar Review Allocation: reviewer queue and decision endpoints (PRD-129).
        .nest("/review/avatar-assignments", avatar_review::reviewer_router())
        // Shareable Preview Links: public external review (PRD-84, no auth).
        .nest("/review", shared_link::public_router())
        // Time-based job scheduling (PRD-119).
        .nest("/schedules", job_scheduling::router())
        // Trigger workflows: admin endpoints (PRD-97).
        .nest("/admin/triggers", trigger_workflow::admin_router())
        // Session management: admin endpoints (PRD-98).
        .nest("/admin/sessions", session_management::admin_router())
        // Session management: user endpoints (PRD-98).
        .nest("/sessions", session_management::user_router())
        // Generation Budget & Quota Management (PRD-93).
        .nest("/admin/budgets", budget_quota::admin_budget_router())
        .nest("/admin/quotas", budget_quota::admin_quota_router())
        .nest("/admin/budget-exemptions", budget_quota::admin_exemption_router())
        .nest("/budgets", budget_quota::user_router())
        // Webhook Integration Testing Console (PRD-99).
        .nest("/admin/webhook-testing", webhook_testing::admin_router())
        .nest("/mock", webhook_testing::mock_router())
        // Backup & Disaster Recovery (PRD-81).
        .nest("/admin/backups", backup_recovery::backup_router())
        .nest("/admin/backup-schedules", backup_recovery::backup_schedule_router())
        // Director's View: mobile/tablet review (PRD-55).
        .nest("/user", directors_view::directors_view_router())
        // Platform Setup Wizard (PRD-105).
        .nest("/admin/setup", setup_wizard::setup_wizard_router())
        // LLM Refinement Pipeline: top-level job lookup by UUID (PRD-125).
        .nest("/refinement-jobs", refinement::refinement_job_router())
}

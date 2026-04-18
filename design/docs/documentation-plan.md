# App Documentation Plan

Target: a LaTeX → PDF guide (in the style of `reesets_app/docs/portal-guide/`) with per-section screenshots, captions and commentary, covering every page, tab and modal in the app plus an icon reference.

Improvements over reesets pattern:
- Each page gets a full-page screenshot **plus** one screenshot per prominent section.
- Each modal gets its own screenshot.
- Every prominent nav section is documented at the shell level.
- Pipeline workspace (`x121 — adult content`) is covered explicitly, including how global pages re-scope inside a pipeline.
- Appendix with a complete icon-semantics reference.

---

## 0. App shell (document once, at the top)

These appear on every authenticated page and must be screenshotted in isolation.

- `AppShell` — outer layout (Sidebar + Header + main + StatusFooter + ActivityConsoleDrawer).
- `Sidebar` — collapsible/compact modes; pipeline header block; nav groups (see below).
- `Header` — top bar (page title, breadcrumb, user menu entry).
- `UserMenu` — dropdown: Theme toggle (Light/System/Dark), Settings, Log out.
- `StatusFooter` — Console toggle, Service health, Cloud GPU segment, Job segment, Workflow segment.
- `ActivityConsoleDrawer` — slide-up console (Generation / Infra / Live / History tabs).
- `PageGuideBanner` — inline guide dismissibles (per-route first-time hint).
- `ProtectedRoute` / login redirect behaviour.
- `LoginPage` (`/login`) — public route, outside shell.
- `ExternalReviewPage` (`/review/share/$token`) — public, outside shell.

### Global nav groups (from `NAV_GROUPS` in `apps/frontend/src/app/navigation.ts`)

1. **Overview** — Dashboard, Performance.
2. **Pipelines** — All Pipelines.
3. **Content** — Avatars, Library, Media, Scenes, Derived Clips, Catalogue, Storyboard, Avatar Dashboard, Contact Sheet, Duplicates.
4. **Production** — Queue, Generation, Test Shots, Batch, Delivery, Checkpoints, Debugger, Render Timeline.
5. **Review** — Annotations, Reviews, Notes, Production Notes, QA Gates, Cinema, Temporal.
6. **Tools** — Workflows, Prompts, Config, Presets, Search, Branching, Activity Console, Avatar Ingest, Batch Metadata, Pipeline Hooks, Import Workflow, Undo Tree.
7. **Admin** (role-gated) — Pipelines, Infrastructure, Cloud GPUs, Storage, Naming Rules, Queue Manager, Output Profiles, Hardware, Workers, Integrity, Audit, Reclamation, Downloads, API Keys, Extensions, Maintenance, Onboarding Wizard, Legacy Import, Readiness, Settings, Themes, Job Scheduling, Sessions, Webhook Testing, API Observability, Trigger Workflows, Backups, Budgets, GPU Scheduling, Disk Usage, Failure Analytics, Importer, Config Import.
8. **Settings** — Shortcuts, Wiki.

### Pipeline workspace nav groups (from `buildPipelineNavGroups` in `apps/frontend/src/app/pipeline-navigation.ts`)

Same structure as global, scoped under `/pipelines/$pipelineCode/…`:

1. **Overview** — Dashboard
2. **Projects** — All Projects (+ dynamic per-project children)
3. **Content** — Avatars, Library, Media, Scenes, Derived Clips, Catalogue, Storyboard, Avatar Dashboard, Contact Sheet, Duplicates
4. **Production** — Queue, Generation, Test Shots, Batch, Delivery, Checkpoints, Debugger, Render Timeline
5. **Review** — Annotations, Reviews, Notes, Production Notes, QA Gates, Cinema, Temporal
6. **Tools** — Workflows, Prompts, Config, Presets, Search, Branching, Activity Console, Avatar Ingest, Batch Metadata, Pipeline Hooks, Import Workflow, Undo Tree
7. **Pipeline Admin** — Naming Rules, Output Profiles, Settings

---

## 1. Chapter-by-chapter page inventory

Each chapter = one LaTeX chapter file. For every page: full-page screenshot, then a screenshot per listed section. Tabs are always screenshotted individually. Sub-tabs too.

### Ch 1 — Public / Auth
- `/login` — LoginPage (form, error states).
- `/review/share/$token` — ExternalReviewPage (read-only review via shared link).

### Ch 2 — Pipeline Selector (`/`)
- `PipelineSelectorPage` — pipeline card grid, empty/error states.

### Ch 3 — Global Dashboard
- `/dashboard` — `PipelineDashboardPage` (lives at pipeline scope; see Ch 12) and `/dashboard` global dashboard with widgets.
  - Sections: header, widget grid (ActiveTasksWidget, ProjectProgressWidget, AvatarReadinessWidget, ActivityFeedWidget, ScheduledGenerationsWidget, DiskHealthWidget, InfraStatusWidget), KYC/notification banners.
- `/performance` — `PerformanceDashboard`.
  - **Tabs:** Overview · Quality Trends · Workflow Comparison · Worker Benchmarking · Alert Thresholds.
- `/dashboard/customize` — `DashboardCustomization` (WidgetCatalogue, WidgetSettingsPanel, PresetImportDialog modal).

### Ch 4 — Projects
- `/projects` (global) and `/pipelines/$code/projects` — `ProjectListPage` (grid + filters + create flow).
- `/projects/$projectId` — `ProjectDetailPage`.
  - **Tabs:** Overview · Avatars · Production · Delivery · Settings.
  - Overview tab: StatTickers, AvatarDeliverablesGrid with its **inner tabs** (Readiness · Matrix).
  - Avatars tab: group pills, avatar list, inline import affordances.
  - Production tab: queue panel, bulk actions.
  - Delivery tab: deliverables table, export controls.
  - Settings tab: blocking deliverables, naming overrides, quality gate overrides.
- `/projects/$projectId/review-assignments` — `AssignmentDashboardPage`.

### Ch 5 — Avatars
- `/content/avatars` and `/pipelines/$code/avatars` — `AvatarsPage` (cross-project browser, filters, grid/list).
- `/projects/$projectId/avatars/$avatarId` — `AvatarDetailPage`.
  - **Tabs:** Overview · Images · Seeds · Scenes · Derived · Metadata · Speech · Deliverables · Review · Settings.
  - Each tab gets its own section with a screenshot. Sub-components worth their own shots:
    - Images tab: TrackImageCard grid, hero badge, approve/reject flow.
    - Seeds tab: SeedSlotCards, AutoAssign flow.
    - Scenes tab: AvatarScenesTab table, generation buttons, GPU warning.
    - Metadata tab: version list with active/rejection states.
    - Speech tab: entries per language, bulk import.
    - Deliverables tab: download buttons by kind.
    - Review tab: AvatarReviewControls + AvatarReviewAuditLog.

### Ch 6 — Content
- `/content/media` / `/pipelines/$code/media` — `MediaPage` (list/grid toggle, filters, TagFilter, BulkActionBar, ExportStatusPanel, ImagePreviewModal, ScanInputDialog, ImportConfirmModal).
- `/content/scenes` / `/pipelines/$code/scenes` — `ScenesPage` (clip rows, bulk actions, dialogs).
- `/content/derived-clips` / `/pipelines/$code/derived-clips` — `DerivedClipsPage`.
- `/content/library` / `/pipelines/$code/library` — `LibraryPage` (shared avatar library, LibraryAvatarCard, LibraryAvatarModal, ImportDialog).
- `/content/scene-catalogue` / `/pipelines/$code/scene-catalogue` — `SceneCataloguePage`.
  - **Tabs:** Image Types · Scene Types · Catalogue · Tracks · Workflows · Prompt Defaults · Video Settings.
- `/content/storyboard` / `/pipelines/$code/storyboard` — `StoryboardPage` (HoverScrub, ThumbnailStrip).
- `/content/avatar-dashboard` / `/pipelines/$code/avatar-dashboard` — `AvatarDashboardPage`.
- `/content/contact-sheet` / `/pipelines/$code/contact-sheet` — `ContactSheetPage`.
- `/content/duplicates` / `/pipelines/$code/duplicates` — `DuplicatesPage` (SimilarityAlert).

### Ch 7 — Production
- `/production/queue` / `/pipelines/$code/queue` — `QueueStatusView` / `QueueManagerPage`, JobActions, QueueActivityLog.
- `/production/generation` / `/pipelines/$code/generation` — `GenerationPage`, GenerationTerminal, ScheduleGenerationModal.
- `/production/test-shots` / `/pipelines/$code/test-shots` — `TestShotsPage`, TestShotGallery, TestShotButton.
- `/production/batch` / `/pipelines/$code/batch` — `BatchProductionPage`.
- `/production/delivery` / `/pipelines/$code/delivery` — `DeliveryPage` / `ProjectDeliveryTab`, DeliveryLogViewer, BulkArchivalPanel, TransitionControls.
- `/production/checkpoints` / `/pipelines/$code/checkpoints` — `CheckpointsPage`, ResumeDialog, ResumeFromDialog.
- `/production/debugger` / `/pipelines/$code/debugger` — `DebuggerPage`, AbortDialog.
- `/production/render-timeline` / `/pipelines/$code/render-timeline` — `RenderTimelinePage`, ReorderDialog, RegenerateSegmentButton.

### Ch 8 — Review
- `/review/annotations` / `/pipelines/$code/annotations` — `AnnotationsPage` (card grid + ClipPlaybackModal).
- `/reviews` / `/pipelines/$code/reviews` — `MyReviewsPage`, AssignmentDashboard, AvatarReviewControls, RejectionDialog.
- `/review/notes` / `/pipelines/$code/notes` — `ReviewNotesPage`.
- `/review/production-notes` / `/pipelines/$code/production-notes` — `ProductionNotesPage`.
- `/review/qa-gates` / `/pipelines/$code/qa-gates` — `QaGatesPage`, SceneQaSummaryCard, AutoApproveAction.
- `/review/cinema` / `/pipelines/$code/cinema` — `CinemaPage` / `CinemaMode`, GridControls, SyncPlayGrid, CinemaReviewControls.
- `/review/temporal` / `/pipelines/$code/temporal` — `TemporalPage`, DriftTrendChart.

### Ch 9 — Tools
- `/tools/workflows` / `/pipelines/$code/workflows` — `WorkflowsPage`.
  - **Tabs:** Workflows · Import New.
  - Sub-panels: WorkflowDetailPanel (Canvas / Raw JSON / Validation / Scenes / Info tabs), WorkflowCanvas.
- `/tools/prompts` / `/pipelines/$code/prompts` — `PromptsPage`, SceneTypePromptDefaultsPanel, ImagePromptOverrides, AvatarPromptOverrides, GroupPromptOverrides, ProjectPromptOverrides, WorkflowPromptOverridePanel.
- `/tools/config` / `/pipelines/$code/config` — `ProjectConfigTab` / pipeline config view.
- `/tools/presets` / `/pipelines/$code/presets` — `PresetsPage`, AnnotationPresetManager.
- `/tools/search` / `/pipelines/$code/search` — `SearchPage`, FacetPanel.
- `/tools/branching` / `/pipelines/$code/branching` — `BranchingPage`.
- `/tools/activity-console` / `/pipelines/$code/activity-console` — `ActivityConsolePage`.
  - **Tabs:** Generation · Infra · Live · History.
- `/tools/avatar-ingest` / `/pipelines/$code/avatar-ingest` — `AvatarIngestPage`.
  - **Tabs:** Import · Validation. Uses NameParserPreview, ImportPreviewTree.
- `/tools/batch-metadata` / `/pipelines/$code/batch-metadata` — `BatchMetadataPage`, MetadataPreview, MetadataForm, BulkEditDialog, CsvImport.
- `/tools/pipeline-hooks` / `/pipelines/$code/pipeline-hooks` — `PipelineHooksPage`.
  - **Tabs:** Manage Hooks · Execution Logs · Test Console.
- `/tools/workflow-import` / `/pipelines/$code/workflow-import` — `WorkflowImportPage`, ImportWizard.
- `/tools/undo` / `/pipelines/$code/undo` — `UndoPage` (undo tree visualisation).

### Ch 10 — Admin
For each route: top-level screenshot + every tab + every dialog.

- `/admin/pipelines` — `PipelineListPage` → `/admin/pipelines/$id` — `PipelineSettingsPage` (naming rules editor, hooks, seed slots, default prompts).
- `/admin/infrastructure` — `InfrastructureControlPanel`.
  - Sub-components: ProviderManagement, ProvisionWizard, InstanceActions, BulkActionToolbar, OrphanPanel, InfrastructureActivityLog.
- `/admin/cloud-gpus` — `CloudGpuDashboard` → `/admin/cloud-gpus/$providerId` — `CloudProviderDetail` (Instances · GPU Types · Scaling Rules · Cost).
- `/admin/storage` — `StoragePage`, `BackendFormModal`.
- `/admin/naming` — `NamingRulesPage` (admin view) + the modal we just added for editing rules.
- `/admin/queue` — `QueueManagerPage`.
- `/admin/output-profiles` — `OutputProfilesPage`.
- `/admin/hardware` — `HardwareDashboard`.
- `/admin/workers` — `WorkerDashboard`.
- `/admin/integrity` — `IntegrityPage`, IntegrityCheck.
- `/admin/audit` — `AuditLogViewer`.
- `/admin/reclamation` — `ReclamationDashboard` (**Tabs:** Overview · Trash Queue · History · Protection Rules · Policies) + TrashBrowser.
- `/admin/downloads` — `DownloadsPage`, DownloadItem, PlacementRulesAdmin.
- `/admin/api-keys` — `ApiKeyManager`, WebhookManager.
- `/admin/extensions` — `ExtensionManager`, ExtensionSandbox.
- `/admin/maintenance` — `MaintenancePage`, RestartButton.
- `/admin/onboarding-wizard` — `OnboardingWizardPage`. Steps: Admin Account, Database, Storage, ComfyUI, Worker, Integrations, Health Check, WizardCompletePanel.
- `/admin/legacy-import` — `LegacyImportPage`, ImportProgress, CsvImportDialog.
- `/admin/readiness` — `ReadinessPage` (**Tabs:** Readiness Summary · Criteria Editor).
- `/admin/settings` — `SettingsPanel` (dynamic tabs from SETTING_CATEGORIES: Storage · ComfyUI · Auth · Advanced · Templates + MetadataTemplateEditor, SettingValueEditor).
- `/admin/themes` — `ThemesPage` / token editor, TokenSections.
- `/admin/job-scheduling` — `JobSchedulingPage` (**Tabs:** Schedules · Off-Peak Config), ScheduleRow, ScheduleForm.
- `/admin/session-management` — `SessionManagementPage` (**Tabs:** Active Sessions · Login History · Analytics · Configuration), ActiveSessionsTable.
- `/admin/webhook-testing` — `WebhookTestingPage` (**Tabs:** Test Sender · Delivery Log · Endpoint Health · Mock Endpoints), MockEndpointManager.
- `/admin/api-observability` — `ApiObservabilityPage` (RequestVolumeChart, ResponseTimeChart, EndpointHeatmap, RateLimitPanel, AlertConfigPanel, TopConsumersTable).
- `/admin/trigger-workflows` — `TriggerWorkflowPage` (**Tabs:** Triggers · Chain Graph · Execution Log), TriggerRow.
- `/admin/backups` — `BackupsPage`, BackupRow, ScheduleRow, ScheduleForm, TriggerBackupDialog.
- `/admin/budgets` — `BudgetDashboard` + `BudgetAdminPanel` (**Tabs:** Budgets · Quotas · Exemptions).
- `/admin/gpu-scheduling` — `GpuSchedulingPage`.
- `/admin/disk-usage` — `StorageTreemap`, TreemapBreadcrumbs.
- `/admin/failure-analytics` — `FailureAnalyticsPage`, FailureHeatmap.
- `/admin/importer` — `ImporterPage`, ImportPreviewTree.
- `/admin/config-import` — `AdminConfigImportPage`.
- `/admin/health` — `ServiceStatusGrid`, StartupChecklist, UptimeBar.

### Ch 11 — Settings
- `/settings/shortcuts` — shortcuts page, KeymapEditor.
- `/settings/wiki` — `WikiPage`, WikiArticleViewer.

### Ch 12 — Pipeline Workspace (x121 — adult content)

Walk through the pipeline workspace end-to-end using `x121` as the example.

- `/pipelines/x121/dashboard` — `PipelineDashboardPage` (seed slots, quick links, pipeline-scoped widgets).
- Show that the Sidebar re-scopes to pipeline mode (with pipeline header, Pipeline Admin group).
- Re-cover the same page components as global but under pipeline context — only call out differences (e.g. scoped queries, "Pipeline Admin" group, extra nav items, inherited naming/output-profile overrides).
- `/pipelines/x121/naming` — scoped `NamingRulesPage` with `PipelineNamingRulesEditor` (different UI than admin view).
- `/pipelines/x121/output-profiles` — pipeline-scoped output profiles.
- `/pipelines/x121/settings` — `PipelineSettingsPage`.

Explicit screenshots for this chapter: sidebar in pipeline mode, PipelineProvider loading/error states, pipeline dashboard, and one representative re-scoped page (e.g. Projects) showing the URL prefix and context banner.

---

## 2. Modal index (appendix or per-chapter)

60+ modals/dialogs to screenshot. Grouped by feature so each can appear in the right chapter.

### Base/reusable chrome
- `Modal` (composite) — base
- `ConfirmModal`, `ConfirmDeleteModal`
- `Drawer`
- `NotesModal`

### Auth / access / projects
- `ProjectConfirmModal` (avatar import)
- `ProjectConfirmModal` (voice import)
- `AvatarEditModal`
- `ImportConfirmModal`
- `FileAssignmentModal`
- `AvatarSeedDataModal`
- `BulkSpeechImportModal`
- `SpeechImportResultModal`
- `QueueOutstandingModal`
- `AddSpeechModal`
- `SpeechImportModal`
- `AutoAssignPreviewModal`
- `GenerateConfirmModal`
- `ImportPreviewModal`
- `RejectVersionModal`
- `VoiceImportConfirmModal`, `VoiceImportResultModal`

### Scenes / video
- `ImportClipDialog`, `BulkImportDialog`
- `ClipPlaybackModal`
- `ClipRejectionDialog`
- `ResumeFromDialog`
- `ScanDirectoryDialog`, `ScanInputDialog`

### Production / generation
- `ScheduleGenerationModal`
- `MediaVariantAnnotationModal`
- `AbortDialog` (debugger)
- `ResumeDialog` (checkpoints)

### Review / QA
- `RejectionDialog`
- `BulkRejectDialog`
- `BulkLabelDialog`

### Library / imports
- `LibraryAvatarModal`
- `ImportDialog` (library)
- `CsvImportDialog` (legacy)
- `PresetImportDialog`
- `BulkEditDialog` (metadata)
- `CreateLinkDialog` (shared links)
- `ReorderDialog` (render timeline)

### Admin
- `BackendFormModal` (storage)
- `TriggerBackupDialog`
- `LabelManagerModal`

### Naming rules
- `RuleEditor` modal (just introduced)

### Derived clips
- `DerivedClipDialogs`

---

## 3. Icon semantics appendix

One appendix chapter mapping every icon imported from `@/tokens/icons` to its meaning in this app. Grouped by purpose. Each icon gets: glyph · name · what it means here · where it typically appears.

Groups:
- Navigation & UI control (`ChevronDown/Up/Left/Right`, `Menu`, `PanelLeftOpen/Close`, `X`, `ArrowLeft/Right/Up/Down`, `ChevronsDownUp`, `ChevronsUpDown`, `Search`)
- Actions & CRUD (`Plus`, `Minus`, `Edit3`, `Copy`, `Trash2`, `Download`, `Upload`, `Save`, `Archive`, `ArchiveRestore`, `RotateCcw`, `RotateCw`, `RefreshCw`)
- Status indicators (`Check`, `CheckCircle`, `CircleCheck`, `XCircle`, `CircleX`, `AlertCircle`, `AlertTriangle`, `Info`, `Star`, `Ban`, `Loader2`)
- Media & files (`File`, `FileText`, `FileVideo`, `FileJson`, `FileSearch`, `Folder`, `FolderKanban`, `FolderSearch`, `Image`, `Video`, `Clapperboard`, `Film`)
- Playback (`Play`, `Pause`, `SkipForward/Back`, `Repeat`, `Volume2`, `VolumeX`, `Square`)
- Layout (`LayoutGrid`, `Layout`, `Maximize2`, `Minimize2`, `Columns`, `GripVertical`, `List`, `ListFilter`)
- UI & settings (`Settings`, `Keyboard`, `User`, `Users`, `UserPlus`, `LogOut`, `Eye`, `EyeOff`, `Moon`, `Sun`, `SunMoon`, `Monitor`, `Palette`)
- Time & activity (`Clock`, `Calendar`, `Bell`, `BellOff`, `Activity`, `Timer`)
- Data & analytics (`BarChart3`, `TrendingUp`, `HardDrive`, `Zap`, `DollarSign`)
- Access (`Lock`, `Unlock`, `Shield`, `ShieldCheck`, `Link2`)
- Workflow/infra (`GitBranch`, `Workflow`, `Terminal`, `Server`, `Cpu`, `Power`, `Cloud`, `Wifi`, `WifiOff`, `Layers`)
- Capture (`Mic`, `MessageSquare`, `Globe`)
- AI/tools (`Sparkles`, `Wand2`, `Wrench`, `Bug`, `ScanEye`, `ScanSearch`, `CircleDot`, `Tag`, `ArrowRightLeft`, `Undo2`)

Context-specific meanings to call out:
- `CheckCircle` / `XCircle` — always "Approve" / "Reject" on review controls.
- `Eye` — preview/open-in-modal (not "watch").
- `Star` — hero variant / favourite.
- `Clapperboard` / `Film` — scene / clip context; `Film` also means "delivery/output" on buttons.
- `Folder` vs `FolderKanban` — library bucket vs project.

---

## 4. Proposed capture workflow

1. Generate LaTeX scaffold under `design/docs/app-guide/` mirroring the reesets layout (`main.tex`, `preamble.tex`, `chapters/00…`, `screenshots/`, `build.sh`).
2. For each chapter, write a stub with `\screenshot{…}{…}` placeholders and `\pagelement{…}{…}` entries so we can fill captures in order.
3. Use two capture passes against a seeded dev DB:
   - Global/admin pass (no pipeline selected).
   - Pipeline pass with `x121 — adult content` selected.
4. For each page: one `hero` screenshot (full page), then one screenshot per tab and one per section (filters bar, legend, data grid, bulk action bar, preview modal).
5. For each modal: open from a realistic caller state, screenshot including dimmed backdrop.
6. Icons appendix: one composite screenshot per group (use Storybook if available, otherwise a small demo page) + inline glyphs in the text.

---

## 5. Open questions before capture starts

- Confirm `x121` is the only pipeline to deep-dive, or should we also walk `y122` at least briefly to show cross-pipeline differences?
- Do you want the admin pass run with a super-admin account, or a normal admin? Some admin pages role-gate further (e.g. dangerous maintenance actions).
- Should we also document public email templates / external share link page variations (there are multiple token states)?
- Seed data: do we want a reproducible seed script so screenshots can be regenerated against the same canonical data, or hand-curated states?

---

## Counts

- Routes: ~180 (~45 pipeline-scoped + ~135 global/admin/settings).
- Distinct page components to document: ~90 (many pipeline/global pairs share a component).
- Pages with in-page tabs: 21 (with ~130 distinct tab states).
- Modals/dialogs: ~60.
- Unique icons in use: ~130.

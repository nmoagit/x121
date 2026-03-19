import { Outlet, createRootRoute, createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { AdminGuard } from "@/app/AdminGuard";
import { AppShell } from "@/app/AppShell";
import { LoginPage } from "@/features/auth/LoginPage";

/* --------------------------------------------------------------------------
   Root layout
   -------------------------------------------------------------------------- */

const rootRoute = createRootRoute({
  component: Outlet,
});

/* --------------------------------------------------------------------------
   Public routes (no shell)
   -------------------------------------------------------------------------- */

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const externalReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/review/share/$token",
  component: lazyRouteComponent(() =>
    import("@/app/pages/ExternalReviewPage").then((m) => ({ default: m.ExternalReviewPage })),
  ),
});

/* --------------------------------------------------------------------------
   Authenticated layout (AppShell wraps all protected routes)
   -------------------------------------------------------------------------- */

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  component: AppShell,
});

/* --------------------------------------------------------------------------
   Dashboard routes
   -------------------------------------------------------------------------- */

const indexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/",
  component: lazyRouteComponent(() =>
    import("@/app/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
  ),
});

const performanceRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/performance",
  component: lazyRouteComponent(() =>
    import("@/features/dashboard/PerformanceDashboard").then((m) => ({
      default: m.PerformanceDashboard,
    })),
  ),
});

const dashboardCustomizeRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/dashboard/customize",
  component: lazyRouteComponent(() =>
    import("@/features/dashboard-customization").then((m) => ({
      default: m.DashboardCustomizationPage,
    })),
  ),
});

/* --------------------------------------------------------------------------
   Project routes (PRD-112)
   -------------------------------------------------------------------------- */

const projectsLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "projects",
  component: Outlet,
});

const projectListRoute = createRoute({
  getParentRoute: () => projectsLayoutRoute,
  path: "/projects",
  component: lazyRouteComponent(() =>
    import("@/features/projects").then((m) => ({ default: m.ProjectListPage })),
  ),
});

const projectDetailRoute = createRoute({
  getParentRoute: () => projectsLayoutRoute,
  path: "/projects/$projectId",
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    group: typeof search.group === "string" ? search.group : undefined,
  }),
  component: lazyRouteComponent(() =>
    import("@/features/projects").then((m) => ({ default: m.ProjectDetailPage })),
  ),
});

const characterDetailRoute = createRoute({
  getParentRoute: () => projectsLayoutRoute,
  path: "/projects/$projectId/models/$characterId",
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    scene: typeof search.scene === "string" ? search.scene : undefined,
  }),
  component: lazyRouteComponent(() =>
    import("@/features/characters").then((m) => ({ default: m.CharacterDetailPage })),
  ),
});

/* --------------------------------------------------------------------------
   Content routes
   -------------------------------------------------------------------------- */

const contentLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "content",
  component: Outlet,
});

const scenesRoute = createRoute({
  getParentRoute: () => contentLayoutRoute,
  path: "/content/scenes",
  component: lazyRouteComponent(() =>
    import("@/app/pages/ScenesPage").then((m) => ({ default: m.ScenesPage })),
  ),
});

const charactersRoute = createRoute({
  getParentRoute: () => contentLayoutRoute,
  path: "/content/models",
  component: lazyRouteComponent(() =>
    import("@/app/pages/CharactersPage").then((m) => ({ default: m.CharactersPage })),
  ),
});

const libraryRoute = createRoute({
  getParentRoute: () => contentLayoutRoute,
  path: "/content/library",
  component: lazyRouteComponent(() =>
    import("@/features/library").then((m) => ({ default: m.CharacterLibraryBrowser })),
  ),
});

const storyboardRoute = createRoute({
  getParentRoute: () => contentLayoutRoute,
  path: "/content/storyboard",
  component: lazyRouteComponent(() =>
    import("@/app/pages/StoryboardPage").then((m) => ({ default: m.StoryboardPage })),
  ),
});

const imagesRoute = createRoute({
  getParentRoute: () => contentLayoutRoute,
  path: "/content/images",
  component: lazyRouteComponent(() =>
    import("@/app/pages/ImagesPage").then((m) => ({ default: m.ImagesPage })),
  ),
});

const sceneCatalogueRoute = createRoute({
  getParentRoute: () => contentLayoutRoute,
  path: "/content/scene-catalogue",
  component: lazyRouteComponent(() =>
    import("@/app/pages/SceneCataloguePage").then((m) => ({ default: m.SceneCataloguePage })),
  ),
});

const characterDashboardRoute = createRoute({
  getParentRoute: () => contentLayoutRoute,
  path: "/content/model-dashboard",
  component: lazyRouteComponent(() =>
    import("@/app/pages/CharacterDashboardPage").then((m) => ({
      default: m.CharacterDashboardPage,
    })),
  ),
});

const contactSheetRoute = createRoute({
  getParentRoute: () => contentLayoutRoute,
  path: "/content/contact-sheet",
  component: lazyRouteComponent(() =>
    import("@/app/pages/ContactSheetPage").then((m) => ({ default: m.ContactSheetPage })),
  ),
});

const duplicatesRoute = createRoute({
  getParentRoute: () => contentLayoutRoute,
  path: "/content/duplicates",
  component: lazyRouteComponent(() =>
    import("@/app/pages/DuplicatesPage").then((m) => ({ default: m.DuplicatesPage })),
  ),
});

/* --------------------------------------------------------------------------
   Production routes
   -------------------------------------------------------------------------- */

const productionLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "production",
  component: Outlet,
});

const queueRoute = createRoute({
  getParentRoute: () => productionLayoutRoute,
  path: "/production/queue",
  component: lazyRouteComponent(() =>
    import("@/features/queue").then((m) => ({ default: m.QueueStatusView })),
  ),
});

const generationRoute = createRoute({
  getParentRoute: () => productionLayoutRoute,
  path: "/production/generation",
  component: lazyRouteComponent(() =>
    import("@/app/pages/GenerationPage").then((m) => ({ default: m.GenerationPage })),
  ),
});

const testShotsRoute = createRoute({
  getParentRoute: () => productionLayoutRoute,
  path: "/production/test-shots",
  component: lazyRouteComponent(() =>
    import("@/app/pages/TestShotsPage").then((m) => ({ default: m.TestShotsPage })),
  ),
});

const batchRoute = createRoute({
  getParentRoute: () => productionLayoutRoute,
  path: "/production/batch",
  component: lazyRouteComponent(() =>
    import("@/app/pages/BatchProductionPage").then((m) => ({ default: m.BatchProductionPage })),
  ),
});

const deliveryRoute = createRoute({
  getParentRoute: () => productionLayoutRoute,
  path: "/production/delivery",
  component: lazyRouteComponent(() =>
    import("@/app/pages/DeliveryPage").then((m) => ({ default: m.DeliveryPage })),
  ),
});

const checkpointsRoute = createRoute({
  getParentRoute: () => productionLayoutRoute,
  path: "/production/checkpoints",
  component: lazyRouteComponent(() =>
    import("@/app/pages/CheckpointsPage").then((m) => ({ default: m.CheckpointsPage })),
  ),
});

const debuggerRoute = createRoute({
  getParentRoute: () => productionLayoutRoute,
  path: "/production/debugger",
  component: lazyRouteComponent(() =>
    import("@/app/pages/DebuggerPage").then((m) => ({ default: m.DebuggerPage })),
  ),
});

const renderTimelineRoute = createRoute({
  getParentRoute: () => productionLayoutRoute,
  path: "/production/render-timeline",
  component: lazyRouteComponent(() =>
    import("@/features/render-timeline").then((m) => ({ default: m.RenderTimelinePage })),
  ),
});

/* --------------------------------------------------------------------------
   Review routes
   -------------------------------------------------------------------------- */

const reviewLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "review",
  component: Outlet,
});

const myReviewsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/reviews",
  component: lazyRouteComponent(() =>
    import("@/app/pages/MyReviewsPage").then((m) => ({ default: m.MyReviewsPage })),
  ),
});

const assignmentDashboardRoute = createRoute({
  getParentRoute: () => projectsLayoutRoute,
  path: "/projects/$projectId/review-assignments",
  component: lazyRouteComponent(() =>
    import("@/app/pages/AssignmentDashboardPage").then((m) => ({
      default: m.AssignmentDashboardPage,
    })),
  ),
});

const annotationsRoute = createRoute({
  getParentRoute: () => reviewLayoutRoute,
  path: "/review/annotations",
  component: lazyRouteComponent(() =>
    import("@/app/pages/AnnotationsPage").then((m) => ({ default: m.AnnotationsPage })),
  ),
});

const reviewNotesRoute = createRoute({
  getParentRoute: () => reviewLayoutRoute,
  path: "/review/notes",
  component: lazyRouteComponent(() =>
    import("@/app/pages/ReviewNotesPage").then((m) => ({ default: m.ReviewNotesPage })),
  ),
});

const productionNotesRoute = createRoute({
  getParentRoute: () => reviewLayoutRoute,
  path: "/review/production-notes",
  component: lazyRouteComponent(() =>
    import("@/app/pages/ProductionNotesPage").then((m) => ({ default: m.ProductionNotesPage })),
  ),
});

const qaGatesRoute = createRoute({
  getParentRoute: () => reviewLayoutRoute,
  path: "/review/qa-gates",
  component: lazyRouteComponent(() =>
    import("@/app/pages/QaGatesPage").then((m) => ({ default: m.QaGatesPage })),
  ),
});

const cinemaRoute = createRoute({
  getParentRoute: () => reviewLayoutRoute,
  path: "/review/cinema",
  component: lazyRouteComponent(() =>
    import("@/app/pages/CinemaPage").then((m) => ({ default: m.CinemaPage })),
  ),
});

const temporalRoute = createRoute({
  getParentRoute: () => reviewLayoutRoute,
  path: "/review/temporal",
  component: lazyRouteComponent(() =>
    import("@/app/pages/TemporalPage").then((m) => ({ default: m.TemporalPage })),
  ),
});

/* --------------------------------------------------------------------------
   Tools routes
   -------------------------------------------------------------------------- */

const toolsLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "tools",
  component: Outlet,
});

const promptsRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/tools/prompts",
  component: lazyRouteComponent(() =>
    import("@/app/pages/PromptsPage").then((m) => ({ default: m.PromptsPage })),
  ),
});

const workflowsRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/tools/workflows",
  validateSearch: (search: Record<string, unknown>) => ({
    name: (search.name as string) ?? undefined,
  }),
  component: lazyRouteComponent(() =>
    import("@/app/pages/WorkflowsPage").then((m) => ({ default: m.WorkflowsPage })),
  ),
});

const configRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/tools/config",
  component: lazyRouteComponent(() =>
    import("@/features/config-templates").then((m) => ({ default: m.ConfigLibrary })),
  ),
});

const presetsRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/tools/presets",
  component: lazyRouteComponent(() =>
    import("@/features/presets").then((m) => ({ default: m.PresetMarketplace })),
  ),
});

const searchRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/tools/search",
  component: lazyRouteComponent(() =>
    import("@/app/pages/SearchPage").then((m) => ({ default: m.SearchPage })),
  ),
});

const branchingRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/tools/branching",
  component: lazyRouteComponent(() =>
    import("@/app/pages/BranchingPage").then((m) => ({ default: m.BranchingPage })),
  ),
});

const activityConsoleRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/tools/activity-console",
  component: lazyRouteComponent(() =>
    import("@/features/activity-console").then((m) => ({ default: m.ActivityConsolePage })),
  ),
});

const characterIngestRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/tools/model-ingest",
  component: lazyRouteComponent(() =>
    import("@/features/character-ingest").then((m) => ({
      default: m.CharacterIngestPage,
    })),
  ),
});

const batchMetadataRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/tools/batch-metadata",
  component: lazyRouteComponent(() =>
    import("@/app/pages/BatchMetadataPage").then((m) => ({ default: m.BatchMetadataPage })),
  ),
});

const pipelineHooksRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/tools/pipeline-hooks",
  component: lazyRouteComponent(() =>
    import("@/app/pages/PipelineHooksPage").then((m) => ({ default: m.PipelineHooksPage })),
  ),
});

const workflowImportRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/tools/workflow-import",
  component: lazyRouteComponent(() =>
    import("@/app/pages/WorkflowImportPage").then((m) => ({ default: m.WorkflowImportPage })),
  ),
});

const undoRoute = createRoute({
  getParentRoute: () => toolsLayoutRoute,
  path: "/tools/undo",
  component: lazyRouteComponent(() =>
    import("@/app/pages/UndoPage").then((m) => ({ default: m.UndoPage })),
  ),
});

/* --------------------------------------------------------------------------
   Admin routes (role-gated by AdminGuard)
   -------------------------------------------------------------------------- */

const adminLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "admin",
  component: AdminGuard,
});

const adminHardwareRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/hardware",
  component: lazyRouteComponent(() =>
    import("@/features/admin/HardwareDashboard").then((m) => ({ default: m.HardwareDashboard })),
  ),
});

const adminWorkersRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/workers",
  component: lazyRouteComponent(() =>
    import("@/features/workers").then((m) => ({ default: m.WorkerDashboard })),
  ),
});

const adminIntegrityRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/integrity",
  component: lazyRouteComponent(() =>
    import("@/app/pages/IntegrityPage").then((m) => ({ default: m.IntegrityPage })),
  ),
});

const adminAuditRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/audit",
  component: lazyRouteComponent(() =>
    import("@/features/audit").then((m) => ({ default: m.AuditLogViewer })),
  ),
});

const adminReclamationRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/reclamation",
  component: lazyRouteComponent(() =>
    import("@/features/admin/ReclamationDashboard").then((m) => ({
      default: m.ReclamationDashboard,
    })),
  ),
});

const adminStorageRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/storage",
  component: lazyRouteComponent(() =>
    import("@/app/pages/StoragePage").then((m) => ({ default: m.StoragePage })),
  ),
});

const adminDownloadsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/downloads",
  component: lazyRouteComponent(() =>
    import("@/features/downloads").then((m) => ({ default: m.DownloadQueue })),
  ),
});

const adminApiKeysRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/api-keys",
  component: lazyRouteComponent(() =>
    import("@/features/api-keys").then((m) => ({ default: m.ApiKeyManager })),
  ),
});

const adminExtensionsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/extensions",
  component: lazyRouteComponent(() =>
    import("@/features/extensions").then((m) => ({ default: m.ExtensionManager })),
  ),
});

const adminMaintenanceRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/maintenance",
  component: lazyRouteComponent(() =>
    import("@/features/maintenance").then((m) => ({ default: m.FindReplacePanel })),
  ),
});

const adminOnboardingRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/onboarding-wizard",
  component: lazyRouteComponent(() =>
    import("@/app/pages/OnboardingWizardPage").then((m) => ({ default: m.OnboardingWizardPage })),
  ),
});

const adminLegacyImportRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/legacy-import",
  component: lazyRouteComponent(() =>
    import("@/app/pages/LegacyImportPage").then((m) => ({ default: m.LegacyImportPage })),
  ),
});

const adminNamingRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/naming",
  component: lazyRouteComponent(() =>
    import("@/features/naming-rules").then((m) => ({ default: m.NamingRulesPage })),
  ),
});

const adminReadinessRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/readiness",
  component: lazyRouteComponent(() =>
    import("@/app/pages/ReadinessPage").then((m) => ({ default: m.ReadinessPage })),
  ),
});

const adminSettingsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/settings",
  component: lazyRouteComponent(() =>
    import("@/features/settings").then((m) => ({ default: m.SettingsPanel })),
  ),
});

const adminThemesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/themes",
  component: lazyRouteComponent(() =>
    import("@/features/admin/TokenEditor").then((m) => ({ default: m.TokenEditor })),
  ),
});

const adminCloudGpusRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/cloud-gpus",
  component: lazyRouteComponent(() =>
    import("@/features/admin/cloud-gpus/CloudGpuDashboard").then((m) => ({
      default: m.CloudGpuDashboard,
    })),
  ),
});

const adminJobSchedulingRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/job-scheduling",
  component: lazyRouteComponent(() =>
    import("@/features/job-scheduling").then((m) => ({ default: m.JobSchedulingPage })),
  ),
});

const adminSessionManagementRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/session-management",
  component: lazyRouteComponent(() =>
    import("@/features/session-management").then((m) => ({ default: m.SessionManagementPage })),
  ),
});

const adminWebhookTestingRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/webhook-testing",
  component: lazyRouteComponent(() =>
    import("@/features/webhook-testing").then((m) => ({ default: m.WebhookTestingPage })),
  ),
});

const adminApiObservabilityRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/api-observability",
  component: lazyRouteComponent(() =>
    import("@/features/api-observability").then((m) => ({ default: m.ApiObservabilityPage })),
  ),
});

const adminTriggerWorkflowsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/trigger-workflows",
  component: lazyRouteComponent(() =>
    import("@/features/trigger-workflows").then((m) => ({ default: m.TriggerWorkflowPage })),
  ),
});

const adminBackupsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/backups",
  component: lazyRouteComponent(() =>
    import("@/features/backup-recovery").then((m) => ({ default: m.BackupDashboard })),
  ),
});

const adminBudgetsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/budgets",
  component: lazyRouteComponent(() =>
    import("@/app/pages/BudgetPage").then((m) => ({ default: m.BudgetPage })),
  ),
});

const adminGpuSchedulingRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/gpu-scheduling",
  component: lazyRouteComponent(() =>
    import("@/features/gpu-power").then((m) => ({ default: m.PowerDashboard })),
  ),
});

const adminDiskUsageRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/disk-usage",
  component: lazyRouteComponent(() =>
    import("@/features/storage-visualizer").then((m) => ({ default: m.StorageVisualizerPage })),
  ),
});

const adminFailureAnalyticsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/failure-analytics",
  component: lazyRouteComponent(() =>
    import("@/app/pages/FailureAnalyticsPage").then((m) => ({ default: m.FailureAnalyticsPage })),
  ),
});

const adminImporterRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/importer",
  component: lazyRouteComponent(() =>
    import("@/app/pages/ImporterPage").then((m) => ({ default: m.ImporterPage })),
  ),
});

const adminConfigImportRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/config-import",
  component: lazyRouteComponent(() =>
    import("@/app/pages/AdminConfigImportPage").then((m) => ({
      default: m.AdminConfigImportPage,
    })),
  ),
});

const adminQueueRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/queue",
  component: lazyRouteComponent(() =>
    import("@/app/pages/QueueManagerPage").then((m) => ({
      default: m.QueueManagerPage,
    })),
  ),
});

const adminInfrastructureRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/infrastructure",
  component: lazyRouteComponent(() =>
    import("@/app/pages/InfrastructureControlPanelPage"),
  ),
});

const adminHealthRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/health",
  component: lazyRouteComponent(() =>
    import("@/app/pages/SystemHealthPage"),
  ),
});

const adminOutputProfilesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/output-profiles",
  component: lazyRouteComponent(() =>
    import("@/app/pages/OutputProfilesPage").then((m) => ({
      default: m.OutputProfilesPage,
    })),
  ),
});

/* --------------------------------------------------------------------------
   Settings routes
   -------------------------------------------------------------------------- */

const settingsLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "settings",
  component: Outlet,
});

const shortcutsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "/settings/shortcuts",
  component: lazyRouteComponent(() =>
    import("@/features/shortcuts").then((m) => ({ default: m.KeymapEditor })),
  ),
});

const wikiRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "/settings/wiki",
  component: lazyRouteComponent(() =>
    import("@/app/pages/WikiPage").then((m) => ({ default: m.WikiPage })),
  ),
});

/* --------------------------------------------------------------------------
   Catch-all 404
   -------------------------------------------------------------------------- */

const notFoundRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "$",
  component: lazyRouteComponent(() =>
    import("@/app/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
  ),
});

/* --------------------------------------------------------------------------
   Route tree
   -------------------------------------------------------------------------- */

export const routeTree = rootRoute.addChildren([
  loginRoute,
  externalReviewRoute,
  authenticatedRoute.addChildren([
    indexRoute,
    performanceRoute,
    dashboardCustomizeRoute,

    projectsLayoutRoute.addChildren([
      projectListRoute,
      projectDetailRoute,
      characterDetailRoute,
      assignmentDashboardRoute,
    ]),

    contentLayoutRoute.addChildren([
      scenesRoute,
      charactersRoute,
      libraryRoute,
      storyboardRoute,
      imagesRoute,
      sceneCatalogueRoute,
      characterDashboardRoute,
      contactSheetRoute,
      duplicatesRoute,
    ]),

    productionLayoutRoute.addChildren([
      queueRoute,
      generationRoute,
      testShotsRoute,
      batchRoute,
      deliveryRoute,
      checkpointsRoute,
      debuggerRoute,
      renderTimelineRoute,
    ]),

    myReviewsRoute,

    reviewLayoutRoute.addChildren([
      annotationsRoute,
      reviewNotesRoute,
      productionNotesRoute,
      qaGatesRoute,
      cinemaRoute,
      temporalRoute,
    ]),

    toolsLayoutRoute.addChildren([
      promptsRoute,
      workflowsRoute,
      configRoute,
      presetsRoute,
      searchRoute,
      branchingRoute,
      activityConsoleRoute,
      characterIngestRoute,
      batchMetadataRoute,
      pipelineHooksRoute,
      workflowImportRoute,
      undoRoute,
    ]),

    adminLayoutRoute.addChildren([
      adminHardwareRoute,
      adminWorkersRoute,
      adminIntegrityRoute,
      adminAuditRoute,
      adminReclamationRoute,
      adminStorageRoute,
      adminDownloadsRoute,
      adminApiKeysRoute,
      adminExtensionsRoute,
      adminMaintenanceRoute,
      adminOnboardingRoute,
      adminLegacyImportRoute,
      adminNamingRoute,
      adminReadinessRoute,
      adminSettingsRoute,
      adminThemesRoute,
      adminCloudGpusRoute,
      adminJobSchedulingRoute,
      adminSessionManagementRoute,
      adminWebhookTestingRoute,
      adminApiObservabilityRoute,
      adminTriggerWorkflowsRoute,
      adminBackupsRoute,
      adminBudgetsRoute,
      adminGpuSchedulingRoute,
      adminDiskUsageRoute,
      adminFailureAnalyticsRoute,
      adminImporterRoute,
      adminConfigImportRoute,
      adminQueueRoute,
      adminInfrastructureRoute,
      adminHealthRoute,
      adminOutputProfilesRoute,
    ]),

    settingsLayoutRoute.addChildren([shortcutsRoute, wikiRoute]),

    notFoundRoute,
  ]),
]);

export const basepath = "/x121";

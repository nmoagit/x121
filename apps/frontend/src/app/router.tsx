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
  path: "/content/characters",
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

const sceneTypesRoute = createRoute({
  getParentRoute: () => contentLayoutRoute,
  path: "/content/scene-types",
  component: lazyRouteComponent(() =>
    import("@/app/pages/SceneTypesPage").then((m) => ({ default: m.SceneTypesPage })),
  ),
});

const sceneCatalogRoute = createRoute({
  getParentRoute: () => contentLayoutRoute,
  path: "/content/scene-catalog",
  component: lazyRouteComponent(() =>
    import("@/app/pages/SceneCatalogPage").then((m) => ({ default: m.SceneCatalogPage })),
  ),
});

const characterDashboardRoute = createRoute({
  getParentRoute: () => contentLayoutRoute,
  path: "/content/character-dashboard",
  component: lazyRouteComponent(() =>
    import("@/app/pages/CharacterDashboardPage").then((m) => ({
      default: m.CharacterDashboardPage,
    })),
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

/* --------------------------------------------------------------------------
   Review routes
   -------------------------------------------------------------------------- */

const reviewLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "review",
  component: Outlet,
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

const adminReadinessRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/readiness",
  component: lazyRouteComponent(() =>
    import("@/app/pages/ReadinessPage").then((m) => ({ default: m.ReadinessPage })),
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
  authenticatedRoute.addChildren([
    indexRoute,
    performanceRoute,

    contentLayoutRoute.addChildren([
      scenesRoute,
      charactersRoute,
      libraryRoute,
      storyboardRoute,
      imagesRoute,
      sceneTypesRoute,
      sceneCatalogRoute,
      characterDashboardRoute,
    ]),

    productionLayoutRoute.addChildren([
      queueRoute,
      generationRoute,
      testShotsRoute,
      batchRoute,
      deliveryRoute,
      checkpointsRoute,
    ]),

    reviewLayoutRoute.addChildren([
      annotationsRoute,
      reviewNotesRoute,
      productionNotesRoute,
      qaGatesRoute,
      cinemaRoute,
    ]),

    toolsLayoutRoute.addChildren([
      promptsRoute,
      workflowsRoute,
      configRoute,
      presetsRoute,
      searchRoute,
      branchingRoute,
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
      adminReadinessRoute,
    ]),

    settingsLayoutRoute.addChildren([shortcutsRoute, wikiRoute]),

    notFoundRoute,
  ]),
]);

export const basepath = "/x121";

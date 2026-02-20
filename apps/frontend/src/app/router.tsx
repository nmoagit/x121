import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen">
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <div className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
        Trulience Platform
      </h1>
    </div>
  ),
});

export const routeTree = rootRoute.addChildren([indexRoute]);

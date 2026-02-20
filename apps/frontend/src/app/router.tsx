import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/features/auth/LoginPage";

/* --------------------------------------------------------------------------
   Root layout
   -------------------------------------------------------------------------- */

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen">
      <Outlet />
    </div>
  ),
});

/* --------------------------------------------------------------------------
   Public routes
   -------------------------------------------------------------------------- */

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

/* --------------------------------------------------------------------------
   Protected routes
   -------------------------------------------------------------------------- */

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <ProtectedRoute>
      <div className="flex h-screen items-center justify-center">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          Trulience Platform
        </h1>
      </div>
    </ProtectedRoute>
  ),
});

/* --------------------------------------------------------------------------
   Route tree
   -------------------------------------------------------------------------- */

export const routeTree = rootRoute.addChildren([loginRoute, indexRoute]);

import { Outlet } from "@tanstack/react-router";

import { ProtectedRoute } from "@/components/ProtectedRoute";

export function AdminGuard() {
  return (
    <ProtectedRoute requiredRole="admin">
      <Outlet />
    </ProtectedRoute>
  );
}

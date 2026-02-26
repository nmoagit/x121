import { Navigate } from "@tanstack/react-router";

import { Spinner } from "@/components/primitives";
import { useAuthStore } from "@/stores/auth-store";
import type { UserRole } from "@/stores/auth-store";
import type { ReactNode } from "react";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ProtectedRouteProps {
  /** If set, the user's role must match (admins bypass all role checks). */
  requiredRole?: UserRole;
  children: ReactNode;
}

/* --------------------------------------------------------------------------
   Role checking
   -------------------------------------------------------------------------- */

export function hasAccess(userRole: UserRole, requiredRole?: UserRole): boolean {
  if (!requiredRole) return true;
  if (userRole === "admin") return true;
  return userRole === requiredRole;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ProtectedRoute({ requiredRole, children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" />;
  }

  if (!hasAccess(user.role, requiredRole)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2">
        <p className="text-lg font-semibold text-[var(--color-text-primary)]">
          Access Denied
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

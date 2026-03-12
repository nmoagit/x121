import { Outlet, useLocation } from "@tanstack/react-router";

import { Header } from "@/app/Header";
import { PageGuideBanner } from "@/app/PageGuideBanner";
import { Sidebar } from "@/app/Sidebar";
import { StatusFooter } from "@/app/StatusFooter";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ActivityConsoleDrawer } from "@/features/activity-console/ActivityConsoleDrawer";

export function AppShell() {
  const { pathname } = useLocation();

  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            <PageGuideBanner key={pathname} />
            <Outlet />
          </main>
          <ActivityConsoleDrawer />
          <StatusFooter />
        </div>
      </div>
    </ProtectedRoute>
  );
}

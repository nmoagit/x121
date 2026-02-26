import { Outlet } from "@tanstack/react-router";

import { Header } from "@/app/Header";
import { Sidebar } from "@/app/Sidebar";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export function AppShell() {
  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            <Outlet />
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

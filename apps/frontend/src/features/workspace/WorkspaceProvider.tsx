/**
 * Workspace state provider component (PRD-04).
 *
 * Loads the user's workspace state from the server after authentication,
 * hydrates the Zustand store, and shows a loading skeleton while fetching.
 * Falls back to defaults if the server request fails.
 */

import { useEffect } from "react";

import { Spinner } from "@/components/primitives/Spinner";
import { useAuthStore } from "@/stores/auth-store";

import { detectDeviceType } from "./deviceDetection";
import { useWorkspaceQuery, useWorkspaceStore } from "./hooks/use-workspace";
import { useAutoSave } from "./useAutoSave";

function WorkspaceLoadingSkeleton() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--color-surface-primary)]">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <span className="text-sm text-[var(--color-text-muted)]">
          Restoring workspace...
        </span>
      </div>
    </div>
  );
}

interface WorkspaceProviderProps {
  children: React.ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoaded = useWorkspaceStore((s) => s.isLoaded);
  const hydrateFromServer = useWorkspaceStore((s) => s.hydrateFromServer);
  const reset = useWorkspaceStore((s) => s.reset);

  const deviceType = detectDeviceType();
  const { data, isSuccess, isError } = useWorkspaceQuery(deviceType);

  // Hydrate the Zustand store when server data arrives.
  useEffect(() => {
    if (isAuthenticated && isSuccess && data && !isLoaded) {
      hydrateFromServer(data);
    }
  }, [isAuthenticated, isSuccess, data, isLoaded, hydrateFromServer]);

  // Fall back to defaults if the load fails.
  useEffect(() => {
    if (isAuthenticated && isError && !isLoaded) {
      reset();
      // Mark as loaded with defaults so the UI can render.
      useWorkspaceStore.setState({ isLoaded: true });
    }
  }, [isAuthenticated, isError, isLoaded, reset]);

  // Reset store when user logs out.
  useEffect(() => {
    if (!isAuthenticated && isLoaded) {
      reset();
    }
  }, [isAuthenticated, isLoaded, reset]);

  // Auto-save when dirty.
  useAutoSave();

  // Show skeleton during initial load.
  if (isAuthenticated && !isLoaded) {
    return <WorkspaceLoadingSkeleton />;
  }

  return <>{children}</>;
}

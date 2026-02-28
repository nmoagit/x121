/**
 * TanStack Query hooks for session management (PRD-98).
 */

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ActiveSession,
  ActiveSessionPage,
  LoginHistoryPage,
  SessionAnalytics,
  SessionConfig,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const sessionKeys = {
  all: ["sessions"] as const,
  active: () => [...sessionKeys.all, "active"] as const,
  analytics: () => [...sessionKeys.all, "analytics"] as const,
  loginHistory: (filters: Record<string, string>) =>
    [...sessionKeys.all, "login-history", filters] as const,
  configs: () => [...sessionKeys.all, "configs"] as const,
  mine: () => [...sessionKeys.all, "mine"] as const,
};

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Active-sessions polling interval: 10 seconds. */
const SESSION_POLL_MS = 10_000;

/** Heartbeat interval: 60 seconds. */
const HEARTBEAT_MS = 60_000;

/* --------------------------------------------------------------------------
   Admin query hooks
   -------------------------------------------------------------------------- */

/** Fetch all active sessions (paginated). Auto-refreshes every 10s. */
export function useActiveSessions() {
  return useQuery({
    queryKey: sessionKeys.active(),
    queryFn: () => api.get<ActiveSessionPage>("/admin/sessions"),
    refetchInterval: SESSION_POLL_MS,
  });
}

/** Fetch session analytics summary. */
export function useSessionAnalytics() {
  return useQuery({
    queryKey: sessionKeys.analytics(),
    queryFn: () => api.get<SessionAnalytics>("/admin/sessions/analytics"),
  });
}

/** Fetch paginated login history with optional filters. */
export function useLoginHistory(params: Record<string, string>) {
  return useQuery({
    queryKey: sessionKeys.loginHistory(params),
    queryFn: () => {
      const qs = new URLSearchParams(params).toString();
      const path = qs ? `/admin/sessions/login-history?${qs}` : "/admin/sessions/login-history";
      return api.get<LoginHistoryPage>(path);
    },
  });
}

/** Fetch all session config entries. */
export function useSessionConfigs() {
  return useQuery({
    queryKey: sessionKeys.configs(),
    queryFn: () => api.get<SessionConfig[]>("/admin/sessions/config"),
  });
}

/* --------------------------------------------------------------------------
   Admin mutation hooks
   -------------------------------------------------------------------------- */

/** Force-terminate a session by ID. */
export function useForceTerminate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) =>
      api.delete(`/admin/sessions/${sessionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionKeys.active() });
      qc.invalidateQueries({ queryKey: sessionKeys.analytics() });
    },
  });
}

/** Update a session config value by key. */
export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put<SessionConfig>(`/admin/sessions/config/${key}`, { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionKeys.configs() });
    },
  });
}

/* --------------------------------------------------------------------------
   User hooks
   -------------------------------------------------------------------------- */

/** Fetch the current user's sessions. */
export function useMySessions() {
  return useQuery({
    queryKey: sessionKeys.mine(),
    queryFn: () => api.get<ActiveSession[]>("/sessions/me"),
  });
}

/**
 * Send heartbeat POST every 60 seconds while component is mounted.
 * Includes the current route path as `current_view`.
 */
export function useHeartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const sendHeartbeat = () => {
      api
        .post("/sessions/heartbeat", {
          current_view: window.location.pathname,
        })
        .catch(() => {
          // Heartbeat failures are non-critical; silently ignore.
        });
    };

    // Send immediately on mount.
    sendHeartbeat();

    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);
}

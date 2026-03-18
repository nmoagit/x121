import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { FooterStatusData } from "@/app/footer/types";
import type { ReadinessSummary } from "@/features/readiness/types";
import type { Schedule } from "@/features/job-scheduling/types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface ActiveTaskItem {
  job_id: number;
  job_type: string;
  status: string;
  progress_pct: number;
  progress_message: string | null;
  elapsed_seconds: number | null;
  worker_id: number | null;
  submitted_by: number;
  submitted_at: string;
  /** Resolved model name (via scene → character join). */
  character_name?: string | null;
  /** Resolved scene type name (via scene → scene_type join). */
  scene_type_name?: string | null;
  /** Resolved track name (via scene → track join). */
  track_name?: string | null;
}

export interface ProjectProgressItem {
  project_id: number;
  project_name: string;
  scenes_approved: number;
  scenes_total: number;
  progress_pct: number;
  status_color: string;
  /** Model readiness — counts per state (optional, returned by enhanced endpoint). */
  model_count?: number;
  models_ready?: number;
  /** Seed image coverage (optional). */
  images_uploaded?: number;
  images_total?: number;
  /** Metadata status (optional). */
  metadata_approved?: number;
  metadata_total?: number;
}

export interface DiskHealthData {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  usage_pct: number;
  warning_threshold: number;
  critical_threshold: number;
}

export interface ActivityFeedItem {
  id: number;
  event_type: string;
  category: string;
  source_entity_type: string | null;
  source_entity_id: number | null;
  actor_user_id: number | null;
  actor_name: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface DashboardConfig {
  id: number;
  user_id: number;
  layout_json: unknown;
  widget_settings_json: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface SaveDashboardConfigInput {
  layout_json: unknown;
  widget_settings_json: Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

const dashboardKeys = {
  all: ["dashboard"] as const,
  activeTasks: () => [...dashboardKeys.all, "active-tasks"] as const,
  projectProgress: () => [...dashboardKeys.all, "project-progress"] as const,
  diskHealth: () => [...dashboardKeys.all, "disk-health"] as const,
  activityFeed: (params?: { limit?: number; offset?: number; category?: string }) =>
    [...dashboardKeys.all, "activity-feed", params] as const,
  config: () => [...dashboardKeys.all, "config"] as const,
};

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Disk health polling interval: 60 seconds. */
const DISK_POLL_MS = 60_000;

/** Widget data polling interval: 30 seconds. */
const WIDGET_POLL_MS = 30_000;

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Fetches active, pending, and recently completed jobs for the widget. */
export function useActiveTasks() {
  return useQuery({
    queryKey: dashboardKeys.activeTasks(),
    queryFn: () =>
      api.get<ActiveTaskItem[]>("/dashboard/widgets/active-tasks?recent_completed=10"),
    refetchInterval: WIDGET_POLL_MS,
  });
}

/** Fetches per-project scene completion progress. */
export function useProjectProgress() {
  return useQuery({
    queryKey: dashboardKeys.projectProgress(),
    queryFn: () => api.get<ProjectProgressItem[]>("/dashboard/widgets/project-progress"),
    refetchInterval: WIDGET_POLL_MS,
  });
}

/** Fetches filesystem disk usage stats. Polls every 60s. */
export function useDiskHealth() {
  return useQuery({
    queryKey: dashboardKeys.diskHealth(),
    queryFn: () => api.get<DiskHealthData>("/dashboard/widgets/disk-health"),
    refetchInterval: DISK_POLL_MS,
  });
}

/** Fetches the chronological activity feed. */
export function useActivityFeed(params?: {
  limit?: number;
  offset?: number;
  category?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  if (params?.category) searchParams.set("category", params.category);

  const qs = searchParams.toString();
  const path = `/dashboard/widgets/activity-feed${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: dashboardKeys.activityFeed(params),
    queryFn: () => api.get<ActivityFeedItem[]>(path),
    refetchInterval: WIDGET_POLL_MS,
  });
}

/** Fetches the current user's dashboard config. */
export function useDashboardConfig() {
  return useQuery({
    queryKey: dashboardKeys.config(),
    queryFn: () => api.get<DashboardConfig>("/user/dashboard"),
  });
}

/** Saves the current user's dashboard config. */
export function useSaveDashboardConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveDashboardConfigInput) =>
      api.put<DashboardConfig>("/user/dashboard", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.config() });
    },
  });
}

/* --------------------------------------------------------------------------
   Dashboard-specific widget hooks
   -------------------------------------------------------------------------- */

/** Fetches readiness summary across all projects for the dashboard widget. */
export function useReadinessSummaryWidget() {
  return useQuery({
    queryKey: [...dashboardKeys.all, "readiness-summary"],
    queryFn: () => api.get<ReadinessSummary>("/library/characters/readiness-summary"),
    refetchInterval: WIDGET_POLL_MS,
  });
}

/** Fetches active scheduled generations for the dashboard widget. */
export function useScheduledGenerationsWidget() {
  return useQuery({
    queryKey: [...dashboardKeys.all, "scheduled-generations"],
    queryFn: () => api.get<Schedule[]>("/schedules?is_active=true"),
    refetchInterval: WIDGET_POLL_MS,
  });
}

/** Fetches infrastructure status (footer data) for the admin dashboard widget. */
export function useInfraStatusWidget() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  return useQuery({
    queryKey: ["status", "footer"],
    queryFn: () => api.get<FooterStatusData>("/status/footer"),
    refetchInterval: WIDGET_POLL_MS,
    enabled: isAdmin,
  });
}

/** Whether the current user is an admin. */
export function useIsAdmin() {
  const user = useAuthStore((s) => s.user);
  return user?.role === "admin";
}

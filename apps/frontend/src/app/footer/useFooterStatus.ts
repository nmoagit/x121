/**
 * Combines API-fetched footer status with the existing job status store.
 *
 * - Polls `/status/footer` every 30 s for service health, cloud GPU, and workflow data.
 * - Reads job counts from the shared Zustand store via `useJobStatusAggregator`.
 * - Exposes `isAdmin` so consumers can conditionally render admin-only segments.
 */

import { useQuery } from "@tanstack/react-query";

import { useJobStatusAggregator } from "@/features/job-tray";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

import type { CloudGpuInfo, FooterServices, FooterStatusData, WorkflowInfo } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const POLL_INTERVAL_MS = 30_000;

/* --------------------------------------------------------------------------
   Return type
   -------------------------------------------------------------------------- */

export interface FooterStatus {
  services: FooterServices | null;
  cloudGpu: CloudGpuInfo | null;
  jobs: { running: number; queued: number; overallProgress: number };
  workflows: WorkflowInfo;
  isAdmin: boolean;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useFooterStatus(): FooterStatus {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const jobSummary = useJobStatusAggregator();

  const { data: footerData } = useQuery({
    queryKey: ["status", "footer"],
    queryFn: () => api.get<FooterStatusData>("/status/footer"),
    refetchInterval: POLL_INTERVAL_MS,
  });

  return {
    services: footerData?.services ?? null,
    cloudGpu: footerData?.cloud_gpu ?? null,
    jobs: {
      running: jobSummary.runningCount,
      queued: jobSummary.queuedCount,
      overallProgress: jobSummary.overallProgress,
    },
    workflows: footerData?.workflows ?? { active: 0, current_stage: null },
    isAdmin,
  };
}

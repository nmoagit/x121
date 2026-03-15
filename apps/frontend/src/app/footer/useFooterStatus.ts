/**
 * Polls `/status/footer` every 30s for all footer data:
 * service health, cloud GPU, and job counts.
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

import type { CloudGpuInfo, FooterServices, FooterStatusData } from "./types";

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
  isAdmin: boolean;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useFooterStatus(): FooterStatus {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const { data: footerData } = useQuery({
    queryKey: ["status", "footer"],
    queryFn: () => api.get<FooterStatusData>("/status/footer"),
    refetchInterval: POLL_INTERVAL_MS,
    enabled: user != null,
  });

  return {
    services: footerData?.services ?? null,
    cloudGpu: footerData?.cloud_gpu ?? null,
    jobs: {
      running: footerData?.jobs?.running ?? 0,
      queued: footerData?.jobs?.queued ?? 0,
      overallProgress: footerData?.jobs?.overall_progress ?? 0,
    },
    isAdmin,
  };
}

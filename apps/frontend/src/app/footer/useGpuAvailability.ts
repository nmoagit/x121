/**
 * Exposes whether any GPU instances are currently active.
 *
 * Reads from the footer status query (polled every 30s) so it adds
 * no extra network requests. Use this to show warnings on "Generating"
 * scene cards when no GPUs are available to process the job.
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

import type { FooterStatusData } from "./types";

const POLL_INTERVAL_MS = 30_000;

export function useGpuAvailability(): { hasActiveGpu: boolean; activePods: number } {
  const user = useAuthStore((s) => s.user);

  const { data } = useQuery({
    queryKey: ["status", "footer"],
    queryFn: () => api.get<FooterStatusData>("/status/footer"),
    refetchInterval: POLL_INTERVAL_MS,
    enabled: user != null,
  });

  const activePods = data?.cloud_gpu?.active_pods ?? 0;

  return {
    hasActiveGpu: activePods > 0,
    activePods,
  };
}

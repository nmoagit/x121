/**
 * TanStack Query hooks for Cost & Resource Estimation (PRD-61).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  BatchEstimate,
  EstimateRequest,
  GenerationMetric,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const estimationKeys = {
  all: ["estimation"] as const,
  calibration: (limit?: number) =>
    [...estimationKeys.all, "calibration", limit] as const,
};

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/**
 * POST /estimates — compute a batch estimate for a set of scenes.
 *
 * Returns a `BatchEstimate` with GPU hours, wall-clock time, disk usage,
 * and per-scene breakdowns.
 */
export function useEstimateScenes() {
  return useMutation({
    mutationFn: (input: EstimateRequest) =>
      api.post<BatchEstimate>("/estimates", input),
  });
}

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/**
 * GET /estimates/history — list calibration data (generation metrics).
 *
 * Uses a 5-minute staleTime since calibration data changes infrequently.
 */
export function useCalibrationData(limit?: number) {
  const params = limit ? `?limit=${limit}` : "";
  return useQuery({
    queryKey: estimationKeys.calibration(limit),
    queryFn: () =>
      api.get<GenerationMetric[]>(`/estimates/history${params}`),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

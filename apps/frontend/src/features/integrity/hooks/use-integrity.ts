/**
 * TanStack Query hooks for System Integrity & Repair Tools (PRD-43).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateModelChecksum,
  IntegrityScan,
  ModelChecksum,
  UpdateModelChecksum,
  WorkerReport,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const integrityKeys = {
  all: ["integrity"] as const,
  scans: () => [...integrityKeys.all, "scans"] as const,
  workerReport: (workerId: number) =>
    [...integrityKeys.all, "worker-report", workerId] as const,
  checksums: () => [...integrityKeys.all, "checksums"] as const,
  checksumsByType: (modelType: string) =>
    [...integrityKeys.all, "checksums", modelType] as const,
};

/* --------------------------------------------------------------------------
   Scan queries
   -------------------------------------------------------------------------- */

/** Fetches all integrity scans with pagination. */
export function useIntegrityScans(limit = 50, offset = 0) {
  return useQuery({
    queryKey: [...integrityKeys.scans(), limit, offset],
    queryFn: () =>
      api.get<IntegrityScan[]>(
        `/admin/integrity-scans?limit=${limit}&offset=${offset}`,
      ),
  });
}

/** Fetches the latest integrity report for a specific worker. */
export function useWorkerReport(workerId: number) {
  return useQuery({
    queryKey: integrityKeys.workerReport(workerId),
    queryFn: () =>
      api.get<WorkerReport>(`/admin/integrity-scans/${workerId}`),
    enabled: workerId > 0,
  });
}

/* --------------------------------------------------------------------------
   Scan mutations
   -------------------------------------------------------------------------- */

/** Start a new integrity scan. */
export function useStartScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { worker_id: number; scan_type: string }) =>
      api.post<IntegrityScan>("/admin/integrity-scans", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: integrityKeys.scans(),
      });
      queryClient.invalidateQueries({
        queryKey: integrityKeys.workerReport(variables.worker_id),
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Repair mutations
   -------------------------------------------------------------------------- */

/** Trigger a full repair for a worker. */
export function useRepairWorker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workerId: number) =>
      api.post<IntegrityScan>(`/admin/repair/${workerId}`),
    onSuccess: (_data, workerId) => {
      queryClient.invalidateQueries({
        queryKey: integrityKeys.scans(),
      });
      queryClient.invalidateQueries({
        queryKey: integrityKeys.workerReport(workerId),
      });
    },
  });
}

/** Trigger model sync for a worker. */
export function useSyncModels() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workerId: number) =>
      api.post<IntegrityScan>(`/admin/repair/${workerId}/sync-models`),
    onSuccess: (_data, workerId) => {
      queryClient.invalidateQueries({
        queryKey: integrityKeys.workerReport(workerId),
      });
    },
  });
}

/** Trigger node installation for a worker. */
export function useInstallNodes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workerId: number) =>
      api.post<IntegrityScan>(`/admin/repair/${workerId}/install-nodes`),
    onSuccess: (_data, workerId) => {
      queryClient.invalidateQueries({
        queryKey: integrityKeys.workerReport(workerId),
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Checksum queries
   -------------------------------------------------------------------------- */

/** Fetches all model checksums with pagination. */
export function useModelChecksums(limit = 50, offset = 0) {
  return useQuery({
    queryKey: [...integrityKeys.checksums(), limit, offset],
    queryFn: () =>
      api.get<ModelChecksum[]>(
        `/admin/model-checksums?limit=${limit}&offset=${offset}`,
      ),
  });
}

/* --------------------------------------------------------------------------
   Checksum mutations
   -------------------------------------------------------------------------- */

/** Create a new model checksum record. */
export function useCreateChecksum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateModelChecksum) =>
      api.post<ModelChecksum>("/admin/model-checksums", input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: integrityKeys.checksums(),
      });
    },
  });
}

/** Update an existing model checksum. */
export function useUpdateChecksum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: UpdateModelChecksum & { id: number }) =>
      api.put<ModelChecksum>(`/admin/model-checksums/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: integrityKeys.checksums(),
      });
    },
  });
}

/** Delete a model checksum by ID. */
export function useDeleteChecksum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/admin/model-checksums/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: integrityKeys.checksums(),
      });
    },
  });
}

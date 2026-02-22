/**
 * TanStack Query hooks for external & tiered storage management (PRD-48).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CreateStorageBackend,
  CreateStorageMigration,
  CreateTieringPolicy,
  StorageBackend,
  StorageMigration,
  TieringCandidate,
  TieringPolicy,
  UpdateStorageBackend,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

const storageKeys = {
  all: ["storage"] as const,
  backends: () => [...storageKeys.all, "backends"] as const,
  policies: () => [...storageKeys.all, "policies"] as const,
  migration: (id: number) => [...storageKeys.all, "migration", id] as const,
};

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Backend list polling interval: 30 seconds. */
const BACKEND_POLL_MS = 30_000;

/** Migration polling interval: 5 seconds (active transfer). */
const MIGRATION_POLL_MS = 5_000;

/* --------------------------------------------------------------------------
   Backend hooks
   -------------------------------------------------------------------------- */

/** Fetch all storage backends. Auto-refreshes every 30s. */
export function useStorageBackends() {
  return useQuery({
    queryKey: storageKeys.backends(),
    queryFn: () => api.get<StorageBackend[]>("/admin/storage/backends"),
    refetchInterval: BACKEND_POLL_MS,
  });
}

/** Create a new storage backend. */
export function useCreateBackend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStorageBackend) =>
      api.post<StorageBackend>("/admin/storage/backends", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: storageKeys.backends() });
    },
  });
}

/** Update a storage backend. */
export function useUpdateBackend(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStorageBackend) =>
      api.put<StorageBackend>(`/admin/storage/backends/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: storageKeys.backends() });
    },
  });
}

/** Decommission a storage backend. */
export function useDecommissionBackend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<void>(`/admin/storage/backends/${id}/decommission`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: storageKeys.backends() });
    },
  });
}

/* --------------------------------------------------------------------------
   Policy hooks
   -------------------------------------------------------------------------- */

/** Fetch all tiering policies. */
export function useTieringPolicies() {
  return useQuery({
    queryKey: storageKeys.policies(),
    queryFn: () => api.get<TieringPolicy[]>("/admin/storage/policies"),
  });
}

/** Create a tiering policy. */
export function useCreatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTieringPolicy) =>
      api.post<TieringPolicy>("/admin/storage/policies", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: storageKeys.policies() });
    },
  });
}

/** Simulate a tiering policy (dry run). */
export function useSimulatePolicy() {
  return useMutation({
    mutationFn: (input: {
      entity_type: string;
      source_tier: string;
      age_threshold_days?: number;
      access_threshold_days?: number;
    }) => api.post<TieringCandidate[]>("/admin/storage/policies/simulate", input),
  });
}

/* --------------------------------------------------------------------------
   Migration hooks
   -------------------------------------------------------------------------- */

/** Start a new storage migration. */
export function useStartMigration() {
  return useMutation({
    mutationFn: (input: CreateStorageMigration) =>
      api.post<StorageMigration>("/admin/storage/migrations", input),
  });
}

/** Get a migration by ID. Polls every 5s when enabled. */
export function useMigration(id: number, enabled = true) {
  return useQuery({
    queryKey: storageKeys.migration(id),
    queryFn: () => api.get<StorageMigration>(`/admin/storage/migrations/${id}`),
    enabled: enabled && id > 0,
    refetchInterval: MIGRATION_POLL_MS,
  });
}

/** Roll back a migration. */
export function useRollbackMigration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<StorageMigration>(`/admin/storage/migrations/${id}/rollback`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: storageKeys.migration(id) });
    },
  });
}

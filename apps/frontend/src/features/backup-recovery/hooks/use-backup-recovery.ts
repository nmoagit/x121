/**
 * TanStack Query hooks for Backup & Disaster Recovery (PRD-81).
 *
 * Follows the key factory pattern used throughout the codebase.
 *
 * Backend route mounts:
 * - /admin/backups              -> backup CRUD + trigger + verify
 * - /admin/backup-schedules     -> schedule CRUD
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  Backup,
  BackupSchedule,
  BackupSummary,
  CreateBackup,
  CreateBackupSchedule,
  UpdateBackupSchedule,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factories
   -------------------------------------------------------------------------- */

export const backupKeys = {
  all: ["backup-recovery"] as const,
  backups: (params?: Record<string, string>) =>
    [...backupKeys.all, "backups", params] as const,
  backup: (id: number) => [...backupKeys.all, "backup", id] as const,
  summary: () => [...backupKeys.all, "summary"] as const,
  schedules: () => [...backupKeys.all, "schedules"] as const,
  schedule: (id: number) => [...backupKeys.all, "schedule", id] as const,
};

/* --------------------------------------------------------------------------
   Backup queries
   -------------------------------------------------------------------------- */

/** GET /admin/backups -- list backups with optional query params. */
export function useBackups(params?: Record<string, string>) {
  const search = params
    ? `?${new URLSearchParams(params).toString()}`
    : "";

  return useQuery({
    queryKey: backupKeys.backups(params),
    queryFn: () => api.get<Backup[]>(`/admin/backups${search}`),
  });
}

/** GET /admin/backups/:id -- get single backup. */
export function useBackup(id: number) {
  return useQuery({
    queryKey: backupKeys.backup(id),
    queryFn: () => api.get<Backup>(`/admin/backups/${id}`),
    enabled: id > 0,
  });
}

/** GET /admin/backups/summary -- aggregate backup stats (auto-refresh 30s). */
export function useBackupSummary() {
  return useQuery({
    queryKey: backupKeys.summary(),
    queryFn: () => api.get<BackupSummary>("/admin/backups/summary"),
    refetchInterval: 30_000,
  });
}

/* --------------------------------------------------------------------------
   Backup mutations
   -------------------------------------------------------------------------- */

/** POST /admin/backups -- trigger a manual backup. */
export function useTriggerBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBackup) =>
      api.post<Backup>("/admin/backups", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.all });
    },
  });
}

/** POST /admin/backups/:id/verify -- verify a completed backup. */
export function useVerifyBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<Backup>(`/admin/backups/${id}/verify`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.all });
    },
  });
}

/** DELETE /admin/backups/:id -- delete a backup. */
export function useDeleteBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/backups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Schedule queries
   -------------------------------------------------------------------------- */

/** GET /admin/backup-schedules -- list all backup schedules. */
export function useBackupSchedules() {
  return useQuery({
    queryKey: backupKeys.schedules(),
    queryFn: () => api.get<BackupSchedule[]>("/admin/backup-schedules"),
  });
}

/** GET /admin/backup-schedules/:id -- get single schedule. */
export function useBackupSchedule(id: number) {
  return useQuery({
    queryKey: backupKeys.schedule(id),
    queryFn: () => api.get<BackupSchedule>(`/admin/backup-schedules/${id}`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Schedule mutations
   -------------------------------------------------------------------------- */

/** POST /admin/backup-schedules -- create a new schedule. */
export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBackupSchedule) =>
      api.post<BackupSchedule>("/admin/backup-schedules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.schedules() });
    },
  });
}

/** PUT /admin/backup-schedules/:id -- update an existing schedule. */
export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateBackupSchedule }) =>
      api.put<BackupSchedule>(`/admin/backup-schedules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.schedules() });
    },
  });
}

/** DELETE /admin/backup-schedules/:id -- delete a schedule. */
export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/admin/backup-schedules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.schedules() });
    },
  });
}

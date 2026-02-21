/**
 * Collaboration hooks for entity locks and user presence (PRD-11).
 *
 * Uses TanStack Query with a key factory pattern for consistent cache
 * management and invalidation.
 */

import { useEffect, useRef } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  AcquireLockRequest,
  EntityLock,
  LockActionRequest,
  UserPresence,
} from "../types";
import { LOCK_EXTEND_INTERVAL_MS } from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const collaborationKeys = {
  all: ["collaboration"] as const,
  locks: () => [...collaborationKeys.all, "locks"] as const,
  lock: (entityType: string, entityId: number) =>
    [...collaborationKeys.locks(), entityType, entityId] as const,
  presence: () => [...collaborationKeys.all, "presence"] as const,
  presenceFor: (entityType: string, entityId: number) =>
    [...collaborationKeys.presence(), entityType, entityId] as const,
};

/* --------------------------------------------------------------------------
   Lock Hooks
   -------------------------------------------------------------------------- */

/** Fetch the current lock status for an entity. */
export function useLockStatus(entityType: string, entityId: number) {
  return useQuery({
    queryKey: collaborationKeys.lock(entityType, entityId),
    queryFn: () =>
      api.get<EntityLock | null>(
        `/collaboration/locks/${entityType}/${entityId}`,
      ),
    enabled: entityId > 0,
    refetchInterval: 30_000, // Poll every 30s for lock state changes.
  });
}

/** Acquire a lock on an entity. */
export function useAcquireLock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AcquireLockRequest) =>
      api.post<EntityLock>("/collaboration/locks/acquire", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.lock(
          variables.entity_type,
          variables.entity_id,
        ),
      });
    },
  });
}

/** Release a held lock. */
export function useReleaseLock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LockActionRequest) =>
      api.post<{ released: boolean }>("/collaboration/locks/release", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.lock(
          variables.entity_type,
          variables.entity_id,
        ),
      });
    },
  });
}

/** Extend the expiration of a held lock. */
export function useExtendLock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LockActionRequest) =>
      api.post<EntityLock>("/collaboration/locks/extend", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.lock(
          variables.entity_type,
          variables.entity_id,
        ),
      });
    },
  });
}

/**
 * Manage a lock on an entity with automatic extension.
 *
 * When `isLockHolder` is `true`, an interval timer automatically extends
 * the lock before expiration. Call `acquire` to take the lock and `release`
 * to give it up.
 */
export function useLock(entityType: string, entityId: number) {
  const status = useLockStatus(entityType, entityId);
  const acquireMutation = useAcquireLock();
  const releaseMutation = useReleaseLock();
  const extendMutation = useExtendLock();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const acquire = () =>
    acquireMutation.mutate({
      entity_type: entityType,
      entity_id: entityId,
    });

  const release = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    releaseMutation.mutate({
      entity_type: entityType,
      entity_id: entityId,
    });
  };

  // Auto-extend the lock periodically while the user holds it.
  useEffect(() => {
    if (acquireMutation.isSuccess && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        extendMutation.mutate({
          entity_type: entityType,
          entity_id: entityId,
        });
      }, LOCK_EXTEND_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [acquireMutation.isSuccess, entityType, entityId, extendMutation]);

  return {
    lock: status.data ?? null,
    isLoading: status.isPending,
    acquire,
    release,
    isAcquiring: acquireMutation.isPending,
    isReleasing: releaseMutation.isPending,
    acquireError: acquireMutation.error,
  };
}

/* --------------------------------------------------------------------------
   Presence Hooks
   -------------------------------------------------------------------------- */

/** Fetch the list of users currently viewing an entity. */
export function usePresence(entityType: string, entityId: number) {
  return useQuery({
    queryKey: collaborationKeys.presenceFor(entityType, entityId),
    queryFn: () =>
      api.get<UserPresence[]>(
        `/collaboration/presence/${entityType}/${entityId}`,
      ),
    enabled: entityId > 0,
    refetchInterval: 15_000, // Poll every 15s for presence updates.
  });
}

/**
 * TanStack Query hooks for delivery destinations (PRD-039 Amendment A.1).
 *
 * Provides CRUD operations for per-project delivery destinations.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CreateDeliveryDestination,
  DeliveryDestination,
  UpdateDeliveryDestination,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const destinationKeys = {
  list: (projectId: number) =>
    ["delivery", "destinations", { projectId }] as const,
  detail: (projectId: number, id: number) =>
    ["delivery", "destinations", "detail", { projectId, id }] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch all active delivery destinations for a project. */
export function useDeliveryDestinations(projectId: number) {
  return useQuery({
    queryKey: destinationKeys.list(projectId),
    queryFn: () =>
      api.get<DeliveryDestination[]>(
        `/projects/${projectId}/delivery-destinations`,
      ),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new delivery destination. */
export function useCreateDestination(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDeliveryDestination) =>
      api.post<DeliveryDestination>(
        `/projects/${projectId}/delivery-destinations`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: destinationKeys.list(projectId),
      });
    },
  });
}

/** Update an existing delivery destination. */
export function useUpdateDestination(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateDeliveryDestination }) =>
      api.put<DeliveryDestination>(
        `/projects/${projectId}/delivery-destinations/${id}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: destinationKeys.list(projectId),
      });
    },
  });
}

/** Delete a delivery destination. */
export function useDeleteDestination(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/projects/${projectId}/delivery-destinations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: destinationKeys.list(projectId),
      });
    },
  });
}

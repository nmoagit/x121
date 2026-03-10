/**
 * Combined query hook that fetches instances across all cloud providers
 * and enriches them with ComfyUI connection status (PRD-131).
 *
 * Merges cloud instance data with infrastructure status to produce
 * a flat list of `EnrichedInstance[]` for the control panel.
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CloudInstance,
  CloudProvider,
} from "@/features/admin/cloud-gpus/hooks/use-cloud-providers";
import type { InfrastructureStatus } from "@/features/generation/hooks/use-infrastructure";
import type { ComfyuiConnectionStatus, EnrichedInstance } from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const infraKeys = {
  all: ["infrastructure"] as const,
  status: () => [...infraKeys.all, "status"] as const,
  allInstances: () => [...infraKeys.all, "all-instances"] as const,
};

/* --------------------------------------------------------------------------
   Helper: resolve ComfyUI connection status for a cloud instance
   -------------------------------------------------------------------------- */

function resolveComfyuiStatus(
  instance: CloudInstance,
  infraStatus: InfrastructureStatus | null,
): { status: ComfyuiConnectionStatus; comfyuiInstanceId: number | null } {
  if (!infraStatus) {
    return { status: "not_registered", comfyuiInstanceId: null };
  }

  const match = infraStatus.comfyui_instances.find((ci) =>
    ci.api_url.includes(instance.ip_address ?? "__no_ip__"),
  );

  if (!match) {
    return { status: "not_registered", comfyuiInstanceId: null };
  }

  if (match.last_connected_at && !match.last_disconnected_at) {
    return { status: "connected", comfyuiInstanceId: match.id };
  }

  if (
    match.last_disconnected_at &&
    match.last_connected_at &&
    match.last_disconnected_at > match.last_connected_at
  ) {
    return { status: "disconnected", comfyuiInstanceId: match.id };
  }

  if (match.is_enabled) {
    return { status: "reconnecting", comfyuiInstanceId: match.id };
  }

  return { status: "disconnected", comfyuiInstanceId: match.id };
}

/* --------------------------------------------------------------------------
   Helper: enrich a cloud instance with provider + ComfyUI data
   -------------------------------------------------------------------------- */

function enrichInstance(
  instance: CloudInstance,
  provider: CloudProvider,
  infraStatus: InfrastructureStatus | null,
): EnrichedInstance {
  const { status: comfyuiStatus, comfyuiInstanceId } = resolveComfyuiStatus(
    instance,
    infraStatus,
  );

  return {
    id: instance.id,
    external_id: instance.external_id,
    name: instance.name,
    provider_id: provider.id,
    provider_name: provider.name,
    provider_type: provider.provider_type,
    gpu_type: null, // GPU type name not available on CloudInstance; resolved by UI if needed
    gpu_count: instance.gpu_count,
    status_id: instance.status_id,
    status_name: resolveStatusName(instance.status_id),
    ip_address: instance.ip_address,
    ssh_port: instance.ssh_port,
    started_at: instance.started_at,
    cost_per_hour_cents: instance.cost_per_hour_cents,
    total_cost_cents: instance.total_cost_cents,
    comfyui_status: comfyuiStatus,
    comfyui_instance_id: comfyuiInstanceId,
    metadata: instance.metadata,
    created_at: instance.created_at,
    updated_at: instance.updated_at,
  };
}

/* --------------------------------------------------------------------------
   Status ID → name mapping
   -------------------------------------------------------------------------- */

const STATUS_NAMES: Record<number, string> = {
  1: "provisioning",
  2: "running",
  3: "stopped",
  4: "terminated",
  5: "error",
};

function resolveStatusName(statusId: number): string {
  return STATUS_NAMES[statusId] ?? "unknown";
}

/* --------------------------------------------------------------------------
   Main hook
   -------------------------------------------------------------------------- */

/** Fetch all instances across all providers, enriched with ComfyUI status. Auto-refreshes every 10s. */
export function useAllInstances(): {
  instances: EnrichedInstance[];
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery({
    queryKey: infraKeys.allInstances(),
    queryFn: async () => {
      const [providers, infraStatus] = await Promise.all([
        api.get<CloudProvider[]>("/admin/cloud-providers"),
        api
          .get<InfrastructureStatus>("/admin/infrastructure/status")
          .catch(() => null),
      ]);

      if (providers.length === 0) {
        return [] as EnrichedInstance[];
      }

      const instancesByProvider = await Promise.all(
        providers.map((p) =>
          api
            .get<CloudInstance[]>(`/admin/cloud-providers/${p.id}/instances`)
            .then((instances) => ({ provider: p, instances }))
            .catch(() => ({ provider: p, instances: [] as CloudInstance[] })),
        ),
      );

      return instancesByProvider.flatMap(({ provider, instances }) =>
        instances.map((inst) => enrichInstance(inst, provider, infraStatus)),
      );
    },
    refetchInterval: 10_000,
  });

  return {
    instances: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}

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
  CloudGpuType,
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

  // Match by cloud_instance_id (most reliable), then by IP or external_id in URL.
  const match =
    infraStatus.comfyui_instances.find(
      (ci) => ci.cloud_instance_id != null && ci.cloud_instance_id === instance.id,
    ) ??
    infraStatus.comfyui_instances.find(
      (ci) =>
        (instance.ip_address && ci.api_url.includes(instance.ip_address)) ||
        ci.api_url.includes(instance.external_id),
    );

  if (!match) {
    return { status: "not_registered", comfyuiInstanceId: null };
  }

  // Determine connection state from timestamps.
  if (match.last_connected_at) {
    // Connected if no disconnect, or last connect is more recent than last disconnect.
    if (!match.last_disconnected_at || match.last_connected_at > match.last_disconnected_at) {
      return { status: "connected", comfyuiInstanceId: match.id };
    }
    // Disconnected: last_disconnected_at > last_connected_at.
    return { status: "disconnected", comfyuiInstanceId: match.id };
  }

  // Never connected — enabled means it's trying to connect.
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
  gpuTypeMap: Map<number, CloudGpuType>,
): EnrichedInstance {
  const { status: comfyuiStatus, comfyuiInstanceId } = resolveComfyuiStatus(
    instance,
    infraStatus,
  );

  const gpuType = gpuTypeMap.get(instance.gpu_type_id);

  return {
    id: instance.id,
    external_id: instance.external_id,
    name: instance.name,
    provider_id: provider.id,
    provider_name: provider.name,
    provider_type: provider.provider_type,
    gpu_type: gpuType?.name ?? null,
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
  2: "starting",
  3: "running",
  4: "stopping",
  5: "stopped",
  6: "terminating",
  7: "terminated",
  8: "error",
};

function resolveStatusName(statusId: number): string {
  return STATUS_NAMES[statusId] ?? "unknown";
}

/* --------------------------------------------------------------------------
   Main hook
   -------------------------------------------------------------------------- */

/** Result from the combined instances + providers query. */
export interface AllInstancesResult {
  instances: EnrichedInstance[];
  providers: CloudProvider[];
  isLoading: boolean;
  error: Error | null;
}

/** Fetch all instances across all providers, enriched with ComfyUI status. Auto-refreshes every 10s. */
export function useAllInstances(includeArchived = false): AllInstancesResult {
  const { data, isLoading, error } = useQuery({
    queryKey: [...infraKeys.allInstances(), { includeArchived }],
    queryFn: async () => {
      const [providers, infraStatus] = await Promise.all([
        api.get<CloudProvider[]>("/admin/cloud-providers"),
        api
          .get<InfrastructureStatus>("/admin/infrastructure/status")
          .catch(() => null),
      ]);

      if (providers.length === 0) {
        return { instances: [] as EnrichedInstance[], providers: [] as CloudProvider[] };
      }

      const suffix = includeArchived ? "?include_archived=true" : "";
      const instancesByProvider = await Promise.all(
        providers.map(async (p) => {
          const [instances, gpuTypes] = await Promise.all([
            api
              .get<CloudInstance[]>(`/admin/cloud-providers/${p.id}/instances${suffix}`)
              .catch(() => [] as CloudInstance[]),
            api
              .get<CloudGpuType[]>(`/admin/cloud-providers/${p.id}/gpu-types`)
              .catch(() => [] as CloudGpuType[]),
          ]);
          return { provider: p, instances, gpuTypes };
        }),
      );

      // Build a global GPU type lookup map.
      const gpuTypeMap = new Map<number, CloudGpuType>();
      for (const { gpuTypes } of instancesByProvider) {
        for (const gt of gpuTypes) {
          gpuTypeMap.set(gt.id, gt);
        }
      }

      const instances = instancesByProvider.flatMap(({ provider, instances: insts }) =>
        insts.map((inst) => enrichInstance(inst, provider, infraStatus, gpuTypeMap)),
      );

      return { instances, providers };
    },
    refetchInterval: 10_000,
  });

  return {
    instances: data?.instances ?? [],
    providers: data?.providers ?? [],
    isLoading,
    error: error as Error | null,
  };
}

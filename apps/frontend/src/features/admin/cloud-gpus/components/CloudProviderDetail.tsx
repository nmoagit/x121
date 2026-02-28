/**
 * Tabbed detail view for a single cloud GPU provider (PRD-114).
 *
 * Tabs: Instances | GPU Types | Scaling Rules | Cost
 */

import { useState } from "react";

import { Spinner } from "@/components/primitives";
import { formatCents, formatDateTime } from "@/lib/format";

import {
  useCloudProvider,
  useInstances,
  useGpuTypes,
  useScalingRules,
  useCostSummary,
  useCostEvents,
  useTestConnection,
  useEmergencyStopProvider,
  useStartInstance,
  useStopInstance,
  useTerminateInstance,
  useSyncGpuTypes,
} from "../hooks/use-cloud-providers";
import { CloudInstanceList } from "./CloudInstanceList";

type Tab = "instances" | "gpu-types" | "scaling" | "cost";

interface Props {
  providerId: number;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "instances", label: "Instances" },
  { id: "gpu-types", label: "GPU Types" },
  { id: "scaling", label: "Scaling Rules" },
  { id: "cost", label: "Cost" },
];

export function CloudProviderDetail({ providerId }: Props) {
  const [tab, setTab] = useState<Tab>("instances");
  const { data: provider, isLoading } = useCloudProvider(providerId);
  const testConnection = useTestConnection(providerId);
  const emergencyStop = useEmergencyStopProvider(providerId);

  if (isLoading || !provider) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            {provider.name}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            {provider.provider_type} &middot; ID {provider.id}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => testConnection.mutate()}
            className="rounded-md border border-[var(--color-border-default)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]"
          >
            {testConnection.isPending ? "Testing..." : "Test Connection"}
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Emergency stop all instances for ${provider.name}?`)) {
                emergencyStop.mutate();
              }
            }}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700"
          >
            Emergency Stop
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border-default)]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm ${
              tab === t.id
                ? "border-b-2 border-[var(--color-action-primary)] font-medium text-[var(--color-text-primary)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {tab === "instances" && <InstancesTab providerId={providerId} />}
        {tab === "gpu-types" && <GpuTypesTab providerId={providerId} />}
        {tab === "scaling" && <ScalingTab providerId={providerId} />}
        {tab === "cost" && <CostTab providerId={providerId} />}
      </div>
    </div>
  );
}

function InstancesTab({ providerId }: { providerId: number }) {
  const { data: instances, isLoading } = useInstances(providerId);
  const startInst = useStartInstance(providerId);
  const stopInst = useStopInstance(providerId);
  const terminateInst = useTerminateInstance(providerId);

  if (isLoading) return <Spinner size="sm" />;
  if (!instances || instances.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No instances</p>;
  }

  return (
    <CloudInstanceList
      instances={instances}
      onStart={(id) => startInst.mutate(id)}
      onStop={(id) => stopInst.mutate(id)}
      onTerminate={(id) => terminateInst.mutate(id)}
    />
  );
}

function GpuTypesTab({ providerId }: { providerId: number }) {
  const { data: types, isLoading } = useGpuTypes(providerId);
  const syncTypes = useSyncGpuTypes(providerId);

  if (isLoading) return <Spinner size="sm" />;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => syncTypes.mutate()}
          className="rounded-md border border-[var(--color-border-default)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]"
        >
          {syncTypes.isPending ? "Syncing..." : "Sync from Provider"}
        </button>
      </div>
      {!types || types.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No GPU types. Click sync to fetch from provider.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-default)] text-left text-xs text-[var(--color-text-muted)]">
              <th className="pb-2">GPU</th>
              <th className="pb-2">VRAM</th>
              <th className="pb-2">Cost/hr</th>
              <th className="pb-2">Max GPUs</th>
              <th className="pb-2">Available</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id} className="border-b border-[var(--color-border-default)]">
                <td className="py-2 font-medium text-[var(--color-text-primary)]">{t.name}</td>
                <td className="py-2 text-[var(--color-text-muted)]">{(t.vram_mb / 1024).toFixed(0)} GB</td>
                <td className="py-2 text-[var(--color-text-muted)]">{formatCents(t.cost_per_hour_cents)}</td>
                <td className="py-2 text-[var(--color-text-muted)]">{t.max_gpu_count}</td>
                <td className="py-2">{t.available ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ScalingTab({ providerId }: { providerId: number }) {
  const { data: rules, isLoading } = useScalingRules(providerId);

  if (isLoading) return <Spinner size="sm" />;
  if (!rules || rules.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No scaling rules configured.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--color-border-default)] text-left text-xs text-[var(--color-text-muted)]">
          <th className="pb-2">GPU Type ID</th>
          <th className="pb-2">Min</th>
          <th className="pb-2">Max</th>
          <th className="pb-2">Queue Threshold</th>
          <th className="pb-2">Cooldown</th>
          <th className="pb-2">Enabled</th>
        </tr>
      </thead>
      <tbody>
        {rules.map((r) => (
          <tr key={r.id} className="border-b border-[var(--color-border-default)]">
            <td className="py-2 text-[var(--color-text-primary)]">{r.gpu_type_id}</td>
            <td className="py-2 text-[var(--color-text-muted)]">{r.min_instances}</td>
            <td className="py-2 text-[var(--color-text-muted)]">{r.max_instances}</td>
            <td className="py-2 text-[var(--color-text-muted)]">{r.queue_threshold}</td>
            <td className="py-2 text-[var(--color-text-muted)]">{r.cooldown_secs}s</td>
            <td className="py-2">{r.enabled ? "Yes" : "No"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CostTab({ providerId }: { providerId: number }) {
  const { data: summary, isLoading: summaryLoading } = useCostSummary(providerId);
  const { data: events, isLoading: eventsLoading } = useCostEvents(providerId);

  if (summaryLoading || eventsLoading) return <Spinner size="sm" />;

  return (
    <div>
      {summary && (
        <div className="mb-4 rounded-lg bg-[var(--color-surface-secondary)] p-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Last 30 days: <span className="font-medium text-[var(--color-text-primary)]">{formatCents(summary.total_cost_cents)}</span>
            {" "}&middot; {summary.event_count} events
          </p>
        </div>
      )}
      {events && events.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-default)] text-left text-xs text-[var(--color-text-muted)]">
              <th className="pb-2">Type</th>
              <th className="pb-2">Amount</th>
              <th className="pb-2">Description</th>
              <th className="pb-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {events.slice(0, 50).map((e) => (
              <tr key={e.id} className="border-b border-[var(--color-border-default)]">
                <td className="py-2 text-[var(--color-text-primary)]">{e.event_type}</td>
                <td className="py-2 text-[var(--color-text-muted)]">{formatCents(e.amount_cents)}</td>
                <td className="py-2 text-[var(--color-text-muted)]">{e.description ?? "—"}</td>
                <td className="py-2 text-[var(--color-text-muted)]">{formatDateTime(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">No cost events recorded.</p>
      )}
    </div>
  );
}

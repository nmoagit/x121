/**
 * Tabbed detail view for a single cloud GPU provider (PRD-114).
 *
 * Tabs: Instances | GPU Types | Scaling Rules | Cost
 */

import { useCallback, useState } from "react";

import { ConfirmModal, Tabs } from "@/components/composite";
import { useToast } from "@/components/composite/useToast";
import { Button, Spinner } from "@/components/primitives";
import { formatCents, formatDateTime, formatRelative } from "@/lib/format";

import {
  useCloudProvider,
  useInstances,
  useGpuTypes,
  useScalingRules,
  useCreateScalingRule,
  useUpdateScalingRule,
  useDeleteScalingRule,
  useScalingEvents,
  useResetScaling,
  useCostSummary,
  useCostEvents,
  useTestConnection,
  useEmergencyStopProvider,
  useStartInstance,
  useStopInstance,
  useTerminateInstance,
  useSyncGpuTypes,
} from "../hooks/use-cloud-providers";
import type { CloudScalingRule, CloudGpuType } from "../hooks/use-cloud-providers";
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
  const [confirmEmergencyStop, setConfirmEmergencyStop] = useState(false);
  const { data: provider, isLoading } = useCloudProvider(providerId);
  const { addToast } = useToast();
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
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
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
          <Button
            variant="secondary"
            size="sm"
            loading={testConnection.isPending}
            onClick={() =>
              testConnection.mutate(undefined, {
                onSuccess: (result) => {
                  const health = result as { healthy?: boolean; latency_ms?: number; message?: string };
                  if (health.healthy) {
                    addToast({
                      message: `Connection OK — ${health.latency_ms ?? "?"}ms latency`,
                      variant: "success",
                    });
                  } else {
                    addToast({
                      message: `Connection failed${health.message ? `: ${health.message}` : " — provider unreachable"}`,
                      variant: "error",
                    });
                  }
                },
                onError: (err) => {
                  addToast({
                    message: `Connection test failed: ${err instanceof Error ? err.message : "Unknown error"}`,
                    variant: "error",
                  });
                },
              })
            }
          >
            Test Connection
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmEmergencyStop(true)}
          >
            Emergency Stop
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-2">
        <Tabs tabs={TABS} activeTab={tab} onTabChange={(id) => setTab(id as Tab)} variant="pill" />
      </div>

      {/* Tab content */}
      <div className="p-4">
        {tab === "instances" && <InstancesTab providerId={providerId} />}
        {tab === "gpu-types" && <GpuTypesTab providerId={providerId} />}
        {tab === "scaling" && <ScalingTab providerId={providerId} />}
        {tab === "cost" && <CostTab providerId={providerId} />}
      </div>

      <ConfirmModal
        open={confirmEmergencyStop}
        onClose={() => setConfirmEmergencyStop(false)}
        title="Emergency Stop"
        confirmLabel="Stop All"
        confirmVariant="danger"
        onConfirm={() => {
          emergencyStop.mutate();
          setConfirmEmergencyStop(false);
        }}
      >
        <p>Emergency stop all instances for {provider.name}?</p>
      </ConfirmModal>
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
        <Button
          variant="secondary"
          size="sm"
          loading={syncTypes.isPending}
          onClick={() => syncTypes.mutate()}
        >
          Sync from Provider
        </Button>
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
  const { data: gpuTypes } = useGpuTypes(providerId);
  const { data: events, isLoading: eventsLoading } = useScalingEvents(providerId);
  const createRule = useCreateScalingRule(providerId);
  const updateRule = useUpdateScalingRule(providerId);
  const deleteRule = useDeleteScalingRule(providerId);
  const resetScaling = useResetScaling(providerId);
  const { addToast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState<number | null>(null);
  const [confirmResetScaling, setConfirmResetScaling] = useState(false);

  const gpuName = useCallback(
    (gpuTypeId: number) =>
      gpuTypes?.find((g: CloudGpuType) => g.id === gpuTypeId)?.name ?? `GPU #${gpuTypeId}`,
    [gpuTypes],
  );

  if (isLoading) return <Spinner size="sm" />;

  return (
    <div className="flex flex-col gap-6">
      {/* Scaling Rules */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Scaling Rules</h3>
          <Button size="sm" variant="secondary" onClick={() => setShowCreate(true)}>
            Add Rule
          </Button>
        </div>

        {showCreate && (
          <ScalingRuleForm
            gpuTypes={gpuTypes ?? []}
            onSave={(data) => {
              createRule.mutate(
                { ...data, budget_limit_cents: data.budget_limit_cents ?? undefined },
                { onSuccess: () => setShowCreate(false) },
              );
            }}
            onCancel={() => setShowCreate(false)}
            saving={createRule.isPending}
          />
        )}

        {!rules || rules.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No scaling rules configured.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rules.map((r) =>
              editingId === r.id ? (
                <ScalingRuleForm
                  key={r.id}
                  gpuTypes={gpuTypes ?? []}
                  initial={r}
                  onSave={(data) => {
                    updateRule.mutate(
                      { ruleId: r.id, data },
                      { onSuccess: () => setEditingId(null) },
                    );
                  }}
                  onCancel={() => setEditingId(null)}
                  saving={updateRule.isPending}
                />
              ) : (
                <ScalingRuleRow
                  key={r.id}
                  rule={r}
                  gpuName={gpuName(r.gpu_type_id)}
                  onEdit={() => setEditingId(r.id)}
                  onDelete={() => setConfirmDeleteRuleId(r.id)}
                  onToggle={() => {
                    updateRule.mutate({
                      ruleId: r.id,
                      data: { enabled: !r.enabled },
                    });
                  }}
                />
              ),
            )}
          </div>
        )}
      </div>

      {/* Decision History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Decision History
          </h3>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConfirmResetScaling(true)}
            loading={resetScaling.isPending}
          >
            Reset History &amp; Cooldown
          </Button>
        </div>
        {eventsLoading ? (
          <Spinner size="sm" />
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No scaling decisions recorded yet. Decisions are evaluated every 30 seconds.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--color-surface-secondary)]">
                <tr className="text-left text-[var(--color-text-muted)]">
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Queue</th>
                  <th className="px-3 py-2">Instances</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t border-[var(--color-border-default)]"
                  >
                    <td className="px-3 py-1.5 text-[var(--color-text-muted)] whitespace-nowrap">
                      {formatRelative(e.created_at)}
                    </td>
                    <td className="px-3 py-1.5">
                      <ScalingActionBadge action={e.action} count={e.instances_changed} />
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-text-muted)]">
                      {e.queue_depth}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-text-muted)]">
                      {e.current_count}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                      {e.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmDeleteRuleId !== null}
        onClose={() => setConfirmDeleteRuleId(null)}
        title="Delete Scaling Rule"
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          if (confirmDeleteRuleId !== null) {
            deleteRule.mutate(confirmDeleteRuleId);
          }
          setConfirmDeleteRuleId(null);
        }}
      >
        <p>Delete this scaling rule?</p>
      </ConfirmModal>

      <ConfirmModal
        open={confirmResetScaling}
        onClose={() => setConfirmResetScaling(false)}
        title="Clear Scaling History"
        confirmLabel="Clear"
        confirmVariant="danger"
        onConfirm={() => {
          resetScaling.mutate(undefined, {
            onSuccess: () => addToast({ message: "Scaling history cleared and cooldowns reset", variant: "success" }),
            onError: (err) => addToast({ message: `Reset failed: ${err instanceof Error ? err.message : "Unknown error"}`, variant: "error" }),
          });
          setConfirmResetScaling(false);
        }}
      >
        <p>Clear all scaling history and reset cooldowns?</p>
      </ConfirmModal>
    </div>
  );
}

/* ---------- Scaling Rule Row ---------- */

function ScalingRuleRow({
  rule,
  gpuName,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule: CloudScalingRule;
  gpuName: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-[var(--radius-md)] border px-4 py-3 text-sm ${
        rule.enabled
          ? "border-[var(--color-border-default)] bg-[var(--color-surface-primary)]"
          : "border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] opacity-60"
      }`}
    >
      <div className="flex-1 grid grid-cols-6 gap-2">
        <div>
          <span className="text-[10px] uppercase text-[var(--color-text-muted)]">GPU</span>
          <p className="font-medium text-[var(--color-text-primary)]">{gpuName}</p>
        </div>
        <div>
          <span className="text-[10px] uppercase text-[var(--color-text-muted)]">Min/Max</span>
          <p className="text-[var(--color-text-secondary)]">
            {rule.min_instances} / {rule.max_instances}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase text-[var(--color-text-muted)]">Queue Threshold</span>
          <p className="text-[var(--color-text-secondary)]">{rule.queue_threshold} jobs</p>
        </div>
        <div>
          <span className="text-[10px] uppercase text-[var(--color-text-muted)]">Cooldown</span>
          <p className="text-[var(--color-text-secondary)]">{rule.cooldown_secs}s</p>
        </div>
        <div>
          <span className="text-[10px] uppercase text-[var(--color-text-muted)]">Budget</span>
          <p className="text-[var(--color-text-secondary)]">
            {rule.budget_limit_cents != null ? formatCents(rule.budget_limit_cents) : "—"}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase text-[var(--color-text-muted)]">Last Scaled</span>
          <p className="text-[var(--color-text-secondary)]">
            {rule.last_scaled_at ? formatRelative(rule.last_scaled_at) : "Never"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="ghost" onClick={onToggle}>
          {rule.enabled ? "Disable" : "Enable"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

/* ---------- Scaling Rule Create/Edit Form ---------- */

interface ScalingRuleFormProps {
  gpuTypes: CloudGpuType[];
  initial?: CloudScalingRule;
  onSave: (data: {
    gpu_type_id: number;
    min_instances: number;
    max_instances: number;
    queue_threshold: number;
    cooldown_secs: number;
    budget_limit_cents: number | null;
    enabled: boolean;
  }) => void;
  onCancel: () => void;
  saving: boolean;
}

function ScalingRuleForm({ gpuTypes, initial, onSave, onCancel, saving }: ScalingRuleFormProps) {
  const [form, setForm] = useState({
    gpu_type_id: initial?.gpu_type_id ?? gpuTypes[0]?.id ?? 0,
    min_instances: initial?.min_instances ?? 0,
    max_instances: initial?.max_instances ?? 1,
    queue_threshold: initial?.queue_threshold ?? 1,
    cooldown_secs: initial?.cooldown_secs ?? 300,
    budget_limit_cents: initial?.budget_limit_cents ?? null as number | null,
    enabled: initial?.enabled ?? true,
  });

  const set = (field: string, value: unknown) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-action-primary)] bg-[var(--color-surface-secondary)] p-4 mb-3">
      <div className="grid grid-cols-4 gap-3 text-sm">
        {!initial && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--color-text-muted)]">GPU Type</span>
            <select
              value={form.gpu_type_id}
              onChange={(e) => set("gpu_type_id", Number(e.target.value))}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1.5 text-sm"
            >
              {gpuTypes.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--color-text-muted)]">Min Instances</span>
          <input
            type="number"
            min={0}
            value={form.min_instances}
            onChange={(e) => set("min_instances", Number(e.target.value))}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--color-text-muted)]">Max Instances</span>
          <input
            type="number"
            min={1}
            value={form.max_instances}
            onChange={(e) => set("max_instances", Number(e.target.value))}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--color-text-muted)]">Queue Threshold</span>
          <input
            type="number"
            min={1}
            value={form.queue_threshold}
            onChange={(e) => set("queue_threshold", Number(e.target.value))}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--color-text-muted)]">Cooldown (seconds)</span>
          <input
            type="number"
            min={0}
            value={form.cooldown_secs}
            onChange={(e) => set("cooldown_secs", Number(e.target.value))}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--color-text-muted)]">Budget Limit (cents)</span>
          <input
            type="number"
            min={0}
            value={form.budget_limit_cents ?? ""}
            onChange={(e) =>
              set("budget_limit_cents", e.target.value ? Number(e.target.value) : null)
            }
            placeholder="No limit"
            className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-end gap-2 pb-1">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
          />
          <span className="text-xs text-[var(--color-text-muted)]">Enabled</span>
        </label>
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={() => onSave(form)} loading={saving}>
          {initial ? "Save" : "Create"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ---------- Action Badge ---------- */

function ScalingActionBadge({ action, count }: { action: string; count: number }) {
  const colors: Record<string, string> = {
    scale_up:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    scale_down:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    provision_error:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    no_change:
      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  const labels: Record<string, string> = {
    scale_up: `Scale Up +${count}`,
    scale_down: `Scale Down -${count}`,
    provision_error: "Provision Error",
    no_change: "No Change",
  };

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
        colors[action] ?? colors.no_change
      }`}
    >
      {labels[action] ?? action}
    </span>
  );
}

function CostTab({ providerId }: { providerId: number }) {
  const { data: summary, isLoading: summaryLoading } = useCostSummary(providerId);
  const { data: events, isLoading: eventsLoading } = useCostEvents(providerId);

  if (summaryLoading || eventsLoading) return <Spinner size="sm" />;

  return (
    <div>
      {summary && (
        <div className="mb-4 rounded-[var(--radius-lg)] bg-[var(--color-surface-secondary)] p-3">
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

/**
 * Tabbed detail view for a single cloud GPU provider (PRD-114).
 *
 * Tabs: Instances | GPU Types | Scaling Rules | Cost
 */

import { useCallback, useState } from "react";

import { ConfirmModal, Tabs } from "@/components/composite";
import { useToast } from "@/components/composite/useToast";
import { Button ,  WireframeLoader } from "@/components/primitives";
import { formatCents, formatDateTime, formatRelative } from "@/lib/format";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_BODY,
  TERMINAL_TH,
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
  TERMINAL_LABEL,
  TERMINAL_SELECT,
  TERMINAL_INPUT,
  GHOST_DANGER_BTN,
} from "@/lib/ui-classes";

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
        <WireframeLoader size={48} />
      </div>
    );
  }

  return (
    <div className={TERMINAL_PANEL}>
      {/* Header */}
      <div className={`flex items-center justify-between ${TERMINAL_HEADER}`}>
        <div>
          <h2 className="text-sm font-semibold font-mono text-[var(--color-text-primary)]">
            {provider.name}
          </h2>
          <p className="text-xs font-mono text-[var(--color-text-muted)]">
            {provider.provider_type} &middot; ID {provider.id}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="xs"
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
            size="xs"
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
      <div className={TERMINAL_BODY}>
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

  if (isLoading) return <WireframeLoader size={32} />;
  if (!instances || instances.length === 0) {
    return <p className="text-xs font-mono text-[var(--color-text-muted)]">No instances</p>;
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

  if (isLoading) return <WireframeLoader size={32} />;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button
          variant="secondary"
          size="xs"
          loading={syncTypes.isPending}
          onClick={() => syncTypes.mutate()}
        >
          Sync from Provider
        </Button>
      </div>
      {!types || types.length === 0 ? (
        <p className="text-xs font-mono text-[var(--color-text-muted)]">No GPU types. Click sync to fetch from provider.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className={TERMINAL_DIVIDER}>
              <th className={`pb-2 ${TERMINAL_TH}`}>GPU</th>
              <th className={`pb-2 ${TERMINAL_TH}`}>VRAM</th>
              <th className={`pb-2 ${TERMINAL_TH}`}>Cost/hr</th>
              <th className={`pb-2 ${TERMINAL_TH}`}>Max GPUs</th>
              <th className={`pb-2 ${TERMINAL_TH}`}>Available</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id} className={`${TERMINAL_DIVIDER} ${TERMINAL_ROW_HOVER}`}>
                <td className="py-2 font-mono text-xs font-medium text-[var(--color-text-primary)]">{t.name}</td>
                <td className="py-2 font-mono text-xs text-[var(--color-text-muted)]">{(t.vram_mb / 1024).toFixed(0)} GB</td>
                <td className="py-2 font-mono text-xs text-[var(--color-text-muted)]">{formatCents(t.cost_per_hour_cents)}</td>
                <td className="py-2 font-mono text-xs text-[var(--color-text-muted)]">{t.max_gpu_count}</td>
                <td className={`py-2 font-mono text-xs ${t.available ? "text-green-400" : "text-[var(--color-text-muted)]"}`}>
                  {t.available ? "Yes" : "No"}
                </td>
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

  if (isLoading) return <WireframeLoader size={32} />;

  return (
    <div className="flex flex-col gap-6">
      {/* Scaling Rules */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className={TERMINAL_HEADER_TITLE}>Scaling Rules</h3>
          <Button size="xs" variant="secondary" onClick={() => setShowCreate(true)}>
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
          <p className="text-xs font-mono text-[var(--color-text-muted)]">No scaling rules configured.</p>
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
          <h3 className={TERMINAL_HEADER_TITLE}>Decision History</h3>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => setConfirmResetScaling(true)}
            loading={resetScaling.isPending}
          >
            Reset History &amp; Cooldown
          </Button>
        </div>
        {eventsLoading ? (
          <WireframeLoader size={32} />
        ) : !events || events.length === 0 ? (
          <p className="text-xs font-mono text-[var(--color-text-muted)]">
            No scaling decisions recorded yet. Decisions are evaluated every 30 seconds.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117]">
            <table className="w-full font-mono text-xs">
              <thead className="sticky top-0 bg-[#161b22]">
                <tr>
                  <th className={`px-3 py-2 ${TERMINAL_TH}`}>Time</th>
                  <th className={`px-3 py-2 ${TERMINAL_TH}`}>Action</th>
                  <th className={`px-3 py-2 ${TERMINAL_TH}`}>Queue</th>
                  <th className={`px-3 py-2 ${TERMINAL_TH}`}>Instances</th>
                  <th className={`px-3 py-2 ${TERMINAL_TH}`}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className={`${TERMINAL_DIVIDER} ${TERMINAL_ROW_HOVER}`}
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
                    <td className="px-3 py-1.5 text-[var(--color-text-muted)]">
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
      className={`flex items-center gap-4 rounded-[var(--radius-md)] border px-4 py-3 font-mono text-xs ${
        rule.enabled
          ? "border-[var(--color-border-default)] bg-[#0d1117]"
          : "border-dashed border-[var(--color-border-default)] bg-[#0d1117] opacity-60"
      }`}
    >
      <div className="flex-1 grid grid-cols-6 gap-2">
        <div>
          <span className={TERMINAL_LABEL}>GPU</span>
          <p className="font-medium text-[var(--color-text-primary)]">{gpuName}</p>
        </div>
        <div>
          <span className={TERMINAL_LABEL}>Min/Max</span>
          <p className="text-cyan-400">
            {rule.min_instances} / {rule.max_instances}
          </p>
        </div>
        <div>
          <span className={TERMINAL_LABEL}>Queue Threshold</span>
          <p className="text-cyan-400">{rule.queue_threshold} jobs</p>
        </div>
        <div>
          <span className={TERMINAL_LABEL}>Cooldown</span>
          <p className="text-cyan-400">{rule.cooldown_secs}s</p>
        </div>
        <div>
          <span className={TERMINAL_LABEL}>Budget</span>
          <p className="text-cyan-400">
            {rule.budget_limit_cents != null ? formatCents(rule.budget_limit_cents) : "—"}
          </p>
        </div>
        <div>
          <span className={TERMINAL_LABEL}>Last Scaled</span>
          <p className="text-[var(--color-text-muted)]">
            {rule.last_scaled_at ? formatRelative(rule.last_scaled_at) : "Never"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="xs" variant="ghost" onClick={onToggle}>
          {rule.enabled ? "Disable" : "Enable"}
        </Button>
        <Button size="xs" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <Button size="xs" variant="ghost" className={GHOST_DANGER_BTN} onClick={onDelete}>
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
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[#161b22] p-4 mb-3">
      <div className="grid grid-cols-4 gap-3 font-mono text-xs">
        {!initial && (
          <div className="flex flex-col gap-1">
            <span className={TERMINAL_LABEL}>GPU Type</span>
            <select
              value={form.gpu_type_id}
              onChange={(e) => set("gpu_type_id", Number(e.target.value))}
              className={TERMINAL_SELECT}
            >
              {gpuTypes.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <span className={TERMINAL_LABEL}>Min Instances</span>
          <input
            type="number"
            min={0}
            value={form.min_instances}
            onChange={(e) => set("min_instances", Number(e.target.value))}
            className={`${TERMINAL_INPUT} rounded-[var(--radius-md)] border border-[var(--color-border-default)]`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={TERMINAL_LABEL}>Max Instances</span>
          <input
            type="number"
            min={1}
            value={form.max_instances}
            onChange={(e) => set("max_instances", Number(e.target.value))}
            className={`${TERMINAL_INPUT} rounded-[var(--radius-md)] border border-[var(--color-border-default)]`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={TERMINAL_LABEL}>Queue Threshold</span>
          <input
            type="number"
            min={1}
            value={form.queue_threshold}
            onChange={(e) => set("queue_threshold", Number(e.target.value))}
            className={`${TERMINAL_INPUT} rounded-[var(--radius-md)] border border-[var(--color-border-default)]`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={TERMINAL_LABEL}>Cooldown (seconds)</span>
          <input
            type="number"
            min={0}
            value={form.cooldown_secs}
            onChange={(e) => set("cooldown_secs", Number(e.target.value))}
            className={`${TERMINAL_INPUT} rounded-[var(--radius-md)] border border-[var(--color-border-default)]`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={TERMINAL_LABEL}>Budget Limit (cents)</span>
          <input
            type="number"
            min={0}
            value={form.budget_limit_cents ?? ""}
            onChange={(e) =>
              set("budget_limit_cents", e.target.value ? Number(e.target.value) : null)
            }
            placeholder="No limit"
            className={`${TERMINAL_INPUT} rounded-[var(--radius-md)] border border-[var(--color-border-default)]`}
          />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
          />
          <span className={TERMINAL_LABEL}>Enabled</span>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="xs" onClick={() => onSave(form)} loading={saving}>
          {initial ? "Save" : "Create"}
        </Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ---------- Action Badge ---------- */

const SCALING_ACTION_COLORS: Record<string, string> = {
  scale_up: "text-green-400",
  scale_down: "text-red-400",
  provision_error: "text-orange-400",
  no_change: "text-[var(--color-text-muted)]",
};

const SCALING_ACTION_LABELS: Record<string, (count: number) => string> = {
  scale_up: (count) => `+${count} scale_up`,
  scale_down: (count) => `-${count} scale_down`,
  provision_error: () => "provision_error",
  no_change: () => "no_change",
};

function ScalingActionBadge({ action, count }: { action: string; count: number }) {
  const color = SCALING_ACTION_COLORS[action] ?? SCALING_ACTION_COLORS.no_change;
  const labelFn = SCALING_ACTION_LABELS[action];
  const label = labelFn ? labelFn(count) : action;

  return (
    <span className={`font-mono text-xs font-semibold whitespace-nowrap ${color}`}>
      {label}
    </span>
  );
}

function CostTab({ providerId }: { providerId: number }) {
  const { data: summary, isLoading: summaryLoading } = useCostSummary(providerId);
  const { data: events, isLoading: eventsLoading } = useCostEvents(providerId);

  if (summaryLoading || eventsLoading) return <WireframeLoader size={32} />;

  return (
    <div>
      {summary && (
        <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#161b22] p-3">
          <p className="font-mono text-xs text-[var(--color-text-muted)]">
            Last 30 days: <span className="font-medium text-cyan-400">{formatCents(summary.total_cost_cents)}</span>
            {" "}&middot; {summary.event_count} events
          </p>
        </div>
      )}
      {events && events.length > 0 ? (
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className={TERMINAL_DIVIDER}>
              <th className={`pb-2 ${TERMINAL_TH}`}>Type</th>
              <th className={`pb-2 ${TERMINAL_TH}`}>Amount</th>
              <th className={`pb-2 ${TERMINAL_TH}`}>Description</th>
              <th className={`pb-2 ${TERMINAL_TH}`}>Time</th>
            </tr>
          </thead>
          <tbody>
            {events.slice(0, 50).map((e) => (
              <tr key={e.id} className={`${TERMINAL_DIVIDER} ${TERMINAL_ROW_HOVER}`}>
                <td className="py-2 text-[var(--color-text-primary)]">{e.event_type}</td>
                <td className="py-2 text-[var(--color-text-muted)]">{formatCents(e.amount_cents)}</td>
                <td className="py-2 text-[var(--color-text-muted)]">{e.description ?? "—"}</td>
                <td className="py-2 text-[var(--color-text-muted)]">{formatDateTime(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs font-mono text-[var(--color-text-muted)]">No cost events recorded.</p>
      )}
    </div>
  );
}

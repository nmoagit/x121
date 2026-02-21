import { useState } from "react";

import { Badge } from "@/components/primitives";
import { Card } from "@/components/composite/Card";
import { Input } from "@/components/primitives";
import { Select } from "@/components/primitives";
import { Spinner } from "@/components/primitives";
import { Toggle } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  useAlertThresholds,
  useCreateAlertThreshold,
  useDeleteAlertThreshold,
  useUpdateAlertThreshold,
  type CreateAlertThreshold,
  type PerformanceAlertThreshold,
} from "@/features/dashboard/hooks/use-performance";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const METRIC_OPTIONS = [
  { value: "time_per_frame_ms", label: "Time per Frame (ms)" },
  { value: "total_gpu_time_ms", label: "Total GPU Time (ms)" },
  { value: "vram_peak_mb", label: "VRAM Peak (MB)" },
  { value: "total_wall_time_ms", label: "Total Wall Time (ms)" },
];

const SCOPE_OPTIONS = [
  { value: "global", label: "Global" },
  { value: "workflow", label: "Per Workflow" },
  { value: "worker", label: "Per Worker" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AlertConfig() {
  const { data: thresholds, isLoading } = useAlertThresholds();
  const createMutation = useCreateAlertThreshold();
  const updateMutation = useUpdateAlertThreshold();
  const deleteMutation = useDeleteAlertThreshold();

  const [showForm, setShowForm] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Stack gap={4}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
          Alert Thresholds
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-[var(--radius-md)] bg-[var(--color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {showForm ? "Cancel" : "Add Threshold"}
        </button>
      </div>

      {showForm && (
        <CreateForm
          onSubmit={(data) => {
            createMutation.mutate(data, { onSuccess: () => setShowForm(false) });
          }}
          isPending={createMutation.isPending}
        />
      )}

      {!thresholds || thresholds.length === 0 ? (
        <Card padding="lg">
          <p className="text-sm text-[var(--color-text-muted)]">No alert thresholds defined.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                  Metric
                </th>
                <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                  Scope
                </th>
                <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
                  Warning
                </th>
                <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
                  Critical
                </th>
                <th className="px-4 py-2 text-center font-medium text-[var(--color-text-muted)]">
                  Enabled
                </th>
                <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {thresholds.map((t) => (
                <ThresholdRow
                  key={t.id}
                  threshold={t}
                  onToggle={(enabled) =>
                    updateMutation.mutate({ id: t.id, data: { enabled } })
                  }
                  onDelete={() => deleteMutation.mutate(t.id)}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Create form sub-component
   -------------------------------------------------------------------------- */

function CreateForm({
  onSubmit,
  isPending,
}: {
  onSubmit: (data: CreateAlertThreshold) => void;
  isPending: boolean;
}) {
  const [metricName, setMetricName] = useState("");
  const [scopeType, setScopeType] = useState("global");
  const [scopeId, setScopeId] = useState("");
  const [warningStr, setWarningStr] = useState("");
  const [criticalStr, setCriticalStr] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const warning = parseFloat(warningStr);
    const critical = parseFloat(criticalStr);
    if (!metricName || Number.isNaN(warning) || Number.isNaN(critical)) return;

    onSubmit({
      metric_name: metricName,
      scope_type: scopeType,
      scope_id: scopeType !== "global" ? parseInt(scopeId, 10) || null : null,
      warning_threshold: warning,
      critical_threshold: critical,
    });
  }

  return (
    <Card padding="md">
      <form onSubmit={handleSubmit}>
        <Stack gap={3}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Metric"
              options={METRIC_OPTIONS}
              value={metricName}
              onChange={setMetricName}
              placeholder="Select metric"
            />
            <Select
              label="Scope"
              options={SCOPE_OPTIONS}
              value={scopeType}
              onChange={setScopeType}
            />
            {scopeType !== "global" && (
              <Input
                label={scopeType === "workflow" ? "Workflow ID" : "Worker ID"}
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                placeholder="ID"
              />
            )}
            <Input
              label="Warning Threshold"
              value={warningStr}
              onChange={(e) => setWarningStr(e.target.value)}
              placeholder="e.g. 100"
            />
            <Input
              label="Critical Threshold"
              value={criticalStr}
              onChange={(e) => setCriticalStr(e.target.value)}
              placeholder="e.g. 200"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-[var(--radius-md)] bg-[var(--color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Creating..." : "Create Threshold"}
            </button>
          </div>
        </Stack>
      </form>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Threshold row sub-component
   -------------------------------------------------------------------------- */

function ThresholdRow({
  threshold,
  onToggle,
  onDelete,
  isDeleting,
}: {
  threshold: PerformanceAlertThreshold;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const scopeLabel =
    threshold.scope_type === "global"
      ? "Global"
      : `${threshold.scope_type} #${threshold.scope_id}`;

  return (
    <tr className="border-b border-[var(--color-border-default)]">
      <td className="px-4 py-2 text-[var(--color-text-primary)]">{threshold.metric_name}</td>
      <td className="px-4 py-2">
        <Badge variant={threshold.scope_type === "global" ? "default" : "info"} size="sm">
          {scopeLabel}
        </Badge>
      </td>
      <td className="px-4 py-2 text-right text-[var(--color-action-warning)]">
        {threshold.warning_threshold}
      </td>
      <td className="px-4 py-2 text-right text-[var(--color-action-danger)]">
        {threshold.critical_threshold}
      </td>
      <td className="px-4 py-2 text-center">
        <div className="flex justify-center">
          <Toggle
            checked={threshold.enabled}
            onChange={onToggle}
            size="sm"
          />
        </div>
      </td>
      <td className="px-4 py-2 text-right">
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="text-sm text-[var(--color-action-danger)] hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

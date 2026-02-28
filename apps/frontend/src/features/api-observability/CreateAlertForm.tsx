/**
 * Alert creation form for API observability (PRD-106).
 */

import { useState } from "react";

import { Button, Input } from "@/components/primitives";
import { Select } from "@/components/primitives";
import { Save } from "@/tokens/icons";

import { useCreateAlert } from "./hooks/use-api-observability";
import type { AlertType, Comparison, CreateAlertConfig } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const ALERT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "error_rate", label: "Error Rate" },
  { value: "response_time", label: "Response Time" },
  { value: "rate_limit", label: "Rate Limit" },
];

const COMPARISON_OPTIONS: { value: string; label: string }[] = [
  { value: "gt", label: "> Greater than" },
  { value: "gte", label: "\u2265 Greater or equal" },
  { value: "lt", label: "< Less than" },
  { value: "lte", label: "\u2264 Less or equal" },
];

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CreateAlertFormProps {
  onClose: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CreateAlertForm({ onClose }: CreateAlertFormProps) {
  const [name, setName] = useState("");
  const [alertType, setAlertType] = useState<AlertType>("error_rate");
  const [comparison, setComparison] = useState<Comparison>("gt");
  const [threshold, setThreshold] = useState("5");
  const [windowMin, setWindowMin] = useState("5");
  const [cooldownMin, setCooldownMin] = useState("15");

  const createMutation = useCreateAlert();

  function handleSubmit() {
    const input: CreateAlertConfig = {
      name: name.trim(),
      alert_type: alertType,
      comparison,
      threshold_value: Number(threshold),
      window_minutes: Number(windowMin),
      cooldown_minutes: Number(cooldownMin),
      enabled: true,
    };
    createMutation.mutate(input, { onSuccess: onClose });
  }

  const isValid = name.trim().length > 0 && Number(threshold) > 0;

  return (
    <div className="space-y-[var(--spacing-3)] border-t border-[var(--color-border-default)] pt-[var(--spacing-3)]">
      <Input
        label="Alert Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. High error rate on /api/v1/jobs"
      />
      <div className="grid grid-cols-2 gap-[var(--spacing-3)]">
        <Select
          label="Alert Type"
          options={ALERT_TYPE_OPTIONS}
          value={alertType}
          onChange={(v) => setAlertType(v as AlertType)}
        />
        <Select
          label="Comparison"
          options={COMPARISON_OPTIONS}
          value={comparison}
          onChange={(v) => setComparison(v as Comparison)}
        />
      </div>
      <div className="grid grid-cols-3 gap-[var(--spacing-3)]">
        <Input
          label="Threshold"
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
        <Input
          label="Window (min)"
          type="number"
          value={windowMin}
          onChange={(e) => setWindowMin(e.target.value)}
        />
        <Input
          label="Cooldown (min)"
          type="number"
          value={cooldownMin}
          onChange={(e) => setCooldownMin(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-[var(--spacing-2)]">
        <Button
          variant="primary"
          size="sm"
          icon={<Save size={14} />}
          loading={createMutation.isPending}
          disabled={!isValid}
          onClick={handleSubmit}
        >
          Create Alert
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

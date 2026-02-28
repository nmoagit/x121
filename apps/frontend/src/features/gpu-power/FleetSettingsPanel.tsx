/**
 * Fleet-wide power settings editor (PRD-87).
 *
 * Allows admins to configure default idle timeout and wake method.
 * Fleet schedules are managed via the schedule CRUD endpoints.
 */

import { useState } from "react";

import { Card } from "@/components/composite/Card";
import { Button, Input } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { Settings } from "@/tokens/icons";

import type { UpdateFleetPowerSettings, WakeMethod } from "./types";
import { WAKE_METHOD_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

/** Valid wake method options for the select input. */
const WAKE_METHOD_OPTIONS: { value: WakeMethod | ""; label: string }[] = [
  { value: "", label: "None" },
  { value: "wol", label: WAKE_METHOD_LABELS.wol },
  { value: "ssh", label: WAKE_METHOD_LABELS.ssh },
  { value: "api", label: WAKE_METHOD_LABELS.api },
];

interface FleetSettingsPanelProps {
  idleTimeout: number;
  defaultWakeMethod: string | null;
  onSave: (settings: UpdateFleetPowerSettings) => void;
  isSaving: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function FleetSettingsPanel({
  idleTimeout,
  defaultWakeMethod,
  onSave,
  isSaving,
}: FleetSettingsPanelProps) {
  const [localTimeout, setLocalTimeout] = useState(idleTimeout);
  const [localWakeMethod, setLocalWakeMethod] = useState(defaultWakeMethod ?? "");

  function handleSave() {
    onSave({
      default_idle_timeout_minutes: localTimeout,
      default_wake_method: localWakeMethod || null,
    });
  }

  return (
    <Card elevation="sm" padding="md">
      <div className="flex items-center gap-[var(--spacing-2)] mb-[var(--spacing-3)]">
        <Settings
          size={16}
          className="text-[var(--color-text-muted)]"
          aria-hidden
        />
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          Fleet Power Settings
        </span>
      </div>

      <Stack gap={3}>
        <div className="grid grid-cols-1 gap-[var(--spacing-3)] sm:grid-cols-2">
          <Input
            type="number"
            label="Default Idle Timeout (min)"
            value={String(localTimeout)}
            onChange={(e) => setLocalTimeout(Number(e.target.value))}
            min={1}
          />
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
              Default Wake Method
            </label>
            <select
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
              value={localWakeMethod}
              onChange={(e) => setLocalWakeMethod(e.target.value)}
            >
              {WAKE_METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            loading={isSaving}
            onClick={handleSave}
          >
            Save Settings
          </Button>
        </div>
      </Stack>
    </Card>
  );
}

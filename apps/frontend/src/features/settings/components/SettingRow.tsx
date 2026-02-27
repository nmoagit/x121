/**
 * Individual setting row with inline editing, reset, and connection test (PRD-110).
 */

import { useState } from "react";

import { Badge, Button } from "@/components/primitives";
import { useToast } from "@/components/composite/useToast";
import { cn } from "@/lib/cn";
import { AlertTriangle, RefreshCw } from "@/tokens/icons";

import {
  useResetSetting,
  useTestConnection,
  useUpdateSetting,
} from "../hooks/use-settings";
import type { PlatformSetting } from "../types";
import {
  SOURCE_LABELS,
  SOURCE_VARIANT,
  TESTABLE_VALUE_TYPES,
} from "../types";
import { EditForm, ValueDisplay } from "./SettingValueEditor";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const SENSITIVE_MASK = "********";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface SettingRowProps {
  setting: PlatformSetting;
}

export function SettingRow({ setting }: SettingRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(setting.value);
  const [revealed, setRevealed] = useState(false);

  const { addToast } = useToast();
  const updateMutation = useUpdateSetting();
  const resetMutation = useResetSetting();
  const testMutation = useTestConnection();

  const isTestable = TESTABLE_VALUE_TYPES.has(setting.value_type);
  const isSaving = updateMutation.isPending;
  const isResetting = resetMutation.isPending;

  function startEdit() {
    setDraft(setting.value);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(setting.value);
  }

  function save() {
    updateMutation.mutate(
      { key: setting.key, value: draft },
      {
        onSuccess: () => {
          addToast({ message: `${setting.label} updated`, variant: "success" });
          setEditing(false);
        },
        onError: () => {
          addToast({ message: `Failed to update ${setting.label}`, variant: "error" });
        },
      },
    );
  }

  function reset() {
    resetMutation.mutate(setting.key, {
      onSuccess: () => {
        addToast({ message: `${setting.label} reset to default`, variant: "success" });
        setEditing(false);
      },
      onError: () => {
        addToast({ message: `Failed to reset ${setting.label}`, variant: "error" });
      },
    });
  }

  function testConnection() {
    testMutation.mutate(
      { key: setting.key },
      {
        onSuccess: (result) => {
          if (result.reachable) {
            addToast({
              message: `Connection OK (${result.latency_ms ?? "?"}ms)`,
              variant: "success",
            });
          } else {
            addToast({
              message: result.error ?? "Connection failed",
              variant: "error",
            });
          }
        },
        onError: () => {
          addToast({ message: "Connection test failed", variant: "error" });
        },
      },
    );
  }

  /** Displayed value: masked if sensitive and not revealed. */
  const displayValue =
    setting.sensitive && !revealed ? SENSITIVE_MASK : setting.value;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--color-border-default)]",
        "bg-[var(--color-surface-secondary)] p-[var(--spacing-4)]",
      )}
    >
      {/* Header row: label + badges */}
      <div className="flex items-start justify-between gap-[var(--spacing-3)]">
        <div className="flex-1">
          <div className="flex items-center gap-[var(--spacing-2)]">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              {setting.label}
            </span>
            {setting.requires_restart && (
              <AlertTriangle
                size={14}
                className="text-[var(--color-action-warning)]"
                aria-label="Requires restart"
              />
            )}
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {setting.description}
          </p>
        </div>
        <Badge variant={SOURCE_VARIANT[setting.source]} size="sm">
          {SOURCE_LABELS[setting.source]}
        </Badge>
      </div>

      {/* Value / edit area */}
      <div className="mt-[var(--spacing-3)]">
        {editing ? (
          <EditForm
            draft={draft}
            sensitive={setting.sensitive}
            isSaving={isSaving}
            onChange={setDraft}
            onSave={save}
            onCancel={cancelEdit}
          />
        ) : (
          <ValueDisplay
            value={displayValue}
            sensitive={setting.sensitive}
            revealed={revealed}
            onToggleReveal={() => setRevealed((r) => !r)}
            onEdit={startEdit}
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-[var(--spacing-3)] flex items-center gap-[var(--spacing-2)]">
        {setting.source === "database" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            loading={isResetting}
          >
            Reset to Default
          </Button>
        )}
        {isTestable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={testConnection}
            loading={testMutation.isPending}
            icon={<RefreshCw size={14} />}
          >
            Test Connection
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Threshold Editor — manages QA threshold configuration (PRD-49).
 *
 * Displays a table of check types with warn/fail threshold inputs,
 * an enable/disable toggle, and a save button per row.
 */

import { useCallback, useState } from "react";

import { Button, Input, Toggle } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";

import type { CreateQaThreshold, QaThreshold } from "./types";
import { CHECK_TYPE_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ThresholdEditorProps {
  thresholds: QaThreshold[];
  onSave: (input: CreateQaThreshold) => void;
  /** When true, shows "(studio default)" indicator for studio-level rows. */
  showStudioIndicator?: boolean;
}

/* --------------------------------------------------------------------------
   Row state
   -------------------------------------------------------------------------- */

interface RowState {
  warn_threshold: string;
  fail_threshold: string;
  is_enabled: boolean;
  dirty: boolean;
}

function initRowState(t: QaThreshold): RowState {
  return {
    warn_threshold: String(t.warn_threshold),
    fail_threshold: String(t.fail_threshold),
    is_enabled: t.is_enabled,
    dirty: false,
  };
}

/* --------------------------------------------------------------------------
   Threshold row
   -------------------------------------------------------------------------- */

function ThresholdRow({
  threshold,
  onSave,
  showStudioIndicator,
}: {
  threshold: QaThreshold;
  onSave: (input: CreateQaThreshold) => void;
  showStudioIndicator?: boolean;
}) {
  const [row, setRow] = useState<RowState>(() => initRowState(threshold));
  const label = CHECK_TYPE_LABELS[threshold.check_type] ?? threshold.check_type;
  const isStudioDefault = threshold.project_id === null;

  const handleSave = useCallback(() => {
    const warn = parseFloat(row.warn_threshold);
    const fail = parseFloat(row.fail_threshold);
    if (Number.isNaN(warn) || Number.isNaN(fail)) return;

    onSave({
      check_type: threshold.check_type,
      warn_threshold: warn,
      fail_threshold: fail,
      is_enabled: row.is_enabled,
    });
    setRow((prev) => ({ ...prev, dirty: false }));
  }, [row, threshold.check_type, onSave]);

  const updateField = (field: keyof RowState, value: string | boolean) => {
    setRow((prev) => ({ ...prev, [field]: value, dirty: true }));
  };

  return (
    <tr data-testid={`threshold-row-${threshold.check_type}`}>
      <td className="px-3 py-2 text-sm text-[var(--color-text-primary)]">
        <span className="font-medium">{label}</span>
        {showStudioIndicator && isStudioDefault && (
          <span
            data-testid={`studio-default-${threshold.check_type}`}
            className="ml-2 text-xs text-[var(--color-text-muted)]"
          >
            (studio default)
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          value={row.warn_threshold}
          onChange={(e) => updateField("warn_threshold", e.target.value)}
          aria-label={`Warn threshold for ${label}`}
          className="w-20"
          step="0.01"
          min="0"
          max="1"
        />
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          value={row.fail_threshold}
          onChange={(e) => updateField("fail_threshold", e.target.value)}
          aria-label={`Fail threshold for ${label}`}
          className="w-20"
          step="0.01"
          min="0"
          max="1"
        />
      </td>
      <td className="px-3 py-2">
        <Toggle
          checked={row.is_enabled}
          onChange={(checked) => updateField("is_enabled", checked)}
          size="sm"
        />
      </td>
      <td className="px-3 py-2">
        <Button
          onClick={handleSave}
          disabled={!row.dirty}
          aria-label={`Save ${label}`}
        >
          Save
        </Button>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ThresholdEditor({
  thresholds,
  onSave,
  showStudioIndicator = false,
}: ThresholdEditorProps) {
  return (
    <Card data-testid="threshold-editor" elevation="flat">
      <CardHeader>
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
          QA Thresholds
        </h3>
      </CardHeader>
      <CardBody className="p-0 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--color-border-default)]">
              <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
                Check Type
              </th>
              <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
                Warn
              </th>
              <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
                Fail
              </th>
              <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
                Enabled
              </th>
              <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {thresholds.map((t) => (
              <ThresholdRow
                key={t.id}
                threshold={t}
                onSave={onSave}
                showStudioIndicator={showStudioIndicator}
              />
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

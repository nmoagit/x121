/**
 * Execution settings sub-form (PRD-97).
 *
 * Controls for execution mode, max chain depth, sort order,
 * and approval requirement.
 */

import { Checkbox, Input, Select } from "@/components/primitives";
import { Stack } from "@/components/layout";

import type { ExecutionMode } from "./types";
import { EXECUTION_MODE_LABEL } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const EXECUTION_MODE_OPTIONS = Object.entries(EXECUTION_MODE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ExecutionSettingsProps {
  executionMode: ExecutionMode;
  maxChainDepth: string;
  sortOrder: string;
  requiresApproval: boolean;
  onExecutionModeChange: (mode: ExecutionMode) => void;
  onMaxChainDepthChange: (value: string) => void;
  onSortOrderChange: (value: string) => void;
  onRequiresApprovalChange: (value: boolean) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ExecutionSettings({
  executionMode,
  maxChainDepth,
  sortOrder,
  requiresApproval,
  onExecutionModeChange,
  onMaxChainDepthChange,
  onSortOrderChange,
  onRequiresApprovalChange,
}: ExecutionSettingsProps) {
  return (
    <>
      <Stack direction="horizontal" gap={3}>
        <div className="flex-1">
          <Select
            label="Execution Mode"
            options={EXECUTION_MODE_OPTIONS}
            value={executionMode}
            onChange={(v) => onExecutionModeChange(v as ExecutionMode)}
          />
        </div>
        <div className="w-32">
          <Input
            label="Max Chain Depth"
            type="number"
            value={maxChainDepth}
            onChange={(e) => onMaxChainDepthChange(e.target.value)}
            data-testid="trigger-max-depth"
          />
        </div>
        <div className="w-24">
          <Input
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => onSortOrderChange(e.target.value)}
            data-testid="trigger-sort-order"
          />
        </div>
      </Stack>

      <Checkbox
        checked={requiresApproval}
        onChange={onRequiresApprovalChange}
        label="Requires approval before firing"
      />
    </>
  );
}

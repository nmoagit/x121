/**
 * Generation strategy selector (PRD-115).
 *
 * Allows choosing between platform_orchestrated and workflow_managed
 * strategies, with additional fields for chunk configuration.
 */

import { Input } from "@/components/primitives/Input";
import { Select } from "@/components/primitives/Select";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STRATEGY_OPTIONS = [
  { value: "platform_orchestrated", label: "Platform Orchestrated" },
  { value: "workflow_managed", label: "Workflow Managed" },
] as const;

const STRATEGY_HELP: Record<string, string> = {
  platform_orchestrated:
    "The platform controls the generation pipeline, splitting work into chunks and managing outputs automatically.",
  workflow_managed:
    "The ComfyUI workflow handles its own chunking and output management. You must specify the expected number of chunks and the output naming pattern.",
};

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface GenerationStrategySelectorProps {
  value: string;
  onChange: (value: string) => void;
  expectedChunks?: number | null;
  chunkOutputPattern?: string | null;
  onExpectedChunksChange?: (value: number | null) => void;
  onChunkOutputPatternChange?: (value: string | null) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GenerationStrategySelector({
  value,
  onChange,
  expectedChunks,
  chunkOutputPattern,
  onExpectedChunksChange,
  onChunkOutputPatternChange,
}: GenerationStrategySelectorProps) {
  const isWorkflowManaged = value === "workflow_managed";

  return (
    <div className="flex flex-col gap-4" data-testid="generation-strategy-selector">
      <Select
        label="Generation Strategy"
        options={[...STRATEGY_OPTIONS]}
        value={value}
        onChange={onChange}
      />

      {STRATEGY_HELP[value] && (
        <p
          className="text-xs text-[var(--color-text-muted)]"
          data-testid="strategy-help-text"
        >
          {STRATEGY_HELP[value]}
        </p>
      )}

      {isWorkflowManaged && (
        <div className="flex flex-col gap-3" data-testid="workflow-managed-fields">
          <Input
            label="Expected Chunks"
            type="number"
            value={expectedChunks ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onExpectedChunksChange?.(val ? Number(val) : null);
            }}
            placeholder="Number of expected output chunks"
            data-testid="expected-chunks-input"
          />

          <Input
            label="Chunk Output Pattern"
            value={chunkOutputPattern ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onChunkOutputPatternChange?.(val || null);
            }}
            placeholder="e.g. output_{index}.mp4"
            data-testid="chunk-output-pattern-input"
          />
        </div>
      )}
    </div>
  );
}

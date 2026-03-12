/**
 * Single track row within the TrackWorkflowManager table.
 *
 * Shows the track name, workflow selector, and expandable prompt editors.
 */

import { useCallback, useState } from "react";

import { Badge, Button, Select } from "@/components/primitives";
import { ChevronDown, ChevronUp, X } from "@/tokens/icons";

import {
  PromptTemplateEditor,
  type PromptTemplateValues,
} from "@/features/scene-types/PromptTemplateEditor";

import type { SceneTypeTrackConfig, Track, UpsertTrackConfig } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const EMPTY_PROMPTS: PromptTemplateValues = {
  prompt_template: "",
  negative_prompt_template: "",
  prompt_start_clip: "",
  negative_prompt_start_clip: "",
  prompt_continuation_clip: "",
  negative_prompt_continuation_clip: "",
};

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface TrackConfigRowProps {
  track: Track;
  config: SceneTypeTrackConfig | null;
  workflowOptions: { value: string; label: string }[];
  defaultWorkflowName: string;
  onUpsert: (data: UpsertTrackConfig) => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TrackConfigRow({
  track,
  config,
  workflowOptions,
  defaultWorkflowName,
  onUpsert,
  onDelete,
  isSaving,
  isDeleting,
}: TrackConfigRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasOverride = config !== null;

  const currentWorkflowId = config?.workflow_id ?? null;
  const hasPrompts = hasOverride && hasAnyPrompt(config);

  const handleWorkflowChange = useCallback(
    (value: string) => {
      const workflowId = value === "" ? null : Number(value);
      onUpsert({ workflow_id: workflowId });
    },
    [onUpsert],
  );

  const handlePromptsSave = useCallback(
    (prompts: PromptTemplateValues) => {
      onUpsert({
        workflow_id: currentWorkflowId,
        ...prompts,
      });
    },
    [onUpsert, currentWorkflowId],
  );

  const prompts: PromptTemplateValues = config
    ? {
        prompt_template: config.prompt_template ?? "",
        negative_prompt_template: config.negative_prompt_template ?? "",
        prompt_start_clip: config.prompt_start_clip ?? "",
        negative_prompt_start_clip: config.negative_prompt_start_clip ?? "",
        prompt_continuation_clip: config.prompt_continuation_clip ?? "",
        negative_prompt_continuation_clip: config.negative_prompt_continuation_clip ?? "",
      }
    : EMPTY_PROMPTS;

  return (
    <>
      <tr className="border-b border-[var(--color-border-default)]">
        {/* Track name */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {track.name}
            </span>
            {hasOverride && (
              <Badge variant="warning" size="sm">
                Override
              </Badge>
            )}
          </div>
        </td>

        {/* Workflow selector */}
        <td className="px-4 py-3">
          <div className="max-w-[220px]">
            <Select
              options={[
                { value: "", label: `Inherit (${defaultWorkflowName})` },
                ...workflowOptions,
              ]}
              value={currentWorkflowId != null ? String(currentWorkflowId) : ""}
              onChange={handleWorkflowChange}
            />
          </div>
        </td>

        {/* Prompt status */}
        <td className="px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            icon={expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {hasPrompts ? "Edit Prompts" : "Add Prompts"}
          </Button>
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          {hasOverride && (
            <Button
              variant="ghost"
              size="sm"
              icon={<X size={14} />}
              onClick={onDelete}
              loading={isDeleting}
              aria-label={`Clear override for ${track.name}`}
            >
              Clear
            </Button>
          )}
        </td>
      </tr>

      {/* Expandable prompt editor row */}
      {expanded && (
        <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
          <td colSpan={4} className="px-4 py-4">
            <div className="max-w-2xl space-y-3">
              <PromptTemplateEditor
                prompts={prompts}
                onChange={handlePromptsSave}
              />
              {isSaving && (
                <p className="text-xs text-[var(--color-text-muted)]">Saving...</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function hasAnyPrompt(config: SceneTypeTrackConfig): boolean {
  return !!(
    config.prompt_template ||
    config.negative_prompt_template ||
    config.prompt_start_clip ||
    config.negative_prompt_start_clip ||
    config.prompt_continuation_clip ||
    config.negative_prompt_continuation_clip
  );
}

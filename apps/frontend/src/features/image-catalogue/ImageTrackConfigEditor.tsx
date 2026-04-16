/**
 * Per-track workflow/prompt override editor for image types (PRD-154).
 *
 * Lists tracks associated with the image type. Each row shows the track name,
 * a workflow override selector, and prompt override fields.
 * Mirrors TrackConfigRow.tsx from the scene catalogue.
 */

import { useCallback, useState } from "react";

import { Badge, Button, Select } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { ChevronDown, ChevronUp, X } from "@/tokens/icons";
import { TERMINAL_TEXTAREA } from "@/lib/ui-classes";

import type { ImageTypeTrackConfig, UpsertImageTrackConfig } from "./types";
import type { Track } from "@/features/scene-catalogue/types";
import { TYPO_DATA, TYPO_DATA_MUTED } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Single row
   -------------------------------------------------------------------------- */

interface ImageTrackConfigRowProps {
  track: Track;
  config: ImageTypeTrackConfig | null;
  workflowOptions: { value: string; label: string }[];
  defaultWorkflowName: string;
  onUpsert: (data: UpsertImageTrackConfig) => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}

function ImageTrackConfigRow({
  track,
  config,
  workflowOptions,
  defaultWorkflowName,
  onUpsert,
  onDelete,
  isSaving,
  isDeleting,
}: ImageTrackConfigRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasOverride = config !== null;

  const currentWorkflowId = config?.workflow_id ?? null;
  const hasPrompts = hasOverride && !!(config.prompt_template || config.negative_prompt_template);

  const [promptTemplate, setPromptTemplate] = useState(config?.prompt_template ?? "");
  const [negativePromptTemplate, setNegativePromptTemplate] = useState(
    config?.negative_prompt_template ?? "",
  );

  const handleWorkflowChange = useCallback(
    (value: string) => {
      const workflowId = value === "" ? null : Number(value);
      onUpsert({ workflow_id: workflowId });
    },
    [onUpsert],
  );

  const handlePromptsSave = useCallback(() => {
    onUpsert({
      workflow_id: currentWorkflowId,
      prompt_template: promptTemplate.trim() || null,
      negative_prompt_template: negativePromptTemplate.trim() || null,
    });
  }, [onUpsert, currentWorkflowId, promptTemplate, negativePromptTemplate]);

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
            <Stack gap={3}>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`prompt-${track.id}`}
                  className={`${TYPO_DATA} font-medium text-[var(--color-text-muted)] uppercase tracking-wide`}
                >
                  Prompt Template
                </label>
                <textarea
                  id={`prompt-${track.id}`}
                  rows={3}
                  className={TERMINAL_TEXTAREA}
                  value={promptTemplate}
                  onChange={(e) => setPromptTemplate(e.target.value)}
                  placeholder="Override prompt template"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`neg-prompt-${track.id}`}
                  className={`${TYPO_DATA} font-medium text-[var(--color-text-muted)] uppercase tracking-wide`}
                >
                  Negative Prompt Template
                </label>
                <textarea
                  id={`neg-prompt-${track.id}`}
                  rows={2}
                  className={TERMINAL_TEXTAREA}
                  value={negativePromptTemplate}
                  onChange={(e) => setNegativePromptTemplate(e.target.value)}
                  placeholder="Override negative prompt template"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePromptsSave}
                  loading={isSaving}
                >
                  Save Prompts
                </Button>
              </div>
            </Stack>
          </td>
        </tr>
      )}
    </>
  );
}

/* --------------------------------------------------------------------------
   Main editor component
   -------------------------------------------------------------------------- */

interface ImageTrackConfigEditorProps {
  imageTypeId: number;
  tracks: Track[];
  configs: ImageTypeTrackConfig[];
  workflowOptions: { value: string; label: string }[];
  defaultWorkflowName: string;
  onUpsert: (trackId: number, data: UpsertImageTrackConfig) => void;
  onDelete: (trackId: number) => void;
  isSaving: boolean;
  isDeleting: boolean;
}

export function ImageTrackConfigEditor({
  tracks,
  configs,
  workflowOptions,
  defaultWorkflowName,
  onUpsert,
  onDelete,
  isSaving,
  isDeleting,
}: ImageTrackConfigEditorProps) {
  const configMap = new Map(configs.map((c) => [c.track_id, c]));

  if (tracks.length === 0) {
    return (
      <p className={`${TYPO_DATA_MUTED} py-4`}>
        No tracks associated with this image type. Add tracks in the image type form.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--color-border-default)]">
            <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
              Track
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
              Workflow
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
              Prompts
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track) => (
            <ImageTrackConfigRow
              key={track.id}
              track={track}
              config={configMap.get(track.id) ?? null}
              workflowOptions={workflowOptions}
              defaultWorkflowName={defaultWorkflowName}
              onUpsert={(data) => onUpsert(track.id, data)}
              onDelete={() => onDelete(track.id)}
              isSaving={isSaving}
              isDeleting={isDeleting}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

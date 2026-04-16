/**
 * Scene type editor form (PRD-23).
 *
 * Compact modal form for creating/editing scene type core properties.
 * Includes read-only summary of workflow, prompt, and video settings
 * with links to switch to the relevant tab for editing.
 */

import { useMemo, useState } from "react";

import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Toggle } from "@/components/primitives/Toggle";
import { Stack } from "@/components/layout";
import { generateSnakeSlug } from "@/lib/format";
import { TERMINAL_LABEL, TRACK_TEXT_COLORS } from "@/lib/ui-classes";

import { usePipelineContextSafe } from "@/features/pipelines";
import { useSceneTypePromptDefaults, useWorkflowPromptSlots } from "@/features/prompt-management/hooks/use-prompt-management";
import { useTrackConfigs } from "@/features/scene-catalogue/hooks/use-track-configs";
import { useWorkflows } from "@/features/workflow-import";

import type { CreateSceneType, SceneType } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SceneTypeEditorProps {
  sceneType?: SceneType;
  onSave: (data: CreateSceneType) => void;
  onCancel: () => void;
  /** Navigate to a specific tab (e.g., "workflows", "prompt-defaults", "video-settings"). */
  onSwitchTab?: (tab: string) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SceneTypeEditor({ sceneType, onSave, onCancel, onSwitchTab }: SceneTypeEditorProps) {
  const isEdit = sceneType !== undefined;

  const [name, setName] = useState(sceneType?.name ?? "");
  const [slug, setSlug] = useState(sceneType?.slug ?? "");
  const [description, setDescription] = useState(sceneType?.description ?? "");
  const [sortOrder, setSortOrder] = useState(sceneType?.sort_order?.toString() ?? "0");
  const [isActive, setIsActive] = useState(sceneType?.is_active ?? true);

  const isNameEmpty = name.trim() === "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNameEmpty) return;

    onSave({
      name: name.trim(),
      slug: slug.trim() || generateSnakeSlug(name.trim()),
      description: description.trim() || null,
      sort_order: sortOrder ? Number.parseInt(sortOrder, 10) : null,
      is_active: isActive,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap={2}>
        {/* Row 1: Name, Slug, Sort, Active */}
        <div className="grid grid-cols-[1fr_1fr_64px_auto] gap-2 items-end">
          <Input label="Name" size="xs" value={name} onChange={(e) => { setName(e.target.value); if (!isEdit) setSlug(generateSnakeSlug(e.target.value)); }} placeholder="Name" required />
          <Input label="Slug" size="xs" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto" disabled={isEdit} />
          <Input label="Sort" size="xs" type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          <div className="flex items-center h-[26px]">
            <Toggle checked={isActive} onChange={setIsActive} label="Active" size="sm" />
          </div>
        </div>

        {/* Row 2: Description */}
        <Input label="Description" size="xs" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />

        {/* Read-only summary (only for existing scene types) */}
        {isEdit && sceneType && <ConfigSummary sceneType={sceneType} onSwitchTab={onSwitchTab} />}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-default)]">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isNameEmpty}>{isEdit ? "Save" : "Create"}</Button>
        </div>
      </Stack>
    </form>
  );
}

/* --------------------------------------------------------------------------
   Tab link button
   -------------------------------------------------------------------------- */

function TabLink({ label, tab, onSwitchTab }: { label: string; tab: string; onSwitchTab?: (tab: string) => void }) {
  if (!onSwitchTab) return <span className={TERMINAL_LABEL}>{label}</span>;
  return (
    <button
      type="button"
      className="font-mono text-[10px] font-medium text-[var(--color-data-cyan)] uppercase tracking-wide hover:text-cyan-300 transition-colors cursor-pointer"
      onClick={() => onSwitchTab(tab)}
    >
      {label} →
    </button>
  );
}

/* --------------------------------------------------------------------------
   Read-only config summary
   -------------------------------------------------------------------------- */

function ConfigSummary({ sceneType, onSwitchTab }: { sceneType: SceneType; onSwitchTab?: (tab: string) => void }) {
  const pipelineCtx = usePipelineContextSafe();
  const { data: workflows } = useWorkflows(undefined, pipelineCtx?.pipelineId);
  const { data: trackConfigs } = useTrackConfigs(sceneType.id);

  const wfName = (wfId: number | null) => {
    if (!wfId) return null;
    return workflows?.find((w) => w.id === wfId)?.name ?? null;
  };

  const trackWorkflows = useMemo(() => {
    return (trackConfigs ?? [])
      .filter((c) => c.workflow_id != null)
      .map((c) => ({
        trackName: c.track_name ?? `Track ${c.track_id}`,
        trackSlug: c.track_slug ?? "",
        isClothesOff: c.is_clothes_off,
        workflowName: wfName(c.workflow_id) ?? `#${c.workflow_id}`,
      }));
  }, [trackConfigs, workflows]); // eslint-disable-line react-hooks/exhaustive-deps

  const fallbackWorkflow = wfName(sceneType.workflow_id);
  const hasWorkflows = trackWorkflows.length > 0 || !!fallbackWorkflow;
  const hasVideoSettings = !!(sceneType.target_duration_secs || sceneType.target_fps || sceneType.target_resolution);

  // Get all unique workflow IDs assigned to this scene type
  const assignedWorkflowIds = useMemo(() => {
    const ids = new Set<number>();
    for (const c of trackConfigs ?? []) {
      if (c.workflow_id != null) ids.add(c.workflow_id);
    }
    if (sceneType.workflow_id) ids.add(sceneType.workflow_id);
    return ids;
  }, [trackConfigs, sceneType.workflow_id]);

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-primary)] border border-[var(--color-border-default)]/30 p-2.5 space-y-2.5">
      {/* Workflows */}
      <div className="space-y-1">
        <TabLink label="Workflows" tab="workflows" onSwitchTab={onSwitchTab} />
        {hasWorkflows ? (
          <div className="space-y-0.5">
            {trackWorkflows.map((tw, i) => (
              <div key={i} className="flex items-center gap-2 font-mono text-[10px]">
                <span className={TRACK_TEXT_COLORS[tw.trackSlug] ?? "text-[var(--color-text-muted)]"}>{tw.trackName}</span>
                {tw.isClothesOff && <span className="text-[var(--color-data-orange)]">[off]</span>}
                <span className="text-[var(--color-text-muted)] opacity-30">→</span>
                <span className="text-[var(--color-text-muted)]">{tw.workflowName}</span>
              </div>
            ))}
            {trackWorkflows.length === 0 && fallbackWorkflow && (
              <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                Default: {fallbackWorkflow}
              </div>
            )}
          </div>
        ) : (
          <div className="font-mono text-[10px] text-[var(--color-data-orange)]">No workflow assigned</div>
        )}
      </div>

      {/* Video settings */}
      <div className="space-y-1">
        <TabLink label="Video Settings" tab="video-settings" onSwitchTab={onSwitchTab} />
        {hasVideoSettings ? (
          <div className="flex items-center gap-3 font-mono text-[10px] text-[var(--color-text-muted)]">
            {sceneType.target_duration_secs && <span>{sceneType.target_duration_secs}s</span>}
            {sceneType.target_fps && <span>{sceneType.target_fps} fps</span>}
            {sceneType.target_resolution && <span>{sceneType.target_resolution}</span>}
            {sceneType.segment_duration_secs && <span>seg: {sceneType.segment_duration_secs}s</span>}
          </div>
        ) : (
          <div className="font-mono text-[10px] text-[var(--color-text-muted)]">Using defaults</div>
        )}
      </div>

      {/* Prompts — from prompt defaults system */}
      <div className="space-y-1">
        <TabLink label="Prompt Defaults" tab="prompt-defaults" onSwitchTab={onSwitchTab} />
        <PromptDefaultsSummary sceneTypeId={sceneType.id} workflowIds={assignedWorkflowIds} />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Prompt defaults summary — fetches slot data from the prompt system
   -------------------------------------------------------------------------- */

function PromptDefaultsSummary({ sceneTypeId, workflowIds }: { sceneTypeId: number; workflowIds: Set<number> }) {
  const { data: defaults } = useSceneTypePromptDefaults(sceneTypeId);

  // Fetch slots for the first workflow (most common case — one workflow per scene type)
  const firstWorkflowId = workflowIds.values().next().value ?? 0;
  const { data: slots } = useWorkflowPromptSlots(firstWorkflowId);

  const entries = useMemo(() => {
    if (!slots?.length) return [];
    // Build map of overrides: slot_id → prompt_text
    const overrideMap = new Map((defaults ?? []).map((d) => [d.prompt_slot_id, d.prompt_text]));

    return slots
      .filter((s) => s.is_user_editable)
      .map((s) => {
        // Use override if exists, otherwise use the slot's default_text
        const text = overrideMap.get(s.id) ?? s.default_text ?? "";
        if (!text.trim()) return null;
        return {
          label: s.slot_label,
          nodeId: s.node_id,
          text,
          type: s.slot_type as "positive" | "negative",
          isOverride: overrideMap.has(s.id),
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => {
        const typeOrder = a.type === "positive" ? 0 : 1;
        const typeOrderB = b.type === "positive" ? 0 : 1;
        return typeOrder - typeOrderB;
      });
  }, [defaults, slots]);

  if (workflowIds.size === 0) {
    return <div className="font-mono text-[10px] text-[var(--color-text-muted)]">No workflow — prompts unavailable</div>;
  }

  if (entries.length === 0) {
    return <div className="font-mono text-[10px] text-[var(--color-text-muted)]">No prompts configured</div>;
  }

  return (
    <div className="space-y-1">
      {entries.map((p, i) => (
        <div
          key={i}
          className={`font-mono text-[10px] border-l-2 pl-1.5 ${
            p.type === "positive"
              ? "text-[var(--color-data-green)]/60 border-l-green-500/30"
              : "text-[var(--color-data-red)]/60 border-l-red-500/30"
          }`}
        >
          <span className="text-[var(--color-text-muted)] opacity-50">{p.label} {p.nodeId}:</span>{" "}
          {p.text.slice(0, 60)}{p.text.length > 60 ? "…" : ""}
        </div>
      ))}
    </div>
  );
}

/**
 * Scene-type-level prompt defaults panel for the Scene Catalogue page.
 *
 * Shows all scene types that have assigned workflows, with collapsible
 * sections per workflow containing editable prompt slots. Saves to
 * scene-type prompt defaults (the "top level" of the prompt hierarchy).
 */

import { useCallback, useMemo, useState } from "react";

import { CollapsibleSection } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, LoadingPane } from "@/components/primitives";
import { Workflow as WorkflowIcon } from "@/tokens/icons";

import { useSceneTypes } from "@/features/scene-types";
import type { SceneType } from "@/features/scene-types";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useWorkflows } from "@/features/workflow-import";
import type { Workflow } from "@/features/workflow-import";
import { useTrackConfigs, type SceneTypeTrackConfig } from "@/features/scene-catalogue";

import {
  useWorkflowPromptSlots,
  useSceneTypePromptDefaults,
  useUpsertPromptDefault,
} from "./hooks/use-prompt-management";
import type { WorkflowPromptSlot } from "./types";

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function SceneTypePromptDefaultsPanel() {
  const pipelineCtx = usePipelineContextSafe();
  const { data: sceneTypes, isLoading: loadingST } = useSceneTypes(undefined, pipelineCtx?.pipelineId);
  const { data: workflows, isLoading: loadingWF } = useWorkflows(undefined, pipelineCtx?.pipelineId);

  if (loadingST || loadingWF) return <LoadingPane />;

  const activeTypes = (sceneTypes ?? []).filter((st) => st.is_active);

  if (!activeTypes.length) {
    return (
      <EmptyState
        title="No Active Scene Types"
        description="Create and activate scene types with workflows to configure prompt defaults."
        icon={<WorkflowIcon />}
      />
    );
  }

  return (
    <Stack gap={4}>
      {activeTypes.map((st) => (
        <SceneTypeSection key={st.id} sceneType={st} workflows={workflows ?? []} />
      ))}
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Per-scene-type section — finds assigned workflows via track configs
   -------------------------------------------------------------------------- */

function SceneTypeSection({
  sceneType,
  workflows,
}: {
  sceneType: SceneType;
  workflows: Workflow[];
}) {
  const { data: configs } = useTrackConfigs(sceneType.id);

  const assignedWorkflows = useMemo(() => {
    const ids = new Set<number>();
    for (const config of configs ?? []) {
      if (config.workflow_id != null) ids.add(config.workflow_id);
    }
    return workflows.filter((w) => ids.has(w.id));
  }, [configs, workflows]);

  const workflowTrackMap = useMemo(() => {
    const map = new Map<number, SceneTypeTrackConfig[]>();
    for (const config of configs ?? []) {
      if (config.workflow_id != null) {
        const list = map.get(config.workflow_id) ?? [];
        list.push(config);
        map.set(config.workflow_id, list);
      }
    }
    return map;
  }, [configs]);

  if (!assignedWorkflows.length) return null;

  return (
    <>
      {assignedWorkflows.map((workflow) => (
        <WorkflowDefaultsSection
          key={`${sceneType.id}-${workflow.id}`}
          sceneType={sceneType}
          workflow={workflow}
          trackConfigs={workflowTrackMap.get(workflow.id) ?? []}
        />
      ))}
    </>
  );
}

/* --------------------------------------------------------------------------
   Per-workflow collapsible section with editable prompt slot defaults
   -------------------------------------------------------------------------- */

function WorkflowDefaultsSection({
  sceneType,
  workflow,
  trackConfigs,
}: {
  sceneType: SceneType;
  workflow: Workflow;
  trackConfigs: SceneTypeTrackConfig[];
}) {
  const { data: slots, isPending: slotsLoading } = useWorkflowPromptSlots(workflow.id);
  const { data: defaults } = useSceneTypePromptDefaults(sceneType.id);
  const upsertDefault = useUpsertPromptDefault();

  // Local draft state: slot_id → prompt text
  const [drafts, setDrafts] = useState<Map<number, string>>(new Map());
  const [initialized, setInitialized] = useState(false);

  // Initialize drafts from existing defaults + slot default_text
  const editableSlots = useMemo(
    () => slots?.filter((s) => s.is_user_editable) ?? [],
    [slots],
  );

  // Build defaults map once data arrives
  const defaultsMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of defaults ?? []) {
      map.set(d.prompt_slot_id, d.prompt_text);
    }
    return map;
  }, [defaults]);

  // Initialize draft state when data loads
  if (!initialized && editableSlots.length > 0 && defaults !== undefined) {
    const initial = new Map<number, string>();
    for (const slot of editableSlots) {
      initial.set(slot.id, defaultsMap.get(slot.id) ?? slot.default_text ?? "");
    }
    setDrafts(initial);
    setInitialized(true);
  }

  const handleChange = useCallback((slotId: number, text: string) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(slotId, text);
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    for (const [slotId, text] of drafts) {
      upsertDefault.mutate({ sceneTypeId: sceneType.id, slotId, promptText: text });
    }
  }, [drafts, upsertDefault, sceneType.id]);

  const trackSummary = trackConfigs
    .map((tc) => {
      const label = tc.track_name ?? `Track ${tc.track_id}`;
      return tc.is_clothes_off ? `${label} (Clothes Off)` : label;
    })
    .join(", ");

  return (
    <CollapsibleSection
      card
      title={`${sceneType.name} — ${workflow.name}`}
      description={trackSummary ? `Tracks: ${trackSummary}` : undefined}
      defaultOpen={false}
    >
      {slotsLoading && <LoadingPane />}

      {!slotsLoading && editableSlots.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)] py-2">
          No editable prompt slots for this workflow.
        </p>
      )}

      {!slotsLoading && editableSlots.length > 0 && (
        <Stack gap={3}>
          {editableSlots.map((slot) => (
            <SlotDefaultEditor
              key={slot.id}
              slot={slot}
              value={drafts.get(slot.id) ?? slot.default_text ?? ""}
              onChange={(text) => handleChange(slot.id, text)}
            />
          ))}

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} loading={upsertDefault.isPending}>
              Save Defaults
            </Button>
          </div>
        </Stack>
      )}
    </CollapsibleSection>
  );
}

/* --------------------------------------------------------------------------
   Single slot default editor — shows label + textarea
   -------------------------------------------------------------------------- */

function SlotDefaultEditor({
  slot,
  value,
  onChange,
}: {
  slot: WorkflowPromptSlot;
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
      <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {slot.slot_label}
      </h4>
      <p className="text-xs text-[var(--color-text-muted)] mb-2">
        Node: {slot.node_id} &middot; Type: {slot.slot_type}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)] resize-y"
        placeholder="Enter default prompt text..."
      />
    </div>
  );
}

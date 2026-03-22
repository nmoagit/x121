/**
 * Workflow-organized prompt override panel.
 *
 * Shows all active workflows (those assigned to enabled scene+track combos)
 * as collapsible sections, each containing the workflow's editable prompt
 * slots with per-scene-type override editing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { CollapsibleSection } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, LoadingPane } from "@/components/primitives";
import { Workflow as WorkflowIcon } from "@/tokens/icons";

import { usePipelineContextSafe } from "@/features/pipelines";
import { useWorkflows } from "@/features/workflow-import";
import type { Workflow } from "@/features/workflow-import";
import {
  useSceneCatalogue,
  useTrackConfigs,
  type SceneCatalogueEntry,
  type SceneTypeTrackConfig,
} from "@/features/scene-catalogue";
import type { EffectiveSceneSetting } from "@/features/scene-catalogue";

import { buildDraftMap, getDefaultText, type OverrideRowLike } from "./draft-utils";
import { useWorkflowPromptSlots, useSceneTypePromptDefaults } from "./hooks/use-prompt-management";
import { SlotOverrideSection } from "./SlotOverrideSection";
import type { PromptFragment, SlotDraft, SlotOverride, WorkflowPromptSlot } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface WorkflowPromptOverridePanelProps {
  /** Effective scene settings for the current level (project/group/avatar). */
  settings: EffectiveSceneSetting[] | undefined;
  settingsLoading: boolean;
  /** Fetch overrides for a scene type at this level. */
  useOverrides: (sceneTypeId: number) => { data: OverrideRowLike[] | undefined; isLoading: boolean };
  /** Save handler — receives scene type ID and slot overrides. */
  onSave: (sceneTypeId: number, overrides: SlotOverride[]) => void;
  isSaving: boolean;
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function WorkflowPromptOverridePanel({
  settings,
  settingsLoading,
  useOverrides,
  onSave,
  isSaving,
}: WorkflowPromptOverridePanelProps) {
  const pipelineCtx = usePipelineContextSafe();
  const { data: allEntries, isLoading: loadingEntries } = useSceneCatalogue(false, pipelineCtx?.pipelineId);
  const { data: workflows, isLoading: loadingWorkflows } = useWorkflows(undefined, pipelineCtx?.pipelineId);

  if (settingsLoading || loadingEntries || loadingWorkflows) return <LoadingPane />;

  const enabledSettings = (settings ?? []).filter((s) => s.is_enabled);
  const enabledSceneTypeIds = new Set(enabledSettings.map((s) => s.scene_type_id));

  // Get scene catalogue entries that are enabled and have tracks
  const entries = (allEntries ?? []).filter(
    (e) => enabledSceneTypeIds.has(e.id) && e.tracks.length > 0,
  );

  if (!entries.length) {
    return (
      <EmptyState
        title="No Active Workflows"
        description="Enable scenes with assigned workflows to configure prompt overrides."
        icon={<WorkflowIcon />}
      />
    );
  }

  return (
    <Stack gap={4}>
      {entries.map((entry) => (
        <SceneTypeWorkflowSection
          key={entry.id}
          entry={entry}
          workflows={workflows ?? []}
          useOverrides={useOverrides}
          onSave={onSave}
          isSaving={isSaving}
        />
      ))}
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Per-scene-type section — fetches track configs to find workflows
   -------------------------------------------------------------------------- */

interface SceneTypeWorkflowSectionProps {
  entry: SceneCatalogueEntry;
  workflows: Workflow[];
  useOverrides: (sceneTypeId: number) => { data: OverrideRowLike[] | undefined; isLoading: boolean };
  onSave: (sceneTypeId: number, overrides: SlotOverride[]) => void;
  isSaving: boolean;
}

function SceneTypeWorkflowSection({
  entry,
  workflows,
  useOverrides,
  onSave,
  isSaving,
}: SceneTypeWorkflowSectionProps) {
  const { data: configs } = useTrackConfigs(entry.id);

  // Find unique workflow IDs assigned to this scene type's tracks
  const assignedWorkflowIds = useMemo(() => {
    const ids = new Set<number>();
    for (const config of configs ?? []) {
      if (config.workflow_id != null) {
        ids.add(config.workflow_id);
      }
    }
    return ids;
  }, [configs]);

  // Build workflow → tracks mapping
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

  if (assignedWorkflowIds.size === 0) return null;

  const assignedWorkflows = workflows.filter((w) => assignedWorkflowIds.has(w.id));

  return (
    <>
      {assignedWorkflows.map((workflow) => (
        <WorkflowPromptSection
          key={`${entry.id}-${workflow.id}`}
          sceneTypeName={entry.name}
          sceneTypeId={entry.id}
          workflow={workflow}
          trackConfigs={workflowTrackMap.get(workflow.id) ?? []}
          useOverrides={useOverrides}
          onSave={onSave}
          isSaving={isSaving}
        />
      ))}
    </>
  );
}

/* --------------------------------------------------------------------------
   Per-workflow collapsible section with prompt slots
   -------------------------------------------------------------------------- */

interface WorkflowPromptSectionProps {
  sceneTypeName: string;
  sceneTypeId: number;
  workflow: Workflow;
  trackConfigs: SceneTypeTrackConfig[];
  useOverrides: (sceneTypeId: number) => { data: OverrideRowLike[] | undefined; isLoading: boolean };
  onSave: (sceneTypeId: number, overrides: SlotOverride[]) => void;
  isSaving: boolean;
}

function WorkflowPromptSection({
  sceneTypeName,
  sceneTypeId,
  workflow,
  trackConfigs,
  useOverrides,
  onSave,
  isSaving,
}: WorkflowPromptSectionProps) {
  const { data: slots, isPending: slotsLoading } = useWorkflowPromptSlots(workflow.id);
  const { data: defaults } = useSceneTypePromptDefaults(sceneTypeId);
  const { data: overrides, isLoading: overridesLoading } = useOverrides(sceneTypeId);

  const [drafts, setDrafts] = useState<Map<number, SlotDraft>>(new Map());

  useEffect(() => {
    setDrafts(buildDraftMap(overrides));
  }, [overrides]);

  const getDraft = useCallback(
    (slotId: number): SlotDraft => drafts.get(slotId) ?? { fragments: [], override_text: "", notes: "" },
    [drafts],
  );

  const updateDraft = useCallback((slotId: number, updater: (prev: SlotDraft) => SlotDraft) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      const current = next.get(slotId) ?? { fragments: [], override_text: "", notes: "" };
      next.set(slotId, updater(current));
      return next;
    });
  }, []);

  const handleAddFragment = useCallback(
    (slotId: number, fragment: PromptFragment) => {
      updateDraft(slotId, (prev) => ({
        ...prev,
        fragments: [
          ...prev.fragments,
          { type: "fragment_ref" as const, fragment_id: fragment.id, text: fragment.text },
        ],
      }));
    },
    [updateDraft],
  );

  const handleRemoveFragment = useCallback(
    (slotId: number, index: number) => {
      updateDraft(slotId, (prev) => ({
        ...prev,
        fragments: prev.fragments.filter((_, i) => i !== index),
      }));
    },
    [updateDraft],
  );

  const handleNotesChange = useCallback(
    (slotId: number, notes: string) => {
      updateDraft(slotId, (prev) => ({ ...prev, notes }));
    },
    [updateDraft],
  );

  const handleOverrideTextChange = useCallback(
    (slotId: number, override_text: string) => {
      updateDraft(slotId, (prev) => ({ ...prev, override_text }));
    },
    [updateDraft],
  );

  const handleSave = useCallback(() => {
    const slotOverrides: SlotOverride[] = [];
    for (const [slotId, draft] of drafts) {
      if (draft.fragments.length > 0 || draft.override_text || draft.notes) {
        slotOverrides.push({
          prompt_slot_id: slotId,
          fragments: draft.fragments,
          override_text: draft.override_text || undefined,
          notes: draft.notes || undefined,
        });
      }
    }
    onSave(sceneTypeId, slotOverrides);
  }, [drafts, onSave, sceneTypeId]);

  const editableSlots = useMemo(
    () => slots?.filter((s: WorkflowPromptSlot) => s.is_user_editable) ?? [],
    [slots],
  );

  // Build track label summary
  const trackSummary = trackConfigs
    .map((tc) => {
      const label = tc.track_name ?? `Track ${tc.track_id}`;
      return tc.is_clothes_off ? `${label} (Clothes Off)` : label;
    })
    .join(", ");

  const sectionTitle = `${sceneTypeName} — ${workflow.name}`;

  return (
    <CollapsibleSection
      card
      title={sectionTitle}
      description={trackSummary ? `Tracks: ${trackSummary}` : undefined}
      defaultOpen={false}
    >
      {(slotsLoading || overridesLoading) && <LoadingPane />}

      {!slotsLoading && !overridesLoading && editableSlots.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)] py-2">
          No editable prompt slots for this workflow.
        </p>
      )}

      {!slotsLoading && !overridesLoading && editableSlots.length > 0 && (
        <Stack gap={3}>
          {editableSlots.map((slot: WorkflowPromptSlot) => (
            <SlotOverrideSection
              key={slot.id}
              slot={slot}
              baseText={getDefaultText(slot, defaults)}
              draft={getDraft(slot.id)}
              sceneTypeId={sceneTypeId}
              onAddFragment={(f) => handleAddFragment(slot.id, f)}
              onRemoveFragment={(i) => handleRemoveFragment(slot.id, i)}
              onOverrideTextChange={(t) => handleOverrideTextChange(slot.id, t)}
              onNotesChange={(n) => handleNotesChange(slot.id, n)}
            />
          ))}

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} loading={isSaving}>
              Save Overrides
            </Button>
          </div>
        </Stack>
      )}
    </CollapsibleSection>
  );
}

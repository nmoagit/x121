/**
 * Generic prompt override editor for project, group, and character levels.
 *
 * Renders slot-level fragment overrides for a specific scene type. The parent
 * component provides the override data and save handler — this component is
 * level-agnostic.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/primitives/Button";
import { Select } from "@/components/primitives/Select";
import { Spinner } from "@/components/primitives/Spinner";
import { useSceneTypes } from "@/features/scene-types/hooks/use-scene-types";
import { SECTION_HEADING } from "@/lib/ui-classes";

import { buildDraftMap, getDefaultText, type OverrideRowLike } from "./draft-utils";
import {
  useSceneTypePromptDefaults,
  useWorkflowPromptSlots,
} from "./hooks/use-prompt-management";
import { SlotOverrideSection } from "./SlotOverrideSection";
import type {
  PromptFragment,
  SlotDraft,
  SlotOverride,
} from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

/** Re-export for convenience — callers can reference the override row shape. */
export type { OverrideRowLike as OverrideRow } from "./draft-utils";

interface PromptOverrideEditorProps {
  /** Label for the hierarchy level, e.g. "Project", "Group", "Character". */
  levelLabel: string;
  /** Project ID — used to list available scene types. */
  projectId: number;
  /** Currently selected scene type (controlled externally or defaults to first). */
  sceneTypeId: number | null;
  /** Called when the user changes scene type selection. */
  onSceneTypeChange: (id: number) => void;
  /** Workflow ID for the selected scene type (to load prompt slots). */
  workflowId: number | null;
  /** Override rows for the selected scene type. */
  overrides: OverrideRowLike[] | undefined;
  /** Whether override data is loading. */
  isLoading: boolean;
  /** Save handler — receives slot overrides for the selected scene type. */
  onSave: (overrides: SlotOverride[]) => void;
  /** Whether save is in progress. */
  isSaving: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PromptOverrideEditor({
  levelLabel,
  projectId,
  sceneTypeId,
  onSceneTypeChange,
  workflowId,
  overrides,
  isLoading,
  onSave,
  isSaving,
}: PromptOverrideEditorProps) {
  const { data: sceneTypes, isLoading: sceneTypesLoading } = useSceneTypes(projectId);
  const { data: slots, isPending: slotsLoading } = useWorkflowPromptSlots(workflowId ?? 0);
  const { data: defaults } = useSceneTypePromptDefaults(sceneTypeId ?? 0);

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
    onSave(slotOverrides);
  }, [drafts, onSave]);

  const editableSlots = useMemo(
    () => slots?.filter((s) => s.is_user_editable) ?? [],
    [slots],
  );

  const sceneTypeOptions = useMemo(
    () =>
      (sceneTypes ?? []).map((st) => ({
        value: String(st.id),
        label: st.name,
      })),
    [sceneTypes],
  );

  if (sceneTypesLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className={SECTION_HEADING}>
          {levelLabel} Prompt Overrides
        </h3>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Add prompt fragments per scene type at the {levelLabel.toLowerCase()} level.
        </p>
      </div>

      <Select
        label="Scene Type"
        value={sceneTypeId ? String(sceneTypeId) : ""}
        onChange={(val) => {
          const num = Number(val);
          if (num > 0) onSceneTypeChange(num);
        }}
        options={[{ value: "", label: "Select a scene type..." }, ...sceneTypeOptions]}
      />

      {!sceneTypeId && (
        <p className="text-sm text-[var(--color-text-muted)] py-4">
          Select a scene type to configure prompt overrides.
        </p>
      )}

      {sceneTypeId && !workflowId && (
        <p className="text-sm text-[var(--color-text-muted)] py-4">
          This scene type has no workflow assigned. Assign a workflow first.
        </p>
      )}

      {sceneTypeId && workflowId && (isLoading || slotsLoading) && (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      )}

      {sceneTypeId && workflowId && !isLoading && !slotsLoading && editableSlots.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)] py-4">
          No editable prompt slots for this workflow.
        </p>
      )}

      {sceneTypeId && workflowId && !isLoading && !slotsLoading && editableSlots.length > 0 && (
        <>
          {editableSlots.map((slot) => (
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
            <Button onClick={handleSave} loading={isSaving}>
              Save Overrides
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

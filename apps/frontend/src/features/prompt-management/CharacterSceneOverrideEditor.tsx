/**
 * Character + scene prompt override editor (PRD-115).
 *
 * Allows editing per-slot prompt overrides for a specific
 * character / scene-type combination, with fragment support.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/primitives/Button";
import { Spinner } from "@/components/primitives/Spinner";

import {
  useCharacterSceneOverrides,
  useSceneTypePromptDefaults,
  useUpsertCharacterSceneOverrides,
  useWorkflowPromptSlots,
} from "./hooks/use-prompt-management";
import { SlotOverrideSection } from "./SlotOverrideSection";
import type {
  CharacterScenePromptOverride,
  PromptFragment,
  SceneTypePromptDefault,
  SlotDraft,
  SlotOverride,
  WorkflowPromptSlot,
} from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface CharacterSceneOverrideEditorProps {
  characterId: number;
  sceneTypeId: number;
  workflowId: number;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function buildOverrideMap(overrides: CharacterScenePromptOverride[] | undefined): Map<number, SlotDraft> {
  const map = new Map<number, SlotDraft>();
  if (!overrides) return map;
  for (const o of overrides) {
    map.set(o.prompt_slot_id, { fragments: [...o.fragments], notes: o.notes ?? "" });
  }
  return map;
}

function getDefaultText(
  slot: WorkflowPromptSlot,
  defaults: SceneTypePromptDefault[] | undefined,
): string {
  const found = defaults?.find((d) => d.prompt_slot_id === slot.id);
  if (found) return found.prompt_text;
  return slot.default_text ?? "";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterSceneOverrideEditor({
  characterId,
  sceneTypeId,
  workflowId,
}: CharacterSceneOverrideEditorProps) {
  const { data: slots, isPending: slotsLoading } = useWorkflowPromptSlots(workflowId);
  const { data: defaults } = useSceneTypePromptDefaults(sceneTypeId);
  const { data: overrides, isPending: overridesLoading } = useCharacterSceneOverrides(
    characterId,
    sceneTypeId,
  );
  const upsertOverrides = useUpsertCharacterSceneOverrides();

  const [drafts, setDrafts] = useState<Map<number, SlotDraft>>(new Map());

  useEffect(() => {
    setDrafts(buildOverrideMap(overrides));
  }, [overrides]);

  const getDraft = useCallback(
    (slotId: number): SlotDraft => drafts.get(slotId) ?? { fragments: [], notes: "" },
    [drafts],
  );

  const updateDraft = useCallback((slotId: number, updater: (prev: SlotDraft) => SlotDraft) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      const current = next.get(slotId) ?? { fragments: [], notes: "" };
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

  const handleSave = useCallback(() => {
    const slotOverrides: SlotOverride[] = [];
    for (const [slotId, draft] of drafts) {
      if (draft.fragments.length > 0 || draft.notes) {
        slotOverrides.push({
          prompt_slot_id: slotId,
          fragments: draft.fragments,
          notes: draft.notes || undefined,
        });
      }
    }
    upsertOverrides.mutate({ characterId, sceneTypeId, overrides: slotOverrides });
  }, [drafts, characterId, sceneTypeId, upsertOverrides]);

  const editableSlots = useMemo(
    () => slots?.filter((s) => s.is_user_editable) ?? [],
    [slots],
  );

  if (slotsLoading || overridesLoading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="override-editor-loading">
        <Spinner />
      </div>
    );
  }

  if (!editableSlots.length) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-4" data-testid="override-editor-empty">
        No editable prompt slots for this workflow.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="override-editor">
      {editableSlots.map((slot) => (
        <SlotOverrideSection
          key={slot.id}
          slot={slot}
          baseText={getDefaultText(slot, defaults)}
          draft={getDraft(slot.id)}
          sceneTypeId={sceneTypeId}
          onAddFragment={(f) => handleAddFragment(slot.id, f)}
          onRemoveFragment={(i) => handleRemoveFragment(slot.id, i)}
          onNotesChange={(n) => handleNotesChange(slot.id, n)}
        />
      ))}

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          loading={upsertOverrides.isPending}
          data-testid="override-save-btn"
        >
          Save Overrides
        </Button>
      </div>
    </div>
  );
}

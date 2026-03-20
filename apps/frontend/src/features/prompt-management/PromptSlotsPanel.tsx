import { WireframeLoader } from "@/components/primitives";
/**
 * Workflow prompt slots panel (PRD-115).
 *
 * Displays all prompt slots for a workflow with editable default text
 * per scene type.
 */

import { useCallback, useMemo, useState } from "react";


import {
  useSceneTypePromptDefaults,
  useUpsertPromptDefault,
  useWorkflowPromptSlots,
} from "./hooks/use-prompt-management";
import { SlotCard } from "./SlotCard";
import type { SceneTypePromptDefault, WorkflowPromptSlot } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface PromptSlotsPanelProps {
  workflowId: number;
  sceneTypeId: number;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Build a map of slot_id -> prompt_text from defaults. */
function buildDefaultsMap(defaults: SceneTypePromptDefault[] | undefined): Map<number, string> {
  const map = new Map<number, string>();
  if (!defaults) return map;
  for (const d of defaults) {
    map.set(d.prompt_slot_id, d.prompt_text);
  }
  return map;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PromptSlotsPanel({ workflowId, sceneTypeId }: PromptSlotsPanelProps) {
  const { data: slots, isPending: slotsLoading } = useWorkflowPromptSlots(workflowId);
  const { data: defaults, isPending: defaultsLoading } = useSceneTypePromptDefaults(sceneTypeId);
  const upsertDefault = useUpsertPromptDefault();

  const defaultsMap = useMemo(() => buildDefaultsMap(defaults), [defaults]);
  const [drafts, setDrafts] = useState<Map<number, string>>(new Map());

  const getSlotText = useCallback(
    (slot: WorkflowPromptSlot): string => {
      if (drafts.has(slot.id)) return drafts.get(slot.id)!;
      if (defaultsMap.has(slot.id)) return defaultsMap.get(slot.id)!;
      return slot.default_text ?? "";
    },
    [drafts, defaultsMap],
  );

  const handleDraftChange = useCallback((slotId: number, text: string) => {
    setDrafts((prev) => new Map(prev).set(slotId, text));
  }, []);

  const handleSave = useCallback(
    (slotId: number) => {
      const text = drafts.get(slotId);
      if (text == null) return;
      upsertDefault.mutate(
        { sceneTypeId, slotId, promptText: text },
        {
          onSuccess: () =>
            setDrafts((prev) => {
              const next = new Map(prev);
              next.delete(slotId);
              return next;
            }),
        },
      );
    },
    [drafts, sceneTypeId, upsertDefault],
  );

  if (slotsLoading || defaultsLoading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="prompt-slots-loading">
        <WireframeLoader size={48} />
      </div>
    );
  }

  if (!slots?.length) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-4" data-testid="prompt-slots-empty">
        No prompt slots defined for this workflow.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="prompt-slots-panel">
      {slots.map((slot) => (
        <SlotCard
          key={slot.id}
          slot={slot}
          text={getSlotText(slot)}
          isDirty={drafts.has(slot.id)}
          isSaving={upsertDefault.isPending}
          onTextChange={(text) => handleDraftChange(slot.id, text)}
          onSave={() => handleSave(slot.id)}
        />
      ))}
    </div>
  );
}

import { WireframeLoader } from "@/components/primitives";
/**
 * Avatar + scene prompt override editor (PRD-115).
 *
 * Allows editing per-slot prompt overrides for a specific
 * avatar / scene-type combination, with fragment support.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/primitives/Button";

import { buildDraftMap, getDefaultText } from "./draft-utils";
import {
  useAvatarSceneOverrides,
  useSceneTypePromptDefaults,
  useUpsertAvatarSceneOverrides,
  useWorkflowPromptSlots,
} from "./hooks/use-prompt-management";
import { SlotOverrideSection } from "./SlotOverrideSection";
import type {
  PromptFragment,
  SlotDraft,
  SlotOverride,
} from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface AvatarSceneOverrideEditorProps {
  avatarId: number;
  sceneTypeId: number;
  workflowId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AvatarSceneOverrideEditor({
  avatarId,
  sceneTypeId,
  workflowId,
}: AvatarSceneOverrideEditorProps) {
  const { data: slots, isPending: slotsLoading } = useWorkflowPromptSlots(workflowId);
  const { data: defaults } = useSceneTypePromptDefaults(sceneTypeId);
  const { data: overrides, isPending: overridesLoading } = useAvatarSceneOverrides(
    avatarId,
    sceneTypeId,
  );
  const upsertOverrides = useUpsertAvatarSceneOverrides();

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
    upsertOverrides.mutate({ avatarId, sceneTypeId, overrides: slotOverrides });
  }, [drafts, avatarId, sceneTypeId, upsertOverrides]);

  const editableSlots = useMemo(
    () => slots?.filter((s) => s.is_user_editable) ?? [],
    [slots],
  );

  if (slotsLoading || overridesLoading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="override-editor-loading">
        <WireframeLoader size={48} />
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
          onOverrideTextChange={(t) => handleOverrideTextChange(slot.id, t)}
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

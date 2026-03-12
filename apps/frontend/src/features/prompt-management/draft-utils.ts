/**
 * Shared draft-map helpers for prompt override editors (PRD-115).
 *
 * Both PromptOverrideEditor and CharacterSceneOverrideEditor convert
 * override rows into a Map<slotId, SlotDraft>.  This module provides a
 * single implementation for that conversion plus the default-text lookup.
 */

import type { SceneTypePromptDefault, SlotDraft, WorkflowPromptSlot } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

/** Minimal shape that any override row must satisfy (project, group, or character). */
export interface OverrideRowLike {
  prompt_slot_id: number;
  fragments: { type: "fragment_ref" | "inline"; fragment_id?: number; text: string }[];
  override_text: string | null;
  notes: string | null;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/**
 * Convert an array of override rows into a Map keyed by prompt_slot_id.
 * Works for project, group, and character override shapes alike.
 */
export function buildDraftMap(overrides: OverrideRowLike[] | undefined): Map<number, SlotDraft> {
  const map = new Map<number, SlotDraft>();
  if (!overrides) return map;
  for (const o of overrides) {
    map.set(o.prompt_slot_id, {
      fragments: [...o.fragments],
      override_text: o.override_text ?? "",
      notes: o.notes ?? "",
    });
  }
  return map;
}

/**
 * Resolve the default prompt text for a slot: prefer the scene-type default,
 * fall back to the slot's own default_text.
 */
export function getDefaultText(
  slot: WorkflowPromptSlot,
  defaults: SceneTypePromptDefault[] | undefined,
): string {
  const found = defaults?.find((d) => d.prompt_slot_id === slot.id);
  if (found) return found.prompt_text;
  return slot.default_text ?? "";
}

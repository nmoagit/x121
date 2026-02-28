/**
 * Prompt management types (PRD-115).
 */

/* --------------------------------------------------------------------------
   Workflow prompt slots
   -------------------------------------------------------------------------- */

export interface WorkflowPromptSlot {
  id: number;
  workflow_id: number;
  node_id: string;
  input_name: string;
  slot_label: string;
  slot_type: "positive" | "negative";
  sort_order: number;
  default_text: string | null;
  is_user_editable: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateWorkflowPromptSlot {
  slot_label?: string;
  slot_type?: string;
  sort_order?: number;
  default_text?: string;
  is_user_editable?: boolean;
  description?: string;
}

/* --------------------------------------------------------------------------
   Scene type prompt defaults
   -------------------------------------------------------------------------- */

export interface SceneTypePromptDefault {
  id: number;
  scene_type_id: number;
  prompt_slot_id: number;
  prompt_text: string;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Character scene prompt overrides
   -------------------------------------------------------------------------- */

export interface CharacterScenePromptOverride {
  id: number;
  character_id: number;
  scene_type_id: number;
  prompt_slot_id: number;
  fragments: FragmentEntry[];
  notes: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface FragmentEntry {
  type: "fragment_ref" | "inline";
  fragment_id?: number;
  text: string;
}

/* --------------------------------------------------------------------------
   Prompt fragments
   -------------------------------------------------------------------------- */

export interface PromptFragment {
  id: number;
  text: string;
  description: string | null;
  category: string | null;
  tags: string[];
  usage_count: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePromptFragment {
  text: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
}

export interface UpdatePromptFragment {
  text?: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
}

/* --------------------------------------------------------------------------
   Prompt resolution / preview
   -------------------------------------------------------------------------- */

export interface ResolvedPromptSlot {
  slot_id: number;
  node_id: string;
  input_name: string;
  slot_label: string;
  slot_type: "positive" | "negative";
  resolved_text: string;
  source: "workflow_default" | "scene_type_default" | "with_fragments";
  unresolved_placeholders: string[];
  applied_fragments: AppliedFragment[];
}

export interface AppliedFragment {
  fragment_id: number | null;
  text: string;
  is_inline: boolean;
}

/* --------------------------------------------------------------------------
   Slot draft (shared by override editor components)
   -------------------------------------------------------------------------- */

export interface SlotDraft {
  fragments: FragmentEntry[];
  notes: string;
}

/* --------------------------------------------------------------------------
   Request / param types
   -------------------------------------------------------------------------- */

export interface SlotOverride {
  prompt_slot_id: number;
  fragments: FragmentEntry[];
  notes?: string;
}

export interface ResolvePromptRequest {
  workflow_id: number;
  scene_type_id: number;
  character_id: number;
  slot_id?: number;
}

export interface FragmentListParams {
  search?: string;
  category?: string;
  scene_type_id?: number;
  limit?: number;
  offset?: number;
}

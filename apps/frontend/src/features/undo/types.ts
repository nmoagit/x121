/**
 * Undo/Redo Architecture types (PRD-51).
 */

/** A single node in the undo tree. */
export interface UndoNode {
  id: string;
  parentId: string | null;
  action: UndoableAction;
  timestamp: number;
  children: string[];
}

/** An action that can be undone/redone. */
export interface UndoableAction {
  type: string;
  label: string;
  forward: SerializedCommand;
  reverse: SerializedCommand;
}

/** A serialized command that can be replayed. */
export interface SerializedCommand {
  type: string;
  payload: Record<string, unknown>;
}

/** The full tree data structure persisted to the server. */
export interface UndoTreeData {
  nodes: Record<string, UndoNode>;
  rootId: string;
  currentNodeId: string;
}

/** Server-side undo tree entity as returned by the API. */
export interface UndoTreeEntity {
  id: number;
  user_id: number;
  entity_type: string;
  entity_id: number;
  tree_json: UndoTreeData | Record<string, never>;
  current_node_id: string | null;
  created_at: string;
  updated_at: string;
}

/** DTO for saving an undo tree to the server. */
export interface SaveUndoTreeInput {
  tree_json: UndoTreeData;
  current_node_id: string | null;
}

/** Actions that cannot be undone. */
export const NON_UNDOABLE_ACTIONS = [
  "completed_generation",
  "disk_reclamation",
  "audit_log_entry",
] as const;

export type NonUndoableAction = (typeof NON_UNDOABLE_ACTIONS)[number];

/** Check if an action type is non-undoable. */
export function isNonUndoable(actionType: string): boolean {
  return (NON_UNDOABLE_ACTIONS as readonly string[]).includes(actionType);
}

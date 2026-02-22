/**
 * Undo/Redo feature barrel export (PRD-51).
 */

// Data structure
export { UndoTree } from "./UndoTree";

// Components
export { HistoryBrowser } from "./HistoryBrowser";
export { NonUndoableWarning } from "./NonUndoableWarning";
export { StatePreview } from "./StatePreview";

// Hooks
export {
  useUndoTree,
  useSaveUndoTree,
  useDeleteUndoTree,
  useUserUndoTrees,
  undoTreeKeys,
} from "./hooks/use-undo-tree";
export { useEntityUndo } from "./hooks/use-entity-undo";

// Types
export type {
  UndoNode,
  UndoableAction,
  SerializedCommand,
  UndoTreeData,
  UndoTreeEntity,
  SaveUndoTreeInput,
  NonUndoableAction,
} from "./types";

export { NON_UNDOABLE_ACTIONS, isNonUndoable } from "./types";

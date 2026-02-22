/**
 * Main undo/redo hook for entity-scoped operations (PRD-51).
 *
 * Manages a local UndoTree instance, loads from the server on mount,
 * and saves back to the server (debounced) on change.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { UndoTree } from "../UndoTree";
import type { UndoableAction, UndoTreeData } from "../types";

import { useSaveUndoTree, useUndoTree } from "./use-undo-tree";

/** Debounce delay for saving undo tree to server (ms). */
const SAVE_DEBOUNCE_MS = 1000;

export function useEntityUndo(entityType: string, entityId: number) {
  const [tree, setTree] = useState<UndoTree>(() => new UndoTree());
  const [version, setVersion] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  const { data: serverTree } = useUndoTree(entityType, entityId);
  const saveMutation = useSaveUndoTree(entityType, entityId);

  // Hydrate from server on first load
  useEffect(() => {
    if (serverTree && !initializedRef.current) {
      const treeJson = serverTree.tree_json;
      if (treeJson && "rootId" in treeJson && "nodes" in treeJson && "currentNodeId" in treeJson) {
        const loaded = UndoTree.fromJSON(treeJson as UndoTreeData);
        setTree(loaded);
      }
      initializedRef.current = true;
    }
  }, [serverTree]);

  // Debounced save to server
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      const data = tree.toJSON();
      saveMutation.mutate({
        tree_json: data,
        current_node_id: data.currentNodeId,
      });
    }, SAVE_DEBOUNCE_MS);
  }, [tree, saveMutation]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const pushAction = useCallback(
    (action: UndoableAction) => {
      tree.pushAction(action);
      setVersion((v) => v + 1);
      scheduleSave();
    },
    [tree, scheduleSave],
  );

  const undo = useCallback(() => {
    const action = tree.undo();
    if (action) {
      setVersion((v) => v + 1);
      scheduleSave();
    }
    return action;
  }, [tree, scheduleSave]);

  const redo = useCallback(
    (branchIndex?: number) => {
      const action = tree.redo(branchIndex);
      if (action) {
        setVersion((v) => v + 1);
        scheduleSave();
      }
      return action;
    },
    [tree, scheduleSave],
  );

  const currentNode = tree.getCurrentNode();
  const branches = tree.getBranches();

  return {
    pushAction,
    undo,
    redo,
    canUndo: tree.canUndo,
    canRedo: tree.canRedo,
    branches,
    currentNode,
    tree,
    /** Internal version counter, useful for triggering re-renders. */
    version,
  };
}

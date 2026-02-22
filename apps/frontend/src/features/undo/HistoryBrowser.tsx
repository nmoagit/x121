/**
 * Tree visualization component for undo/redo history (PRD-51).
 *
 * Displays the undo tree as a branching timeline, highlights the current
 * node, and allows click-to-navigate to any point in history.
 */

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Spinner } from "@/components/primitives/Spinner";

import { UndoTree } from "./UndoTree";
import type { UndoNode } from "./types";

interface HistoryBrowserProps {
  /** The undo tree instance to display. */
  tree: UndoTree;
  /** Callback when the user clicks on a node to navigate to it. */
  onNavigate: (nodeId: string) => void;
  /** Whether a save is in progress. */
  isSaving?: boolean;
}

export function HistoryBrowser({
  tree,
  onNavigate,
  isSaving = false,
}: HistoryBrowserProps) {
  const currentNodeId = tree.getCurrentNodeId();
  const rootId = tree.getRootId();
  const rootNode = tree.getNode(rootId);

  if (!rootNode) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]">
        No history available.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2" role="tree" aria-label="Undo history">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          History
        </span>
        {isSaving && <Spinner size="sm" />}
      </div>
      <HistoryNodeItem
        node={rootNode}
        tree={tree}
        currentNodeId={currentNodeId}
        onNavigate={onNavigate}
        depth={0}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Internal recursive node renderer
   -------------------------------------------------------------------------- */

interface HistoryNodeItemProps {
  node: UndoNode;
  tree: UndoTree;
  currentNodeId: string;
  onNavigate: (nodeId: string) => void;
  depth: number;
}

function HistoryNodeItem({
  node,
  tree,
  currentNodeId,
  onNavigate,
  depth,
}: HistoryNodeItemProps) {
  const isCurrent = node.id === currentNodeId;
  const hasBranches = node.children.length > 1;

  return (
    <div
      className="flex flex-col"
      role="treeitem"
      aria-current={isCurrent ? "true" : undefined}
      data-node-id={node.id}
    >
      <Button
        size="sm"
        variant={isCurrent ? "primary" : "ghost"}
        onClick={() => onNavigate(node.id)}
        className="justify-start text-left w-full"
      >
        <span
          className="truncate text-xs"
          style={{ paddingLeft: `${depth * 12}px` }}
        >
          {node.action.label}
        </span>
        {isCurrent && (
          <span className="ml-auto shrink-0">
            <Badge variant="info" size="sm">
              Current
            </Badge>
          </span>
        )}
        {hasBranches && (
          <span className="ml-1 shrink-0">
            <Badge variant="default" size="sm">
              {node.children.length} branches
            </Badge>
          </span>
        )}
      </Button>

      {/* Render children recursively */}
      {node.children.map((childId) => {
        const childNode = tree.getNode(childId);
        if (!childNode) return null;
        return (
          <HistoryNodeItem
            key={childId}
            node={childNode}
            tree={tree}
            currentNodeId={currentNodeId}
            onNavigate={onNavigate}
            depth={depth + 1}
          />
        );
      })}
    </div>
  );
}

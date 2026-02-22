/**
 * State preview panel for undo tree nodes (PRD-51).
 *
 * Displays details about a node in the undo tree when the user
 * hovers or clicks on a history entry. Shows the action type,
 * label, timestamp, and serialized command data.
 */

import { Badge } from "@/components/primitives/Badge";
import { formatDateTime } from "@/lib/format";

import type { UndoNode } from "./types";
import { isNonUndoable } from "./types";

interface StatePreviewProps {
  /** The node to preview. */
  node: UndoNode | null;
}

export function StatePreview({ node }: StatePreviewProps) {
  if (!node) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]">
        Hover over a history entry to preview.
      </div>
    );
  }

  const nonUndoable = isNonUndoable(node.action.type);
  const timestampIso = new Date(node.timestamp).toISOString();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {node.action.label}
        </span>
        {nonUndoable && (
          <Badge variant="warning" size="sm">
            Non-undoable
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
        <span>
          Type: <code className="font-mono">{node.action.type}</code>
        </span>
        <span>
          Time: {formatDateTime(timestampIso)}
        </span>
        <span>
          Node ID: <code className="font-mono">{node.id}</code>
        </span>
        {node.parentId && (
          <span>
            Parent: <code className="font-mono">{node.parentId}</code>
          </span>
        )}
        {node.children.length > 0 && (
          <span>
            Branches: {node.children.length}
          </span>
        )}
      </div>

      <div className="mt-1">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
          Forward command
        </span>
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-[var(--color-bg-inset)] p-2 text-xs font-mono text-[var(--color-text-secondary)]">
          {JSON.stringify(node.action.forward, null, 2)}
        </pre>
      </div>

      <div>
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
          Reverse command
        </span>
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-[var(--color-bg-inset)] p-2 text-xs font-mono text-[var(--color-text-secondary)]">
          {JSON.stringify(node.action.reverse, null, 2)}
        </pre>
      </div>
    </div>
  );
}

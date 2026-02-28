/**
 * Action buttons for a selected treemap node (PRD-19).
 *
 * Provides quick-action links such as "View details" and
 * "Reclaim space" for the node the user clicks on.
 */

import { Button } from "@/components/primitives";
import { Eye, Trash2 } from "@/tokens/icons";

import type { TreemapNode } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface TreemapActionsProps {
  node: TreemapNode;
  onViewDetails?: (node: TreemapNode) => void;
  onReclaim?: (node: TreemapNode) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TreemapActions({ node, onViewDetails, onReclaim }: TreemapActionsProps) {
  const hasReclaimable = node.reclaimable_bytes > 0;

  return (
    <div className="flex items-center gap-2">
      {onViewDetails && (
        <Button
          variant="ghost"
          size="sm"
          icon={<Eye size={14} />}
          onClick={() => onViewDetails(node)}
        >
          View details
        </Button>
      )}
      {onReclaim && hasReclaimable && (
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 size={14} />}
          onClick={() => onReclaim(node)}
        >
          Reclaim space
        </Button>
      )}
    </div>
  );
}

/**
 * Chain graph layout computation (PRD-97).
 *
 * Computes node positions for the directed trigger chain graph
 * using topological depth (BFS) assignment.
 */

import type { ChainGraphNode } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 72;
export const NODE_GAP_X = 80;
export const NODE_GAP_Y = 32;

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface LayoutNode {
  node: ChainGraphNode;
  x: number;
  y: number;
  depth: number;
}

/* --------------------------------------------------------------------------
   Layout algorithm
   -------------------------------------------------------------------------- */

/** Compute node positions using topological depth assignment. */
export function computeLayout(nodes: ChainGraphNode[]): LayoutNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.trigger_id, n]));

  // Compute depth for each node via BFS from roots
  const depths = new Map<number, number>();
  const inDegree = new Map<number, number>();

  for (const node of nodes) {
    inDegree.set(node.trigger_id, 0);
  }
  for (const node of nodes) {
    for (const downstream of node.downstream_triggers) {
      if (nodeMap.has(downstream)) {
        inDegree.set(downstream, (inDegree.get(downstream) ?? 0) + 1);
      }
    }
  }

  // Roots are nodes with no incoming edges
  const queue: number[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
      depths.set(id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depths.get(current) ?? 0;
    const node = nodeMap.get(current);
    if (!node) continue;

    for (const downstream of node.downstream_triggers) {
      const existing = depths.get(downstream) ?? -1;
      if (currentDepth + 1 > existing) {
        depths.set(downstream, currentDepth + 1);
      }
      const remaining = (inDegree.get(downstream) ?? 1) - 1;
      inDegree.set(downstream, remaining);
      if (remaining <= 0) {
        queue.push(downstream);
      }
    }
  }

  // Group by depth for column layout
  const columns = new Map<number, ChainGraphNode[]>();
  for (const node of nodes) {
    const depth = depths.get(node.trigger_id) ?? 0;
    const col = columns.get(depth) ?? [];
    col.push(node);
    columns.set(depth, col);
  }

  // Assign x/y positions
  const result: LayoutNode[] = [];
  for (const [depth, col] of columns) {
    col.forEach((node, idx) => {
      result.push({
        node,
        x: depth * (NODE_WIDTH + NODE_GAP_X),
        y: idx * (NODE_HEIGHT + NODE_GAP_Y),
        depth,
      });
    });
  }

  return result;
}

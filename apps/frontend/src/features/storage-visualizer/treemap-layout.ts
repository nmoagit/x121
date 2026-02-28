/**
 * Simple squarified treemap layout algorithm (PRD-19).
 *
 * Produces rectangles for an SVG-based treemap without requiring
 * d3-hierarchy as a dependency. Uses the "squarify" approach to
 * minimise aspect ratios of individual cells.
 */

import type { TreemapNode } from "./types";

/* --------------------------------------------------------------------------
   Public types
   -------------------------------------------------------------------------- */

/** A positioned rectangle in the treemap. */
export interface TreemapRect {
  x: number;
  y: number;
  width: number;
  height: number;
  node: TreemapNode;
  /** Depth-based colour hue (0-360). */
  hue: number;
}

/* --------------------------------------------------------------------------
   Layout
   -------------------------------------------------------------------------- */

/** Hue values assigned by entity type. */
const ENTITY_HUES: Record<string, number> = {
  project: 220,
  character: 150,
  scene: 35,
  segment: 280,
};

const DEFAULT_HUE = 200;

/**
 * Compute a flat array of positioned rects for the immediate
 * children of `root`, fitting within `width` x `height`.
 */
export function computeTreemapLayout(
  root: TreemapNode,
  width: number,
  height: number,
): TreemapRect[] {
  const children = [...root.children].sort((a, b) => b.size - a.size);
  if (children.length === 0 || width <= 0 || height <= 0) return [];

  const totalSize = children.reduce((s, c) => s + c.size, 0);
  if (totalSize === 0) return [];

  return squarify(children, 0, 0, width, height, totalSize);
}

/* --------------------------------------------------------------------------
   Squarify implementation
   -------------------------------------------------------------------------- */

function squarify(
  nodes: TreemapNode[],
  x: number,
  y: number,
  w: number,
  h: number,
  totalSize: number,
): TreemapRect[] {
  if (nodes.length === 0 || w <= 0 || h <= 0) return [];

  // For a single node, just fill the remaining space.
  if (nodes.length === 1) {
    const node = nodes[0]!;
    return [makeRect(node, x, y, w, h)];
  }

  // Slice-and-dice: lay out the first group along the shorter side,
  // then recurse for the remainder.
  const isVertical = h > w;
  const side = isVertical ? h : w;

  // Greedily add nodes to the current row while aspect ratio improves.
  let rowSize = 0;
  let rowNodes: TreemapNode[] = [];
  let bestWorst = Number.POSITIVE_INFINITY;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const nextSize = rowSize + node.size;
    const nextRow = [...rowNodes, node];
    const worst = worstAspect(nextRow, nextSize, side, totalSize);

    if (worst <= bestWorst) {
      rowSize = nextSize;
      rowNodes = nextRow;
      bestWorst = worst;
    } else {
      break;
    }
  }

  // Layout the chosen row.
  const rowFraction = rowSize / totalSize;
  const rowThickness = isVertical ? h * rowFraction : w * rowFraction;

  const rects = layoutRow(
    rowNodes,
    rowSize,
    x,
    y,
    isVertical ? w : rowThickness,
    isVertical ? rowThickness : h,
    isVertical,
  );

  // Recurse for remainder.
  const remaining = nodes.slice(rowNodes.length);
  if (remaining.length > 0) {
    const remainderSize = totalSize - rowSize;
    const nx = isVertical ? x : x + rowThickness;
    const ny = isVertical ? y + rowThickness : y;
    const nw = isVertical ? w : w - rowThickness;
    const nh = isVertical ? h - rowThickness : h;
    rects.push(...squarify(remaining, nx, ny, nw, nh, remainderSize));
  }

  return rects;
}

function layoutRow(
  nodes: TreemapNode[],
  rowSize: number,
  x: number,
  y: number,
  w: number,
  h: number,
  isVertical: boolean,
): TreemapRect[] {
  const rects: TreemapRect[] = [];
  let offset = 0;

  for (const node of nodes) {
    const fraction = rowSize > 0 ? node.size / rowSize : 0;
    if (isVertical) {
      const cellW = w * fraction;
      rects.push(makeRect(node, x + offset, y, cellW, h));
      offset += cellW;
    } else {
      const cellH = h * fraction;
      rects.push(makeRect(node, x, y + offset, w, cellH));
      offset += cellH;
    }
  }

  return rects;
}

function worstAspect(
  row: TreemapNode[],
  rowSize: number,
  side: number,
  totalSize: number,
): number {
  const rowThickness = (rowSize / totalSize) * side;
  if (rowThickness === 0) return Number.POSITIVE_INFINITY;

  let worst = 0;
  for (const node of row) {
    const cellLength = rowSize > 0 ? (node.size / rowSize) * side : 0;
    if (cellLength === 0) continue;
    const aspect = Math.max(cellLength / rowThickness, rowThickness / cellLength);
    if (aspect > worst) worst = aspect;
  }
  return worst;
}

function makeRect(
  node: TreemapNode,
  x: number,
  y: number,
  w: number,
  h: number,
): TreemapRect {
  return {
    x,
    y,
    width: w,
    height: h,
    node,
    hue: ENTITY_HUES[node.entity_type] ?? DEFAULT_HUE,
  };
}

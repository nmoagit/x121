/**
 * Chain graph visualization (PRD-97).
 *
 * Renders a directed graph of trigger chains using CSS-based layout
 * and SVG connection lines. Shows events -> actions -> downstream triggers
 * with approval gates highlighted.
 */

import { useMemo } from "react";

import { Badge ,  WireframeLoader } from "@/components/primitives";
import { Card } from "@/components/composite";
import { cn } from "@/lib/cn";

import {
  computeLayout,
  NODE_GAP_X,
  NODE_GAP_Y,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./chain-layout";
import type { LayoutNode } from "./chain-layout";
import { useChainGraph } from "./hooks/use-trigger-workflows";

/* --------------------------------------------------------------------------
   SVG edges
   -------------------------------------------------------------------------- */

function Edges({ layoutNodes }: { layoutNodes: LayoutNode[] }) {
  const posMap = new Map(
    layoutNodes.map((ln) => [ln.node.trigger_id, { x: ln.x, y: ln.y }]),
  );

  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }> = [];

  for (const ln of layoutNodes) {
    for (const downstream of ln.node.downstream_triggers) {
      const target = posMap.get(downstream);
      if (!target) continue;
      lines.push({
        x1: ln.x + NODE_WIDTH,
        y1: ln.y + NODE_HEIGHT / 2,
        x2: target.x,
        y2: target.y + NODE_HEIGHT / 2,
        key: `${ln.node.trigger_id}-${downstream}`,
      });
    }
  }

  if (lines.length === 0) return null;

  const maxX = Math.max(...layoutNodes.map((ln) => ln.x + NODE_WIDTH)) + NODE_GAP_X;
  const maxY = Math.max(...layoutNodes.map((ln) => ln.y + NODE_HEIGHT)) + NODE_GAP_Y;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={maxX}
      height={maxY}
      data-testid="chain-graph-edges"
    >
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" className="fill-[var(--color-text-muted)]" />
        </marker>
      </defs>
      {lines.map(({ x1, y1, x2, y2, key }) => (
        <line
          key={key}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          className="stroke-[var(--color-text-muted)]"
          strokeWidth={1.5}
          markerEnd="url(#arrowhead)"
        />
      ))}
    </svg>
  );
}

/* --------------------------------------------------------------------------
   Graph node
   -------------------------------------------------------------------------- */

function GraphNode({ layoutNode }: { layoutNode: LayoutNode }) {
  const { node, x, y } = layoutNode;

  return (
    <div
      className={cn(
        "absolute border rounded-[var(--radius-md)] px-3 py-2",
        "bg-[var(--color-surface-secondary)] border-[var(--color-border-default)]",
        "shadow-sm",
      )}
      style={{ left: x, top: y, width: NODE_WIDTH, height: NODE_HEIGHT }}
      data-testid={`chain-node-${node.trigger_id}`}
    >
      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
        {node.name}
      </p>
      <div className="flex items-center gap-1 mt-1">
        <Badge variant="info" size="sm">{node.event_type}</Badge>
        <Badge variant="default" size="sm">{node.entity_type}</Badge>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface ChainGraphProps {
  projectId?: number;
}

export function ChainGraph({ projectId }: ChainGraphProps) {
  const { data: nodes, isPending, isError } = useChainGraph(projectId);

  const layoutNodes = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];
    return computeLayout(nodes);
  }, [nodes]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="chain-graph-loading">
        <WireframeLoader size={48} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load chain graph.
      </div>
    );
  }

  if (layoutNodes.length === 0) {
    return (
      <Card elevation="flat" padding="lg">
        <div className="text-center text-sm text-[var(--color-text-muted)]" data-testid="chain-graph-empty">
          No trigger chains configured. Create triggers to see the dependency graph.
        </div>
      </Card>
    );
  }

  const graphWidth = Math.max(...layoutNodes.map((ln) => ln.x + NODE_WIDTH)) + NODE_GAP_X;
  const graphHeight = Math.max(...layoutNodes.map((ln) => ln.y + NODE_HEIGHT)) + NODE_GAP_Y;

  return (
    <div
      className="overflow-auto border border-[var(--color-border-default)] rounded-[var(--radius-lg)] bg-[var(--color-surface-primary)] p-4"
      data-testid="chain-graph"
    >
      <div className="relative" style={{ width: graphWidth, height: graphHeight }}>
        <Edges layoutNodes={layoutNodes} />
        {layoutNodes.map((ln) => (
          <GraphNode key={ln.node.trigger_id} layoutNode={ln} />
        ))}
      </div>
    </div>
  );
}

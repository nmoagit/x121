/**
 * Main workflow canvas component (PRD-33).
 *
 * Provides a structural placeholder for the React Flow node graph.
 * The component API matches what React Flow expects so it can be
 * swapped in later without changing the surrounding code.
 *
 * NOTE: reactflow is NOT installed as a dependency. This renders
 * placeholder divs that will be replaced with React Flow components.
 */

import { useCallback, useState } from "react";

import { useCanvas, useSaveCanvas } from "./hooks/use-workflow-canvas";
import { NodeCatalog } from "./NodeCatalog";
import type { CanvasEdge, CanvasNode, CanvasState, Viewport } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface WorkflowCanvasProps {
  workflowId: number;
}

/* --------------------------------------------------------------------------
   Defaults
   -------------------------------------------------------------------------- */

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WorkflowCanvas({ workflowId }: WorkflowCanvasProps) {
  const { data: layout, isPending, isError } = useCanvas(workflowId);
  const saveCanvas = useSaveCanvas(workflowId);

  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);

  // Hydrate state from persisted layout when it loads.
  const hydrated = layout != null;
  if (hydrated && nodes.length === 0 && layout.canvas_json.nodes?.length > 0) {
    setNodes(layout.canvas_json.nodes);
    setEdges(layout.canvas_json.edges ?? []);
    setViewport(layout.canvas_json.viewport ?? DEFAULT_VIEWPORT);
  }

  /* -- Handlers ---------------------------------------------------------- */

  const handleSave = useCallback(() => {
    const state: CanvasState = { nodes, edges, viewport };
    saveCanvas.mutate(state);
  }, [nodes, edges, viewport, saveCanvas]);

  const handleAddNode = useCallback(
    (node: CanvasNode) => {
      setNodes((prev) => [...prev, node]);
    },
    [],
  );

  const handleRemoveNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) =>
      prev.filter((e) => e.source !== nodeId && e.target !== nodeId),
    );
  }, []);

  /* -- Loading / error states ------------------------------------------- */

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
        Failed to load canvas layout.
      </div>
    );
  }

  /* -- Render ----------------------------------------------------------- */

  return (
    <div className="flex h-full w-full">
      {/* Sidebar: Node Catalog */}
      <NodeCatalog onAddNode={handleAddNode} />

      {/* Main canvas area */}
      <div className="relative flex-1 overflow-hidden bg-[var(--color-surface-secondary)]">
        {/* Toolbar */}
        <div className="absolute left-2 top-2 z-10 flex gap-2">
          <button
            type="button"
            className="rounded bg-[var(--color-action-primary)] px-3 py-1 text-sm text-[var(--color-text-primary)] hover:opacity-90"
            onClick={handleSave}
            disabled={saveCanvas.isPending}
          >
            {saveCanvas.isPending ? "Saving..." : "Save"}
          </button>
          <span className="self-center text-xs text-[var(--color-text-muted)]">
            {nodes.length} nodes, {edges.length} edges
          </span>
        </div>

        {/* Canvas placeholder (will be React Flow) */}
        <div
          className="h-full w-full"
          data-testid="workflow-canvas"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {nodes.map((node) => (
            <div
              key={node.id}
              className="absolute rounded border border-[var(--color-text-muted)] bg-[var(--color-surface-primary)] p-3 shadow"
              style={{
                left: node.position.x,
                top: node.position.y,
                width: node.width ?? 200,
                minHeight: node.height ?? 80,
              }}
              data-testid={`canvas-node-${node.id}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {node.data.label}
                </span>
                <button
                  type="button"
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)]"
                  onClick={() => handleRemoveNode(node.id)}
                  aria-label={`Remove node ${node.data.label}`}
                >
                  x
                </button>
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">
                {node.data.nodeType}
              </span>
              {node.data.timing && (
                <div className="mt-1 text-xs">
                  <span
                    className={
                      node.data.timing.executionMs < 1000
                        ? "text-green-400"
                        : node.data.timing.executionMs < 5000
                          ? "text-yellow-400"
                          : "text-red-400"
                    }
                  >
                    {node.data.timing.executionMs}ms
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* Edge rendering placeholder */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {edges.map((edge) => {
              const sourceNode = nodes.find((n) => n.id === edge.source);
              const targetNode = nodes.find((n) => n.id === edge.target);
              if (!sourceNode || !targetNode) return null;

              const sx = sourceNode.position.x + (sourceNode.width ?? 200);
              const sy = sourceNode.position.y + (sourceNode.height ?? 80) / 2;
              const tx = targetNode.position.x;
              const ty = targetNode.position.y + (targetNode.height ?? 80) / 2;

              return (
                <line
                  key={edge.id}
                  x1={sx}
                  y1={sy}
                  x2={tx}
                  y2={ty}
                  stroke="var(--color-text-muted)"
                  strokeWidth={2}
                  opacity={0.5}
                />
              );
            })}
          </svg>
        </div>

        {/* MiniMap placeholder */}
        <div
          className="absolute bottom-2 right-2 h-24 w-32 rounded border border-[var(--color-text-muted)] bg-[var(--color-surface-primary)] opacity-75"
          data-testid="canvas-minimap"
        >
          <span className="flex h-full items-center justify-center text-xs text-[var(--color-text-muted)]">
            MiniMap
          </span>
        </div>

        {/* Controls placeholder */}
        <div className="absolute bottom-2 left-2 flex flex-col gap-1">
          <button
            type="button"
            className="rounded border border-[var(--color-text-muted)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs"
            onClick={() =>
              setViewport((v) => ({
                ...v,
                zoom: Math.min(v.zoom + 0.1, 4),
              }))
            }
          >
            +
          </button>
          <button
            type="button"
            className="rounded border border-[var(--color-text-muted)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs"
            onClick={() =>
              setViewport((v) => ({
                ...v,
                zoom: Math.max(v.zoom - 0.1, 0.1),
              }))
            }
          >
            -
          </button>
          <button
            type="button"
            className="rounded border border-[var(--color-text-muted)] bg-[var(--color-surface-primary)] px-2 py-1 text-xs"
            onClick={() => setViewport(DEFAULT_VIEWPORT)}
          >
            Fit
          </button>
        </div>
      </div>
    </div>
  );
}

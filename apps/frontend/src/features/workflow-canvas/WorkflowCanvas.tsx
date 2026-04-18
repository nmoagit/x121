/**
 * Workflow canvas component (PRD-33).
 *
 * Renders the ComfyUI workflow JSON as an interactive node graph using
 * React Flow. Nodes and edges are auto-generated from the workflow's
 * `json_content` and laid out with dagre.
 */

import { useCallback, useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./workflow-canvas.css";
import dagre from "@dagrejs/dagre";

import { Tooltip } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface WorkflowCanvasProps {
  /** Legacy: workflow ID (ignored when workflowJson is provided). */
  workflowId?: number;
  /** The raw ComfyUI workflow JSON to visualise. */
  workflowJson?: Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   ComfyUI JSON → React Flow conversion
   -------------------------------------------------------------------------- */

interface ComfyUINodeDef {
  class_type?: string;
  inputs?: Record<string, unknown>;
}

/** Node colour based on class type category. */
function nodeColor(classType: string): string {
  if (classType.includes("KSampler")) return "#7c3aed"; // purple
  if (classType.includes("CLIP") || classType.includes("Text")) return "#0ea5e9"; // sky
  if (classType.includes("VAE")) return "#f59e0b"; // amber
  if (classType.includes("Checkpoint") || classType.includes("Loader")) return "#10b981"; // emerald
  if (classType.includes("Save") || classType.includes("Preview")) return "#ef4444"; // red
  if (classType.includes("Latent") || classType.includes("Empty")) return "#6366f1"; // indigo
  if (classType.includes("ControlNet")) return "#ec4899"; // pink
  if (classType.includes("Lora") || classType.includes("LoRA")) return "#14b8a6"; // teal
  if (classType.includes("Image") || classType.includes("Load")) return "#f97316"; // orange
  return "#64748b"; // slate — default
}

/** Build a concise label showing key parameter values. */
function paramLabel(inputs: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(inputs)) {
    // Skip connection references (arrays like [nodeId, outputIndex]).
    if (Array.isArray(val)) continue;
    if (typeof val === "string" && val.length > 40) {
      parts.push(`${key}: "${val.slice(0, 37)}..."`);
    } else if (typeof val === "string") {
      parts.push(`${key}: "${val}"`);
    } else if (typeof val === "number" || typeof val === "boolean") {
      parts.push(`${key}: ${val}`);
    }
  }
  return parts.join("\n");
}

function parseWorkflowToGraph(json: Record<string, unknown>): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const [nodeId, nodeDef] of Object.entries(json)) {
    const def = nodeDef as ComfyUINodeDef;
    if (!def.class_type) continue;

    const inputs = (def.inputs ?? {}) as Record<string, unknown>;
    const params = paramLabel(inputs);
    const bg = nodeColor(def.class_type);

    nodes.push({
      id: nodeId,
      data: {
        label: (
          <div style={{ fontSize: 11, lineHeight: 1.35 }}>
            <div style={{ fontWeight: 600, marginBottom: params ? 4 : 0 }}>
              {def.class_type}
            </div>
            {params && (
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  opacity: 0.8,
                  fontSize: 10,
                  maxHeight: 80,
                  overflow: "hidden",
                }}
              >
                {params}
              </div>
            )}
          </div>
        ),
      },
      position: { x: 0, y: 0 }, // will be set by dagre
      style: {
        background: bg,
        color: "var(--color-text-inverse)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 6,
        padding: "8px 10px",
        minWidth: 160,
        maxWidth: 240,
        fontSize: 11,
      },
    });

    // Parse connections: ComfyUI encodes as [sourceNodeId, outputIndex]
    for (const [inputName, inputVal] of Object.entries(inputs)) {
      if (
        Array.isArray(inputVal) &&
        inputVal.length === 2 &&
        (typeof inputVal[0] === "string" || typeof inputVal[0] === "number")
      ) {
        const sourceId = String(inputVal[0]);
        edges.push({
          id: `${sourceId}-${nodeId}-${inputName}`,
          source: sourceId,
          target: nodeId,
          label: inputName,
          style: { stroke: "var(--color-text-secondary)", strokeWidth: 1.5 },
          labelStyle: { fontSize: 9, fill: "var(--color-text-secondary)" },
        });
      }
    }
  }

  return { nodes, edges };
}

/* --------------------------------------------------------------------------
   Dagre auto-layout
   -------------------------------------------------------------------------- */

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

function layoutGraph(
  rawNodes: Node[],
  rawEdges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 80 });

  for (const node of rawNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of rawEdges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const laidOut = rawNodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: laidOut, edges: rawEdges };
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

/** Displays current zoom percentage. Must be inside ReactFlowProvider. */
function ZoomIndicator() {
  const zoom = useStore((s) => s.transform[2]);
  const { fitView } = useReactFlow();

  return (
    <Panel position="top-right">
      <Tooltip content="Click to fit view">
        <button
          type="button"
          onClick={() => fitView()}
          className="rounded px-2 py-1 text-xs font-medium"
          style={{ background: "var(--color-surface-secondary)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
        >
          {Math.round(zoom * 100)}%
        </button>
      </Tooltip>
    </Panel>
  );
}

export function WorkflowCanvas({ workflowJson }: WorkflowCanvasProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!workflowJson || Object.keys(workflowJson).length === 0) {
      return { initialNodes: [] as Node[], initialEdges: [] as Edge[] };
    }
    const parsed = parseWorkflowToGraph(workflowJson);
    const laid = layoutGraph(parsed.nodes, parsed.edges);
    return { initialNodes: laid.nodes, initialEdges: laid.edges };
  }, [workflowJson]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 50);
  }, []);

  if (!workflowJson || Object.keys(workflowJson).length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-tertiary)]">
        No workflow JSON to display.
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="h-full w-full" style={{ minHeight: 700 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={onInit}
          fitView
          minZoom={0.05}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          style={{ background: "var(--color-surface-primary)" }}
        >
          <Background color="var(--color-border-default)" gap={20} />
          <Controls
            showZoom
            showFitView
            showInteractive={false}
          />
          <MiniMap
            nodeColor={(n) => (n.style?.background as string) ?? "#64748b"}
            maskColor="rgba(0,0,0,0.6)"
            style={{ background: "var(--color-surface-primary)", borderColor: "var(--color-border-default)" }}
          />
          <ZoomIndicator />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}

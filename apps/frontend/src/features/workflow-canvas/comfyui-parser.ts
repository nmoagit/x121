/**
 * ComfyUI workflow JSON parser and exporter (PRD-33).
 *
 * Provides bidirectional conversion between ComfyUI workflow JSON
 * and the canvas node/edge representation used by the workflow canvas.
 */

import type { CanvasEdge, CanvasNode, ComfyUIParseResult, NodeType } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Horizontal spacing between auto-laid-out nodes. */
const LAYOUT_X_SPACING = 300;

/** Vertical spacing between auto-laid-out nodes. */
const LAYOUT_Y_SPACING = 150;

/** Nodes per row for auto-layout. */
const LAYOUT_COLUMNS = 4;

/* --------------------------------------------------------------------------
   ComfyUI node shape
   -------------------------------------------------------------------------- */

interface ComfyUINode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}

type ComfyUIWorkflow = Record<string, ComfyUINode>;

/* --------------------------------------------------------------------------
   Import: ComfyUI JSON -> Canvas nodes/edges
   -------------------------------------------------------------------------- */

/**
 * Parse a ComfyUI workflow JSON object into canvas nodes and edges.
 *
 * Each key in the workflow object is a node ID. Input values that are
 * arrays of [source_node_id, output_index] represent connections.
 */
export function parseComfyUIWorkflow(
  json: Record<string, unknown>,
): ComfyUIParseResult {
  const workflow = json as unknown as ComfyUIWorkflow;
  const nodeIds = Object.keys(workflow);
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  nodeIds.forEach((nodeId, index) => {
    const comfyNode = workflow[nodeId];
    if (!comfyNode) return;

    const classType = comfyNode.class_type ?? "unknown";
    const title = comfyNode._meta?.title ?? classType;

    // Auto-layout: arrange in a grid.
    const col = index % LAYOUT_COLUMNS;
    const row = Math.floor(index / LAYOUT_COLUMNS);

    nodes.push({
      id: nodeId,
      type: "comfyui",
      data: {
        label: title,
        nodeType: mapClassToNodeType(classType),
        parameters: filterNonConnectionInputs(comfyNode.inputs ?? {}),
      },
      position: {
        x: col * LAYOUT_X_SPACING,
        y: row * LAYOUT_Y_SPACING,
      },
    });

    // Extract edges from input connections.
    if (comfyNode.inputs) {
      for (const [inputName, inputVal] of Object.entries(comfyNode.inputs)) {
        if (isConnectionValue(inputVal)) {
          const [sourceId, sourceSlot] = inputVal as [string | number, number];
          const sourceNodeId = String(sourceId);

          edges.push({
            id: `${sourceNodeId}_${sourceSlot}_${nodeId}_${inputName}`,
            source: sourceNodeId,
            sourceHandle: `output_${sourceSlot}`,
            target: nodeId,
            targetHandle: inputName,
          });
        }
      }
    }
  });

  return { nodes, edges };
}

/* --------------------------------------------------------------------------
   Export: Canvas nodes/edges -> ComfyUI JSON
   -------------------------------------------------------------------------- */

/**
 * Export canvas nodes and edges back to a ComfyUI-compatible workflow JSON.
 *
 * Reconstructs the ComfyUI format where connections are encoded as
 * [source_node_id, output_index] values in the target node's inputs.
 */
export function exportToComfyUI(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): Record<string, unknown> {
  const workflow: Record<string, unknown> = {};

  for (const node of nodes) {
    // Start with the node's parameter values.
    const inputs: Record<string, unknown> = { ...node.data.parameters };

    // Overlay connections: find all edges targeting this node.
    for (const edge of edges) {
      if (edge.target !== node.id) continue;

      // Extract output slot index from sourceHandle (format: "output_N").
      const slotMatch = edge.sourceHandle?.match(/output_(\d+)/);
      const slotIndex = slotMatch?.[1] != null ? parseInt(slotMatch[1], 10) : 0;

      if (edge.targetHandle) {
        inputs[edge.targetHandle] = [edge.source, slotIndex];
      }
    }

    workflow[node.id] = {
      class_type: node.data.parameters._class_type ?? node.data.nodeType,
      inputs,
      _meta: { title: node.data.label },
    };
  }

  return workflow;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Check if a ComfyUI input value represents a connection (array of [id, slot]). */
function isConnectionValue(val: unknown): boolean {
  if (!Array.isArray(val)) return false;
  if (val.length !== 2) return false;
  const [id, slot] = val;
  return (typeof id === "string" || typeof id === "number") && typeof slot === "number";
}

/** Filter out connection values from inputs, keeping only parameter values. */
function filterNonConnectionInputs(
  inputs: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(inputs)) {
    if (!isConnectionValue(val)) {
      result[key] = val;
    }
  }
  return result;
}

/** Map a ComfyUI class_type to our canonical node type. */
function mapClassToNodeType(classType: string): NodeType {
  const lower = classType.toLowerCase();

  if (lower.includes("loader") || lower.includes("checkpoint")) return "loader";
  if (lower.includes("sampler") || lower.includes("ksampler")) return "sampler";
  if (lower.includes("vae")) return "vae";
  if (lower.includes("controlnet")) return "controlnet";
  if (lower.includes("clip")) return "clip";
  if (lower.includes("conditioning") || lower.includes("encode")) return "conditioning";
  if (lower.includes("latent")) return "latent";
  if (lower.includes("image") || lower.includes("load")) return "image";
  if (lower.includes("save") || lower.includes("output") || lower.includes("preview"))
    return "output";
  if (lower.includes("upscale")) return "upscaler";
  if (lower.includes("preprocess")) return "preprocessor";

  return "custom";
}

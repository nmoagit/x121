/**
 * Types for the node-based workflow canvas (PRD-33).
 *
 * Defines data structures for the canvas state, nodes, edges,
 * and telemetry. Designed to be compatible with React Flow's data model.
 */

// ---------------------------------------------------------------------------
// Node types and port types
// ---------------------------------------------------------------------------

/** Recognised node type identifiers matching backend constants. */
export type NodeType =
  | "loader"
  | "sampler"
  | "vae"
  | "controlnet"
  | "clip"
  | "conditioning"
  | "latent"
  | "image"
  | "output"
  | "preprocessor"
  | "upscaler"
  | "custom"
  | "comfyui";

/** Data types that flow through connections between nodes. */
export type PortType =
  | "MODEL"
  | "CLIP"
  | "VAE"
  | "CONDITIONING"
  | "LATENT"
  | "IMAGE"
  | "MASK"
  | "CONTROL_NET"
  | "STRING"
  | "INT"
  | "FLOAT";

// ---------------------------------------------------------------------------
// Port and node data
// ---------------------------------------------------------------------------

/** Definition of a single input or output port on a node. */
export interface PortDefinition {
  name: string;
  type: PortType;
  label?: string;
}

/** Performance timing data for a single node execution. */
export interface NodeTiming {
  executionMs: number;
  status: "idle" | "running" | "complete" | "error";
}

/** Data payload attached to each node in the canvas. */
export interface NodeData {
  label: string;
  nodeType: NodeType;
  parameters: Record<string, unknown>;
  inputPorts?: PortDefinition[];
  outputPorts?: PortDefinition[];
  timing?: NodeTiming;
}

// ---------------------------------------------------------------------------
// Canvas position and viewport
// ---------------------------------------------------------------------------

/** 2D position for a node on the canvas. */
export interface Position {
  x: number;
  y: number;
}

/** Viewport state for the canvas (pan + zoom). */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

// ---------------------------------------------------------------------------
// Node and edge (React Flow compatible)
// ---------------------------------------------------------------------------

/** A single node on the canvas (React Flow compatible shape). */
export interface CanvasNode {
  id: string;
  type?: string;
  data: NodeData;
  position: Position;
  width?: number;
  height?: number;
}

/** A single edge (connection) between two nodes. */
export interface CanvasEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
  label?: string;
  animated?: boolean;
}

// ---------------------------------------------------------------------------
// Canvas state and layout
// ---------------------------------------------------------------------------

/** Full canvas state including nodes, edges, and viewport. */
export interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
}

/** Persisted workflow layout from the API. */
export interface WorkflowLayout {
  id: number;
  workflow_id: number;
  canvas_json: CanvasState;
  node_positions_json: Record<string, Position>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

/** Per-node timing entry from telemetry endpoint. */
export interface NodeTelemetryEntry {
  node_id: string;
  execution_ms: number;
  status: "idle" | "running" | "complete" | "error";
}

/** Telemetry response from the API. */
export interface WorkflowTelemetry {
  workflow_id: number;
  nodes: Record<string, NodeTelemetryEntry>;
  total_ms: number | null;
}

// ---------------------------------------------------------------------------
// ComfyUI import/export
// ---------------------------------------------------------------------------

/** Result of parsing a ComfyUI workflow JSON. */
export interface ComfyUIParseResult {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// ---------------------------------------------------------------------------
// Node catalog
// ---------------------------------------------------------------------------

/** Entry in the node catalog sidebar. */
export interface NodeCatalogEntry {
  type: NodeType;
  label: string;
  category: "Input" | "Sampler" | "ControlNet" | "VAE" | "Output" | "Utility";
  defaultParams: Record<string, unknown>;
  inputPorts: PortDefinition[];
  outputPorts: PortDefinition[];
}

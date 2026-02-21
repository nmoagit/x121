import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { WorkflowCanvas } from "../WorkflowCanvas";
import { parseComfyUIWorkflow, exportToComfyUI } from "../comfyui-parser";

// Mock the api module to prevent real HTTP requests.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/canvas")) {
        return Promise.resolve({
          id: 1,
          workflow_id: 42,
          canvas_json: {
            nodes: [
              {
                id: "1",
                type: "loader",
                data: {
                  label: "Checkpoint Loader",
                  nodeType: "loader",
                  parameters: {},
                },
                position: { x: 0, y: 0 },
              },
              {
                id: "2",
                type: "sampler",
                data: {
                  label: "KSampler",
                  nodeType: "sampler",
                  parameters: { steps: 20 },
                },
                position: { x: 300, y: 0 },
              },
            ],
            edges: [
              {
                id: "e1",
                source: "1",
                sourceHandle: "output_0",
                target: "2",
                targetHandle: "model",
              },
            ],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
          node_positions_json: {
            "1": { x: 0, y: 0 },
            "2": { x: 300, y: 0 },
          },
          created_at: "2026-02-21T00:00:00Z",
          updated_at: "2026-02-21T00:00:00Z",
        });
      }
      if (path.includes("/telemetry")) {
        return Promise.resolve({
          workflow_id: 42,
          nodes: {},
          total_ms: null,
        });
      }
      return Promise.resolve({});
    }),
    put: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
  },
}));

describe("WorkflowCanvas", () => {
  it("renders the canvas container", async () => {
    renderWithProviders(<WorkflowCanvas workflowId={42} />);

    await waitFor(() => {
      expect(screen.getByTestId("workflow-canvas")).toBeInTheDocument();
    });
  });

  it("renders nodes from persisted layout", async () => {
    renderWithProviders(<WorkflowCanvas workflowId={42} />);

    await waitFor(() => {
      // Use data-testid to target canvas nodes specifically (not catalog entries).
      expect(screen.getByTestId("canvas-node-1")).toBeInTheDocument();
      expect(screen.getByTestId("canvas-node-2")).toBeInTheDocument();
    });
  });

  it("shows the node catalog sidebar", async () => {
    renderWithProviders(<WorkflowCanvas workflowId={42} />);

    await waitFor(() => {
      expect(screen.getByTestId("node-catalog")).toBeInTheDocument();
      expect(screen.getByText("Node Catalog")).toBeInTheDocument();
    });
  });

  it("shows the minimap placeholder", async () => {
    renderWithProviders(<WorkflowCanvas workflowId={42} />);

    await waitFor(() => {
      expect(screen.getByTestId("canvas-minimap")).toBeInTheDocument();
    });
  });

  it("shows the save button", async () => {
    renderWithProviders(<WorkflowCanvas workflowId={42} />);

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
    });
  });

  it("shows node count summary", async () => {
    renderWithProviders(<WorkflowCanvas workflowId={42} />);

    await waitFor(() => {
      expect(screen.getByText("2 nodes, 1 edges")).toBeInTheDocument();
    });
  });
});

describe("ComfyUI parser", () => {
  const sampleWorkflow = {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "model_v1.safetensors" },
      _meta: { title: "Load Checkpoint" },
    },
    "2": {
      class_type: "KSampler",
      inputs: {
        seed: 42,
        steps: 20,
        cfg: 7.0,
        model: ["1", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
      },
      _meta: { title: "KSampler" },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: "a cat", clip: ["1", 1] },
      _meta: { title: "Positive Prompt" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: "bad quality", clip: ["1", 1] },
      _meta: { title: "Negative Prompt" },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width: 512, height: 512, batch_size: 1 },
      _meta: { title: "Empty Latent" },
    },
  };

  it("parses ComfyUI workflow into nodes", () => {
    const result = parseComfyUIWorkflow(sampleWorkflow);

    expect(result.nodes).toHaveLength(5);
    expect(result.nodes[0]?.data.label).toBe("Load Checkpoint");
    expect(result.nodes[1]?.data.label).toBe("KSampler");
  });

  it("extracts edges from connections", () => {
    const result = parseComfyUIWorkflow(sampleWorkflow);

    // KSampler has 4 connections: model, positive, negative, latent_image.
    // CLIPTextEncode #3 has 1 connection: clip.
    // CLIPTextEncode #4 has 1 connection: clip.
    // Total: 6 edges.
    expect(result.edges).toHaveLength(6);

    const modelEdge = result.edges.find(
      (e) => e.source === "1" && e.targetHandle === "model",
    );
    expect(modelEdge).toBeDefined();
    expect(modelEdge?.target).toBe("2");
  });

  it("filters connection values from node parameters", () => {
    const result = parseComfyUIWorkflow(sampleWorkflow);

    const ksampler = result.nodes.find((n) => n.id === "2");
    expect(ksampler?.data.parameters.seed).toBe(42);
    expect(ksampler?.data.parameters.steps).toBe(20);
    // Connection values should be filtered out.
    expect(ksampler?.data.parameters.model).toBeUndefined();
  });

  it("round-trips without data loss", () => {
    const parsed = parseComfyUIWorkflow(sampleWorkflow);
    const exported = exportToComfyUI(parsed.nodes, parsed.edges);

    // Each node should be present.
    expect(Object.keys(exported)).toHaveLength(5);

    // KSampler should have its connection inputs restored.
    const ksampler = exported["2"] as Record<string, unknown>;
    const inputs = ksampler.inputs as Record<string, unknown>;
    expect(inputs.seed).toBe(42);
    expect(inputs.model).toEqual(["1", 0]);
    expect(inputs.positive).toEqual(["3", 0]);

    // Checkpoint loader should have its parameter preserved.
    const loader = exported["1"] as Record<string, unknown>;
    const loaderInputs = loader.inputs as Record<string, unknown>;
    expect(loaderInputs.ckpt_name).toBe("model_v1.safetensors");
  });
});

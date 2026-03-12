import { describe, expect, it } from "vitest";
import { parseComfyUIWorkflow, exportToComfyUI } from "../comfyui-parser";

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

describe("ComfyUI parser", () => {
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

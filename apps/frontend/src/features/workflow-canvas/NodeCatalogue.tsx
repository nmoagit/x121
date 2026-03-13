/**
 * Node catalogue sidebar component (PRD-33).
 *
 * Displays available node types organised by category with search/filter.
 * Nodes can be added to the canvas by clicking (drag-and-drop will be
 * implemented when React Flow is integrated).
 */

import { useMemo, useState } from "react";

import { SearchInput } from "@/components/primitives";

import type { CanvasNode, NodeCatalogueEntry, NodeType } from "./types";

/* --------------------------------------------------------------------------
   Catalogue data
   -------------------------------------------------------------------------- */

const CATALOG_ENTRIES: NodeCatalogueEntry[] = [
  {
    type: "loader",
    label: "Checkpoint Loader",
    category: "Input",
    defaultParams: { ckpt_name: "" },
    inputPorts: [],
    outputPorts: [
      { name: "model", type: "MODEL" },
      { name: "clip", type: "CLIP" },
      { name: "vae", type: "VAE" },
    ],
  },
  {
    type: "image",
    label: "Load Image",
    category: "Input",
    defaultParams: { image: "" },
    inputPorts: [],
    outputPorts: [{ name: "image", type: "IMAGE" }],
  },
  {
    type: "conditioning",
    label: "CLIP Text Encode",
    category: "Input",
    defaultParams: { text: "" },
    inputPorts: [{ name: "clip", type: "CLIP" }],
    outputPorts: [{ name: "conditioning", type: "CONDITIONING" }],
  },
  {
    type: "sampler",
    label: "KSampler",
    category: "Sampler",
    defaultParams: { seed: 0, steps: 20, cfg: 7.0, sampler_name: "euler" },
    inputPorts: [
      { name: "model", type: "MODEL" },
      { name: "positive", type: "CONDITIONING" },
      { name: "negative", type: "CONDITIONING" },
      { name: "latent_image", type: "LATENT" },
    ],
    outputPorts: [{ name: "latent", type: "LATENT" }],
  },
  {
    type: "latent",
    label: "Empty Latent Image",
    category: "Input",
    defaultParams: { width: 512, height: 512, batch_size: 1 },
    inputPorts: [],
    outputPorts: [{ name: "latent", type: "LATENT" }],
  },
  {
    type: "vae",
    label: "VAE Decode",
    category: "VAE",
    defaultParams: {},
    inputPorts: [
      { name: "samples", type: "LATENT" },
      { name: "vae", type: "VAE" },
    ],
    outputPorts: [{ name: "image", type: "IMAGE" }],
  },
  {
    type: "controlnet",
    label: "Apply ControlNet",
    category: "ControlNet",
    defaultParams: { strength: 1.0 },
    inputPorts: [
      { name: "conditioning", type: "CONDITIONING" },
      { name: "control_net", type: "CONTROL_NET" },
      { name: "image", type: "IMAGE" },
    ],
    outputPorts: [{ name: "conditioning", type: "CONDITIONING" }],
  },
  {
    type: "output",
    label: "Save Image",
    category: "Output",
    defaultParams: { filename_prefix: "output" },
    inputPorts: [{ name: "images", type: "IMAGE" }],
    outputPorts: [],
  },
  {
    type: "upscaler",
    label: "Upscale Image",
    category: "Utility",
    defaultParams: { upscale_method: "nearest-exact", scale_by: 2.0 },
    inputPorts: [{ name: "image", type: "IMAGE" }],
    outputPorts: [{ name: "image", type: "IMAGE" }],
  },
  {
    type: "preprocessor",
    label: "Preprocessor",
    category: "Utility",
    defaultParams: {},
    inputPorts: [{ name: "image", type: "IMAGE" }],
    outputPorts: [{ name: "image", type: "IMAGE" }],
  },
];

/** All unique categories in display order. */
const CATEGORIES = [
  "Input",
  "Sampler",
  "ControlNet",
  "VAE",
  "Output",
  "Utility",
] as const;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface NodeCatalogueProps {
  onAddNode: (node: CanvasNode) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

let nextNodeId = 1;

export function NodeCatalogue({ onAddNode }: NodeCatalogueProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (!search.trim()) return CATALOG_ENTRIES;
    const lower = search.toLowerCase();
    return CATALOG_ENTRIES.filter(
      (e) =>
        e.label.toLowerCase().includes(lower) ||
        e.type.toLowerCase().includes(lower) ||
        e.category.toLowerCase().includes(lower),
    );
  }, [search]);

  const handleAdd = (entry: NodeCatalogueEntry) => {
    const id = `node_${nextNodeId++}`;
    const node: CanvasNode = {
      id,
      type: entry.type,
      data: {
        label: entry.label,
        nodeType: entry.type as NodeType,
        parameters: { ...entry.defaultParams },
        inputPorts: entry.inputPorts,
        outputPorts: entry.outputPorts,
      },
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
    };
    onAddNode(node);
  };

  const toggleCategory = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div
      className="flex w-60 flex-col border-r border-[var(--color-text-muted)] bg-[var(--color-surface-primary)]"
      data-testid="node-catalogue"
    >
      {/* Header */}
      <div className="border-b border-[var(--color-text-muted)] px-3 py-2">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Node Catalogue
        </h3>
      </div>

      {/* Search */}
      <div className="p-2">
        <SearchInput
          placeholder="Search nodes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="sm"
          data-testid="node-search"
        />
      </div>

      {/* Category groups */}
      <div className="flex-1 overflow-y-auto">
        {CATEGORIES.map((category) => {
          const items = filtered.filter((e) => e.category === category);
          if (items.length === 0) return null;
          const isCollapsed = collapsed[category] ?? false;

          return (
            <div key={category}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] hover:bg-[var(--color-surface-secondary)]"
                onClick={() => toggleCategory(category)}
              >
                <span>{category}</span>
                <span>{isCollapsed ? "+" : "-"}</span>
              </button>

              {!isCollapsed &&
                items.map((entry) => (
                  <button
                    key={entry.type + entry.label}
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]"
                    onClick={() => handleAdd(entry)}
                    data-testid={`catalogue-entry-${entry.type}`}
                  >
                    <span className="h-2 w-2 rounded-full bg-[var(--color-action-primary)]" />
                    {entry.label}
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

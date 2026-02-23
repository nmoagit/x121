import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ReceiptPanel } from "../ReceiptPanel";
import type { GenerationReceipt } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const makeReceipt = (overrides: Partial<GenerationReceipt> = {}): GenerationReceipt => ({
  id: 1,
  segment_id: 10,
  source_image_hash: "abc123source",
  variant_image_hash: "def456variant",
  workflow_version: "2.1.0",
  workflow_hash: "wf_hash_789",
  model_asset_id: 42,
  model_version: "1.5",
  model_hash: "model_hash_xyz",
  lora_configs: [
    { asset_id: 100, version: "1.0", hash: "lora_hash_1", weight: 0.75 },
  ],
  prompt_text: "A beautiful sunset over the ocean",
  negative_prompt: "blurry, low quality",
  cfg_scale: 7.5,
  seed: 12345,
  resolution_width: 1024,
  resolution_height: 576,
  steps: 30,
  sampler: "euler_a",
  additional_params: {},
  inputs_hash: "inputs_hash_full",
  generation_started_at: "2026-02-23T10:00:00Z",
  generation_completed_at: "2026-02-23T10:02:30Z",
  generation_duration_ms: 150000,
  created_at: "2026-02-23T10:00:00Z",
  ...overrides,
});

// Mock the hook at the module level.
const mockUseSegmentProvenance = vi.fn();

vi.mock("../hooks/use-provenance", () => ({
  useSegmentProvenance: (...args: unknown[]) => mockUseSegmentProvenance(...args),
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ReceiptPanel", () => {
  it("renders receipt panel with receipt id badge", () => {
    const receipt = makeReceipt();
    mockUseSegmentProvenance.mockReturnValue({
      data: receipt,
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<ReceiptPanel segmentId={10} />);

    expect(screen.getByTestId("receipt-panel")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("Generation Receipt")).toBeInTheDocument();
  });

  it("shows empty state when no receipt exists", () => {
    mockUseSegmentProvenance.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<ReceiptPanel segmentId={10} />);

    expect(screen.getByTestId("receipt-empty")).toBeInTheDocument();
    expect(
      screen.getByText("No generation receipt for this segment."),
    ).toBeInTheDocument();
  });

  it("shows loading spinner while fetching", () => {
    mockUseSegmentProvenance.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderWithProviders(<ReceiptPanel segmentId={10} />);

    expect(screen.getByTestId("receipt-loading")).toBeInTheDocument();
  });

  it("shows error state on fetch failure", () => {
    mockUseSegmentProvenance.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderWithProviders(<ReceiptPanel segmentId={10} />);

    expect(screen.getByTestId("receipt-error")).toBeInTheDocument();
  });

  it("renders all accordion sections", () => {
    const receipt = makeReceipt();
    mockUseSegmentProvenance.mockReturnValue({
      data: receipt,
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<ReceiptPanel segmentId={10} />);

    expect(screen.getByText("Image Hashes")).toBeInTheDocument();
    expect(screen.getByText("Model Info")).toBeInTheDocument();
    expect(screen.getByText("LoRA Configs (1)")).toBeInTheDocument();
    expect(screen.getByText("Generation Parameters")).toBeInTheDocument();
    expect(screen.getByText("Timing")).toBeInTheDocument();
  });

  it("shows zero lora configs label when empty", () => {
    const receipt = makeReceipt({ lora_configs: [] });
    mockUseSegmentProvenance.mockReturnValue({
      data: receipt,
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<ReceiptPanel segmentId={10} />);

    expect(screen.getByText("LoRA Configs (0)")).toBeInTheDocument();
  });
});

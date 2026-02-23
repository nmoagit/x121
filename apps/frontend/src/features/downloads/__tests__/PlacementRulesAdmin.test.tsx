import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { PlacementRulesAdmin } from "../PlacementRulesAdmin";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([
      {
        id: 1,
        model_type: "checkpoint",
        base_model: null,
        target_directory: "/models/checkpoints/",
        priority: 0,
        is_active: true,
        created_at: "2026-02-22T00:00:00Z",
        updated_at: "2026-02-22T00:00:00Z",
      },
      {
        id: 2,
        model_type: "lora",
        base_model: "SDXL",
        target_directory: "/models/loras/sdxl/",
        priority: 10,
        is_active: true,
        created_at: "2026-02-22T00:00:00Z",
        updated_at: "2026-02-22T00:00:00Z",
      },
      {
        id: 3,
        model_type: "vae",
        base_model: null,
        target_directory: "/models/vae/",
        priority: 0,
        is_active: false,
        created_at: "2026-02-22T00:00:00Z",
        updated_at: "2026-02-22T00:00:00Z",
      },
    ]),
    post: vi.fn().mockResolvedValue({
      id: 4,
      model_type: "checkpoint",
      base_model: null,
      target_directory: "/models/checkpoints/",
      priority: 0,
      is_active: true,
      created_at: "2026-02-22T00:00:00Z",
      updated_at: "2026-02-22T00:00:00Z",
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("PlacementRulesAdmin", () => {
  it("renders the rules table", async () => {
    renderWithProviders(<PlacementRulesAdmin />);
    expect(await screen.findByText("/models/checkpoints/")).toBeInTheDocument();
    expect(await screen.findByText("/models/loras/sdxl/")).toBeInTheDocument();
    expect(await screen.findByText("/models/vae/")).toBeInTheDocument();
  });

  it("shows the Add Rule button", () => {
    renderWithProviders(<PlacementRulesAdmin />);
    expect(screen.getByText("Add Rule")).toBeInTheDocument();
  });

  it("shows delete buttons for each rule", async () => {
    renderWithProviders(<PlacementRulesAdmin />);
    await screen.findByText("/models/checkpoints/");
    const deleteButtons = screen.getAllByTitle("Delete rule");
    expect(deleteButtons).toHaveLength(3);
  });
});

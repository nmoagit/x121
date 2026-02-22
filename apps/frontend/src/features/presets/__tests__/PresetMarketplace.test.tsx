import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { PresetMarketplace } from "../PresetMarketplace";
import type { PresetWithRating } from "../types";

const MOCK_PRESETS: PresetWithRating[] = [
  {
    id: 1,
    name: "Cinematic Look",
    description: "Film-grade colour grading",
    owner_id: 1,
    scope: "studio",
    project_id: null,
    parameters: { brightness: 80, contrast: 70 },
    version: 1,
    usage_count: 42,
    is_active: true,
    created_at: "2026-02-22T10:00:00Z",
    updated_at: "2026-02-22T10:00:00Z",
    avg_rating: 4.5,
    rating_count: 10,
  },
  {
    id: 2,
    name: "Vintage Film",
    description: null,
    owner_id: 2,
    scope: "project",
    project_id: 5,
    parameters: { saturation: 30 },
    version: 2,
    usage_count: 7,
    is_active: true,
    created_at: "2026-02-22T11:00:00Z",
    updated_at: "2026-02-22T11:00:00Z",
    avg_rating: null,
    rating_count: 0,
  },
];

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/presets/marketplace")) {
        return Promise.resolve(MOCK_PRESETS);
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("PresetMarketplace", () => {
  it("renders preset cards", async () => {
    renderWithProviders(<PresetMarketplace />);

    await waitFor(() => {
      expect(screen.getByTestId("preset-grid")).toBeInTheDocument();
    });

    expect(screen.getByText("Cinematic Look")).toBeInTheDocument();
    expect(screen.getByText("Vintage Film")).toBeInTheDocument();
  });

  it("shows rating stars", async () => {
    renderWithProviders(<PresetMarketplace />);

    await waitFor(() => {
      expect(screen.getByTestId("preset-card-1")).toBeInTheDocument();
    });

    const ratings = screen.getAllByTestId("star-rating");
    expect(ratings.length).toBeGreaterThanOrEqual(1);
    expect(ratings[0]).toHaveTextContent("4.5");
  });

  it("shows usage count", async () => {
    renderWithProviders(<PresetMarketplace />);

    await waitFor(() => {
      expect(screen.getByTestId("preset-card-1")).toBeInTheDocument();
    });

    const usageCounts = screen.getAllByTestId("usage-count");
    expect(usageCounts[0]).toHaveTextContent("42");
  });

  it("renders sort dropdown with options", async () => {
    renderWithProviders(<PresetMarketplace />);

    await waitFor(() => {
      expect(screen.getByTestId("sort-select")).toBeInTheDocument();
    });

    const select = screen.getByTestId("sort-select") as HTMLSelectElement;
    expect(select.value).toBe("popular");
    expect(select.options.length).toBe(3);
  });
});

import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { StartupChecklist } from "../StartupChecklist";

// vi.mock is hoisted — all data must be inline (no external references).
const mockGet = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn().mockResolvedValue({}),
  },
}));

describe("StartupChecklist", () => {
  it("shows a loading spinner initially", () => {
    // Return a promise that never resolves to keep loading state
    mockGet.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<StartupChecklist />);
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("shows all-passed badge when every check succeeds", async () => {
    mockGet.mockResolvedValue({
      all_passed: true,
      checks: [
        { name: "Database", passed: true, error: null, required: true },
        { name: "Redis", passed: true, error: null, required: true },
        { name: "ComfyUI", passed: true, error: null, required: false },
      ],
    });

    renderWithProviders(<StartupChecklist />);

    await waitFor(() => {
      expect(screen.getByText("All Checks Passed")).toBeInTheDocument();
      expect(screen.getByText("Database")).toBeInTheDocument();
      expect(screen.getByText("Redis")).toBeInTheDocument();
      expect(screen.getByText("ComfyUI")).toBeInTheDocument();
    });
  });

  it("shows failure details for failed checks", async () => {
    mockGet.mockResolvedValue({
      all_passed: false,
      checks: [
        { name: "Database", passed: true, error: null, required: true },
        {
          name: "Redis",
          passed: false,
          error: "Connection timeout",
          required: true,
        },
        {
          name: "ComfyUI",
          passed: false,
          error: "Not reachable",
          required: false,
        },
      ],
    });

    renderWithProviders(<StartupChecklist />);

    await waitFor(() => {
      expect(screen.getByText("Some Checks Failed")).toBeInTheDocument();
      expect(screen.getByText("Connection timeout")).toBeInTheDocument();
      expect(screen.getByText("Not reachable")).toBeInTheDocument();
    });
  });

  it("distinguishes required from optional checks", async () => {
    mockGet.mockResolvedValue({
      all_passed: true,
      checks: [
        { name: "Database", passed: true, error: null, required: true },
        { name: "Monitoring", passed: true, error: null, required: false },
      ],
    });

    renderWithProviders(<StartupChecklist />);

    await waitFor(() => {
      expect(screen.getByText("Optional")).toBeInTheDocument();
    });
  });
});

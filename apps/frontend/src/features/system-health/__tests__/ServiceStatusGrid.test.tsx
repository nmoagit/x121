import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { ServiceStatusGrid } from "../ServiceStatusGrid";

// vi.mock is hoisted — all data must be inline (no external references).
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path === "/admin/health/statuses") {
        return Promise.resolve([
          {
            service_name: "database",
            status: "healthy",
            latency_ms: 5,
            checked_at: "2026-02-28T10:00:00Z",
            error_message: null,
          },
          {
            service_name: "comfyui",
            status: "degraded",
            latency_ms: 250,
            checked_at: "2026-02-28T10:00:00Z",
            error_message: "High latency",
          },
          {
            service_name: "workers",
            status: "down",
            latency_ms: null,
            checked_at: "2026-02-28T09:55:00Z",
            error_message: "Connection refused",
          },
        ]);
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({}),
  },
}));

describe("ServiceStatusGrid", () => {
  it("shows a loading spinner initially", () => {
    renderWithProviders(<ServiceStatusGrid />);
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("renders all service cards when loaded", async () => {
    renderWithProviders(<ServiceStatusGrid />);

    await waitFor(() => {
      expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
      expect(screen.getByText("ComfyUI")).toBeInTheDocument();
      expect(screen.getByText("Worker Pool")).toBeInTheDocument();
    });
  });

  it("renders fleet summary statistics", async () => {
    renderWithProviders(<ServiceStatusGrid />);

    await waitFor(() => {
      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("shows status badges for each service", async () => {
    renderWithProviders(<ServiceStatusGrid />);

    await waitFor(() => {
      // "Healthy" appears both in the summary stat label and in the badge,
      // so use getAllByText to account for multiple matches.
      expect(screen.getAllByText("Healthy").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Degraded").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Down").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("displays error messages for unhealthy services", async () => {
    renderWithProviders(<ServiceStatusGrid />);

    await waitFor(() => {
      expect(screen.getByText("High latency")).toBeInTheDocument();
      expect(screen.getByText("Connection refused")).toBeInTheDocument();
    });
  });
});

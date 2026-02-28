import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { ApiObservabilityPage } from "../ApiObservabilityPage";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/summary")) {
        return Promise.resolve({
          total_requests: 50000,
          error_rate: 0.023,
          avg_response_time: 142,
          top_endpoints: [],
        });
      }
      if (path.includes("/api-alerts")) {
        return Promise.resolve([]);
      }
      if (path.includes("/heatmap")) {
        return Promise.resolve([]);
      }
      if (path.includes("/rate-limits")) {
        return Promise.resolve([
          {
            id: 1,
            api_key_id: 10,
            period_start: "2026-02-28T10:00:00Z",
            period_granularity: "1h",
            requests_made: 400,
            rate_limit: 1000,
            utilization_pct: 40,
            created_at: "2026-02-28T10:00:00Z",
          },
        ]);
      }
      if (path.includes("/top-consumers")) {
        return Promise.resolve([]);
      }
      // Default: metrics list
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("ApiObservabilityPage", () => {
  it("renders the page title", () => {
    renderWithProviders(<ApiObservabilityPage />);
    expect(screen.getByText("API Usage & Observability")).toBeInTheDocument();
  });

  it("renders the time period selector", () => {
    renderWithProviders(<ApiObservabilityPage />);
    // The Select component renders a <select> with options
    const selects = document.querySelectorAll("select");
    expect(selects.length).toBeGreaterThan(0);
  });

  it("renders the auto-refresh toggle", () => {
    renderWithProviders(<ApiObservabilityPage />);
    expect(screen.getByText("Auto-refresh")).toBeInTheDocument();
  });

  it("renders summary statistics when loaded", async () => {
    renderWithProviders(<ApiObservabilityPage />);

    await waitFor(() => {
      expect(screen.getByText("Requests")).toBeInTheDocument();
      expect(screen.getByText("Error Rate")).toBeInTheDocument();
      expect(screen.getByText("Avg Response")).toBeInTheDocument();
    });
  });

  it("renders alert rules section", async () => {
    renderWithProviders(<ApiObservabilityPage />);

    await waitFor(() => {
      expect(screen.getByText("Alert Rules")).toBeInTheDocument();
    });
  });

  it("renders rate limit utilization section", async () => {
    renderWithProviders(<ApiObservabilityPage />);

    await waitFor(() => {
      expect(screen.getByText("Rate Limit Utilization")).toBeInTheDocument();
    });
  });
});

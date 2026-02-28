import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { RateLimitPanel } from "../RateLimitPanel";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
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
          {
            id: 2,
            api_key_id: 20,
            period_start: "2026-02-28T10:00:00Z",
            period_granularity: "1h",
            requests_made: 750,
            rate_limit: 1000,
            utilization_pct: 75,
            created_at: "2026-02-28T10:00:00Z",
          },
          {
            id: 3,
            api_key_id: 30,
            period_start: "2026-02-28T10:00:00Z",
            period_granularity: "1h",
            requests_made: 950,
            rate_limit: 1000,
            utilization_pct: 95,
            created_at: "2026-02-28T10:00:00Z",
          },
        ]);
      }
      return Promise.resolve([]);
    }),
  },
}));

describe("RateLimitPanel", () => {
  it("shows a loading spinner initially", () => {
    renderWithProviders(<RateLimitPanel />);
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("renders all utilization rows when loaded", async () => {
    renderWithProviders(<RateLimitPanel />);

    await waitFor(() => {
      expect(screen.getByText("Key #10")).toBeInTheDocument();
      expect(screen.getByText("Key #20")).toBeInTheDocument();
      expect(screen.getByText("Key #30")).toBeInTheDocument();
    });
  });

  it("renders progress bars with correct aria attributes", async () => {
    renderWithProviders(<RateLimitPanel />);

    await waitFor(() => {
      const bars = document.querySelectorAll('[role="progressbar"]');
      expect(bars.length).toBe(3);
    });
  });

  it("renders panel header", async () => {
    renderWithProviders(<RateLimitPanel />);

    await waitFor(() => {
      expect(screen.getByText("Rate Limit Utilization")).toBeInTheDocument();
    });
  });
});

import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { ConsumptionSummary } from "../ConsumptionSummary";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.startsWith("/admin/power/consumption")) {
        return Promise.resolve({
          worker_id: null,
          total_active_minutes: 1080,
          total_idle_minutes: 300,
          total_off_minutes: 1500,
          total_estimated_kwh: 42.5,
          always_on_kwh: 65.4,
          savings_pct: 35,
          entries: [
            {
              worker_id: 1,
              date: "2026-02-27",
              active_minutes: 600,
              idle_minutes: 200,
              off_minutes: 640,
              estimated_kwh: 15.2,
            },
            {
              worker_id: 2,
              date: "2026-02-27",
              active_minutes: 480,
              idle_minutes: 100,
              off_minutes: 860,
              estimated_kwh: 12.1,
            },
          ],
        });
      }
      return Promise.resolve([]);
    }),
  },
}));

const DEFAULT_PARAMS = {
  from: "2026-02-21",
  to: "2026-02-28",
};

describe("ConsumptionSummary", () => {
  it("renders total consumption", async () => {
    renderWithProviders(<ConsumptionSummary params={DEFAULT_PARAMS} />);

    await waitFor(() => {
      expect(screen.getByText("Total Consumption")).toBeInTheDocument();
      expect(screen.getByText("42.5 kWh")).toBeInTheDocument();
    });
  });

  it("renders energy savings percentage", async () => {
    renderWithProviders(<ConsumptionSummary params={DEFAULT_PARAMS} />);

    await waitFor(() => {
      expect(screen.getByText("Energy Savings")).toBeInTheDocument();
      expect(screen.getByText("35.0%")).toBeInTheDocument();
    });
  });

  it("renders consumption entries", async () => {
    renderWithProviders(<ConsumptionSummary params={DEFAULT_PARAMS} />);

    await waitFor(() => {
      expect(screen.getByText("15.20 kWh")).toBeInTheDocument();
      expect(screen.getByText("12.10 kWh")).toBeInTheDocument();
    });
  });

  it("renders time breakdown bars", async () => {
    renderWithProviders(<ConsumptionSummary params={DEFAULT_PARAMS} />);

    await waitFor(() => {
      // Legend items
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Idle")).toBeInTheDocument();
      expect(screen.getByText("Off")).toBeInTheDocument();
    });
  });

  it("shows a loading spinner while fetching", () => {
    renderWithProviders(<ConsumptionSummary params={DEFAULT_PARAMS} />);
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });
});

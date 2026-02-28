import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { AlertConfigPanel } from "../AlertConfigPanel";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/api-alerts")) {
        return Promise.resolve([
          {
            id: 1,
            name: "High Error Rate",
            alert_type: "error_rate",
            endpoint_filter: null,
            api_key_filter: null,
            threshold_value: 5,
            comparison: "gt",
            window_minutes: 5,
            cooldown_minutes: 15,
            enabled: true,
            last_fired_at: null,
            created_by: null,
            created_at: "2026-02-28T10:00:00Z",
            updated_at: "2026-02-28T10:00:00Z",
          },
          {
            id: 2,
            name: "Slow Response",
            alert_type: "response_time",
            endpoint_filter: "/api/v1/jobs",
            api_key_filter: null,
            threshold_value: 500,
            comparison: "gt",
            window_minutes: 10,
            cooldown_minutes: 30,
            enabled: false,
            last_fired_at: "2026-02-27T15:00:00Z",
            created_by: null,
            created_at: "2026-02-28T10:00:00Z",
            updated_at: "2026-02-28T10:00:00Z",
          },
        ]);
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("AlertConfigPanel", () => {
  it("shows a loading spinner initially", () => {
    renderWithProviders(<AlertConfigPanel />);
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("renders alert rules when loaded", async () => {
    renderWithProviders(<AlertConfigPanel />);

    await waitFor(() => {
      expect(screen.getByText("High Error Rate")).toBeInTheDocument();
      expect(screen.getByText("Slow Response")).toBeInTheDocument();
    });
  });

  it("renders alert type badges", async () => {
    renderWithProviders(<AlertConfigPanel />);

    await waitFor(() => {
      expect(screen.getByText("Error Rate")).toBeInTheDocument();
      expect(screen.getByText("Response Time")).toBeInTheDocument();
    });
  });

  it("renders the panel header with count", async () => {
    renderWithProviders(<AlertConfigPanel />);

    await waitFor(() => {
      expect(screen.getByText("Alert Rules")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("renders add rule button", async () => {
    renderWithProviders(<AlertConfigPanel />);

    await waitFor(() => {
      expect(screen.getByText("Add Rule")).toBeInTheDocument();
    });
  });
});

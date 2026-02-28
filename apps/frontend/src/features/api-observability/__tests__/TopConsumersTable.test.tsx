import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { TopConsumersTable } from "../TopConsumersTable";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/top-consumers")) {
        return Promise.resolve([
          {
            api_key_id: 10,
            request_count: 5000,
            error_rate: 2.0,
            total_bandwidth: 10485760,
          },
          {
            api_key_id: 20,
            request_count: 3200,
            error_rate: 5.0,
            total_bandwidth: 6291456,
          },
          {
            api_key_id: 30,
            request_count: 1800,
            error_rate: 1.0,
            total_bandwidth: 3145728,
          },
        ]);
      }
      return Promise.resolve([]);
    }),
  },
}));

describe("TopConsumersTable", () => {
  it("shows a loading spinner initially", () => {
    renderWithProviders(<TopConsumersTable />);
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("renders consumer rows when loaded", async () => {
    renderWithProviders(<TopConsumersTable />);

    await waitFor(() => {
      expect(screen.getByText("Key #10")).toBeInTheDocument();
      expect(screen.getByText("Key #20")).toBeInTheDocument();
      expect(screen.getByText("Key #30")).toBeInTheDocument();
    });
  });

  it("renders rank numbers", async () => {
    renderWithProviders(<TopConsumersTable />);

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("renders the panel header", async () => {
    renderWithProviders(<TopConsumersTable />);

    await waitFor(() => {
      expect(screen.getByText("Top Consumers")).toBeInTheDocument();
    });
  });

  it("renders sortable column headers", async () => {
    renderWithProviders(<TopConsumersTable />);

    await waitFor(() => {
      // "Requests" header has sort indicator since it's the default sort
      expect(screen.getByText("API Key")).toBeInTheDocument();
    });
  });
});

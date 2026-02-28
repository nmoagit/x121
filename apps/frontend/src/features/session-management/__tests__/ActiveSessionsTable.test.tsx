import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { ActiveSessionsTable } from "../ActiveSessionsTable";

// vi.mock is hoisted -- all data must be inline (no external references).
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path === "/admin/sessions") {
        return Promise.resolve({
          items: [
            {
              id: 1,
              user_id: 10,
              status: "active",
              ip_address: "192.168.1.1",
              user_agent: "Chrome",
              current_view: "/dashboard",
              last_activity: "2026-02-28T10:00:00Z",
              started_at: "2026-02-28T09:00:00Z",
              ended_at: null,
            },
            {
              id: 2,
              user_id: 20,
              status: "idle",
              ip_address: "10.0.0.5",
              user_agent: "Firefox",
              current_view: "/projects",
              last_activity: "2026-02-28T09:50:00Z",
              started_at: "2026-02-28T08:30:00Z",
              ended_at: null,
            },
            {
              id: 3,
              user_id: 30,
              status: "terminated",
              ip_address: null,
              user_agent: null,
              current_view: null,
              last_activity: "2026-02-28T08:00:00Z",
              started_at: "2026-02-28T07:00:00Z",
              ended_at: "2026-02-28T08:00:00Z",
            },
          ],
          total: 3,
        });
      }
      return Promise.resolve([]);
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("ActiveSessionsTable", () => {
  it("shows a loading spinner initially", () => {
    renderWithProviders(<ActiveSessionsTable />);
    const spinners = document.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("renders all session rows when loaded", async () => {
    renderWithProviders(<ActiveSessionsTable />);

    await waitFor(() => {
      expect(screen.getByText("User #10")).toBeInTheDocument();
      expect(screen.getByText("User #20")).toBeInTheDocument();
      expect(screen.getByText("User #30")).toBeInTheDocument();
    });
  });

  it("shows status badges for sessions", async () => {
    renderWithProviders(<ActiveSessionsTable />);

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Idle")).toBeInTheDocument();
      expect(screen.getByText("Terminated")).toBeInTheDocument();
    });
  });

  it("shows terminate button for non-terminated sessions only", async () => {
    renderWithProviders(<ActiveSessionsTable />);

    await waitFor(() => {
      // Two terminate buttons (for active and idle sessions)
      const buttons = screen.getAllByText("Terminate");
      expect(buttons).toHaveLength(2);
    });
  });

  it("opens confirmation modal when terminate is clicked", async () => {
    renderWithProviders(<ActiveSessionsTable />);

    await waitFor(() => {
      expect(screen.getByText("User #10")).toBeInTheDocument();
    });

    const terminateButtons = screen.getAllByText("Terminate");
    fireEvent.click(terminateButtons[0]!);

    expect(screen.getByText("Terminate Session")).toBeInTheDocument();
    expect(
      screen.getByText(/Are you sure you want to force-terminate/),
    ).toBeInTheDocument();
  });

  it("displays IP addresses for sessions", async () => {
    renderWithProviders(<ActiveSessionsTable />);

    await waitFor(() => {
      expect(screen.getByText("192.168.1.1")).toBeInTheDocument();
      expect(screen.getByText("10.0.0.5")).toBeInTheDocument();
    });
  });

  it("displays current view paths", async () => {
    renderWithProviders(<ActiveSessionsTable />);

    await waitFor(() => {
      expect(screen.getByText("/dashboard")).toBeInTheDocument();
      expect(screen.getByText("/projects")).toBeInTheDocument();
    });
  });
});

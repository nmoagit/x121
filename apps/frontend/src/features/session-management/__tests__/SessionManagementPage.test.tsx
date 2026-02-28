import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { SessionManagementPage } from "../SessionManagementPage";

// vi.mock is hoisted -- all data must be inline.
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
          ],
          total: 1,
        });
      }
      if (path === "/admin/sessions/analytics") {
        return Promise.resolve({
          total_sessions: 100,
          active_sessions: 25,
          idle_sessions: 10,
          avg_duration_seconds: 3600,
          peak_concurrent: 50,
        });
      }
      if (path.startsWith("/admin/sessions/login-history")) {
        return Promise.resolve({
          items: [
            {
              id: 1,
              username: "alice",
              user_id: 10,
              ip_address: "192.168.1.1",
              user_agent: "Chrome",
              success: true,
              failure_reason: null,
              created_at: "2026-02-28T09:00:00Z",
            },
          ],
          total: 1,
        });
      }
      if (path === "/admin/sessions/config") {
        return Promise.resolve([
          {
            id: 1,
            key: "idle_timeout_seconds",
            value: "300",
            description: "Seconds before a session is marked idle",
            created_at: "2026-02-28T00:00:00Z",
            updated_at: "2026-02-28T00:00:00Z",
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

describe("SessionManagementPage", () => {
  it("renders the page header", () => {
    renderWithProviders(<SessionManagementPage />);
    expect(screen.getByText("Session Management")).toBeInTheDocument();
  });

  it("renders all tabs", () => {
    renderWithProviders(<SessionManagementPage />);
    expect(screen.getByText("Active Sessions")).toBeInTheDocument();
    expect(screen.getByText("Login History")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("shows Active Sessions tab content by default", async () => {
    renderWithProviders(<SessionManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("User #10")).toBeInTheDocument();
    });
  });

  it("switches to Login History tab", async () => {
    renderWithProviders(<SessionManagementPage />);

    fireEvent.click(screen.getByText("Login History"));

    await waitFor(() => {
      expect(screen.getByText("Username")).toBeInTheDocument();
    });
  });

  it("switches to Analytics tab", async () => {
    renderWithProviders(<SessionManagementPage />);

    fireEvent.click(screen.getByText("Analytics"));

    await waitFor(() => {
      expect(screen.getByText("Total Sessions")).toBeInTheDocument();
    });
  });

  it("switches to Configuration tab", async () => {
    renderWithProviders(<SessionManagementPage />);

    fireEvent.click(screen.getByText("Configuration"));

    await waitFor(() => {
      expect(screen.getByText("Session Configuration")).toBeInTheDocument();
    });
  });
});

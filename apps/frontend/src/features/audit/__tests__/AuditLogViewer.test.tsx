import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { AuditLogViewer } from "../AuditLogViewer";

// Mock the api module to prevent real HTTP requests.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/admin/audit-logs")) {
        return Promise.resolve({
          items: [
            {
              id: 1,
              timestamp: "2026-02-20T10:00:00Z",
              user_id: 42,
              session_id: "sess-abc",
              action_type: "login",
              entity_type: null,
              entity_id: null,
              details_json: { browser: "Chrome" },
              ip_address: "192.168.1.1",
              user_agent: "Mozilla/5.0",
              integrity_hash: "abc123",
              created_at: "2026-02-20T10:00:00Z",
            },
            {
              id: 2,
              timestamp: "2026-02-20T10:05:00Z",
              user_id: null,
              session_id: null,
              action_type: "system",
              entity_type: "job",
              entity_id: 99,
              details_json: { event: "auto_retry" },
              ip_address: null,
              user_agent: null,
              integrity_hash: "def456",
              created_at: "2026-02-20T10:05:00Z",
            },
            {
              id: 3,
              timestamp: "2026-02-20T10:10:00Z",
              user_id: 7,
              session_id: "sess-xyz",
              action_type: "entity_create",
              entity_type: "project",
              entity_id: 5,
              details_json: null,
              ip_address: "10.0.0.1",
              user_agent: "TestAgent",
              integrity_hash: "ghi789",
              created_at: "2026-02-20T10:10:00Z",
            },
          ],
          total: 3,
        });
      }
      return Promise.resolve({ items: [], total: 0 });
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("AuditLogViewer", () => {
  it("renders the page title", async () => {
    renderWithProviders(<AuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText("Audit Log")).toBeInTheDocument();
    });
  });

  it("shows audit log entries after loading", async () => {
    renderWithProviders(<AuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText("User #42")).toBeInTheDocument();
      // "System" appears in both the filter dropdown and the table cell,
      // so use getAllByText and verify at least 2 matches (option + cell).
      const systemElements = screen.getAllByText("System");
      expect(systemElements.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("User #7")).toBeInTheDocument();
    });
  });

  it("shows action type badges", async () => {
    renderWithProviders(<AuditLogViewer />);

    await waitFor(() => {
      // "Login" also appears in the filter dropdown, use getAllByText.
      const loginElements = screen.getAllByText("Login");
      expect(loginElements.length).toBeGreaterThanOrEqual(1);
      const systemElements = screen.getAllByText("System");
      expect(systemElements.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Create")).toBeInTheDocument();
    });
  });

  it("shows entity information for entries with entity data", async () => {
    renderWithProviders(<AuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText("job #99")).toBeInTheDocument();
      expect(screen.getByText("project #5")).toBeInTheDocument();
    });
  });

  it("displays IP addresses", async () => {
    renderWithProviders(<AuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText("192.168.1.1")).toBeInTheDocument();
      expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    });
  });

  it("renders export buttons", () => {
    renderWithProviders(<AuditLogViewer />);

    expect(screen.getByText("Export CSV")).toBeInTheDocument();
    expect(screen.getByText("Export JSON")).toBeInTheDocument();
  });

  it("renders filter controls", () => {
    renderWithProviders(<AuditLogViewer />);

    expect(screen.getByPlaceholderText("Search log details...")).toBeInTheDocument();
    expect(screen.getByText("All Actions")).toBeInTheDocument();
    expect(screen.getByText("All Entities")).toBeInTheDocument();
  });

  it("shows pagination info", async () => {
    renderWithProviders(<AuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText(/Showing 1/)).toBeInTheDocument();
      expect(screen.getByText(/of 3/)).toBeInTheDocument();
    });
  });

  it("expands row details on click", async () => {
    renderWithProviders(<AuditLogViewer />);

    await waitFor(() => {
      expect(screen.getByText("User #42")).toBeInTheDocument();
    });

    // Click the first row.
    const firstRow = screen.getByText("User #42").closest("tr")!;
    fireEvent.click(firstRow);

    await waitFor(() => {
      expect(screen.getByText("Session ID")).toBeInTheDocument();
      expect(screen.getByText("sess-abc")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    renderWithProviders(<AuditLogViewer />);

    // Spinner should be rendered while loading.
    const spinner = document.querySelector('[class*="animate-spin"]');
    expect(spinner).toBeTruthy();
  });
});

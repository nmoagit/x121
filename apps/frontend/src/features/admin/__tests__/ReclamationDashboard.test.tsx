import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { ReclamationDashboard } from "../ReclamationDashboard";

// Mock the api module to prevent real HTTP requests.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/preview")) {
        return Promise.resolve({
          total_files: 42,
          total_bytes: 1_073_741_824,
          per_project: [
            {
              project_id: 1,
              project_name: "Project Alpha",
              file_count: 30,
              total_bytes: 805_306_368,
            },
            {
              project_id: 2,
              project_name: "Project Beta",
              file_count: 12,
              total_bytes: 268_435_456,
            },
          ],
        });
      }
      if (path.includes("/protection-rules")) {
        return Promise.resolve([
          {
            id: 1,
            name: "protect_source_images",
            description: "Source images are permanently protected",
            entity_type: "source_image",
            condition_field: "id",
            condition_operator: "is_not_null",
            condition_value: "true",
            is_active: true,
            created_at: "2026-02-21T00:00:00Z",
            updated_at: "2026-02-21T00:00:00Z",
          },
        ]);
      }
      if (path.includes("/policies")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({
      run_id: 1,
      files_scanned: 10,
      files_marked: 0,
      files_deleted: 5,
      bytes_reclaimed: 524288000,
      errors: [],
    }),
  },
}));

describe("ReclamationDashboard", () => {
  it("renders the dashboard title", async () => {
    renderWithProviders(<ReclamationDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Disk Reclamation")).toBeInTheDocument();
    });
  });

  it("shows total reclaimable space from preview data", async () => {
    renderWithProviders(<ReclamationDashboard />);

    await waitFor(() => {
      expect(screen.getByText("1.00 GB")).toBeInTheDocument();
    });
  });

  it("shows per-project breakdown", async () => {
    renderWithProviders(<ReclamationDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Project Alpha")).toBeInTheDocument();
      expect(screen.getByText("Project Beta")).toBeInTheDocument();
    });
  });

  it("shows the Run Cleanup button", async () => {
    renderWithProviders(<ReclamationDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Run Cleanup" })).toBeInTheDocument();
    });
  });

  it("shows tab navigation", async () => {
    renderWithProviders(<ReclamationDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Trash Queue" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "History" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Protection Rules" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Policies" })).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    renderWithProviders(<ReclamationDashboard />);

    // Spinner should be rendered initially while loading.
    const spinner = document.querySelector('[class*="animate-spin"]');
    expect(spinner).toBeTruthy();
  });
});

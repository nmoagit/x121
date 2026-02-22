import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ExportHistory } from "../ExportHistory";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([
      {
        id: 1,
        project_id: 1,
        format_profile_id: 1,
        status_id: 6,
        exported_by: 1,
        include_watermark: false,
        characters_json: null,
        file_path: "/exports/delivery-1.zip",
        file_size_bytes: 52_428_800,
        validation_results_json: null,
        error_message: null,
        started_at: "2026-02-20T10:00:00Z",
        completed_at: "2026-02-20T10:05:00Z",
        created_at: "2026-02-20T10:00:00Z",
        updated_at: "2026-02-20T10:05:00Z",
      },
      {
        id: 2,
        project_id: 1,
        format_profile_id: 2,
        status_id: 7,
        exported_by: 1,
        include_watermark: true,
        characters_json: null,
        file_path: null,
        file_size_bytes: null,
        validation_results_json: null,
        error_message: "Transcode failed",
        started_at: "2026-02-21T08:00:00Z",
        completed_at: "2026-02-21T08:02:00Z",
        created_at: "2026-02-21T08:00:00Z",
        updated_at: "2026-02-21T08:02:00Z",
      },
    ]),
  },
}));

describe("ExportHistory", () => {
  it("renders export list with status badges", async () => {
    renderWithProviders(<ExportHistory projectId={1} />);

    const rows = await screen.findAllByTestId("export-row");
    expect(rows).toHaveLength(2);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows download link for completed exports", async () => {
    renderWithProviders(<ExportHistory projectId={1} />);

    const link = await screen.findByTestId("download-link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/exports/delivery-1.zip");
  });

  it("renders file size formatted", async () => {
    renderWithProviders(<ExportHistory projectId={1} />);

    const sizes = await screen.findAllByTestId("file-size");
    // 52_428_800 bytes = ~50.0 MB
    expect(sizes[0]).toHaveTextContent("50.00 MB");
    // null file size displays as "--"
    expect(sizes[1]).toHaveTextContent("--");
  });
});

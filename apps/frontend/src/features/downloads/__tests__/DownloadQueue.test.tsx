import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { DownloadQueue } from "../DownloadQueue";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([
      {
        id: 1,
        status_id: 2,
        source_type: "civitai",
        source_url: "https://civitai.com/models/12345",
        source_model_id: "12345",
        source_version_id: null,
        model_name: "Test Checkpoint v2",
        model_type: "checkpoint",
        base_model: "SDXL",
        file_name: "test-checkpoint-v2.safetensors",
        file_size_bytes: 2_000_000_000,
        downloaded_bytes: 500_000_000,
        download_speed_bps: 10_000_000,
        target_path: "/models/checkpoints/sdxl/",
        expected_hash: null,
        actual_hash: null,
        hash_verified: false,
        hash_mismatch: false,
        source_metadata: {},
        asset_id: null,
        error_message: null,
        retry_count: 0,
        initiated_by: 1,
        started_at: "2026-02-22T10:00:00Z",
        completed_at: null,
        created_at: "2026-02-22T09:59:00Z",
        updated_at: "2026-02-22T10:00:00Z",
      },
      {
        id: 2,
        status_id: 6,
        source_type: "civitai",
        source_url: "https://civitai.com/models/12345",
        source_model_id: "12345",
        source_version_id: null,
        model_name: "Completed Model",
        model_type: "checkpoint",
        base_model: "SDXL",
        file_name: "test-checkpoint-v2.safetensors",
        file_size_bytes: 2_000_000_000,
        downloaded_bytes: 2_000_000_000,
        download_speed_bps: null,
        target_path: "/models/checkpoints/sdxl/",
        expected_hash: null,
        actual_hash: null,
        hash_verified: false,
        hash_mismatch: false,
        source_metadata: {},
        asset_id: null,
        error_message: null,
        retry_count: 0,
        initiated_by: 1,
        started_at: "2026-02-22T10:00:00Z",
        completed_at: "2026-02-22T10:05:00Z",
        created_at: "2026-02-22T09:59:00Z",
        updated_at: "2026-02-22T10:05:00Z",
      },
    ]),
    post: vi.fn().mockResolvedValue({ download_id: 3, status: "queued" }),
  },
}));

describe("DownloadQueue", () => {
  it("renders the download list", async () => {
    renderWithProviders(<DownloadQueue />);
    expect(await screen.findByText("Test Checkpoint v2")).toBeInTheDocument();
    expect(await screen.findByText("Completed Model")).toBeInTheDocument();
  });

  it("shows progress bars for active downloads", async () => {
    renderWithProviders(<DownloadQueue />);
    // The active download should show a percentage
    expect(await screen.findByText("25%")).toBeInTheDocument();
  });

  it("renders the URL input for new downloads", () => {
    renderWithProviders(<DownloadQueue />);
    expect(
      screen.getByPlaceholderText(
        "Paste model URL (CivitAI, HuggingFace, or direct)...",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Download")).toBeInTheDocument();
  });
});

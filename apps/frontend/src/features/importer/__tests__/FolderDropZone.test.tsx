import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { FolderDropZone } from "../FolderDropZone";

// Mock the api module and fetch to prevent real HTTP requests.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock fetch for multipart upload.
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () =>
    Promise.resolve({
      data: { session_id: 42, staging_path: "/tmp/staging/42", files_received: 3 },
    }),
});
vi.stubGlobal("fetch", mockFetch);

describe("FolderDropZone", () => {
  const defaultProps = {
    projectId: 1,
    onUploadComplete: vi.fn(),
  };

  it("renders the drop zone", () => {
    renderWithProviders(<FolderDropZone {...defaultProps} />);
    expect(
      screen.getByText("Drag a folder here to import characters"),
    ).toBeInTheDocument();
  });

  it("renders the browse button", () => {
    renderWithProviders(<FolderDropZone {...defaultProps} />);
    expect(screen.getByText("Browse folder")).toBeInTheDocument();
  });

  it("has a file input with directory attribute", () => {
    renderWithProviders(<FolderDropZone {...defaultProps} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.multiple).toBe(true);
  });

  it("renders the drop zone container with test id", () => {
    renderWithProviders(<FolderDropZone {...defaultProps} />);
    expect(screen.getByTestId("folder-drop-zone")).toBeInTheDocument();
  });
});

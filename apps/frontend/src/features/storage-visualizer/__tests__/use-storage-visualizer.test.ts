/**
 * Tests for storage visualizer TanStack Query hooks (PRD-19).
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useBreakdown,
  useCategories,
  useStorageSummary,
  useTreemapData,
} from "../hooks/use-storage-visualizer";
import type { FileTypeBreakdown, StorageSummary, TreemapNode } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

/* --------------------------------------------------------------------------
   Wrapper (provides QueryClient)
   -------------------------------------------------------------------------- */

// We need a fresh QueryClientProvider per test. Import lazily so the
// mock above is in place before any module-level evaluation.
async function getWrapper() {
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { createElement } = await import("react");

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("useTreemapData", () => {
  it("fetches root treemap and wraps response in synthetic root", async () => {
    // Backend returns an array of root-level nodes.
    const fakeNodes: TreemapNode[] = [
      {
        name: "Project A",
        entity_type: "project",
        entity_id: 1,
        size: 512,
        file_count: 5,
        reclaimable_bytes: 128,
        children: [],
      },
      {
        name: "Project B",
        entity_type: "project",
        entity_id: 2,
        size: 512,
        file_count: 5,
        reclaimable_bytes: 128,
        children: [],
      },
    ];
    mockGet.mockResolvedValueOnce(fakeNodes);

    const wrapper = await getWrapper();
    const { result } = renderHook(() => useTreemapData(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The hook wraps the array in a synthetic root node.
    const root = result.current.data;
    expect(root?.name).toBe("Root");
    expect(root?.entity_type).toBe("root");
    expect(root?.children).toHaveLength(2);
    expect(root?.size).toBe(1024);
    expect(root?.file_count).toBe(10);
    expect(root?.reclaimable_bytes).toBe(256);

    expect(mockGet).toHaveBeenCalledWith("/admin/storage/treemap");
  });

  it("passes entity_type and entity_id as query params", async () => {
    const fakeNodes: TreemapNode[] = [
      { name: "Char 1", entity_type: "character", entity_id: 10, size: 100, file_count: 2, reclaimable_bytes: 0, children: [] },
    ];
    mockGet.mockResolvedValueOnce(fakeNodes);

    const wrapper = await getWrapper();
    const { result } = renderHook(() => useTreemapData("project", 1), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(
      "/admin/storage/treemap?entity_type=project&entity_id=1",
    );
  });
});

describe("useBreakdown", () => {
  it("returns file type breakdown data", async () => {
    const fakeBreakdown: FileTypeBreakdown[] = [
      { category: "video", total_bytes: 500, file_count: 5, percentage: 0.5 },
      { category: "image", total_bytes: 500, file_count: 10, percentage: 0.5 },
    ];
    mockGet.mockResolvedValueOnce(fakeBreakdown);

    const wrapper = await getWrapper();
    const { result } = renderHook(() => useBreakdown(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0]?.category).toBe("video");
  });
});

describe("useStorageSummary", () => {
  it("returns summary statistics", async () => {
    const fakeSummary: StorageSummary = {
      total_bytes: 1048576,
      total_files: 100,
      reclaimable_bytes: 262144,
      reclaimable_percentage: 0.25,
      entity_count: 42,
      snapshot_at: "2026-02-28T00:00:00Z",
    };
    mockGet.mockResolvedValueOnce(fakeSummary);

    const wrapper = await getWrapper();
    const { result } = renderHook(() => useStorageSummary(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total_bytes).toBe(1048576);
    expect(result.current.data?.reclaimable_percentage).toBe(0.25);
    expect(result.current.data?.entity_count).toBe(42);
  });
});

describe("useCategories", () => {
  it("returns file type categories", async () => {
    const fakeCategories = [
      { id: 1, name: "video", description: null, extensions: [".mp4"], color: null },
    ];
    mockGet.mockResolvedValueOnce(fakeCategories);

    const wrapper = await getWrapper();
    const { result } = renderHook(() => useCategories(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SceneGallery } from "../SceneGallery";
import type { ComparisonCell, ComparisonResponse } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mockCells: ComparisonCell[] = [
  {
    avatar_id: 1,
    avatar_name: "Alice",
    scene_id: 10,
    segment_id: 100,
    scene_type_id: 5,
    scene_type_name: "Idle",
    image_variant_id: 1,
    status_id: 1,
    thumbnail_url: null,
    stream_url: "/stream/100",
    qa_score: 0.92,
    approval_status: "approved",
    duration_secs: 4.5,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    avatar_id: 2,
    avatar_name: "Bob",
    scene_id: 11,
    segment_id: 101,
    scene_type_id: 5,
    scene_type_name: "Idle",
    image_variant_id: 1,
    status_id: 1,
    thumbnail_url: null,
    stream_url: "/stream/101",
    qa_score: 0.45,
    approval_status: null,
    duration_secs: 3.2,
    created_at: "2026-01-02T00:00:00Z",
  },
  {
    avatar_id: 3,
    avatar_name: "Charlie",
    scene_id: 12,
    segment_id: 102,
    scene_type_id: 5,
    scene_type_name: "Idle",
    image_variant_id: 1,
    status_id: 1,
    thumbnail_url: null,
    stream_url: "/stream/102",
    qa_score: 0.78,
    approval_status: "rejected",
    duration_secs: 5.0,
    created_at: "2026-01-03T00:00:00Z",
  },
];

const mockResponse: ComparisonResponse = {
  scene_type_id: 5,
  scene_type_name: "Idle",
  cells: mockCells,
};

let mockLoading = false;
let mockData: ComparisonResponse | undefined = mockResponse;

vi.mock("../hooks/use-comparison", () => ({
  comparisonKeys: {
    all: ["comparison"],
    sceneType: (pId: number, stId: number) => ["comparison", "scene-type", pId, stId],
  },
  useSceneComparison: () => ({
    data: mockData,
    isLoading: mockLoading,
    error: null,
  }),
}));

vi.mock("@/features/cinema", () => ({
  useSyncPlay: () => ({
    syncPlay: vi.fn(),
    syncPause: vi.fn(),
    syncSeek: vi.fn(),
    syncSpeed: vi.fn(),
    isPlaying: false,
    speed: 1,
    currentTime: 0,
    duration: 0,
  }),
  GridControls: ({ cellCount }: { cellCount: number }) => (
    <div data-testid="grid-controls">Grid Controls ({cellCount})</div>
  ),
}));

vi.mock("@/features/review/hooks/use-review", () => ({
  useApproveSegment: () => ({ mutate: vi.fn() }),
  useRejectSegment: () => ({ mutate: vi.fn() }),
  useFlagSegment: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/features/video-player", () => ({
  formatDuration: (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`,
}));

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SceneGallery", () => {
  beforeEach(() => {
    mockLoading = false;
    mockData = mockResponse;
  });

  it("renders loading spinner while fetching", () => {
    mockLoading = true;
    mockData = undefined;

    render(<SceneGallery projectId={1} sceneTypeId={5} />, { wrapper: createWrapper() });

    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });

  it("renders gallery cells for each avatar", () => {
    render(<SceneGallery projectId={1} sceneTypeId={5} />, { wrapper: createWrapper() });

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("renders empty state when no cells", () => {
    mockData = { scene_type_id: 5, scene_type_name: "Idle", cells: [] };

    render(<SceneGallery projectId={1} sceneTypeId={5} />, { wrapper: createWrapper() });

    expect(screen.getByText("No scenes to compare")).toBeInTheDocument();
  });

  it("renders scene type name as heading", () => {
    render(<SceneGallery projectId={1} sceneTypeId={5} />, { wrapper: createWrapper() });

    expect(screen.getByText("Idle")).toBeInTheDocument();
  });

  it("displays cell count in controls", () => {
    render(<SceneGallery projectId={1} sceneTypeId={5} />, { wrapper: createWrapper() });

    expect(screen.getByText("3 cells")).toBeInTheDocument();
  });

  it("filters by status when filter is changed", async () => {
    render(<SceneGallery projectId={1} sceneTypeId={5} />, { wrapper: createWrapper() });

    // Find the status filter select
    const statusSelect = screen.getByLabelText("Status");
    fireEvent.change(statusSelect, { target: { value: "approved" } });

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.queryByText("Bob")).not.toBeInTheDocument();
      expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
    });
  });

  it("renders Approve All Passing button", () => {
    render(<SceneGallery projectId={1} sceneTypeId={5} />, { wrapper: createWrapper() });

    expect(screen.getByText("Approve All Passing")).toBeInTheDocument();
  });
});

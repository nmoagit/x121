import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { timelineKeys, useTimeline } from "../hooks/use-render-timeline";
import type { TimelineData } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mockTimelineData: TimelineData = {
  zoom: "6h",
  from: "2026-02-28T08:00:00Z",
  to: "2026-02-28T14:00:00Z",
  idle_workers: 1,
  busy_workers: 1,
  jobs: [
    {
      job_id: 1,
      worker_id: 1,
      worker_name: "gpu-worker-01",
      status_id: 2,
      priority: 5,
      job_type: "render",
      progress_percent: 42,
      start: "2026-02-28T10:05:00Z",
      end: "2026-02-28T10:15:00Z",
      lane: 1,
    },
    {
      job_id: 2,
      worker_id: null,
      worker_name: null,
      status_id: 1,
      priority: 0,
      job_type: "render",
      progress_percent: 0,
      start: "2026-02-28T10:10:00Z",
      end: "2026-02-28T10:15:00Z",
      lane: 0,
    },
  ],
  workers: [
    { id: 1, name: "gpu-worker-01", status_id: 2, current_job_id: 1 },
    { id: 2, name: "gpu-worker-02", status_id: 1, current_job_id: null },
  ],
};

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.startsWith("/queue/timeline")) {
        return Promise.resolve(mockTimelineData);
      }
      return Promise.resolve({});
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("timelineKeys", () => {
  it("produces correct query key for all", () => {
    expect(timelineKeys.all).toEqual(["render-timeline"]);
  });

  it("produces correct query key for timeline with zoom", () => {
    expect(timelineKeys.timeline("6h")).toEqual(["render-timeline", "timeline", "6h"]);
  });

  it("produces different keys for different zoom levels", () => {
    expect(timelineKeys.timeline("1h")).not.toEqual(timelineKeys.timeline("24h"));
  });
});

describe("useTimeline", () => {
  it("fetches timeline data for the given zoom level", async () => {
    // useTimeline needs a QueryClientProvider wrapper -- use renderWithProviders
    // pattern adapted for renderHook.
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const { createElement } = await import("react");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function wrapper({ children }: { children: React.ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    }

    const { result } = renderHook(() => useTimeline("6h"), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockTimelineData);
    expect(result.current.data?.jobs).toHaveLength(2);
    expect(result.current.data?.workers).toHaveLength(2);
  });

  it("returns window boundaries", async () => {
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const { createElement } = await import("react");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function wrapper({ children }: { children: React.ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    }

    const { result } = renderHook(() => useTimeline("6h"), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.from).toBe("2026-02-28T08:00:00Z");
    expect(result.current.data?.to).toBe("2026-02-28T14:00:00Z");
  });
});

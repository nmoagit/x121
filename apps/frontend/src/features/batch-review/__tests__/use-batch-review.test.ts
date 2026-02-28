/**
 * Tests for batch review hooks (PRD-92).
 *
 * Tests the query key factory and verifies mutations call the correct
 * API endpoints.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createElement } from "react";

import { batchReviewKeys } from "../hooks/use-batch-review";

/* --------------------------------------------------------------------------
   Mock the API module
   -------------------------------------------------------------------------- */

const mockPost = vi.fn();
const mockDelete = vi.fn();
const mockGet = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: vi.fn(),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

/* --------------------------------------------------------------------------
   Import hooks after mocking
   -------------------------------------------------------------------------- */

import {
  useAutoApprove,
  useBatchApprove,
  useCreateAssignment,
} from "../hooks/use-batch-review";

/* --------------------------------------------------------------------------
   Test wrapper
   -------------------------------------------------------------------------- */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("batchReviewKeys", () => {
  it("produces correct base key", () => {
    expect(batchReviewKeys.all).toEqual(["batch-review"]);
  });

  it("produces correct assignments key with project id", () => {
    expect(batchReviewKeys.assignments(42)).toEqual([
      "batch-review",
      "assignments",
      42,
    ]);
  });

  it("produces correct progress key with project id", () => {
    expect(batchReviewKeys.progress(7)).toEqual([
      "batch-review",
      "progress",
      7,
    ]);
  });

  it("produces correct session key", () => {
    expect(batchReviewKeys.session()).toEqual(["batch-review", "session"]);
  });
});

describe("useBatchApprove", () => {
  it("calls POST /review/batch-approve", async () => {
    mockPost.mockResolvedValueOnce({ processed_count: 3, segment_ids: [1, 2, 3] });

    const { result } = renderHook(() => useBatchApprove(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ segment_ids: [1, 2, 3] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPost).toHaveBeenCalledWith("/review/batch-approve", {
      segment_ids: [1, 2, 3],
    });
  });
});

describe("useAutoApprove", () => {
  it("calls POST /review/auto-approve", async () => {
    mockPost.mockResolvedValueOnce({ processed_count: 5, segment_ids: [10, 11, 12, 13, 14] });

    const { result } = renderHook(() => useAutoApprove(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ project_id: 1, threshold: 0.8 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPost).toHaveBeenCalledWith("/review/auto-approve", {
      project_id: 1,
      threshold: 0.8,
    });
  });
});

describe("useCreateAssignment", () => {
  it("calls POST /review/assignments and invalidates assignment list", async () => {
    mockPost.mockResolvedValueOnce({
      id: 1,
      project_id: 5,
      reviewer_user_id: 10,
      filter_criteria_json: {},
      deadline: null,
      status: "active",
      assigned_by: 1,
      created_at: "2026-02-28T00:00:00Z",
      updated_at: "2026-02-28T00:00:00Z",
    });

    const { result } = renderHook(() => useCreateAssignment(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ project_id: 5, reviewer_user_id: 10 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPost).toHaveBeenCalledWith("/review/assignments", {
      project_id: 5,
      reviewer_user_id: 10,
    });
  });
});

/**
 * Tests for DirectorsViewLayout component (PRD-55).
 *
 * Verifies correct layout rendering per breakpoint by mocking the
 * useBreakpoint hook and matchMedia.
 */

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { DirectorsViewLayout } from "../DirectorsViewLayout";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-breakpoint", () => ({
  useBreakpoint: vi.fn(),
}));

vi.mock("../hooks/use-directors-view", () => ({
  useReviewQueue: vi.fn(),
  useSubmitReviewAction: vi.fn(),
  useActivityFeed: vi.fn(),
}));

import { useBreakpoint } from "../hooks/use-breakpoint";
import { useActivityFeed, useReviewQueue, useSubmitReviewAction } from "../hooks/use-directors-view";

function setupMocks(breakpoint: "phone" | "tablet" | "desktop") {
  vi.mocked(useBreakpoint).mockReturnValue(breakpoint);

  vi.mocked(useReviewQueue).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    isRefetching: false,
  } as unknown as ReturnType<typeof useReviewQueue>);

  vi.mocked(useSubmitReviewAction).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useSubmitReviewAction>);

  vi.mocked(useActivityFeed).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useActivityFeed>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("DirectorsViewLayout", () => {
  it("renders phone layout with single column", () => {
    setupMocks("phone");

    renderWithProviders(<DirectorsViewLayout />);

    expect(screen.getByTestId("directors-view-layout")).toBeInTheDocument();
    expect(screen.getByTestId("directors-view-nav")).toBeInTheDocument();
  });

  it("renders tablet layout with two columns", () => {
    setupMocks("tablet");

    renderWithProviders(<DirectorsViewLayout />);

    expect(screen.getByTestId("directors-view-layout")).toBeInTheDocument();
    // Section headers appear as h2 elements
    expect(screen.getByText("Review Queue", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText("Activity", { selector: "h2" })).toBeInTheDocument();
  });

  it("renders desktop redirect message", () => {
    setupMocks("desktop");

    renderWithProviders(<DirectorsViewLayout />);

    expect(screen.getByTestId("directors-view-desktop-redirect")).toBeInTheDocument();
    expect(
      screen.getByText(/optimized for mobile and tablet/),
    ).toBeInTheDocument();
  });

  it("renders bottom navigation on phone", () => {
    setupMocks("phone");

    renderWithProviders(<DirectorsViewLayout />);

    expect(screen.getByText("Review Queue")).toBeInTheDocument();
    expect(screen.getByText("My Projects")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("shows empty queue state on phone", () => {
    setupMocks("phone");

    renderWithProviders(<DirectorsViewLayout />);

    expect(screen.getByTestId("review-queue-empty")).toBeInTheDocument();
  });
});

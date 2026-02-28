import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { RetryPolicyEditor } from "../RetryPolicyEditor";
import type { RetryPolicy } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-auto-retry", () => ({
  useRetryPolicy: vi.fn(),
  useUpdateRetryPolicy: vi.fn(),
}));

import { useRetryPolicy, useUpdateRetryPolicy } from "../hooks/use-auto-retry";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const DEFAULT_POLICY: RetryPolicy = {
  enabled: true,
  max_attempts: 3,
  trigger_checks: ["face_confidence", "motion_score"],
  seed_variation: true,
  cfg_jitter: 0.5,
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const mutateFn = vi.fn();

function setupMock(policy?: RetryPolicy, isPending = false) {
  vi.mocked(useRetryPolicy).mockReturnValue({
    data: policy,
    isPending,
    isError: false,
  } as ReturnType<typeof useRetryPolicy>);

  mutateFn.mockClear();
  vi.mocked(useUpdateRetryPolicy).mockReturnValue({
    mutate: mutateFn,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateRetryPolicy>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("RetryPolicyEditor", () => {
  it("renders loading spinner while fetching", () => {
    setupMock(undefined, true);

    renderWithProviders(<RetryPolicyEditor sceneTypeId={5} />);

    expect(screen.getByTestId("retry-policy-loading")).toBeInTheDocument();
  });

  it("renders policy form with current values", () => {
    setupMock(DEFAULT_POLICY);

    renderWithProviders(<RetryPolicyEditor sceneTypeId={5} />);

    expect(screen.getByTestId("retry-policy-editor")).toBeInTheDocument();
    expect(screen.getByTestId("retry-policy-enabled")).toBeInTheDocument();
    expect(screen.getByTestId("retry-policy-trigger-checks")).toBeInTheDocument();
    expect(screen.getByTestId("retry-policy-seed-variation")).toBeInTheDocument();
  });

  it("enable/disable toggle works", () => {
    setupMock(DEFAULT_POLICY);

    renderWithProviders(<RetryPolicyEditor sceneTypeId={5} />);

    const toggle = screen.getByRole("switch", { name: /enable auto-retry/i });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("save button disabled when not dirty", () => {
    setupMock(DEFAULT_POLICY);

    renderWithProviders(<RetryPolicyEditor sceneTypeId={5} />);

    const saveBtn = screen.getByTestId("retry-policy-save-btn");
    expect(saveBtn).toBeDisabled();
  });

  it("save button enabled when dirty and calls mutation on click", () => {
    setupMock(DEFAULT_POLICY);

    renderWithProviders(<RetryPolicyEditor sceneTypeId={5} />);

    // Toggle enabled to make form dirty
    const toggle = screen.getByRole("switch", { name: /enable auto-retry/i });
    fireEvent.click(toggle);

    const saveBtn = screen.getByTestId("retry-policy-save-btn");
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    expect(mutateFn).toHaveBeenCalledTimes(1);
    expect(mutateFn).toHaveBeenCalledWith({
      sceneTypeId: 5,
      data: expect.objectContaining({ enabled: false }),
    });
  });

  it("shows trigger check checkboxes", () => {
    setupMock(DEFAULT_POLICY);

    renderWithProviders(<RetryPolicyEditor sceneTypeId={5} />);

    expect(screen.getByText("Face Confidence")).toBeInTheDocument();
    expect(screen.getByText("Motion Score")).toBeInTheDocument();
    expect(screen.getByText("Resolution")).toBeInTheDocument();
    expect(screen.getByText("Frame Quality")).toBeInTheDocument();
  });

  it("renders when policy is undefined (no data yet, not loading)", () => {
    setupMock(undefined, false);

    renderWithProviders(<RetryPolicyEditor sceneTypeId={5} />);

    expect(screen.getByTestId("retry-policy-editor")).toBeInTheDocument();
    // Save button should be disabled (draft matches default, no server data to diff)
    const saveBtn = screen.getByTestId("retry-policy-save-btn");
    expect(saveBtn).toBeDisabled();
  });
});

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { JobControls } from "../JobControls";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("JobControls", () => {
  it("shows pause button when job is running", () => {
    renderWithProviders(
      <JobControls
        status="running"
        isLoading={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onAbort={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Pause" }),
    ).toBeInTheDocument();
  });

  it("shows resume button when job is paused", () => {
    renderWithProviders(
      <JobControls
        status="paused"
        isLoading={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onAbort={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Resume" }),
    ).toBeInTheDocument();
    // Pause button should not be visible
    expect(
      screen.queryByRole("button", { name: "Pause" }),
    ).not.toBeInTheDocument();
  });

  it("shows abort button always", () => {
    for (const status of ["running", "paused", "aborted"] as const) {
      const { unmount } = renderWithProviders(
        <JobControls
          status={status}
          isLoading={false}
          onPause={vi.fn()}
          onResume={vi.fn()}
          onAbort={vi.fn()}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Abort" }),
      ).toBeInTheDocument();

      unmount();
    }
  });

  it("disables buttons during mutation", () => {
    renderWithProviders(
      <JobControls
        status="running"
        isLoading={true}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onAbort={vi.fn()}
      />,
    );

    const pauseButton = screen.getByRole("button", { name: "Pausing..." });
    expect(pauseButton).toBeDisabled();

    const abortButton = screen.getByRole("button", { name: "Aborting..." });
    expect(abortButton).toBeDisabled();
  });
});

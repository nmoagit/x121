import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { PipelineStageDiagram } from "../PipelineStageDiagram";
import type { PipelineStage, FailureDiagnosticDetail } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

function makeStages(overrides?: Partial<PipelineStage>[]): PipelineStage[] {
  const defaults: PipelineStage[] = [
    { index: 0, name: "Initialize", status: "completed", checkpoint: null },
    { index: 1, name: "Render Segment 1", status: "completed", checkpoint: null },
    { index: 2, name: "Render Segment 2", status: "completed", checkpoint: null },
    { index: 3, name: "Upscale", status: "failed", checkpoint: null },
    { index: 4, name: "Composite", status: "pending", checkpoint: null },
    { index: 5, name: "Export", status: "pending", checkpoint: null },
  ];

  if (overrides) {
    return defaults.map((stage, i) => ({
      ...stage,
      ...(overrides[i] ?? {}),
    }));
  }
  return defaults;
}

const diagnostics: FailureDiagnosticDetail = {
  stage_index: 3,
  stage_name: "Upscale",
  error_message: "Out of GPU memory",
  comfyui_error: "CUDA OOM at node 12",
  node_id: "12",
  gpu_memory_used_mb: 7800,
  gpu_memory_total_mb: 8192,
  input_state: null,
  timestamp: "2026-02-21T10:00:00Z",
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("PipelineStageDiagram", () => {
  it("renders empty state when no stages provided", () => {
    renderWithProviders(
      <PipelineStageDiagram
        stages={[]}
        diagnostics={null}
        canResume={false}
      />,
    );

    expect(screen.getByText("No pipeline stages available")).toBeInTheDocument();
  });

  it("renders all stage names", () => {
    renderWithProviders(
      <PipelineStageDiagram
        stages={makeStages()}
        diagnostics={null}
        canResume={false}
      />,
    );

    expect(screen.getByText("Initialize")).toBeInTheDocument();
    expect(screen.getByText("Render Segment 1")).toBeInTheDocument();
    expect(screen.getByText("Render Segment 2")).toBeInTheDocument();
    expect(screen.getByText("Upscale")).toBeInTheDocument();
    expect(screen.getByText("Composite")).toBeInTheDocument();
    expect(screen.getByText("Export")).toBeInTheDocument();
  });

  it("shows completed icons for completed stages", () => {
    renderWithProviders(
      <PipelineStageDiagram
        stages={makeStages()}
        diagnostics={null}
        canResume={false}
      />,
    );

    const completedIcons = screen.getAllByTestId("stage-icon-completed");
    expect(completedIcons).toHaveLength(3);
  });

  it("shows failed icon for failed stage", () => {
    renderWithProviders(
      <PipelineStageDiagram
        stages={makeStages()}
        diagnostics={null}
        canResume={false}
      />,
    );

    const failedIcons = screen.getAllByTestId("stage-icon-failed");
    expect(failedIcons).toHaveLength(1);
  });

  it("shows pending icons for pending stages", () => {
    renderWithProviders(
      <PipelineStageDiagram
        stages={makeStages()}
        diagnostics={null}
        canResume={false}
      />,
    );

    const pendingIcons = screen.getAllByTestId("stage-icon-pending");
    expect(pendingIcons).toHaveLength(2);
  });

  it("displays stage count badge", () => {
    renderWithProviders(
      <PipelineStageDiagram
        stages={makeStages()}
        diagnostics={null}
        canResume={false}
      />,
    );

    expect(screen.getByText("3/6 stages")).toBeInTheDocument();
  });

  it("shows resume button when canResume is true", () => {
    const onResume = vi.fn();
    renderWithProviders(
      <PipelineStageDiagram
        stages={makeStages()}
        diagnostics={diagnostics}
        canResume={true}
        onResume={onResume}
      />,
    );

    const resumeButton = screen.getByRole("button", {
      name: /Resume from Checkpoint/,
    });
    expect(resumeButton).toBeInTheDocument();
  });

  it("does not show resume button when canResume is false", () => {
    renderWithProviders(
      <PipelineStageDiagram
        stages={makeStages()}
        diagnostics={diagnostics}
        canResume={false}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Resume from Checkpoint/ }),
    ).not.toBeInTheDocument();
  });

  it("shows error message for failed stage", () => {
    renderWithProviders(
      <PipelineStageDiagram
        stages={makeStages()}
        diagnostics={diagnostics}
        canResume={false}
      />,
    );

    expect(screen.getByText("Out of GPU memory")).toBeInTheDocument();
  });

  it("expands error detail on click", () => {
    renderWithProviders(
      <PipelineStageDiagram
        stages={makeStages()}
        diagnostics={diagnostics}
        canResume={false}
      />,
    );

    // Click the error message to expand
    fireEvent.click(screen.getByText("Out of GPU memory"));

    // Should now show ComfyUI error
    expect(screen.getByText(/CUDA OOM at node 12/)).toBeInTheDocument();
    expect(screen.getByText(/7800 MB/)).toBeInTheDocument();
  });

  it("calls onResume when resume button is clicked", () => {
    const onResume = vi.fn();
    renderWithProviders(
      <PipelineStageDiagram
        stages={makeStages()}
        diagnostics={diagnostics}
        canResume={true}
        onResume={onResume}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Resume from Checkpoint/ }),
    );
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("renders pipeline header text", () => {
    renderWithProviders(
      <PipelineStageDiagram
        stages={makeStages()}
        diagnostics={null}
        canResume={false}
      />,
    );

    expect(screen.getByText("Pipeline Progress")).toBeInTheDocument();
  });
});

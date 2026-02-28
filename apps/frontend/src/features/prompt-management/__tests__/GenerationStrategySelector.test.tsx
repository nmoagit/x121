import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { GenerationStrategySelector } from "../GenerationStrategySelector";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("GenerationStrategySelector", () => {
  it("renders select with both options", () => {
    const onChange = vi.fn();

    renderWithProviders(
      <GenerationStrategySelector value="platform_orchestrated" onChange={onChange} />,
    );

    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();

    const options = screen.getAllByRole("option");
    const optionValues = options.map((o) => (o as HTMLOptionElement).value);
    expect(optionValues).toContain("platform_orchestrated");
    expect(optionValues).toContain("workflow_managed");
  });

  it("shows help text for platform_orchestrated", () => {
    const onChange = vi.fn();

    renderWithProviders(
      <GenerationStrategySelector value="platform_orchestrated" onChange={onChange} />,
    );

    expect(screen.getByTestId("strategy-help-text")).toHaveTextContent(
      "The platform controls the generation pipeline",
    );
  });

  it("shows additional fields when workflow_managed selected", () => {
    const onChange = vi.fn();

    renderWithProviders(
      <GenerationStrategySelector
        value="workflow_managed"
        onChange={onChange}
        expectedChunks={4}
        chunkOutputPattern="output_{index}.mp4"
        onExpectedChunksChange={vi.fn()}
        onChunkOutputPatternChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("workflow-managed-fields")).toBeInTheDocument();
    expect(screen.getByTestId("expected-chunks-input")).toBeInTheDocument();
    expect(screen.getByTestId("chunk-output-pattern-input")).toBeInTheDocument();
  });

  it("hides additional fields when platform_orchestrated selected", () => {
    const onChange = vi.fn();

    renderWithProviders(
      <GenerationStrategySelector value="platform_orchestrated" onChange={onChange} />,
    );

    expect(screen.queryByTestId("workflow-managed-fields")).not.toBeInTheDocument();
  });

  it("calls onChange when strategy is changed", () => {
    const onChange = vi.fn();

    renderWithProviders(
      <GenerationStrategySelector value="platform_orchestrated" onChange={onChange} />,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "workflow_managed" },
    });

    expect(onChange).toHaveBeenCalledWith("workflow_managed");
  });
});

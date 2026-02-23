import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ParameterEditor } from "../ParameterEditor";
import type { DiscoveredParameter } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const sampleParams: DiscoveredParameter[] = [
  {
    node_id: "3",
    input_name: "seed",
    param_type: "seed",
    current_value: 42,
    suggested_name: "Random Seed",
    category: "Sampling",
  },
  {
    node_id: "3",
    input_name: "cfg",
    param_type: "cfg",
    current_value: 7.5,
    suggested_name: "CFG Scale",
    category: "Sampling",
  },
  {
    node_id: "6",
    input_name: "text",
    param_type: "prompt",
    current_value: "a beautiful landscape",
    suggested_name: "Prompt",
    category: "Prompts",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ParameterEditor", () => {
  it("renders parameters grouped by category", () => {
    renderWithProviders(<ParameterEditor parameters={sampleParams} />);

    expect(screen.getByTestId("parameter-editor")).toBeInTheDocument();
    expect(
      screen.getByTestId("param-row-3-seed"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("param-row-3-cfg"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("param-row-6-text"),
    ).toBeInTheDocument();
  });

  it("displays suggested names", () => {
    renderWithProviders(<ParameterEditor parameters={sampleParams} />);

    expect(screen.getByText("Random Seed")).toBeInTheDocument();
    expect(screen.getByText("CFG Scale")).toBeInTheDocument();
    expect(screen.getByTestId("param-row-6-text")).toBeInTheDocument();
  });

  it("shows empty state when no parameters", () => {
    renderWithProviders(<ParameterEditor parameters={[]} />);

    expect(screen.getByTestId("parameters-empty")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No configurable parameters detected in this workflow.",
      ),
    ).toBeInTheDocument();
  });

  it("displays current values", () => {
    renderWithProviders(<ParameterEditor parameters={sampleParams} />);

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("7.5")).toBeInTheDocument();
  });
});

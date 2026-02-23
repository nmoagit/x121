import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ParameterEditor } from "../ParameterEditor";
import type { DiscoveredParameter } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const samplingParams: DiscoveredParameter[] = [
  {
    node_id: "3",
    input_name: "steps",
    param_type: "steps",
    current_value: 20,
    suggested_name: "Sampling Steps",
    category: "Sampling",
  },
  {
    node_id: "3",
    input_name: "sampler_name",
    param_type: "sampler",
    current_value: "euler_ancestral",
    suggested_name: "Sampler",
    category: "Sampling",
  },
];

const imageParams: DiscoveredParameter[] = [
  {
    node_id: "1",
    input_name: "image",
    param_type: "image",
    current_value: "input.png",
    suggested_name: "Input Image",
    category: "Images",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ParameterEditor", () => {
  it("renders sampling parameters", () => {
    renderWithProviders(<ParameterEditor parameters={samplingParams} />);

    expect(screen.getByTestId("parameter-editor")).toBeInTheDocument();
    expect(screen.getByText("Sampling Steps")).toBeInTheDocument();
    expect(screen.getByTestId("param-row-3-sampler_name")).toBeInTheDocument();
  });

  it("renders image parameters in separate category", () => {
    renderWithProviders(
      <ParameterEditor parameters={[...samplingParams, ...imageParams]} />,
    );

    expect(screen.getByText("Sampling")).toBeInTheDocument();
    expect(screen.getByText("Images")).toBeInTheDocument();
    expect(screen.getByText("Input Image")).toBeInTheDocument();
  });

  it("shows empty state", () => {
    renderWithProviders(<ParameterEditor parameters={[]} />);

    expect(screen.getByTestId("parameters-empty")).toBeInTheDocument();
  });
});

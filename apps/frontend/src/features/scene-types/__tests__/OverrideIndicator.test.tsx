import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";

import { OverrideIndicator } from "../OverrideIndicator";
import type { FieldSource } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const OWN_SOURCE: FieldSource = { type: "own" };

const INHERITED_SOURCE: FieldSource = {
  type: "inherited",
  from_id: 5,
  from_name: "Base Portrait",
};

const MIXIN_SOURCE: FieldSource = {
  type: "mixin",
  mixin_id: 3,
  mixin_name: "High Quality",
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("OverrideIndicator", () => {
  it("renders 'Overridden' badge for own source", () => {
    renderWithProviders(
      <OverrideIndicator fieldName="prompt_template" source={OWN_SOURCE} />,
    );

    expect(screen.getByText("Overridden")).toBeInTheDocument();
  });

  it("renders revert button when onToggleOverride is provided", () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <OverrideIndicator
        fieldName="prompt_template"
        source={OWN_SOURCE}
        onToggleOverride={onToggle}
      />,
    );

    const revertBtn = screen.getByRole("button", {
      name: /Revert prompt_template/,
    });
    expect(revertBtn).toBeInTheDocument();
  });

  it("does not render revert button when onToggleOverride is absent", () => {
    renderWithProviders(
      <OverrideIndicator fieldName="prompt_template" source={OWN_SOURCE} />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders inherited text with parent name", () => {
    renderWithProviders(
      <OverrideIndicator fieldName="lora_config" source={INHERITED_SOURCE} />,
    );

    expect(
      screen.getByText("Inherited from Base Portrait"),
    ).toBeInTheDocument();
  });

  it("renders mixin text with mixin name", () => {
    renderWithProviders(
      <OverrideIndicator fieldName="model_config" source={MIXIN_SOURCE} />,
    );

    expect(screen.getByText("From mixin: High Quality")).toBeInTheDocument();
  });

  it("falls back to id when name is not provided for inherited", () => {
    const source: FieldSource = { type: "inherited", from_id: 7 };
    renderWithProviders(
      <OverrideIndicator fieldName="duration" source={source} />,
    );

    expect(screen.getByText("Inherited from #7")).toBeInTheDocument();
  });

  it("falls back to id when name is not provided for mixin", () => {
    const source: FieldSource = { type: "mixin", mixin_id: 9 };
    renderWithProviders(
      <OverrideIndicator fieldName="params" source={source} />,
    );

    expect(screen.getByText("From mixin: #9")).toBeInTheDocument();
  });
});

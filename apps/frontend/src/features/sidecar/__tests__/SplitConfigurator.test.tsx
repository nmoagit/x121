/**
 * Tests for SplitConfigurator component (PRD-40).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { SplitConfigurator } from "../SplitConfigurator";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SplitConfigurator", () => {
  test("renders three inputs", () => {
    renderWithProviders(
      <SplitConfigurator
        train={70}
        validation={20}
        test={10}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("split-configurator")).toBeInTheDocument();
    expect(screen.getByTestId("split-train")).toBeInTheDocument();
    expect(screen.getByTestId("split-validation")).toBeInTheDocument();
    expect(screen.getByTestId("split-test")).toBeInTheDocument();
  });

  test("shows valid state when sum is 100", () => {
    renderWithProviders(
      <SplitConfigurator
        train={70}
        validation={20}
        test={10}
        onChange={vi.fn()}
      />,
    );

    const sumEl = screen.getByTestId("split-sum");
    expect(sumEl).toHaveTextContent("Total: 100%");
    // Should NOT show the error hint.
    expect(sumEl).not.toHaveTextContent("must equal 100%");
  });

  test("shows error state when sum is not 100", () => {
    renderWithProviders(
      <SplitConfigurator
        train={50}
        validation={20}
        test={10}
        onChange={vi.fn()}
      />,
    );

    const sumEl = screen.getByTestId("split-sum");
    expect(sumEl).toHaveTextContent("Total: 80%");
    expect(sumEl).toHaveTextContent("must equal 100%");
  });
});

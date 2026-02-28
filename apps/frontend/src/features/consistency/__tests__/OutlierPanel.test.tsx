/**
 * Tests for OutlierPanel component (PRD-94).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { OutlierPanel } from "../OutlierPanel";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("OutlierPanel", () => {
  test("lists outlier scenes with labels", () => {
    renderWithProviders(
      <OutlierPanel
        outlierSceneIds={[10, 20, 30]}
        sceneLabels={{ 10: "Forest Scene", 20: "Beach Scene", 30: "City Scene" }}
      />,
    );

    expect(screen.getByTestId("outlier-10")).toHaveTextContent("Forest Scene");
    expect(screen.getByTestId("outlier-20")).toHaveTextContent("Beach Scene");
    expect(screen.getByTestId("outlier-30")).toHaveTextContent("City Scene");
  });

  test("shows empty state when no outliers", () => {
    renderWithProviders(<OutlierPanel outlierSceneIds={null} />);

    expect(screen.getByTestId("outlier-empty")).toHaveTextContent(
      "No outliers detected.",
    );
  });

  test("renders re-queue buttons for each outlier", () => {
    const handleRequeue = vi.fn();

    renderWithProviders(
      <OutlierPanel
        outlierSceneIds={[10, 20]}
        onRequeue={handleRequeue}
      />,
    );

    expect(screen.getByTestId("requeue-btn-10")).toBeInTheDocument();
    expect(screen.getByTestId("requeue-btn-20")).toBeInTheDocument();
  });
});

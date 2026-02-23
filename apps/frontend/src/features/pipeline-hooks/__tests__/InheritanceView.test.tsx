import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { InheritanceView } from "../InheritanceView";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("InheritanceView", () => {
  it("renders loading or content state", () => {
    renderWithProviders(
      <InheritanceView scopeType="project" scopeId={1} />,
    );

    const loading = screen.queryByTestId("inheritance-loading");
    const empty = screen.queryByTestId("inheritance-empty");
    const view = screen.queryByTestId("inheritance-view");
    expect(loading || empty || view).toBeTruthy();
  });

  it("renders with a specific hook point filter", () => {
    renderWithProviders(
      <InheritanceView
        scopeType="scene_type"
        scopeId={42}
        hookPoint="post_variant"
      />,
    );

    const loading = screen.queryByTestId("inheritance-loading");
    const empty = screen.queryByTestId("inheritance-empty");
    const view = screen.queryByTestId("inheritance-view");
    expect(loading || empty || view).toBeTruthy();
  });

  it("renders with studio scope type", () => {
    renderWithProviders(
      <InheritanceView scopeType="studio" scopeId={1} />,
    );

    const loading = screen.queryByTestId("inheritance-loading");
    const empty = screen.queryByTestId("inheritance-empty");
    const view = screen.queryByTestId("inheritance-view");
    expect(loading || empty || view).toBeTruthy();
  });
});

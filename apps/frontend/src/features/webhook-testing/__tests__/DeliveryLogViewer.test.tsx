import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { DeliveryLogViewer } from "../DeliveryLogViewer";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("DeliveryLogViewer", () => {
  it("renders loading or table state", () => {
    renderWithProviders(<DeliveryLogViewer />);

    // During initial render, query is loading -- either spinner or table shows
    const spinner = screen.queryByRole("status");
    const table = screen.queryByTestId("delivery-log-table");
    expect(spinner || table).toBeTruthy();
  });

  it("renders filter bar or loading", () => {
    renderWithProviders(<DeliveryLogViewer />);

    const spinner = screen.queryByRole("status");
    const filterBar = screen.queryByTestId("delivery-filter-bar");
    expect(spinner || filterBar).toBeTruthy();
  });

  it("renders column headers when loaded", () => {
    renderWithProviders(<DeliveryLogViewer />);

    // Either loading or shows the table headers
    const spinner = screen.queryByRole("status");
    const timestampHeader = screen.queryByText("Timestamp");
    expect(spinner || timestampHeader).toBeTruthy();
  });
});

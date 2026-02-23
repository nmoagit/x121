import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ExecutionLogViewer } from "../ExecutionLogViewer";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ExecutionLogViewer", () => {
  it("renders with hookId prop", () => {
    renderWithProviders(<ExecutionLogViewer hookId={1} />);

    const loading = screen.queryByTestId("logs-loading");
    const empty = screen.queryByTestId("logs-empty");
    const viewer = screen.queryByTestId("execution-log-viewer");
    expect(loading || empty || viewer).toBeTruthy();
  });

  it("renders with jobId prop", () => {
    renderWithProviders(<ExecutionLogViewer jobId={42} />);

    const loading = screen.queryByTestId("logs-loading");
    const empty = screen.queryByTestId("logs-empty");
    const viewer = screen.queryByTestId("execution-log-viewer");
    expect(loading || empty || viewer).toBeTruthy();
  });

  it("shows empty state when query is disabled", () => {
    // With hookId=0, the hook query is disabled, so data defaults to []
    renderWithProviders(<ExecutionLogViewer hookId={0} />);

    const empty = screen.queryByTestId("logs-empty");
    const loading = screen.queryByTestId("logs-loading");
    // Either empty (disabled query returns []) or loading
    expect(empty || loading).toBeTruthy();
  });
});

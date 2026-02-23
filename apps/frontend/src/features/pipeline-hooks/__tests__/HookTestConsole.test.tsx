import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { HookTestConsole } from "../HookTestConsole";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("HookTestConsole", () => {
  it("renders the test console with title", () => {
    renderWithProviders(<HookTestConsole hookId={1} />);

    expect(screen.getByTestId("test-console-title")).toBeInTheDocument();
    expect(screen.getByText("Hook Test Console")).toBeInTheDocument();
  });

  it("renders input textarea pre-populated with sample data", () => {
    renderWithProviders(<HookTestConsole hookId={1} />);

    const textarea = screen.getByTestId("test-input") as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toContain("variant_id");
  });

  it("renders execute button", () => {
    renderWithProviders(<HookTestConsole hookId={1} />);

    const btn = screen.getByTestId("execute-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("Execute");
  });

  it("does not show result before execution", () => {
    renderWithProviders(<HookTestConsole hookId={1} />);

    expect(screen.queryByTestId("test-result")).not.toBeInTheDocument();
  });
});

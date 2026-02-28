/**
 * Tests for DatabaseStep component (PRD-105).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { DatabaseStep } from "../DatabaseStep";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(() => Promise.resolve(null)),
    post: vi.fn(() =>
      Promise.resolve({ success: true, message: "Connection successful", details: null }),
    ),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("DatabaseStep", () => {
  test("renders step description", () => {
    renderWithProviders(<DatabaseStep />);

    expect(screen.getByText("Connect and migrate the application database.")).toBeInTheDocument();
  });

  test("renders host input with default value", () => {
    renderWithProviders(<DatabaseStep />);

    const hostInput = screen.getByTestId("db-host");
    expect(hostInput).toBeInTheDocument();
    expect(hostInput).toHaveValue("localhost");
  });

  test("renders port input with default value", () => {
    renderWithProviders(<DatabaseStep />);

    const portInput = screen.getByTestId("db-port");
    expect(portInput).toBeInTheDocument();
    expect(portInput).toHaveValue(5432);
  });

  test("renders database name input", () => {
    renderWithProviders(<DatabaseStep />);

    expect(screen.getByTestId("db-name")).toBeInTheDocument();
  });

  test("renders user and password inputs", () => {
    renderWithProviders(<DatabaseStep />);

    expect(screen.getByTestId("db-user")).toBeInTheDocument();
    expect(screen.getByTestId("db-password")).toBeInTheDocument();
  });

  test("renders test connection button", () => {
    renderWithProviders(<DatabaseStep />);

    expect(screen.getByTestId("test-connection-btn")).toBeInTheDocument();
  });

  test("renders run migrations button disabled by default", () => {
    renderWithProviders(<DatabaseStep />);

    const btn = screen.getByTestId("run-migrations-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });
});

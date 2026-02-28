/**
 * Tests for IntegrationsStep component (PRD-105).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { IntegrationsStep } from "../IntegrationsStep";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(() => Promise.resolve(null)),
    post: vi.fn(() => Promise.resolve({ success: true, message: "OK", details: null })),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("IntegrationsStep", () => {
  test("renders step description", () => {
    renderWithProviders(<IntegrationsStep />);

    expect(
      screen.getByText("Configure optional email, Slack, and backup integrations."),
    ).toBeInTheDocument();
  });

  test("renders email accordion section", () => {
    renderWithProviders(<IntegrationsStep />);

    expect(screen.getByText("Email (SMTP)")).toBeInTheDocument();
  });

  test("renders slack accordion section", () => {
    renderWithProviders(<IntegrationsStep />);

    expect(screen.getByText("Slack Notifications")).toBeInTheDocument();
  });

  test("renders backup accordion section", () => {
    renderWithProviders(<IntegrationsStep />);

    expect(screen.getByText("Backup Destination")).toBeInTheDocument();
  });

  test("renders save integrations button", () => {
    renderWithProviders(<IntegrationsStep />);

    expect(screen.getByTestId("configure-integrations-btn")).toBeInTheDocument();
  });

  test("renders skip all button", () => {
    renderWithProviders(<IntegrationsStep />);

    const skipBtn = screen.getByTestId("skip-integrations-btn");
    expect(skipBtn).toBeInTheDocument();
    expect(skipBtn).toHaveTextContent("Skip All");
  });

  test("renders the integrations step container", () => {
    renderWithProviders(<IntegrationsStep />);

    expect(screen.getByTestId("integrations-step")).toBeInTheDocument();
  });
});

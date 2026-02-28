import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { WebhookTestingPage } from "../WebhookTestingPage";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("WebhookTestingPage", () => {
  it("renders the page heading", () => {
    renderWithProviders(<WebhookTestingPage />);

    expect(screen.getByText("Webhook Testing Console")).toBeInTheDocument();
  });

  it("renders the page container", () => {
    renderWithProviders(<WebhookTestingPage />);

    expect(screen.getByTestId("webhook-testing-page")).toBeInTheDocument();
  });

  it("renders all four tab buttons", () => {
    renderWithProviders(<WebhookTestingPage />);

    expect(screen.getByText("Test Sender")).toBeInTheDocument();
    expect(screen.getByText("Delivery Log")).toBeInTheDocument();
    expect(screen.getByText("Endpoint Health")).toBeInTheDocument();
    expect(screen.getByText("Mock Endpoints")).toBeInTheDocument();
  });

  it("shows Test Sender tab panel by default", () => {
    renderWithProviders(<WebhookTestingPage />);

    expect(screen.getByTestId("tab-panel-sender")).toBeInTheDocument();
  });

  it("renders the Test Sender content by default", () => {
    renderWithProviders(<WebhookTestingPage />);

    expect(screen.getByTestId("sender-title")).toBeInTheDocument();
  });
});

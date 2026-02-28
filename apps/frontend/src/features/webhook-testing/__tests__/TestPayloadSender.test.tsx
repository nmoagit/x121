import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { TestPayloadSender } from "../TestPayloadSender";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("TestPayloadSender", () => {
  it("renders the sender title", () => {
    renderWithProviders(<TestPayloadSender />);

    expect(screen.getByTestId("sender-title")).toBeInTheDocument();
    expect(screen.getByText("Test Payload Sender")).toBeInTheDocument();
  });

  it("renders send button or loading spinner", () => {
    renderWithProviders(<TestPayloadSender />);

    // In test, the sample payloads query is loading, so a spinner shows
    const spinner = screen.queryByRole("status");
    const btn = screen.queryByTestId("send-test-btn");
    expect(spinner || btn).toBeTruthy();
  });

  it("renders payload editor or loading spinner", () => {
    renderWithProviders(<TestPayloadSender />);

    const spinner = screen.queryByRole("status");
    const editor = screen.queryByTestId("payload-editor");
    expect(spinner || editor).toBeTruthy();
  });

  it("does not show result before sending", () => {
    renderWithProviders(<TestPayloadSender />);

    expect(screen.queryByTestId("send-result")).not.toBeInTheDocument();
  });
});

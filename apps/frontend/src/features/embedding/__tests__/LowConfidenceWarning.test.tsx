import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";
import { LowConfidenceWarning } from "../LowConfidenceWarning";

describe("LowConfidenceWarning", () => {
  it("renders the warning message", () => {
    renderWithProviders(
      <LowConfidenceWarning confidence={0.55} threshold={0.7} />,
    );

    expect(screen.getByText("Low Confidence Detection")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows confidence and threshold values", () => {
    renderWithProviders(
      <LowConfidenceWarning confidence={0.55} threshold={0.7} />,
    );

    expect(screen.getByText("55.0%")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("can be dismissed", () => {
    renderWithProviders(
      <LowConfidenceWarning confidence={0.55} threshold={0.7} />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();

    const dismissBtn = screen.getByRole("button", { name: "Dismiss warning" });
    fireEvent.click(dismissBtn);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

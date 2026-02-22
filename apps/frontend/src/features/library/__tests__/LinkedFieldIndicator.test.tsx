import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { LinkedFieldIndicator } from "../LinkedFieldIndicator";

describe("LinkedFieldIndicator", () => {
  it("renders linked indicator", () => {
    renderWithProviders(<LinkedFieldIndicator mode="linked" />);

    const indicator = screen.getByTestId("field-indicator-linked");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent("Linked");
  });

  it("renders copied indicator", () => {
    renderWithProviders(<LinkedFieldIndicator mode="copied" />);

    const indicator = screen.getByTestId("field-indicator-copied");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent("Copied");
  });

  it("calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <LinkedFieldIndicator mode="linked" onToggle={onToggle} />,
    );

    const button = screen.getByTestId("field-indicator-linked");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

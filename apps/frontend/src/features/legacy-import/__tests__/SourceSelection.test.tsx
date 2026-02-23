import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { SourceSelection } from "../SourceSelection";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SourceSelection", () => {
  it("renders the source selection form", () => {
    renderWithProviders(<SourceSelection projectId={10} />);

    expect(screen.getByTestId("source-selection")).toBeInTheDocument();
    expect(screen.getByTestId("source-path-input")).toBeInTheDocument();
    expect(screen.getByTestId("match-key-select")).toBeInTheDocument();
    expect(screen.getByTestId("start-scan-btn")).toBeInTheDocument();
  });

  it("disables start button when path is empty", () => {
    renderWithProviders(<SourceSelection projectId={10} />);

    expect(screen.getByTestId("start-scan-btn")).toBeDisabled();
  });

  it("enables start button when path is entered", () => {
    renderWithProviders(<SourceSelection projectId={10} />);

    fireEvent.change(screen.getByTestId("source-path-input"), {
      target: { value: "/data/legacy" },
    });

    expect(screen.getByTestId("start-scan-btn")).not.toBeDisabled();
  });

  it("calls onSelect with correct values", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <SourceSelection projectId={10} onSelect={onSelect} />,
    );

    fireEvent.change(screen.getByTestId("source-path-input"), {
      target: { value: "/data/legacy/chars" },
    });
    fireEvent.click(screen.getByTestId("start-scan-btn"));

    expect(onSelect).toHaveBeenCalledWith("/data/legacy/chars", 10, "name");
  });

  it("allows changing the match key", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <SourceSelection projectId={10} onSelect={onSelect} />,
    );

    fireEvent.change(screen.getByTestId("match-key-select"), {
      target: { value: "path" },
    });
    fireEvent.change(screen.getByTestId("source-path-input"), {
      target: { value: "/data" },
    });
    fireEvent.click(screen.getByTestId("start-scan-btn"));

    expect(onSelect).toHaveBeenCalledWith("/data", 10, "path");
  });

  it("disables all inputs when disabled prop is true", () => {
    renderWithProviders(
      <SourceSelection projectId={10} disabled />,
    );

    expect(screen.getByTestId("source-path-input")).toBeDisabled();
    expect(screen.getByTestId("match-key-select")).toBeDisabled();
    expect(screen.getByTestId("start-scan-btn")).toBeDisabled();
  });
});

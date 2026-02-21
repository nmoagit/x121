import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { StalenessIndicator } from "../StalenessIndicator";

describe("StalenessIndicator", () => {
  const baseProps = {
    generatedAt: "2026-02-21T10:00:00Z",
    sourceUpdatedAt: "2026-02-21T09:55:00Z",
  };

  it("shows 'Up to date' when not stale", () => {
    renderWithProviders(
      <StalenessIndicator {...baseProps} isStale={false} />,
    );

    expect(screen.getByText("Up to date")).toBeInTheDocument();
  });

  it("shows 'Out of date' when stale", () => {
    renderWithProviders(
      <StalenessIndicator {...baseProps} isStale={true} />,
    );

    expect(screen.getByText("Out of date")).toBeInTheDocument();
  });

  it("displays generated timestamp", () => {
    renderWithProviders(
      <StalenessIndicator {...baseProps} isStale={false} />,
    );

    expect(screen.getByText(/Generated:/)).toBeInTheDocument();
  });

  it("shows regenerate button when stale and onRegenerate is provided", () => {
    const onRegenerate = vi.fn();
    renderWithProviders(
      <StalenessIndicator
        {...baseProps}
        isStale={true}
        onRegenerate={onRegenerate}
      />,
    );

    expect(screen.getByText("Regenerate")).toBeInTheDocument();
  });

  it("does not show regenerate button when not stale", () => {
    renderWithProviders(
      <StalenessIndicator
        {...baseProps}
        isStale={false}
        onRegenerate={vi.fn()}
      />,
    );

    expect(screen.queryByText("Regenerate")).not.toBeInTheDocument();
  });

  it("shows regenerating state", () => {
    renderWithProviders(
      <StalenessIndicator
        {...baseProps}
        isStale={true}
        onRegenerate={vi.fn()}
        regenerating={true}
      />,
    );

    expect(screen.getByText("Regenerating...")).toBeInTheDocument();
  });
});

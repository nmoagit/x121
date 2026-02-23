/**
 * Tests for TierBadge component (PRD-59).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { TierBadge } from "../TierBadge";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("TierBadge", () => {
  test("renders draft tier correctly", () => {
    renderWithProviders(<TierBadge tierName="draft" />);

    const badge = screen.getByText("Draft");
    expect(badge).toBeInTheDocument();
  });

  test("renders preview tier correctly", () => {
    renderWithProviders(<TierBadge tierName="preview" />);

    const badge = screen.getByText("Preview");
    expect(badge).toBeInTheDocument();
  });

  test("renders production tier correctly", () => {
    renderWithProviders(<TierBadge tierName="production" />);

    const badge = screen.getByText("Production");
    expect(badge).toBeInTheDocument();
  });

  test("shows correct variant for draft (default/gray)", () => {
    renderWithProviders(<TierBadge tierName="draft" />);

    const badge = screen.getByText("Draft");
    // Default variant uses surface-tertiary background
    expect(badge.className).toContain("bg-[var(--color-surface-tertiary)]");
  });

  test("shows correct variant for preview (warning/amber)", () => {
    renderWithProviders(<TierBadge tierName="preview" />);

    const badge = screen.getByText("Preview");
    // Warning variant uses action-warning color
    expect(badge.className).toContain("text-[var(--color-action-warning)]");
  });

  test("shows correct variant for production (success/green)", () => {
    renderWithProviders(<TierBadge tierName="production" />);

    const badge = screen.getByText("Production");
    // Success variant uses action-success color
    expect(badge.className).toContain("text-[var(--color-action-success)]");
  });

  test("handles unknown tier gracefully", () => {
    renderWithProviders(<TierBadge tierName="ultra" />);

    // Falls back to the raw tier name when no label is found
    const badge = screen.getByText("ultra");
    expect(badge).toBeInTheDocument();
    // Unknown tier uses default variant
    expect(badge.className).toContain("bg-[var(--color-surface-tertiary)]");
  });
});

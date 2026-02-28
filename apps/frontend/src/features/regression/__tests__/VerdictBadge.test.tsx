/**
 * Tests for VerdictBadge component (PRD-65).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { VerdictBadge } from "../VerdictBadge";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("VerdictBadge", () => {
  test("renders improved verdict with success variant", () => {
    renderWithProviders(<VerdictBadge verdict="improved" />);

    const badge = screen.getByTestId("verdict-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Improved");

    // The inner Badge span should have the success color class.
    const inner = badge.querySelector("span");
    expect(inner?.className).toContain("color-action-success");
  });

  test("renders same verdict with default variant", () => {
    renderWithProviders(<VerdictBadge verdict="same" />);

    const badge = screen.getByTestId("verdict-badge");
    expect(badge).toHaveTextContent("No Change");

    const inner = badge.querySelector("span");
    expect(inner?.className).toContain("color-text-secondary");
  });

  test("renders degraded verdict with danger variant", () => {
    renderWithProviders(<VerdictBadge verdict="degraded" />);

    const badge = screen.getByTestId("verdict-badge");
    expect(badge).toHaveTextContent("Degraded");

    const inner = badge.querySelector("span");
    expect(inner?.className).toContain("color-action-danger");
  });

  test("renders error verdict with warning variant", () => {
    renderWithProviders(<VerdictBadge verdict="error" />);

    const badge = screen.getByTestId("verdict-badge");
    expect(badge).toHaveTextContent("Error");

    const inner = badge.querySelector("span");
    expect(inner?.className).toContain("color-action-warning");
  });
});

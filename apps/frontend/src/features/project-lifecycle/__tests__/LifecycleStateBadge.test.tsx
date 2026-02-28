/**
 * Tests for LifecycleStateBadge component (PRD-72).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { LifecycleStateBadge } from "../LifecycleStateBadge";
import type { LifecycleState } from "../types";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

const STATES: Array<{ state: LifecycleState; label: string; cssHint: string }> = [
  { state: "setup", label: "Setup", cssHint: "color-action-primary" },
  { state: "active", label: "Active", cssHint: "color-action-success" },
  { state: "delivered", label: "Delivered", cssHint: "color-action-primary" },
  { state: "archived", label: "Archived", cssHint: "color-text-secondary" },
  { state: "closed", label: "Closed", cssHint: "color-text-secondary" },
];

describe("LifecycleStateBadge", () => {
  test.each(STATES)(
    "renders $state with label '$label' and correct variant",
    ({ state, label, cssHint }) => {
      renderWithProviders(<LifecycleStateBadge state={state} />);

      const badge = screen.getByTestId("lifecycle-state-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent(label);

      const inner = badge.querySelector("span");
      expect(inner?.className).toContain(cssHint);
    },
  );

  // NOTE: The test.each block above already covers all 5 states parametrically.
  // A redundant manual test was removed here (DRY-532).
});

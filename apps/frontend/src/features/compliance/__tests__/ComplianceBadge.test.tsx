/**
 * Tests for ComplianceBadge component (PRD-102).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ComplianceBadge } from "../ComplianceBadge";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ComplianceBadge", () => {
  test("shows pass state", () => {
    renderWithProviders(<ComplianceBadge state="pass" />);

    expect(screen.getByTestId("compliance-badge-pass")).toBeInTheDocument();
    expect(screen.getByText("Pass")).toBeInTheDocument();
  });

  test("shows fail state", () => {
    renderWithProviders(<ComplianceBadge state="fail" />);

    expect(screen.getByTestId("compliance-badge-fail")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
  });

  test("shows pending state", () => {
    renderWithProviders(<ComplianceBadge state="pending" />);

    expect(screen.getByTestId("compliance-badge-pending")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });
});

/**
 * Tests for DirectorsViewNav component (PRD-55).
 *
 * Verifies tab rendering, active state, badge count, and tab switching.
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { DirectorsViewNav } from "../DirectorsViewNav";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("DirectorsViewNav", () => {
  const defaultProps = {
    activeTab: "queue" as const,
    onTabChange: vi.fn(),
    queueCount: 0,
  };

  it("renders all three tabs", () => {
    renderWithProviders(<DirectorsViewNav {...defaultProps} />);

    expect(screen.getByText("Review Queue")).toBeInTheDocument();
    expect(screen.getByText("My Projects")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("marks active tab with aria-current", () => {
    renderWithProviders(<DirectorsViewNav {...defaultProps} activeTab="activity" />);

    const activityButton = screen.getByText("Activity").closest("button");
    expect(activityButton).toHaveAttribute("aria-current", "page");

    const queueButton = screen.getByText("Review Queue").closest("button");
    expect(queueButton).not.toHaveAttribute("aria-current");
  });

  it("shows badge count when queueCount > 0", () => {
    renderWithProviders(<DirectorsViewNav {...defaultProps} queueCount={5} />);

    expect(screen.getByTestId("queue-badge")).toBeInTheDocument();
    expect(screen.getByTestId("queue-badge")).toHaveTextContent("5");
  });

  it("does not show badge when queueCount is 0", () => {
    renderWithProviders(<DirectorsViewNav {...defaultProps} queueCount={0} />);

    expect(screen.queryByTestId("queue-badge")).not.toBeInTheDocument();
  });

  it("shows 99+ for large queue counts", () => {
    renderWithProviders(<DirectorsViewNav {...defaultProps} queueCount={150} />);

    expect(screen.getByTestId("queue-badge")).toHaveTextContent("99+");
  });

  it("calls onTabChange when tab is clicked", () => {
    const onTabChange = vi.fn();
    renderWithProviders(
      <DirectorsViewNav {...defaultProps} onTabChange={onTabChange} />,
    );

    fireEvent.click(screen.getByText("My Projects"));

    expect(onTabChange).toHaveBeenCalledWith("projects");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProficiencyGate } from "../ProficiencyGate";
import type { ProficiencyLevel } from "../useProficiencyTracker";

// Mock the proficiency tracker hook
const mockUseProficiencyTracker = vi.fn<() => {
  proficiency: ProficiencyLevel;
  isLoading: boolean;
  recordUsage: () => void;
}>();

vi.mock("../useProficiencyTracker", () => ({
  useProficiencyTracker: (...args: unknown[]) => mockUseProficiencyTracker(...(args as [])),
}));

describe("ProficiencyGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows content when proficiency meets the minimum level", () => {
    mockUseProficiencyTracker.mockReturnValue({
      proficiency: "expert",
      isLoading: false,
      recordUsage: vi.fn(),
    });

    render(
      <ProficiencyGate minLevel="intermediate" featureArea="test-area">
        <p>Expert content</p>
      </ProficiencyGate>,
    );

    expect(screen.getByText("Expert content")).toBeInTheDocument();
  });

  it("shows content when proficiency exactly matches the minimum level", () => {
    mockUseProficiencyTracker.mockReturnValue({
      proficiency: "intermediate",
      isLoading: false,
      recordUsage: vi.fn(),
    });

    render(
      <ProficiencyGate minLevel="intermediate" featureArea="test-area">
        <p>Intermediate content</p>
      </ProficiencyGate>,
    );

    expect(screen.getByText("Intermediate content")).toBeInTheDocument();
  });

  it("hides content when proficiency is below the minimum level", () => {
    mockUseProficiencyTracker.mockReturnValue({
      proficiency: "beginner",
      isLoading: false,
      recordUsage: vi.fn(),
    });

    render(
      <ProficiencyGate minLevel="intermediate" featureArea="test-area">
        <p>Hidden content</p>
      </ProficiencyGate>,
    );

    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
  });

  it("renders fallback when proficiency is insufficient", () => {
    mockUseProficiencyTracker.mockReturnValue({
      proficiency: "beginner",
      isLoading: false,
      recordUsage: vi.fn(),
    });

    render(
      <ProficiencyGate
        minLevel="expert"
        featureArea="test-area"
        fallback={<p>Not ready yet</p>}
      >
        <p>Expert-only content</p>
      </ProficiencyGate>,
    );

    expect(screen.queryByText("Expert-only content")).not.toBeInTheDocument();
    expect(screen.getByText("Not ready yet")).toBeInTheDocument();
  });

  it("shows fallback while loading", () => {
    mockUseProficiencyTracker.mockReturnValue({
      proficiency: "beginner",
      isLoading: true,
      recordUsage: vi.fn(),
    });

    render(
      <ProficiencyGate
        minLevel="beginner"
        featureArea="test-area"
        fallback={<p>Loading placeholder</p>}
      >
        <p>Gated content</p>
      </ProficiencyGate>,
    );

    expect(screen.queryByText("Gated content")).not.toBeInTheDocument();
    expect(screen.getByText("Loading placeholder")).toBeInTheDocument();
  });

  it("shows beginner content without any threshold requirement", () => {
    mockUseProficiencyTracker.mockReturnValue({
      proficiency: "beginner",
      isLoading: false,
      recordUsage: vi.fn(),
    });

    render(
      <ProficiencyGate minLevel="beginner" featureArea="test-area">
        <p>Beginner content</p>
      </ProficiencyGate>,
    );

    expect(screen.getByText("Beginner content")).toBeInTheDocument();
  });
});

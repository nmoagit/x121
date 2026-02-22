import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { TierIndicator } from "../TierIndicator";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
  },
}));

describe("TierIndicator", () => {
  it("renders Hot badge for hot tier", () => {
    renderWithProviders(<TierIndicator tier="hot" />);
    expect(screen.getByText("Hot")).toBeInTheDocument();
  });

  it("renders Cold badge for cold tier", () => {
    renderWithProviders(<TierIndicator tier="cold" />);
    expect(screen.getByText("Cold")).toBeInTheDocument();
  });

  it("renders Retrieving... when isRetrieving is true", () => {
    renderWithProviders(<TierIndicator tier="cold" isRetrieving />);
    expect(screen.getByText("Retrieving...")).toBeInTheDocument();
  });
});

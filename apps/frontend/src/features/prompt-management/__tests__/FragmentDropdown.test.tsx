import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { FragmentDropdown } from "../FragmentDropdown";
import type { PromptFragment } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-prompt-management", () => ({
  usePromptFragments: vi.fn(),
}));

import { usePromptFragments } from "../hooks/use-prompt-management";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const FRAGMENT_A: PromptFragment = {
  id: 1,
  text: "high quality, masterpiece, detailed",
  description: "Quality booster",
  category: "quality",
  tags: ["quality"],
  usage_count: 42,
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const FRAGMENT_B: PromptFragment = {
  id: 2,
  text: "cinematic lighting, dramatic shadows",
  description: "Lighting fragment",
  category: "lighting",
  tags: ["lighting"],
  usage_count: 15,
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function setupMock(fragments?: PromptFragment[], isPending = false) {
  vi.mocked(usePromptFragments).mockReturnValue({
    data: fragments,
    isPending,
    isError: false,
  } as ReturnType<typeof usePromptFragments>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("FragmentDropdown", () => {
  it("renders search input", () => {
    setupMock([FRAGMENT_A, FRAGMENT_B]);
    const onSelect = vi.fn();

    renderWithProviders(<FragmentDropdown sceneTypeId={5} onSelect={onSelect} />);

    expect(screen.getByPlaceholderText("Search fragments...")).toBeInTheDocument();
  });

  it("shows fragment items with text and category", () => {
    setupMock([FRAGMENT_A, FRAGMENT_B]);
    const onSelect = vi.fn();

    renderWithProviders(<FragmentDropdown sceneTypeId={5} onSelect={onSelect} />);

    expect(screen.getByText("high quality, masterpiece, detailed")).toBeInTheDocument();
    expect(screen.getByText("quality")).toBeInTheDocument();
    expect(screen.getByText("cinematic lighting, dramatic shadows")).toBeInTheDocument();
    expect(screen.getByText("lighting")).toBeInTheDocument();
  });

  it("shows usage counts", () => {
    setupMock([FRAGMENT_A]);
    const onSelect = vi.fn();

    renderWithProviders(<FragmentDropdown sceneTypeId={5} onSelect={onSelect} />);

    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("calls onSelect when item clicked", () => {
    setupMock([FRAGMENT_A, FRAGMENT_B]);
    const onSelect = vi.fn();

    renderWithProviders(<FragmentDropdown sceneTypeId={5} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId("fragment-item-1"));

    expect(onSelect).toHaveBeenCalledWith(FRAGMENT_A);
  });

  it("shows empty state when no fragments", () => {
    setupMock([]);
    const onSelect = vi.fn();

    renderWithProviders(<FragmentDropdown sceneTypeId={5} onSelect={onSelect} />);

    expect(screen.getByTestId("fragment-empty")).toBeInTheDocument();
  });
});

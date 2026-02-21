import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { RegenerationControls } from "../RegenerationControls";

// Mock the api module to prevent real HTTP requests.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/metadata/regenerate")) {
        return Promise.resolve({
          status: "regenerated",
          character_id: 42,
        });
      }
      return Promise.resolve({ regenerated: 2, skipped: 0, failed: 0 });
    }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("RegenerationControls", () => {
  it("renders character regeneration button", () => {
    renderWithProviders(<RegenerationControls characterId={42} />);

    expect(
      screen.getByText("Regenerate Character Metadata"),
    ).toBeInTheDocument();
  });

  it("renders project regeneration button", () => {
    renderWithProviders(<RegenerationControls projectId={1} />);

    expect(
      screen.getByText("Regenerate Project Metadata"),
    ).toBeInTheDocument();
  });

  it("shows stale-only checkbox for project-level regeneration", () => {
    renderWithProviders(<RegenerationControls projectId={1} />);

    expect(screen.getByText("Stale only")).toBeInTheDocument();
  });

  it("does not show stale-only checkbox for character-level regeneration", () => {
    renderWithProviders(<RegenerationControls characterId={42} />);

    expect(screen.queryByText("Stale only")).not.toBeInTheDocument();
  });

  it("calls onRegenerated callback after regeneration", async () => {
    const onRegenerated = vi.fn();
    renderWithProviders(
      <RegenerationControls characterId={42} onRegenerated={onRegenerated} />,
    );

    fireEvent.click(screen.getByText("Regenerate Character Metadata"));

    await waitFor(() => {
      expect(onRegenerated).toHaveBeenCalledTimes(1);
    });
  });
});

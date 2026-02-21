/**
 * Tests for PresenceIndicator component (PRD-11).
 */

import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { PresenceIndicator } from "../PresenceIndicator";

/* --------------------------------------------------------------------------
   Mock the API module
   -------------------------------------------------------------------------- */

const mockGet = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("PresenceIndicator", () => {
  test("shows loading spinner initially", () => {
    mockGet.mockReturnValue(new Promise(() => {})); // Never resolves.

    renderWithProviders(
      <PresenceIndicator entityType="scene" entityId={1} />,
    );

    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });

  test("renders nothing when no users are present", async () => {
    mockGet.mockResolvedValue([]);

    const { container } = renderWithProviders(
      <PresenceIndicator entityType="scene" entityId={1} />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument();
    });

    // Component should render nothing (null).
    expect(container.querySelector("[aria-label='Users viewing this entity']")).not.toBeInTheDocument();
  });

  test("renders user avatars when users are present", async () => {
    mockGet.mockResolvedValue([
      {
        id: 1,
        user_id: 10,
        entity_type: "scene",
        entity_id: 1,
        last_seen_at: "2026-02-21T00:00:00Z",
        is_active: true,
        created_at: "2026-02-21T00:00:00Z",
        updated_at: "2026-02-21T00:00:00Z",
      },
      {
        id: 2,
        user_id: 20,
        entity_type: "scene",
        entity_id: 1,
        last_seen_at: "2026-02-21T00:00:00Z",
        is_active: true,
        created_at: "2026-02-21T00:00:00Z",
        updated_at: "2026-02-21T00:00:00Z",
      },
    ]);

    renderWithProviders(
      <PresenceIndicator entityType="scene" entityId={1} />,
    );

    await waitFor(() => {
      expect(screen.getByText("2 viewing")).toBeInTheDocument();
    });
  });
});

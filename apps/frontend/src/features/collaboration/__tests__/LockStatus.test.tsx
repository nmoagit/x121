/**
 * Tests for LockStatus component (PRD-11).
 */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { LockStatus } from "../LockStatus";

/* --------------------------------------------------------------------------
   Mock the API module
   -------------------------------------------------------------------------- */

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("LockStatus", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  test("shows unlocked state with lock button when no lock exists", async () => {
    mockGet.mockResolvedValue(null);

    renderWithProviders(
      <LockStatus entityType="scene" entityId={1} currentUserId={42} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Unlocked")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /lock/i })).toBeInTheDocument();
  });

  test("shows locked-by-you state with unlock button", async () => {
    mockGet.mockResolvedValue({
      id: 1,
      entity_type: "scene",
      entity_id: 1,
      user_id: 42,
      lock_type: "exclusive",
      acquired_at: "2026-02-21T00:00:00Z",
      expires_at: "2026-02-21T01:00:00Z",
      released_at: null,
      is_active: true,
      created_at: "2026-02-21T00:00:00Z",
      updated_at: "2026-02-21T00:00:00Z",
    });

    renderWithProviders(
      <LockStatus entityType="scene" entityId={1} currentUserId={42} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Locked by you")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /unlock/i }),
    ).toBeInTheDocument();
  });

  test("shows locked-by-other state without unlock button", async () => {
    mockGet.mockResolvedValue({
      id: 1,
      entity_type: "scene",
      entity_id: 1,
      user_id: 99,
      lock_type: "exclusive",
      acquired_at: "2026-02-21T00:00:00Z",
      expires_at: "2026-02-21T01:00:00Z",
      released_at: null,
      is_active: true,
      created_at: "2026-02-21T00:00:00Z",
      updated_at: "2026-02-21T00:00:00Z",
    });

    renderWithProviders(
      <LockStatus entityType="scene" entityId={1} currentUserId={42} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Locked by user 99")).toBeInTheDocument();
    });

    // Should not show unlock button for other user's lock.
    expect(
      screen.queryByRole("button", { name: /unlock/i }),
    ).not.toBeInTheDocument();
  });

  test("clicking lock button triggers acquire mutation", async () => {
    mockGet.mockResolvedValue(null);
    mockPost.mockResolvedValue({
      id: 1,
      entity_type: "scene",
      entity_id: 1,
      user_id: 42,
      lock_type: "exclusive",
      acquired_at: "2026-02-21T00:00:00Z",
      expires_at: "2026-02-21T00:30:00Z",
      released_at: null,
      is_active: true,
      created_at: "2026-02-21T00:00:00Z",
      updated_at: "2026-02-21T00:00:00Z",
    });

    renderWithProviders(
      <LockStatus entityType="scene" entityId={1} currentUserId={42} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Unlocked")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /lock/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/collaboration/locks/acquire",
        { entity_type: "scene", entity_id: 1 },
      );
    });
  });
});

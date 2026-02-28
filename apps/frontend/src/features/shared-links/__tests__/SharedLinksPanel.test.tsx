/**
 * Tests for the SharedLinksPanel component (PRD-84).
 */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { SharedLinksPanel } from "../SharedLinksPanel";
import type { SharedLink } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const MOCK_ACTIVE_LINK: SharedLink = {
  id: 1,
  scope_type: "segment",
  scope_id: 42,
  created_by: 1,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  max_views: 10,
  current_views: 3,
  is_revoked: false,
  settings_json: null,
  created_at: "2026-02-20T10:00:00Z",
  updated_at: "2026-02-20T10:00:00Z",
};

const MOCK_REVOKED_LINK: SharedLink = {
  ...MOCK_ACTIVE_LINK,
  id: 2,
  scope_type: "scene",
  scope_id: 99,
  is_revoked: true,
  current_views: 5,
  max_views: null,
};

/* --------------------------------------------------------------------------
   Mock API
   -------------------------------------------------------------------------- */

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  ApiRequestError: class extends Error {
    status: number;
    error: { code: string; message: string };
    constructor(status: number, error: { code: string; message: string }) {
      super(error.message);
      this.status = status;
      this.error = error;
    }
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("SharedLinksPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<SharedLinksPanel />);

    const spinner = document.querySelector('[aria-label="Loading"]');
    expect(spinner).toBeTruthy();
  });

  it("renders the list of shared links", async () => {
    mockGet.mockResolvedValue([MOCK_ACTIVE_LINK, MOCK_REVOKED_LINK]);

    renderWithProviders(<SharedLinksPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Segment #42/)).toBeInTheDocument();
      expect(screen.getByText(/Scene #99/)).toBeInTheDocument();
    });
  });

  it("shows empty state when no links exist", async () => {
    mockGet.mockResolvedValue([]);

    renderWithProviders(<SharedLinksPanel />);

    await waitFor(() => {
      expect(
        screen.getByText(/No shared links created/),
      ).toBeInTheDocument();
    });
  });

  it("shows status badges for active and revoked links", async () => {
    mockGet.mockResolvedValue([MOCK_ACTIVE_LINK, MOCK_REVOKED_LINK]);

    renderWithProviders(<SharedLinksPanel />);

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Revoked")).toBeInTheDocument();
    });
  });

  it("shows view count with max views", async () => {
    mockGet.mockResolvedValue([MOCK_ACTIVE_LINK]);

    renderWithProviders(<SharedLinksPanel />);

    await waitFor(() => {
      expect(screen.getByText("3 / 10")).toBeInTheDocument();
    });
  });

  it("shows Create Link button", async () => {
    mockGet.mockResolvedValue([]);

    renderWithProviders(<SharedLinksPanel />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Create Link/ }),
      ).toBeInTheDocument();
    });
  });

  it("does not show revoke button for already revoked links", async () => {
    mockGet.mockResolvedValue([MOCK_REVOKED_LINK]);

    renderWithProviders(<SharedLinksPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Scene #99/)).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: "Revoke link" }),
    ).not.toBeInTheDocument();
  });

  it("opens revoke confirmation modal when revoke is clicked", async () => {
    mockGet.mockResolvedValue([MOCK_ACTIVE_LINK]);

    renderWithProviders(<SharedLinksPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Segment #42/)).toBeInTheDocument();
    });

    const revokeBtn = screen.getByRole("button", { name: "Revoke link" });
    fireEvent.click(revokeBtn);

    await waitFor(() => {
      expect(screen.getByText("Revoke Shared Link")).toBeInTheDocument();
      expect(
        screen.getByText(/immediately prevent anyone/),
      ).toBeInTheDocument();
    });
  });

  it("calls revoke mutation on confirmation", async () => {
    mockGet.mockResolvedValue([MOCK_ACTIVE_LINK]);
    mockDelete.mockResolvedValue({ ...MOCK_ACTIVE_LINK, is_revoked: true });

    renderWithProviders(<SharedLinksPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Segment #42/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Revoke link" }));

    await waitFor(() => {
      expect(screen.getByText(/immediately prevent anyone/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Revoke Link"));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/shared-links/1");
    });
  });
});

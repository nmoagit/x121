/**
 * Tests for the ExternalReviewPage component (PRD-84).
 */

import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ExternalReviewPage } from "../ExternalReviewPage";
import type { TokenValidationResponse } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const VALID_RESPONSE: TokenValidationResponse = {
  scope_type: "segment",
  scope_id: 42,
  password_required: false,
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

const PASSWORD_RESPONSE: TokenValidationResponse = {
  ...VALID_RESPONSE,
  password_required: true,
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

describe("ExternalReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ExternalReviewPage token="test-token" />);

    const spinner = document.querySelector('[aria-label="Loading"]');
    expect(spinner).toBeTruthy();
  });

  it("shows feedback form for a valid token", async () => {
    mockGet.mockResolvedValue(VALID_RESPONSE);

    renderWithProviders(<ExternalReviewPage token="valid-token" />);

    await waitFor(() => {
      expect(screen.getByText("Review Request")).toBeInTheDocument();
      expect(screen.getByText("Submit Review")).toBeInTheDocument();
    });
  });

  it("shows password gate when password is required", async () => {
    mockGet.mockResolvedValue(PASSWORD_RESPONSE);

    renderWithProviders(<ExternalReviewPage token="pw-token" />);

    await waitFor(() => {
      expect(screen.getByText("Password Required")).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toBeInTheDocument();
    });
  });

  it("shows error for expired token (410)", async () => {
    const error = new Error("Gone");
    Object.assign(error, { status: 410, error: { code: "EXPIRED", message: "Gone" } });
    mockGet.mockRejectedValue(error);

    renderWithProviders(<ExternalReviewPage token="expired-token" />);

    await waitFor(() => {
      expect(screen.getByText("This link has expired")).toBeInTheDocument();
    });
  });

  it("shows error for revoked token (403)", async () => {
    const error = new Error("Forbidden");
    Object.assign(error, { status: 403, error: { code: "REVOKED", message: "Forbidden" } });
    mockGet.mockRejectedValue(error);

    renderWithProviders(<ExternalReviewPage token="revoked-token" />);

    await waitFor(() => {
      expect(
        screen.getByText("This link has been revoked"),
      ).toBeInTheDocument();
    });
  });

  it("shows error for exhausted token (429)", async () => {
    const error = new Error("Too Many Requests");
    Object.assign(error, {
      status: 429,
      error: { code: "EXHAUSTED", message: "Too Many Requests" },
    });
    mockGet.mockRejectedValue(error);

    renderWithProviders(<ExternalReviewPage token="exhausted-token" />);

    await waitFor(() => {
      expect(screen.getByText("View limit reached")).toBeInTheDocument();
    });
  });

  it("shows not-found error for unknown token (404)", async () => {
    const error = new Error("Not Found");
    Object.assign(error, { status: 404, error: { code: "NOT_FOUND", message: "Not Found" } });
    mockGet.mockRejectedValue(error);

    renderWithProviders(<ExternalReviewPage token="unknown-token" />);

    await waitFor(() => {
      expect(screen.getByText("Link not found")).toBeInTheDocument();
    });
  });

  it("shows scope info for valid token", async () => {
    mockGet.mockResolvedValue(VALID_RESPONSE);

    renderWithProviders(<ExternalReviewPage token="info-token" />);

    await waitFor(() => {
      expect(screen.getByText("Segment")).toBeInTheDocument();
      expect(screen.getByText("ID: 42")).toBeInTheDocument();
    });
  });
});

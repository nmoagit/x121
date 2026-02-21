import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";

import { ApiKeyManager } from "../ApiKeyManager";
import type { ApiKeyListItem } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const MOCK_KEY: ApiKeyListItem = {
  id: 1,
  name: "CI Pipeline Key",
  description: "Used by GitHub Actions",
  key_prefix: "abc12345",
  scope_name: "full_access",
  project_id: null,
  rate_limit_read_per_min: 100,
  rate_limit_write_per_min: 20,
  is_active: true,
  last_used_at: "2026-02-20T10:00:00Z",
  expires_at: null,
  revoked_at: null,
  created_at: "2026-02-19T08:00:00Z",
};

const MOCK_REVOKED_KEY: ApiKeyListItem = {
  ...MOCK_KEY,
  id: 2,
  name: "Old Key",
  key_prefix: "xyz98765",
  is_active: false,
  revoked_at: "2026-02-20T12:00:00Z",
  last_used_at: null,
  description: null,
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

describe("ApiKeyManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ApiKeyManager />);

    const spinner = document.querySelector('[aria-label="Loading"]');
    expect(spinner).toBeTruthy();
  });

  it("renders the list of API keys", async () => {
    mockGet.mockResolvedValue([MOCK_KEY, MOCK_REVOKED_KEY]);

    renderWithProviders(<ApiKeyManager />);

    await waitFor(() => {
      expect(screen.getByText("CI Pipeline Key")).toBeInTheDocument();
      expect(screen.getByText("Old Key")).toBeInTheDocument();
    });
  });

  it("shows empty state when no keys exist", async () => {
    mockGet.mockResolvedValue([]);

    renderWithProviders(<ApiKeyManager />);

    await waitFor(() => {
      expect(
        screen.getByText(/No API keys created/),
      ).toBeInTheDocument();
    });
  });

  it("displays key prefix with ellipsis", async () => {
    mockGet.mockResolvedValue([MOCK_KEY]);

    renderWithProviders(<ApiKeyManager />);

    await waitFor(() => {
      expect(screen.getByText("abc12345...")).toBeInTheDocument();
    });
  });

  it("renders Active and Revoked badges correctly", async () => {
    mockGet.mockResolvedValue([MOCK_KEY, MOCK_REVOKED_KEY]);

    renderWithProviders(<ApiKeyManager />);

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Revoked")).toBeInTheDocument();
    });
  });

  it("shows Create API Key button", async () => {
    mockGet.mockResolvedValue([]);

    renderWithProviders(<ApiKeyManager />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Create API Key/ }),
      ).toBeInTheDocument();
    });
  });

  it("opens create modal on button click", async () => {
    mockGet.mockResolvedValue([]);

    renderWithProviders(<ApiKeyManager />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Create API Key/ }),
      ).toBeInTheDocument();
    });

    const btn = screen.getByRole("button", { name: /Create API Key/ });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toBeInTheDocument();
      expect(screen.getByLabelText("Scope")).toBeInTheDocument();
    });
  });

  it("shows revoke confirmation modal", async () => {
    mockGet.mockResolvedValue([MOCK_KEY]);

    renderWithProviders(<ApiKeyManager />);

    await waitFor(() => {
      expect(screen.getByText("CI Pipeline Key")).toBeInTheDocument();
    });

    const revokeBtn = screen.getByRole("button", {
      name: "Revoke CI Pipeline Key",
    });
    fireEvent.click(revokeBtn);

    await waitFor(() => {
      expect(screen.getByText("Revoke API Key")).toBeInTheDocument();
      expect(
        screen.getByText(/immediately disable this key/),
      ).toBeInTheDocument();
    });
  });

  it("calls revoke mutation on confirmation", async () => {
    mockGet.mockResolvedValue([MOCK_KEY]);
    mockPost.mockResolvedValue({ ...MOCK_KEY, revoked_at: "2026-02-21T00:00:00Z" });

    renderWithProviders(<ApiKeyManager />);

    await waitFor(() => {
      expect(screen.getByText("CI Pipeline Key")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Revoke CI Pipeline Key" }));

    // Wait for modal and click the confirm button inside it
    await waitFor(() => {
      expect(screen.getByText(/immediately disable this key/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Revoke Key"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/admin/api-keys/1/revoke");
    });
  });

  it("does not show rotate/revoke buttons for revoked keys", async () => {
    mockGet.mockResolvedValue([MOCK_REVOKED_KEY]);

    renderWithProviders(<ApiKeyManager />);

    await waitFor(() => {
      expect(screen.getByText("Old Key")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: "Rotate Old Key" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revoke Old Key" }),
    ).not.toBeInTheDocument();
  });
});

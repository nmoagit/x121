import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExtensionManager } from "../ExtensionManager";
import type { Extension } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const MOCK_EXTENSION: Extension = {
  id: 1,
  name: "Test Extension",
  version: "1.0.0",
  author: "Test Author",
  description: "A test extension for unit tests.",
  manifest_json: {
    name: "Test Extension",
    version: "1.0.0",
    api_version: "1",
    permissions: [
      { resource: "projects", access: "read" },
      { resource: "characters", access: "*" },
    ],
    panels: [],
    menu_items: [],
    metadata_renderers: [],
  },
  settings_json: { theme: "dark" },
  enabled: true,
  source_path: "/extensions/test/index.html",
  api_version: "1",
  installed_by: 1,
  installed_at: "2026-02-21T00:00:00Z",
  created_at: "2026-02-21T00:00:00Z",
  updated_at: "2026-02-21T00:00:00Z",
};

const MOCK_EXTENSION_DISABLED: Extension = {
  ...MOCK_EXTENSION,
  id: 2,
  name: "Disabled Extension",
  enabled: false,
  author: null,
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
   Helpers
   -------------------------------------------------------------------------- */

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ExtensionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ExtensionManager />);

    const spinner = document.querySelector('[aria-label="Loading"]');
    expect(spinner).toBeTruthy();
  });

  it("renders the list of extensions", async () => {
    mockGet.mockResolvedValue([MOCK_EXTENSION, MOCK_EXTENSION_DISABLED]);

    renderWithProviders(<ExtensionManager />);

    await waitFor(() => {
      expect(screen.getByText("Test Extension")).toBeInTheDocument();
      expect(screen.getByText("Disabled Extension")).toBeInTheDocument();
    });
  });

  it("shows empty state when no extensions installed", async () => {
    mockGet.mockResolvedValue([]);

    renderWithProviders(<ExtensionManager />);

    await waitFor(() => {
      expect(
        screen.getByText(/No extensions installed/),
      ).toBeInTheDocument();
    });
  });

  it("renders enabled and disabled badges correctly", async () => {
    mockGet.mockResolvedValue([MOCK_EXTENSION, MOCK_EXTENSION_DISABLED]);

    renderWithProviders(<ExtensionManager />);

    await waitFor(() => {
      expect(screen.getByText("Enabled")).toBeInTheDocument();
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });
  });

  it("shows Install Extension button", async () => {
    mockGet.mockResolvedValue([]);

    renderWithProviders(<ExtensionManager />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Install Extension/ }),
      ).toBeInTheDocument();
    });
  });

  it("opens install modal on button click", async () => {
    mockGet.mockResolvedValue([]);

    renderWithProviders(<ExtensionManager />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Install Extension/ }),
      ).toBeInTheDocument();
    });

    const installBtn = screen.getByRole("button", { name: /Install Extension/ });
    fireEvent.click(installBtn);

    await waitFor(() => {
      expect(screen.getByText("Extension Manifest (JSON)")).toBeInTheDocument();
      expect(screen.getByText("Source Path")).toBeInTheDocument();
    });
  });

  it("shows uninstall confirmation modal", async () => {
    mockGet.mockResolvedValue([MOCK_EXTENSION]);

    renderWithProviders(<ExtensionManager />);

    await waitFor(() => {
      expect(screen.getByText("Test Extension")).toBeInTheDocument();
    });

    const uninstallBtn = screen.getByRole("button", {
      name: "Uninstall Test Extension",
    });
    fireEvent.click(uninstallBtn);

    await waitFor(() => {
      expect(screen.getByText("Confirm Uninstall")).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to uninstall/),
      ).toBeInTheDocument();
    });
  });

  it("calls enable mutation when toggle is clicked on disabled extension", async () => {
    mockGet.mockResolvedValue([MOCK_EXTENSION_DISABLED]);
    mockPost.mockResolvedValue({ ...MOCK_EXTENSION_DISABLED, enabled: true });

    renderWithProviders(<ExtensionManager />);

    await waitFor(() => {
      expect(screen.getByText("Disabled Extension")).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/admin/extensions/2/enable");
    });
  });

  it("calls disable mutation when toggle is clicked on enabled extension", async () => {
    mockGet.mockResolvedValue([MOCK_EXTENSION]);
    mockPost.mockResolvedValue({ ...MOCK_EXTENSION, enabled: false });

    renderWithProviders(<ExtensionManager />);

    await waitFor(() => {
      expect(screen.getByText("Test Extension")).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/admin/extensions/1/disable");
    });
  });
});

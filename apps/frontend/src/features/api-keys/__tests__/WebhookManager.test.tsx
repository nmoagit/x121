import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";

import { WebhookManager } from "../WebhookManager";
import type { Webhook } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const MOCK_WEBHOOK: Webhook = {
  id: 1,
  name: "Production Webhook",
  url: "https://example.com/webhook",
  event_types: ["project.created", "job.completed"],
  is_enabled: true,
  created_by: 1,
  last_triggered_at: "2026-02-20T15:00:00Z",
  failure_count: 0,
  created_at: "2026-02-19T08:00:00Z",
  updated_at: "2026-02-19T08:00:00Z",
};

const MOCK_DISABLED_WEBHOOK: Webhook = {
  ...MOCK_WEBHOOK,
  id: 2,
  name: "Staging Webhook",
  url: "https://staging.example.com/webhook",
  event_types: [],
  is_enabled: false,
  last_triggered_at: null,
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

describe("WebhookManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<WebhookManager />);

    const spinner = document.querySelector('[aria-label="Loading"]');
    expect(spinner).toBeTruthy();
  });

  it("renders the list of webhooks", async () => {
    mockGet.mockResolvedValue([MOCK_WEBHOOK, MOCK_DISABLED_WEBHOOK]);

    renderWithProviders(<WebhookManager />);

    await waitFor(() => {
      expect(screen.getByText("Production Webhook")).toBeInTheDocument();
      expect(screen.getByText("Staging Webhook")).toBeInTheDocument();
    });
  });

  it("shows empty state when no webhooks exist", async () => {
    mockGet.mockResolvedValue([]);

    renderWithProviders(<WebhookManager />);

    await waitFor(() => {
      expect(
        screen.getByText(/No webhooks configured/),
      ).toBeInTheDocument();
    });
  });

  it("renders enabled and disabled badges", async () => {
    mockGet.mockResolvedValue([MOCK_WEBHOOK, MOCK_DISABLED_WEBHOOK]);

    renderWithProviders(<WebhookManager />);

    await waitFor(() => {
      expect(screen.getByText("Enabled")).toBeInTheDocument();
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });
  });

  it("renders event type badges", async () => {
    mockGet.mockResolvedValue([MOCK_WEBHOOK]);

    renderWithProviders(<WebhookManager />);

    await waitFor(() => {
      expect(screen.getByText("project.created")).toBeInTheDocument();
      expect(screen.getByText("job.completed")).toBeInTheDocument();
    });
  });

  it("shows All events text when event_types is empty", async () => {
    mockGet.mockResolvedValue([MOCK_DISABLED_WEBHOOK]);

    renderWithProviders(<WebhookManager />);

    await waitFor(() => {
      expect(screen.getByText("All events")).toBeInTheDocument();
    });
  });

  it("shows Create Webhook button", async () => {
    mockGet.mockResolvedValue([]);

    renderWithProviders(<WebhookManager />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Create Webhook/ }),
      ).toBeInTheDocument();
    });
  });

  it("opens create modal on button click", async () => {
    mockGet.mockResolvedValue([]);

    renderWithProviders(<WebhookManager />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Create Webhook/ }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Create Webhook/ }));

    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeInTheDocument();
      expect(screen.getByLabelText("Secret (optional)")).toBeInTheDocument();
    });
  });

  it("shows delete confirmation modal", async () => {
    mockGet.mockResolvedValue([MOCK_WEBHOOK]);

    renderWithProviders(<WebhookManager />);

    await waitFor(() => {
      expect(screen.getByText("Production Webhook")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Production Webhook" }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    });
  });

  it("calls test mutation when Test button is clicked", async () => {
    mockGet.mockResolvedValue([MOCK_WEBHOOK]);
    mockPost.mockResolvedValue({ id: 99, status: "pending" });

    renderWithProviders(<WebhookManager />);

    await waitFor(() => {
      expect(screen.getByText("Production Webhook")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/admin/webhooks/1/test");
    });
  });
});

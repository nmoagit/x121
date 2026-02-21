import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitEvent } from "@/hooks/useEventBus";
import { useJobStore } from "../useJobStatusAggregator";
import { JobTrayIcon } from "../JobTrayIcon";

/* --------------------------------------------------------------------------
   Test helpers
   -------------------------------------------------------------------------- */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

/** Render and wait for effects (subscriptions) to settle. */
async function renderAndSettle() {
  const result = render(<JobTrayIcon />, { wrapper: createWrapper() });
  // Flush initial effects (event bus subscriptions, query)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return result;
}

function getTrayButton(): HTMLElement {
  return screen.getByRole("button", { name: /job tray/i });
}

/* Mock the API response for active jobs */
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("JobTrayIcon", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Reset the store between tests
    useJobStore.setState({
      runningCount: 0,
      queuedCount: 0,
      overallProgress: 0,
      jobs: [],
      _jobs: new Map(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the tray button", async () => {
    await renderAndSettle();

    const button = getTrayButton();
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button.getAttribute("aria-label")).toContain("No active jobs");
  });

  it("does not show a badge count when there are no jobs", async () => {
    await renderAndSettle();

    // The badge is the count span inside the tray button with font-bold
    const button = getTrayButton();
    const badgeSpan = button.querySelector("span");
    expect(badgeSpan).toBeNull();
  });

  it("updates when a job is created via event bus", async () => {
    await renderAndSettle();

    await act(async () => {
      emitEvent("job.created", {
        jobId: "job-1",
        jobName: "Scene 1 Generation",
        status: "queued",
        progress: 0,
      });
    });

    await waitFor(() => {
      expect(getTrayButton().getAttribute("aria-label")).toContain("1 queued");
    });
  });

  it("shows running count and updates on status change", async () => {
    await renderAndSettle();

    await act(async () => {
      emitEvent("job.status_changed", {
        jobId: "job-2",
        jobName: "Render A",
        status: "running",
        progress: 50,
      });
    });

    await waitFor(() => {
      expect(getTrayButton().getAttribute("aria-label")).toContain("1 running");
    });
  });

  it("removes job from count when completed", async () => {
    await renderAndSettle();

    await act(async () => {
      emitEvent("job.status_changed", {
        jobId: "job-3",
        jobName: "Render B",
        status: "running",
        progress: 0,
      });
    });

    await waitFor(() => {
      expect(getTrayButton().getAttribute("aria-label")).toContain("1 running");
    });

    await act(async () => {
      emitEvent("job.status_changed", {
        jobId: "job-3",
        jobName: "Render B",
        status: "completed",
        progress: 100,
      });
    });

    await waitFor(() => {
      expect(getTrayButton().getAttribute("aria-label")).toContain("No active jobs");
    });
  });

  it("opens and closes the panel on click", async () => {
    await renderAndSettle();

    const button = getTrayButton();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const closeBtn = screen.getByLabelText("Close panel");
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows job details in the panel", async () => {
    await renderAndSettle();

    await act(async () => {
      emitEvent("job.status_changed", {
        jobId: "job-4",
        jobName: "Scene 5 Render",
        status: "running",
        progress: 42,
      });
    });

    await act(async () => {
      fireEvent.click(getTrayButton());
    });

    await waitFor(() => {
      // Job name should appear in the panel
      expect(screen.getByText("Scene 5 Render")).toBeInTheDocument();
      // Progress bars should exist (per-job + overall footer)
      expect(screen.getAllByRole("progressbar").length).toBeGreaterThanOrEqual(1);
    });

    // The 42% appears in both per-job and footer, both valid
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("42%");
  });

  it("shows empty state when panel opens with no jobs", async () => {
    await renderAndSettle();

    await act(async () => {
      fireEvent.click(getTrayButton());
    });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("No active jobs");
  });

  it("updates progress via job.progress events", async () => {
    await renderAndSettle();

    await act(async () => {
      emitEvent("job.status_changed", {
        jobId: "job-5",
        jobName: "Render C",
        status: "running",
        progress: 10,
      });
    });

    await act(async () => {
      emitEvent("job.progress", {
        jobId: "job-5",
        progress: 75,
      });
    });

    await act(async () => {
      fireEvent.click(getTrayButton());
    });

    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog.textContent).toContain("75%");
    });
  });

  it("shows multiple jobs simultaneously", async () => {
    await renderAndSettle();

    await act(async () => {
      emitEvent("job.status_changed", {
        jobId: "job-a",
        jobName: "Render Alpha",
        status: "running",
        progress: 30,
      });
    });

    await act(async () => {
      emitEvent("job.created", {
        jobId: "job-b",
        jobName: "Render Beta",
        status: "queued",
        progress: 0,
      });
    });

    await waitFor(() => {
      expect(getTrayButton().getAttribute("aria-label")).toContain("1 running");
      expect(getTrayButton().getAttribute("aria-label")).toContain("1 queued");
    });

    await act(async () => {
      fireEvent.click(getTrayButton());
    });

    expect(screen.getByText("Render Alpha")).toBeInTheDocument();
    expect(screen.getByText("Render Beta")).toBeInTheDocument();
  });

  it("displays badge count for active jobs", async () => {
    await renderAndSettle();

    await act(async () => {
      emitEvent("job.status_changed", {
        jobId: "job-x",
        jobName: "Test Job",
        status: "running",
        progress: 50,
      });
    });

    await waitFor(() => {
      const button = getTrayButton();
      const badge = button.querySelector("span");
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe("1");
    });
  });
});

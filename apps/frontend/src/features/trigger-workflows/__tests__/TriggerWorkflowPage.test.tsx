/**
 * TriggerWorkflowPage integration tests (PRD-97).
 *
 * Validates the page renders with tabs, action buttons, and tab switching.
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { TriggerWorkflowPage } from "../TriggerWorkflowPage";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-trigger-workflows", () => ({
  useTriggers: vi.fn(),
  useTrigger: vi.fn(),
  useCreateTrigger: vi.fn(),
  useUpdateTrigger: vi.fn(),
  useDeleteTrigger: vi.fn(),
  useDryRun: vi.fn(),
  useChainGraph: vi.fn(),
  useTriggerLog: vi.fn(),
  usePauseAll: vi.fn(),
  useResumeAll: vi.fn(),
}));

import {
  useTriggers,
  useCreateTrigger,
  useUpdateTrigger,
  useDeleteTrigger,
  useDryRun,
  useChainGraph,
  useTriggerLog,
  usePauseAll,
  useResumeAll,
} from "../hooks/use-trigger-workflows";

/* --------------------------------------------------------------------------
   Setup
   -------------------------------------------------------------------------- */

function setupMocks() {
  vi.mocked(useTriggers).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useTriggers>);

  vi.mocked(useCreateTrigger).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateTrigger>);

  vi.mocked(useUpdateTrigger).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateTrigger>);

  vi.mocked(useDeleteTrigger).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteTrigger>);

  vi.mocked(useDryRun).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDryRun>);

  vi.mocked(useChainGraph).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useChainGraph>);

  vi.mocked(useTriggerLog).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useTriggerLog>);

  vi.mocked(usePauseAll).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof usePauseAll>);

  vi.mocked(useResumeAll).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useResumeAll>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("TriggerWorkflowPage", () => {
  it("renders the page with title and create button", () => {
    setupMocks();

    renderWithProviders(<TriggerWorkflowPage />);

    expect(screen.getByTestId("trigger-workflow-page")).toBeInTheDocument();
    expect(screen.getByText("Trigger Workflows")).toBeInTheDocument();
    expect(screen.getByTestId("create-trigger-btn")).toBeInTheDocument();
  });

  it("shows Triggers tab content by default", () => {
    setupMocks();

    renderWithProviders(<TriggerWorkflowPage />);

    expect(screen.getByText(/no triggers configured/i)).toBeInTheDocument();
  });

  it("shows all three tabs", () => {
    setupMocks();

    renderWithProviders(<TriggerWorkflowPage />);

    expect(screen.getByRole("tab", { name: "Triggers" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Chain Graph" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Execution Log" })).toBeInTheDocument();
  });

  it("switches to Chain Graph tab", () => {
    setupMocks();

    renderWithProviders(<TriggerWorkflowPage />);

    const graphTab = screen.getByRole("tab", { name: "Chain Graph" });
    fireEvent.click(graphTab);

    expect(screen.getByTestId("chain-graph-empty")).toBeInTheDocument();
  });

  it("switches to Execution Log tab", () => {
    setupMocks();

    renderWithProviders(<TriggerWorkflowPage />);

    const logTab = screen.getByRole("tab", { name: "Execution Log" });
    fireEvent.click(logTab);

    expect(screen.getByTestId("log-empty")).toBeInTheDocument();
  });

  it("hides create and pause/resume buttons on non-trigger tabs", () => {
    setupMocks();

    renderWithProviders(<TriggerWorkflowPage />);

    const graphTab = screen.getByRole("tab", { name: "Chain Graph" });
    fireEvent.click(graphTab);

    expect(screen.queryByTestId("create-trigger-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pause-all-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("resume-all-btn")).not.toBeInTheDocument();
  });

  it("shows pause and resume all buttons on triggers tab", () => {
    setupMocks();

    renderWithProviders(<TriggerWorkflowPage />);

    expect(screen.getByTestId("pause-all-btn")).toBeInTheDocument();
    expect(screen.getByTestId("resume-all-btn")).toBeInTheDocument();
  });

  it("opens create modal when New Trigger button is clicked", () => {
    setupMocks();

    renderWithProviders(<TriggerWorkflowPage />);

    const createBtn = screen.getByTestId("create-trigger-btn");
    fireEvent.click(createBtn);

    const matches = screen.getAllByText("New Trigger");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("trigger-form")).toBeInTheDocument();
  });
});

/**
 * TriggerList component tests (PRD-97).
 *
 * Validates rendering of trigger rows, enable/disable toggle, and
 * empty/loading/error states.
 */

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { TriggerList } from "../TriggerList";
import type { Trigger } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-trigger-workflows", () => ({
  useTriggers: vi.fn(),
  useUpdateTrigger: vi.fn(),
  useDeleteTrigger: vi.fn(),
  useDryRun: vi.fn(),
}));

import {
  useTriggers,
  useUpdateTrigger,
  useDeleteTrigger,
  useDryRun,
} from "../hooks/use-trigger-workflows";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const MOCK_TRIGGER: Trigger = {
  id: 1,
  project_id: 1,
  name: "On Variant Complete",
  description: "Auto-submit QA job",
  event_type: "completed",
  entity_type: "variant",
  scope: null,
  conditions: null,
  actions: [{ action: "submit_job", params: { workflow_id: 1 } }],
  execution_mode: "sequential",
  max_chain_depth: 3,
  requires_approval: false,
  is_enabled: true,
  sort_order: 0,
  created_by_id: 1,
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-27T00:00:00Z",
};

const MOCK_DISABLED_TRIGGER: Trigger = {
  ...MOCK_TRIGGER,
  id: 2,
  name: "On Scene Failed",
  event_type: "failed",
  entity_type: "scene",
  is_enabled: false,
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function setupMocks(
  triggers?: Trigger[],
  isPending = false,
  isError = false,
) {
  vi.mocked(useTriggers).mockReturnValue({
    data: triggers,
    isPending,
    isError,
  } as ReturnType<typeof useTriggers>);

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
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("TriggerList", () => {
  const onEdit = vi.fn();

  it("renders loading state", () => {
    setupMocks(undefined, true);

    renderWithProviders(<TriggerList onEdit={onEdit} />);

    expect(screen.getByTestId("trigger-list-loading")).toBeInTheDocument();
  });

  it("renders empty state when no triggers", () => {
    setupMocks([]);

    renderWithProviders(<TriggerList onEdit={onEdit} />);

    expect(screen.getByTestId("trigger-list-empty")).toBeInTheDocument();
    expect(screen.getByText(/no triggers configured/i)).toBeInTheDocument();
  });

  it("renders trigger rows", () => {
    setupMocks([MOCK_TRIGGER, MOCK_DISABLED_TRIGGER]);

    renderWithProviders(<TriggerList onEdit={onEdit} />);

    expect(screen.getByTestId("trigger-list")).toBeInTheDocument();
    expect(screen.getByText("On Variant Complete")).toBeInTheDocument();
    expect(screen.getByText("On Scene Failed")).toBeInTheDocument();
  });

  it("shows event type badge", () => {
    setupMocks([MOCK_TRIGGER]);

    renderWithProviders(<TriggerList onEdit={onEdit} />);

    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("shows entity type badge", () => {
    setupMocks([MOCK_TRIGGER]);

    renderWithProviders(<TriggerList onEdit={onEdit} />);

    expect(screen.getByText("Variant")).toBeInTheDocument();
  });

  it("renders error state", () => {
    setupMocks(undefined, false, true);

    renderWithProviders(<TriggerList onEdit={onEdit} />);

    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });
});

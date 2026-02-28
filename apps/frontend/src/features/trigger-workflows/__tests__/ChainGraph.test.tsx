/**
 * ChainGraph component tests (PRD-97).
 *
 * Validates graph rendering, node display, and empty/loading states.
 */

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ChainGraph } from "../ChainGraph";
import type { ChainGraphNode } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-trigger-workflows", () => ({
  useChainGraph: vi.fn(),
}));

import { useChainGraph } from "../hooks/use-trigger-workflows";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const MOCK_NODES: ChainGraphNode[] = [
  {
    trigger_id: 1,
    name: "On Variant Complete",
    event_type: "completed",
    entity_type: "variant",
    actions: [{ action: "submit_job", params: { workflow_id: 5 } }],
    is_enabled: true,
    downstream_triggers: [2],
  },
  {
    trigger_id: 2,
    name: "Submit QA Job",
    event_type: "completed",
    entity_type: "scene",
    actions: [],
    is_enabled: true,
    downstream_triggers: [],
  },
];

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function setupMocks(
  nodes?: ChainGraphNode[],
  isPending = false,
  isError = false,
) {
  vi.mocked(useChainGraph).mockReturnValue({
    data: nodes,
    isPending,
    isError,
  } as ReturnType<typeof useChainGraph>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ChainGraph", () => {
  it("renders loading state", () => {
    setupMocks(undefined, true);

    renderWithProviders(<ChainGraph />);

    expect(screen.getByTestId("chain-graph-loading")).toBeInTheDocument();
  });

  it("renders empty state when no nodes", () => {
    setupMocks([]);

    renderWithProviders(<ChainGraph />);

    expect(screen.getByTestId("chain-graph-empty")).toBeInTheDocument();
    expect(screen.getByText(/no trigger chains configured/i)).toBeInTheDocument();
  });

  it("renders graph container with nodes", () => {
    setupMocks(MOCK_NODES);

    renderWithProviders(<ChainGraph />);

    expect(screen.getByTestId("chain-graph")).toBeInTheDocument();
    expect(screen.getByTestId("chain-node-1")).toBeInTheDocument();
    expect(screen.getByTestId("chain-node-2")).toBeInTheDocument();
  });

  it("displays node names", () => {
    setupMocks(MOCK_NODES);

    renderWithProviders(<ChainGraph />);

    expect(screen.getByText("On Variant Complete")).toBeInTheDocument();
    expect(screen.getByText("Submit QA Job")).toBeInTheDocument();
  });

  it("renders SVG edges between connected nodes", () => {
    setupMocks(MOCK_NODES);

    renderWithProviders(<ChainGraph />);

    expect(screen.getByTestId("chain-graph-edges")).toBeInTheDocument();
  });

  it("renders error state", () => {
    setupMocks(undefined, false, true);

    renderWithProviders(<ChainGraph />);

    expect(screen.getByText(/failed to load chain graph/i)).toBeInTheDocument();
  });
});

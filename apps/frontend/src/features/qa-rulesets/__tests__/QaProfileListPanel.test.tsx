/**
 * Tests for QaProfileListPanel component (PRD-91).
 */

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { QaProfileListPanel } from "../QaProfileListPanel";
import type { QaProfile } from "../types";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

vi.mock("../hooks/use-qa-rulesets", () => ({
  useQaProfiles: vi.fn(),
}));

import { useQaProfiles } from "../hooks/use-qa-rulesets";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const PROFILES: QaProfile[] = [
  {
    id: 1,
    name: "High Motion",
    description: "For high motion scenes",
    thresholds: { face_confidence: { warn: 0.7, fail: 0.4 } },
    is_builtin: false,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:00:00Z",
  },
  {
    id: 2,
    name: "Default Portrait",
    description: null,
    thresholds: {
      face_confidence: { warn: 0.8, fail: 0.5 },
      motion: { warn: 0.9, fail: 0.6 },
    },
    is_builtin: true,
    created_at: "2026-02-20T10:00:00Z",
    updated_at: "2026-02-20T10:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function setupMock(
  profiles?: QaProfile[],
  isPending = false,
  isError = false,
) {
  vi.mocked(useQaProfiles).mockReturnValue({
    data: profiles,
    isPending,
    isError,
  } as ReturnType<typeof useQaProfiles>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("QaProfileListPanel", () => {
  it("renders loading spinner while fetching", () => {
    setupMock(undefined, true);

    renderWithProviders(<QaProfileListPanel />);

    expect(screen.getByTestId("profile-list-loading")).toBeInTheDocument();
  });

  it("renders profile cards for each profile", () => {
    setupMock(PROFILES);

    renderWithProviders(<QaProfileListPanel />);

    expect(screen.getByTestId("profile-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("profile-card-2")).toBeInTheDocument();
    expect(screen.getByText("High Motion")).toBeInTheDocument();
    expect(screen.getByText("Default Portrait")).toBeInTheDocument();
  });

  it("shows builtin badge for builtin profiles", () => {
    setupMock(PROFILES);

    renderWithProviders(<QaProfileListPanel />);

    // Profile 2 is builtin.
    expect(screen.getByTestId("builtin-badge-2")).toBeInTheDocument();

    // Profile 1 is not builtin.
    expect(screen.queryByTestId("builtin-badge-1")).not.toBeInTheDocument();
  });

  it("hides delete button for builtin profiles", () => {
    const onDelete = vi.fn();
    setupMock(PROFILES);

    renderWithProviders(<QaProfileListPanel onDelete={onDelete} />);

    // Profile 1 (non-builtin) should have delete.
    expect(screen.getByTestId("profile-delete-1")).toBeInTheDocument();

    // Profile 2 (builtin) should not have delete.
    expect(screen.queryByTestId("profile-delete-2")).not.toBeInTheDocument();
  });

  it("shows create button when onCreate callback provided", () => {
    setupMock(PROFILES);
    const onCreate = vi.fn();

    renderWithProviders(<QaProfileListPanel onCreate={onCreate} />);

    expect(screen.getByTestId("profile-create-btn")).toBeInTheDocument();
  });

  it("shows empty state when no profiles exist", () => {
    setupMock([]);

    renderWithProviders(<QaProfileListPanel />);

    expect(screen.getByTestId("profile-list-empty")).toBeInTheDocument();
  });
});

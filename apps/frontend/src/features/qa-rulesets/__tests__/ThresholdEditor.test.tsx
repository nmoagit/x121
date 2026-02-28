/**
 * Tests for ThresholdEditor component (PRD-91).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ThresholdEditor } from "../ThresholdEditor";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mutateSave = vi.fn();
const mutateDelete = vi.fn();

vi.mock("../hooks/use-qa-rulesets", () => ({
  useEffectiveThresholds: vi.fn(),
  useSceneTypeQaOverride: vi.fn(),
  useQaProfiles: vi.fn(),
  useUpsertSceneTypeQaOverride: vi.fn(),
  useDeleteSceneTypeQaOverride: vi.fn(),
}));

import {
  useDeleteSceneTypeQaOverride,
  useEffectiveThresholds,
  useQaProfiles,
  useSceneTypeQaOverride,
  useUpsertSceneTypeQaOverride,
} from "../hooks/use-qa-rulesets";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function setupMocks({
  effectivePending = false,
  overridePending = false,
  profilesPending = false,
}: {
  effectivePending?: boolean;
  overridePending?: boolean;
  profilesPending?: boolean;
} = {}) {
  vi.mocked(useEffectiveThresholds).mockReturnValue({
    data: effectivePending
      ? undefined
      : {
          face_confidence: { warn: 0.7, fail: 0.4 },
          motion: { warn: 0.8, fail: 0.5 },
        },
    isPending: effectivePending,
  } as ReturnType<typeof useEffectiveThresholds>);

  vi.mocked(useSceneTypeQaOverride).mockReturnValue({
    data: overridePending
      ? undefined
      : {
          id: 1,
          scene_type_id: 10,
          qa_profile_id: null,
          custom_thresholds: null,
          created_at: "2026-02-20T10:00:00Z",
          updated_at: "2026-02-20T10:00:00Z",
        },
    isPending: overridePending,
  } as ReturnType<typeof useSceneTypeQaOverride>);

  vi.mocked(useQaProfiles).mockReturnValue({
    data: profilesPending
      ? undefined
      : [
          {
            id: 1,
            name: "High Motion",
            description: "For action scenes",
            thresholds: {},
            is_builtin: false,
            created_at: "2026-02-20T10:00:00Z",
            updated_at: "2026-02-20T10:00:00Z",
          },
          {
            id: 2,
            name: "Portrait",
            description: null,
            thresholds: {},
            is_builtin: true,
            created_at: "2026-02-20T10:00:00Z",
            updated_at: "2026-02-20T10:00:00Z",
          },
        ],
    isPending: profilesPending,
  } as ReturnType<typeof useQaProfiles>);

  mutateSave.mockClear();
  vi.mocked(useUpsertSceneTypeQaOverride).mockReturnValue({
    mutate: mutateSave,
    isPending: false,
  } as unknown as ReturnType<typeof useUpsertSceneTypeQaOverride>);

  mutateDelete.mockClear();
  vi.mocked(useDeleteSceneTypeQaOverride).mockReturnValue({
    mutate: mutateDelete,
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteSceneTypeQaOverride>);
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ThresholdEditor", () => {
  it("renders loading spinner while fetching", () => {
    setupMocks({ effectivePending: true });

    renderWithProviders(<ThresholdEditor sceneTypeId={10} />);

    expect(screen.getByTestId("threshold-editor-loading")).toBeInTheDocument();
  });

  it("renders threshold sliders for each metric", () => {
    setupMocks();

    renderWithProviders(<ThresholdEditor sceneTypeId={10} />);

    expect(
      screen.getByTestId("threshold-slider-face_confidence"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("threshold-slider-motion"),
    ).toBeInTheDocument();
  });

  it("profile selector shows available profiles", () => {
    setupMocks();

    renderWithProviders(<ThresholdEditor sceneTypeId={10} />);

    // The select should contain option text for both profiles.
    expect(screen.getByText("High Motion")).toBeInTheDocument();
    expect(screen.getByText("Portrait")).toBeInTheDocument();
  });

  it("save button calls upsert mutation", () => {
    setupMocks();

    renderWithProviders(<ThresholdEditor sceneTypeId={10} />);

    // Change a threshold to make the form dirty.
    const warnInput = screen.getByRole("spinbutton", {
      name: /warn threshold for face confidence/i,
    });
    fireEvent.change(warnInput, { target: { value: "0.8" } });

    const saveBtn = screen.getByTestId("threshold-save-btn");
    fireEvent.click(saveBtn);

    expect(mutateSave).toHaveBeenCalledTimes(1);
    expect(mutateSave).toHaveBeenCalledWith(
      expect.objectContaining({ sceneTypeId: 10 }),
    );
  });

  it("reset button calls delete mutation", () => {
    setupMocks();

    renderWithProviders(<ThresholdEditor sceneTypeId={10} />);

    const resetBtn = screen.getByTestId("threshold-reset-btn");
    fireEvent.click(resetBtn);

    expect(mutateDelete).toHaveBeenCalledWith(10);
  });
});

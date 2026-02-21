import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";

import { VariantGallery } from "../VariantGallery";
import { IMAGE_VARIANT_STATUS, PROVENANCE, type ImageVariant } from "../types";

/* --------------------------------------------------------------------------
   Fixtures
   -------------------------------------------------------------------------- */

const MOCK_VARIANT_GENERATED: ImageVariant = {
  id: 1,
  character_id: 10,
  source_image_id: null,
  derived_image_id: null,
  variant_label: "Clothed variant",
  status_id: IMAGE_VARIANT_STATUS.GENERATED,
  file_path: "/storage/variants/test.png",
  variant_type: "clothed",
  provenance: PROVENANCE.GENERATED,
  is_hero: false,
  file_size_bytes: 102400,
  width: 512,
  height: 768,
  format: "png",
  version: 1,
  parent_variant_id: null,
  generation_params: null,
  deleted_at: null,
  created_at: "2026-02-21T00:00:00Z",
  updated_at: "2026-02-21T00:00:00Z",
};

const MOCK_VARIANT_HERO: ImageVariant = {
  ...MOCK_VARIANT_GENERATED,
  id: 2,
  variant_label: "Hero variant",
  status_id: IMAGE_VARIANT_STATUS.APPROVED,
  is_hero: true,
  version: 2,
  parent_variant_id: 1,
  provenance: PROVENANCE.MANUALLY_EDITED,
};

const MOCK_VARIANT_GENERATING: ImageVariant = {
  ...MOCK_VARIANT_GENERATED,
  id: 3,
  variant_label: "Generating variant",
  status_id: IMAGE_VARIANT_STATUS.GENERATING,
  file_path: "",
};

/* --------------------------------------------------------------------------
   Mock API
   -------------------------------------------------------------------------- */

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: vi.fn(),
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

describe("VariantGallery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<VariantGallery characterId={10} />);

    const spinner = document.querySelector('[aria-label="Loading"]');
    expect(spinner).toBeTruthy();
  });

  it("renders the list of variants", async () => {
    mockGet.mockResolvedValue([MOCK_VARIANT_GENERATED, MOCK_VARIANT_HERO]);

    renderWithProviders(<VariantGallery characterId={10} />);

    await waitFor(() => {
      expect(screen.getByText("Clothed variant")).toBeInTheDocument();
      expect(screen.getByText("Hero variant")).toBeInTheDocument();
    });
  });

  it("shows empty state when no variants exist", async () => {
    mockGet.mockResolvedValue([]);

    renderWithProviders(<VariantGallery characterId={10} />);

    await waitFor(() => {
      expect(
        screen.getByText(/No variants yet/),
      ).toBeInTheDocument();
    });
  });

  it("displays status badges correctly", async () => {
    mockGet.mockResolvedValue([
      MOCK_VARIANT_GENERATED,
      MOCK_VARIANT_HERO,
      MOCK_VARIANT_GENERATING,
    ]);

    renderWithProviders(<VariantGallery characterId={10} />);

    await waitFor(() => {
      // "Generated" appears as both a status badge and a provenance badge
      expect(screen.getAllByText("Generated").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Approved")).toBeInTheDocument();
      expect(screen.getByText("Generating")).toBeInTheDocument();
    });
  });

  it("shows approve and reject buttons for generated variants", async () => {
    mockGet.mockResolvedValue([MOCK_VARIANT_GENERATED]);

    renderWithProviders(<VariantGallery characterId={10} />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Approve Clothed variant" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Reject Clothed variant" }),
      ).toBeInTheDocument();
    });
  });

  it("calls approve mutation when approve button is clicked", async () => {
    mockGet.mockResolvedValue([MOCK_VARIANT_GENERATED]);
    mockPost.mockResolvedValue({ ...MOCK_VARIANT_GENERATED, is_hero: true });

    renderWithProviders(<VariantGallery characterId={10} />);

    await waitFor(() => {
      expect(screen.getByText("Clothed variant")).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole("button", {
      name: "Approve Clothed variant",
    });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/characters/10/image-variants/1/approve",
      );
    });
  });

  it("calls reject mutation when reject button is clicked", async () => {
    mockGet.mockResolvedValue([MOCK_VARIANT_GENERATED]);
    mockPost.mockResolvedValue({ ...MOCK_VARIANT_GENERATED, status_id: 3 });

    renderWithProviders(<VariantGallery characterId={10} />);

    await waitFor(() => {
      expect(screen.getByText("Clothed variant")).toBeInTheDocument();
    });

    const rejectBtn = screen.getByRole("button", {
      name: "Reject Clothed variant",
    });
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/characters/10/image-variants/1/reject",
      );
    });
  });

  it("calls delete mutation when delete button is clicked", async () => {
    mockGet.mockResolvedValue([MOCK_VARIANT_GENERATED]);
    mockDelete.mockResolvedValue(undefined);

    renderWithProviders(<VariantGallery characterId={10} />);

    await waitFor(() => {
      expect(screen.getByText("Clothed variant")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole("button", {
      name: "Delete Clothed variant",
    });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(
        "/characters/10/image-variants/1",
      );
    });
  });

  it("displays source image when provided", async () => {
    mockGet.mockResolvedValue([MOCK_VARIANT_GENERATED]);

    renderWithProviders(
      <VariantGallery
        characterId={10}
        sourceImageUrl="/storage/source.png"
      />,
    );

    await waitFor(() => {
      expect(screen.getByAltText("Source image")).toBeInTheDocument();
    });
  });

  it("opens preview modal when variant image is clicked", async () => {
    mockGet.mockResolvedValue([MOCK_VARIANT_GENERATED]);

    renderWithProviders(<VariantGallery characterId={10} />);

    await waitFor(() => {
      expect(screen.getByText("Clothed variant")).toBeInTheDocument();
    });

    const variantImage = screen.getByAltText("Clothed variant");
    fireEvent.click(variantImage);

    await waitFor(() => {
      // The modal title should match the variant label
      const modalImages = screen.getAllByAltText("Clothed variant");
      expect(modalImages.length).toBeGreaterThan(1); // card + modal
    });
  });
});

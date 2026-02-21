import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { MetadataPreview } from "../MetadataPreview";

// Mock the api module to prevent real HTTP requests.
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/characters/") && path.includes("/metadata/preview")) {
        return Promise.resolve({
          schema_version: "1.0",
          character_id: 42,
          name: "Alice",
          project_id: 1,
          project_name: "Test Project",
          biographical: { description: "A test character", tags: ["hero"] },
          physical_attributes: {
            height: "170cm",
            build: "Athletic",
            hair_color: "Brown",
            eye_color: "Green",
          },
          source_image: null,
          derived_images: [],
          custom_fields: null,
          generated_at: "2026-02-21T10:00:00Z",
          source_updated_at: "2026-02-21T09:55:00Z",
        });
      }
      if (path.includes("/scenes/") && path.includes("/metadata/preview")) {
        return Promise.resolve({
          schema_version: "1.0",
          scene_id: 10,
          character_id: 42,
          character_name: "Alice",
          scene_type: "full_body",
          technical: {
            duration_seconds: 12.5,
            resolution: "1920x1080",
            codec: "h264",
            fps: 30,
            segment_count: 2,
          },
          segments: [],
          provenance: {
            workflow_name: "standard",
            model_version: null,
            lora_versions: [],
            generation_parameters: {},
          },
          generated_at: "2026-02-21T10:00:00Z",
          source_updated_at: "2026-02-21T09:55:00Z",
        });
      }
      return Promise.reject(new Error("Not found"));
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("MetadataPreview", () => {
  it("renders character metadata title", async () => {
    renderWithProviders(<MetadataPreview mode="character" characterId={42} />);

    await waitFor(() => {
      expect(screen.getByText("Character Metadata")).toBeInTheDocument();
    });
  });

  it("displays character metadata JSON after loading", async () => {
    renderWithProviders(<MetadataPreview mode="character" characterId={42} />);

    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
      expect(screen.getByText(/Test Project/)).toBeInTheDocument();
    });
  });

  it("renders video metadata title", async () => {
    renderWithProviders(<MetadataPreview mode="video" sceneId={10} />);

    await waitFor(() => {
      expect(screen.getByText("Video Metadata")).toBeInTheDocument();
    });
  });

  it("displays video metadata JSON after loading", async () => {
    renderWithProviders(<MetadataPreview mode="video" sceneId={10} />);

    await waitFor(() => {
      expect(screen.getByText(/1920x1080/)).toBeInTheDocument();
      expect(screen.getByText(/h264/)).toBeInTheDocument();
    });
  });

  it("shows schema version in character metadata output", async () => {
    renderWithProviders(<MetadataPreview mode="character" characterId={42} />);

    await waitFor(() => {
      expect(screen.getByText(/schema_version/)).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    renderWithProviders(<MetadataPreview mode="character" characterId={42} />);

    const spinner = document.querySelector('[class*="animate-spin"]');
    expect(spinner).toBeTruthy();
  });
});

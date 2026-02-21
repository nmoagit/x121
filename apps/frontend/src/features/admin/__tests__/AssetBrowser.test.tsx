import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AssetBrowser } from "../AssetBrowser";
import type { AssetWithStats } from "../hooks/use-assets";

/* --------------------------------------------------------------------------
   Mocks
   -------------------------------------------------------------------------- */

const mockAssets: AssetWithStats[] = [
  {
    id: 1,
    name: "stable-diffusion-v1.5",
    version: "1.5.0",
    asset_type_id: 1,
    status_id: 1,
    file_path: "/models/sd-v1.5.safetensors",
    file_size_bytes: 4_265_380_864,
    checksum_sha256: "abc123",
    description: "Stable Diffusion v1.5 base model",
    metadata: {},
    registered_by: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    avg_rating: 4.5,
    rating_count: 12,
    dependency_count: 3,
    type_name: "model",
    status_name: "active",
  },
  {
    id: 2,
    name: "character-lora-v2",
    version: "2.0.0",
    asset_type_id: 2,
    status_id: 1,
    file_path: "/loras/char-v2.safetensors",
    file_size_bytes: 134_217_728,
    checksum_sha256: "def456",
    description: "Character generation LoRA weights",
    metadata: {},
    registered_by: 1,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
    avg_rating: 3.0,
    rating_count: 5,
    dependency_count: 0,
    type_name: "lora",
    status_name: "active",
  },
  {
    id: 3,
    name: "animatediff-node",
    version: "1.0.0",
    asset_type_id: 3,
    status_id: 2,
    file_path: "/nodes/animatediff",
    file_size_bytes: 0,
    checksum_sha256: "ghi789",
    description: null,
    metadata: {},
    registered_by: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    avg_rating: 0,
    rating_count: 0,
    dependency_count: 1,
    type_name: "custom_node",
    status_name: "deprecated",
  },
];

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes("asset_type_id=2")) {
        return Promise.resolve(mockAssets.filter((a) => a.asset_type_id === 2));
      }
      if (path.includes("name=")) {
        const match = path.match(/name=([^&]*)/);
        const term = match?.[1] ? decodeURIComponent(match[1]).toLowerCase() : "";
        return Promise.resolve(
          mockAssets.filter((a) => a.name.toLowerCase().includes(term)),
        );
      }
      return Promise.resolve(mockAssets);
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("AssetBrowser", () => {
  it("renders asset cards with names and type badges", async () => {
    render(<AssetBrowser />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("stable-diffusion-v1.5")).toBeInTheDocument();
      expect(screen.getByText("character-lora-v2")).toBeInTheDocument();
      expect(screen.getByText("animatediff-node")).toBeInTheDocument();
    });

    // Type badges
    expect(screen.getByText("model")).toBeInTheDocument();
    expect(screen.getByText("lora")).toBeInTheDocument();
    expect(screen.getByText("custom_node")).toBeInTheDocument();
  });

  it("renders the page title", async () => {
    render(<AssetBrowser />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Asset Registry")).toBeInTheDocument();
    });
  });

  it("displays version numbers", async () => {
    render(<AssetBrowser />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("v1.5.0")).toBeInTheDocument();
      expect(screen.getByText("v2.0.0")).toBeInTheDocument();
      expect(screen.getByText("v1.0.0")).toBeInTheDocument();
    });
  });

  it("shows rating stars for each asset", async () => {
    render(<AssetBrowser />, { wrapper: createWrapper() });

    await waitFor(() => {
      // The first asset has rating_count 12
      expect(screen.getByText("(12)")).toBeInTheDocument();
      // The second asset has rating_count 5
      expect(screen.getByText("(5)")).toBeInTheDocument();
    });
  });

  it("shows dependency count badges", async () => {
    render(<AssetBrowser />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("3 deps")).toBeInTheDocument();
      expect(screen.getByText("1 dep")).toBeInTheDocument();
    });
  });

  it("shows filter controls", async () => {
    render(<AssetBrowser />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByLabelText("Search")).toBeInTheDocument();
      expect(screen.getByLabelText("Type")).toBeInTheDocument();
      expect(screen.getByLabelText("Status")).toBeInTheDocument();
    });
  });

  it("calls onSelectAsset when a card is clicked", async () => {
    const onSelect = vi.fn();

    render(<AssetBrowser onSelectAsset={onSelect} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText("stable-diffusion-v1.5")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("stable-diffusion-v1.5"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("shows empty state when no assets are returned", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce([]);

    render(<AssetBrowser />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("No assets found")).toBeInTheDocument();
    });
  });
});

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/lib/test-utils";
import { BackendConfigPanel } from "../BackendConfigPanel";

import type { StorageBackend } from "../types";

const baseBackend: StorageBackend = {
  id: 1,
  name: "primary-local",
  backend_type_id: 1,
  status_id: 1,
  tier: "hot",
  config: { base_path: "/data/storage" },
  is_default: true,
  total_capacity_bytes: 1099511627776, // 1 TB
  used_bytes: 549755813888, // 500 GB
  project_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
  },
}));

describe("BackendConfigPanel", () => {
  it("renders the backend name", () => {
    renderWithProviders(<BackendConfigPanel backends={[baseBackend]} />);
    expect(screen.getByText("primary-local")).toBeInTheDocument();
  });

  it("shows the correct status badge", () => {
    renderWithProviders(<BackendConfigPanel backends={[baseBackend]} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows Add Backend button when onAdd is provided", () => {
    const onAdd = vi.fn();
    renderWithProviders(<BackendConfigPanel backends={[baseBackend]} onAdd={onAdd} />);
    expect(screen.getByText("Add Backend")).toBeInTheDocument();
  });

  it("shows empty state when no backends", () => {
    renderWithProviders(<BackendConfigPanel backends={[]} />);
    expect(screen.getByText("No storage backends configured.")).toBeInTheDocument();
  });
});

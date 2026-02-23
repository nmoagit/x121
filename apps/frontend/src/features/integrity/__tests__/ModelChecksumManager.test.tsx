/**
 * Tests for ModelChecksumManager component (PRD-43).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { ModelChecksumManager } from "../ModelChecksumManager";
import type { ModelChecksum } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const checksums: ModelChecksum[] = [
  {
    id: 1,
    model_name: "sd_xl_base_1.0",
    file_path: "checkpoints/sd_xl_base_1.0.safetensors",
    expected_hash: "abc123def456",
    file_size_bytes: 6_938_000_000,
    model_type: "checkpoint",
    source_url: null,
    created_at: "2026-02-22T10:00:00Z",
    updated_at: "2026-02-22T10:00:00Z",
  },
  {
    id: 2,
    model_name: "ip-adapter_sd15",
    file_path: "loras/ip-adapter_sd15.safetensors",
    expected_hash: "789abc012def",
    file_size_bytes: 1_700_000_000,
    model_type: "lora",
    source_url: "https://example.com/model",
    created_at: "2026-02-22T10:00:00Z",
    updated_at: "2026-02-22T10:00:00Z",
  },
];

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("ModelChecksumManager", () => {
  test("renders checksum list", () => {
    renderWithProviders(
      <ModelChecksumManager
        checksums={checksums}
        onCreateChecksum={vi.fn()}
        onDeleteChecksum={vi.fn()}
      />,
    );

    expect(screen.getByTestId("model-checksum-manager")).toBeInTheDocument();
    expect(screen.getByTestId("checksum-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("checksum-row-2")).toBeInTheDocument();
    expect(screen.getByText("sd_xl_base_1.0")).toBeInTheDocument();
    expect(screen.getByText("ip-adapter_sd15")).toBeInTheDocument();
  });

  test("creates new checksum via form", () => {
    const onCreate = vi.fn();

    renderWithProviders(
      <ModelChecksumManager
        checksums={checksums}
        onCreateChecksum={onCreate}
        onDeleteChecksum={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("input-model-name"), {
      target: { value: "new_model" },
    });
    fireEvent.change(screen.getByTestId("input-file-path"), {
      target: { value: "checkpoints/new_model.safetensors" },
    });
    fireEvent.change(screen.getByTestId("input-expected-hash"), {
      target: { value: "deadbeef" },
    });
    fireEvent.click(screen.getByTestId("btn-create-checksum"));

    expect(onCreate).toHaveBeenCalledWith({
      model_name: "new_model",
      file_path: "checkpoints/new_model.safetensors",
      expected_hash: "deadbeef",
    });
  });

  test("deletes checksum when delete button clicked", () => {
    const onDelete = vi.fn();

    renderWithProviders(
      <ModelChecksumManager
        checksums={checksums}
        onCreateChecksum={vi.fn()}
        onDeleteChecksum={onDelete}
      />,
    );

    fireEvent.click(screen.getByTestId("delete-checksum-1"));
    expect(onDelete).toHaveBeenCalledWith(1);
  });
});

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";
import { EmbeddingStatusBadge } from "../EmbeddingStatusBadge";
import { EMBEDDING_STATUS } from "../types";

describe("EmbeddingStatusBadge", () => {
  it("renders Pending status", () => {
    renderWithProviders(
      <EmbeddingStatusBadge statusId={EMBEDDING_STATUS.PENDING} />,
    );
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders Completed status", () => {
    renderWithProviders(
      <EmbeddingStatusBadge statusId={EMBEDDING_STATUS.COMPLETED} />,
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("renders Failed status", () => {
    renderWithProviders(
      <EmbeddingStatusBadge statusId={EMBEDDING_STATUS.FAILED} />,
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows confidence percentage when provided", () => {
    renderWithProviders(
      <EmbeddingStatusBadge
        statusId={EMBEDDING_STATUS.COMPLETED}
        confidence={0.95}
      />,
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("(95%)")).toBeInTheDocument();
  });
});

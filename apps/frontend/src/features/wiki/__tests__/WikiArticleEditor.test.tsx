/**
 * Tests for WikiArticleEditor component (PRD-56).
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { WikiArticleEditor } from "../WikiArticleEditor";

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("WikiArticleEditor", () => {
  const defaultProps = {
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  test("renders form fields", () => {
    renderWithProviders(<WikiArticleEditor {...defaultProps} />);

    expect(screen.getByTestId("wiki-article-editor")).toBeInTheDocument();
    expect(screen.getByTestId("wiki-title-input")).toBeInTheDocument();
    expect(screen.getByTestId("wiki-tags-input")).toBeInTheDocument();
    expect(screen.getByTestId("wiki-content-textarea")).toBeInTheDocument();
    expect(screen.getByTestId("wiki-content-preview")).toBeInTheDocument();
  });

  test("validates required title", () => {
    renderWithProviders(<WikiArticleEditor {...defaultProps} />);

    const saveButton = screen.getByTestId("wiki-save-button");
    // Button should be disabled when title is empty.
    expect(saveButton).toBeDisabled();
  });

  test("calls onSave with form data", () => {
    const onSave = vi.fn();
    renderWithProviders(
      <WikiArticleEditor {...defaultProps} onSave={onSave} />,
    );

    // Fill in title.
    const titleInput = screen.getByTestId("wiki-title-input");
    fireEvent.change(titleInput, {
      target: { value: "My Test Article" },
    });

    // Fill in content.
    const contentTextarea = screen.getByTestId("wiki-content-textarea");
    fireEvent.change(contentTextarea, {
      target: { value: "Hello world content" },
    });

    // Submit the form.
    const saveButton = screen.getByTestId("wiki-save-button");
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "My Test Article",
        content_md: "Hello world content",
        slug: "my-test-article",
      }),
    );
  });

  test("generates slug from title", () => {
    renderWithProviders(<WikiArticleEditor {...defaultProps} />);

    const titleInput = screen.getByTestId("wiki-title-input");
    fireEvent.change(titleInput, {
      target: { value: "How to Use Workflows" },
    });

    const slugPreview = screen.getByTestId("wiki-slug-preview");
    expect(slugPreview).toHaveTextContent("how-to-use-workflows");
  });
});

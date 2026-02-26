/**
 * Tests for WikiArticleViewer component (PRD-56).
 */

import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithProviders } from "@/lib/test-utils";

import { WikiArticleViewer } from "../WikiArticleViewer";
import type { WikiArticle } from "../types";

/* --------------------------------------------------------------------------
   Test data
   -------------------------------------------------------------------------- */

const mockArticle: WikiArticle = {
  id: 1,
  title: "Getting Started with X121",
  slug: "getting-started-with-x121",
  content_md: "Welcome to X121! This guide will help you get started.",
  category: "tutorial",
  tags: ["beginner", "onboarding"],
  is_builtin: false,
  is_pinned: true,
  pin_location: "dashboard",
  created_by: 100,
  created_at: "2026-02-20T10:00:00Z",
  updated_at: "2026-02-20T12:00:00Z",
};

/* --------------------------------------------------------------------------
   Tests
   -------------------------------------------------------------------------- */

describe("WikiArticleViewer", () => {
  test("renders article content", () => {
    renderWithProviders(<WikiArticleViewer article={mockArticle} />);

    expect(screen.getByTestId("wiki-article-viewer")).toBeInTheDocument();
    expect(screen.getByTestId("wiki-article-content")).toHaveTextContent(
      "Welcome to X121!",
    );
  });

  test("shows category breadcrumb", () => {
    renderWithProviders(<WikiArticleViewer article={mockArticle} />);

    const breadcrumb = screen.getByTestId("wiki-category-breadcrumb");
    expect(breadcrumb).toBeInTheDocument();
    expect(breadcrumb).toHaveTextContent("Tutorial");
  });

  test("displays version info", () => {
    renderWithProviders(<WikiArticleViewer article={mockArticle} />);

    const versionInfo = screen.getByTestId("wiki-version-info");
    expect(versionInfo).toBeInTheDocument();
    expect(versionInfo).toHaveTextContent("Last updated:");
  });
});

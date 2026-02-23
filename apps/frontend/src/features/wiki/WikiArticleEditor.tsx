/**
 * Editor form for creating/updating wiki articles (PRD-56).
 *
 * Provides title, content textarea, category select, tags input,
 * and a side-by-side edit/preview layout.
 */

import { useCallback, useState } from "react";

import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Select } from "@/components/primitives/Select";
import { generateSlug } from "@/lib/format";

import type { CreateWikiArticle } from "./types";
import { CATEGORY_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface WikiArticleEditorProps {
  /** Initial values for editing an existing article. */
  initialValues?: {
    title: string;
    content_md: string;
    category: string | null;
    tags: string[] | null;
  };
  /** Called with the form data when save is clicked. */
  onSave: (data: CreateWikiArticle) => void;
  /** Called when cancel is clicked. */
  onCancel: () => void;
  /** Whether the form is submitting. */
  isSubmitting?: boolean;
}

/* --------------------------------------------------------------------------
   Category options for the select
   -------------------------------------------------------------------------- */

const categoryOptions = [
  { value: "", label: "No category" },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WikiArticleEditor({
  initialValues,
  onSave,
  onCancel,
  isSubmitting = false,
}: WikiArticleEditorProps) {
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [contentMd, setContentMd] = useState(
    initialValues?.content_md ?? "",
  );
  const [category, setCategory] = useState<string>(
    initialValues?.category ?? "",
  );
  const [tagsInput, setTagsInput] = useState(
    initialValues?.tags?.join(", ") ?? "",
  );

  const slug = generateSlug(title);
  const isTitleValid = title.trim().length > 0;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!isTitleValid) return;

      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const data: CreateWikiArticle = {
        title: title.trim(),
        slug: slug || undefined,
        content_md: contentMd,
        category: category || undefined,
        tags: tags.length > 0 ? tags : undefined,
      };

      onSave(data);
    },
    [title, slug, contentMd, category, tagsInput, isTitleValid, onSave],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      data-testid="wiki-article-editor"
    >
      {/* Title */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="wiki-title"
          className="text-sm font-medium text-[var(--color-text-primary)]"
        >
          Title *
        </label>
        <Input
          id="wiki-title"
          data-testid="wiki-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Article title"
          required
        />
        {slug && (
          <span
            className="text-xs text-[var(--color-text-muted)]"
            data-testid="wiki-slug-preview"
          >
            Slug: {slug}
          </span>
        )}
      </div>

      {/* Category */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="wiki-category"
          className="text-sm font-medium text-[var(--color-text-primary)]"
        >
          Category
        </label>
        <Select
          value={category}
          onChange={(val) => setCategory(val)}
          options={categoryOptions}
        />
      </div>

      {/* Tags */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="wiki-tags"
          className="text-sm font-medium text-[var(--color-text-primary)]"
        >
          Tags (comma-separated)
        </label>
        <Input
          id="wiki-tags"
          data-testid="wiki-tags-input"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="e.g. getting-started, workflow, tips"
        />
      </div>

      {/* Content: side-by-side edit and preview */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="wiki-content"
          className="text-sm font-medium text-[var(--color-text-primary)]"
        >
          Content (Markdown)
        </label>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Editor pane */}
          <textarea
            id="wiki-content"
            data-testid="wiki-content-textarea"
            value={contentMd}
            onChange={(e) => setContentMd(e.target.value)}
            className="min-h-[300px] w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-3 font-mono text-sm text-[var(--color-text-primary)] focus:border-[var(--color-action-primary)] focus:outline-none"
            placeholder="Write your article content here..."
          />
          {/* Preview pane */}
          <div
            className="min-h-[300px] rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3"
            data-testid="wiki-content-preview"
          >
            <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
              Preview
            </p>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {contentMd || "Nothing to preview yet."}
            </pre>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!isTitleValid || isSubmitting}
          data-testid="wiki-save-button"
        >
          {isSubmitting ? "Saving..." : "Save Article"}
        </Button>
      </div>
    </form>
  );
}

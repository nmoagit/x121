/**
 * Read-only viewer for a wiki article (PRD-56).
 *
 * Renders the article title, category breadcrumb, markdown content,
 * version info, and an optional edit button.
 */

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { formatDateTime } from "@/lib/format";

import type { WikiArticle } from "./types";
import { categoryLabel } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface WikiArticleViewerProps {
  /** The article to display. */
  article: WikiArticle;
  /** Called when the user clicks the Edit button. */
  onEdit?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WikiArticleViewer({ article, onEdit }: WikiArticleViewerProps) {
  return (
    <article className="flex flex-col gap-4" data-testid="wiki-article-viewer">
      {/* Category breadcrumb */}
      <div className="flex items-center gap-2" data-testid="wiki-category-breadcrumb">
        <span className="text-sm text-[var(--color-text-muted)]">Wiki</span>
        <span className="text-sm text-[var(--color-text-muted)]">/</span>
        <Badge variant="default" size="sm">
          {categoryLabel(article.category)}
        </Badge>
      </div>

      {/* Title and edit button */}
      <div className="flex items-start justify-between gap-4">
        <h1
          className="text-2xl font-semibold text-[var(--color-text-primary)]"
          data-testid="wiki-article-title"
        >
          {article.title}
        </h1>
        {onEdit && (
          <Button size="sm" variant="secondary" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>

      {/* Tags */}
      {article.tags && article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="wiki-article-tags">
          {article.tags.map((tag) => (
            <Badge key={tag} variant="default" size="sm">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Content */}
      <div
        className="prose max-w-none text-[var(--color-text-secondary)]"
        data-testid="wiki-article-content"
      >
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {article.content_md}
        </pre>
      </div>

      {/* Version info */}
      <div
        className="flex items-center gap-4 border-t border-[var(--color-border-default)] pt-3 text-xs text-[var(--color-text-muted)]"
        data-testid="wiki-version-info"
      >
        <span>Last updated: {formatDateTime(article.updated_at)}</span>
        {article.is_builtin && (
          <Badge variant="default" size="sm">
            Built-in
          </Badge>
        )}
        {article.is_pinned && (
          <Badge variant="success" size="sm">
            Pinned
          </Badge>
        )}
      </div>
    </article>
  );
}

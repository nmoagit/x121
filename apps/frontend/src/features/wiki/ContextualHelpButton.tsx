/**
 * Small help icon button for contextual help (PRD-56).
 *
 * When clicked, fetches contextual help for the given element_id
 * and shows a tooltip with the article title or navigates to it.
 */

import { useState } from "react";

import { Button } from "@/components/primitives/Button";
import { Tooltip } from "@/components/primitives/Tooltip";

import { useContextualHelp } from "./hooks/use-wiki";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ContextualHelpButtonProps {
  /** The UI element ID to look up help for (maps to article slug). */
  elementId: string;
  /** Called when the user wants to view the full article. */
  onNavigateToArticle?: (slug: string) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ContextualHelpButton({
  elementId,
  onNavigateToArticle,
}: ContextualHelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading } = useContextualHelp(
    isOpen ? elementId : "",
  );

  const handleClick = () => {
    setIsOpen((prev) => !prev);
  };

  const handleNavigate = () => {
    if (data?.article?.slug && onNavigateToArticle) {
      onNavigateToArticle(data.article.slug);
    }
    setIsOpen(false);
  };

  const tooltipContent = isLoading
    ? "Loading..."
    : data?.article
      ? data.article.title
      : "No help available";

  return (
    <div className="relative inline-block" data-testid="contextual-help-button">
      <Tooltip content={isOpen ? tooltipContent : ""}>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleClick}
          aria-label={`Help for ${elementId}`}
          data-testid={`help-trigger-${elementId}`}
        >
          ?
        </Button>
      </Tooltip>

      {isOpen && data?.article && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-3 shadow-lg"
          data-testid="contextual-help-popup"
        >
          <h4 className="mb-1 text-sm font-medium text-[var(--color-text-primary)]">
            {data.article.title}
          </h4>
          <p className="mb-2 line-clamp-3 text-xs text-[var(--color-text-secondary)]">
            {data.article.content_md}
          </p>
          {onNavigateToArticle && (
            <button
              type="button"
              onClick={handleNavigate}
              className="text-xs text-[var(--color-action-primary)] hover:underline"
            >
              Read full article
            </button>
          )}
        </div>
      )}
    </div>
  );
}

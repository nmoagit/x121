/**
 * Live prompt preview component (PRD-63).
 *
 * Shows the resolved template with all placeholders substituted.
 * Unresolved placeholders are highlighted in red to indicate they
 * need values. Updates live as the template text changes.
 */

import { useMemo } from "react";

import { PLACEHOLDER_REGEX } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface LivePreviewProps {
  /** The prompt template text containing `{placeholder}` tokens. */
  template: string;
  /** Map of placeholder names to their substitution values. */
  placeholders: Record<string, string>;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function LivePreview({ template, placeholders }: LivePreviewProps) {
  const segments = useMemo(() => {
    const result: Array<{
      text: string;
      type: "text" | "resolved" | "unresolved";
    }> = [];

    let lastIndex = 0;
    const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(template)) !== null) {
      // Text before the placeholder.
      if (match.index > lastIndex) {
        result.push({
          text: template.slice(lastIndex, match.index),
          type: "text",
        });
      }

      // The placeholder itself.
      const token = match[0];
      const name = token.slice(1, -1); // strip braces
      const value = placeholders[name];

      if (value !== undefined && value !== "") {
        result.push({ text: value, type: "resolved" });
      } else {
        result.push({ text: token, type: "unresolved" });
      }

      lastIndex = regex.lastIndex;
    }

    // Trailing text.
    if (lastIndex < template.length) {
      result.push({ text: template.slice(lastIndex), type: "text" });
    }

    return result;
  }, [template, placeholders]);

  return (
    <div
      data-testid="live-preview"
      className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3 text-sm"
    >
      {segments.length === 0 ? (
        <span className="text-[var(--color-text-muted)]">
          Enter a prompt template to see a preview...
        </span>
      ) : (
        segments.map((segment, i) => {
          if (segment.type === "resolved") {
            return (
              <span
                key={i}
                data-testid="resolved-placeholder"
                className="rounded bg-green-100 px-1 py-0.5 text-green-700 dark:bg-green-900 dark:text-green-300"
              >
                {segment.text}
              </span>
            );
          }
          if (segment.type === "unresolved") {
            return (
              <span
                key={i}
                data-testid="unresolved-placeholder"
                className="rounded bg-red-100 px-1 py-0.5 text-red-700 dark:bg-red-900 dark:text-red-300"
              >
                {segment.text}
              </span>
            );
          }
          return <span key={i}>{segment.text}</span>;
        })
      )}
    </div>
  );
}

/**
 * Simple page title + description header.
 *
 * Renders a consistent page heading used at the top of standalone pages.
 * Optionally includes an actions slot for buttons/controls beside the title.
 */

import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Page title. */
  title: string;
  /** Short description shown below the title. */
  description?: string;
  /** Optional actions rendered to the right of the title block. */
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

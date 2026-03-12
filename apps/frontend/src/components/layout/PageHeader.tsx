/**
 * Page title sync + optional actions bar.
 *
 * Sets the global page title (shown in the top header bar) and optionally
 * renders an actions row. Does NOT render the title visually — the header
 * bar handles that.
 */

import { useEffect, type ReactNode } from "react";

import { usePageTitle } from "@/app/usePageTitle";

interface PageHeaderProps {
  /** Page title (displayed in header bar). */
  title: string;
  /** Short description (displayed in header bar beside title). */
  description?: string;
  /** Optional actions rendered as a standalone row. */
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  const setPageTitle = usePageTitle((s) => s.setPageTitle);

  useEffect(() => {
    setPageTitle(title, description);
    return () => setPageTitle("", "");
  }, [title, description, setPageTitle]);

  if (!actions) return null;

  return (
    <div className="flex items-center justify-end gap-4">
      {actions}
    </div>
  );
}

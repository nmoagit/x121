/**
 * Placeholder for empty media slots (no video, no image, etc.).
 *
 * Renders a centered icon + label in an aspect-video container.
 */

import type { ReactNode } from "react";

interface MediaPlaceholderProps {
  icon: ReactNode;
  label: string;
}

export function MediaPlaceholder({ icon, label }: MediaPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded bg-[var(--color-surface-tertiary)] aspect-video">
      {icon}
      <span className="text-xs text-[var(--color-text-muted)] mt-1">{label}</span>
    </div>
  );
}

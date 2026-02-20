import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-[var(--spacing-12)] px-[var(--spacing-4)]",
        "text-center",
        className,
      )}
    >
      {icon && <div className="mb-[var(--spacing-3)] text-[var(--color-text-muted)]">{icon}</div>}
      <h3 className="text-base font-medium text-[var(--color-text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-[var(--color-text-muted)] max-w-md">{description}</p>
      )}
      {action && <div className="mt-[var(--spacing-4)]">{action}</div>}
    </div>
  );
}

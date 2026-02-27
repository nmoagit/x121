/**
 * Project summary card for the project list grid (PRD-112).
 */

import { Card } from "@/components/composite";
import { Badge } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

import type { Project } from "../types";
import { PROJECT_STATUS_BADGE_VARIANT, PROJECT_STATUS_LABELS } from "../types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const variant = PROJECT_STATUS_BADGE_VARIANT[project.status] ?? "default";
  const statusLabel = PROJECT_STATUS_LABELS[project.status] ?? project.status;

  return (
    <Card
      elevation="sm"
      padding="md"
      className={cn(
        "cursor-pointer",
        "transition-shadow duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        "hover:shadow-[var(--shadow-md)]",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left"
        aria-label={`Open project ${project.name}`}
      >
        <div className="flex items-start justify-between gap-[var(--spacing-2)]">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)] truncate">
            {project.name}
          </h3>
          <Badge variant={variant} size="sm">
            {statusLabel}
          </Badge>
        </div>

        {project.description && (
          <p className="mt-[var(--spacing-1)] text-sm text-[var(--color-text-muted)] line-clamp-2">
            {project.description}
          </p>
        )}

        <p className="mt-[var(--spacing-3)] text-xs text-[var(--color-text-muted)]">
          Created {formatDate(project.created_at)}
        </p>
      </button>
    </Card>
  );
}

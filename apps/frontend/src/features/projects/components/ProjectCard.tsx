/**
 * Project summary card for the project list grid (PRD-112).
 */

import { Card } from "@/components/composite";
import { Badge, Button } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { Archive, ArchiveRestore, Trash2 } from "@/tokens/icons";

import type { Project } from "../types";
import { PROJECT_STATUS_BADGE_VARIANT, PROJECT_STATUS_LABELS } from "../types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onArchive?: (id: number) => void;
  onUnarchive?: (id: number) => void;
  onDelete?: (id: number) => void;
  isUpdating?: boolean;
}

export function ProjectCard({
  project,
  onClick,
  onArchive,
  onUnarchive,
  onDelete,
  isUpdating,
}: ProjectCardProps) {
  const variant = PROJECT_STATUS_BADGE_VARIANT[project.status] ?? "default";
  const statusLabel = PROJECT_STATUS_LABELS[project.status] ?? project.status;
  const isArchived = project.status === "archived";

  return (
    <Card
      elevation="sm"
      padding="md"
      className={cn(
        "cursor-pointer",
        "transition-shadow duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        "hover:shadow-[var(--shadow-md)]",
        isArchived && "opacity-60",
      )}
    >
      <div
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

        <div className="mt-[var(--spacing-3)] flex items-center justify-between">
          <p className="text-xs text-[var(--color-text-muted)]">
            Created {formatDate(project.created_at)}
          </p>

          {isArchived && (
            <div className="flex items-center gap-1">
              {onUnarchive && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ArchiveRestore size={14} />}
                  loading={isUpdating}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnarchive(project.id);
                  }}
                >
                  Unarchive
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(project.id);
                  }}
                  className="text-[var(--color-action-danger)] hover:text-[var(--color-action-danger)]"
                >
                  Delete
                </Button>
              )}
            </div>
          )}
          {!isArchived && onArchive && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Archive size={14} />}
              loading={isUpdating}
              onClick={(e) => {
                e.stopPropagation();
                onArchive(project.id);
              }}
            >
              Archive
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
